from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, or_
from pydantic import BaseModel
from typing import Optional
from src.db.database import get_db
from src.crud.crud_finance import (
    _row, crud_get_cashflow_detail, crud_create_cashflow, 
    crud_update_cashflow, _row_bulk, _voucher_id, 
    _calculate_balances, _sync_receivables, get_setting_value,
    get_running_balance
)
from src.db.models import (
    CashflowTransaction, Contract, Customer, Receivable,
    ProjectTask, Employee, KpiPayroll, FinanceSetting, FundOpeningBalance
)
from datetime import datetime, date
import uuid
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/api/finance", tags=["Finance ERP"])


# ══════════════════════════════════════════════════════════════
# Pydantic Schemas
# ══════════════════════════════════════════════════════════════

class CashflowIn(BaseModel):
    type: str                           # "Thu" | "Chi"
    amount: float
    category: str                       # Dropdown: Hạng mục + Diễn giải
    payer_payee: str
    payment_method: str                 # "Tiền mặt" | "Chuyển khoản"
    contract_id: Optional[str] = None
    project_id: Optional[str] = None
    # Các trường kế toán nâng cao
    nguoi_lap: Optional[str] = None
    nguoi_duyet: Optional[str] = None
    trang_thai: Optional[str] = None
    ngay: Optional[str] = None
    scope: Optional[str] = "Công ty"

class CashflowUpdateIn(BaseModel):
    hang_muc: str
    nguoi_nhan_nop: str
    hinh_thuc: str
    so_tien: float
    ngay: Optional[str] = None
    dien_giai: Optional[str] = ""
    ghi_chu: Optional[str] = ""
    contract_id: Optional[str] = None
    scope: Optional[str] = "Công ty"

class AdvanceCreateIn(BaseModel):
    project_id: Optional[str] = None
    amount: float
    payer_payee: str
    note: Optional[str] = ""
    payment_method: str = "Tiền mặt"

class AdvanceClearIn(BaseModel):
    advance_id: str          # ID phiếu tạm ứng gốc
    actual_amount: float     # Số tiền thực chi từ hóa đơn
    note: Optional[str] = ""


class FundCloseIn(BaseModel):
    hinh_thuc: str            # "Tiền mặt" | "Chuyển khoản"
    so_tien_thuc_te: float
    ngay_chot: str            # ISO string or YYYY-MM-DD HH:MM:SS
    ghi_chu: Optional[str] = ""
    nguoi_chot: Optional[str] = ""

class WageCreateIn(BaseModel):
    project_id: str
    amount: float
    payer_payee: str
    note: Optional[str] = ""
    payment_method: str = "Tiền mặt"

class FinanceSettingsIn(BaseModel):
    initial_cash_balance: float = 0.0
    initial_bank_balance: float = 0.0
    initial_total_income: float = 0.0
    initial_total_expenditure: float = 0.0


# ══════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════

def _row(t: CashflowTransaction, db: Session = None) -> dict:
    """Serialize 1 giao dịch."""
    contract_label = t.contract_id or ""
    project_label = t.project_id or ""

    if db is not None:
        if t.contract_id:
            c = db.query(Contract).filter(Contract.id == t.contract_id).first()
            if c:
                cust = db.query(Customer).filter(Customer.id == c.customer_id).first()
                cust_name = cust.full_name if cust else ""
                contract_label = f"{t.contract_id}" + (f" — {cust_name}" if cust_name else "")
        if t.project_id:
            p = db.query(ProjectTask).filter(ProjectTask.id == t.project_id).first()
            if p and p.task_name:
                project_label = f"{t.project_id} — {p.task_name}"

    return {
        "id": t.id,
        "type": t.loai,
        "Ngày": t.ngay.strftime("%d/%m/%y") if t.ngay else (t.created_at.strftime("%d/%m/%y") if t.created_at else ""),
        "Hạng mục": t.hang_muc or "Khác",
        "Diễn giải": t.dien_giai or "",
        "Danh mục": f"{t.hang_muc}: {t.dien_giai}" if t.hang_muc and t.dien_giai else (t.hang_muc or t.dien_giai or ""),
        "Đối tác": t.nguoi_nhan_nop or "",
        "Hình thức": t.hinh_thuc or "",
        "Dự án": project_label,
        "Hợp đồng": contract_label,
        "amount": float(t.so_tien or 0),
        "contract_id": t.contract_id,
        "project_id": t.project_id,
        "so_du_sau_gd": float(t.so_du_sau_gd or 0),
        "so_du_tien_mat": float(t.so_du_tien_mat or 0),
        "so_du_ck": float(t.so_du_ck or 0),
        "trang_thai": t.trang_thai or ""
    }


