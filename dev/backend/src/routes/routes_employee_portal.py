import io
import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import text
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile as StarletteUploadFile

from src.contracts.workflow_runtime import (
    WorkflowValidationError,
    start_task_node,
    submit_task_node_for_acceptance,
)
from src.core.auth import check_user_permission, get_current_user
from src.db.database import get_db
from src.db.models import Employee, User
from src.employee_portal.service import EmployeePortalService
from src.files.references import FileReference
from src.services.storage_service import delete_file, ensure_bucket, upload_file
from src.services.timeline_realtime import publish_timeline_change


class SubmitNodeIn(BaseModel):
    note: str | None = None


router = APIRouter(prefix="/api/employee-portal", tags=["Employee Portal"])

ALLOWED_EVIDENCE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"}
MAX_EVIDENCE_BYTES = 10 * 1024 * 1024
logger = logging.getLogger(__name__)


def _active_employee_for_user(db: Session, user_id: str) -> Employee | None:
    return (
        db.query(Employee)
        .filter(Employee.user_id == user_id, Employee.is_active == True)
        .first()
    )


def evidence_file_reference(db: Session, task_node_id: str, filename: str) -> FileReference:
    task_node = db.execute(
        text("""
            -- task_nodes KHÔNG có service_line_id. Hạng mục nằm ở workflow_instances,
            -- phải đi qua đó mới lấy được. Viết thẳng n.service_line_id làm mọi lần
            -- nộp minh chứng đều lỗi 500.
            select n.id, wi.service_line_id, sl.contract_id
            from public.task_nodes n
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            join public.service_lines sl on sl.id = wi.service_line_id
            where n.id = :task_node_id
        """),
        {"task_node_id": task_node_id},
    ).mappings().first()
    if not task_node:
        raise HTTPException(status_code=404, detail="Không tìm thấy công việc để lưu file minh chứng.")
    return FileReference.from_task_node(task_node, filename)


@router.get("/me")
def get_my_employee_profile(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    employee = _active_employee_for_user(db, user.id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")
    return EmployeePortalService.build_profile(db, employee)


@router.get("/employees/{employee_id}")
def get_employee_profile(
    employee_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    employee = (
        db.query(Employee)
        .filter(Employee.id == employee_id, Employee.is_active == True)
        .first()
    )
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")
    if employee.user_id != user.id and not check_user_permission(db, user, "hr", "read"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Không đủ quyền xem hồ sơ nhân sự.",
        )
    return EmployeePortalService.build_profile(db, employee)


@router.post("/tasks/{task_node_id}/checklist/{checklist_result_id}/submit")
async def submit_checklist_evidence(
    task_node_id: str,
    checklist_result_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Checklist không đòi minh chứng thì không có gì để gửi, và trình duyệt gửi
    # multipart rỗng. Khai bằng File()/Form() thì python-multipart coi body đó là
    # hỏng và trả 400 — nhân viên pháp lý không tích nổi checklist nào. Tự đọc
    # form và chấp nhận rỗng, vì "không nộp kèm gì" là tình huống hợp lệ nhất.
    file: StarletteUploadFile | None = None
    note: str | None = None
    late_reason: str | None = None
    if "multipart/form-data" in (request.headers.get("content-type") or ""):
        try:
            form = await request.form()
        except Exception:
            form = None
        if form is not None:
            uploaded = form.get("file")
            if isinstance(uploaded, StarletteUploadFile) and uploaded.filename:
                file = uploaded
            note = (form.get("note") or None) if isinstance(form.get("note"), str) else None
            raw_reason = form.get("late_reason")
            late_reason = raw_reason if isinstance(raw_reason, str) and raw_reason else None

    employee = _active_employee_for_user(db, user.id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")

    evidence_url = None
    safe_name = None
    object_name = None
    if file:
        if file.content_type not in ALLOWED_EVIDENCE_TYPES:
            raise HTTPException(status_code=422, detail="Chỉ chấp nhận ảnh JPEG/PNG/WEBP/GIF hoặc PDF.")
        file_bytes = await file.read()
        if len(file_bytes) > MAX_EVIDENCE_BYTES:
            raise HTTPException(status_code=422, detail="File không được vượt quá 10MB.")

        ensure_bucket()
        safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", file.filename or "evidence")
        safe_name = re.sub(r"_+", "_", safe_name).strip("_")
        object_name = evidence_file_reference(db, task_node_id, safe_name).object_key
        evidence_url = upload_file(io.BytesIO(file_bytes), object_name)

    try:
        result = EmployeePortalService.submit_checklist_evidence(
            db,
            employee,
            task_node_id,
            checklist_result_id,
            evidence_url,
            safe_name,
            note,
            late_reason,
            datetime.now(timezone.utc),
        )
    except Exception:
        if object_name:
            try:
                delete_file(object_name)
            except Exception:
                logger.exception("Unable to compensate evidence upload for task node %s", task_node_id)
        raise
    publish_timeline_change("checklist_submitted", entity_id=checklist_result_id)
    return result


@router.post("/tasks/{task_node_id}/start")
def start_task(
    task_node_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    employee = _active_employee_for_user(db, user.id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")
    try:
        result = start_task_node(db, task_node_id=task_node_id, employee_id=employee.id, actor_id=user.id)
        db.commit()
        publish_timeline_change("node_started", entity_id=task_node_id)
        return result
    except WorkflowValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/tasks/{task_node_id}/submit")
def submit_task(
    task_node_id: str,
    payload: SubmitNodeIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    employee = _active_employee_for_user(db, user.id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")
    try:
        result = submit_task_node_for_acceptance(
            db, task_node_id=task_node_id, employee_id=employee.id, actor_id=user.id, note=payload.note
        )
        db.commit()
        publish_timeline_change("node_submitted", entity_id=task_node_id)
        return result
    except WorkflowValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
