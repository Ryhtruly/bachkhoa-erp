from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, date
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from decimal import Decimal

from src.db.database import get_db
from src.core.auth import require_permission, get_current_user, assert_payroll_employee_access, is_payroll_all_user, User
from src.db.models import Employee, Department, PayrollPeriod
from src.finance.repository import FinanceRepository
from src.core.redis_utils import get_cached_json, set_cached_json, invalidate_cache

router = APIRouter(prefix="/api/payroll", tags=["06. Payroll Ledger"])

# (Đã xoá DEFAULT_NODE_RATES — bảng giá ghi cứng theo mã node K01–K07. Đó là
#  nguồn tiền thứ ba song song với work_item_rates, tự đẻ tiền cho node không có
#  khoán checklist, và sai hoàn toàn với quy trình tự do không dùng mã K0x.
#  Tiền khoán nay chỉ có một nguồn: checklist × work_item_rates.)

@router.get("/options")
def get_payroll_options(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "read"))
):
    if not is_payroll_all_user(db, user):
        raise HTTPException(status_code=403, detail="Chỉ Kế toán hoặc Giám đốc được xem danh sách lương.")
    cache_key = "bachkhoa:payroll:options"
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached

    departments = db.query(Department).all()
    dept_map = {d.id: d for d in departments}
    employees = db.query(Employee).filter(Employee.is_active == True).order_by(Employee.full_name.asc()).all()
    
    dept_employees: Dict[str, List[Dict[str, Any]]] = {}
    for d in departments:
        dept_employees[d.id] = []
    
    dept_employees["dept_general"] = []
    
    for emp in employees:
        d_id = emp.department_id
        if not d_id or d_id not in dept_map:
            dept_text = (emp.department or "").lower()
            matched_id = "dept_general"
            for did, d in dept_map.items():
                if d.name.lower() in dept_text or (d.code and d.code.lower() in dept_text):
                    matched_id = did
                    break
            dept_employees.setdefault(matched_id, []).append({
                "id": emp.id,
                "full_name": emp.full_name,
                "job_title": emp.job_title or "Nhân viên",
                "department": emp.department or (dept_map[matched_id].name if matched_id in dept_map else "Công ty")
            })
        else:
            dept_employees[d_id].append({
                "id": emp.id,
                "full_name": emp.full_name,
                "job_title": emp.job_title or "Nhân viên",
                "department": emp.department or dept_map[d_id].name
            })
            
    dept_list = []
    for d in departments:
        emps = dept_employees.get(d.id, [])
        if emps:
            dept_list.append({
                "id": d.id,
                "name": d.name,
                "code": d.code or d.name,
                "employees": emps
            })
            
    if dept_employees.get("dept_general"):
        dept_list.append({
            "id": "dept_general",
            "name": "Khối Văn Phòng / Khác",
            "code": "OFFICE",
            "employees": dept_employees["dept_general"]
        })
        
    now = datetime.now()
    result = {
        "status": "success",
        "data": {
            "departments": dept_list,
            "years": [now.year - 1, now.year, now.year + 1],
            "default_year": now.year,
            "default_month": now.month
        }
    }
    set_cached_json(cache_key, result, ttl_seconds=300)
    return result

