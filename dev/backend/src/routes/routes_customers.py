"""Quản lý khách hàng — danh sách, chi tiết, sửa. Hai loại: cá nhân / doanh nghiệp.

Trước đây khách chỉ được tạo/tìm lúc soạn hợp đồng, không có nơi duyệt/sửa cả
danh sách. Router này lấp chỗ đó.
"""

from datetime import date
from typing import Optional
import re

import httpx

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from src.core.auth import require_permission, User
from src.db.database import get_db
from src.db.models import CustomerLoyaltyTier
from src.finance.access import assert_director
from src.finance.enums import APPROVED_STATUS_DB_VALUES, PENDING_STATUS_DB_VALUES
from src.finance.services import INCOME_TX_TYPES

router = APIRouter(prefix="/api/customers", tags=["01b. Customers"])

def _format_date(v):
    if not v:
        return None
    return v.isoformat() if hasattr(v, "isoformat") else str(v)

# Cùng nguồn chân lý với màn Thu Công Nợ: công nợ tính từ phiếu thu ĐÃ DUYỆT,
# bàn giao đọc từ cờ is_handover của node (không hardcode mã K06).
_APPROVED_SQL = "'" + "','".join(APPROVED_STATUS_DB_VALUES) + "'"
_PENDING_SQL = "'" + "','".join(PENDING_STATUS_DB_VALUES) + "'"
_INCOME_SQL = "'" + "','".join(sorted(INCOME_TX_TYPES)) + "'"


@router.get("/search")
def search_customers(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("customer", "read")),
):
    """Tìm khách cũ để tự điền — theo tên, SĐT, CCCD, mã số thuế."""
    kw = f"%{q.strip()}%"
    like_op = "like" if (db.bind and db.bind.dialect.name == "sqlite") else "ilike"
    rows = db.execute(
        text(f"""
            select c.id, c.customer_type, c.full_name, c.phone, c.address,
                   c.tax_id, c.id_card_number, c.id_card_date, c.id_card_place,
                   c.email, c.zalo_phone, c.representative_name, c.representative_role,
                   count(ct.id) as so_hop_dong
            from customers c
            left join contracts ct on ct.customer_id = c.id
            where c.full_name {like_op} :kw or c.phone {like_op} :kw
               or c.tax_id {like_op} :kw or c.id_card_number {like_op} :kw
            group by c.id
            order by so_hop_dong desc, c.full_name
            limit 10
        """),
        {"kw": kw},
    ).mappings().all()
    return {"status": "success", "data": [
        {**dict(r), "id_card_date": _format_date(r["id_card_date"]),
         "so_hop_dong": int(r["so_hop_dong"] or 0)}
        for r in rows
    ]}


@router.get("/lookup-tax/{mst}")
def lookup_tax_code(
    mst: str,
    _: User = Depends(require_permission("customer", "read")),
):
    """Tra cứu doanh nghiệp theo mã số thuế (VietQR, nguồn Cục Thuế).

    Chỉ là TIỆN ÍCH tự điền — API ngoài chậm/sập thì trả found=false, người dùng
    gõ tay như thường. Không bao giờ chặn việc tạo/sửa khách vì lý do này.
    """
    ma = re.sub(r"\D", "", mst or "")
    if len(ma) < 10 or len(ma) > 14:
        return {"status": "success", "data": {"found": False, "reason": "MST không hợp lệ"}}
    try:
        with httpx.Client(timeout=6.0) as client:
            r = client.get(f"https://api.vietqr.io/v2/business/{ma}")
        j = r.json()
        d = (j or {}).get("data") or {}
        if not d.get("name"):
            return {"status": "success", "data": {"found": False, "reason": "Không tìm thấy MST"}}
        return {"status": "success", "data": {
            "found": True,
            "tax_id": ma,
            "name": d.get("name"),
            "short_name": d.get("shortName"),
            "address": d.get("address"),
            "status": d.get("status"),
        }}
    except Exception:
        # Ngoài tầm kiểm soát (mạng/API) — báo không thấy, không ném lỗi.
        return {"status": "success", "data": {"found": False, "reason": "Không kết nối được dịch vụ tra cứu"}}