def _row_bulk(rows, db: Session) -> list:
    """Serialize nhiều giao dịch 1 lần, tránh N+1 query."""
    contract_ids = {r.contract_id for r in rows if r.contract_id}
    project_ids = {r.project_id for r in rows if r.project_id}

    contracts = {
        c.id: c for c in db.query(Contract).filter(Contract.id.in_(contract_ids)).all()
    } if contract_ids else {}
    customer_ids = {c.customer_id for c in contracts.values() if c.customer_id}
    customers = {
        cu.id: cu for cu in db.query(Customer).filter(Customer.id.in_(customer_ids)).all()
    } if customer_ids else {}
    projects = {
        p.id: p for p in db.query(ProjectTask).filter(ProjectTask.id.in_(project_ids)).all()
    } if project_ids else {}

    result = []
    for t in rows:
        contract_label = t.contract_id or ""
        project_label = t.project_id or ""
        if t.contract_id and t.contract_id in contracts:
            c = contracts[t.contract_id]
            cust = customers.get(c.customer_id)
            cust_name = cust.full_name if cust else ""
            contract_label = f"{t.contract_id}" + (f" — {cust_name}" if cust_name else "")
        if t.project_id and t.project_id in projects:
            p = projects[t.project_id]
            if p.task_name:
                project_label = f"{t.project_id} — {p.task_name}"

        result.append({
            "id": t.id,
            "type": t.loai,
            "Ngày": t.ngay.strftime("%d/%m/%y") if t.ngay else (t.created_at.strftime("%d/%m/%y") if t.created_at else ""),
            "Hạng mục": t.hang_muc or "Khác",
            "Diễn giải": t.dien_giai or "",
            "Danh mục": f"{t.hang_muc}: {t.dien_giai}" if t.hang_muc and t.dien_giai else (t.hang_muc or t.dien_giai or ""),
            "Đối tác": t.nguoi_nhan_nop or "",
            "Hình thức": t.hinh_thuc or "",
            "Dự án": project_label,
            "Hợp đồng": contract_label,
            "amount": float(t.so_tien or 0),
            "contract_id": t.contract_id,
            "project_id": t.project_id,
            "so_du_sau_gd": float(t.so_du_sau_gd or 0),
            "so_du_tien_mat": float(t.so_du_tien_mat or 0),
            "so_du_ck": float(t.so_du_ck or 0),
            "trang_thai": t.trang_thai or ""
        })
    return result


def _voucher_id(type_val: str, db: Session, target_date: date = None) -> str:
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


def _validate_contract(db: Session, contract_id: str):
    if not contract_id:
        return
    exists = db.query(Contract.id).filter(Contract.id == contract_id).first()
    if not exists:
        raise HTTPException(
            status_code=400,
            detail=f"Mã Hợp Đồng '{contract_id}' không tồn tại."
        )


def _validate_project(db: Session, project_id: str):
    if not project_id:
        return
    exists = db.query(ProjectTask.id).filter(ProjectTask.id == project_id).first()
    if not exists:
        raise HTTPException(
            status_code=400,
            detail=f"Mã Hồ Sơ '{project_id}' không tồn tại."
        )


