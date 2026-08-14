import re
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, or_, text
from datetime import datetime, date, timezone, timedelta
from typing import Optional, List, Dict

from src.db.models import (
    CashflowTransaction, Contract, Customer, Receivable,
    ServiceLine, Employee, Department, User,
    FinanceSetting, FundOpeningBalance
)

class FinanceRepository:

    @staticmethod
    def get_setting_value(db: Session, key: str, default: float = 0.0) -> float:
        try:
            setting = db.query(FinanceSetting).filter(FinanceSetting.key == key).first()
            if setting:
                return float(setting.value or 0.0)
        except Exception:
            pass
        return default

    @staticmethod
    def get_running_balance(db: Session, payment_method: str = "Tiền mặt", up_to_datetime: Optional[datetime] = None) -> float:
        tz_vn = timezone(timedelta(hours=7))
        
        q_snap = db.query(FundOpeningBalance).filter(FundOpeningBalance.payment_method == payment_method)
        if up_to_datetime:
            q_snap = q_snap.filter(FundOpeningBalance.effective_date <= up_to_datetime)
        latest_snap = q_snap.order_by(FundOpeningBalance.effective_date.desc(), FundOpeningBalance.id.desc()).first()
        
        if latest_snap:
            start_bal = float(latest_snap.opening_balance or 0)
            start_time = latest_snap.effective_date
            if start_time:
                start_time_local = start_time.astimezone(tz_vn) if start_time.tzinfo else start_time.replace(tzinfo=timezone.utc).astimezone(tz_vn)
                start_date = start_time_local.date()
            else:
                start_date = None
        else:
            key = "initial_cash_balance" if payment_method == "Tiền mặt" else "initial_bank_balance"
            start_bal = FinanceRepository.get_setting_value(db, key, 0.0)
            start_date = None

        # Only count approved/completed transactions for actual cash/bank ledger
        approved_cond = or_(
            CashflowTransaction.status.is_(None),
            CashflowTransaction.status.in_(["Hoàn thành", "Đã duyệt", "COMPLETED", "approved", ""])
        )

        q_thu = db.query(func.sum(CashflowTransaction.amount)).filter(
            CashflowTransaction.transaction_type == "Thu",
            CashflowTransaction.payment_method == payment_method,
            CashflowTransaction.scope == "Công ty",
            approved_cond
        )
        
        q_chi = db.query(func.sum(CashflowTransaction.amount)).filter(
            CashflowTransaction.transaction_type == "Chi",
            CashflowTransaction.payment_method == payment_method,
            CashflowTransaction.scope == "Công ty",
            approved_cond
        )
        
        if start_date:
            q_thu = q_thu.filter(CashflowTransaction.transaction_date > start_date)
            q_chi = q_chi.filter(CashflowTransaction.transaction_date > start_date)
            
        if up_to_datetime:
            up_to_date = up_to_datetime.astimezone(tz_vn).date() if up_to_datetime.tzinfo else up_to_datetime.replace(tzinfo=timezone.utc).astimezone(tz_vn).date()
            q_thu = q_thu.filter(CashflowTransaction.transaction_date <= up_to_date)
            q_chi = q_chi.filter(CashflowTransaction.transaction_date <= up_to_date)
            
        income_sum = float(q_thu.scalar() or 0.0)
        expenditure_sum = float(q_chi.scalar() or 0.0)
        
        return start_bal + income_sum - expenditure_sum

    @staticmethod
    def generate_voucher_id(type_val: str, db: Session, target_date: date = None) -> str:
        prefix = "PT" if type_val == "Thu" else "PC"
        now = target_date or datetime.now().date()
        month_str = now.strftime("%m")
        year_str = now.strftime("%Y")
        pattern = f"{prefix}-{month_str}/{year_str}-%"
        
        existing_ids = db.query(CashflowTransaction.id).filter(
            CashflowTransaction.id.like(pattern)
        ).all()
        
        max_num = 0
        for (eid,) in existing_ids:
            m = re.search(r"-(\d+)$", eid)
            if m:
                max_num = max(max_num, int(m.group(1)))
                
        return f"{prefix}-{month_str}/{year_str}-{max_num + 1:03d}"

    @staticmethod
    def list_cashflow_transactions(
        db: Session,
        month: Optional[str] = None,
        type: Optional[str] = None,
        payment_method: Optional[str] = None,
        project_id: Optional[str] = None,
        contract_id: Optional[str] = None,
        scope: Optional[str] = None
    ) -> List[CashflowTransaction]:
        q = db.query(CashflowTransaction)
        if month:
            try:
                y, m = month.split("-")
                q = q.filter(
                    extract("year", func.coalesce(CashflowTransaction.transaction_date, func.date(CashflowTransaction.created_at))) == int(y),
                    extract("month", func.coalesce(CashflowTransaction.transaction_date, func.date(CashflowTransaction.created_at))) == int(m)
                )
            except Exception:
                pass
        if type and type not in ("All", ""):
            q = q.filter(CashflowTransaction.transaction_type == type)
        if payment_method and payment_method not in ("All", ""):
            q = q.filter(CashflowTransaction.payment_method == payment_method)
        if project_id:
            q = q.filter(CashflowTransaction.project_id == project_id)
        if contract_id:
            q = q.filter(CashflowTransaction.contract_id == contract_id)
        if scope and scope != "All":
            q = q.filter(CashflowTransaction.scope == scope)
            
        return q.order_by(CashflowTransaction.created_at.desc()).all()

    @staticmethod
    def get_cashflow_by_contract(db: Session, contract_id: str) -> Dict:
        contract = db.query(Contract).filter(Contract.id == contract_id).first()
        if not contract:
            return None

        rows = db.query(CashflowTransaction).filter(
            CashflowTransaction.contract_id == contract_id
        ).order_by(CashflowTransaction.created_at.desc()).all()

        total_income = sum(float(r.amount or 0) for r in rows if r.transaction_type == "Thu")
        total_expenditure = sum(float(r.amount or 0) for r in rows if r.transaction_type == "Chi")
        customer = db.query(Customer).filter(Customer.id == contract.customer_id).first()

        return {
            "contract": contract,
            "customer_name": customer.full_name if customer else "",
            "total_income": total_income,
            "total_expenditure": total_expenditure,
            "transactions": rows,
        }

    @staticmethod
    def get_cashflow_by_project(db: Session, project_id: str) -> Dict:
        project = db.query(ServiceLine).filter(ServiceLine.id == project_id).first()
        if not project:
            return None

        rows = db.query(CashflowTransaction).filter(
            CashflowTransaction.project_id == project_id
        ).order_by(CashflowTransaction.created_at.desc()).all()

        total_income = sum(float(r.amount or 0) for r in rows if r.transaction_type == "Thu")
        total_expenditure = sum(float(r.amount or 0) for r in rows if r.transaction_type == "Chi")

        return {
            "project_id": project_id,
            "task_name": project.service_type or "",
            "contract_id": project.contract_id or "",
            "total_income": total_income,
            "total_expenditure": total_expenditure,
            "transactions": rows,
        }

    @staticmethod
    def get_cashflow_detail(db: Session, transaction_id: str) -> Dict:
        t = db.query(CashflowTransaction).filter(CashflowTransaction.id == transaction_id).first()
        if not t:
            raise HTTPException(status_code=404, detail="Không tìm thấy phiếu")
        
        contract_info = None
        if t.contract_id:
            c = db.query(Contract).filter(Contract.id == t.contract_id).first()
            if c:
                cust = db.query(Customer).filter(Customer.id == c.customer_id).first()
                contract_info = {
                    "id": c.id,
                    "service_type": c.service_type,
                    "total_value": float(c.total_value or 0),
                    "date_signed": str(c.date_signed) if c.date_signed else "",
                    "customer_name": cust.full_name if cust else "",
                    "customer_phone": cust.phone if cust else ""
                }

        from src.finance.serializers import serialize_cashflow
        data = serialize_cashflow(t, db)
        data["contract_info"] = contract_info
        data["transaction_date"] = str(t.transaction_date) if t.transaction_date else ""
        data["notes"] = t.notes or ""
        return data

    @staticmethod
    def list_contracts_with_payments(db: Session) -> list:
        rows = db.query(Contract, Customer.full_name, Customer.phone).outerjoin(
            Customer, Contract.customer_id == Customer.id
        ).order_by(Contract.created_at.desc()).all()
        
        # Batch pre-aggregate payments by contract in 1 single query
        paid_map = dict(
            db.query(CashflowTransaction.contract_id, func.sum(CashflowTransaction.amount))
            .filter(CashflowTransaction.transaction_type == "Thu", CashflowTransaction.contract_id.isnot(None))
            .group_by(CashflowTransaction.contract_id)
            .all()
        )
        
        result = []
        for contract, cust_name, cust_phone in rows:
            paid = float(paid_map.get(contract.id, 0.0) or 0.0)
            total = float(contract.total_value or 0)
            result.append({
                "id": contract.id,
                "customer_name": cust_name or "",
                "phone": cust_phone or "",
                "service_type": contract.service_type or "",
                "total_value": total,
                "paid_amount": paid,
                "remaining": max(0.0, total - paid),
                "date_signed": str(contract.date_signed) if contract.date_signed else "",
                "file_link": contract.file_link or "",
            })
        return result

    @staticmethod
    def list_receivables_formatted(db: Session) -> list:
        today = date.today()
        contracts_q = db.query(Contract, Customer.full_name, Customer.representative_name).outerjoin(
            Customer, Contract.customer_id == Customer.id
        ).all()
        contracts_map = {}
        contracts_customer_map = {}
        for c, cust_name, rep_name in contracts_q:
            contracts_map[c.id] = float(c.total_value or 0)
            contracts_customer_map[c.id] = cust_name or rep_name or ""

        # Batch pre-fetch all pending refund transactions in 1 single query
        pending_refunds = db.query(CashflowTransaction).filter(
            CashflowTransaction.contract_id.isnot(None),
            CashflowTransaction.transaction_type == "Chi",
            CashflowTransaction.status == "Chờ duyệt"
        ).all()
        pending_refund_map = {t.contract_id: t for t in pending_refunds}

        rows = db.query(Receivable).order_by(Receivable.due_date.asc().nullslast()).all()
        result = []
        for r in rows:
            paid = float(r.paid_amount or 0)
            remaining = float(r.remaining_amount or 0)
            total_val = contracts_map.get(r.contract_id, 0.0)
            excess_amount = max(paid - total_val, 0) if (total_val > 0 and paid > total_val + 0.009) else 0.0
            overdue = bool(r.due_date and r.due_date < today and remaining > 0)

            is_written_off = bool(getattr(r, 'is_written_off', False))
            is_refunded = bool(getattr(r, 'is_refunded', False))
            carried_forward_to = getattr(r, 'carried_forward_to', None)
            carried_forward_from = getattr(r, 'carried_forward_from', None)

            pending_refund = pending_refund_map.get(r.contract_id)

            if is_written_off:
                status = "written_off"
            elif is_refunded:
                status = "refunded"
            elif excess_amount > 0.009:
                status = "overpaid"
            elif carried_forward_to:
                status = "settled"
            elif remaining <= 0:
                status = "settled"
            elif overdue:
                status = "overdue"
            elif paid > 0:
                status = "partial"
            else:
                status = "not_started"

            cust_name = contracts_customer_map.get(r.contract_id, "") or getattr(r, 'customer_name', '') or ""

            result.append({
                "id": r.id,
                "contract_id": r.contract_id or "",
                "customer_name": cust_name,
                "customer": cust_name,
                "total_value": total_val,
                "paid_amount": paid,
                "remaining_amount": remaining,
                "excess_amount": excess_amount,
                "is_overpaid": excess_amount > 0.009,
                "has_pending_refund": bool(pending_refund),
                "pending_refund_id": pending_refund.id if pending_refund else "",
                "pending_refund_amount": float(pending_refund.amount or 0) if pending_refund else 0.0,
                "due_date": str(r.due_date) if r.due_date else "",
                "overdue": overdue,
                "status": status,
                "is_written_off": is_written_off,
                "written_off_reason": getattr(r, 'written_off_reason', '') or "",
                "is_refunded": is_refunded,
                "refund_reason": getattr(r, 'refund_reason', '') or "",
                "carried_forward_to": carried_forward_to or "",
                "carried_forward_from": carried_forward_from or "",
                "created_at": r.created_at.strftime("%d/%m/%y") if r.created_at else "",
            })
        return result

    @staticmethod
    def list_payables_formatted(db: Session) -> dict:
        rows = db.query(CashflowTransaction).filter(
            CashflowTransaction.transaction_type == "Chi",
            CashflowTransaction.payment_method == "Chuyển khoản",
            CashflowTransaction.contract_id.is_(None)
        ).order_by(CashflowTransaction.created_at.desc()).all()
        total = sum(float(r.amount or 0) for r in rows)
        from src.finance.serializers import serialize_cashflow_bulk
        return {"total_payable": total, "transactions": serialize_cashflow_bulk(rows, db)}

    @staticmethod
    def list_advances_formatted(db: Session) -> list:
        rows = db.query(CashflowTransaction).filter(
            CashflowTransaction.transaction_type == "Chi",
            or_(CashflowTransaction.category_code.ilike("%tạm ứng%"),
                CashflowTransaction.description.ilike("%tạm ứng%")),
            CashflowTransaction.status != "Đã quyết toán"
        ).order_by(CashflowTransaction.created_at.desc()).all()
        from src.finance.serializers import serialize_cashflow_bulk
        return serialize_cashflow_bulk(rows, db)

    @staticmethod
    def list_employee_departments(db: Session) -> List[Department]:
        return db.query(Department).order_by(Department.name.asc()).all()

    @staticmethod
    def list_employees(db: Session) -> List[tuple]:
        return (
            db.query(Employee, Department.name, User)
            .outerjoin(Department, Department.id == Employee.department_id)
            .outerjoin(User, User.id == Employee.user_id)
            .order_by(Employee.full_name.asc(), Employee.created_at.desc())
            .all()
        )

    @staticmethod
    def get_employee_by_id(db: Session, employee_id: str) -> Optional[tuple]:
        return (
            db.query(Employee, Department.name, User)
            .outerjoin(Department, Department.id == Employee.department_id)
            .outerjoin(User, User.id == Employee.user_id)
            .filter(Employee.id == employee_id)
            .first()
        )

    @staticmethod
    def list_payroll_formatted(db: Session, month: Optional[str] = None) -> list:
        period_month = None
        if month:
            try:
                period_month = datetime.strptime(month, "%Y-%m").date().replace(day=1)
            except ValueError as exc:
                raise HTTPException(
                    status_code=422,
                    detail="Tháng phải có định dạng YYYY-MM.",
                ) from exc
        period_month = period_month or date.today().replace(day=1)
        rows = db.execute(text("""
            with period as (
              select cast(:period_month as date) as start_date,
                     (cast(:period_month as date) + interval '1 month')::date as end_date
            ), base as (
              select distinct on (employee_id) employee_id, base_salary
              from public.employee_compensation_terms, period
              where status = 'published'
                and effective_from < period.end_date
                and (effective_to is null or effective_to >= period.start_date)
              order by employee_id, effective_from desc
            ), piece as (
              select employee_id, count(*) as tasks_completed,
                     coalesce(sum(amount), 0) as piece_amount
              from public.work_pay_entitlements, period
              where status in ('eligible', 'approved', 'paid')
                and earned_at >= period.start_date
                and earned_at < period.end_date
              group by employee_id
            ), adjustments as (
              select employee_id, coalesce(sum(amount), 0) as adjustment_amount
              from public.employee_pay_adjustments, period
              where status = 'approved'
                and effective_date >= period.start_date
                and effective_date < period.end_date
              group by employee_id
            )
            select e.id, e.full_name, e.department,
                   coalesce(b.base_salary, e.base_salary, 0) as base_salary,
                   coalesce(p.piece_amount, 0) as piece_amount,
                   coalesce(a.adjustment_amount, 0) as adjustment_amount,
                   coalesce(p.tasks_completed, 0) as tasks_completed
            from public.employees e
            left join base b on b.employee_id = e.id
            left join piece p on p.employee_id = e.id
            left join adjustments a on a.employee_id = e.id
            where coalesce(e.is_active, true)
            order by e.full_name
        """), {"period_month": period_month}).mappings().all()
        return [{
            "id": row["id"],
            "full_name": row["full_name"] or "",
            "department": row["department"] or "",
            "base_salary": float(row["base_salary"] or 0),
            "kpi_score": 0,
            "bonus": float(row["piece_amount"] or 0) + float(row["adjustment_amount"] or 0),
            "total_salary": float(row["base_salary"] or 0) + float(row["piece_amount"] or 0) + float(row["adjustment_amount"] or 0),
            "month": period_month.strftime("%Y-%m"),
            "tasks_completed": int(row["tasks_completed"] or 0),
        } for row in rows]

    @staticmethod
    def list_worker_wages_formatted(db: Session, project_id: Optional[str] = None) -> dict:
        q = db.query(CashflowTransaction).filter(
            CashflowTransaction.transaction_type == "Chi",
            or_(CashflowTransaction.category_code.ilike("%lương khoán%"),
                CashflowTransaction.description.ilike("%lương khoán%"))
        )
        if project_id:
            q = q.filter(CashflowTransaction.project_id == project_id)
        rows = q.order_by(CashflowTransaction.created_at.desc()).all()
        total = sum(float(r.amount or 0) for r in rows)
        from src.finance.serializers import serialize_cashflow_bulk
        return {"total_wages": total, "transactions": serialize_cashflow_bulk(rows, db)}

    @staticmethod
    def list_worker_wage_records_formatted(db: Session, month: Optional[str] = None) -> list:
        q = db.query(CashflowTransaction).filter(
            CashflowTransaction.transaction_type == "Chi",
            or_(CashflowTransaction.category_code.ilike("%lương khoán%"),
                CashflowTransaction.description.ilike("%lương khoán%"))
        )
        if month:
            try:
                y, m = month.split("-")
                q = q.filter(
                    extract("year", CashflowTransaction.created_at) == int(y),
                    extract("month", CashflowTransaction.created_at) == int(m)
                )
            except Exception:
                pass
        
        rows = q.order_by(CashflowTransaction.created_at.desc()).all()
        details = []
        for r in rows:
            note = (r.description or "").replace("Lương khoán:", "").strip()
            details.append({
                "employee_name": r.payer_payee_name or "Staff",
                "task_id": r.project_id or "Unassigned",
                "piece_rate_stage": note or "Work Acceptance",
                "piece_rate_amount": float(r.amount or 0),
                "allowance": 0.0,
                "bonus_penalty": 0.0,
                "total_received": float(r.amount or 0),
                "closing_date": r.transaction_date.strftime("%Y-%m-%d") if r.transaction_date else (r.created_at.strftime("%Y-%m-%d") if r.created_at else "")
            })
        return details

    @staticmethod
    def get_summary_report(db: Session) -> Dict:
        cash_balance = FinanceRepository.get_running_balance(db, "Tiền mặt")
        bank_balance = FinanceRepository.get_running_balance(db, "Chuyển khoản")
        net_advance = float(db.query(func.sum(CashflowTransaction.amount)).filter(
            CashflowTransaction.transaction_type == "Chi",
            or_(CashflowTransaction.category_code.ilike("%tạm ứng%"),
                CashflowTransaction.description.ilike("%tạm ứng%")),
            CashflowTransaction.category_code != "Chi thực tế từ tạm ứng",
            CashflowTransaction.status != "Đã quyết toán",
            CashflowTransaction.scope == "Công ty"
        ).scalar() or 0)

        # Monthly trend
        monthly_raw = db.query(
            extract("year", func.coalesce(CashflowTransaction.transaction_date, func.date(CashflowTransaction.created_at))).label("yr"),
            extract("month", func.coalesce(CashflowTransaction.transaction_date, func.date(CashflowTransaction.created_at))).label("mo"),
            CashflowTransaction.transaction_type,
            func.sum(CashflowTransaction.amount).label("total")
        ).filter(
            CashflowTransaction.scope == "Công ty",
            CashflowTransaction.category_code != "Chi phí tạm ứng",
            CashflowTransaction.category_code != "Quyết toán hoàn ứng"
        ).group_by("yr", "mo", CashflowTransaction.transaction_type).order_by("yr", "mo").all()

        mm: dict = {}
        for r in monthly_raw:
            if not r.yr: continue
            k = f"{int(r.yr):04d}-{int(r.mo):02d}"
            if k not in mm: mm[k] = {"month": k, "income": 0, "expenditure": 0}
            val = float(r.total)
            if r.transaction_type == "Thu":
                mm[k]["income"] = val
            else:
                mm[k]["expenditure"] = val
        monthly = sorted(mm.values(), key=lambda x: x["month"])[-12:]

        # Profit by contract
        income_by_c = db.query(
            CashflowTransaction.contract_id,
            func.sum(CashflowTransaction.amount).label("t")
        ).filter(CashflowTransaction.transaction_type == "Thu",
                 CashflowTransaction.contract_id.isnot(None),
                 CashflowTransaction.scope == "Công ty"
        ).group_by(CashflowTransaction.contract_id).all()

        expense_by_p = db.query(
            CashflowTransaction.project_id,
            func.sum(CashflowTransaction.amount).label("t")
        ).filter(
            CashflowTransaction.transaction_type == "Chi",
            CashflowTransaction.project_id.isnot(None),
            CashflowTransaction.scope == "Công ty",
            CashflowTransaction.category_code != "Chi phí tạm ứng",
            CashflowTransaction.category_code != "Quyết toán hoàn ứng"
        ).group_by(CashflowTransaction.project_id).all()

        pc_map = {p.id: p.contract_id for p in
                  db.query(ServiceLine).filter(ServiceLine.contract_id.isnot(None)).all()}
        income_map = {r.contract_id: float(r[1]) for r in income_by_c}
        expense_map: dict = {}
        for r in expense_by_p:
            cid = pc_map.get(r.project_id)
            if cid:
                expense_map[cid] = expense_map.get(cid, 0) + float(r[1])

        # Lương khoán gắn project → quy về contract
        wage_by_p = db.query(
            CashflowTransaction.project_id,
            func.sum(CashflowTransaction.amount).label("t")
        ).filter(CashflowTransaction.transaction_type == "Chi",
                 or_(CashflowTransaction.category_code.ilike("%lương khoán%"),
                     CashflowTransaction.description.ilike("%lương khoán%")),
                 CashflowTransaction.project_id.isnot(None)
        ).group_by(CashflowTransaction.project_id).all()
        wage_map: dict = {}
        for r in wage_by_p:
            cid = pc_map.get(r.project_id)
            if cid:
                wage_map[cid] = wage_map.get(cid, 0) + float(r[1])

        profit_list = [
            {
                "contract_id": cid,
                "income": income_val,
                "expense": expense_map.get(cid, 0),
                "piece_rate_wage": wage_map.get(cid, 0),
                "profit": income_val - expense_map.get(cid, 0) - wage_map.get(cid, 0)
            }
            for cid, income_val in income_map.items()
        ]
        profit_list.sort(key=lambda x: x["profit"], reverse=True)

        return {
            "cash_balance": cash_balance,
            "bank_balance": bank_balance,
            "net_advance": net_advance,
            "monthly": monthly,
            "profit_by_contract": profit_list[:20]
        }

    @staticmethod
    def list_projects(db: Session) -> List[Dict]:
        rows = (
            db.query(ServiceLine, Contract, Customer)
            .outerjoin(Contract, Contract.id == ServiceLine.contract_id)
            .outerjoin(Customer, Customer.id == Contract.customer_id)
            .order_by(Contract.date_signed.desc().nullslast(), ServiceLine.id.desc())
            .limit(300)
            .all()
        )

        projects = []
        for service_line, contract, customer in rows:
            business_code = contract.id if contract else service_line.contract_id
            service_name = service_line.service_type or service_line.service_package
            customer_name = customer.full_name if customer else service_line.land_owner_name
            label_parts = [part for part in (business_code, service_name, customer_name) if part]
            projects.append({
                "id": service_line.id,
                "contract_id": service_line.contract_id,
                "label": " — ".join(label_parts) or "Hồ sơ kỹ thuật chưa có mã",
            })

        return projects

    @staticmethod
    def get_finance_settings(db: Session) -> Dict:
        return {
            "initial_cash_balance": FinanceRepository.get_setting_value(db, "initial_cash_balance"),
            "initial_bank_balance": FinanceRepository.get_setting_value(db, "initial_bank_balance"),
            "initial_total_income": FinanceRepository.get_setting_value(db, "initial_total_income"),
            "initial_total_expenditure": FinanceRepository.get_setting_value(db, "initial_total_expenditure"),
            "expense_approval_threshold": FinanceRepository.get_setting_value(db, "expense_approval_threshold", default=2000000.0),
            "advance_admin_threshold": FinanceRepository.get_setting_value(db, "advance_admin_threshold", default=5000000.0)
        }

    @staticmethod
    def get_fund_balances_history(db: Session) -> List[FundOpeningBalance]:
        return db.query(FundOpeningBalance).order_by(FundOpeningBalance.effective_date.desc(), FundOpeningBalance.id.desc()).all()

    @staticmethod
    def get_monthly_dashboard(db: Session, month: str) -> dict:
        try:
            y_str, m_str = month.split("-")
            year = int(y_str)
            m_num = int(m_str)
        except Exception:
            raise HTTPException(status_code=400, detail="Tháng không hợp lệ. Format phải là YYYY-MM")

        approved_cond = or_(
            CashflowTransaction.status.is_(None),
            CashflowTransaction.status.in_(["Hoàn thành", "Đã duyệt", "COMPLETED", "approved", ""])
        )

        # Filter transactions in this month
        txs = db.query(CashflowTransaction).filter(
            extract("year", CashflowTransaction.transaction_date) == year,
            extract("month", CashflowTransaction.transaction_date) == m_num,
            CashflowTransaction.scope == "Công ty",
            CashflowTransaction.category_code != "Chi phí tạm ứng",
            CashflowTransaction.category_code != "Quyết toán hoàn ứng",
            approved_cond
        ).all()

        # Calculate overall totals
        total_income = sum(float(t.amount or 0.0) for t in txs if t.transaction_type == "Thu")
        total_expenditure = sum(float(t.amount or 0.0) for t in txs if t.transaction_type == "Chi")
        net_difference = total_income - total_expenditure

        # Define standard categories to show
        standard_categories = [
            "Thu tiền hợp đồng dịch vụ",
            "Thu hoàn ứng / Tạm ứng",
            "Thu chênh lệch kiểm kê quỹ",
            "Chi ngoại giao & Xử lý hồ sơ",
            "Bồi dưỡng thẩm định & Hiện trường",
            "Chi thụ lý bản vẽ & Trích lục",
            "Công chứng, Lệ phí & Nghĩa vụ thuế",
            "Chi tiếp khách & Giao tế",
            "Chi lương, Thù lao & Hoa hồng 3P",
            "Công tác phí & Di chuyển hiện trường",
            "Văn phòng phẩm & In ấn kỹ thuật",
            "Điện - Nước - Internet",
            "Sửa chữa, Kiểm định máy đo & Thiết bị",
            "Chi hoàn trả khách hàng",
            "Chi điều chỉnh hủy phiếu",
            "Chi chênh lệch kiểm kê quỹ",
            "Chi phí hành chính & Khác"
        ]

        def normalize_category(cat_raw, tx_type):
            c = (cat_raw or "").strip().lower()
            if tx_type == "Thu" or "thu" in c:
                if any(k in c for k in ["hợp đồng", "hd", "hđ", "dự án", "cọc", "thanh toán", "đợt", "thực hiện"]):
                    return "Thu tiền hợp đồng dịch vụ"
                if any(k in c for k in ["hoàn ứng", "tạm ứng", "hoàn trả"]):
                    return "Thu hoàn ứng / Tạm ứng"
                if "kiểm kê" in c:
                    return "Thu chênh lệch kiểm kê quỹ"
                return "Thu tiền hợp đồng dịch vụ" if t.contract_id else (cat_raw or "Thu nhập khác")

            # Sensitive / Diplomatic / Facilitation expenses mapped naturally
            if any(k in c for k in ["ngoại giao", "đối ngoại", "quan hệ", "cơ chế", "xử lý hồ sơ", "xử lý nhanh", "bôi trơn", "đút lót", "hỗ trợ ban ngành", "hỗ trợ phòng tnmt"]):
                return "Chi ngoại giao & Xử lý hồ sơ"
            if any(k in c for k in ["dẫn mốc", "giáp ranh", "bồi dưỡng", "thực địa", "hiện trường", "thẩm định", "cán bộ địa chính"]):
                return "Bồi dưỡng thẩm định & Hiện trường"
            if any(k in c for k in ["thụ lý", "bản vẽ", "trích lục", "lấy sổ", "lấy trích lục", "lấy bản vẽ", "cấp giấy", "viết hồ sơ"]):
                return "Chi thụ lý bản vẽ & Trích lục"
            if any(k in c for k in ["công chứng", "lệ phí", "thuế", "đóng thuế", "vi bằng", "trước bạ"]):
                return "Công chứng, Lệ phí & Nghĩa vụ thuế"
            if any(k in c for k in ["tiếp khách", "giao tế", "cà phê", "quầy nước", "ăn uống", "marketing", "sự kiện"]):
                return "Chi tiếp khách & Giao tế"
            if any(k in c for k in ["lương", "thưởng", "hoa hồng", "nhân công", "3p", "thù lao"]):
                return "Chi lương, Thù lao & Hoa hồng 3P"
            if any(k in c for k in ["xăng", "đi lại", "xe", "grap", "grab", "công tác", "bưu chính", "chuyển phát"]):
                return "Công tác phí & Di chuyển hiện trường"
            if any(k in c for k in ["văn phòng phẩm", "in ấn", "photocopy", "giấy", "bản đồ"]):
                return "Văn phòng phẩm & In ấn kỹ thuật"
            if any(k in c for k in ["điện", "nước", "internet", "mạng", "viễn thông"]):
                return "Điện - Nước - Internet"
            if any(k in c for k in ["sửa chữa", "bảo trì", "thiết bị", "máy tính", "máy in", "kiểm định", "máy đo", "rtk", "toàn đạc"]):
                return "Sửa chữa, Kiểm định máy đo & Thiết bị"
            if any(k in c for k in ["hoàn trả", "trả lại", "nộp thừa", "hoàn cọc"]):
                return "Chi hoàn trả khách hàng"
            if any(k in c for k in ["hủy phiếu", "hoàn tác", "void", "refund"]):
                return "Chi điều chỉnh hủy phiếu"
            if any(k in c for k in ["kiểm kê"]):
                return "Chi chênh lệch kiểm kê quỹ"

            return cat_raw or "Chi phí hành chính & Khác"

        # Map categories
        cat_map = {c: {"income": 0.0, "expenditure": 0.0} for c in standard_categories}

        for t in txs:
            normalized_cat = normalize_category(t.category_code, t.transaction_type)
            if normalized_cat not in cat_map:
                cat_map[normalized_cat] = {"income": 0.0, "expenditure": 0.0}

            amt = float(t.amount or 0.0)
            if t.transaction_type == "Thu":
                cat_map[normalized_cat]["income"] += amt
            else:
                cat_map[normalized_cat]["expenditure"] += amt

        categories_list = [
            {
                "name": k,
                "income": v["income"],
                "expenditure": v["expenditure"]
            }
            for k, v in cat_map.items()
            if v["income"] > 0 or v["expenditure"] > 0 or k in standard_categories[:6]
        ]

        # Load official departments from DB
        db_depts = db.query(Department).order_by(Department.id).all()
        official_dept_names = [d.name for d in db_depts] if db_depts else [
            "Phòng Đo vẽ", "Phòng Pháp lý", "Phòng Sale / CSKH", "Phòng Kế toán", "Ban Giám đốc"
        ]
        dept_map = {d: {"income": 0.0, "expenditure": 0.0} for d in official_dept_names}

        # Batch pre-fetch all contracts and project service lines in this month's transactions
        contract_ids = {t.contract_id for t in txs if t.contract_id}
        project_ids = {t.project_id for t in txs if t.project_id}
        contracts_map = {
            c.id: c for c in db.query(Contract).filter(Contract.id.in_(contract_ids)).all()
        } if contract_ids else {}
        projects_map = {
            p.id: p for p in db.query(ServiceLine).filter(ServiceLine.id.in_(project_ids)).all()
        } if project_ids else {}

        def resolve_department(t):
            dept_raw = (t.department_code or "").strip().lower()
            if any(k in dept_raw for k in ["đo vẽ", "dove", "survey"]):
                return "Phòng Đo vẽ"
            if any(k in dept_raw for k in ["pháp lý", "phaply", "legal"]):
                return "Phòng Pháp lý"
            if any(k in dept_raw for k in ["sale", "cskh", "kinh doanh", "crm"]):
                return "Phòng Sale / CSKH"
            if any(k in dept_raw for k in ["kế toán", "ketoan", "finance"]):
                return "Phòng Kế toán"
            if any(k in dept_raw for k in ["giám đốc", "admin", "ban giám đốc", "quản trị"]):
                return "Ban Giám đốc"

            if t.contract_id and t.contract_id in contracts_map:
                c = contracts_map[t.contract_id]
                st = ((c.service_type or "") + " " + (c.service_package or "")).lower()
                if any(k in st for k in ["đo vẽ", "đo đạc", "khảo sát", "hiện trạng", "cắm mốc", "bản đồ"]):
                    return "Phòng Đo vẽ"
                if any(k in st for k in ["pháp lý", "hợp thửa", "tách thửa", "cấp sổ", "sang tên", "thừa kế", "chuyển mục đích", "thủ tục"]):
                    return "Phòng Pháp lý"
                return "Phòng Sale / CSKH"

            if t.project_id and t.project_id in projects_map:
                sl = projects_map[t.project_id]
                st = (sl.service_type or "").lower()
                if any(k in st for k in ["đo vẽ", "đo đạc", "khảo sát", "hiện trạng"]):
                    return "Phòng Đo vẽ"
                if any(k in st for k in ["pháp lý", "hợp thửa", "tách thửa", "cấp sổ", "thủ tục"]):
                    return "Phòng Pháp lý"

            cat = (t.category_code or "").lower()
            if any(k in cat for k in ["bản vẽ", "đo đạc", "khảo sát", "hiện trường"]):
                return "Phòng Đo vẽ"
            if any(k in cat for k in ["công chứng", "thụ lý", "pháp lý", "sổ đỏ", "địa chính"]):
                return "Phòng Pháp lý"
            if any(k in cat for k in ["marketing", "hoa hồng", "bán hàng", "quảng cáo", "tiếp khách"]):
                return "Phòng Sale / CSKH"
            if any(k in cat for k in ["hoàn trả", "nộp thừa", "kiểm kê", "hoàn cọc"]):
                return "Phòng Kế toán"

            return "Ban Giám đốc"

        for t in txs:
            dept = resolve_department(t)
            if dept not in dept_map:
                dept_map[dept] = {"income": 0.0, "expenditure": 0.0}
            amt = float(t.amount or 0.0)
            if t.transaction_type == "Thu":
                dept_map[dept]["income"] += amt
            else:
                dept_map[dept]["expenditure"] += amt

        departments_list = [
            {
                "name": k,
                "income": v["income"],
                "expenditure": v["expenditure"]
            }
            for k, v in dept_map.items()
        ]

        return {
            "status": "success",
            "month": m_num,
            "year": year,
            "total_income": total_income,
            "total_expenditure": total_expenditure,
            "net_difference": net_difference,
            "categories": categories_list,
            "departments": departments_list
        }
