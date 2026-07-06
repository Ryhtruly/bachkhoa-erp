from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import Date, cast, extract, func, or_, text
from sqlalchemy.orm import Session, aliased
from src.db.database import get_db
from src.db.models import (
    AuditLog,
    Contract,
    Customer,
    Department,
    Employee,
    ProjectTask,
    User,
)
import uuid
from datetime import datetime, date
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/hoso", tags=["Hồ Sơ"])


FINAL_STATUSES = ("Hoàn thành", "Hủy", "Đã hủy")


def _month_filter(query, month: Optional[str]):
    if not month:
        return query
    try:
        year, month_number = map(int, month.split("-"))
    except (TypeError, ValueError):
        return query

    business_date = func.coalesce(
        ProjectTask.start_date,
        cast(ProjectTask.created_at, Date),
    )
    return query.filter(
        extract("year", business_date) == year,
        extract("month", business_date) == month_number,
    )


def _task_result(task: ProjectTask) -> str:
    status = (task.status or "").strip()
    if status == "Hoàn thành":
        return "Hoàn thành"
    if status in ("Hủy", "Đã hủy"):
        return "Đã hủy"
    if status == "Nộp thành công - Chờ kết quả":
        return "Đã nộp"
    return status or "Chưa cập nhật"


@router.get("/stats")
def get_hoso_stats(month: str = Query(None), db: Session = Depends(get_db)):
    query = _month_filter(db.query(ProjectTask), month)

    total = query.count()
    completed = query.filter(ProjectTask.status == "Hoàn thành").count()
    in_progress = query.filter(
        or_(ProjectTask.status.is_(None), ProjectTask.status.notin_(FINAL_STATUSES))
    ).count()
    
    today = date.today()
    overdue = query.filter(
        or_(ProjectTask.status.is_(None), ProjectTask.status.notin_(FINAL_STATUSES)),
        ProjectTask.deadline < today
    ).count()

    return {
        "status": "success",
        "data": {
            "total": total,
            "completed": completed,
            "in_progress": in_progress,
            "overdue": overdue
        }
    }

