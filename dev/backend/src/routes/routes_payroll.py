from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.models import (
    Contract,
    Customer,
    Department,
    Employee,
    PayrollAdjustment,
    PayrollPeriod,
    ProjectTask,
    TaskPayRecord,
    TaskSubmission,
    TaskType,
    TaskTypeRate,
)


router = APIRouter(prefix="/api/payroll", tags=["Lương khoán"])

ZERO = Decimal("0")
FINAL_CANCELLED_STATUSES = {"Hủy", "Đã hủy"}
WAITING_STATUSES = {
    "Đợi xử lý",
    "Đã nộp",
    "Nộp thành công - Chờ kết quả",
}
COMPLETED_STATUSES = {"Hoàn thành"}


class CloseEmployeePeriodPayload(BaseModel):
    employee_id: str
    year: int
    month: int


def _period_date(year: int, month: int) -> date:
    try:
        return date(year, month, 1)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Năm hoặc tháng không hợp lệ.") from exc


def _money(value) -> Decimal:
    return Decimal(str(value or 0))


def _rate_for(
    rates_by_type: dict[str, list[TaskTypeRate]],
    task_type_id: Optional[str],
    role: str,
    earned_on: date,
) -> Optional[Decimal]:
    if not task_type_id:
        return None
    for rate in rates_by_type.get(task_type_id, []):
        if (
            rate.role == role
            and rate.effective_from <= earned_on
            and (rate.effective_to is None or rate.effective_to > earned_on)
        ):
            return _money(rate.rate)
    return None


def _stake_rate(stake_rates, stake_type: Optional[str], earned_on: date) -> Decimal:
    if not stake_type:
        return ZERO
    for rate in stake_rates:
        if (
            rate["stake_type"] == stake_type
            and rate["effective_from"] <= earned_on
            and (
                rate["effective_to"] is None
                or rate["effective_to"] > earned_on
            )
        ):
            return _money(rate["rate_per_unit"])
    return ZERO


def _net_amount(item: dict) -> Decimal:
    return (
        _money(item["base_rate"])
        + _money(item["stake_allowance"])
        + _money(item["cancellation_allowance"])
        + _money(item["priority_bonus"])
        - _money(item["penalty"])
    )


def _serialize_money(value) -> float:
    return float(_money(value))


def _load_rates(db: Session):
    all_rates = (
        db.query(TaskTypeRate)
        .order_by(TaskTypeRate.effective_from.desc())
        .all()
    )
    rates_by_type = {}
    for rate in all_rates:
        rates_by_type.setdefault(rate.task_type_id, []).append(rate)

    stake_rates = db.execute(
        text(
            """
            select stake_type, rate_per_unit, effective_from, effective_to
            from stake_rates
            order by effective_from desc
            """
        )
    ).mappings().all()
    return rates_by_type, stake_rates


def _first_submission_dates(db: Session, task_ids: list[str]) -> dict[str, date]:
    if not task_ids:
        return {}
    return dict(
        db.query(
            TaskSubmission.task_id,
            func.min(TaskSubmission.submission_date),
        )
        .filter(
            TaskSubmission.task_id.in_(task_ids),
            TaskSubmission.is_first_submission.is_(True),
        )
        .group_by(TaskSubmission.task_id)
        .all()
    )


def _resolve_payroll_event(
    task: ProjectTask,
    first_submission: Optional[date],
    include_provisional: bool = True,
):
    is_completed = task.status in COMPLETED_STATUSES or task.completion_date is not None
    if is_completed:
        if first_submission:
            return first_submission, "Chờ ghi nhận từ lần nộp đầu", True
        if task.completion_date:
            return task.completion_date, "Chờ ghi nhận từ ngày hoàn thành", True
        if task.start_date:
            return task.start_date, "Chờ ghi nhận từ ngày đo/giao (thiếu ngày hoàn thành)", True
        if task.created_at:
            return task.created_at.date(), "Chờ ghi nhận từ ngày tạo hồ sơ (thiếu ngày hoàn thành)", True

    if not include_provisional:
        return None, "", False
    if task.start_date:
        return task.start_date, "Tạm tính từ ngày đo/giao", False
    if task.created_at:
        return task.created_at.date(), "Tạm tính từ ngày tạo hồ sơ", False
    return None, "", False