def _check_cash(db: Session, amount: float):
    thu = float(db.query(func.sum(CashflowTransaction.so_tien)).filter(
        CashflowTransaction.loai == "Thu",
        CashflowTransaction.hinh_thuc == "Tiền mặt"
    ).scalar() or 0)
    chi = float(db.query(func.sum(CashflowTransaction.so_tien)).filter(
        CashflowTransaction.loai == "Chi",
        CashflowTransaction.hinh_thuc == "Tiền mặt"
    ).scalar() or 0)
    balance = thu - chi
    if balance < amount:
        raise HTTPException(
            status_code=400,
            detail=f"Âm quỹ tiền mặt! Số dư: {balance:,.0f}₫ < {amount:,.0f}₫ cần chi"
        )


def _calculate_balances(db: Session, type_val: str, amount: float, method: str):
    bal_tm = get_running_balance(db, "Tiền mặt")
    bal_ck = get_running_balance(db, "Chuyển khoản")
    
    if method == "Tiền mặt":
        if type_val == "Thu":
            bal_tm += amount
        else:
            bal_tm -= amount
    elif method == "Chuyển khoản":
        if type_val == "Thu":
            bal_ck += amount
        else:
            bal_ck -= amount
            
    return bal_tm, bal_ck, bal_tm + bal_ck


def _sync_receivables(db: Session, contract_id: str, amount: float):
    rec = db.query(Receivable).filter(Receivable.contract_id == contract_id).first()
    if rec:
        rec.paid_amount = float(rec.paid_amount or 0) + amount
        rec.remaining_amount = max(0.0, float(rec.remaining_amount or 0) - amount)
    else:
        c = db.query(Contract).filter(Contract.id == contract_id).first()
        total = float(c.total_value or 0) if c else 0.0
        db.add(Receivable(
            contract_id=contract_id,
            paid_amount=amount,
            remaining_amount=max(0.0, total - amount),
        ))


def _parse_category(cat_val: str):
    if ": " in cat_val:
        parts = cat_val.split(": ", 1)
        return parts[0], parts[1]
    return "Khác", cat_val


# ══════════════════════════════════════════════════════════════
# 1. DÒNG TIỀN — Cashflow
# ══════════════════════════════════════════════════════════════

@router.get("/next-voucher-id")
def get_next_voucher_id(type: str = "Thu", db: Session = Depends(get_db)):
    return {"next_id": _voucher_id(type, db)}

@router.get("/cashflow")
def list_cashflow(
    month: str = Query(None),
    type: str = Query(None),
    payment_method: str = Query(None),
    project_id: str = Query(None),
    contract_id: str = Query(None),
    scope: str = Query(None),
    db: Session = Depends(get_db)
):
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
    rows = q.order_by(CashflowTransaction.created_at.desc()).all()
    return _row_bulk(rows, db)


@router.get("/cashflow/by-contract/{contract_id}")
def cashflow_by_contract(contract_id: str, db: Session = Depends(get_db)):
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy Hợp Đồng '{contract_id}'")

    rows = db.query(CashflowTransaction).filter(
        CashflowTransaction.contract_id == contract_id
    ).order_by(CashflowTransaction.created_at.desc()).all()

    thu = sum(float(r.so_tien or 0) for r in rows if r.loai == "Thu")
    chi = sum(float(r.so_tien or 0) for r in rows if r.loai == "Chi")
    customer = db.query(Customer).filter(Customer.id == contract.customer_id).first()

    return {
        "contract_id": contract_id,
        "customer_name": customer.full_name if customer else "",
        "total_value": float(contract.total_value or 0),
        "tong_thu": thu,
        "tong_chi": chi,
        "transactions": _row_bulk(rows, db),
    }


@router.get("/cashflow/by-project/{project_id}")
def cashflow_by_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(ProjectTask).filter(ProjectTask.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy Hồ Sơ '{project_id}'")

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
        "transactions": _row_bulk(rows, db),
    }


