"""Danh mục Gói dịch vụ → Hạng mục — một nguồn sự thật cho mọi ô chọn.

Trước đây danh sách dịch vụ bị ghi cứng trong `routes_dashboard.py` (9 mục, sai
chính tả, mất gói Xây dựng). Router này đọc thẳng từ `service_packages` +
`task_types` nên thêm/sửa hạng mục trong DB là mọi màn thấy ngay.
"""

import uuid
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.core.auth import require_authenticated_user, check_user_permission, User
from src.core.redis_utils import get_cached_json, set_cached_json, invalidate_cache
from src.db.database import get_db

router = APIRouter(prefix="/api/catalog", tags=["01. Catalog"])

CACHE_KEY = "bachkhoa:catalog:service_packages"


class ServicePackageCreate(BaseModel):
    name: str = Field(..., min_length=1)
    category_type: str | None = "GENERAL"
    description: str | None = None
    display_order: int | None = 100
    color: str | None = "#3b82f6"


class ServicePackageUpdate(BaseModel):
    name: str | None = None
    category_type: str | None = None
    description: str | None = None
    display_order: int | None = None
    color: str | None = None
    is_active: bool | None = None


class TaskTypeCreate(BaseModel):
    service_package_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    code: str | None = None
    category_type: str | None = "GENERAL"
    display_order: int | None = 100
    color: str | None = "#10b981"


class TaskTypeUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    category_type: str | None = None
    display_order: int | None = None
    color: str | None = None
    is_active: bool | None = None


def _check_catalog_write_permission(db: Session, user: User) -> None:
    if not (
        check_user_permission(db, user, "workflow", "update")
        or check_user_permission(db, user, "workflow", "approve")
        or check_user_permission(db, user, "settings", "update")
        or user.username == "admin"
    ):
        raise HTTPException(status_code=403, detail="Không có quyền chỉnh sửa danh mục dịch vụ")


def _build_catalog_tree(db: Session) -> list[dict]:
    """Cây Gói → Hạng mục, sắp theo thứ tự hiển thị của gói rồi tên hạng mục."""
    rows = db.execute(
        text("""
            select p.id as package_id, p.name as package_name, p.display_order, p.category_type as package_category_type,
                   p.color as package_color,
                   t.id as task_type_id, t.code as task_type_code, t.name as task_type_name,
                   t.category_type as task_type_category_type, t.color as task_type_color
            from public.service_packages p
            left join public.task_types t on t.service_package_id = p.id and coalesce(t.is_active, true)
            where coalesce(p.is_active, true)
            order by p.display_order nulls last, p.name, t.display_order nulls last, t.name
        """)
    ).mappings().all()

    packages_by_id: dict[str, dict] = {}
    package_order: list[str] = []
    for r in rows:
        pid = r["package_id"]
        if pid not in packages_by_id:
            packages_by_id[pid] = {
                "id": pid,
                "name": r["package_name"],
                "display_order": r["display_order"],
                "category_type": r["package_category_type"] or "GENERAL",
                "color": r["package_color"] or "#3b82f6",
                "task_types": [],
            }
            package_order.append(pid)
        # Gói chưa có hạng mục nào vẫn hiện (LEFT JOIN cho task_type_id = null).
        if r["task_type_id"]:
            packages_by_id[pid]["task_types"].append({
                "id": r["task_type_id"],
                "code": r["task_type_code"],
                "name": r["task_type_name"],
                "category_type": r["task_type_category_type"] or "GENERAL",
                "color": r["task_type_color"] or "#10b981",
            })
    return [packages_by_id[pid] for pid in package_order]


def catalog_tree(db: Session) -> list[dict]:
    """Bản có cache — dùng chung cho router này và cho /api/config (Bước 1.3)."""
    cached = get_cached_json(CACHE_KEY)
    if cached is not None:
        return cached
    tree = _build_catalog_tree(db)
    set_cached_json(CACHE_KEY, tree, ttl_seconds=3600)
    return tree


