import json
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, date
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from decimal import Decimal

from src.db.database import get_db
from src.core.auth import require_permission, User
from src.db.models import Employee, Department

router = APIRouter(prefix="/api/payroll", tags=["06. Payroll Ledger"])

DEFAULT_NODE_RATES = {
    'K01': (350000.0, 150000.0),  # Tiếp nhận & kiểm tra
    'K02': (500000.0, 200000.0),  # Khảo sát & đo hiện trường
    'K03': (450000.0, 180000.0),  # Chuẩn hoá tài liệu kỹ thuật
    'K04': (400000.0, 160000.0),  # Xử lý bản vẽ & hồ sơ
    'K05': (600000.0, 200000.0),  # Nộp hồ sơ cơ quan
    'K06': (450000.0, 180000.0),  # Theo dõi thẩm tra
    'K07': (350000.0, 150000.0),  # Kiểm tra kết quả
    'K08': (300000.0, 120000.0),  # Nhận kết quả & bàn giao
    'K09': (250000.0, 100000.0),  # Lưu trữ & đóng hồ sơ
}

@router.get("/options")
def get_payroll_options(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "read"))
):
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
    return {
        "status": "success",
        "data": {
            "departments": dept_list,
            "years": [now.year - 1, now.year, now.year + 1],
            "default_year": now.year,
            "default_month": now.month
        }
    }