@router.get("/cashflow/cash")
def cashflow_cash(
    month: str = Query(None),
    type: str = Query(None),
    payment_method: str = Query(None),
    project_id: str = Query(None),
    contract_id: str = Query(None),
    scope: str = Query(None),
    db: Session = Depends(get_db)
):
    initial_cash = get_setting_value(db, "initial_cash_balance")
    initial_income = get_setting_value(db, "initial_total_income")
    initial_expense = get_setting_value(db, "initial_total_expenditure")

    # 1. Compute overall balance (unfiltered)
    current_balance = get_running_balance(db, "Tiền mặt")

    # 2. Query filtered transactions
    q = db.query(CashflowTransaction).filter(CashflowTransaction.hinh_thuc == "Tiền mặt")
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

    rows = q.order_by(CashflowTransaction.created_at.desc()).all()

    # 3. Calculate filtered totals
    filtered_thu = sum(float(r.so_tien or 0) for r in rows if r.loai == "Thu")
    filtered_chi = sum(float(r.so_tien or 0) for r in rows if r.loai == "Chi")

    return {
        "balance": current_balance,
        "tong_thu": initial_income + filtered_thu,
        "tong_chi": initial_expense + filtered_chi,
        "transactions": _row_bulk(rows, db)
    }


@router.get("/cashflow/bank")
def cashflow_bank(
    month: str = Query(None),
    type: str = Query(None),
    payment_method: str = Query(None),
    project_id: str = Query(None),
    contract_id: str = Query(None),
    scope: str = Query(None),
    db: Session = Depends(get_db)
):
    initial_bank = get_setting_value(db, "initial_bank_balance")
    initial_income = get_setting_value(db, "initial_total_income")
    initial_expense = get_setting_value(db, "initial_total_expenditure")

    # 1. Compute overall balance (unfiltered)
    current_balance = get_running_balance(db, "Chuyển khoản")

    # 2. Query filtered transactions
    q = db.query(CashflowTransaction).filter(CashflowTransaction.hinh_thuc == "Chuyển khoản")
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

    rows = q.order_by(CashflowTransaction.created_at.desc()).all()

    # 3. Calculate filtered totals
    filtered_thu = sum(float(r.so_tien or 0) for r in rows if r.loai == "Thu")
    filtered_chi = sum(float(r.so_tien or 0) for r in rows if r.loai == "Chi")

    return {
        "balance": current_balance,
        "tong_thu": initial_income + filtered_thu,
        "tong_chi": initial_expense + filtered_chi,
        "transactions": _row_bulk(rows, db)
    }


@router.post("/cashflow/create")
def create_cashflow(payload: CashflowIn, db: Session = Depends(get_db)):
    return crud_create_cashflow(db, payload)

@router.get("/cashflow/{transaction_id:path}")
def get_cashflow_detail(transaction_id: str, db: Session = Depends(get_db)):
    return crud_get_cashflow_detail(db, transaction_id)

@router.put("/cashflow/{transaction_id:path}")
def update_cashflow(transaction_id: str, payload: CashflowUpdateIn, db: Session = Depends(get_db)):
    return crud_update_cashflow(db, transaction_id, payload)


# ══════════════════════════════════════════════════════════════
# 2. CHỨNG TỪ & CÔNG NỢ
# ══════════════════════════════════════════════════════════════

@router.get("/contracts")
def list_contracts(db: Session = Depends(get_db)):
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


@router.get("/receivables")
def list_receivables(db: Session = Depends(get_db)):
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


@router.get("/payables")
def list_payables(db: Session = Depends(get_db)):
    rows = db.query(CashflowTransaction).filter(
        CashflowTransaction.loai == "Chi",
        CashflowTransaction.hinh_thuc == "Chuyển khoản",
        CashflowTransaction.contract_id.is_(None)
    ).order_by(CashflowTransaction.created_at.desc()).all()
    total = sum(float(r.so_tien or 0) for r in rows)
    return {"total_payable": total, "transactions": _row_bulk(rows, db)}


# ══════════════════════════════════════════════════════════════
# 3. TẠM ỨNG
# ══════════════════════════════════════════════════════════════

@router.get("/advance")
def list_advance(db: Session = Depends(get_db)):
    rows = db.query(CashflowTransaction).filter(
        CashflowTransaction.loai == "Chi",
        or_(CashflowTransaction.hang_muc.ilike("%tạm ứng%"),
            CashflowTransaction.dien_giai.ilike("%tạm ứng%")),
        CashflowTransaction.trang_thai != "Đã quyết toán"
    ).order_by(CashflowTransaction.created_at.desc()).all()
    return _row_bulk(rows, db)


