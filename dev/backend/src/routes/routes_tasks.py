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
    ServiceLine,
    ServicePackage,
    TaskType,
    User,
)
from src.core.auth import require_permission, get_current_user
import uuid
from datetime import datetime, date
from pydantic import BaseModel
from typing import Optional

router = APIRouter(tags=["04. Tasks & Workflow Nodes"])


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
def get_task_stats(
    month: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("workflow", "read")),
):
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
def list_tasks(
    month: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("workflow", "read")),
):
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
                ServiceLine,
                ServicePackage,
                TaskType,
                main_user,
                main_employee,
                support_user,
                support_employee,
            )
            .outerjoin(Contract, Contract.id == ProjectTask.contract_id)
            .outerjoin(Customer, Customer.id == Contract.customer_id)
            .outerjoin(ServiceLine, ServiceLine.id == ProjectTask.service_line_id)
            .outerjoin(TaskType, TaskType.id == ProjectTask.task_type_id)
            .outerjoin(ServicePackage, ServicePackage.id == TaskType.service_package_id)
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
        try:
            stake_rates = db.execute(
                text(
                    """
                    select stake_type, rate_per_unit, effective_from, effective_to
                    from stake_rates
                    order by effective_from desc
                    """
                )
            ).mappings().all()
        except Exception:
            db.rollback()
            stake_rates = []
        result = []
        today = date.today()
        
        for t, contract, customer, service_line, service_package, task_type, assignee, assignee_employee, support, support_employee_row in tasks:
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
                "id": t.id,
                "service_line_id": service_line.id if service_line else "",
                "service_package": service_package.name if service_package else (service_line.service_package if service_line else ""),
                "service_package_id": service_package.id if service_package else (service_line.service_package_id if service_line else ""),
                "customer_name": customer.full_name if customer else "Guest Customer",
                "phone": customer.phone if customer else "",
                "ward": t.ward or (customer.address if customer else ""),
                "service_type": task_type.name if task_type else (t.task_name or (contract.service_type if contract else "N/A")),
                "contract_id": t.contract_id,
                "department": getattr(t, 'department', '') or 'Unassigned',
                "department_id": t.department_id,
                "priority": getattr(t, 'priority', None) or 'Medium',
                "assignee_name": (
                    assignee_employee.full_name
                    if assignee_employee and assignee_employee.full_name
                    else (assignee.username if assignee else "Unassigned")
                ),
                "assignee_id": t.assignee_id,
                "support_name": (
                    support_employee_row.full_name
                    if support_employee_row and support_employee_row.full_name
                    else (support.username if support else "")
                ),
                "support_id": t.support_id,
                "task_type_id": t.task_type_id or "",
                "task_name": t.task_name or "",
                "start_date": t.start_date.strftime("%Y-%m-%d") if t.start_date else "",
                "deadline": t.deadline.strftime("%Y-%m-%d") if t.deadline else "",
                "days_left": days_left,
                "warning": warning,
                "is_overdue": bool(
                    t.deadline
                    and t.deadline < today
                    and t.status not in FINAL_STATUSES
                ),
                "status": t.status or "New",
                "result": _task_result(t),
                "stake_allowance": stake_allowance,
                "stake_rate": stake_rate,
                "stake_count": t.stake_count,
                "stake_type": t.stake_type or "",
                "completion_date": (
                    t.completion_date.strftime("%Y-%m-%d")
                    if t.completion_date
                    else ""
                ),
                "review_note": t.review_note or "",
                "created_at": t.created_at.strftime("%Y-%m-%d") if t.created_at else "",
            })
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/assignment-options")
def assignment_options(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("workflow", "read")),
):
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
def update_assignment(
    payload: AssignmentUpdateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("task_node", "update"))
):
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
            actor_id=user.id,
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


@router.get("/task-types")
def list_task_types(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("workflow", "read")),
):
    types = (
        db.query(TaskType, ServicePackage)
        .join(ServicePackage, ServicePackage.id == TaskType.service_package_id)
        .filter(ServicePackage.is_active.is_(True))
        .order_by(ServicePackage.display_order, TaskType.name)
        .all()
    )
    return {
        "status": "success",
        "data": [
            {
                "id": task_type.id,
                "name": task_type.name,
                "service_package_id": package.id,
                "service_package_name": package.name,
            }
            for task_type, package in types
        ]
    }


@router.get("/contracts-lookup")
def lookup_contracts(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("workflow", "read")),
):
    """Return a lightweight list of contracts for the dropdown."""
    contracts = db.query(Contract, Customer, ServiceLine).outerjoin(Customer, Customer.id == Contract.customer_id).outerjoin(ServiceLine, ServiceLine.contract_id == Contract.id).order_by(Contract.created_at.desc()).all()
    by_contract = {}
    for c, cust, sl in contracts:
        entry = by_contract.setdefault(c.id, {
            "id": c.id,
            "customer_name": cust.full_name if cust else "Khách vãng lai",
            "service_type": c.service_type or "",
            "service_package_ids": [],
        })
        if sl and sl.service_package_id and sl.service_package_id not in entry["service_package_ids"]:
            entry["service_package_ids"].append(sl.service_package_id)

    result = []
    for entry in by_contract.values():
        package_ids = entry["service_package_ids"]
        entry["service_package_id"] = package_ids[0] if len(package_ids) == 1 else None
        result.append(entry)
    return {"status": "success", "data": result}

class TaskCreateSchema(BaseModel):
    contract_id: str
    service_package_id: str
    task_type_id: str
    task_name: str
    department_id: Optional[str] = None
    priority: str = "Trung bình"
    assignee_id: Optional[str] = None
    support_id: Optional[str] = None
    deadline: Optional[str] = None
    start_date: Optional[str] = None
    ward: Optional[str] = None
    stake_count: Optional[int] = None
    stake_type: Optional[str] = None
    status: str = "Mới tiếp nhận"
    review_note: Optional[str] = None