def _task_roles_for_employee(task: ProjectTask, user_id: Optional[str]) -> list[str]:
    roles = []
    if not user_id:
        return roles
    if task.assignee_id == user_id:
        roles.append("main")
    if task.support_id == user_id:
        roles.append("support")
    return roles


def _pay_components(
    task: ProjectTask,
    role: str,
    earned_on: date,
    rates_by_type: dict[str, list[TaskTypeRate]],
    stake_rates,
):
    note_text = (task.review_note or "").strip()
    cancelled = task.status in FINAL_CANCELLED_STATUSES
    waiting = task.status in WAITING_STATUSES
    personnel_error = "lỗi nhân sự" in note_text.casefold()
    rate = _rate_for(rates_by_type, task.task_type_id, role, earned_on)
    missing_rate = rate is None
    if rate is None:
        rate = ZERO

    base_rate = ZERO if cancelled or personnel_error else rate
    cancellation_allowance = Decimal("200000") if cancelled else ZERO
    priority_bonus = (
        Decimal("300000")
        if task.priority == "Cao" and role == "main"
        else (
            Decimal("100000")
            if task.priority == "Cao" and role == "support"
            else ZERO
        )
    )
    penalty = Decimal("300000") if personnel_error else ZERO
    stake_allowance = ZERO
    if role == "main" and task.stake_count:
        stake_allowance = (
            Decimal(task.stake_count)
            * _stake_rate(stake_rates, task.stake_type, earned_on)
        )

    return {
        "base_rate": base_rate,
        "stake_allowance": stake_allowance,
        "cancellation_allowance": cancellation_allowance,
        "priority_bonus": priority_bonus,
        "penalty": penalty,
        "note": note_text,
        "missing_rate": missing_rate,
    }


@router.get("/options")
def payroll_options(db: Session = Depends(get_db)):
    rows = (
        db.query(Department, Employee)
        .outerjoin(
            Employee,
            (Employee.department_id == Department.id)
            & Employee.is_active.is_(True),
        )
        .filter(Department.is_active.is_(True))
        .order_by(Department.display_order.asc(), Employee.full_name.asc())
        .all()
    )

    departments = {}
    for department, employee in rows:
        item = departments.setdefault(
            department.id,
            {
                "id": department.id,
                "code": department.code,
                "name": department.name,
                "employees": [],
            },
        )
        if employee:
            item["employees"].append(
                {
                    "id": employee.id,
                    "user_id": employee.user_id,
                    "full_name": employee.full_name,
                    "job_title": employee.job_title,
                }
            )

    period_values = set()
    for (value,) in db.query(TaskPayRecord.payroll_month).distinct().all():
        if value:
            period_values.add(value.replace(day=1))
    for (value,) in (
        db.query(ProjectTask.completion_date)
        .filter(ProjectTask.completion_date.isnot(None))
        .distinct()
        .all()
    ):
        if value:
            period_values.add(value.replace(day=1))
    for (value,) in (
        db.query(ProjectTask.start_date)
        .filter(ProjectTask.start_date.isnot(None))
        .distinct()
        .all()
    ):
        if value:
            period_values.add(value.replace(day=1))
    for (value,) in (
        db.query(TaskSubmission.submission_date)
        .filter(TaskSubmission.is_first_submission.is_(True))
        .distinct()
        .all()
    ):
        if value:
            period_values.add(value.replace(day=1))

    default_period = max(period_values) if period_values else date.today().replace(day=1)
    years = sorted({value.year for value in period_values} | {date.today().year}, reverse=True)

    return {
        "status": "success",
        "data": {
            "departments": list(departments.values()),
            "years": years,
            "default_year": default_period.year,
            "default_month": default_period.month,
        },
    }


