from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from src.core.auth import check_user_permission, get_current_user, require_permission
from src.db.database import get_db
from src.db.models import User
from src.dossiers.lifecycle import (
    TERMINAL_SQL_ARRAY,
    assert_dossier_mutable,
)

router = APIRouter(prefix="/api/legal-submissions", tags=["Legal Submissions"])

GOV_STATUSES = ["Đang chi nhánh", "Hoàn thành", "Rút hồ sơ", "Trả công văn"]

_LIST_BASE_SQL = f"""
    select s.id, s.task_node_id, s.service_line_id, s.contract_id, s.dossier_name,
           s.case_description, s.assigned_employee_id, s.contact_phone, s.receipt_code,
           s.receipt_photo_url, s.dossier_file_url, s.linked_survey_folder_url,
           s.payment_status, s.legacy_gov_status as gov_status,
           -- Cùng một quy tắc khoá với bên Đo vẽ, do backend quyết định.
           s.legacy_gov_status = any({TERMINAL_SQL_ARRAY}) as is_locked,
           s.received_date, s.expected_return_date, s.submitted_agency,
           s.is_first_submission, s.previous_submission_id, s.note, s.created_at, s.updated_at,
           sl.service_type as service_line_name, e.full_name as assigned_employee_name
    from public.legal_submissions s
    join public.service_lines sl on sl.id = s.service_line_id
    left join public.employees e on e.id = s.assigned_employee_id
"""


class LegalSubmissionUpdateSchema(BaseModel):
    dossier_name: Optional[str] = None
    case_description: Optional[str] = None
    contact_phone: Optional[str] = None
    receipt_code: Optional[str] = None
    receipt_photo_url: Optional[str] = None
    dossier_file_url: Optional[str] = None
    payment_status: Optional[str] = None
    gov_status: Optional[str] = None
    received_date: Optional[str] = None
    expected_return_date: Optional[str] = None
    submitted_agency: Optional[str] = None
    note: Optional[str] = None


@router.get("/stats")
def get_legal_submission_stats(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submission", "read")),
):
    rows = db.execute(
        text("select legacy_gov_status as gov_status, count(*) as total from public.legal_submissions group by legacy_gov_status")
    ).mappings().all()
    counts = {row["gov_status"]: row["total"] for row in rows}
    return {
        "status": "success",
        "data": {
            "total": sum(counts.values()),
            **{status: counts.get(status, 0) for status in GOV_STATUSES},
        },
    }