def invalidate_catalog_cache() -> None:
    """Gọi sau khi thêm/sửa/xoá gói hoặc hạng mục để ô chọn thấy ngay."""
    invalidate_cache(CACHE_KEY)


@router.get("/service-packages")
def list_service_packages(
    db: Session = Depends(get_db),
    _: User = Depends(require_authenticated_user),
):
    """Cây Gói → Hạng mục cho ô chọn 2 tầng khi soạn hợp đồng."""
    return {"data": catalog_tree(db)}


@router.post("/service-packages")
def create_service_package(
    payload: ServicePackageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_authenticated_user),
):
    _check_catalog_write_permission(db, user)
    pkg_id = f"sp_{uuid.uuid4().hex[:8]}"
    db.execute(
        text("""
            insert into public.service_packages (id, name, description, display_order, is_active, category_type)
            values (:id, :name, :description, :display_order, true, :category_type)
            insert into public.service_packages (id, name, description, display_order, is_active, category_type, color)
            values (:id, :name, :description, :display_order, true, :category_type, :color)
        """),
        {
            "id": pkg_id,
            "name": payload.name.strip(),
            "description": payload.description,
            "display_order": payload.display_order or 100,
            "category_type": (payload.category_type or "GENERAL").strip().upper(),
            "color": payload.color or "#3b82f6",
        },
    )
    db.commit()
    invalidate_catalog_cache()
    return {"data": {"id": pkg_id, "name": payload.name.strip()}}
    return {"data": {"id": pkg_id, "name": payload.name.strip(), "color": payload.color or "#3b82f6"}}


@router.patch("/service-packages/{package_id}")
def update_service_package(
    package_id: str,
    payload: ServicePackageUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_authenticated_user),
):
    _check_catalog_write_permission(db, user)
    existing = db.execute(
        text("select id from public.service_packages where id = :id"),
        {"id": package_id},
    ).mappings().first()
    if not existing:
        raise HTTPException(status_code=404, detail="Gói dịch vụ không tồn tại")

    updates = {}
    if payload.name is not None:
        updates["name"] = payload.name.strip()
    if payload.category_type is not None:
        updates["category_type"] = payload.category_type.strip().upper()
    if payload.description is not None:
        updates["description"] = payload.description
    if payload.display_order is not None:
        updates["display_order"] = payload.display_order
    if payload.color is not None:
        updates["color"] = payload.color.strip()
    if payload.is_active is not None:
        updates["is_active"] = payload.is_active

    if updates:
        set_clauses = [f"{col} = :{col}" for col in updates.keys()]
        updates["id"] = package_id
        db.execute(
            text(f"update public.service_packages set {', '.join(set_clauses)} where id = :id"),
            updates,
        )
        db.commit()
        invalidate_catalog_cache()
    return {"data": {"id": package_id, "updated": True}}


@router.delete("/service-packages/{package_id}")
def delete_service_package(
    package_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_authenticated_user),
):
    _check_catalog_write_permission(db, user)
    db.execute(
        text("update public.service_packages set is_active = false where id = :id"),
        {"id": package_id},
    )
    db.commit()
    invalidate_catalog_cache()
    return {"data": {"id": package_id, "deleted": True}}


