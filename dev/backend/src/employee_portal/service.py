from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session

from src.db.models import (
    Attendance,
    Department,
    Employee,
    KpiPayroll,
    LeaveRecord,
    ProjectTask,
    User,
)


def _date_value(value):
    return value.isoformat() if value else None


def _number_value(value):
    return float(value) if isinstance(value, Decimal) else value


class EmployeePortalService:
    @staticmethod
    def build_profile(db: Session, employee: Employee) -> dict:
        department = None
        if employee.department_id:
            department = db.query(Department).filter(Department.id == employee.department_id).first()
        user = db.query(User).filter(User.id == employee.user_id).first()
        tasks = (
            db.query(ProjectTask)
            .filter(
                or_(
                    ProjectTask.assignee_id == employee.user_id,
                    ProjectTask.support_id == employee.user_id,
                )
            )
            .order_by(ProjectTask.deadline.asc().nulls_last(), ProjectTask.updated_at.desc())
            .all()
        )
        leave_records = (
            db.query(LeaveRecord)
            .filter(LeaveRecord.employee_id == employee.id)
            .order_by(LeaveRecord.start_date.desc().nulls_last())
            .all()
        )
        attendance = (
            db.query(Attendance)
            .filter(Attendance.employee_id == employee.id)
            .order_by(Attendance.date.desc().nulls_last())
            .all()
        )
        latest_payroll = (
            db.query(KpiPayroll)
            .filter(KpiPayroll.employee_id == employee.id)
            .order_by(KpiPayroll.month.desc().nulls_last())
            .first()
        )

        return {
            "employee": {
                "id": employee.id,
                "full_name": employee.full_name,
                "department": department.name if department else employee.department,
                "job_title": employee.job_title,
                "email": user.email if user else None,
                "join_date": _date_value(employee.join_date),
                "base_salary": _number_value(employee.base_salary or 0),
                "is_active": bool(employee.is_active),
            },
            "tasks": [
                {
                    "id": task.id,
                    "task_name": task.task_name,
                    "department": task.department,
                    "priority": task.priority,
                    "deadline": _date_value(task.deadline),
                    "status": task.status,
                    "start_date": _date_value(task.start_date),
                    "completion_date": _date_value(task.completion_date),
                }
                for task in tasks
            ],
            "leave_records": [
                {
                    "id": leave.id,
                    "leave_type": leave.leave_type,
                    "start_date": _date_value(leave.start_date),
                    "end_date": _date_value(leave.end_date),
                    "status": leave.status,
                    "deduction_amount": _number_value(leave.deduction_amount),
                }
                for leave in leave_records
            ],
            "attendance": [
                {
                    "id": record.id,
                    "date": _date_value(record.date),
                    "check_in": _date_value(record.check_in),
                    "check_out": _date_value(record.check_out),
                    "status": record.status,
                }
                for record in attendance
            ],
            "latest_payroll": (
                {
                    "month": _date_value(latest_payroll.month),
                    "tasks_completed": latest_payroll.tasks_completed,
                    "kpi_score": _number_value(latest_payroll.kpi_score),
                    "bonus": _number_value(latest_payroll.bonus),
                    "total_salary": _number_value(latest_payroll.total_salary),
                }
                if latest_payroll
                else None
            ),
        }
