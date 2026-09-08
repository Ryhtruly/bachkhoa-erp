"""Quản lý khách hàng — danh sách, chi tiết, sửa. Hai loại: cá nhân / doanh nghiệp.

Trước đây khách chỉ được tạo/tìm lúc soạn hợp đồng, không có nơi duyệt/sửa cả
danh sách. Router này lấp chỗ đó.
"""

from datetime import date
import re

import httpx

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.core.auth import require_permission, User
from src.db.database import get_db
from src.finance.services import APPROVED_TX_STATUSES, INCOME_TX_TYPES

router = APIRouter(prefix="/api/customers", tags=["01b. Customers"])

def _format_date(v):
    if not v:
        return None
    return v.isoformat() if hasattr(v, "isoformat") else str(v)

# Cùng nguồn chân lý với màn Thu Công Nợ: công nợ tính từ phiếu thu ĐÃ DUYỆT,
# bàn giao đọc từ cờ is_handover của node (không hardcode mã K06).
_APPROVED_SQL = "'" + "','".join(sorted(APPROVED_TX_STATUSES)) + "'"
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
                      and t.status in ('Chờ duyệt', 'PENDING', 'pending')
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
                      and t.status in ('Chờ duyệt', 'PENDING', 'pending')
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
