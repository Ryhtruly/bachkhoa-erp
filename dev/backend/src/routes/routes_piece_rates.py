"""Bảng đơn giá khoán — quản lý trên `work_items` + `work_item_rates`.

Trước đây router này liệt kê 22 `task_types` với giá GHI CỨNG trong
`DEFAULT_RATES_BY_ID`, sửa giá thì ghi vào một dict trong bộ nhớ (mất khi khởi
động lại). Trong khi tiền THẬT trả cho nhân viên lại tính từ `work_item_rates`.
Hai hệ song song, con số kế toán thấy khác con số hệ thống trả.

Nay chỉ còn một nguồn: `work_item_rates`. Màn Bảng giá khoán đọc và sửa đúng
bảng mà động cơ khoán dùng. Sửa giá tạo một dòng `draft`; giám đốc duyệt mới
thành `published`, và bản cũ được đóng kỳ (giữ lại để đối chiếu, không ghi đè).
"""

import re
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, field_validator
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.core.audit import log_action
from src.core.auth import get_current_user, require_permission, User
from src.dossiers.actor_guard import is_director
from src.core.redis_utils import get_cached_json, set_cached_json, invalidate_cache
from src.db.database import get_db
from src.db.models import WorkItem, WorkItemRate

router = APIRouter(prefix="/api/piece-rates", tags=["06. Piece Rates"])

CACHE_KEY = "bachkhoa:catalog:piece_rates"
WORK_ITEM_CODE_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")


def _normalize_code(value: str) -> str:
    code = value.strip().upper()
    if not WORK_ITEM_CODE_RE.fullmatch(code):
        raise HTTPException(status_code=422, detail="Mã hạng mục chỉ gồm A-Z, 0-9, dấu gạch dưới và phải bắt đầu bằng chữ.")
    return code


def _normalize_role(value: str) -> str:
    role = value.strip().upper()
    if not WORK_ITEM_CODE_RE.fullmatch(role):
        raise HTTPException(status_code=422, detail="Mã vai trò không hợp lệ.")
    return role


def _require_non_blank(value: str, label: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(status_code=422, detail=f"{label} không được để trống.")
    return normalized


def _rate_response(rate: WorkItemRate) -> dict:
    return {
        "rate_id": rate.id,
        "role_code": rate.role_code,
        "amount": float(rate.amount or 0),
        "status": rate.status,
        "effective_from": rate.effective_from.isoformat() if rate.effective_from else None,
        "effective_to": rate.effective_to.isoformat() if rate.effective_to else None,
    }


def _item_response(db: Session, item: WorkItem) -> dict:
    rates = (
        db.query(WorkItemRate)
        .filter(WorkItemRate.work_item_id == item.id)
        .order_by(WorkItemRate.role_code, WorkItemRate.effective_from.desc())
        .all()
    )
    return {
        "work_item_id": item.id,
        "code": item.code,
        "name": item.name,
        "unit": item.default_unit,
        "output_definition": item.output_definition,
        "department_id": item.department_id,
        "is_active": bool(item.is_active),
        "rates": [_rate_response(rate) for rate in rates],
    }


def _clear_rates_cache():
    invalidate_cache(CACHE_KEY)
    invalidate_cache(f"{CACHE_KEY}:all")


def require_piece_rate_director(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """Direct catalog/rate mutations are reserved for the canonical director."""
    if not is_director(db, user.id):
        raise HTTPException(status_code=403, detail="Chỉ Giám đốc được quản trị trực tiếp bảng giá khoán.")
    return user


@router.get("/rates")
def list_piece_rates(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "read")),
):
    """15 hạng mục khoán, kèm giá đang hiệu lực (published) và giá chờ duyệt (draft)."""
    if include_inactive and not is_director(db, user.id):
        raise HTTPException(status_code=403, detail="Chỉ Giám đốc được xem hạng mục đã ngừng sử dụng.")

    cache_key = f"{CACHE_KEY}:all" if include_inactive else CACHE_KEY
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached

    rows = db.execute(text("""
        select wi.id as work_item_id, wi.code, wi.name, wi.default_unit, wi.is_active,
               d.name as department_name,
               wr.id as rate_id, wr.role_code, wr.amount, wr.status,
               wr.effective_from, wr.effective_to
        from public.work_items wi
        left join public.departments d on d.id = wi.department_id
        left join public.work_item_rates wr on wr.work_item_id = wi.id
             and wr.status in ('published', 'draft')
             and (wr.effective_to is null or wr.effective_to >= current_date)
        where (:include_inactive or wi.is_active)
        order by wi.code, wr.role_code, wr.status
    """), {"include_inactive": include_inactive}).mappings().all()

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
                "is_active": bool(r["is_active"]) if "is_active" in r else True,
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
    set_cached_json(cache_key, result, ttl_seconds=3600)
    return result


