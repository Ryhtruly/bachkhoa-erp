from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import or_, func, cast, Date
from sqlalchemy.orm import Session, aliased
from src.db.database import get_db
from src.db.models import (
    TaskSubmission,
    ProjectTask,
    Contract,
    Customer,
    User,
    Employee,
    AuditLog,
)
from src.core.auth import require_permission
import uuid
from datetime import datetime, date
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(tags=["05. Legal Submissions"])


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class LegalSubmissionCreateSchema(BaseModel):
    task_id: str
    receipt_code: Optional[str] = None
    submitted_by: Optional[str] = None
    submission_date: Optional[str] = None
    is_first_submission: Optional[bool] = True
    expected_return_date: Optional[str] = None
    receipt_photo_url: Optional[str] = None
    received_by: Optional[str] = None
    gov_status: Optional[str] = "Đã nộp"
    note: Optional[str] = None


class LegalSubmissionUpdateSchema(BaseModel):
    receipt_code: Optional[str] = None
    submitted_by: Optional[str] = None
    submission_date: Optional[str] = None
    is_first_submission: Optional[bool] = None
    expected_return_date: Optional[str] = None
    receipt_photo_url: Optional[str] = None
    received_by: Optional[str] = None
    gov_status: Optional[str] = None
    note: Optional[str] = None


class GovStatusUpdateSchema(BaseModel):
    gov_status: str


class PhotoUpdateSchema(BaseModel):
    receipt_photo_url: str


class NoteUpdateSchema(BaseModel):
    note: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/stats")
def get_submission_stats(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submissions", "read")),
):
    """Statistical summary of government submissions."""
    total = db.query(TaskSubmission).count()
    pending = db.query(TaskSubmission).filter(
        TaskSubmission.gov_status.in_(["Đã nộp", "Đã tiếp nhận", "Đang xử lý", "Chờ kết quả"])
    ).count()
    completed = db.query(TaskSubmission).filter(
        TaskSubmission.gov_status.in_(["Hoàn thành", "Đã trả kết quả", "Thành công"])
    ).count()
    needs_supplement = db.query(TaskSubmission).filter(
        TaskSubmission.gov_status == "Cần bổ sung"
    ).count()
    rejected = db.query(TaskSubmission).filter(
        TaskSubmission.gov_status.in_(["Từ chối", "Bị trả"])
    ).count()

    return {
        "status": "success",
        "data": {
            "total": total,
            "pending": pending,
            "completed": completed,
            "needs_supplement": needs_supplement,
            "rejected": rejected,
        },
    }