@router.get("")
def list_customers(
    q: str = Query(None),
    customer_type: str = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("customer", "read")),
):
    """Danh sách khách cho tab quản lý — kèm số hợp đồng, lọc theo loại/từ khoá."""
    where = ["1=1"]
    params: dict = {}
    like_op = "like" if (db.bind and db.bind.dialect.name == "sqlite") else "ilike"
    if q and q.strip():
        where.append(f"(c.full_name {like_op} :kw or c.phone {like_op} :kw or c.tax_id {like_op} :kw or c.id_card_number {like_op} :kw)")
        params["kw"] = f"%{q.strip()}%"
    if customer_type in ("individual", "business"):
        where.append("c.customer_type = :ct")
        params["ct"] = customer_type
    rows = db.execute(
        text(f"""
            select c.id, c.customer_type, c.full_name, c.phone,
                   c.tax_id, c.id_card_number,
                   count(ct.id) as so_hop_dong
            from customers c
            left join contracts ct on ct.customer_id = c.id
            where {" and ".join(where)}
            group by c.id
            order by c.full_name
            limit 500
        """),
        params,
    ).mappings().all()
    return {"status": "success", "data": [
        {**dict(r), "so_hop_dong": int(r["so_hop_dong"] or 0)} for r in rows
    ]}


# ────────────────────────────────────────────────────────────────────
#  LOYALTY TIERS — Thiết lập ưu đãi khách hàng thân thiết
# ────────────────────────────────────────────────────────────────────

def _tier_to_dict(t) -> dict:
    return {
        "id": t.id,
        "tier_name": t.tier_name,
        "min_contracts": t.min_contracts,
        "discount_percent": float(t.discount_percent),
        "description": t.description,
        "is_active": t.is_active,
        "created_at": _format_date(t.created_at),
        "updated_at": _format_date(t.updated_at),
    }


class LoyaltyTierIn(BaseModel):
    tier_name: str = Field(min_length=1, max_length=100)
    min_contracts: int = Field(ge=1)
    discount_percent: float = Field(ge=0, le=100)
    description: Optional[str] = None
    is_active: Optional[bool] = True


@router.get("/loyalty-tiers")
def list_loyalty_tiers(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("customer", "read")),
):
    """Danh sách bậc ưu đãi khách hàng, sắp xếp theo min_contracts tăng dần."""
    tiers = (
        db.query(CustomerLoyaltyTier)
        .order_by(CustomerLoyaltyTier.min_contracts.asc())
        .all()
    )
    return {"status": "success", "data": [_tier_to_dict(t) for t in tiers]}


@router.post("/loyalty-tiers")
def create_loyalty_tier(
    payload: LoyaltyTierIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("customer", "read")),
):
    """Thêm mới bậc ưu đãi — chỉ giám đốc."""
    assert_director(db, user, "Chỉ Giám đốc được thiết lập bậc ưu đãi.")

    clean_name = payload.tier_name.strip()
    # Kiểm tra trùng lặp số HĐ tối thiểu
    existing_min = db.query(CustomerLoyaltyTier).filter(CustomerLoyaltyTier.min_contracts == payload.min_contracts).first()
    if existing_min:
        raise HTTPException(
            status_code=409,
            detail=f"Đã có bậc ưu đãi '{existing_min.tier_name}' áp dụng cho mốc {payload.min_contracts} hợp đồng."
        )
    # Kiểm tra trùng tên bậc
    existing_name = db.query(CustomerLoyaltyTier).filter(func.lower(CustomerLoyaltyTier.tier_name) == clean_name.lower()).first()
    if existing_name:
        raise HTTPException(status_code=409, detail=f"Tên bậc ưu đãi '{clean_name}' đã tồn tại.")

    import uuid
    tier = CustomerLoyaltyTier(
        id=str(uuid.uuid4()),
        tier_name=clean_name,
        min_contracts=payload.min_contracts,
        discount_percent=payload.discount_percent,
        description=(payload.description or "").strip() or None,
        is_active=payload.is_active if payload.is_active is not None else True,
    )
    db.add(tier)
    db.commit()
    db.refresh(tier)
    return {"status": "success", "data": _tier_to_dict(tier)}