@router.get("/employee-ledger")
def get_employee_ledger(
    department_id: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    curr_year = datetime.now().year
    curr_month = datetime.now().month
    year_val = year if isinstance(year, int) else curr_year
    month_val = month if isinstance(month, int) else curr_month
    emp_id_val = employee_id if (employee_id and isinstance(employee_id, str)) else None

    # Không cho phép dùng employee_id để đọc lương người khác.  Với nhân viên
    # thường, bỏ employee_id cũng phải tự rơi về hồ sơ của chính họ, không được
    # chọn nhân viên đầu tiên trong bảng như logic legacy trước đây.
    actor_employee = db.query(Employee).filter(
        Employee.user_id == user.id, Employee.is_active == True
    ).first()
    if not is_payroll_all_user(db, user):
        if not actor_employee:
            raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ nhân sự.")
        if emp_id_val and emp_id_val != actor_employee.id:
            raise HTTPException(status_code=403, detail="Bạn chỉ được xem bảng lương của chính mình.")
        emp_id_val = actor_employee.id

    if emp_id_val:
        assert_payroll_employee_access(db, user, emp_id_val)

    if emp_id_val:
        ledger_cache_key = f"bachkhoa:payroll:ledger:{emp_id_val}:{year_val}:{month_val}"
        cached_ledger = get_cached_json(ledger_cache_key)
        if cached_ledger is not None:
            return cached_ledger

    if not emp_id_val:
        first_emp = db.execute(text("""
            select e.id from employees e 
            join task_node_assignments a on a.employee_id = e.id 
            limit 1
        """)).scalar()
        if not first_emp:
            first_emp_row = db.query(Employee).first()
            first_emp = first_emp_row.id if first_emp_row else None
        emp_id_val = str(first_emp) if first_emp else None

    if not emp_id_val:
        return {
            "status": "success",
            "data": {
                "employee": None,
                "period_status": "Open",
                "summary": {},
                "details": [],
                "adjustments": [],
                "warnings": []
            }
        }

    emp = db.query(Employee).filter(Employee.id == emp_id_val).first()
    if not emp:
        return {
            "status": "success",
            "data": {
                "employee": None,
                "period_status": "Open",
                "summary": {},
                "details": [],
                "adjustments": [],
                "warnings": []
            }
        }

    # Fetch all tasks and workflow assignments linked to this employee
    query = text("""
        select 
            a.id as assignment_id,
            a.employee_id,
            a.role_code,
            a.is_primary,
            a.created_at as assigned_at,
            n.id as task_node_id,
            n.node_code,
            wn.name as node_name,
            n.status as node_status,
            n.outcome,
            n.completed_at,
            n.started_at,
            n.created_at as node_created_at,
            n.deadline_at,
            n.is_overdue,
            wi.id as workflow_id,
            sl.id as service_line_id,
            sl.service_type,
            c.id as contract_id,
            c.total_value as contract_value,
            cust.full_name as customer_name,
            wpe.amount as entitlement_amount,
            wpe.status as entitlement_status,
            wpe.earned_at
        from task_node_assignments a
        join task_nodes n on n.id = a.task_node_id
        join workflow_instances wi on wi.id = n.workflow_instance_id
        left join service_lines sl on sl.id = wi.service_line_id
        left join contracts c on c.id = sl.contract_id
        left join customers cust on cust.id = c.customer_id
        left join workflow_nodes wn on wn.code = n.node_code
        left join active_work_pay_entitlements wpe on wpe.task_node_id = n.id and wpe.employee_id = a.employee_id
        where a.employee_id = :emp_id
        order by coalesce(n.completed_at, n.started_at, n.created_at) desc
    """)
    rows = db.execute(query, {"emp_id": emp_id_val}).mappings().all()

    period_info = FinanceRepository.get_payroll_date_range(db, year_val, month_val)
    start_date = period_info["start_date"]
    end_date = period_info["end_date"]

    # Query adjustments
    adj_query = text("""
        select id, adjustment_type as type, amount, reason, source_reference as task_id, status, effective_date
        from employee_pay_adjustments
        where employee_id = :emp_id
          and status in ('approved', 'locked')
        order by effective_date desc
    """)
    adj_rows = db.execute(adj_query, {"emp_id": emp_id_val}).mappings().all()
    adjustments = []
    for r in adj_rows:
        eff_date = r["effective_date"]
        if eff_date:
            if isinstance(eff_date, str):
                try:
                    dt = datetime.fromisoformat(eff_date).date()
                except Exception:
                    dt = datetime.now().date()
            elif isinstance(eff_date, datetime):
                dt = eff_date.date()
            else:
                dt = eff_date
            if dt < start_date or dt > end_date:
                continue
        adjustments.append({
            "id": r["id"],
            "type": r["type"],
            "amount": float(r["amount"] or 0),
            "reason": r["reason"] or "Điều chỉnh lương",
            "task_id": r["task_id"] or "",
            "status": r["status"],
            "event_date": r["effective_date"].isoformat() if hasattr(r["effective_date"], "isoformat") else str(r["effective_date"]),
            "effective_date": r["effective_date"].isoformat() if hasattr(r["effective_date"], "isoformat") else str(r["effective_date"]),
        })

    details = []
    main_task_count = 0
    support_task_count = 0
    piece_rate_main = 0.0
    piece_rate_support = 0.0

    def _get_adjustment_type(adj):
        return str(adj.get("type") or "").upper()
    total_bonus = sum(a["amount"] for a in adjustments if _get_adjustment_type(a) == "BONUS")
    total_allowance = sum(a["amount"] for a in adjustments if _get_adjustment_type(a) in ("ALLOWANCE", "REIMBURSEMENT"))
    total_penalty = sum(a["amount"] for a in adjustments if _get_adjustment_type(a) == "DEDUCTION")
    
    pending_record_count = 0
    pending_record_total = 0.0
    provisional_count = 0
    provisional_total = 0.0
    recorded_total = 0.0
    paid_total = 0.0

    for r in rows:
        event_date_val = r["completed_at"] or r["earned_at"] or r["started_at"] or r["assigned_at"] or r["node_created_at"]
        if event_date_val:
            if isinstance(event_date_val, str):
                try:
                    dt_obj = datetime.fromisoformat(event_date_val).date()
                except Exception:
                    dt_obj = datetime.now().date()
            elif isinstance(event_date_val, datetime):
                dt_obj = event_date_val.date()
            else:
                dt_obj = event_date_val
        else:
            dt_obj = start_date

        is_completed = (r["node_status"] in ("accepted", "completed"))
        is_paid = (r["entitlement_status"] == "paid")
        is_locked = (r["entitlement_status"] == "locked")
        is_approved = (r["entitlement_status"] in ("approved", "locked"))

        # Filter strictly by the configured date range [start_date, end_date]:
        if is_completed or is_paid or is_approved:
            if dt_obj < start_date or dt_obj > end_date:
                continue  # Skip tasks completed outside this payroll period
        else:
            # In-progress / provisional task: only show if created on or before end_date of this period
            if dt_obj > end_date:
                continue

        role = "main" if (r["role_code"] or "").lower() == "main" or r["is_primary"] else "support"
        base_rate = float(r["entitlement_amount"]) if r["entitlement_amount"] is not None else 0.0

        stake_allowance = 0.0
        cancellation_allowance = 0.0
        priority_bonus = 0.0
        penalty = 0.0
        
        net_amount = max(0.0, base_rate + stake_allowance + cancellation_allowance + priority_bonus - penalty)
        
        if is_paid:
            status_code = "paid"
            payment_status = "Đã thanh toán"
            is_recorded = True
            is_closable = False
            paid_total += net_amount
            recorded_total += net_amount
        elif is_approved:
            status_code = "locked" if is_locked else "approved"
            payment_status = "Đã chốt" if is_locked else "Đã ghi nhận"
            is_recorded = True
            is_closable = False
            recorded_total += net_amount
        elif is_completed:
            status_code = "pending_record"
            payment_status = "Chờ ghi nhận"
            is_recorded = False
            is_closable = True
            pending_record_count += 1
            pending_record_total += net_amount
        else:
            status_code = "provisional"
            payment_status = "Tạm tính"
            is_recorded = False
            is_closable = False
            provisional_count += 1
            provisional_total += net_amount

        if role == "main":
            main_task_count += 1
            piece_rate_main += base_rate
        else:
            support_task_count += 1
            piece_rate_support += base_rate

        total_allowance += (stake_allowance + cancellation_allowance)

        event_date_str = event_date_val.strftime("%Y-%m-%d") if hasattr(event_date_val, "strftime") else (str(event_date_val)[:10] if event_date_val else date.today().isoformat())

        details.append({
            "id": r["assignment_id"] or f"task_{r['task_node_id']}",
            "task_id": r["node_code"] or "NODE",
            "contract_id": r["contract_id"] or "HĐ-Nhiệm vụ",
            "customer_name": r["customer_name"] or "Khách hàng Bách Khoa",
            "task_name": r["node_name"] or r["service_type"] or "Nhiệm vụ đo đạc / pháp lý",
            "role": role,
            "event_date": event_date_str,
            "base_rate": base_rate,
            "stake_allowance": stake_allowance,
            "cancellation_allowance": cancellation_allowance,
            "priority_bonus": priority_bonus,
            "penalty": penalty,
            "net_amount": net_amount,
            "status": status_code,
            "payment_status": payment_status,
            "is_recorded": is_recorded,
            "is_closable": is_closable,
            "source": f"Node {r['node_code'] or ''} · {r['service_type'] or 'Đo đạc'}"
        })

    base_salary = float(emp.base_salary or 0.0)
    gross_total = base_salary + piece_rate_main + piece_rate_support + total_allowance + total_bonus - total_penalty
    unpaid_total = max(0.0, gross_total - paid_total)

    approved_salary = recorded_total
    approved_count = len([d for d in details if d.get("is_recorded")])
    net_salary = approved_salary + pending_record_total + total_allowance + total_bonus - total_penalty

    summary = {
        "base_salary": base_salary,
        "main_task_count": main_task_count,
        "support_task_count": support_task_count,
        "piece_rate_main": piece_rate_main,
        "piece_rate_support": piece_rate_support,
        "allowance": total_allowance,
        "bonus": total_bonus,
        "penalty": total_penalty,
        "gross_total": gross_total,
        "recorded_total": recorded_total,
        "approved_salary": approved_salary,
        "approved_count": approved_count,
        "net_salary": net_salary,
        "estimated_total": provisional_total,
        "paid_total": paid_total,
        "unpaid_total": unpaid_total,
        "pending_record_count": pending_record_count,
        "pending_record_total": pending_record_total,
        "provisional_count": provisional_count,
        "provisional_total": provisional_total,
    }

    # Fetch period status from PayrollPeriod model for this specific month
    period_month_start = date(year_val, month_val, 1)
    period_row = db.query(PayrollPeriod).filter(PayrollPeriod.period_month == period_month_start).first()
    period_status = period_row.status if period_row and period_row.status else "Open"

    result = {
        "status": "success",
        "data": {
            "employee": {
                "id": emp.id,
                "full_name": emp.full_name,
                "job_title": emp.job_title or "Nhân viên nghiệp vụ",
                "department": emp.department or "Phòng Đo đạc - Nghiệp vụ"
            },
            "period_status": period_status,
            "period_range": {
                "start_date": period_info["start_date_str"],
                "end_date": period_info["end_date_str"],
                "label": period_info["label"],
                "cycle_type": period_info["cycle_type"],
                "cutoff_day": period_info["cutoff_day"],
                "payment_day": period_info["payment_day"]
            },
            "summary": summary,
            "details": details,
            "adjustments": adjustments,
            "warnings": []
        }
    }
    if emp_id_val:
        set_cached_json(f"bachkhoa:payroll:ledger:{emp_id_val}:{year_val}:{month_val}", result, ttl_seconds=120)
    return result

class ClosePeriodIn(BaseModel):
    employee_id: str
    year: int
    month: int

@router.post("/close-employee-period")
def close_employee_period(
    payload: ClosePeriodIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "approve"))
):
    try:
        period_info = FinanceRepository.get_payroll_date_range(db, payload.year, payload.month)
        start_date = period_info["start_date"]
        end_date = period_info["end_date"]
        locked_period = db.query(PayrollPeriod).filter(
            PayrollPeriod.period_month == start_date.replace(day=1)
        ).first()
        if locked_period and (locked_period.status or "").lower() in {"locked", "paid"}:
            raise HTTPException(status_code=409, detail="Kỳ lương đã khóa; không thể ghi sửa trực tiếp. Hãy tạo điều chỉnh kỳ sau hoặc mở lại có kiểm toán.")

        completed_nodes = db.execute(text("""
            select n.id as task_node_id, a.role_code, n.node_code, wi.id as workflow_id,
                   n.completed_at, wpe.earned_at, n.started_at, a.created_at as assigned_at, n.created_at as node_created_at
            from task_node_assignments a
            join task_nodes n on n.id = a.task_node_id
            join workflow_instances wi on wi.id = n.workflow_instance_id
            left join active_work_pay_entitlements wpe on wpe.task_node_id = n.id and wpe.employee_id = a.employee_id
            where a.employee_id = :emp_id and n.status in ('accepted', 'completed')
        """), {"emp_id": payload.employee_id}).mappings().all()