@router.get("/")
def list_hoso(month: str = Query(None), db: Session = Depends(get_db)):
    try:
        main_user = aliased(User)
        support_user = aliased(User)
        main_employee = aliased(Employee)
        support_employee = aliased(Employee)

        query = (
            db.query(
                ProjectTask,
                Contract,
                Customer,
                main_user,
                main_employee,
                support_user,
                support_employee,
            )
            .outerjoin(Contract, Contract.id == ProjectTask.contract_id)
            .outerjoin(Customer, Customer.id == Contract.customer_id)
            .outerjoin(main_user, main_user.id == ProjectTask.assignee_id)
            .outerjoin(main_employee, main_employee.user_id == main_user.id)
            .outerjoin(support_user, support_user.id == ProjectTask.support_id)
            .outerjoin(support_employee, support_employee.user_id == support_user.id)
        )
        query = _month_filter(query, month)
        tasks = query.order_by(
            ProjectTask.start_date.desc().nullslast(),
            ProjectTask.created_at.desc(),
        ).all()
        stake_rates = db.execute(
            text(
                """
                select stake_type, rate_per_unit, effective_from, effective_to
                from stake_rates
                order by effective_from desc
                """
            )
        ).mappings().all()
        result = []
        today = date.today()
        
        for t, contract, customer, assignee, assignee_employee, support, support_employee_row in tasks:
            days_left = None
            warning = "Chưa có deadline"
            if t.deadline:
                days_left = (t.deadline - today).days
                if t.status == "Hoàn thành":
                    warning = "Hoàn thành"
                elif days_left < 0:
                    warning = "Trễ hạn"
                elif days_left <= 2:
                    warning = "Sắp đến hạn"
                else:
                    warning = "Trong hạn"

            stake_rate = 0
            stake_on_date = t.start_date or today
            if t.stake_type:
                for rate_row in stake_rates:
                    if (
                        rate_row["stake_type"] == t.stake_type
                        and rate_row["effective_from"] <= stake_on_date
                        and (
                            rate_row["effective_to"] is None
                            or rate_row["effective_to"] > stake_on_date
                        )
                    ):
                        stake_rate = float(rate_row["rate_per_unit"] or 0)
                        break
            stake_allowance = float(t.stake_count or 0) * stake_rate
            
            result.append({
                "Mã hồ sơ": t.id,
                "Tên khách hàng": customer.full_name if customer else "Khách vãng lai",
                "SĐT": customer.phone if customer else "",
                "Khu vực/Phường": t.ward or (customer.address if customer else ""),
                "Loại dịch vụ": t.task_name or (contract.service_type if contract else "N/A"),
                "Mã hợp đồng": t.contract_id,
                "Phòng ban": getattr(t, 'department', '') or 'Chưa phân phòng',
                "Phòng ban ID": t.department_id,
                "Ưu tiên": getattr(t, 'priority', None) or 'Trung bình',
                "Phụ trách chính": (
                    assignee_employee.full_name
                    if assignee_employee and assignee_employee.full_name
                    else (assignee.username if assignee else "Chưa phân công")
                ),
                "Phụ trách chính ID": t.assignee_id,
                "Phụ đo": (
                    support_employee_row.full_name
                    if support_employee_row and support_employee_row.full_name
                    else (support.username if support else "")
                ),
                "Phụ đo ID": t.support_id,
                "Ngày giao": t.start_date.strftime("%Y-%m-%d") if t.start_date else "",
                "Ngày đo": t.start_date.strftime("%Y-%m-%d") if t.start_date else "",
                "Deadline": t.deadline.strftime("%Y-%m-%d") if t.deadline else "",
                "Số ngày còn lại": days_left,
                "Cảnh báo": warning,
                "Quá hạn?": bool(
                    t.deadline
                    and t.deadline < today
                    and t.status not in FINAL_STATUSES
                ),
                "Trạng thái": t.status or "Mới tiếp nhận",
                "Trạng thái đo": t.status or "Mới tiếp nhận",
                "Kết quả": _task_result(t),
                "Kết quả hiện trường": _task_result(t),
                "Phụ cấp": stake_allowance,
                "Đơn giá phụ cấp": stake_rate,
                "Số cọc": t.stake_count,
                "Loại cọc": t.stake_type or "",
                "Ngày hoàn thành": (
                    t.completion_date.strftime("%Y-%m-%d")
                    if t.completion_date
                    else ""
                ),
                "Ghi chú": t.review_note or "",
                "Ngày tạo": t.created_at.strftime("%Y-%m-%d") if t.created_at else "",
            })
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/assignment-options")
def assignment_options(db: Session = Depends(get_db)):
    employee_rows = (
        db.query(Employee, User, Department)
        .join(User, User.id == Employee.user_id)
        .outerjoin(Department, Department.id == Employee.department_id)
        .filter(Employee.is_active.is_(True), User.is_active.is_(True))
        .order_by(Employee.full_name.asc())
        .all()
    )

    open_main = dict(
        db.query(ProjectTask.assignee_id, func.count(ProjectTask.id))
        .filter(
            ProjectTask.assignee_id.isnot(None),
            or_(ProjectTask.status.is_(None), ProjectTask.status.notin_(FINAL_STATUSES)),
        )
        .group_by(ProjectTask.assignee_id)
        .all()
    )
    open_support = dict(
        db.query(ProjectTask.support_id, func.count(ProjectTask.id))
        .filter(
            ProjectTask.support_id.isnot(None),
            or_(ProjectTask.status.is_(None), ProjectTask.status.notin_(FINAL_STATUSES)),
        )
        .group_by(ProjectTask.support_id)
        .all()
    )

    main_experience = {}
    for user_id, service, count in (
        db.query(ProjectTask.assignee_id, ProjectTask.task_name, func.count(ProjectTask.id))
        .filter(
            ProjectTask.assignee_id.isnot(None),
            ProjectTask.task_name.isnot(None),
            ProjectTask.status == "Hoàn thành",
        )
        .group_by(ProjectTask.assignee_id, ProjectTask.task_name)
        .all()
    ):
        main_experience.setdefault(user_id, {})[service] = count

    support_experience = {}
    for user_id, service, count in (
        db.query(ProjectTask.support_id, ProjectTask.task_name, func.count(ProjectTask.id))
        .filter(
            ProjectTask.support_id.isnot(None),
            ProjectTask.task_name.isnot(None),
            ProjectTask.status == "Hoàn thành",
        )
        .group_by(ProjectTask.support_id, ProjectTask.task_name)
        .all()
    ):
        support_experience.setdefault(user_id, {})[service] = count

    return {
        "status": "success",
        "data": [
            {
                "user_id": user.id,
                "employee_id": employee.id,
                "full_name": employee.full_name or user.username,
                "department_id": employee.department_id,
                "department": department.name if department else (employee.department or ""),
                "open_main_tasks": int(open_main.get(user.id, 0)),
                "open_support_tasks": int(open_support.get(user.id, 0)),
                "main_experience": main_experience.get(user.id, {}),
                "support_experience": support_experience.get(user.id, {}),
            }
            for employee, user, department in employee_rows
        ],
    }


