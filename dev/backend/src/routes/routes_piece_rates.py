"""Bảng đơn giá khoán — quản lý trên `work_items` + `work_item_rates`.

Trước đây router này liệt kê 22 `task_types` với giá GHI CỨNG trong
`DEFAULT_RATES_BY_ID`, sửa giá thì ghi vào một dict trong bộ nhớ (mất khi khởi
động lại). Trong khi tiền THẬT trả cho nhân viên lại tính từ `work_item_rates`.
Hai hệ song song, con số kế toán thấy khác con số hệ thống trả.

Nay chỉ còn một nguồn: `work_item_rates`. Màn Bảng giá khoán đọc và sửa đúng
bảng mà động cơ khoán dùng. Sửa giá tạo một dòng `draft`; giám đốc duyệt mới
thành `published`, và bản cũ được đóng kỳ (giữ lại để đối chiếu, không ghi đè).
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.core.auth import require_permission, User
from src.core.redis_utils import get_cached_json, set_cached_json, invalidate_cache
from src.db.database import get_db

router = APIRouter(prefix="/api/piece-rates", tags=["06. Piece Rates"])

CACHE_KEY = "bachkhoa:catalog:piece_rates"


def _clear_rates_cache():
    invalidate_cache(CACHE_KEY)


@router.get("/rates")
def list_piece_rates(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "read")),
):
    """15 hạng mục khoán, kèm giá đang hiệu lực (published) và giá chờ duyệt (draft)."""
    cached = get_cached_json(CACHE_KEY)
    if cached is not None:
        return cached

    rows = db.execute(text("""
        select wi.id as work_item_id, wi.code, wi.name, wi.default_unit,
               d.name as department_name,
               wr.id as rate_id, wr.role_code, wr.amount, wr.status,
               wr.effective_from, wr.effective_to
        from public.work_items wi
        left join public.departments d on d.id = wi.department_id
        left join public.work_item_rates wr on wr.work_item_id = wi.id
             and wr.status in ('published', 'draft')
             and (wr.effective_to is null or wr.effective_to >= current_date)
        where wi.is_active
        order by wi.code, wr.role_code, wr.status
    """)).mappings().all()

    theo_item: dict[str, dict] = {}
    for r in rows:
        wid = r["work_item_id"]
        if wid not in theo_item:
            theo_item[wid] = {
                "work_item_id": wid,
                "code": r["code"],
                "name": r["name"],
                "unit": r["default_unit"],
                "department_name": r["department_name"],
                "rates": {},          # role -> giá đang hiệu lực
                "pending": {},        # role -> giá chờ duyệt
            }
        if not r["rate_id"]:
            continue
        muc = {
            "rate_id": r["rate_id"],
            "amount": float(r["amount"] or 0),
            "effective_from": r["effective_from"].isoformat() if r["effective_from"] else None,
        }
        if r["status"] == "published":
            theo_item[wid]["rates"][r["role_code"]] = muc
        else:
            theo_item[wid]["pending"][r["role_code"]] = muc

    result = {"status": "success", "data": list(theo_item.values())}
    set_cached_json(CACHE_KEY, result, ttl_seconds=3600)
    return result


@router.get("/rates/history/{work_item_id}")
def rate_history(
    work_item_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "read")),
):
    """Toàn bộ lịch sử giá của một hạng mục — để đối chiếu hồ sơ cũ tính giá nào."""
    rows = db.execute(text("""
        select wr.id, wr.role_code, wr.amount, wr.status,
               wr.effective_from, wr.effective_to, wr.approved_at,
               u.username as approved_by
        from public.work_item_rates wr
        left join public.users u on u.id = wr.approved_by
        where wr.work_item_id = :w
        order by wr.role_code, wr.effective_from desc nulls last
    """), {"w": work_item_id}).mappings().all()
    return {"status": "success", "data": [
        {**dict(r),
         "amount": float(r["amount"] or 0),
         "effective_from": r["effective_from"].isoformat() if r["effective_from"] else None,
         "effective_to": r["effective_to"].isoformat() if r["effective_to"] else None,
         "approved_at": r["approved_at"].isoformat() if r["approved_at"] else None}
        for r in rows
    ]}


class DraftRateIn(BaseModel):
    work_item_id: str = Field(min_length=1)
    role_code: str = Field(min_length=1, max_length=32)
    amount: float = Field(ge=0)
    effective_from: str | None = None  # ISO; mặc định hôm nay khi duyệt


@router.post("/rates")
def propose_piece_rate(
    payload: DraftRateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "update")),
):
    """Đề xuất giá mới — tạo một dòng `draft`. Chưa ảnh hưởng tiền cho tới khi duyệt."""
    role = payload.role_code.strip().upper()
    exists = db.execute(
        text("select 1 from public.work_items where id = :w and is_active"),
        {"w": payload.work_item_id},
    ).scalar()
    if not exists:
        raise HTTPException(status_code=404, detail="Không tìm thấy hạng mục khoán")

    # Mỗi (hạng mục, vai trò) chỉ giữ MỘT bản nháp — đề xuất mới đè bản nháp cũ,
    # tránh chồng đống nháp không ai duyệt.
    db.execute(text("""
        delete from public.work_item_rates
        where work_item_id = :w and role_code = :r and status = 'draft'
    """), {"w": payload.work_item_id, "r": role})

    row = db.execute(text("""
        insert into public.work_item_rates
            (id, work_item_id, role_code, amount, effective_from, status, created_by, created_at)
        values
            (gen_random_uuid(), :w, :r, :a, coalesce(:ef, current_date), 'draft', :u, now())
        returning id
    """), {
        "w": payload.work_item_id, "r": role, "a": payload.amount,
        "ef": payload.effective_from or None, "u": user.id,
    }).mappings().first()
    db.commit()
    _clear_rates_cache()
    return {"status": "success", "data": {"rate_id": row["id"], "status": "draft"}}


@router.post("/rates/{rate_id}/publish")
def publish_piece_rate(
    rate_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "approve")),
):
    """Giám đốc duyệt: đóng kỳ giá cũ, cho giá mới hiệu lực. Không ghi đè bản cũ."""
    draft = db.execute(text("""
        select id, work_item_id, role_code, amount, effective_from, status
        from public.work_item_rates where id = :i
    """), {"i": rate_id}).mappings().first()
    if not draft:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản giá")
    if draft["status"] != "draft":
        raise HTTPException(status_code=409, detail="Chỉ duyệt được bản nháp")

    effective_from = draft["effective_from"] or date.today()
    if isinstance(effective_from, str):
        effective_from = date.fromisoformat(effective_from)

    db.execute(text("""
        update public.work_item_rates
        set effective_to = :previous_day
        where work_item_id = :w and role_code = :r and status = 'published'
          and (effective_to is null or effective_to >= :current_effective)
    """), {"previous_day": effective_from - timedelta(days=1), "current_effective": effective_from,
           "w": draft["work_item_id"], "r": draft["role_code"]})

    db.execute(text("""
        update public.work_item_rates
        set status = 'published', effective_from = :ef,
            approved_by = :u, approved_at = now()
        where id = :i
    """), {"ef": effective_from, "u": user.id, "i": rate_id})
    db.commit()
    _clear_rates_cache()
    return {"status": "success", "message": "Đã duyệt và áp dụng đơn giá mới"}


@router.delete("/rates/{rate_id}")
def discard_draft_rate(
    rate_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "delete")),
):
    """Bỏ một bản nháp chưa duyệt. Bản đã published không xoá (là lịch sử tiền)."""
    row = db.execute(
        text("select status from public.work_item_rates where id = :i"),
        {"i": rate_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản giá")
    if row["status"] != "draft":
        raise HTTPException(status_code=409, detail="Chỉ bỏ được bản nháp; bản đã áp dụng là lịch sử tiền")
    db.execute(text("delete from public.work_item_rates where id = :i"), {"i": rate_id})
    db.commit()
    _clear_rates_cache()
    return {"status": "success", "message": "Đã bỏ bản nháp"}