class TaskUpdateSchema(TaskCreateSchema):
    pass




def _resolve_task_package(db: Session, task_type_id: str, service_package_id: str):
    row = (
        db.query(TaskType, ServicePackage)
        .join(ServicePackage, ServicePackage.id == TaskType.service_package_id)
        .filter(
            TaskType.id == task_type_id,
            ServicePackage.id == service_package_id,
            ServicePackage.is_active.is_(True),
        )
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=422,
            detail="Hạng mục không thuộc gói dịch vụ đã chọn.",
        )
    return row


def _find_service_line_id(
    db: Session,
    contract_id: str,
    service_package_id: str,
    task_type_id: str,
) -> Optional[str]:
    exact = (
        db.query(ServiceLine.id)
        .filter(
            ServiceLine.contract_id == contract_id,
            ServiceLine.service_package_id == service_package_id,
            ServiceLine.task_type_id == task_type_id,
        )
        .first()
    )
    if exact:
        return exact[0]
    package_line = (
        db.query(ServiceLine.id)
        .filter(
            ServiceLine.contract_id == contract_id,
            ServiceLine.service_package_id == service_package_id,
        )
        .first()
    )
    return package_line[0] if package_line else None

class StatusUpdateSchema(BaseModel):
    task_id: str
    status: str


@router.post("/")
def create_task(
    payload: TaskCreateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("workflow", "create"))
):
    try:
        task_type, package = _resolve_task_package(
            db, payload.task_type_id, payload.service_package_id
        )
        new_id = f"BK-HS-{str(uuid.uuid4())[:8].upper()}"
        d_dl = None
        if payload.deadline:
            try:
                d_dl = datetime.strptime(payload.deadline, "%Y-%m-%d").date()
            except:
                pass
                
        d_start = date.today()
        if payload.start_date:
            try:
                d_start = datetime.strptime(payload.start_date, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(status_code=422, detail="Ngày giao không hợp lệ.")

        service_line_id = _find_service_line_id(
            db,
            payload.contract_id,
            package.id,
            task_type.id,
        )
        t = ProjectTask(
            id=new_id,
            contract_id=payload.contract_id,
            task_type_id=task_type.id,
            task_name=task_type.name,
            service_line_id=service_line_id,
            current_package=package.name,
            department_id=payload.department_id,
            priority=payload.priority,
            assignee_id=payload.assignee_id,
            support_id=payload.support_id,
            deadline=d_dl,
            stake_count=payload.stake_count,
            stake_type=payload.stake_type,
            status=payload.status,
            start_date=d_start,
            ward=payload.ward,
            review_note=payload.review_note,
        )
        db.add(t)

        db.add(AuditLog(
            actor_id=user.id,
            action="CREATE",
            object_type="projects_tasks",
            payload_json={
                "id": new_id,
                "task_type_id": task_type.id,
                "service_package_id": package.id,
            }
        ))

        db.commit()
        return {"status": "success", "id": new_id}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{task_id}")
def update_task_full(
    task_id: str,
    payload: TaskUpdateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("task_node", "update"))
):
    try:
        task_type, package = _resolve_task_package(
            db, payload.task_type_id, payload.service_package_id
        )
        task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ")
            
        d_dl = None
        if payload.deadline:
            try:
                d_dl = datetime.strptime(payload.deadline, "%Y-%m-%d").date()
            except:
                pass
                
        if task.assignee_id != payload.assignee_id and _role_has_pay_record(db, task.id, "main", payload.assignee_id):
             raise HTTPException(status_code=409, detail="Lương vai trò chính của task đã được ghi nhận; không thể đổi người.")
        if task.support_id != payload.support_id and _role_has_pay_record(db, task.id, "support", payload.support_id):
             raise HTTPException(status_code=409, detail="Lương phụ đo của task đã được ghi nhận; không thể đổi người.")
             
        if payload.status == "Hoàn thành" and task.status != "Hoàn thành":
            task.completion_date = date.today()
        elif payload.status != "Hoàn thành":
            task.completion_date = None

        d_start = task.start_date or date.today()
        if payload.start_date:
            try:
                d_start = datetime.strptime(payload.start_date, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(status_code=422, detail="Ngày giao không hợp lệ.")

        task.contract_id = payload.contract_id
        task.task_type_id = task_type.id
        task.task_name = task_type.name
        task.service_line_id = _find_service_line_id(
            db,
            payload.contract_id,
            package.id,
            task_type.id,
        )
        task.current_package = package.name
        task.department_id = payload.department_id
        task.priority = payload.priority
        task.assignee_id = payload.assignee_id
        task.support_id = payload.support_id
        task.deadline = d_dl
        task.stake_count = payload.stake_count
        task.stake_type = payload.stake_type
        task.status = payload.status
        task.start_date = d_start
        task.ward = payload.ward
        task.review_note = payload.review_note

        db.add(AuditLog(
            actor_id=user.id,
            action="UPDATE",
            object_type="projects_tasks",
            payload_json={"id": task_id, "status": payload.status}
        ))

        db.commit()
        return {"status": "success"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/update-status")
def update_task_status(
    payload: StatusUpdateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("task_node", "update"))
):
    try:
        task_id = payload.task_id
        status_val = payload.status
        
        task = db.query(ProjectTask).filter(ProjectTask.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
            
        task.status = status_val
        if status_val == "Hoàn thành":
            task.completion_date = date.today()

        db.add(AuditLog(
            actor_id=user.id,
            action="UPDATE_STATUS",
            object_type="projects_tasks",
        ))

        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
