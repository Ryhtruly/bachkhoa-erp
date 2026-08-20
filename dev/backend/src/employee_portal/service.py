import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from enum import StrEnum

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.core.redis_utils import get_cached_json, set_cached_json
from src.db.models import (
    Attendance,
    Department,
    Employee,
    LeaveRecord,
    User,
)

# Runtime execution/pay tables (task_nodes, task_node_assignments,
# work_pay_entitlements, employee_compensation_terms, employee_pay_adjustments)
# have no ORM models: the dynamic workflow schema is graph-driven and queried
# with raw SQL throughout src/contracts and src/finance. Mirrors the status
# values and period logic in FinanceRepository.list_payroll_formatted so the
# two payroll views can't silently disagree.
class ChecklistStatus(StrEnum):
    """Canonical checklist states stored in task_node_checklist_results.status."""

    NOT_STARTED = "pending"
    PENDING_APPROVAL = "pending_approval"
    LATE_PENDING_APPROVAL = "late_pending_approval"
    APPROVED = "approved"
    LATE_APPROVED = "late_approved"
    REJECTED = "failed"
    NOT_APPLICABLE = "not_applicable"


_TASKS_QUERY = text(
    """
    select n.id, n.node_key, n.node_code, n.occurrence_no,
           -- Tên và mô tả phải là thứ giám đốc đặt trong QUY TRÌNH này, không
           -- phải tên chung trong danh mục. Đặt tên bước là "Bàn giao kết quả"
           -- mà nhân viên vẫn thấy "Nhận kết quả & bàn giao" thì hai bên nói về
           -- cùng một việc bằng hai cái tên khác nhau.
           coalesce(
             nullif(coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->>'name', ''),
             wn.name
           ) as node_name,
           coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->>'description' as node_description,
           -- Cờ nghiệp vụ của bước — để màn nhân viên chỉ hiện panel đặc biệt đúng
           -- chỗ (bàn giao / hồ sơ nộp cơ quan), không bày nhầm lên mọi bước.
           coalesce((coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->>'is_handover')::boolean, false) as is_handover,
           coalesce((coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->>'requires_gov_submission')::boolean, false) as requires_gov_submission,
           n.status, n.outcome, n.started_at, n.deadline_at, n.is_overdue, n.completed_at,
           a.role_code, a.is_primary, wi.service_line_id, sl.contract_id, sl.priority
    from public.task_node_assignments a
    join public.task_nodes n on n.id = a.task_node_id
    join public.workflow_instances wi on wi.id = n.workflow_instance_id
    join public.service_lines sl on sl.id = wi.service_line_id
    join public.workflow_nodes wn on wn.code = n.node_code
    left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
    left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
    where a.employee_id = :employee_id
      and a.assignment_status not in ('replaced', 'declined')
    order by n.deadline_at asc nulls last, n.updated_at desc
    """
)

_TASK_ASSIGNEES_QUERY = text(
    """
    select a.task_node_id, e.id as employee_id, e.full_name, e.avatar_url,
           a.role_code, a.is_primary
    from public.task_node_assignments a
    join public.employees e on e.id = a.employee_id
    where a.task_node_id = any(:task_node_ids)
      and a.assignment_status not in ('replaced', 'declined', 'cancelled')
      and coalesce(e.is_active, true)
    order by a.task_node_id, a.is_primary desc, a.created_at asc
    """
)

_TASK_CHECKLIST_QUERY = text(
    """
    select id, task_node_id, checklist_key, checklist_name, is_required, status,
           require_evidence, approver_role, is_overdue, late_reason, submitted_at,
           evidence_data
    from public.task_node_checklist_results
    where task_node_id = any(:task_node_ids)
    order by checklist_name asc
    """
)