@router.get("/employee-ledger")
def employee_payroll_ledger(
    employee_id: str = Query(...),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    period = _period_date(year, month)
    employee = (
        db.query(Employee, Department)
        .outerjoin(Department, Department.id == Employee.department_id)
        .filter(Employee.id == employee_id)
        .first()
    )
    if not employee:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhân viên.")
    employee_row, department = employee

    persisted_rows = (
        db.query(TaskPayRecord, ProjectTask, TaskType, Contract, Customer)
        .join(ProjectTask, ProjectTask.id == TaskPayRecord.task_id)
        .outerjoin(TaskType, TaskType.id == ProjectTask.task_type_id)
        .outerjoin(Contract, Contract.id == ProjectTask.contract_id)
        .outerjoin(Customer, Customer.id == Contract.customer_id)
        .filter(
            TaskPayRecord.employee_id == employee_id,
            TaskPayRecord.payroll_month == period,
        )
        .all()
    )

    relevant_tasks = []
    if employee_row.user_id:
        relevant_tasks = (
            db.query(ProjectTask, TaskType, Contract, Customer)
            .outerjoin(TaskType, TaskType.id == ProjectTask.task_type_id)
            .outerjoin(Contract, Contract.id == ProjectTask.contract_id)
            .outerjoin(Customer, Customer.id == Contract.customer_id)
            .filter(
                or_(
                    ProjectTask.assignee_id == employee_row.user_id,
                    ProjectTask.support_id == employee_row.user_id,
                )
            )
            .all()
        )

    task_ids = [task.id for task, *_ in relevant_tasks]
    first_submission_dates = _first_submission_dates(db, task_ids)
    rates_by_type, stake_rates = _load_rates(db)

    recognized_keys = {
        (pay_record.task_id, pay_record.role)
        for pay_record, *_ in persisted_rows
    }
    details = []
    warnings = []

    for pay_record, task, task_type, contract, customer in persisted_rows:
        event_date = (
            first_submission_dates.get(task.id)
            or task.completion_date
            or pay_record.payroll_month
        )
        item = {
            "id": pay_record.id,
            "task_id": task.id,
            "contract_id": task.contract_id,
            "customer_name": customer.full_name if customer else "",
            "task_name": task_type.name if task_type else (task.task_name or ""),
            "role": pay_record.role,
            "event_date": event_date.isoformat() if event_date else None,
            "task_status": task.status or "",
            "base_rate": _serialize_money(pay_record.base_rate),
            "stake_allowance": _serialize_money(pay_record.stake_allowance),
            "cancellation_allowance": _serialize_money(
                pay_record.cancellation_allowance
            ),
            "priority_bonus": _serialize_money(pay_record.priority_bonus),
            "penalty": _serialize_money(pay_record.penalty),
            "payment_status": pay_record.payment_status,
            "is_recorded": True,
            "source": "Đã ghi nhận",
            "note": pay_record.note or "",
        }
        item["net_amount"] = _serialize_money(_net_amount(item))
        details.append(item)

    for task, task_type, contract, customer in relevant_tasks:
        earned_on, source, is_closable = _resolve_payroll_event(
            task,
            first_submission_dates.get(task.id),
        )
        if not earned_on:
            continue

        if earned_on.year != year or earned_on.month != month:
            continue

        role_assignments = _task_roles_for_employee(task, employee_row.user_id)

        for role in role_assignments:
            if (task.id, role) in recognized_keys:
                continue

            components = _pay_components(
                task,
                role,
                earned_on,
                rates_by_type,
                stake_rates,
            )
            if components["missing_rate"]:
                warnings.append(
                    f"{task.id} chưa có định mức {role} cho {task.task_name or 'công việc'}."
                )

            item = {
                "id": f"estimated:{task.id}:{role}",
                "task_id": task.id,
                "contract_id": task.contract_id,
                "customer_name": customer.full_name if customer else "",
                "task_name": task_type.name if task_type else (task.task_name or ""),
                "role": role,
                "event_date": earned_on.isoformat(),
                "task_status": task.status or "",
                "base_rate": _serialize_money(components["base_rate"]),
                "stake_allowance": _serialize_money(components["stake_allowance"]),
                "cancellation_allowance": _serialize_money(
                    components["cancellation_allowance"]
                ),
                "priority_bonus": _serialize_money(components["priority_bonus"]),
                "penalty": _serialize_money(components["penalty"]),
                "payment_status": "Chờ ghi nhận" if is_closable else "Tạm tính",
                "is_recorded": False,
                "is_closable": is_closable,
                "source": source,
                "note": components["note"],
            }
            item["net_amount"] = _serialize_money(_net_amount(item))
            details.append(item)

    adjustments = (
        db.query(PayrollAdjustment)
        .filter(
            PayrollAdjustment.employee_id == employee_id,
            PayrollAdjustment.payroll_month == period,
            PayrollAdjustment.status == "Approved",
        )
        .order_by(PayrollAdjustment.created_at.desc())
        .all()
    )
    adjustment_totals = {
        "bonus": ZERO,
        "penalty": ZERO,
        "allowance": ZERO,
        "referral_commission": ZERO,
        "holiday_bonus": ZERO,
    }
    adjustment_rows = []
    for adjustment in adjustments:
        amount = _money(adjustment.amount)
        adjustment_totals[adjustment.adjustment_type] += amount
        adjustment_rows.append(
            {
                "id": adjustment.id,
                "type": adjustment.adjustment_type,
                "amount": float(amount),
                "reason": adjustment.reason,
                "task_id": adjustment.task_id,
                "created_at": adjustment.created_at.isoformat()
                if adjustment.created_at
                else None,
            }
        )

    details.sort(
        key=lambda item: (item["event_date"] or "", item["task_id"], item["role"]),
        reverse=True,
    )
    main_items = [item for item in details if item["role"] == "main"]
    support_items = [item for item in details if item["role"] == "support"]
    main_amount = sum((_money(item["base_rate"]) for item in main_items), ZERO)
    support_amount = sum(
        (_money(item["base_rate"]) for item in support_items), ZERO
    )
    task_allowance = sum(
        (
            _money(item["stake_allowance"])
            + _money(item["cancellation_allowance"])
            for item in details
        ),
        ZERO,
    )
    task_bonus = sum((_money(item["priority_bonus"]) for item in details), ZERO)
    task_penalty = sum((_money(item["penalty"]) for item in details), ZERO)
    allowance = task_allowance + adjustment_totals["allowance"]
    bonus = (
        task_bonus
        + adjustment_totals["bonus"]
        + adjustment_totals["referral_commission"]
        + adjustment_totals["holiday_bonus"]
    )
    penalty = task_penalty + adjustment_totals["penalty"]
    base_salary = _money(employee_row.base_salary)
    gross_total = base_salary + main_amount + support_amount + allowance + bonus - penalty
    paid_total = sum(
        (
            _money(item["net_amount"])
            for item in details
            if item["is_recorded"] and item["payment_status"] == "Đã thanh toán"
        ),
        ZERO,
    )
    recorded_total = sum(
        (_money(item["net_amount"]) for item in details if item["is_recorded"]),
        ZERO,
    )
    estimated_total = sum(
        (_money(item["net_amount"]) for item in details if not item["is_recorded"]),
        ZERO,
    )
    pending_record_items = [
        item for item in details if item.get("is_closable") and not item["is_recorded"]
    ]
    provisional_items = [
        item for item in details if not item.get("is_closable") and not item["is_recorded"]
    ]

    payroll_period = (
        db.query(PayrollPeriod)
        .filter(PayrollPeriod.period_month == period)
        .first()
    )

    return {
        "status": "success",
        "data": {
            "employee": {
                "id": employee_row.id,
                "full_name": employee_row.full_name,
                "job_title": employee_row.job_title,
                "department_id": employee_row.department_id,
                "department": department.name if department else "",
                "base_salary": float(base_salary),
            },
            "period": period.isoformat(),
            "period_status": payroll_period.status if payroll_period else "Open",
            "summary": {
                "base_salary": float(base_salary),
                "main_task_count": len(main_items),
                "support_task_count": len(support_items),
                "piece_rate_main": float(main_amount),
                "piece_rate_support": float(support_amount),
                "allowance": float(allowance),
                "bonus": float(bonus),
                "penalty": float(penalty),
                "gross_total": float(gross_total),
                "recorded_total": float(recorded_total),
                "estimated_total": float(estimated_total),
                "pending_record_count": len(pending_record_items),
                "pending_record_total": float(
                    sum((_money(item["net_amount"]) for item in pending_record_items), ZERO)
                ),
                "provisional_count": len(provisional_items),
                "provisional_total": float(
                    sum((_money(item["net_amount"]) for item in provisional_items), ZERO)
                ),
                "paid_total": float(paid_total),
                "unpaid_total": float(max(gross_total - paid_total, ZERO)),
            },
            "details": details,
            "adjustments": adjustment_rows,
            "warnings": sorted(set(warnings)),
        },
    }


@router.post("/close-employee-period")
def close_employee_period(
    payload: CloseEmployeePeriodPayload,
    db: Session = Depends(get_db),
):
    period = _period_date(payload.year, payload.month)
    payroll_period = (
        db.query(PayrollPeriod)
        .filter(PayrollPeriod.period_month == period)
        .first()
    )
    if payroll_period and payroll_period.status in {"Locked", "Paid"}:
        raise HTTPException(
            status_code=409,
            detail="Kỳ lương đã khóa hoặc đã thanh toán, không thể chốt thêm.",
        )

    employee = db.query(Employee).filter(Employee.id == payload.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhân viên.")
    if not employee.user_id:
        raise HTTPException(status_code=422, detail="Nhân viên chưa liên kết user.")

    relevant_tasks = (
        db.query(ProjectTask)
        .filter(
            or_(
                ProjectTask.assignee_id == employee.user_id,
                ProjectTask.support_id == employee.user_id,
            )
        )
        .all()
    )
    task_ids = [task.id for task in relevant_tasks]
    first_submission_dates = _first_submission_dates(db, task_ids)
    rates_by_type, stake_rates = _load_rates(db)

    recognized_keys = set()
    if task_ids:
        recognized_keys = {
            (task_id, role)
            for task_id, role in (
                db.query(TaskPayRecord.task_id, TaskPayRecord.role)
                .filter(
                    TaskPayRecord.employee_id == payload.employee_id,
                    TaskPayRecord.task_id.in_(task_ids),
                )
                .all()
            )
        }

    created_records = []
    skipped_temporary = 0
    skipped_existing = 0
    skipped_other_period = 0
    warnings = []

    for task in relevant_tasks:
        earned_on, source, is_closable = _resolve_payroll_event(
            task,
            first_submission_dates.get(task.id),
            include_provisional=False,
        )
        if not earned_on or not is_closable:
            skipped_temporary += len(_task_roles_for_employee(task, employee.user_id))
            continue
        if earned_on.year != payload.year or earned_on.month != payload.month:
            skipped_other_period += len(_task_roles_for_employee(task, employee.user_id))
            continue

        for role in _task_roles_for_employee(task, employee.user_id):
            if (task.id, role) in recognized_keys:
                skipped_existing += 1
                continue

            components = _pay_components(
                task,
                role,
                earned_on,
                rates_by_type,
                stake_rates,
            )
            if components["missing_rate"]:
                warnings.append(
                    f"{task.id} chưa có định mức {role} cho {task.task_name or 'công việc'}."
                )

            record = TaskPayRecord(
                task_id=task.id,
                employee_id=payload.employee_id,
                role=role,
                payroll_month=period,
                base_rate=components["base_rate"],
                stake_allowance=components["stake_allowance"],
                cancellation_allowance=components["cancellation_allowance"],
                priority_bonus=components["priority_bonus"],
                penalty=components["penalty"],
                payment_status="Chưa thanh toán",
                note=f"{source}; ngày ghi nhận {earned_on.isoformat()}"
                + (f"; {components['note']}" if components["note"] else ""),
            )
            db.add(record)
            created_records.append(record)
            recognized_keys.add((task.id, role))

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Không chốt được lương: {exc}") from exc

    return {
        "status": "success",
        "data": {
            "created_count": len(created_records),
            "created_task_ids": [record.task_id for record in created_records],
            "skipped_existing": skipped_existing,
            "skipped_temporary": skipped_temporary,
            "skipped_other_period": skipped_other_period,
            "warnings": sorted(set(warnings)),
        },
    }