@router.post("/advance/create")
def create_advance(payload: AdvanceCreateIn, db: Session = Depends(get_db)):
    try:
        if payload.payment_method == "Tiền mặt":
            _check_cash(db, payload.amount)

        new_id = _voucher_id("Chi", db)
        bal_tm, bal_ck, bal_sau = _calculate_balances(db, "Chi", payload.amount, payload.payment_method)

        proj_label = ""
        if payload.project_id:
            p = db.query(ProjectTask).filter(ProjectTask.id == payload.project_id).first()
            if p: proj_label = f"{p.id} — {p.task_name or ''}"

        tc = CashflowTransaction(
            id=new_id,
            project_id=payload.project_id or None,
            loai="Chi",
            so_tien=payload.amount,
            hang_muc="Chi phí tạm ứng",
            nguoi_nhan_nop=payload.payer_payee,
            hinh_thuc=payload.payment_method,
            ngay=date.today(),
            so_chung_tu=new_id,
            dien_giai=f"Tạm ứng: {payload.note or 'Chi công trường'}",
            du_an_phong_ban=proj_label,
            so_du_sau_gd=bal_sau,
            so_du_tien_mat=bal_tm,
            so_du_ck=bal_ck,
            trang_thai="Hoàn thành"
        )
        db.add(tc)
        db.commit()
        return {"status": "success", "id": tc.id, "category": tc.hang_muc}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/advance/clear")