@router.get("/employee-ledger")
def get_employee_ledger(
    department_id: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "read"))
):
    curr_year = datetime.now().year
    curr_month = datetime.now().month
    year_val = year if isinstance(year, int) else curr_year
    month_val = month if isinstance(month, int) else curr_month
    emp_id_val = employee_id if (employee_id and isinstance(employee_id, str)) else None

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
        from public.task_node_assignments a
        join public.task_nodes n on n.id = a.task_node_id
        join public.workflow_instances wi on wi.id = n.workflow_instance_id
        left join public.service_lines sl on sl.id = wi.service_line_id
        left join public.contracts c on c.id = sl.contract_id
        left join public.customers cust on cust.id = c.customer_id
        left join public.workflow_nodes wn on wn.code = n.node_code
        left join public.work_pay_entitlements wpe on wpe.task_node_id = n.id and wpe.employee_id = a.employee_id
        where a.employee_id = :emp_id
        order by coalesce(n.completed_at, n.started_at, n.created_at) desc
    """)
    rows = db.execute(query, {"emp_id": emp_id_val}).mappings().all()

    # Query adjustments
    adj_query = text("""
        select id, adjustment_type as type, amount, reason, source_reference as task_id, status, effective_date
        from public.employee_pay_adjustments
        where employee_id = :emp_id
        order by effective_date desc
    """)
    adj_rows = db.execute(adj_query, {"emp_id": emp_id_val}).mappings().all()
    adjustments = [
        {
            "id": r["id"],
            "type": r["type"],
            "amount": float(r["amount"] or 0),
            "reason": r["reason"] or "Điều chỉnh lương",
            "task_id": r["task_id"] or "",
            "status": r["status"]
        } for r in adj_rows
    ]

    details = []
    main_task_count = 0
    support_task_count = 0
    piece_rate_main = 0.0
    piece_rate_support = 0.0
    total_allowance = 0.0
    total_bonus = sum(a["amount"] for a in adjustments if a["type"] in ("bonus", "referral_commission", "holiday_bonus"))
    total_penalty = sum(a["amount"] for a in adjustments if a["type"] == "penalty")
    
    pending_record_count = 0
    pending_record_total = 0.0
    provisional_count = 0
    provisional_total = 0.0
    recorded_total = 0.0
    paid_total = 0.0

    for r in rows:
        role = "main" if (r["role_code"] or "").lower() == "main" or r["is_primary"] else "support"
        code = r["node_code"] or "K01"
        def_main, def_supp = DEFAULT_NODE_RATES.get(code, (350000.0, 150000.0))
        
        if r["entitlement_amount"] is not None:
            base_rate = float(r["entitlement_amount"])
        else:
            base_rate = def_main if role == "main" else def_supp

        stake_allowance = 0.0
        cancellation_allowance = 0.0
        priority_bonus = 0.0
        penalty = 0.0
        
        net_amount = max(0.0, base_rate + stake_allowance + cancellation_allowance + priority_bonus - penalty)
        
        is_completed = (r["node_status"] in ("accepted", "completed"))
        is_paid = (r["entitlement_status"] == "paid")
        is_approved = (r["entitlement_status"] == "approved")
        
        if is_paid:
            payment_status = "Đã thanh toán"
            is_recorded = True
            is_closable = False
            paid_total += net_amount
            recorded_total += net_amount
        elif is_approved:
            payment_status = "Đã ghi nhận"
            is_recorded = True
            is_closable = False
            recorded_total += net_amount
        elif is_completed:
            payment_status = "Chờ ghi nhận"
            is_recorded = False
            is_closable = True
            pending_record_count += 1
            pending_record_total += net_amount
        else:
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

        event_date_val = r["completed_at"] or r["started_at"] or r["assigned_at"] or r["node_created_at"]
        event_date_str = event_date_val.strftime("%Y-%m-%d") if event_date_val else date.today().isoformat()

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
    # Net salary includes all earned income in period (approved + pending completed tasks + allowances + bonuses - penalties)
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

    return {
        "status": "success",
        "data": {
            "employee": {
                "id": emp.id,
                "full_name": emp.full_name,
                "job_title": emp.job_title or "Nhân viên nghiệp vụ",
                "department": emp.department or "Phòng Đo đạc - Nghiệp vụ"
            },
            "period_status": "Open",
            "summary": summary,
            "details": details,
            "adjustments": adjustments,
            "warnings": []
        }
    }

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
        completed_nodes = db.execute(text("""
            select n.id as task_node_id, a.role_code, n.node_code, wi.id as workflow_id
            from public.task_node_assignments a
            join public.task_nodes n on n.id = a.task_node_id
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            where a.employee_id = :emp_id and n.status in ('accepted', 'completed')
        """), {"emp_id": payload.employee_id}).mappings().all()

        created_count = 0
        for node in completed_nodes:
            exists = db.execute(text("""
                select id from public.work_pay_entitlements 
                where task_node_id = :node_id and employee_id = :emp_id
            """), {"node_id": node["task_node_id"], "emp_id": payload.employee_id}).scalar()
            
            if not exists:
                role = "main" if (node["role_code"] or "").lower() == "main" else "support"
                def_m, def_s = DEFAULT_NODE_RATES.get(node["node_code"], (350000.0, 150000.0))
                amt = def_m if role == "main" else def_s
                
                idempotency_key = f"close_payroll:{node['task_node_id']}:{payload.employee_id}"
                snapshot = json.dumps({
                    "node_code": node["node_code"],
                    "role_code": role,
                    "amount": amt,
                    "closed_by": user.id,
                    "month": payload.month,
                    "year": payload.year
                })

                acc_id = db.execute(text("""
                    select id from public.task_node_acceptances 
                    where task_node_id = :node_id 
                    order by created_at desc limit 1
                """), {"node_id": node["task_node_id"]}).scalar()

                db.execute(text("""
                    insert into public.work_pay_entitlements
                    (id, workflow_instance_id, task_node_id, checklist_result_id, checklist_assignment_id,
                     acceptance_id, work_item_rate_id, employee_id, role_code, amount, earned_at,
                     status, calculation_snapshot, idempotency_key, approved_by, approved_at, created_at)
                    values
                    (:id, :wf_id, :node_id, NULL, NULL,
                     :acc_id, NULL, :emp_id, :role_code, :amt, now(),
                     'approved', cast(:snapshot as jsonb), :idempotency_key, :actor_id, now(), now())
                """), {
                    "id": f"wpe_{uuid.uuid4().hex[:16]}",
                    "wf_id": node["workflow_id"],
                    "node_id": node["task_node_id"],
                    "acc_id": acc_id,
                    "emp_id": payload.employee_id,
                    "role_code": node["role_code"] or "MAIN",
                    "amt": amt,
                    "snapshot": snapshot,
                    "idempotency_key": idempotency_key,
                    "actor_id": user.id
                })
                created_count += 1
            else:
                db.execute(text("""
                    update public.work_pay_entitlements
                    set status = 'approved', approved_by = :actor_id, approved_at = now()
                    where task_node_id = :node_id and employee_id = :emp_id and status != 'approved'
                """), {"node_id": node["task_node_id"], "emp_id": payload.employee_id, "actor_id": user.id})
                created_count += 1

        db.commit()
        return {
            "status": "success",
            "message": f"Đã chốt sổ lương tháng {payload.month}/{payload.year}",
            "data": {"created_count": created_count}
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi chốt lương: {str(e)}")
