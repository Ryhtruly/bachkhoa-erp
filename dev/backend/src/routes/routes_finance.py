from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from datetime import date, datetime, timezone, timedelta

from src.db.database import get_db
from src.core.auth import require_permission, User
from src.finance import (
    FinanceRepository, FinanceService,
    CashflowIn, CashflowUpdateIn, CashflowVoidIn,
    AdvanceCreateIn, AdvanceClearIn, FundCloseIn,
    WageCreateIn, EmployeeUpsertIn, FinanceSettingsIn,
    serialize_cashflow, serialize_cashflow_bulk, serialize_employee
)

router = APIRouter(prefix="/api/finance", tags=["Finance ERP"])

# ══════════════════════════════════════════════════════════════
# 1. DÒNG TIỀN — Cashflow
# ══════════════════════════════════════════════════════════════

@router.get("/next-voucher-id")
def get_next_voucher_id(
    type: str = "Thu",
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    return {"next_id": FinanceRepository.generate_voucher_id(type, db)}

@router.get("/cashflow")
def list_cashflow(
    month: str = Query(None),
    type: str = Query(None),
    payment_method: str = Query(None),
    project_id: str = Query(None),
    contract_id: str = Query(None),
    scope: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    rows = FinanceRepository.list_cashflow_transactions(
        db, month=month, type=type, payment_method=payment_method,
        project_id=project_id, contract_id=contract_id, scope=scope
    )
    return serialize_cashflow_bulk(rows, db)

@router.get("/cashflow/by-contract/{contract_id}")
def cashflow_by_contract(
    contract_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    res = FinanceRepository.get_cashflow_by_contract(db, contract_id)
    if not res:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy Hợp Đồng '{contract_id}'")
    return {
        "contract_id": contract_id,
        "customer_name": res["customer_name"],
        "total_value": float(res["contract"].total_value or 0),
        "tong_thu": res["tong_thu"],
        "tong_chi": res["tong_chi"],
        "transactions": serialize_cashflow_bulk(res["transactions"], db),
    }

@router.get("/cashflow/by-project/{project_id}")
def cashflow_by_project(
    project_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    res = FinanceRepository.get_cashflow_by_project(db, project_id)
    if not res:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy Hồ Sơ '{project_id}'")
    return {
        "project_id": project_id,
        "task_name": res["task_name"],
        "contract_id": res["contract_id"],
        "tong_thu": res["tong_thu"],
        "tong_chi": res["tong_chi"],
        "transactions": serialize_cashflow_bulk(res["transactions"], db),
    }

@router.get("/cashflow/cash")
def cashflow_cash(
    month: str = Query(None),
    type: str = Query(None),
    payment_method: str = Query(None),
    project_id: str = Query(None),
    contract_id: str = Query(None),
    scope: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    balance = FinanceRepository.get_running_balance(db, "Tiền mặt")
    initial_income = FinanceRepository.get_setting_value(db, "initial_total_income")
    initial_expense = FinanceRepository.get_setting_value(db, "initial_total_expenditure")
    
    rows = FinanceRepository.list_cashflow_transactions(
        db, month=month, type=type, payment_method="Tiền mặt",
        project_id=project_id, contract_id=contract_id, scope=scope
    )
    
    filtered_thu = sum(float(r.so_tien or 0) for r in rows if r.loai == "Thu")
    filtered_chi = sum(float(r.so_tien or 0) for r in rows if r.loai == "Chi")

    return {
        "balance": balance,
        "tong_thu": initial_income + filtered_thu,
        "tong_chi": initial_expense + filtered_chi,
        "transactions": serialize_cashflow_bulk(rows, db)
    }

@router.get("/cashflow/bank")
def cashflow_bank(
    month: str = Query(None),
    type: str = Query(None),
    payment_method: str = Query(None),
    project_id: str = Query(None),
    contract_id: str = Query(None),
    scope: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    balance = FinanceRepository.get_running_balance(db, "Chuyển khoản")
    initial_income = FinanceRepository.get_setting_value(db, "initial_total_income")
    initial_expense = FinanceRepository.get_setting_value(db, "initial_total_expenditure")
    
    rows = FinanceRepository.list_cashflow_transactions(
        db, month=month, type=type, payment_method="Chuyển khoản",
        project_id=project_id, contract_id=contract_id, scope=scope
    )
    
    filtered_thu = sum(float(r.so_tien or 0) for r in rows if r.loai == "Thu")
    filtered_chi = sum(float(r.so_tien or 0) for r in rows if r.loai == "Chi")

    return {
        "balance": balance,
        "tong_thu": initial_income + filtered_thu,
        "tong_chi": initial_expense + filtered_chi,
        "transactions": serialize_cashflow_bulk(rows, db)
    }

@router.post("/cashflow/create")
def create_cashflow(
    payload: CashflowIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "create"))
):
    return FinanceService.create_cashflow(db, payload, actor_id=user.id)

@router.get("/cashflow/{transaction_id:path}")
def get_cashflow_detail(
    transaction_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    return FinanceRepository.get_cashflow_detail(db, transaction_id)

@router.put("/cashflow/{transaction_id:path}")
def update_cashflow(
    transaction_id: str,
    payload: CashflowUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "update"))
):
    return FinanceService.update_cashflow(db, transaction_id, payload, actor_id=user.id)

@router.post("/cashflow/{transaction_id:path}/void")
def void_cashflow(
    transaction_id: str,
    payload: CashflowVoidIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "delete"))
):
    actor = payload.actor_id or user.id
    return FinanceService.void_cashflow(db, transaction_id, payload.reason, actor)


# ══════════════════════════════════════════════════════════════
# 2. CHỨNG TỪ & CÔNG NỢ
# ══════════════════════════════════════════════════════════════

@router.get("/contracts")
def list_contracts(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    return FinanceRepository.list_contracts_with_payments(db)

@router.get("/receivables")
def list_receivables(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    return FinanceRepository.list_receivables_formatted(db)

@router.get("/payables")
def list_payables(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    return FinanceRepository.list_payables_formatted(db)


# ══════════════════════════════════════════════════════════════
# 3. TẠM ỨNG
# ══════════════════════════════════════════════════════════════

@router.get("/advance")
def list_advance(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    return FinanceRepository.list_advances_formatted(db)

@router.post("/advance/create")
def create_advance(
    payload: AdvanceCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "create"))
):
    return FinanceService.create_advance(db, payload)

@router.post("/advance/clear")
def clear_advance(
    payload: AdvanceClearIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "update"))
):
    return FinanceService.clear_advance(db, payload)


# ══════════════════════════════════════════════════════════════
# 4. NHÂN SỰ & LƯƠNG
# ══════════════════════════════════════════════════════════════

@router.get("/employees/departments")
def list_employee_departments(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("hr", "read"))
):
    departments = FinanceRepository.list_employee_departments(db)
    return [{"id": department.id, "name": department.name} for department in departments]

