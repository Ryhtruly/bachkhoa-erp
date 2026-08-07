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
    def get_running_balance(db: Session, payment_method: str, up_to_datetime: Optional[datetime] = None) -> float:
        tz_vn = timezone(timedelta(hours=7))
        
        # Map English payment method to Vietnamese for FundOpeningBalance (separate table, not migrated)
        fob_hinh_thuc = "Tiền mặt" if payment_method == "CASH" else "Chuyển khoản"
        
        q_snap = db.query(FundOpeningBalance).filter(FundOpeningBalance.hinh_thuc == fob_hinh_thuc)
        if up_to_datetime:
            q_snap = q_snap.filter(FundOpeningBalance.ngay_ap_dung <= up_to_datetime)
        latest_snap = q_snap.order_by(FundOpeningBalance.ngay_ap_dung.desc(), FundOpeningBalance.id.desc()).first()
        
        if latest_snap:
            start_bal = float(latest_snap.so_tien_dau_ky)
            start_time = latest_snap.ngay_ap_dung
            start_time_local = start_time.astimezone(tz_vn) if start_time.tzinfo else start_time.replace(tzinfo=timezone.utc).astimezone(tz_vn)
            start_date = start_time_local.date()
        else:
            key = "initial_cash_balance" if payment_method == "CASH" else "initial_bank_balance"
            start_bal = FinanceRepository.get_setting_value(db, key, 0.0)
            start_date = None

        q_income = db.query(func.sum(CashflowTransaction.amount)).filter(
            CashflowTransaction.transaction_type == "INCOME",
            CashflowTransaction.payment_method == payment_method,
            CashflowTransaction.scope == "INTERNAL"
        )
        
        q_expense = db.query(func.sum(CashflowTransaction.amount)).filter(
            CashflowTransaction.transaction_type == "EXPENSE",
            CashflowTransaction.payment_method == payment_method,
            CashflowTransaction.scope == "INTERNAL"
        )
        
        if start_date:
            q_income = q_income.filter(CashflowTransaction.transaction_date > start_date)
            q_expense = q_expense.filter(CashflowTransaction.transaction_date > start_date)
            
        if up_to_datetime:
            up_to_date = up_to_datetime.astimezone(tz_vn).date() if up_to_datetime.tzinfo else up_to_datetime.replace(tzinfo=timezone.utc).astimezone(tz_vn).date()
            q_income = q_income.filter(CashflowTransaction.transaction_date <= up_to_date)
            q_expense = q_expense.filter(CashflowTransaction.transaction_date <= up_to_date)
            
        income_sum = float(q_income.scalar() or 0.0)
        expense_sum = float(q_expense.scalar() or 0.0)
        
        return start_bal + income_sum - expense_sum

    @staticmethod
    def generate_voucher_id(type_val: str, db: Session, target_date: date = None) -> str:
        prefix = "PT" if type_val == "INCOME" else "PC"
        now = target_date or datetime.now().date()
        month_str = now.strftime("%m")
        year_str = now.strftime("%Y")
        
        serial = 1
        while True:
            proposed_id = f"{prefix}-{month_str}/{year_str}-{serial:03d}"
            exists = db.query(CashflowTransaction.id).filter(CashflowTransaction.id == proposed_id).first()
            if not exists:
                return proposed_id
            serial += 1

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

        income = sum(float(r.amount or 0) for r in rows if r.transaction_type == "INCOME")
        expense = sum(float(r.amount or 0) for r in rows if r.transaction_type == "EXPENSE")
        customer = db.query(Customer).filter(Customer.id == contract.customer_id).first()

        return {
            "contract": contract,
            "customer_name": customer.full_name if customer else "",
            "total_income": income,
            "total_expense": expense,
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

        income = sum(float(r.amount or 0) for r in rows if r.transaction_type == "INCOME")
        expense = sum(float(r.amount or 0) for r in rows if r.transaction_type == "EXPENSE")

        return {
            "project_id": project_id,
            "task_name": project.service_type or "",
            "contract_id": project.contract_id or "",
            "total_income": income,
            "total_expense": expense,
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
        result = []
        for contract, cust_name, cust_phone in rows:
            paid = float(db.query(func.sum(CashflowTransaction.amount)).filter(
                CashflowTransaction.contract_id == contract.id,
                CashflowTransaction.transaction_type == "INCOME"
            ).scalar() or 0)
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
        rows = db.query(Receivable).order_by(Receivable.due_date.asc().nullslast()).all()
        result = []
        for r in rows:
            remaining = float(r.remaining_amount or 0)
            overdue = bool(r.due_date and r.due_date < today and remaining > 0)
            result.append({
                "id": r.id,
                "contract_id": r.contract_id or "",
                "paid_amount": float(r.paid_amount or 0),
                "remaining_amount": remaining,
                "due_date": str(r.due_date) if r.due_date else "",
                "overdue": overdue,
                "created_at": r.created_at.strftime("%d/%m/%y") if r.created_at else "",
            })
        return result

    @staticmethod
    def list_payables_formatted(db: Session) -> dict:
        rows = db.query(CashflowTransaction).filter(
            CashflowTransaction.transaction_type == "EXPENSE",
            CashflowTransaction.payment_method == "BANK_TRANSFER",
            CashflowTransaction.contract_id.is_(None)
        ).order_by(CashflowTransaction.created_at.desc()).all()
        total = sum(float(r.amount or 0) for r in rows)
        from src.finance.serializers import serialize_cashflow_bulk
        return {"total_payable": total, "transactions": serialize_cashflow_bulk(rows, db)}

    @staticmethod
    def list_advances_formatted(db: Session) -> list:
        rows = db.query(CashflowTransaction).filter(
            CashflowTransaction.transaction_type == "EXPENSE",
            or_(CashflowTransaction.category_code.ilike("%tạm ứng%"),
                CashflowTransaction.description.ilike("%tạm ứng%")),
            CashflowTransaction.status != "COMPLETED"
        ).order_by(CashflowTransaction.created_at.desc()).all()
        from src.finance.serializers import serialize_cashflow_bulk
        return serialize_cashflow_bulk(rows, db)

    @staticmethod
    def list_employee_departments(db: Session) -> List[Department]:
        return db.query(Department).order_by(Department.name.asc()).all()

    @staticmethod
    def list_employees(db: Session) -> List[tuple]:
        return (
            db.query(Employee, Department.name)
            .outerjoin(Department, Department.id == Employee.department_id)
            .order_by(Employee.full_name.asc(), Employee.created_at.desc())
            .all()
        )

    @staticmethod
    def get_employee_by_id(db: Session, employee_id: str) -> Optional[tuple]:
        return (
            db.query(Employee, Department.name)
            .outerjoin(Department, Department.id == Employee.department_id)
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
              select :period_month::date as start_date,
                     (:period_month::date + interval '1 month')::date as end_date
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
            CashflowTransaction.transaction_type == "EXPENSE",
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
            CashflowTransaction.transaction_type == "EXPENSE",
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
                "worker_name": r.payer_payee_name or "Tổ thợ",
                "project_id": r.project_id or "Chưa gắn",
                "task_description": note or "Nghiệm thu công việc",
                "wage_amount": float(r.amount or 0),
                "allowance": 0.0,
                "bonus_penalty": 0.0,
                "total_received": float(r.amount or 0),
                "settlement_date": r.transaction_date.strftime("%d/%m/%y") if r.transaction_date else (r.created_at.strftime("%d/%m/%y") if r.created_at else "")
            })
        return details

    @staticmethod
    def get_summary_report(db: Session) -> Dict:
        cash_balance = FinanceRepository.get_running_balance(db, "CASH")
        bank_balance = FinanceRepository.get_running_balance(db, "BANK_TRANSFER")
        advance_net = float(db.query(func.sum(CashflowTransaction.amount)).filter(
            CashflowTransaction.transaction_type == "EXPENSE",
            or_(CashflowTransaction.category_code.ilike("%tạm ứng%"),
                CashflowTransaction.description.ilike("%tạm ứng%")),
            CashflowTransaction.category_code != "Chi thực tế từ tạm ứng",
            CashflowTransaction.status != "COMPLETED",
            CashflowTransaction.scope == "INTERNAL"
        ).scalar() or 0)

        # Monthly trend
        monthly_raw = db.query(
            extract("year", func.coalesce(CashflowTransaction.transaction_date, func.date(CashflowTransaction.created_at))).label("yr"),
            extract("month", func.coalesce(CashflowTransaction.transaction_date, func.date(CashflowTransaction.created_at))).label("mo"),
            CashflowTransaction.transaction_type,
            func.sum(CashflowTransaction.amount).label("total")
        ).filter(
            CashflowTransaction.scope == "INTERNAL",
            CashflowTransaction.category_code != "Chi phí tạm ứng",
            CashflowTransaction.category_code != "Quyết toán hoàn ứng"
        ).group_by("yr", "mo", CashflowTransaction.transaction_type).order_by("yr", "mo").all()

        mm: dict = {}
        for r in monthly_raw:
            if not r.yr: continue
            k = f"{int(r.yr):04d}-{int(r.mo):02d}"
            if k not in mm: mm[k] = {"month": k, "income": 0, "expense": 0}
            mm[k]["income" if r.transaction_type == "INCOME" else "expense"] = float(r.total)
        monthly = sorted(mm.values(), key=lambda x: x["month"])[-12:]

        # Profit by contract
        income_by_c = db.query(
            CashflowTransaction.contract_id,
            func.sum(CashflowTransaction.amount).label("t")
        ).filter(CashflowTransaction.transaction_type == "INCOME",
                 CashflowTransaction.contract_id.isnot(None),
                 CashflowTransaction.scope == "INTERNAL"
        ).group_by(CashflowTransaction.contract_id).all()

        expense_by_p = db.query(
            CashflowTransaction.project_id,
            func.sum(CashflowTransaction.amount).label("t")
        ).filter(
            CashflowTransaction.transaction_type == "EXPENSE",
            CashflowTransaction.project_id.isnot(None),
            CashflowTransaction.scope == "INTERNAL",
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
        ).filter(CashflowTransaction.transaction_type == "EXPENSE",
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
                "contract_id": cid, "income": inc,
                "expense": expense_map.get(cid, 0),
                "contract_wage": wage_map.get(cid, 0),
                "profit": inc - expense_map.get(cid, 0) - wage_map.get(cid, 0)
            }
            for cid, inc in income_map.items()
        ]
        profit_list.sort(key=lambda x: x["profit"], reverse=True)

        return {
            "cash_balance": cash_balance,
            "bank_balance": bank_balance,
            "advance_net": advance_net,
            "monthly": monthly,
            "profit_by_contract": profit_list[:20]
        }

    @staticmethod
    def list_projects(db: Session) -> List[ServiceLine]:
        return db.query(ServiceLine).order_by(ServiceLine.id.desc()).limit(300).all()

    @staticmethod
    def get_finance_settings(db: Session) -> Dict:
        return {
            "initial_cash_balance": FinanceRepository.get_setting_value(db, "initial_cash_balance"),
            "initial_bank_balance": FinanceRepository.get_setting_value(db, "initial_bank_balance"),
            "initial_total_income": FinanceRepository.get_setting_value(db, "initial_total_income"),
            "initial_total_expenditure": FinanceRepository.get_setting_value(db, "initial_total_expenditure")
        }

    @staticmethod
    def get_fund_balances_history(db: Session) -> List[FundOpeningBalance]:
        return db.query(FundOpeningBalance).order_by(FundOpeningBalance.ngay_ap_dung.desc(), FundOpeningBalance.id.desc()).all()

    @staticmethod
    def get_monthly_dashboard(db: Session, month: str) -> dict:
        try:
            y_str, m_str = month.split("-")
            year = int(y_str)
            m_num = int(m_str)
        except Exception:
            raise HTTPException(status_code=400, detail="Tháng không hợp lệ. Format phải là YYYY-MM")

        # Filter transactions in this month
        txs = db.query(CashflowTransaction).filter(
            extract("year", CashflowTransaction.transaction_date) == year,
            extract("month", CashflowTransaction.transaction_date) == m_num,
            CashflowTransaction.scope == "INTERNAL",
            CashflowTransaction.category_code != "Chi phí tạm ứng",
            CashflowTransaction.category_code != "Quyết toán hoàn ứng"
        ).all()

        # Calculate overall totals
        total_income = sum(float(t.amount or 0.0) for t in txs if t.transaction_type == "INCOME")
        total_expense = sum(float(t.amount or 0.0) for t in txs if t.transaction_type == "EXPENSE")

        # Define standard categories to show
        standard_categories = [
            "Văn phòng phẩm", "In ấn - Photocopy", "Chi quầy tiếp nhận", "Ăn uống",
            "Đi lại - Xăng xe - Gửi xe", "Công tác phí", "Chuyển phát - Bưu chính-Grap",
            "Điện - Nước - Internet", "Sửa chữa nhỏ", "Bảo trì thiết bị", "Vệ sinh - Rác thải",
            "Hỗ trợ sự kiện - Marketing", "Chi thụ lý bản vẽ", "Chi bảo vệ", "Công chứng hồ sơ",
            "Thu chênh lệch kiểm kê quỹ", "Chi chênh lệch kiểm kê quỹ"
        ]

        # Map categories
        cat_map = {c: {"income": 0.0, "expense": 0.0} for c in standard_categories}
        
        # Map any categories not in standard list
        for t in txs:
            cat = t.category_code or "Khác"
            normalized_cat = cat
            for sc in standard_categories:
                if sc.lower() in cat.lower() or cat.lower() in sc.lower():
                    normalized_cat = sc
                    break
            
            if normalized_cat not in cat_map:
                cat_map[normalized_cat] = {"income": 0.0, "expense": 0.0}
                
            amt = float(t.amount or 0.0)
            if t.transaction_type == "INCOME":
                cat_map[normalized_cat]["income"] += amt
            else:
                cat_map[normalized_cat]["expense"] += amt

        categories_list = [
            {"name": k, "income": v["income"], "expense": v["expense"]}
            for k, v in cat_map.items()
        ]

        # Map departments
        dept_map = {}
        for t in txs:
            dept = t.department_code or "Khác / Văn phòng"
            if dept not in dept_map:
                dept_map[dept] = {"income": 0.0, "expense": 0.0}
            amt = float(t.amount or 0.0)
            if t.transaction_type == "INCOME":
                dept_map[dept]["income"] += amt
            else:
                dept_map[dept]["expense"] += amt

        departments_list = [
            {"name": k, "income": v["income"], "expense": v["expense"]}
            for k, v in dept_map.items()
        ]

        return {
            "status": "success",
            "month": m_num,
            "year": year,
            "total_income": total_income,
            "total_expense": total_expense,
            "net_difference": total_income - total_expense,
            "categories": categories_list,
            "departments": departments_list
        }