class AssignmentUpdateSchema(BaseModel):
    task_id: str
    assignee_id: Optional[str] = None
    support_id: Optional[str] = None


def _validate_assignment_user(
    db: Session,
    user_id: Optional[str],
    role_label: str,
) -> Optional[tuple[User, Employee]]:
    if not user_id:
        return None
    row = (
        db.query(User, Employee)
        .join(Employee, Employee.user_id == User.id)
        .filter(
            User.id == user_id,
            User.is_active.is_(True),
            Employee.is_active.is_(True),
        )
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=422,
            detail=f"{role_label} không phải nhân sự đang hoạt động.",
        )
    return row


def _role_has_pay_record(
    db: Session,
    task_id: str,
    role: str,
    new_user_id: Optional[str],
) -> bool:
    return bool(
        db.execute(
            text(
                """
                select 1
                from task_pay_records tpr
                join employees e on e.id = tpr.employee_id
                where tpr.task_id = :task_id
                  and tpr.role = :role
                  and e.user_id is distinct from :new_user_id
                limit 1
                """
            ),
            {
                "task_id": task_id,
                "role": role,
                "new_user_id": new_user_id,
            },
        ).scalar()
    )


@router.post("/update-assignment")
def update_assignment(payload: AssignmentUpdateSchema, db: Session = Depends(get_db)):
    task = db.query(ProjectTask).filter(ProjectTask.id == payload.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ.")
    if payload.assignee_id and payload.assignee_id == payload.support_id:
        raise HTTPException(
            status_code=422,
            detail="Người phụ trách chính và phụ đo phải là hai người khác nhau.",
        )

    main_row = _validate_assignment_user(
        db, payload.assignee_id, "Người phụ trách chính"
    )
    support_row = _validate_assignment_user(db, payload.support_id, "Người phụ đo")

    if _role_has_pay_record(db, task.id, "main", payload.assignee_id):
        raise HTTPException(
            status_code=409,
            detail="Lương vai trò chính của task đã được ghi nhận; không thể đổi người.",
        )
    if _role_has_pay_record(db, task.id, "support", payload.support_id):
        raise HTTPException(
            status_code=409,
            detail="Lương phụ đo của task đã được ghi nhận; không thể đổi người.",
        )

    old_assignment = {
        "assignee_id": task.assignee_id,
        "support_id": task.support_id,
    }
    task.assignee_id = payload.assignee_id
    task.support_id = payload.support_id
    db.add(
        AuditLog(
            actor_id=None,
            action="UPDATE_TASK_ASSIGNMENT",
            object_type="projects_tasks",
            payload_json={
                "task_id": task.id,
                "old": old_assignment,
                "new": {
                    "assignee_id": payload.assignee_id,
                    "support_id": payload.support_id,
                },
            },
        )
    )
    db.commit()

    main_name = (
        main_row[1].full_name or main_row[0].username if main_row else "Chưa phân công"
    )
    support_name = (
        support_row[1].full_name or support_row[0].username if support_row else ""
    )
    return {
        "status": "success",
        "data": {
            "task_id": task.id,
            "assignee_id": task.assignee_id,
            "assignee_name": main_name,
            "support_id": task.support_id,
            "support_name": support_name,
        },
    }


class HosoCreateSchema(BaseModel):
    Loại_dịch_vụ: str
    Deadline: str
    Trạng_thái: str = "Trong hạn"

class StatusUpdateSchema(BaseModel):
    Mã_hồ_sơ: str
    Trạng_thái: str

@router.post("/")
def create_hoso(payload: HosoCreateSchema, db: Session = Depends(get_db)):
    try:
        new_id = f"BK-HS-{str(uuid.uuid4())[:8].upper()}"
        try:
            d_dl = datetime.strptime(payload.Deadline, "%Y-%m-%d").date()
        except:
            d_dl = None
            
        t = ProjectTask(
            id=new_id,
            task_name=payload.Loại_dịch_vụ,
            deadline=d_dl,
            status=payload.Trạng_thái or "Mới tiếp nhận",
            priority="Cao"
        )
        db.add(t)
        db.commit()
        return {"status": "success", "id": new_id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/update-status")
def update_hoso_status(payload: StatusUpdateSchema, db: Session = Depends(get_db)):
    try:
        task = db.query(ProjectTask).filter(ProjectTask.id == payload.Mã_hồ_sơ).first()
        if not task:
            raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ")
            
        task.status = payload.Trạng_thái
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