@router.get("/employees")
def list_employees(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("hr", "read"))
):
    rows = FinanceRepository.list_employees(db)
    return [serialize_employee(employee, department_name) for employee, department_name in rows]

@router.get("/employees/{employee_id}")
def get_employee(
    employee_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("hr", "read"))
):
    row = FinanceRepository.get_employee_by_id(db, employee_id)
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhân sự.")
    return serialize_employee(row[0], row[1])

@router.post("/employees", status_code=201)
def create_employee(
    payload: EmployeeUpsertIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("hr", "create"))
):
    return FinanceService.create_employee(db, payload)

@router.put("/employees/{employee_id}")
def update_employee(
    employee_id: str,
    payload: EmployeeUpsertIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("hr", "update"))
):
    return FinanceService.update_employee(db, employee_id, payload)

@router.delete("/employees/{employee_id}")
def delete_employee(
    employee_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("hr", "delete"))
):
    return FinanceService.delete_employee(db, employee_id)

@router.get("/payroll")
def list_payroll(
    month: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "read"))
):
    return FinanceRepository.list_payroll_formatted(db, month)

@router.get("/payroll/workers")
def list_worker_wages(
    project_id: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "read"))
):
    return FinanceRepository.list_worker_wages_formatted(db, project_id)

@router.get("/payroll/workers/records")
def get_worker_wage_records(
    month: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "read"))
):
    return FinanceRepository.list_worker_wage_records_formatted(db, month)

@router.post("/payroll/workers/create")
def create_worker_wage(
    payload: WageCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "create"))
):
    return FinanceService.create_worker_wage(db, payload)


# ══════════════════════════════════════════════════════════════
# 5. BÁO CÁO & LỢI NHUẬN
# ══════════════════════════════════════════════════════════════

@router.get("/summary")
def get_summary(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    return FinanceRepository.get_summary_report(db)

@router.get("/projects")
def list_projects(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    rows = FinanceRepository.list_projects(db)
    return [{"id": p.id, "label": f"{p.id} — {p.task_name or p.contract_id or ''}".strip(" —")}
            for p in rows]

@router.get("/settings")
def get_finance_settings(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    return FinanceRepository.get_finance_settings(db)

@router.post("/settings")
def save_finance_settings(
    payload: FinanceSettingsIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "update"))
):
    return FinanceService.save_settings(db, payload)

@router.get("/fund-balances/calculate")
def calculate_system_balance(
    hinh_thuc: str = Query(..., description="'Tiền mặt' hoặc 'Chuyển khoản'"),
    ngay_chot: str = Query(..., description="Mốc thời gian chốt (ISO string)"),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    try:
        dt_chot = datetime.fromisoformat(ngay_chot.replace("Z", "+00:00"))
        tz_vietnam = timezone(timedelta(hours=7))
        dt_chot = dt_chot.astimezone(tz_vietnam)
    except ValueError:
        try:
            dt_chot = datetime.strptime(ngay_chot, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            raise HTTPException(status_code=400, detail="Định dạng thời gian chốt không hợp lệ. Hãy dùng ISO format.")

    bal = FinanceRepository.get_running_balance(db, hinh_thuc, up_to_datetime=dt_chot)
    return {"status": "success", "so_du_he_thong": bal}

@router.get("/fund-balances/history")
def get_fund_balances_history(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    history = FinanceRepository.get_fund_balances_history(db)
    res = []
    for h in history:
        tz_vn = timezone(timedelta(hours=7))
        dt_local = h.ngay_ap_dung.astimezone(tz_vn) if h.ngay_ap_dung.tzinfo else h.ngay_ap_dung.replace(tzinfo=timezone.utc).astimezone(tz_vn)
        res.append({
            "id": h.id,
            "hinh_thuc": h.hinh_thuc,
            "so_tien_dau_ky": float(h.so_tien_dau_ky),
            "ngay_ap_dung": dt_local.strftime("%d/%m/%Y %H:%M"),
            "nguoi_chot": h.nguoi_chot,
            "ghi_chu": h.ghi_chu
        })
    return res

@router.post("/fund-balances/close")
def close_fund(
    payload: FundCloseIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "approve"))
):
    return FinanceService.close_fund(db, payload)

@router.get("/monthly-dashboard")
def get_monthly_dashboard(
    month: str = Query(..., description="Format: YYYY-MM"),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    return FinanceRepository.get_monthly_dashboard(db, month)

