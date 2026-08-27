import io
import logging
import re
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile as StarletteUploadFile

from src.contracts.workflow_runtime import (
    TaskClaimConflict,
    WorkflowValidationError,
    cancel_node_help,
    claim_and_start_task,
    claim_node_help,
    mark_field_work_started,
    request_node_help,
    start_task_node,
    submit_task_node_for_acceptance,
)
from src.core.auth import check_user_permission, get_current_user
from src.core.redis_utils import invalidate_cache
from src.db.database import get_db
from src.db.models import Employee, User
from src.employee_portal.service import EmployeePortalService
from src.files.references import FileReference
from src.services.storage_service import AVATAR_PREFIX, WORKFLOW_EVIDENCE_PREFIX, delete_file, ensure_bucket, get_file, upload_file
from src.services.timeline_realtime import employee_task_event_stream, publish_timeline_change


class SubmitNodeIn(BaseModel):
    note: str | None = None


class ClaimNodeIn(BaseModel):
    role_code: str = "MAIN"


router = APIRouter(prefix="/api/employee-portal", tags=["Employee Portal"])

ALLOWED_EVIDENCE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"}
MAX_EVIDENCE_BYTES = 10 * 1024 * 1024
logger = logging.getLogger(__name__)


@router.get("/file")
def read_private_file(
    object_key: str = Query(..., min_length=1),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stream avatar/workflow objects without exposing the private bucket."""
    if not object_key.startswith((AVATAR_PREFIX, WORKFLOW_EVIDENCE_PREFIX)):
        raise HTTPException(status_code=400, detail="Đường dẫn tệp nội bộ không hợp lệ.")
    if object_key.startswith(WORKFLOW_EVIDENCE_PREFIX):
        match = re.fullmatch(
            r"contracts/([^/]+)/service-lines/([^/]+)/nodes/([^/]+)/[^/]+",
            object_key,
        )
        if not match:
            raise HTTPException(status_code=400, detail="Đường dẫn tệp minh chứng không hợp lệ.")
        contract_id, service_line_id, task_node_id = match.groups()
        assigned = db.execute(
            text(
                """
                select 1
                from public.task_node_assignments a
                join public.employees e on e.id = a.employee_id
                join public.task_nodes n on n.id = a.task_node_id
                join public.workflow_instances wi on wi.id = n.workflow_instance_id
                join public.service_lines sl on sl.id = wi.service_line_id
                where e.user_id = :user_id
                  and coalesce(e.is_active, true)
                  and a.assignment_status not in ('replaced', 'declined', 'cancelled')
                  and n.id = :task_node_id
                  and wi.service_line_id = :service_line_id
                  and sl.contract_id = :contract_id
                limit 1
                """
            ),
            {
                "user_id": user.id,
                "contract_id": contract_id,
                "service_line_id": service_line_id,
                "task_node_id": task_node_id,
            },
        ).first()
        if not assigned and not check_user_permission(db, user, "contracts", "read"):
            raise HTTPException(status_code=403, detail="Không đủ quyền xem file minh chứng này.")
    try:
        stored = get_file(object_key)
        return Response(
            content=stored["Body"].read(),
            media_type=stored.get("ContentType") or "application/octet-stream",
            headers={"Cache-Control": "private, max-age=300"},
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Đường dẫn tệp nội bộ không hợp lệ.") from exc
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Tệp nội bộ không tồn tại.") from exc


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
    return FileReference.from_task_node(task_node, f"{uuid4().hex}-{filename}")


@router.get("/me")
def get_my_employee_profile(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    employee = _active_employee_for_user(db, user.id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")
    return EmployeePortalService.build_profile(db, employee)


@router.get("/task-pool")
def get_task_pool(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    employee = _active_employee_for_user(db, user.id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")
    return EmployeePortalService.get_task_pool(db, employee)


@router.get("/task-pool/{task_node_id}/detail")
def get_task_pool_item_detail(
    task_node_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Bảng kê đầy đủ của một thẻ Bể việc, xem trước khi bấm nhận."""
    employee = _active_employee_for_user(db, user.id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")
    try:
        return EmployeePortalService.get_pool_item_detail(db, employee, task_node_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/daily-summary")
def get_daily_summary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    employee = _active_employee_for_user(db, user.id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")
    return EmployeePortalService.get_daily_summary(db, employee)


@router.get("/completed-items")
def get_completed_items(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lịch sử Hạng mục nhân viên đã làm xong phần của mình.

    Tách khỏi /daily-summary vì hai thứ khác nhau: daily-summary là thành tích
    trong ngày tính theo bước, còn đây là lịch sử toàn thời gian tính theo Hạng mục.
    """
    employee = _active_employee_for_user(db, user.id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")
    return EmployeePortalService.get_completed_items(db, employee)


@router.get("/events")
def stream_employee_task_events(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Không đòi hồ sơ nhân sự. Luồng này chỉ phát tín hiệu "có thứ gì đó đổi",
    # payload đúng ba trường source/entity_id/changed_at — không mang dữ liệu
    # nghiệp vụ nào nên chặn theo hồ sơ nhân sự cũng không bảo vệ được gì.
    #
    # Ngược lại nó gây hỏng thật: Giám đốc (tài khoản admin) không có dòng
    # employees, nên màn Hàng chờ duyệt nhận 404 rồi thử lại mỗi 1,5 giây mãi mãi.
    return StreamingResponse(
        employee_task_event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/tasks/{task_node_id}/claim")
def claim_task(
    task_node_id: str,
    payload: ClaimNodeIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    employee = _active_employee_for_user(db, user.id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")
    try:
        result = claim_and_start_task(
            db,
            task_node_id=task_node_id,
            employee_id=employee.id,
            role_code=payload.role_code,
            actor_id=user.id,
        )
        db.commit()
        invalidate_cache("task_pool:*")
        invalidate_cache("bachkhoa:contract_workspace:*")
        invalidate_cache(f"employee_daily_summary:{employee.id}:*")
        publish_timeline_change("TASK_CLAIMED", entity_id=task_node_id)
        return result
    except TaskClaimConflict as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except HTTPException as exc:
        db.rollback()
        if exc.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Công việc vừa được người khác nhận. Bể việc đang được cập nhật.",
            ) from exc
        raise
    except WorkflowValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/my-payroll")
def get_my_payroll(
    month: Optional[str] = Query(None, description="Kỳ lương định dạng YYYY-MM"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    employee = _active_employee_for_user(db, user.id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")
    return EmployeePortalService.get_my_payroll(db, employee, selected_month=month)


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

    EmployeePortalService.authorize_checklist_evidence_submission(
        db,
        employee,
        task_node_id,
        checklist_result_id,
        evidence_provided=file is not None,
    )

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


@router.post("/tasks/{task_node_id}/checklist/{checklist_result_id}/output-documents")
async def submit_checklist_output_document(
    task_node_id: str,
    checklist_result_id: str,
    template_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Nộp một TÀI LIỆU ĐẦU RA cho checklist — một tệp, một object.

    Khác đường minh chứng thường: tệp ở đây trở thành thành phần chính thức của
    hồ sơ Hạng mục, nên nó sinh dòng dossier_documents và các quan hệ trỏ tới ô
    giấy lẫn checklist. Nhưng vẫn chỉ upload đúng MỘT lần.
    """
    from src.dossiers.documents import submit_output_document

    employee = _active_employee_for_user(db, user.id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")

    # Dùng lại đúng hàng rào phân công của luồng minh chứng: ai không được giao
    # thì không nộp được tài liệu vào hồ sơ.
    EmployeePortalService.authorize_checklist_evidence_submission(
        db, employee, task_node_id, checklist_result_id, evidence_provided=True,
    )

    data = await file.read(MAX_EVIDENCE_BYTES + 1)
    try:
        result = submit_output_document(
            db,
            checklist_result_id=checklist_result_id,
            template_id=template_id,
            file_name=file.filename or "tai-lieu",
            content_type=file.content_type,
            data=data,
            actor_id=user.id,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    publish_timeline_change("checklist_output_document_added", entity_id=checklist_result_id)
    return {"status": "success", "data": result}


@router.post("/tasks/{task_node_id}/checklist/{checklist_result_id}/output-documents/{document_id}")
def reuse_checklist_output_document(
    task_node_id: str,
    checklist_result_id: str,
    document_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Gắn một tài liệu ĐÃ CÓ của hợp đồng vào mục checklist — không upload lại.

    K03 dùng lại bản kỹ thuật gốc của K02 đi đường này: thêm quan hệ, không sinh
    object thứ hai trên kho lưu trữ.
    """
    from src.dossiers.documents import attach_existing_document

    employee = _active_employee_for_user(db, user.id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")
    EmployeePortalService.authorize_checklist_evidence_submission(
        db, employee, task_node_id, checklist_result_id, evidence_provided=True,
    )
    try:
        result = attach_existing_document(
            db, checklist_result_id=checklist_result_id,
            document_id=document_id, actor_id=user.id,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    publish_timeline_change("checklist_output_document_added", entity_id=checklist_result_id)
    return {"status": "success", "data": result}


@router.get("/tasks/{task_node_id}/checklist/{checklist_result_id}/output-status")
def get_checklist_output_status(
    task_node_id: str,
    checklist_result_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Còn thiếu tài liệu gì để nộp được checklist — cùng một hàm với cổng chặn.

    Đọc thôi nhưng vẫn phải soát: id mục checklist đoán được, nên không kiểm thì
    ai cũng dò được tên tài liệu và tiến độ hồ sơ của Hạng mục người khác.
    """
    from src.dossiers.documents import checklist_output_status

    # 1. Mục checklist phải THUỘC đúng bước trong đường dẫn — nếu không thì chỉ
    #    cần đổi một trong hai id là soi được mục của bước khác.
    thuoc_ve = db.execute(
        text("""
            select 1 from public.task_node_checklist_results
            where id = :checklist_result_id and task_node_id = :task_node_id
        """),
        {"checklist_result_id": checklist_result_id, "task_node_id": task_node_id},
    ).first()
    if not thuoc_ve:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục checklist của bước này.")

    # 2. Người gọi phải được giao việc ở bước đó, hoặc có quyền đọc hợp đồng
    #    (Giám đốc/quản lý). Nhân viên bộ phận khác không dò được.
    if not check_user_permission(db, user, "contracts", "read"):
        employee = _active_employee_for_user(db, user.id)
        duoc_giao = employee and db.execute(
            text("""
                select 1 from public.task_node_assignments
                where task_node_id = :task_node_id and employee_id = :employee_id
                  and assignment_status not in ('replaced', 'declined', 'cancelled')
                union all
                select 1
                from public.task_node_checklist_assignments ca
                join public.task_node_checklist_results cr on cr.id = ca.checklist_result_id
                where cr.task_node_id = :task_node_id and ca.employee_id = :employee_id
                  and ca.status not in ('replaced', 'cancelled')
                limit 1
            """),
            {"task_node_id": task_node_id, "employee_id": employee.id},
        ).first()
        if not duoc_giao:
            raise HTTPException(status_code=403, detail="Bạn không được phân công cho công việc này.")

    return checklist_output_status(db, checklist_result_id)


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
        invalidate_cache("task_pool:*")
        invalidate_cache("bachkhoa:contract_workspace:*")
        invalidate_cache(f"employee_daily_summary:{employee.id}:*")
        publish_timeline_change("TASK_STARTED", entity_id=task_node_id)
        return result
    except WorkflowValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/tasks/{task_node_id}/field-start")
def start_field_work(
    task_node_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Thợ chính bấm 'Bắt đầu đo' tại hiện trường — đóng suất thợ phụ còn trống."""
    employee = _active_employee_for_user(db, user.id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")
    try:
        result = mark_field_work_started(
            db, task_node_id=task_node_id, employee_id=employee.id, actor_id=user.id
        )
        db.commit()
        invalidate_cache("task_pool:*")
        invalidate_cache("bachkhoa:contract_workspace:*")
        publish_timeline_change("FIELD_WORK_STARTED", entity_id=task_node_id)
        return result
    except WorkflowValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/tasks/{task_node_id}/shortage")
def node_shortage(
    task_node_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Thiếu gì trước khi bấm Nộp nghiệm thu — để Modal liệt kê đúng thứ máy chủ thấy.

    Cùng một hàm với chỗ ghi vết lúc nộp, nên Modal không bao giờ nói khác với
    cái được lưu lại.
    """
    from src.dossiers.documents import node_shortage_report

    employee = _active_employee_for_user(db, user.id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")
    return {"status": "success", "data": node_shortage_report(db, task_node_id)}


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
        invalidate_cache("task_pool:*")
        invalidate_cache("bachkhoa:contract_workspace:*")
        invalidate_cache(f"employee_daily_summary:{employee.id}:*")
        publish_timeline_change("TASK_SUBMITTED", entity_id=task_node_id)
        return result
    except WorkflowValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


class HelpRequestIn(BaseModel):
    reason: str
    proposed_amount: Optional[float] = None


@router.post("/tasks/{task_node_id}/help-requests")
def request_help(
    task_node_id: str,
    payload: HelpRequestIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Nhường một bước lên Bể việc để đồng đội làm hộ."""
    employee = _active_employee_for_user(db, user.id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")
    try:
        result = request_node_help(
            db,
            task_node_id=task_node_id,
            employee_id=employee.id,
            reason=payload.reason,
            proposed_amount=payload.proposed_amount,
        )
        db.commit()
        invalidate_cache("task_pool:*")
        publish_timeline_change("HELP_REQUESTED", entity_id=task_node_id)
        return result
    except TaskClaimConflict as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except WorkflowValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/help-requests/{request_id}/claim")
def claim_help(
    request_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Nhận làm hộ một bước đồng đội đã nhường."""
    employee = _active_employee_for_user(db, user.id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")
    try:
        result = claim_node_help(
            db, request_id=request_id, employee_id=employee.id, actor_id=user.id
        )
        db.commit()
        invalidate_cache("task_pool:*")
        publish_timeline_change("HELP_CLAIMED", entity_id=result["task_node_id"])
        return result
    except TaskClaimConflict as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except HTTPException as exc:
        db.rollback()
        if exc.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            raise HTTPException(status_code=409, detail="Lời nhờ vừa được người khác nhận.") from exc
        raise
    except WorkflowValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/help-requests/{request_id}/cancel")
def cancel_help(
    request_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Rút lại lời nhờ khi chưa ai nhận."""
    employee = _active_employee_for_user(db, user.id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ nhân sự.")
    try:
        result = cancel_node_help(db, request_id=request_id, employee_id=employee.id)
        db.commit()
        invalidate_cache("task_pool:*")
        return result
    except TaskClaimConflict as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except WorkflowValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