@router.put("/loyalty-tiers/{tier_id}")
def update_loyalty_tier(
    tier_id: str,
    payload: LoyaltyTierIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("customer", "read")),
):
    """Sửa bậc ưu đãi — chỉ giám đốc."""
    assert_director(db, user, "Chỉ Giám đốc được sửa bậc ưu đãi.")
    tier = db.query(CustomerLoyaltyTier).filter(CustomerLoyaltyTier.id == tier_id).first()
    if not tier:
        raise HTTPException(status_code=404, detail="Bậc ưu đãi không tồn tại")

    clean_name = payload.tier_name.strip()
    # Kiểm tra trùng lặp số HĐ tối thiểu với các bậc khác
    existing_min = db.query(CustomerLoyaltyTier).filter(
        CustomerLoyaltyTier.min_contracts == payload.min_contracts,
        CustomerLoyaltyTier.id != tier_id,
    ).first()
    if existing_min:
        raise HTTPException(
            status_code=409,
            detail=f"Đã có bậc ưu đãi '{existing_min.tier_name}' áp dụng cho mốc {payload.min_contracts} hợp đồng."
        )
    # Kiểm tra trùng tên bậc với các bậc khác
    existing_name = db.query(CustomerLoyaltyTier).filter(
        func.lower(CustomerLoyaltyTier.tier_name) == clean_name.lower(),
        CustomerLoyaltyTier.id != tier_id,
    ).first()
    if existing_name:
        raise HTTPException(status_code=409, detail=f"Tên bậc ưu đãi '{clean_name}' đã tồn tại.")

    tier.tier_name = clean_name
    tier.min_contracts = payload.min_contracts
    tier.discount_percent = payload.discount_percent
    tier.description = (payload.description or "").strip() or None
    if payload.is_active is not None:
        tier.is_active = payload.is_active
    db.commit()
    db.refresh(tier)
    return {"status": "success", "data": _tier_to_dict(tier)}


@router.delete("/loyalty-tiers/{tier_id}")
def delete_loyalty_tier(
    tier_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("customer", "read")),
):
    """Xóa bậc ưu đãi — chỉ giám đốc."""
    assert_director(db, user, "Chỉ Giám đốc được xóa bậc ưu đãi.")
    tier = db.query(CustomerLoyaltyTier).filter(CustomerLoyaltyTier.id == tier_id).first()
    if not tier:
        raise HTTPException(status_code=404, detail="Bậc ưu đãi không tồn tại")
    db.delete(tier)
    db.commit()
    return {"status": "success", "data": {"id": tier_id}}


def _lookup_customer_by_identity(db: Session, *, customer_id=None, phone=None, tax_id=None, id_card_number=None):
    """Tìm khách theo thứ tự ưu tiên: id > MST > CCCD > SĐT."""
    cid = (customer_id or "").strip()
    if cid:
        row = db.execute(text("select id from customers where id = :v"), {"v": cid}).first()
        if row:
            return row[0]
    tid = (tax_id or "").strip()
    if tid:
        row = db.execute(text("select id from customers where tax_id = :v"), {"v": tid}).first()
        if row:
            return row[0]
    cccd = (id_card_number or "").strip()
    if cccd:
        row = db.execute(text("select id from customers where id_card_number = :v"), {"v": cccd}).first()
        if row:
            return row[0]
    ph = (phone or "").strip()
    if ph:
        row = db.execute(text("select id from customers where phone = :v"), {"v": ph}).first()
        if row:
            return row[0]
    return None


