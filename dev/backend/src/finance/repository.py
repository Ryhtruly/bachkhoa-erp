from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, or_
from datetime import datetime, date, timezone, timedelta
from typing import Optional, List, Dict

from src.db.models import (
    CashflowTransaction, Contract, Customer, Receivable,
    ProjectTask, Employee, Department, User, KpiPayroll,
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
    def get_running_balance(db: Session, hinh_thuc: str, up_to_datetime: Optional[datetime] = None) -> float:
        tz_vn = timezone(timedelta(hours=7))
        
        q_snap = db.query(FundOpeningBalance).filter(FundOpeningBalance.hinh_thuc == hinh_thuc)
        if up_to_datetime:
            q_snap = q_snap.filter(FundOpeningBalance.ngay_ap_dung <= up_to_datetime)
        latest_snap = q_snap.order_by(FundOpeningBalance.ngay_ap_dung.desc(), FundOpeningBalance.id.desc()).first()
        
        if latest_snap:
            start_bal = float(latest_snap.so_tien_dau_ky)
            start_time = latest_snap.ngay_ap_dung
            start_time_local = start_time.astimezone(tz_vn) if start_time.tzinfo else start_time.replace(tzinfo=timezone.utc).astimezone(tz_vn)
            start_date = start_time_local.date()
        else:
            key = "initial_cash_balance" if hinh_thuc == "Tiền mặt" else "initial_bank_balance"
            start_bal = FinanceRepository.get_setting_value(db, key, 0.0)
            start_date = None

        q_thu = db.query(func.sum(CashflowTransaction.so_tien)).filter(
            CashflowTransaction.loai == "Thu",
            CashflowTransaction.hinh_thuc == hinh_thuc,
            CashflowTransaction.scope == "Công ty"
        )
        
        q_chi = db.query(func.sum(CashflowTransaction.so_tien)).filter(
            CashflowTransaction.loai == "Chi",
            CashflowTransaction.hinh_thuc == hinh_thuc,
            CashflowTransaction.scope == "Công ty"
        )
        
        if start_date:
            q_thu = q_thu.filter(CashflowTransaction.ngay > start_date)
            q_chi = q_chi.filter(CashflowTransaction.ngay > start_date)
            
        if up_to_datetime:
            up_to_date = up_to_datetime.astimezone(tz_vn).date() if up_to_datetime.tzinfo else up_to_datetime.replace(tzinfo=timezone.utc).astimezone(tz_vn).date()
            q_thu = q_thu.filter(CashflowTransaction.ngay <= up_to_date)
            q_chi = q_chi.filter(CashflowTransaction.ngay <= up_to_date)
            
        thu_sum = float(q_thu.scalar() or 0.0)
        chi_sum = float(q_chi.scalar() or 0.0)
        
        return start_bal + thu_sum - chi_sum

    @staticmethod
    def generate_voucher_id(type_val: str, db: Session, target_date: date = None) -> str:
        prefix = "PT" if type_val == "Thu" else "PC"
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
                    extract("year", func.coalesce(CashflowTransaction.ngay, func.date(CashflowTransaction.created_at))) == int(y),
                    extract("month", func.coalesce(CashflowTransaction.ngay, func.date(CashflowTransaction.created_at))) == int(m)
                )
            except Exception:
                pass
        if type and type not in ("All", ""):
            q = q.filter(CashflowTransaction.loai == type)
        if payment_method and payment_method not in ("All", ""):
            q = q.filter(CashflowTransaction.hinh_thuc == payment_method)
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

        thu = sum(float(r.so_tien or 0) for r in rows if r.loai == "Thu")
        chi = sum(float(r.so_tien or 0) for r in rows if r.loai == "Chi")
        customer = db.query(Customer).filter(Customer.id == contract.customer_id).first()

        return {
            "contract": contract,
            "customer_name": customer.full_name if customer else "",
            "tong_thu": thu,
            "tong_chi": chi,
            "transactions": rows,
        }

    @staticmethod
    def get_cashflow_by_project(db: Session, project_id: str) -> Dict:
        project = db.query(ProjectTask).filter(ProjectTask.id == project_id).first()
        if not project:
            return None

        rows = db.query(CashflowTransaction).filter(
            CashflowTransaction.project_id == project_id
        ).order_by(CashflowTransaction.created_at.desc()).all()

        thu = sum(float(r.so_tien or 0) for r in rows if r.loai == "Thu")
        chi = sum(float(r.so_tien or 0) for r in rows if r.loai == "Chi")

        return {
            "project_id": project_id,
            "task_name": project.task_name or "",
            "contract_id": project.contract_id or "",
            "tong_thu": thu,
            "tong_chi": chi,
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
        data["ngay"] = str(t.ngay) if t.ngay else ""
        data["ghi_chu"] = t.ghi_chu or ""
        return data

    @staticmethod
    def list_contracts_with_payments(db: Session) -> list:
        rows = db.query(Contract, Customer.full_name, Customer.phone).outerjoin(
            Customer, Contract.customer_id == Customer.id
        ).order_by(Contract.created_at.desc()).all()
        result = []
        for contract, cust_name, cust_phone in rows:
            paid = float(db.query(func.sum(CashflowTransaction.so_tien)).filter(
                CashflowTransaction.contract_id == contract.id,
                CashflowTransaction.loai == "Thu"
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
            CashflowTransaction.loai == "Chi",
            CashflowTransaction.hinh_thuc == "Chuyển khoản",
            CashflowTransaction.contract_id.is_(None)
        ).order_by(CashflowTransaction.created_at.desc()).all()
        total = sum(float(r.so_tien or 0) for r in rows)
        from src.finance.serializers import serialize_cashflow_bulk
        return {"total_payable": total, "transactions": serialize_cashflow_bulk(rows, db)}

    @staticmethod
    def list_advances_formatted(db: Session) -> list:
        rows = db.query(CashflowTransaction).filter(
            CashflowTransaction.loai == "Chi",
            or_(CashflowTransaction.hang_muc.ilike("%tạm ứng%"),
                CashflowTransaction.dien_giai.ilike("%tạm ứng%")),
            CashflowTransaction.trang_thai != "Đã quyết toán"
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
        employees = db.query(Employee).filter(Employee.is_active == True).all()
        result = []
        for emp in employees:
            q = db.query(KpiPayroll).filter(KpiPayroll.employee_id == emp.id)
            if period_month:
                q = q.filter(KpiPayroll.month == period_month)
            kpi = q.order_by(KpiPayroll.created_at.desc()).first()
            result.append({
                "id": emp.id, "full_name": emp.full_name or "",
                "department": emp.department or "",
                "base_salary": float(emp.base_salary or 0),
                "kpi_score": float(kpi.kpi_score or 0) if kpi else 0,
                "bonus": float(kpi.bonus or 0) if kpi else 0,
                "total_salary": float(kpi.total_salary or 0) if kpi else float(emp.base_salary or 0),
                "month": kpi.month.strftime("%Y-%m") if kpi and kpi.month else (month or ""),
                "tasks_completed": kpi.tasks_completed if kpi else 0,
            })
        return result

    @staticmethod
    def list_worker_wages_formatted(db: Session, project_id: Optional[str] = None) -> dict:
        q = db.query(CashflowTransaction).filter(
            CashflowTransaction.loai == "Chi",
            or_(CashflowTransaction.hang_muc.ilike("%lương khoán%"),
                CashflowTransaction.dien_giai.ilike("%lương khoán%"))
        )
        if project_id:
            q = q.filter(CashflowTransaction.project_id == project_id)
        rows = q.order_by(CashflowTransaction.created_at.desc()).all()
        total = sum(float(r.so_tien or 0) for r in rows)
        from src.finance.serializers import serialize_cashflow_bulk
        return {"total_wages": total, "transactions": serialize_cashflow_bulk(rows, db)}

    @staticmethod
    def list_worker_wage_records_formatted(db: Session, month: Optional[str] = None) -> list:
        q = db.query(CashflowTransaction).filter(
            CashflowTransaction.loai == "Chi",
            or_(CashflowTransaction.hang_muc.ilike("%lương khoán%"),
                CashflowTransaction.dien_giai.ilike("%lương khoán%"))
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
            note = (r.dien_giai or "").replace("Lương khoán:", "").strip()
            details.append({
                "Nhân sự": r.nguoi_nhan_nop or "Tổ thợ",
                "Mã hồ sơ": r.project_id or "Chưa gắn",
                "Công đoạn khoán": note or "Nghiệm thu công việc",
                "Số tiền khoán": float(r.so_tien or 0),
                "Phụ cấp": 0.0,
                "Thưởng/Phạt": 0.0,
                "Tổng nhận": float(r.so_tien or 0),
                "Ngày chốt": r.ngay.strftime("%d/%m/%y") if r.ngay else (r.created_at.strftime("%d/%m/%y") if r.created_at else "")
            })
        return details

    @staticmethod
    def get_summary_report(db: Session) -> Dict:
        tien_mat = FinanceRepository.get_running_balance(db, "Tiền mặt")
        ngan_hang = FinanceRepository.get_running_balance(db, "Chuyển khoản")
        tam_ung_net = float(db.query(func.sum(CashflowTransaction.so_tien)).filter(
            CashflowTransaction.loai == "Chi",
            or_(CashflowTransaction.hang_muc.ilike("%tạm ứng%"),
                CashflowTransaction.dien_giai.ilike("%tạm ứng%")),
            CashflowTransaction.hang_muc != "Chi thực tế từ tạm ứng",
            CashflowTransaction.trang_thai != "Đã quyết toán",
            CashflowTransaction.scope == "Công ty"
        ).scalar() or 0)

        # Monthly trend
        monthly_raw = db.query(
            extract("year", func.coalesce(CashflowTransaction.ngay, func.date(CashflowTransaction.created_at))).label("yr"),
            extract("month", func.coalesce(CashflowTransaction.ngay, func.date(CashflowTransaction.created_at))).label("mo"),
            CashflowTransaction.loai,
            func.sum(CashflowTransaction.so_tien).label("total")
        ).filter(
            CashflowTransaction.scope == "Công ty",
            CashflowTransaction.hang_muc != "Chi phí tạm ứng",
            CashflowTransaction.hang_muc != "Quyết toán hoàn ứng"
        ).group_by("yr", "mo", CashflowTransaction.loai).order_by("yr", "mo").all()

        mm: dict = {}
        for r in monthly_raw:
            if not r.yr: continue
            k = f"{int(r.yr):04d}-{int(r.mo):02d}"
            if k not in mm: mm[k] = {"month": k, "thu": 0, "chi": 0}
            mm[k]["thu" if r.loai == "Thu" else "chi"] = float(r.total)
        monthly = sorted(mm.values(), key=lambda x: x["month"])[-12:]

        # Profit by contract
        thu_by_c = db.query(
            CashflowTransaction.contract_id,
            func.sum(CashflowTransaction.so_tien).label("t")
        ).filter(CashflowTransaction.loai == "Thu",
                 CashflowTransaction.contract_id.isnot(None),
                 CashflowTransaction.scope == "Công ty"
        ).group_by(CashflowTransaction.contract_id).all()

        chi_by_p = db.query(
            CashflowTransaction.project_id,
            func.sum(CashflowTransaction.so_tien).label("t")
        ).filter(
            CashflowTransaction.loai == "Chi",
            CashflowTransaction.project_id.isnot(None),
            CashflowTransaction.scope == "Công ty",
            CashflowTransaction.hang_muc != "Chi phí tạm ứng",
            CashflowTransaction.hang_muc != "Quyết toán hoàn ứng"
        ).group_by(CashflowTransaction.project_id).all()

        pc_map = {p.id: p.contract_id for p in
                  db.query(ProjectTask).filter(ProjectTask.contract_id.isnot(None)).all()}
        thu_map = {r.contract_id: float(r[1]) for r in thu_by_c}
        chi_map: dict = {}
        for r in chi_by_p:
            cid = pc_map.get(r.project_id)
            if cid:
                chi_map[cid] = chi_map.get(cid, 0) + float(r[1])

        # Lương khoán gắn project → quy về contract
        luong_by_p = db.query(
            CashflowTransaction.project_id,
            func.sum(CashflowTransaction.so_tien).label("t")
        ).filter(CashflowTransaction.loai == "Chi",
                 or_(CashflowTransaction.hang_muc.ilike("%lương khoán%"),
                     CashflowTransaction.dien_giai.ilike("%lương khoán%")),
                 CashflowTransaction.project_id.isnot(None)
        ).group_by(CashflowTransaction.project_id).all()
        luong_map: dict = {}
        for r in luong_by_p:
            cid = pc_map.get(r.project_id)
            if cid:
                luong_map[cid] = luong_map.get(cid, 0) + float(r[1])

        profit_list = [
            {
                "contract_id": cid, "thu": thu,
                "chi": chi_map.get(cid, 0),
                "luong_khoan": luong_map.get(cid, 0),
                "profit": thu - chi_map.get(cid, 0) - luong_map.get(cid, 0)
            }
            for cid, thu in thu_map.items()
        ]
        profit_list.sort(key=lambda x: x["profit"], reverse=True)

        return {
            "tien_mat": tien_mat,
            "ngan_hang": ngan_hang,
            "tam_ung_net": tam_ung_net,
            "monthly": monthly,
            "profit_by_contract": profit_list[:20]
        }

    @staticmethod
    def list_projects(db: Session) -> List[ProjectTask]:
        return db.query(ProjectTask).order_by(ProjectTask.created_at.desc()).limit(300).all()

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
            extract("year", CashflowTransaction.ngay) == year,
            extract("month", CashflowTransaction.ngay) == m_num,
            CashflowTransaction.scope == "Công ty",
            CashflowTransaction.hang_muc != "Chi phí tạm ứng",
            CashflowTransaction.hang_muc != "Quyết toán hoàn ứng"
        ).all()

        # Calculate overall totals
        tong_thu = sum(float(t.so_tien or 0.0) for t in txs if t.loai == "Thu")
        tong_chi = sum(float(t.so_tien or 0.0) for t in txs if t.loai == "Chi")

        # Define standard categories to show
        standard_categories = [
            "Văn phòng phẩm", "In ấn - Photocopy", "Chi quầy tiếp nhận", "Ăn uống",
            "Đi lại - Xăng xe - Gửi xe", "Công tác phí", "Chuyển phát - Bưu chính-Grap",
            "Điện - Nước - Internet", "Sửa chữa nhỏ", "Bảo trì thiết bị", "Vệ sinh - Rác thải",
            "Hỗ trợ sự kiện - Marketing", "Chi thụ lý bản vẽ", "Chi bảo vệ", "Công chứng hồ sơ",
            "Thu chênh lệch kiểm kê quỹ", "Chi chênh lệch kiểm kê quỹ"
        ]

        # Map categories
        cat_map = {c: {"thu": 0.0, "chi": 0.0} for c in standard_categories}
        
        # Map any categories not in standard list
        for t in txs:
            cat = t.hang_muc or "Khác"
            normalized_cat = cat
            for sc in standard_categories:
                if sc.lower() in cat.lower() or cat.lower() in sc.lower():
                    normalized_cat = sc
                    break
            
            if normalized_cat not in cat_map:
                cat_map[normalized_cat] = {"thu": 0.0, "chi": 0.0}
                
            amt = float(t.so_tien or 0.0)
            if t.loai == "Thu":
                cat_map[normalized_cat]["thu"] += amt
            else:
                cat_map[normalized_cat]["chi"] += amt

        categories_list = [
            {"name": k, "thu": v["thu"], "chi": v["chi"]}
            for k, v in cat_map.items()
        ]

        # Map departments (Phòng ban/Dự án)
        dept_map = {}
        for t in txs:
            dept = t.du_an_phong_ban or "Khác / Văn phòng"
            if dept not in dept_map:
                dept_map[dept] = {"thu": 0.0, "chi": 0.0}
            amt = float(t.so_tien or 0.0)
            if t.loai == "Thu":
                dept_map[dept]["thu"] += amt
            else:
                dept_map[dept]["chi"] += amt

        departments_list = [
            {"name": k, "thu": v["thu"], "chi": v["chi"]}
            for k, v in dept_map.items()
        ]

        return {
            "status": "success",
            "month": m_num,
            "year": year,
            "tong_thu": tong_thu,
            "tong_chi": tong_chi,
            "chenh_lech": tong_thu - tong_chi,
            "categories": categories_list,
            "departments": departments_list
        }