_CURRENT_PAYROLL_QUERY = text(
    """
    with period as (
      select cast(:period_start as date) as start_date,
             (cast(:period_start as date) + interval '1 month')::date as end_date
    ), employee_base as (
      select base_salary
      from public.employees
      where id = :employee_id
    ), base as (
      select base_salary
      from public.employee_compensation_terms, period
      where employee_id = :employee_id
        and status = 'published'
        and effective_from < period.end_date
        and (effective_to is null or effective_to >= period.start_date)
      order by effective_from desc
      limit 1
    ), piece as (
      select count(*) as tasks_completed, coalesce(sum(amount), 0) as piece_amount
      from public.work_pay_entitlements, period
      where employee_id = :employee_id
        and status in ('eligible', 'approved', 'paid')
        and earned_at >= period.start_date
        and earned_at < period.end_date
    ), adjustments as (
      select coalesce(sum(amount), 0) as adjustment_amount
      from public.employee_pay_adjustments, period
      where employee_id = :employee_id
        and status = 'approved'
        and effective_date >= period.start_date
        and effective_date < period.end_date
    )
    select coalesce((select base_salary from base), (select base_salary from employee_base), 0) as base_salary,
           (select tasks_completed from piece) as tasks_completed,
           (select piece_amount from piece) as piece_amount,
           (select adjustment_amount from adjustments) as adjustment_amount
    """
)


def _date_value(value):
    return value.isoformat() if value else None


def _number_value(value):
    return float(value) if isinstance(value, Decimal) else value


def checklist_submission_state(
    *, deadline_at: datetime | None, submitted_at: datetime, late_reason: str | None
) -> tuple[str, bool, str | None]:
    """Return the authoritative checklist status derived from the parent Node deadline."""
    is_overdue = bool(deadline_at and submitted_at > deadline_at)
    normalized_late_reason = (late_reason or "").strip() or None
    if is_overdue and not normalized_late_reason:
        raise HTTPException(
            status_code=422,
            detail="Checklist đã quá hạn; bắt buộc nhập lý do nộp trễ.",
        )
    return (
        ChecklistStatus.LATE_PENDING_APPROVAL if is_overdue else ChecklistStatus.PENDING_APPROVAL,
        is_overdue,
        normalized_late_reason,
    )