def check_loyalty_eligibility(db: Session, customer_id: str, original_value: float = 0) -> dict:
    """Tra cứu bậc ưu đãi mà khách đạt được dựa trên số HĐ đã thực hiện.

    Hàm helper dùng chung cho CRM close deal và tạo HĐ thủ công.
    """
    contract_count = db.execute(
        text("""
            select count(*) from contracts
            where customer_id = :cid
              and coalesce(status, '') not in ('Đã huỷ', 'cancelled')
        """),
        {"cid": customer_id},
    ).scalar() or 0

    # Lấy bậc cao nhất mà khách đủ điều kiện (sắp xếp deterministically)
    tier_row = (
        db.query(CustomerLoyaltyTier)
        .filter(CustomerLoyaltyTier.is_active == True, CustomerLoyaltyTier.min_contracts <= contract_count)  # noqa: E712
        .order_by(CustomerLoyaltyTier.min_contracts.desc(), CustomerLoyaltyTier.discount_percent.desc())
        .first()
    )
    if not tier_row:
        return {"eligible": False, "contract_count": int(contract_count)}

    discount_pct = float(tier_row.discount_percent)
    discount_amt = int(round(float(original_value) * float(discount_pct) / 100.0 + 1e-9)) if original_value else 0
    final_val = max(0, int(round(float(original_value))) - discount_amt) if original_value else 0

    return {
        "eligible": True,
        "contract_count": int(contract_count),
        "tier": _tier_to_dict(tier_row),
        "tier_id": tier_row.id,
        "tier_name": tier_row.tier_name,
        "original_value": original_value,
        "discount_percent": discount_pct,
        "discount_amount": discount_amt,
        "final_value": final_val,
    }


@router.get("/loyalty-eligibility")
def get_loyalty_eligibility(
    customer_id: str = Query(None),
    phone: str = Query(None),
    tax_id: str = Query(None),
    id_card_number: str = Query(None),
    original_value: float = Query(0),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("customer", "read")),
):
    """Kiểm tra khách hàng có đạt bậc ưu đãi nào không."""
    cid = _lookup_customer_by_identity(
        db, customer_id=customer_id, phone=phone, tax_id=tax_id, id_card_number=id_card_number
    )
    if not cid:
        return {"status": "success", "data": {"eligible": False, "contract_count": 0}}
    result = check_loyalty_eligibility(db, cid, original_value)
    return {"status": "success", "data": result}


@router.get("/loyalty-qualifying-customers")
def list_qualifying_customers(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("customer", "read")),
):
    """Danh sách khách hàng đạt chuẩn ưu tiên — để hiển thị trong tab Thiết lập."""
    # Lấy bậc ưu đãi thấp nhất đang bật
    min_tier = (
        db.query(CustomerLoyaltyTier)
        .filter(CustomerLoyaltyTier.is_active == True)  # noqa: E712
        .order_by(CustomerLoyaltyTier.min_contracts.asc())
        .first()
    )
    if not min_tier:
        return {"status": "success", "data": []}

    # Lấy tất cả bậc active, sắp xếp giảm dần
    all_tiers = (
        db.query(CustomerLoyaltyTier)
        .filter(CustomerLoyaltyTier.is_active == True)  # noqa: E712
        .order_by(CustomerLoyaltyTier.min_contracts.desc())
        .all()
    )

    rows = db.execute(
        text("""
            select c.id, c.customer_type, c.full_name, c.phone, c.tax_id, c.id_card_number,
                   count(ct.id) as contract_count
            from customers c
            join contracts ct on ct.customer_id = c.id
              and coalesce(ct.status, '') not in ('Đã huỷ', 'cancelled')
            group by c.id
            having count(ct.id) >= :min_ct
            order by count(ct.id) desc, c.full_name
            limit 200
        """),
        {"min_ct": min_tier.min_contracts},
    ).mappings().all()

    result = []
    for r in rows:
        ct_count = int(r["contract_count"])
        # Tìm bậc cao nhất phù hợp
        matched_tier = None
        for t in all_tiers:
            if ct_count >= t.min_contracts:
                matched_tier = t
                break
        result.append({
            "id": r["id"],
            "customer_type": r["customer_type"],
            "full_name": r["full_name"],
            "phone": r["phone"],
            "tax_id": r["tax_id"],
            "id_card_number": r["id_card_number"],
            "contract_count": ct_count,
            "tier_name": matched_tier.tier_name if matched_tier else None,
            "discount_percent": float(matched_tier.discount_percent) if matched_tier else 0,
        })

    return {"status": "success", "data": result}