@router.post("/task-types")
def create_task_type(
    payload: TaskTypeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_authenticated_user),
):
    _check_catalog_write_permission(db, user)
    pkg = db.execute(
        text("select id, category_type from public.service_packages where id = :id"),
        {"id": payload.service_package_id},
    ).mappings().first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Gói dịch vụ không tồn tại")

    task_type_id = f"tt_{uuid.uuid4().hex[:8]}"
    code = payload.code.strip().upper() if payload.code else f"TT_{uuid.uuid4().hex[:6].upper()}"
    cat_type = (payload.category_type or pkg["category_type"] or "GENERAL").strip().upper()
    db.execute(
        text("""
            insert into public.task_types (id, service_package_id, name, code, category_type, display_order, is_active)
            values (:id, :service_package_id, :name, :code, :category_type, :display_order, true)
            insert into public.task_types (id, service_package_id, name, code, category_type, display_order, color, is_active)
            values (:id, :service_package_id, :name, :code, :category_type, :display_order, :color, true)
        """),
        {
            "id": task_type_id,
            "service_package_id": payload.service_package_id,
            "name": payload.name.strip(),
            "code": code,
            "category_type": cat_type,
            "display_order": payload.display_order or 100,
            "color": payload.color or "#10b981",
        },
    )
    db.commit()
    invalidate_catalog_cache()
    return {"data": {"id": task_type_id, "name": payload.name.strip(), "code": code}}
    return {"data": {"id": task_type_id, "name": payload.name.strip(), "code": code, "color": payload.color or "#10b981"}}


@router.patch("/task-types/{task_type_id}")
def update_task_type(
    task_type_id: str,
    payload: TaskTypeUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_authenticated_user),
):
    _check_catalog_write_permission(db, user)
    existing = db.execute(
        text("select id from public.task_types where id = :id"),
        {"id": task_type_id},
    ).mappings().first()
    if not existing:
        raise HTTPException(status_code=404, detail="Hạng mục công việc không tồn tại")

    updates = {}
    if payload.name is not None:
        updates["name"] = payload.name.strip()
    if payload.code is not None:
        updates["code"] = payload.code.strip().upper()
    if payload.category_type is not None:
        updates["category_type"] = payload.category_type.strip().upper()
    if payload.display_order is not None:
        updates["display_order"] = payload.display_order
    if payload.color is not None:
        updates["color"] = payload.color.strip()
    if payload.is_active is not None:
        updates["is_active"] = payload.is_active

    if updates:
        set_clauses = [f"{col} = :{col}" for col in updates.keys()]
        updates["id"] = task_type_id
        db.execute(
            text(f"update public.task_types set {', '.join(set_clauses)} where id = :id"),
            updates,
        )
        db.commit()
        invalidate_catalog_cache()
    return {"data": {"id": task_type_id, "updated": True}}


@router.delete("/task-types/{task_type_id}")
def delete_task_type(
    task_type_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_authenticated_user),
):
    _check_catalog_write_permission(db, user)
    db.execute(
        text("update public.task_types set is_active = false where id = :id"),
        {"id": task_type_id},
    )
    db.commit()
    invalidate_catalog_cache()
    return {"data": {"id": task_type_id, "deleted": True}}


@router.get("/work-items")
def list_work_items(
    db: Session = Depends(get_db),
    _: User = Depends(require_authenticated_user),
):
    """Danh mục công việc khoán (work_items) kèm định mức lương khoán đã ban hành."""
    rows = db.execute(
        text("""
            select wi.id, wi.code, wi.name, wi.default_unit,
                   wr.id as rate_id, wr.role_code, wr.amount
            from public.work_items wi
            left join public.work_item_rates wr on wr.work_item_id = wi.id
                 and wr.status = 'published'
                 and (wr.effective_to is null or wr.effective_to >= current_date)
            where coalesce(wi.is_active, true)
            order by wi.name, wi.code, wr.role_code
        """)
    ).mappings().all()

    items_by_id: dict[str, dict] = {}
    item_order: list[str] = []
    for r in rows:
        wid = str(r["id"])
        if wid not in items_by_id:
            items_by_id[wid] = {
                "id": wid,
                "code": r["code"],
                "name": r["name"],
                "default_unit": r["default_unit"],
                "rates": [],
            }
            item_order.append(wid)
        if r["rate_id"] and r["role_code"]:
            items_by_id[wid]["rates"].append({
                "id": str(r["rate_id"]),
                "role_code": r["role_code"],
                "amount": float(r["amount"] or 0),
            })
    return {"data": [items_by_id[wid] for wid in item_order]}