class InitialRateIn(BaseModel):
    role_code: str = Field(min_length=1, max_length=32)
    amount: FiniteFloat = Field(ge=0)

    @field_validator("role_code", mode="before")
    @classmethod
    def normalize_role_code(cls, value):
        return str(value or "").strip().upper()


class WorkItemCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    default_unit: str = Field(default="job", min_length=1, max_length=40)
    output_definition: str | None = Field(default=None, max_length=2000)
    department_id: str | None = Field(default=None, max_length=50)
    initial_rates: list[InitialRateIn] = Field(default_factory=list)


class WorkItemPatchIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    output_definition: str | None = Field(default=None, max_length=2000)
    department_id: str | None = Field(default=None, max_length=50)


class DirectRateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    work_item_id: str = Field(min_length=1, max_length=50)
    role_code: str = Field(min_length=1, max_length=32)
    amount: FiniteFloat = Field(ge=0)
    effective_from: str | None = None

    @field_validator("role_code", mode="before")
    @classmethod
    def normalize_role_code(cls, value):
        return str(value or "").strip().upper()


def _parse_effective_date(raw: str | None) -> date:
    if not raw:
        return date.today()
    try:
        return date.fromisoformat(raw)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Ngày hiệu lực phải có định dạng YYYY-MM-DD.") from exc


@router.post("/items", status_code=201)
def create_piece_rate_item(
    payload: WorkItemCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_piece_rate_director),
):
    """Giám đốc tạo hạng mục tái sử dụng và có thể khai báo giá khởi tạo."""
    code = _normalize_code(payload.code)
    name = _require_non_blank(payload.name, "Tên hạng mục")
    unit = _require_non_blank(payload.default_unit, "Đơn vị tính")
    roles = [_normalize_role(rate.role_code) for rate in payload.initial_rates]
    if len(roles) != len(set(roles)):
        raise HTTPException(status_code=422, detail="Mỗi vai trò chỉ được khai báo một đơn giá khởi tạo.")
    if db.query(WorkItem.id).filter(WorkItem.code == code).first():
        raise HTTPException(status_code=409, detail="Mã hạng mục đã tồn tại.")

    now = datetime.now(timezone.utc)
    item = WorkItem(
        code=code,
        name=name,
        default_unit=unit,
        output_definition=payload.output_definition.strip() if payload.output_definition else None,
        department_id=payload.department_id,
        created_by=user.id,
        is_active=True,
    )
    db.add(item)
    try:
        db.flush()
        for rate_payload, role in zip(payload.initial_rates, roles):
            db.add(WorkItemRate(
                work_item_id=item.id,
                role_code=role,
                amount=rate_payload.amount,
                effective_from=date.today(),
                status="published",
                approved_by=user.id,
                approved_at=now,
                approval_source="manual",
                created_by=user.id,
            ))
        log_action(
            db,
            user.id,
            "CREATE_PIECE_RATE_WORK_ITEM",
            "work_item",
            {"work_item_id": item.id, "code": code, "initial_rate_count": len(roles)},
        )
        db.commit()
        db.refresh(item)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Không thể tạo hạng mục do dữ liệu trùng hoặc không hợp lệ.") from exc
    _clear_rates_cache()
    return {"status": "success", "data": _item_response(db, item)}


