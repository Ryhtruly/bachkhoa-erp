"""Danh mục Gói dịch vụ → Hạng mục — một nguồn sự thật cho mọi ô chọn.

Trước đây danh sách dịch vụ bị ghi cứng trong `routes_dashboard.py` (9 mục, sai
chính tả, mất gói Xây dựng). Router này đọc thẳng từ `service_packages` +
`task_types` nên thêm/sửa hạng mục trong DB là mọi màn thấy ngay.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.core.auth import require_authenticated_user, User
from src.core.redis_utils import get_cached_json, set_cached_json, invalidate_cache
from src.db.database import get_db

router = APIRouter(prefix="/api/catalog", tags=["01. Catalog"])

CACHE_KEY = "bachkhoa:catalog:service_packages"


def _build_catalog_tree(db: Session) -> list[dict]:
    """Cây Gói → Hạng mục, sắp theo thứ tự hiển thị của gói rồi tên hạng mục."""
    rows = db.execute(
        text("""
            select p.id as package_id, p.name as package_name, p.display_order,
                   t.id as task_type_id, t.code as task_type_code, t.name as task_type_name
            from public.service_packages p
            left join public.task_types t on t.service_package_id = p.id
            where coalesce(p.is_active, true)
            order by p.display_order nulls last, p.name, t.name
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
                "task_types": [],
            }
            package_order.append(pid)
        # Gói chưa có hạng mục nào vẫn hiện (LEFT JOIN cho task_type_id = null).
        if r["task_type_id"]:
            packages_by_id[pid]["task_types"].append({
                "id": r["task_type_id"],
                "code": r["task_type_code"],
                "name": r["task_type_name"],
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