def clear_advance(payload: AdvanceClearIn, db: Session = Depends(get_db)):
    try:
        advance = db.query(CashflowTransaction).filter(
            CashflowTransaction.id == payload.advance_id
        ).first()
        if not advance:
            raise HTTPException(status_code=404, detail="Không tìm thấy phiếu tạm ứng")

        if advance.trang_thai == "Đã quyết toán":
            raise HTTPException(status_code=400, detail="Phiếu tạm ứng này đã được quyết toán.")

        adv_amt = float(advance.so_tien or 0)
        actual = payload.actual_amount
        diff = adv_amt - actual  # positive: return to register, negative: company pays employee
        auto_vouchers = []

        # 1. Mark original advance as resolved
        advance.trang_thai = "Đã quyết toán"

        # 2. Create the actual expenditure transaction (Chi, hinh_thuc="Tạm ứng")
        exp_id = _voucher_id("Chi", db)
        bal_tm, bal_ck, bal_sau = _calculate_balances(db, "Chi", 0.0, "Tạm ứng")
        
        actual_exp = CashflowTransaction(
            id=exp_id,
            project_id=advance.project_id,
            contract_id=advance.contract_id,
            loai="Chi",
            so_tien=actual,
            hang_muc="Chi thực tế từ tạm ứng",
            nguoi_nhan_nop=advance.nguoi_nhan_nop,
            hinh_thuc="Tạm ứng",
            ngay=date.today(),
            so_chung_tu=exp_id,
            dien_giai=f"Quyết toán chi thực tế: {payload.note or ''} (gốc: {payload.advance_id})",
            du_an_phong_ban=advance.du_an_phong_ban,
            so_du_sau_gd=bal_sau,
            so_du_tien_mat=bal_tm,
            so_du_ck=bal_ck,
            trang_thai="Hoàn thành"
        )
        db.add(actual_exp)
        auto_vouchers.append({"id": exp_id, "type": "Chi", "amount": actual, "purpose": "Chi thực tế"})

        # 3. Create the return or overspent transaction
        if abs(diff) > 0:
            vtype = "Thu" if diff > 0 else "Chi"
            note_prefix = "Hoàn ứng thừa" if diff > 0 else "Bù ứng thiếu"
            new_id = _voucher_id(vtype, db)
            bal_tm, bal_ck, bal_sau = _calculate_balances(db, vtype, abs(diff), "Tiền mặt")

            tc = CashflowTransaction(
                id=new_id,
                project_id=advance.project_id,
                loai=vtype,
                so_tien=abs(diff),
                hang_muc="Quyết toán hoàn ứng",
                nguoi_nhan_nop=advance.nguoi_nhan_nop,
                hinh_thuc="Tiền mặt",
                ngay=date.today(),
                so_chung_tu=new_id,
                dien_giai=f"{note_prefix}: {payload.note or ''} (gốc: {payload.advance_id})",
                du_an_phong_ban=advance.du_an_phong_ban,
                so_du_sau_gd=bal_sau,
                so_du_tien_mat=bal_tm,
                so_du_ck=bal_ck,
                trang_thai="Hoàn thành"
            )
            db.add(tc)
            auto_vouchers.append({"id": tc.id, "type": vtype, "amount": abs(diff)})

        db.commit()
        return {
            "status": "success", "advance_amount": adv_amt,
            "actual_amount": actual, "difference": diff,
            "auto_vouchers": auto_vouchers
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════
# 4. NHÂN SỰ & LƯƠNG
# ══════════════════════════════════════════════════════════════

@router.get("/payroll")
def list_payroll(month: str = Query(None), db: Session = Depends(get_db)):
    employees = db.query(Employee).filter(Employee.is_active == True).all()
    result = []
    for emp in employees:
        q = db.query(KpiPayroll).filter(KpiPayroll.employee_id == emp.id)
        if month:
            q = q.filter(KpiPayroll.month == month)
        kpi = q.order_by(KpiPayroll.created_at.desc()).first()
        result.append({
            "id": emp.id, "full_name": emp.full_name or "",
            "department": emp.department or "",
            "base_salary": float(emp.base_salary or 0),
            "kpi_score": float(kpi.kpi_score or 0) if kpi else 0,
            "bonus": float(kpi.bonus or 0) if kpi else 0,
            "total_salary": float(kpi.total_salary or 0) if kpi else float(emp.base_salary or 0),
            "month": kpi.month if kpi else (month or ""),
            "tasks_completed": kpi.tasks_completed if kpi else 0,
        })
    return result


@router.get("/payroll/workers")
def list_worker_wages(project_id: str = Query(None), db: Session = Depends(get_db)):
    q = db.query(CashflowTransaction).filter(
        CashflowTransaction.loai == "Chi",
        or_(CashflowTransaction.hang_muc.ilike("%lương khoán%"),
            CashflowTransaction.dien_giai.ilike("%lương khoán%"))
    )
    if project_id:
        q = q.filter(CashflowTransaction.project_id == project_id)
    rows = q.order_by(CashflowTransaction.created_at.desc()).all()
    total = sum(float(r.so_tien or 0) for r in rows)
    return {"total_wages": total, "transactions": _row_bulk(rows, db)}


@router.get("/payroll/workers/records")
def get_worker_wage_records(month: str = Query(None), db: Session = Depends(get_db)):
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


@router.post("/payroll/workers/create")
def create_worker_wage(payload: WageCreateIn, db: Session = Depends(get_db)):
    try:
        if payload.payment_method == "Tiền mặt":
            _check_cash(db, payload.amount)

        new_id = _voucher_id("Chi", db)
        bal_tm, bal_ck, bal_sau = _calculate_balances(db, "Chi", payload.amount, payload.payment_method)

        proj_label = ""
        if payload.project_id:
            p = db.query(ProjectTask).filter(ProjectTask.id == payload.project_id).first()
            if p: proj_label = f"{p.id} — {p.task_name or ''}"

        tc = CashflowTransaction(
            id=new_id,
            project_id=payload.project_id,
            loai="Chi",
            so_tien=payload.amount,
            hang_muc="Lương khoán tổ thợ",
            nguoi_nhan_nop=payload.payer_payee,
            hinh_thuc=payload.payment_method,
            ngay=date.today(),
            so_chung_tu=new_id,
            dien_giai=f"Lương khoán: {payload.note or payload.payer_payee}",
            du_an_phong_ban=proj_label,
            so_du_sau_gd=bal_sau,
            so_du_tien_mat=bal_tm,
            so_du_ck=bal_ck,
            trang_thai="Hoàn thành"
        )
        db.add(tc)
        db.commit()
        return {"status": "success", "id": tc.id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════
# 5. BÁO CÁO & LỢI NHUẬN
# ══════════════════════════════════════════════════════════════

@router.get("/summary")
def get_summary(db: Session = Depends(get_db)):
    initial_cash = get_setting_value(db, "initial_cash_balance")
    initial_bank = get_setting_value(db, "initial_bank_balance")

    def _s(type_val, method=None, cat=None):
        q = db.query(func.sum(CashflowTransaction.so_tien)).filter(
            CashflowTransaction.loai == type_val,
            CashflowTransaction.scope == "Công ty"
        )
        if method:
            q = q.filter(CashflowTransaction.hinh_thuc == method)
        if cat:
            q = q.filter(or_(CashflowTransaction.hang_muc.ilike(f"%{cat}%"),
                             CashflowTransaction.dien_giai.ilike(f"%{cat}%")))
        return float(q.scalar() or 0)

    tien_mat = get_running_balance(db, "Tiền mặt")
    ngan_hang = get_running_balance(db, "Chuyển khoản")
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
    ).filter(CashflowTransaction.scope == "Công ty").group_by("yr", "mo", CashflowTransaction.loai).order_by("yr", "mo").all()

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
    ).filter(CashflowTransaction.loai == "Chi",
             CashflowTransaction.project_id.isnot(None),
             CashflowTransaction.scope == "Công ty"
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


@router.get("/projects")
def list_projects(db: Session = Depends(get_db)):
    rows = db.query(ProjectTask).order_by(ProjectTask.created_at.desc()).limit(300).all()
    return [{"id": p.id, "label": f"{p.id} — {p.task_name or p.contract_id or ''}".strip(" —")}
            for p in rows]


@router.get("/settings")
def get_finance_settings(db: Session = Depends(get_db)):
    return {
        "initial_cash_balance": get_setting_value(db, "initial_cash_balance"),
        "initial_bank_balance": get_setting_value(db, "initial_bank_balance"),
        "initial_total_income": get_setting_value(db, "initial_total_income"),
        "initial_total_expenditure": get_setting_value(db, "initial_total_expenditure")
    }

@router.post("/settings")
def save_finance_settings(payload: FinanceSettingsIn, db: Session = Depends(get_db)):
    try:
        keys_and_values = {
            "initial_cash_balance": payload.initial_cash_balance,
            "initial_bank_balance": payload.initial_bank_balance,
            "initial_total_income": payload.initial_total_income,
            "initial_total_expenditure": payload.initial_total_expenditure
        }
        for k, v in keys_and_values.items():
            setting = db.query(FinanceSetting).filter(FinanceSetting.key == k).first()
            if setting:
                setting.value = v
            else:
                db.add(FinanceSetting(key=k, value=v))
        db.commit()
        return {"status": "success", "message": "Cấu hình số dư đầu kỳ đã được cập nhật thành công"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fund-balances/calculate")
def calculate_system_balance(
    hinh_thuc: str = Query(..., description="'Tiền mặt' hoặc 'Chuyển khoản'"),
    ngay_chot: str = Query(..., description="Mốc thời gian chốt (ISO string)"),
    db: Session = Depends(get_db)
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

    bal = get_running_balance(db, hinh_thuc, up_to_datetime=dt_chot)
    return {"status": "success", "so_du_he_thong": bal}


@router.post("/fund-balances/close")
def close_fund(payload: FundCloseIn, db: Session = Depends(get_db)):
    try:
        # 1. Parse thời gian và ép chuẩn về múi giờ Việt Nam (+07:00)
        try:
            dt_utc = datetime.fromisoformat(payload.ngay_chot.replace("Z", "+00:00"))
            tz_vietnam = timezone(timedelta(hours=7))
            dt_chot = dt_utc.astimezone(tz_vietnam)
        except ValueError:
            try:
                dt_chot = datetime.strptime(payload.ngay_chot, "%Y-%m-%d %H:%M:%S")
                dt_chot = dt_chot.replace(tzinfo=timezone(timedelta(hours=7)))
            except ValueError:
                raise HTTPException(status_code=400, detail="Định dạng thời gian chốt không hợp lệ. Hãy dùng ISO format.")

        # 2. Tính toán số dư hệ thống trước khi chốt
        so_du_he_thong = get_running_balance(db, payload.hinh_thuc, up_to_datetime=dt_chot)
        chênh_lệch = payload.so_tien_thuc_te - so_du_he_thong

        nguoi_chot = payload.nguoi_chot or "Kế toán"
        
        # 3. Thêm mốc chốt chặn mới
        fob = FundOpeningBalance(
            hinh_thuc=payload.hinh_thuc,
            so_tien_dau_ky=payload.so_tien_thuc_te,
            ngay_ap_dung=dt_chot,
            nguoi_chot=nguoi_chot,
            ghi_chu=payload.ghi_chu
        )
        db.add(fob)
        db.flush()

        # 4. Tạo phiếu bù trừ nếu có chênh lệch
        if chênh_lệch != 0:
            loai = "Thu" if chênh_lệch > 0 else "Chi"
            hang_muc = "Thu chênh lệch kiểm kê quỹ" if chênh_lệch > 0 else "Chi chênh lệch kiểm kê quỹ"
            new_id = _voucher_id(loai, db, dt_chot.date())
            
            bal_tm, bal_ck, bal_sau = _calculate_balances(db, loai, abs(chênh_lệch), payload.hinh_thuc)
            
            # 🔥 SỬA CHÍ TRÚC: Lùi thời gian tạo phiếu 1 giây để nó thuộc về kỳ cũ, không bị quét vào kỳ mới
            thoi_gian_phieu = dt_chot - timedelta(seconds=1)
            
            tc = CashflowTransaction(
                id=new_id,
                loai=loai,
                so_tien=abs(chênh_lệch),
                hang_muc=hang_muc,
                nguoi_nhan_nop=nguoi_chot,
                hinh_thuc=payload.hinh_thuc,
                ngay=dt_chot.date(),
                created_at=thoi_gian_phieu, # Ghi nhận vào giây cuối cùng của kỳ trước
                so_chung_tu=new_id,
                dien_giai=f"{hang_muc}: {payload.ghi_chu or ''}",
                so_du_sau_gd=bal_sau,
                so_du_tien_mat=bal_tm,
                so_du_ck=bal_ck,
                trang_thai="Hoàn thành",
                scope="Công ty",
                nguoi_lap=nguoi_chot,
                nguoi_duyet=nguoi_chot
            )
            db.add(tc)

        db.commit()
        return {"status": "success", "message": "Chốt quỹ thành công!"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/monthly-dashboard")
def get_monthly_dashboard(month: str = Query(..., description="Format: YYYY-MM"), db: Session = Depends(get_db)):
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
        CashflowTransaction.scope == "Công ty"
    ).all()

    # Calculate overall totals
    tong_thu = sum(float(t.so_tien or 0.0) for t in txs if t.loai == "Thu")
    tong_chi = sum(float(t.so_tien or 0.0) for t in txs if t.loai == "Chi")

    # Define standard categories to show
    standard_categories = [
        "Văn phòng phẩm",
        "In ấn - Photocopy",
        "Chi quầy tiếp nhận",
        "Ăn uống",
        "Đi lại - Xăng xe - Gửi xe",
        "Công tác phí",
        "Chuyển phát - Bưu chính-Grap",
        "Điện - Nước - Internet",
        "Sửa chữa nhỏ",
        "Bảo trì thiết bị",
        "Vệ sinh - Rác thải",
        "Hỗ trợ sự kiện - Marketing",
        "Chi thụ lý bản vẽ",
        "Chi bảo vệ",
        "Công chứng hồ sơ",
        "Thu chênh lệch kiểm kê quỹ",
        "Chi chênh lệch kiểm kê quỹ"
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