@router.patch("/items/{work_item_id}")
def update_piece_rate_item(
    work_item_id: str,
    payload: WorkItemPatchIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_piece_rate_director),
):
    """Giám đốc sửa metadata hiển thị; mã hạng mục không được đổi."""
    item = db.get(WorkItem, work_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Không tìm thấy hạng mục khoán.")

    changes = payload.model_dump(exclude_unset=True)
    audit_changes = {}
    if "name" in changes:
        new_name = _require_non_blank(changes["name"] or "", "Tên hạng mục")
        if new_name != item.name:
            audit_changes["name"] = {"old": item.name, "new": new_name}
            item.name = new_name
    if "output_definition" in changes:
        new_definition = changes["output_definition"].strip() if changes["output_definition"] else None
        if new_definition != item.output_definition:
            audit_changes["output_definition"] = {"old": item.output_definition, "new": new_definition}
            item.output_definition = new_definition
    if "department_id" in changes and changes["department_id"] != item.department_id:
        audit_changes["department_id"] = {"old": item.department_id, "new": changes["department_id"]}
        item.department_id = changes["department_id"]

    if audit_changes:
        item.updated_at = datetime.now(timezone.utc)
        log_action(db, user.id, "UPDATE_PIECE_RATE_WORK_ITEM", "work_item", {
            "work_item_id": item.id,
            "code": item.code,
            "changes": audit_changes,
        })
        db.commit()
        db.refresh(item)
        _clear_rates_cache()
    return {"status": "success", "data": _item_response(db, item)}


@router.delete("/items/{work_item_id}")
def deactivate_piece_rate_item(
    work_item_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_piece_rate_director),
):
    """Ngừng sử dụng mềm; không xóa các rate/assignment/entitlement lịch sử."""
    item = db.get(WorkItem, work_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Không tìm thấy hạng mục khoán.")
    if not item.is_active:
        raise HTTPException(status_code=409, detail="Hạng mục đã ngừng sử dụng.")
    item.is_active = False
    item.updated_at = datetime.now(timezone.utc)
    log_action(db, user.id, "DEACTIVATE_PIECE_RATE_WORK_ITEM", "work_item", {
        "work_item_id": item.id,
        "code": item.code,
    })
    db.commit()
    _clear_rates_cache()
    return {"status": "success", "message": "Đã ngừng sử dụng hạng mục; dữ liệu lịch sử được giữ nguyên."}


@router.post("/items/{work_item_id}/restore")
def restore_piece_rate_item(
    work_item_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_piece_rate_director),
):
    item = db.get(WorkItem, work_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Không tìm thấy hạng mục khoán.")
    if item.is_active:
        raise HTTPException(status_code=409, detail="Hạng mục đang được sử dụng.")
    item.is_active = True
    item.updated_at = datetime.now(timezone.utc)
    log_action(db, user.id, "RESTORE_PIECE_RATE_WORK_ITEM", "work_item", {
        "work_item_id": item.id,
        "code": item.code,
    })
    db.commit()
    _clear_rates_cache()
    return {"status": "success", "data": _item_response(db, item)}


@router.post("/rates/direct")
def publish_direct_piece_rate(
    payload: DirectRateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_piece_rate_director),
):
    """Giám đốc cập nhật giá trực tiếp, vẫn tạo phiên bản mới để giữ lịch sử."""
    item = db.get(WorkItem, payload.work_item_id)
    if not item or not item.is_active:
        raise HTTPException(status_code=404, detail="Không tìm thấy hạng mục khoán đang hoạt động.")
    role = _normalize_role(payload.role_code)
    effective_from = _parse_effective_date(payload.effective_from)
    published = (
        db.query(WorkItemRate)
        .filter(
            WorkItemRate.work_item_id == item.id,
            WorkItemRate.role_code == role,
            WorkItemRate.status == "published",
        )
        .order_by(WorkItemRate.effective_from.desc())
        .all()
    )
    if any(rate.effective_from and rate.effective_from > effective_from for rate in published):
        raise HTTPException(status_code=409, detail="Không thể cập nhật lùi ngày trước phiên bản giá đã có hiệu lực.")

    for old_rate in published:
        if old_rate.effective_from == effective_from:
            old_rate.status = "archived"
        elif old_rate.effective_from and old_rate.effective_from < effective_from and (
            old_rate.effective_to is None or old_rate.effective_to >= effective_from
        ):
            old_rate.effective_to = effective_from - timedelta(days=1)
    for draft in db.query(WorkItemRate).filter(
        WorkItemRate.work_item_id == item.id,
        WorkItemRate.role_code == role,
        WorkItemRate.status == "draft",
    ).all():
        draft.status = "archived"

    rate = WorkItemRate(
        work_item_id=item.id,
        role_code=role,
        amount=payload.amount,
        effective_from=effective_from,
        status="published",
        approved_by=user.id,
        approved_at=datetime.now(timezone.utc),
        approval_source="manual",
        created_by=user.id,
    )
    db.add(rate)
    db.flush()
    log_action(db, user.id, "PUBLISH_DIRECT_PIECE_RATE", "work_item_rate", {
        "work_item_id": item.id,
        "code": item.code,
        "role_code": role,
        "rate_id": rate.id,
        "amount": float(payload.amount),
        "effective_from": effective_from.isoformat(),
    })
    db.commit()
    db.refresh(rate)
    _clear_rates_cache()
    return {"status": "success", "data": _rate_response(rate)}


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
    user: User = Depends(require_piece_rate_director),
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