# Chốt lương chỉ DUYỆT các khoán đã sinh từ checklist khi nghiệm thu.
        # KHÔNG tự đẻ tiền: node đã nghiệm thu nhưng không gắn công việc khoán nào
        # thì không có khoán — đúng quy tắc "không checklist thì không sinh tiền".
        # (Trước đây chỗ này tạo entitlement bằng bảng giá ghi cứng DEFAULT_NODE_RATES
        #  theo mã K01–K07; quy trình tự do không có mã đó nên luôn trả mặc định sai.)
        approved_count = 0
        skipped_count = 0
        for node in completed_nodes:
            comp_dt = node.get("completed_at") or node.get("earned_at") or node.get("started_at") or node.get("assigned_at") or node.get("node_created_at")
            if comp_dt:
                if isinstance(comp_dt, str):
                    try:
                        comp_dt = datetime.fromisoformat(comp_dt).date()
                    except Exception:
                        pass
                elif isinstance(comp_dt, datetime):
                    comp_dt = comp_dt.date()

                if isinstance(comp_dt, date):
                    if comp_dt < start_date or comp_dt > end_date:
                        continue  # Do not close tasks from other periods!

            exists = db.execute(text("""
                select id from active_work_pay_entitlements
                where task_node_id = :node_id and employee_id = :emp_id
            """), {"node_id": node["task_node_id"], "emp_id": payload.employee_id}).scalar()

            if exists:
                db.execute(text("""
                    update work_pay_entitlements
                    set status = 'approved', approved_by = :actor_id, approved_at = now()
                    where task_node_id = :node_id and employee_id = :emp_id and status != 'approved'
                      -- Suất đã chuyển sang người khác thì không duyệt nữa. Câu
                      -- này ghi nên phải trỏ vào BẢNG, không trỏ view được — lọc
                      -- ở đây là chỗ duy nhất chặn được.
                      and not is_replaced
                """), {"node_id": node["task_node_id"], "emp_id": payload.employee_id, "actor_id": user.id})
                approved_count += 1
            else:
                # Không có khoán checklist cho node này → bỏ qua, không đẻ tiền.
                skipped_count += 1

        db.commit()
        invalidate_cache("bachkhoa:payroll:*")
        return {
            "status": "success",
            "message": f"Đã chốt sổ lương tháng {payload.month}/{payload.year} ({period_info['label']})",
            "data": {"approved_count": approved_count, "skipped_no_piece_rate": skipped_count}
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi chốt lương: {str(e)}")
