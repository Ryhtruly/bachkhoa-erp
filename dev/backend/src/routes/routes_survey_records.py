from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from src.core.auth import check_user_permission, get_current_user, require_permission
from src.db.database import get_db
from src.db.models import User
from src.dossiers.lifecycle import (
    LEGAL_PACKAGE_ID,
    SURVEY_FLAGS_LATERAL,
    SURVEY_STATUS_LATERAL,
    SURVEY_STATUS_SELECT,
    assert_dossier_mutable,
)

router = APIRouter(prefix="/api/survey-records", tags=["Survey Records"])

# Trạng thái NGƯỜI DÙNG được phép tự đặt. Ba giá trị còn lại (Đang thực hiện /
# Đã bàn giao / Hoàn thành) do hệ thống tính sống, không ai gõ tay được.
MANUAL_STATUSES = ["Nộp thành công", "Huỷ"]
ALL_STATUSES = ["Đang thực hiện", "Đã bàn giao", "Hoàn thành", *MANUAL_STATUSES]
PRIORITIES = ["HIGH", "NORMAL", "LOW"]

# Chỉ survey_records mới lưu dữ liệu riêng (tên hồ sơ, phường, ưu tiên). Mọi cột còn lại
# đọc thẳng từ nguồn gốc để không bao giờ lệch khi khách đổi SĐT hay sếp đổi lịch.
_BASE_SQL = f"""
    select s.id, s.task_node_id, s.service_line_id, s.contract_id,
           s.dossier_name, s.ward_code, s.priority, s.manual_status, s.note,
           s.created_at, s.updated_at,
           w.name as ward_name,
           sl.service_type as service_line_name,
           cu.full_name as customer_name, cu.phone as customer_phone,
           n.status as node_status, n.started_at, n.deadline_at,
           n.submitted_at, n.accepted_at,
           main_emp.full_name as main_assignee_name,
           main_emp.avatar_url as main_assignee_avatar,
           assist_emp.full_name as assistant_name,
{SURVEY_STATUS_SELECT}
    from public.survey_records s
    join public.task_nodes n on n.id = s.task_node_id
    join public.workflow_instances wi on wi.id = n.workflow_instance_id
    join public.service_lines sl on sl.id = s.service_line_id
    join public.contracts c on c.id = s.contract_id
    left join public.customers cu on cu.id = c.customer_id
    left join public.wards w on w.code = s.ward_code
    left join lateral (
      select e.full_name, e.avatar_url
      from public.task_node_assignments a
      join public.employees e on e.id = a.employee_id
      where a.task_node_id = s.task_node_id and a.role_code = 'MAIN'
        and a.assignment_status not in ('replaced', 'declined')
      order by a.is_primary desc, a.created_at asc limit 1
    ) main_emp on true
    left join lateral (
      select e.full_name
      from public.task_node_assignments a
      join public.employees e on e.id = a.employee_id
      where a.task_node_id = s.task_node_id and a.role_code = 'ASSISTANT'
        and a.assignment_status not in ('replaced', 'declined')
      order by a.created_at asc limit 1
    ) assist_emp on true
{SURVEY_FLAGS_LATERAL}
{SURVEY_STATUS_LATERAL}
"""


class SurveyRecordUpdateSchema(BaseModel):
    dossier_name: Optional[str] = None
    ward_code: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    note: Optional[str] = None


@router.get("/wards/provinces")
def list_provinces(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("survey_record", "read")),
):
    rows = db.execute(
        text("""
            select distinct province_code as code, province_name as name
            from public.wards
            where is_active
            order by province_name
        """)
    ).mappings().all()
    return {"status": "success", "data": [dict(row) for row in rows]}


@router.get("/wards")
def list_wards(
    province_code: str = Query("79", description="Mặc định TP.HCM"),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("survey_record", "read")),
):
    params = {"province_code": province_code}
    where = ["province_code = :province_code", "is_active"]
    if search:
        where.append("name ilike :search")
        params["search"] = f"%{search}%"
    rows = db.execute(
        text(f"""
            select code, name, province_name from public.wards
            where {' and '.join(where)} order by name limit 500
        """),
        params,
    ).mappings().all()
    return {"status": "success", "data": [dict(row) for row in rows]}