@router.get("/")
def list_legal_submissions(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    gov_status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submission", "read")),
):
    where = []
    params = {}
    if search:
        where.append("""(
            s.dossier_name ilike :search or s.case_description ilike :search
            or s.receipt_code ilike :search or s.contract_id ilike :search
        )""")
        params["search"] = f"%{search}%"
    if gov_status and gov_status != "All":
        where.append("s.legacy_gov_status = :gov_status")
        params["gov_status"] = gov_status
    where_sql = f"where {' and '.join(where)}" if where else ""

    total = db.execute(
        text(f"select count(*) from public.legal_submissions s {where_sql}"), params
    ).scalar()

    params["limit"] = limit
    params["offset"] = (page - 1) * limit
    rows = db.execute(
        text(f"{_LIST_BASE_SQL} {where_sql} order by s.created_at desc limit :limit offset :offset"),
        params,
    ).mappings().all()

    total_pages = max(1, (total + limit - 1) // limit)
    return {
        "status": "success",
        "data": [dict(row) for row in rows],
        "meta": {"total": total, "page": page, "limit": limit, "total_pages": total_pages},
    }


@router.get("/by-task-node/{task_node_id}")
def get_legal_submission_by_task_node(
    task_node_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submission", "read")),
):
    """Hồ sơ nộp cơ quan gắn với một Node việc — để màn Lịch của nhân viên pháp lý
    điền số biên nhận ngay tại chỗ làm. Không có thì trả 404 để panel tự ẩn."""
    row = db.execute(
        text(f"{_LIST_BASE_SQL} where s.task_node_id = :task_node_id order by s.created_at desc limit 1"),
        {"task_node_id": task_node_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Node này chưa có hồ sơ nộp cơ quan")
    return {"status": "success", "data": dict(row)}


@router.get("/{submission_id}")
def get_legal_submission(
    submission_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submission", "read")),
):
    row = db.execute(
        text(f"{_LIST_BASE_SQL} where s.id = :submission_id"), {"submission_id": submission_id}
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ pháp lý")
    return {"status": "success", "data": dict(row)}


@router.patch("/{submission_id}")
def update_legal_submission(
    submission_id: str,
    payload: LegalSubmissionUpdateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submission", "read")),
):
    if not check_user_permission(db, user, "legal_submission", "update"):
        raise HTTPException(status_code=403, detail="Không có quyền cập nhật hồ sơ pháp lý")

    status_row = db.execute(
        text("select legacy_gov_status from public.legal_submissions where id = :submission_id"),
        {"submission_id": submission_id},
    ).first()
    if not status_row:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ pháp lý")
    assert_dossier_mutable(status_row[0])

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Không có trường nào để cập nhật")
    if "gov_status" in updates and updates["gov_status"] not in GOV_STATUSES:
        raise HTTPException(status_code=400, detail=f"gov_status phải là một trong {GOV_STATUSES}")

    # Ô ngày để trống gửi lên là chuỗi rỗng, Postgres không ép được sang kiểu date
    # và trả 500. Người dùng xoá ngày đi là chuyện bình thường, phải hiểu là NULL.
    for date_column in ("received_date", "expected_return_date"):
        if date_column in updates and not (updates[date_column] or "").strip():
            updates[date_column] = None

    # Cột gov_status đã đổi tên thành legacy_gov_status; giữ nguyên tên trường trong
    # API để frontend không phải sửa. Đợt 3 sẽ thay hẳn bằng legal_dossiers.status.
    set_clause = ", ".join(
        f'{"legacy_gov_status" if key == "gov_status" else key} = :{key}' for key in updates
    )
    updates["submission_id"] = submission_id
    result = db.execute(
        text(f"""
            update public.legal_submissions
            set {set_clause}, updated_at = now()
            where id = :submission_id
              and coalesce(legacy_gov_status, '') not in ('Hoàn thành', 'Nộp thành công')
            returning id, task_node_id
        """),
        updates,
    ).mappings().first()
    if not result:
        raise HTTPException(status_code=409, detail="Hồ sơ đã hoàn tất và không thể chỉnh sửa.")

    # Cập nhật biên nhận/tình trạng có thể là mảnh ghép cuối để bước NỘP CƠ QUAN xong:
    # vừa chuyển sang "Hoàn thành" thì thử tự nghiệm thu node — lúc này checklist đã
    # duyệt + hồ sơ đã đóng thì mới đủ điều kiện. Bọc savepoint để lưu biên nhận vẫn
    # thành công dù tự nghiệm thu trục trặc.
    node_finalized = False
    if updates.get("gov_status") == "Hoàn thành" and result["task_node_id"]:
        from src.contracts.workflow_runtime import auto_finalize_node_if_ready
        try:
            with db.begin_nested():
                auto = auto_finalize_node_if_ready(
                    db, task_node_id=result["task_node_id"], actor_id=user.id
                )
                node_finalized = bool(auto.get("finalized"))
        except Exception:
            import logging
            logging.getLogger(__name__).exception("Auto-finalize sau khi cập nhật biên nhận %s lỗi", submission_id)

    db.commit()
    if node_finalized:
        from src.core.redis_utils import invalidate_cache, invalidate_money_caches
        invalidate_cache("bachkhoa:contract_workspace:*")
        invalidate_money_caches()
    return {"status": "success", "data": {"id": submission_id, "node_finalized": node_finalized}}
