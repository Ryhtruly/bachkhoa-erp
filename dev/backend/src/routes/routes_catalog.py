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


def _doc_cay_danh_muc(db: Session) -> list[dict]:
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

    goi_theo_id: dict[str, dict] = {}
    thu_tu: list[str] = []
    for r in rows:
        pid = r["package_id"]
        if pid not in goi_theo_id:
            goi_theo_id[pid] = {
                "id": pid,
                "name": r["package_name"],
                "display_order": r["display_order"],
                "task_types": [],
            }
            thu_tu.append(pid)
        # Gói chưa có hạng mục nào vẫn hiện (LEFT JOIN cho task_type_id = null).
        if r["task_type_id"]:
            goi_theo_id[pid]["task_types"].append({
                "id": r["task_type_id"],
                "code": r["task_type_code"],
                "name": r["task_type_name"],
            })
    return [goi_theo_id[pid] for pid in thu_tu]


def catalog_tree(db: Session) -> list[dict]:
    """Bản có cache — dùng chung cho router này và cho /api/config (Bước 1.3)."""
    cached = get_cached_json(CACHE_KEY)
    if cached is not None:
        return cached
    tree = _doc_cay_danh_muc(db)
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