class EmployeePortalService:
    @staticmethod
    def build_profile(db: Session, employee: Employee) -> dict:
        department = None
        if employee.department_id:
            department = db.query(Department).filter(Department.id == employee.department_id).first()
        user = db.query(User).filter(User.id == employee.user_id).first()
        tasks = db.execute(_TASKS_QUERY, {"employee_id": employee.id}).mappings().all()
        checklist_by_task = {}
        assignees_by_task = {}
        task_node_ids = [task["id"] for task in tasks]
        if task_node_ids:
            assignee_rows = db.execute(
                _TASK_ASSIGNEES_QUERY, {"task_node_ids": task_node_ids}
            ).mappings().all()
            for row in assignee_rows:
                assignees_by_task.setdefault(row["task_node_id"], []).append(
                    {
                        "employee_id": row["employee_id"],
                        "full_name": row["full_name"],
                        "avatar_url": row["avatar_url"],
                        "role_code": row["role_code"],
                        "is_primary": bool(row["is_primary"]),
                    }
                )
            checklist_rows = db.execute(
                _TASK_CHECKLIST_QUERY, {"task_node_ids": task_node_ids}
            ).mappings().all()
            for row in checklist_rows:
                checklist_by_task.setdefault(row["task_node_id"], []).append(
                    {
                        "id": row["id"],
                        "key": row["checklist_key"],
                        "name": row["checklist_name"],
                        "is_required": bool(row["is_required"]),
                        "status": row["status"],
                        "require_evidence": bool(row["require_evidence"]),
                        "approver_role": row["approver_role"],
                        "is_overdue": bool(row["is_overdue"]),
                        "late_reason": row["late_reason"],
                        "submitted_at": _date_value(row["submitted_at"]),
                        "evidence_files": (row["evidence_data"] or {}).get("files", []),
                    }
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
        period_start = date.today().replace(day=1)
        payroll_row = db.execute(
            _CURRENT_PAYROLL_QUERY,
            {"employee_id": employee.id, "period_start": period_start},
        ).mappings().first()

        return {
            "employee": {
                "id": employee.id,
                "full_name": employee.full_name,
                "avatar_url": employee.avatar_url,
                "department": department.name if department else employee.department,
                "job_title": employee.job_title,
                "email": user.email if user else None,
                "join_date": _date_value(employee.join_date),
                "base_salary": _number_value(employee.base_salary or 0),
                "is_active": bool(employee.is_active),
            },
            "tasks": [
                {
                    "id": task["id"],
                    "node_code": task["node_code"],
                    "node_key": task["node_key"],
                    "service_line_id": task["service_line_id"],
                    "priority": task["priority"] or "NORMAL",
                    "contract_id": task["contract_id"],
                    "name": task["node_name"],
                    "description": task["node_description"],
                    "is_handover": bool(task["is_handover"]),
                    "requires_gov_submission": bool(task["requires_gov_submission"]),
                    "role_code": task["role_code"],
                    "is_primary": bool(task["is_primary"]),
                    "status": task["status"],
                    "outcome": task["outcome"],
                    "started_at": _date_value(task["started_at"]),
                    "deadline_at": _date_value(task["deadline_at"]),
                    "deadline": _date_value(task["deadline_at"]),
                    "is_overdue": bool(task["is_overdue"]),
                    "completion_date": _date_value(task["completed_at"]),
                    "checklist": checklist_by_task.get(task["id"], []),
                    "assignees": assignees_by_task.get(task["id"], []),
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
            "latest_payroll": EmployeePortalService._format_payroll_row(period_start, payroll_row),
        }

    @staticmethod
    def _calculate_payroll_history(
        db: Session, employee: Employee, target_month_date: date | None = None
    ) -> tuple[list[dict], dict | None, dict | None]:
        current_period_start = date.today().replace(day=1)
        if not target_month_date:
            target_month_date = current_period_start

        # 1. Fetch piece work aggregated by month in 1 fast query
        piece_rows = db.execute(text("""
            select (date_trunc('month', earned_at))::date as m_start,
                   count(*) as tasks_completed,
                   coalesce(sum(amount), 0) as piece_amount
            from public.work_pay_entitlements
            where employee_id = :emp_id
              and status in ('eligible', 'approved', 'paid')
            group by date_trunc('month', earned_at)
        """), {"emp_id": employee.id}).mappings().all()
        piece_map = {r["m_start"]: r for r in piece_rows}

        # 2. Fetch adjustments aggregated by month in 1 fast query
        adj_rows = db.execute(text("""
            select (date_trunc('month', effective_date))::date as m_start,
                   coalesce(sum(amount), 0) as adjustment_amount
            from public.employee_pay_adjustments
            where employee_id = :emp_id
              and status = 'approved'
            group by date_trunc('month', effective_date)
        """), {"emp_id": employee.id}).mappings().all()
        adj_map = {r["m_start"]: r for r in adj_rows}

        # 3. Fetch locked/paid payroll periods from payroll_periods table
        pp_rows = db.execute(text("""
            select period_month, status, locked_at, paid_at
            from public.payroll_periods
            where status in ('Locked', 'Paid')
        """)).mappings().all()
        period_status_map = {r["period_month"]: r for r in pp_rows}

        # 4. Fetch compensation terms in 1 fast query
        terms = db.execute(text("""
            select effective_from, effective_to, base_salary
            from public.employee_compensation_terms
            where employee_id = :emp_id
              and status = 'published'
            order by effective_from desc
        """), {"emp_id": employee.id}).mappings().all()

        emp_default_base = float(employee.base_salary or 0)

        def get_base_salary_for_month(m_date: date) -> float:
            if m_date.month == 12:
                next_m = m_date.replace(year=m_date.year + 1, month=1)
            else:
                next_m = m_date.replace(month=m_date.month + 1)
            for t in terms:
                eff_from = t["effective_from"]
                eff_to = t["effective_to"]
                if eff_from < next_m and (eff_to is None or eff_to >= m_date):
                    return float(t["base_salary"] or 0)
            return emp_default_base

        # Xác định tập hợp các kỳ hợp lệ:
        # - Kỳ hiện tại (Tháng này đang tạm tính)
        # - Kỳ được chọn (nếu có)
        # - Các kỳ đã được Giám đốc / Kế toán chốt duyệt hoặc thanh toán
        # - Các kỳ thực tế có phát sinh tiền khoán hoặc phụ cấp
        valid_period_dates = set()
        valid_period_dates.add(current_period_start)
        if target_month_date:
            valid_period_dates.add(target_month_date)

        join_first = employee.join_date.replace(day=1) if employee.join_date else None
        for p_month in period_status_map.keys():
            if join_first is None or p_month >= join_first:
                valid_period_dates.add(p_month)

        for p_month in piece_map.keys():
            valid_period_dates.add(p_month)
        for p_month in adj_map.keys():
            valid_period_dates.add(p_month)

        period_dates = sorted(list(valid_period_dates), reverse=True)

        payroll_history = []
        selected_payroll = None
        latest_payroll = None

        for p_date in period_dates:
            p_data = piece_map.get(p_date)
            a_data = adj_map.get(p_date)
            b_salary = get_base_salary_for_month(p_date)
            p_amount = float(p_data["piece_amount"]) if p_data else 0.0
            t_count = int(p_data["tasks_completed"]) if p_data else 0
            adj_amount = float(a_data["adjustment_amount"]) if a_data else 0.0

            pp_info = period_status_map.get(p_date)
            period_status = "Open" if p_date == current_period_start else (pp_info["status"] if pp_info else "Closed")

            formatted = {
                "month": p_date.isoformat(),
                "status": period_status,
                "tasks_completed": t_count,
                "base_salary": b_salary,
                "piece_amount": p_amount,
                "adjustment_amount": adj_amount,
                "bonus": p_amount + adj_amount,
                "total_salary": b_salary + p_amount + adj_amount,
                "is_current": (p_date == current_period_start),
                "is_locked": (period_status == "Locked"),
                "is_paid": (period_status == "Paid"),
            }

            payroll_history.append(formatted)
            if p_date == current_period_start and latest_payroll is None:
                latest_payroll = formatted
            if p_date == target_month_date and selected_payroll is None:
                selected_payroll = formatted

        if selected_payroll is None:
            selected_payroll = latest_payroll or (payroll_history[0] if payroll_history else None)

        return payroll_history, selected_payroll, latest_payroll

    @staticmethod
    def get_my_payroll(db: Session, employee: Employee, selected_month: str | None = None) -> dict:
        """Tính riêng phiếu lương cá nhân và toàn bộ lịch sử bảng lương theo các kỳ (tối ưu cao với Redis)."""
        cache_key = f"bachkhoa:portal:payroll:{employee.id}"
        if not selected_month:
            cached = get_cached_json(cache_key)
            if cached is not None:
                return cached

        department = None
        if employee.department_id:
            department = db.query(Department).filter(Department.id == employee.department_id).first()

        target_month_date = None
        if selected_month:
            try:
                parts = selected_month.strip().split("-")
                if len(parts) == 2:
                    target_month_date = date(int(parts[0]), int(parts[1]), 1)
            except Exception:
                target_month_date = None

        payroll_history, selected_payroll, latest_payroll = EmployeePortalService._calculate_payroll_history(
            db, employee, target_month_date
        )

        result = {
            "employee": {
                "id": employee.id,
                "full_name": employee.full_name,
                "avatar_url": employee.avatar_url,
                "department": department.name if department else employee.department,
                "job_title": employee.job_title,
                "base_salary": _number_value(employee.base_salary or 0),
                "is_active": bool(employee.is_active),
            },
            "latest_payroll": latest_payroll,
            "selected_payroll": selected_payroll,
            "payroll_history": payroll_history,
        }
        if not selected_month:
            set_cached_json(cache_key, result, ttl_seconds=60)
        return result

    @staticmethod
    def submit_checklist_evidence(
        db: Session,
        employee: Employee,
        task_node_id: str,
        checklist_result_id: str,
        evidence_url: str | None,
        file_name: str | None,
        note: str | None,
        late_reason: str | None,
        submitted_at: datetime,
    ) -> dict:
        assigned = db.execute(
            text(
                """
                select 1
                from public.task_node_checklist_assignments ca
                join public.task_node_checklist_results cr on cr.id = ca.checklist_result_id
                where cr.id = :checklist_result_id
                  and cr.task_node_id = :task_node_id
                  and ca.employee_id = :employee_id
                  and ca.pay_slot = 'WORK'
                  and ca.status not in ('replaced', 'cancelled')
                union all
                select 1 from public.task_node_assignments
                where task_node_id = :task_node_id and employee_id = :employee_id
                  and assignment_status not in ('replaced', 'declined', 'cancelled')
                  and not exists (
                    select 1 from public.task_node_checklist_assignments ca2
                    where ca2.checklist_result_id = :checklist_result_id
                      and ca2.pay_slot = 'WORK'
                      and ca2.status not in ('replaced', 'cancelled')
                  )
                limit 1
                """
            ),
            {
                "task_node_id": task_node_id,
                "checklist_result_id": checklist_result_id,
                "employee_id": employee.id,
            },
        ).first()
        if not assigned:
            raise HTTPException(status_code=403, detail="Bạn không được phân công cho công việc này.")

        checklist = db.execute(
            text(
                """
                select r.id, r.status, r.require_evidence, r.evidence_data,
                       n.deadline_at, n.status as node_status
                from public.task_node_checklist_results r
                join public.task_nodes n on n.id = r.task_node_id
                where r.id = :id and r.task_node_id = :task_node_id
                for update of r, n
                """
            ),
            {"id": checklist_result_id, "task_node_id": task_node_id},
        ).mappings().first()
        if not checklist:
            raise HTTPException(status_code=404, detail="Không tìm thấy checklist.")
        if checklist["status"] not in (ChecklistStatus.NOT_STARTED, ChecklistStatus.REJECTED):
            raise HTTPException(status_code=409, detail="Checklist này đã nộp hoặc đã được duyệt.")

        # Phải bấm "Bắt đầu làm" trước đã. Nộp minh chứng cho một bước chưa khởi
        # động thì mốc bắt đầu không có, thời hạn tính từ đâu cũng không biết, và
        # trên sơ đồ bước đó vẫn nằm im như chưa ai đụng tới.
        if checklist["node_status"] != "in_progress":
            nhan = {
                "pending": "chưa tới lượt",
                "ready": "chưa bấm Bắt đầu làm",
                "submitted": "đã nộp nghiệm thu, đang chờ duyệt",
                "accepted": "đã nghiệm thu xong",
                "completed": "đã hoàn thành",
                "cancelled": "đã huỷ",
                "blocked": "đang bị chặn",
                "rework_required": "bị trả về, cần bấm Làm lại trước",
            }.get(checklist["node_status"], checklist["node_status"])
            raise HTTPException(
                status_code=409,
                detail=f"Bước này {nhan} — bấm Bắt đầu làm rồi mới nộp được minh chứng.",
            )

        if checklist["require_evidence"] and not evidence_url:
            raise HTTPException(status_code=422, detail="Checklist này bắt buộc phải nộp file minh chứng.")

        next_status, is_overdue, normalized_late_reason = checklist_submission_state(
            deadline_at=checklist["deadline_at"],
            submitted_at=submitted_at,
            late_reason=late_reason,
        )

        evidence_data = dict(checklist["evidence_data"] or {})
        files = list(evidence_data.get("files") or [])
        if evidence_url:
            files.append(
                {
                    "name": file_name,
                    "url": evidence_url,
                    "note": note,
                    "submitted_at": submitted_at.isoformat(),
                }
            )
        evidence_data["files"] = files
        db.execute(
            text(
                """
                update public.task_node_checklist_results
                set status = :status, submitted_by = :user_id, submitted_at = :submitted_at,
                    is_overdue = :is_overdue, late_reason = :late_reason,
                    evidence_data = cast(:evidence_data as jsonb), updated_at = now()
                where id = :id
                """
            ),
            {
                "id": checklist_result_id,
                "status": next_status,
                "user_id": employee.user_id,
                "submitted_at": submitted_at,
                "is_overdue": is_overdue,
                "late_reason": normalized_late_reason,
                "evidence_data": json.dumps(evidence_data),
            },
        )
        if is_overdue:
            db.execute(
                text("update public.task_nodes set is_overdue = true, updated_at = now() where id = :id"),
                {"id": task_node_id},
            )
        db.commit()
        return {
            "id": checklist_result_id,
            "status": next_status,
            "is_overdue": is_overdue,
            "late_reason": normalized_late_reason,
        }

    @staticmethod
    def _format_payroll_row(period_start: date, row) -> dict | None:
        if row is None:
            return None
        base_salary = _number_value(row["base_salary"] or 0)
        piece_amount = _number_value(row["piece_amount"] or 0)
        adjustment_amount = _number_value(row["adjustment_amount"] or 0)
        return {
            "month": period_start.isoformat(),
            "tasks_completed": int(row["tasks_completed"] or 0),
            # Tách rõ 3 thành phần: phòng Pháp lý chỉ có cơ bản + thưởng/phạt,
            # phòng Đo vẽ có thêm khoán. Gộp chung thành "bonus" thì nhân viên
            # không đối chiếu được tiền khoán của mình.
            "base_salary": base_salary,
            "piece_amount": piece_amount,
            "adjustment_amount": adjustment_amount,
            "bonus": piece_amount + adjustment_amount,
            "total_salary": base_salary + piece_amount + adjustment_amount,
        }