@router.get("/{customer_id}")
def get_customer(
    customer_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("customer", "read")),
):
    """Chi tiết một khách + danh sách hợp đồng của khách đó."""
    c = db.execute(
        text("""
            select id, customer_type, full_name, phone, address, tax_id,
                   id_card_number, id_card_date, id_card_place, email, zalo_phone,
                   representative_name, representative_role, data_quality_status,
                   source_channel, created_at
            from customers where id = :id
        """),
        {"id": customer_id},
    ).mappings().first()
    if not c:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")

    # Mỗi hợp đồng kèm HAI trạng thái độc lập cho UI:
    #   · thu tiền  — đã thu đủ / còn nợ (tính sống từ phiếu thu đã duyệt)
    is_sqlite = db.bind and db.bind.dialect.name == "sqlite"
    if is_sqlite:
        contracts = db.execute(
            text(f"""
                select c.id, c.service_type, c.total_value, c.date_signed, c.status,
                       c.completion_override,
                       coalesce(paid_tx.paid_amount, 0)    as paid,
                       coalesce(pending_tx.pending_amount, 0) as pending,
                       0 as da_ban_giao,
                       0 as has_handover_node
                from contracts c
                left join (
                    select t.contract_id, sum(t.amount) as paid_amount
                    from cashflow_transactions t
                    where t.transaction_type in ({_INCOME_SQL})
                      and t.status in ({_APPROVED_SQL})
                    group by t.contract_id
                ) paid_tx on paid_tx.contract_id = c.id
                left join (
                    select t.contract_id, sum(t.amount) as pending_amount
                    from cashflow_transactions t
                    where t.transaction_type in ({_INCOME_SQL})
                      and t.status in ({_PENDING_SQL})
                    group by t.contract_id
                ) pending_tx on pending_tx.contract_id = c.id
                where c.customer_id = :id
                order by c.date_signed desc, c.id
            """),
            {"id": customer_id},
        ).mappings().all()
    else:
        contracts = db.execute(
            text(f"""
                select c.id, c.service_type, c.total_value, c.date_signed, c.status,
                       c.completion_override,
                       coalesce(paid_tx.paid_amount, 0)    as paid,
                       coalesce(pending_tx.pending_amount, 0) as pending,
                       coalesce(bg.da_ban_giao, false)      as da_ban_giao,
                       coalesce(bg.n_handover, 0) > 0        as has_handover_node
                from contracts c
                left join (
                    select t.contract_id, sum(t.amount) as paid_amount
                    from cashflow_transactions t
                    where t.transaction_type in ({_INCOME_SQL})
                      and t.status in ({_APPROVED_SQL})
                    group by t.contract_id
                ) paid_tx on paid_tx.contract_id = c.id
                left join (
                    select t.contract_id, sum(t.amount) as pending_amount
                    from cashflow_transactions t
                    where t.transaction_type in ({_INCOME_SQL})
                      and t.status in ({_PENDING_SQL})
                    group by t.contract_id
                ) pending_tx on pending_tx.contract_id = c.id
                left join lateral (
                    -- "Đã bàn giao" = đã giao hiện vật (delivered_at) HOẶC bước bàn giao
                    -- đã nghiệm thu xong (status accepted). Gộp mọi node bàn giao của HĐ.
                    select bool_or(
                             n.execution_data->'handover'->>'delivered_at' is not null
                             or n.status = 'accepted'
                           ) as da_ban_giao,
                           count(*) as n_handover
                    from task_nodes n
                    join workflow_instances wi on wi.id = n.workflow_instance_id
                    join service_lines sl on sl.id = wi.service_line_id
                    left join workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
                    left join workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
                    where sl.contract_id = c.id
                      and n.status <> 'cancelled'
                      and coalesce((
                            coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->>'is_handover'
                          )::boolean, false)
                ) bg on true
                where c.customer_id = :id
                order by c.date_signed desc nulls last, c.id
            """),
            {"id": customer_id},
        ).mappings().all()

    data = dict(c)
    data["id_card_date"] = _format_date(c["id_card_date"])
    data["created_at"] = _format_date(c["created_at"])

    contract_list = []
    for ct in contracts:
        total = float(ct["total_value"] or 0)
        paid = float(ct["paid"] or 0)
        remaining = max(0.0, total - paid)
        contract_list.append({
            "id": ct["id"],
            "service_type": ct["service_type"],
            "status": ct["status"],
            "total_value": total,
            "date_signed": _format_date(ct["date_signed"]),
            "paid": paid,
            "pending": float(ct["pending"] or 0),
            "remaining": remaining,
            # Thu đủ khi hết nợ, hoặc giám đốc đã chốt hoàn tất dù còn thiếu.
            "is_settled": remaining <= 0.009 or bool(ct["completion_override"]),
            "da_ban_giao": bool(ct["da_ban_giao"]),
            "has_handover_node": bool(ct["has_handover_node"]),
        })
    data["contracts"] = contract_list
    return {"status": "success", "data": data}