@router.get("/")
def list_legal_submissions(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    gov_status: Optional[str] = Query(None),
    task_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submissions", "read")),
):
    """getAll endpoint with pagination (default 20), search, and filters."""
    assignee_user = aliased(User)
    assignee_emp = aliased(Employee)

    query = (
        db.query(
            TaskSubmission,
            ProjectTask,
            Contract,
            Customer,
            assignee_user,
            assignee_emp,
        )
        .outerjoin(ProjectTask, ProjectTask.id == TaskSubmission.task_id)
        .outerjoin(Contract, Contract.id == ProjectTask.contract_id)
        .outerjoin(Customer, Customer.id == Contract.customer_id)
        .outerjoin(assignee_user, assignee_user.id == ProjectTask.assignee_id)
        .outerjoin(assignee_emp, assignee_emp.user_id == assignee_user.id)
    )

    if task_id:
        query = query.filter(TaskSubmission.task_id == task_id)

    if gov_status:
        query = query.filter(TaskSubmission.gov_status == gov_status)

    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                TaskSubmission.receipt_code.ilike(pattern),
                TaskSubmission.task_id.ilike(pattern),
                TaskSubmission.submitted_by.ilike(pattern),
                Customer.full_name.ilike(pattern),
                Customer.phone.ilike(pattern),
            )
        )

    total_count = query.count()
    offset = (page - 1) * limit
    rows = (
        query.order_by(TaskSubmission.submission_date.desc().nullslast(), TaskSubmission.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    result = []
    for sub, task, contract, customer, assignee, assignee_employee in rows:
        assignee_name = "Chưa phân công"
        if assignee_employee and assignee_employee.full_name:
            assignee_name = assignee_employee.full_name
        elif assignee:
            assignee_name = assignee.username

        result.append({
            "id": sub.id,
            "receipt_code": sub.receipt_code or "",
            "submitted_by": sub.submitted_by or "",
            "submission_date": sub.submission_date.strftime("%Y-%m-%d") if sub.submission_date else "",
            "expected_return_date": sub.expected_return_date.strftime("%Y-%m-%d") if sub.expected_return_date else "",
            "gov_status": sub.gov_status or "Đã nộp",
            "receipt_photo_url": sub.receipt_photo_url or "",
            "note": sub.note or "",
            "is_first_submission": sub.is_first_submission,
            "result": sub.result or "",
            "received_by": sub.received_by or "",
            # Joined fields
            "task_id": task.id if task else sub.task_id,
            "department": (task.department if task else "") or "Chưa phân phòng",
            "assignee_id": task.assignee_id if task else None,
            "assignee_name": assignee_name,
            "task_status": (task.status if task else "") or "Mới tiếp nhận",
            "contract_id": task.contract_id if task else None,
            "customer_name": customer.full_name if customer else "Khách vãng lai",
            "customer_phone": customer.phone if customer else "",
            "location": (task.ward if task else "") or (customer.address if customer else ""),
        })

    total_pages = (total_count + limit - 1) // limit if limit > 0 else 1

    return {
        "status": "success",
        "data": result,
        "meta": {
            "total": total_count,
            "page": page,
            "limit": limit,
            "total_pages": total_pages,
        },
    }


@router.get("/by-task/{task_id}")
def get_submissions_by_task(
    task_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submissions", "read")),
):
    """List all legal submissions for a specific project task."""
    submissions = (
        db.query(TaskSubmission)
        .filter(TaskSubmission.task_id == task_id)
        .order_by(TaskSubmission.submission_date.desc().nullslast())
        .all()
    )
    result = []
    for sub in submissions:
        result.append({
            "id": sub.id,
            "task_id": sub.task_id,
            "receipt_code": sub.receipt_code or "",
            "submitted_by": sub.submitted_by or "",
            "submission_date": sub.submission_date.strftime("%Y-%m-%d") if sub.submission_date else "",
            "is_first_submission": sub.is_first_submission,
            "result": sub.result or "",
            "expected_return_date": sub.expected_return_date.strftime("%Y-%m-%d") if sub.expected_return_date else "",
            "receipt_photo_url": sub.receipt_photo_url or "",
            "received_by": sub.received_by or "",
            "note": sub.note or "",
            "gov_status": sub.gov_status or "Đã nộp",
            "created_at": sub.created_at.isoformat() if sub.created_at else None,
        })
    return {"status": "success", "data": result}


@router.get("/{submission_id}")
def get_submission_details(
    submission_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submissions", "read")),
):
    """getDetails endpoint: returns full task_submissions table record + related task/contract/customer objects."""
    sub = db.query(TaskSubmission).filter(TaskSubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Không tìm thấy lượt nộp hồ sơ pháp lý.")

    task = None
    contract = None
    customer = None
    assignee_name = "Chưa phân công"

    if sub.task_id:
        task_row = db.query(ProjectTask).filter(ProjectTask.id == sub.task_id).first()
        if task_row:
            task = {
                "id": task_row.id,
                "contract_id": task_row.contract_id,
                "department": task_row.department or "",
                "assignee_id": task_row.assignee_id,
                "status": task_row.status or "",
                "ward": task_row.ward or "",
                "priority": task_row.priority or "Trung bình",
                "deadline": task_row.deadline.strftime("%Y-%m-%d") if task_row.deadline else None,
            }
            if task_row.assignee_id:
                u_emp = (
                    db.query(User, Employee)
                    .outerjoin(Employee, Employee.user_id == User.id)
                    .filter(User.id == task_row.assignee_id)
                    .first()
                )
                if u_emp:
                    u, e = u_emp
                    assignee_name = e.full_name if (e and e.full_name) else u.username

            if task_row.contract_id:
                c_row = db.query(Contract).filter(Contract.id == task_row.contract_id).first()
                if c_row:
                    contract = {
                        "id": c_row.id,
                        "service_type": c_row.service_type or "",
                        "customer_id": c_row.customer_id,
                    }
                    if c_row.customer_id:
                        cust_row = db.query(Customer).filter(Customer.id == c_row.customer_id).first()
                        if cust_row:
                            customer = {
                                "id": cust_row.id,
                                "full_name": cust_row.full_name or "",
                                "phone": cust_row.phone or "",
                                "address": cust_row.address or "",
                            }

    return {
        "status": "success",
        "data": {
            "id": sub.id,
            "task_id": sub.task_id,
            "receipt_code": sub.receipt_code or "",
            "submitted_by": sub.submitted_by or "",
            "submission_date": sub.submission_date.strftime("%Y-%m-%d") if sub.submission_date else None,
            "is_first_submission": sub.is_first_submission,
            "result": sub.result or "",
            "expected_return_date": sub.expected_return_date.strftime("%Y-%m-%d") if sub.expected_return_date else None,
            "receipt_photo_url": sub.receipt_photo_url or "",
            "received_by": sub.received_by or "",
            "note": sub.note or "",
            "gov_status": sub.gov_status or "Đã nộp",
            "created_at": sub.created_at.isoformat() if sub.created_at else None,
            "assignee_name": assignee_name,
            "task": task,
            "contract": contract,
            "customer": customer,
        },
    }


@router.post("/")
def create_legal_submission(
    payload: LegalSubmissionCreateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submissions", "create")),
):
    """create endpoint: insert new TaskSubmission entry."""
    task = db.query(ProjectTask).filter(ProjectTask.id == payload.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy mã hồ sơ: {payload.task_id}")

    sub_date = None
    if payload.submission_date:
        try:
            sub_date = datetime.strptime(payload.submission_date, "%Y-%m-%d").date()
        except ValueError:
            pass
    if not sub_date:
        sub_date = date.today()

    exp_date = None
    if payload.expected_return_date:
        try:
            exp_date = datetime.strptime(payload.expected_return_date, "%Y-%m-%d").date()
        except ValueError:
            pass

    r_code = payload.receipt_code
    if not r_code:
        r_code = f"BN-{date.today().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    new_sub = TaskSubmission(
        id=f"sub_{uuid.uuid4().hex[:12]}",
        task_id=payload.task_id,
        receipt_code=r_code,
        submitted_by=payload.submitted_by or user.username,
        submission_date=sub_date,
        is_first_submission=payload.is_first_submission,
        expected_return_date=exp_date,
        receipt_photo_url=payload.receipt_photo_url,
        received_by=payload.received_by,
        gov_status=payload.gov_status or "Đã nộp",
        note=payload.note,
    )
    db.add(new_sub)

    # Optionally update task status to "Đã nộp" if currently "Mới tiếp nhận"
    if task.status in (None, "", "Mới tiếp nhận"):
        task.status = "Nộp thành công - Chờ kết quả"

    db.add(AuditLog(
        actor_id=user.id,
        action="CREATE_LEGAL_SUBMISSION",
        object_type="task_submissions",
        payload_json={"submission_id": new_sub.id, "task_id": payload.task_id, "receipt_code": r_code}
    ))

    db.commit()
    return {
        "status": "success",
        "id": new_sub.id,
        "receipt_code": r_code,
        "message": "Đã tạo lượt nộp hồ sơ pháp lý thành công."
    }


@router.put("/{submission_id}")
def update_legal_submission_full(
    submission_id: str,
    payload: LegalSubmissionUpdateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submissions", "update")),
):
    """Full update endpoint for a legal submission."""
    sub = db.query(TaskSubmission).filter(TaskSubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Không tìm thấy lượt nộp hồ sơ pháp lý.")

    if payload.receipt_code is not None:
        sub.receipt_code = payload.receipt_code
    if payload.submitted_by is not None:
        sub.submitted_by = payload.submitted_by
    if payload.submission_date is not None:
        try:
            sub.submission_date = datetime.strptime(payload.submission_date, "%Y-%m-%d").date()
        except ValueError:
            pass
    if payload.is_first_submission is not None:
        sub.is_first_submission = payload.is_first_submission
    if payload.expected_return_date is not None:
        try:
            sub.expected_return_date = datetime.strptime(payload.expected_return_date, "%Y-%m-%d").date()
        except ValueError:
            pass
    if payload.receipt_photo_url is not None:
        sub.receipt_photo_url = payload.receipt_photo_url
    if payload.received_by is not None:
        sub.received_by = payload.received_by
    if payload.gov_status is not None:
        sub.gov_status = payload.gov_status
    if payload.note is not None:
        sub.note = payload.note

    db.add(AuditLog(
        actor_id=user.id,
        action="UPDATE_LEGAL_SUBMISSION",
        object_type="task_submissions",
        payload_json={"submission_id": submission_id, "updated_fields": payload.model_dump(exclude_unset=True)}
    ))

    db.commit()
    return {"status": "success", "message": "Đã cập nhật lượt nộp hồ sơ pháp lý."}


@router.patch("/{submission_id}/gov-status")
def update_gov_status(
    submission_id: str,
    payload: GovStatusUpdateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submissions", "update")),
):
    """Granular sub-endpoint 1: Update gov_status."""
    sub = db.query(TaskSubmission).filter(TaskSubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Không tìm thấy lượt nộp hồ sơ pháp lý.")

    old_status = sub.gov_status
    sub.gov_status = payload.gov_status

    db.add(AuditLog(
        actor_id=user.id,
        action="UPDATE_GOV_STATUS",
        object_type="task_submissions",
        payload_json={"submission_id": submission_id, "old": old_status, "new": payload.gov_status}
    ))

    db.commit()
    return {
        "status": "success",
        "data": {
            "submission_id": submission_id,
            "gov_status": sub.gov_status,
        },
        "message": "Đã cập nhật trạng thái cơ quan nhà nước thành công."
    }


@router.patch("/{submission_id}/photo")
def update_receipt_photo(
    submission_id: str,
    payload: PhotoUpdateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submissions", "update")),
):
    """Granular sub-endpoint 2: Update receipt_photo_url."""
    sub = db.query(TaskSubmission).filter(TaskSubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Không tìm thấy lượt nộp hồ sơ pháp lý.")

    sub.receipt_photo_url = payload.receipt_photo_url

    db.add(AuditLog(
        actor_id=user.id,
        action="UPDATE_RECEIPT_PHOTO",
        object_type="task_submissions",
        payload_json={"submission_id": submission_id, "photo_url": payload.receipt_photo_url}
    ))

    db.commit()
    return {
        "status": "success",
        "data": {
            "submission_id": submission_id,
            "receipt_photo_url": sub.receipt_photo_url,
        },
        "message": "Đã cập nhật ảnh biên nhận thành công."
    }


@router.patch("/{submission_id}/note")
def update_submission_note(
    submission_id: str,
    payload: NoteUpdateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submissions", "update")),
):
    """Granular sub-endpoint 3: Update note."""
    sub = db.query(TaskSubmission).filter(TaskSubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Không tìm thấy lượt nộp hồ sơ pháp lý.")

    sub.note = payload.note

    db.add(AuditLog(
        actor_id=user.id,
        action="UPDATE_SUBMISSION_NOTE",
        object_type="task_submissions",
        payload_json={"submission_id": submission_id, "note": payload.note}
    ))

    db.commit()
    return {
        "status": "success",
        "data": {
            "submission_id": submission_id,
            "note": sub.note,
        },
        "message": "Đã cập nhật ghi chú thành công."
    }


@router.delete("/{submission_id}")
def delete_legal_submission(
    submission_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submissions", "delete")),
):
    """Delete a legal submission entry."""
    sub = db.query(TaskSubmission).filter(TaskSubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Không tìm thấy lượt nộp hồ sơ pháp lý.")

    db.delete(sub)
    db.add(AuditLog(
        actor_id=user.id,
        action="DELETE_LEGAL_SUBMISSION",
        object_type="task_submissions",
        payload_json={"submission_id": submission_id}
    ))

    db.commit()
    return {"status": "success", "message": "Đã xóa lượt nộp hồ sơ pháp lý thành công."}