@router.get("/stats")
def get_survey_stats(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("survey_record", "read")),
):
    # Đếm theo trạng thái TÍNH SỐNG — cùng một công thức với danh sách, nên hai
    # chỗ không bao giờ lệch nhau.
    rows = db.execute(
        text(f"select status, count(*) as total from ({_BASE_SQL}) x group by status")
    ).mappings().all()
    counts = {row["status"]: row["total"] for row in rows}
    return {
        "status": "success",
        "data": {"total": sum(counts.values()), **{s: counts.get(s, 0) for s in ALL_STATUSES}},
    }


@router.get("/")
def list_survey_records(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    ward_code: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("survey_record", "read")),
):
    where = []
    params = {}
    if search:
        where.append("""(
            s.dossier_name ilike :search or s.contract_id ilike :search
            or cu.full_name ilike :search or sl.service_type ilike :search
        )""")
        params["search"] = f"%{search}%"
    if status and status != "All":
        where.append("st.effective_status = :status")
        params["status"] = status
    if ward_code and ward_code != "All":
        where.append("s.ward_code = :ward_code")
        params["ward_code"] = ward_code
    if priority and priority != "All":
        where.append("s.priority = :priority")
        params["priority"] = priority
    where_sql = f"where {' and '.join(where)}" if where else ""

    total = db.execute(
        text(f"select count(*) from ({_BASE_SQL} {where_sql}) x"),
        params,
    ).scalar()

    params.update({"limit": limit, "offset": (page - 1) * limit})
    rows = db.execute(
        text(f"{_BASE_SQL} {where_sql} order by s.created_at desc limit :limit offset :offset"),
        params,
    ).mappings().all()

    return {
        "status": "success",
        "data": [dict(row) for row in rows],
        "meta": {
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": max(1, (total + limit - 1) // limit),
        },
    }


@router.get("/{record_id}")
def get_survey_record(
    record_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("survey_record", "read")),
):
    row = db.execute(
        text(f"{_BASE_SQL} where s.id = :record_id"), {"record_id": record_id}
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ đo vẽ")
    return {"status": "success", "data": dict(row)}


@router.patch("/{record_id}")
def update_survey_record(
    record_id: str,
    payload: SurveyRecordUpdateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("survey_record", "read")),
):
    if not check_user_permission(db, user, "survey_record", "update"):
        raise HTTPException(status_code=403, detail="Không có quyền cập nhật hồ sơ đo vẽ")

    # Khoá sửa dựa trên trạng thái TÍNH SỐNG, không phải cột thủ công — nếu không
    # thì hồ sơ đã chạy hết quy trình vẫn sửa được vì cột thủ công đang rỗng.
    current = db.execute(
        text(f"{_BASE_SQL} where s.id = :record_id"), {"record_id": record_id}
    ).mappings().first()
    if not current:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ đo vẽ")
    assert_dossier_mutable(current["status"])

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Không có trường nào để cập nhật")
    if "status" in updates and updates["status"] not in MANUAL_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Chỉ đặt tay được {MANUAL_STATUSES}. "
                "Đang thực hiện / Đã bàn giao / Hoàn thành do hệ thống tự tính theo tiến độ quy trình."
            ),
        )
    if "priority" in updates and updates["priority"] not in PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Độ ưu tiên phải thuộc {PRIORITIES}")

    # Cột trạng thái thủ công đã đổi tên; giữ nguyên tên trường "status" trong API
    # để frontend không phải sửa gì.
    set_clause = ", ".join(
        f'{"manual_status" if key == "status" else key} = :{key}' for key in updates
    )
    updates["record_id"] = record_id
    result = db.execute(
        text(f"""
            update public.survey_records set {set_clause}, updated_at = now()
            where id = :record_id
            returning id
        """),
        updates,
    ).first()
    if not result:
        raise HTTPException(status_code=409, detail="Hồ sơ đã hoàn tất và không thể chỉnh sửa.")
    db.commit()
    return {"status": "success", "data": {"id": record_id}}