class CustomerUpdateIn(BaseModel):
    customer_type: str = Field(pattern="^(individual|business)$")
    full_name: str = Field(min_length=1, max_length=255)
    phone: str | None = None
    address: str | None = None
    tax_id: str | None = None
    id_card_number: str | None = None
    id_card_date: str | None = None
    id_card_place: str | None = None
    email: str | None = None
    zalo_phone: str | None = None
    representative_name: str | None = None
    representative_role: str | None = None


@router.put("/{customer_id}")
def update_customer(
    customer_id: str,
    payload: CustomerUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("customer", "update")),
):
    """Sửa hồ sơ khách. Định danh bắt buộc theo loại (MST / CCCD)."""
    exists = db.execute(text("select 1 from customers where id = :id"), {"id": customer_id}).scalar()
    if not exists:
        raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")

    tax_id = (payload.tax_id or "").strip() or None
    cccd = (payload.id_card_number or "").strip() or None
    if payload.customer_type == "business" and not tax_id:
        raise HTTPException(status_code=422, detail="Doanh nghiệp phải có mã số thuế")
    if payload.customer_type == "individual" and not cccd:
        raise HTTPException(status_code=422, detail="Cá nhân phải có số CCCD")

    # Không cho trùng khoá định danh với khách KHÁC.
    if tax_id:
        dup = db.execute(text("select id from customers where tax_id = :t and id <> :id"),
                         {"t": tax_id, "id": customer_id}).scalar()
        if dup:
            raise HTTPException(status_code=409, detail="Mã số thuế đã thuộc về khách khác")
    if cccd:
        dup = db.execute(text("select id from customers where id_card_number = :c and id <> :id"),
                         {"c": cccd, "id": customer_id}).scalar()
        if dup:
            raise HTTPException(status_code=409, detail="Số CCCD đã thuộc về khách khác")

    def _parse_date(v):
        try:
            return date.fromisoformat(v) if v else None
        except Exception:
            return None

    db.execute(
        text("""
            update customers set
              customer_type = :ct, full_name = :fn, phone = :ph, address = :addr,
              tax_id = :tax, id_card_number = :cccd, id_card_date = :icd, id_card_place = :icp,
              email = :em, zalo_phone = :zl,
              representative_name = :rn, representative_role = :rr, updated_at = CURRENT_TIMESTAMP
            where id = :id
        """),
        {"ct": payload.customer_type, "fn": payload.full_name.strip(),
         "ph": (payload.phone or "").strip() or None, "addr": (payload.address or "").strip() or None,
         "tax": tax_id, "cccd": cccd, "icd": _parse_date(payload.id_card_date),
         "icp": (payload.id_card_place or "").strip() or None,
         "em": (payload.email or "").strip() or None, "zl": (payload.zalo_phone or "").strip() or None,
         "rn": (payload.representative_name or "").strip() or None,
         "rr": (payload.representative_role or "").strip() or None,
         "id": customer_id},
    )
    db.commit()
    return {"status": "success", "data": {"id": customer_id}}

