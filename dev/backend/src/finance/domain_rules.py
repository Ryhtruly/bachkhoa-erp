from fastapi import HTTPException
from sqlalchemy.orm import Session
from datetime import date, datetime, timezone, timedelta
from typing import Optional

from src.db.models import Contract, ServiceLine, Department, User, FundOpeningBalance
from src.finance.repository import FinanceRepository
from src.finance.enums import (
    normalize_payment_method, normalize_transaction_type, normalize_status,
    PaymentMethod, TransactionType, TransactionStatus
)

def counts_toward_receivable(status: str, transaction_type: str) -> bool:
    norm_status = normalize_status(status)
    norm_type = normalize_transaction_type(transaction_type)
    return norm_status == TransactionStatus.COMPLETED.value and norm_type == TransactionType.INCOME.value

def check_closed_period(db: Session, target_date: date):
    latest_snap = db.query(FundOpeningBalance).order_by(FundOpeningBalance.effective_date.desc()).first()
    if latest_snap and latest_snap.effective_date:
        tz_vn = timezone(timedelta(hours=7))
        snap_time = latest_snap.effective_date
        if isinstance(snap_time, datetime):
            snap_time_local = snap_time.astimezone(tz_vn) if snap_time.tzinfo else snap_time.replace(tzinfo=timezone.utc).astimezone(tz_vn)
            snap_date = snap_time_local.date()
        else:
            snap_date = snap_time
        if target_date <= snap_date:
            raise HTTPException(status_code=400, detail="Dữ liệu thuộc kỳ kế toán đã chốt, không thể thêm/sửa/hủy.")

def check_cash_balance(db: Session, amount: float, exclude_transaction_id: Optional[str] = None):
    balance = FinanceRepository.get_running_balance(db, PaymentMethod.CASH.value)
    if exclude_transaction_id:
        from src.db.models import CashflowTransaction
        t = db.query(CashflowTransaction).filter(CashflowTransaction.id == exclude_transaction_id).first()
        if t:
            t_pm = normalize_payment_method(t.payment_method)
            t_type = normalize_transaction_type(t.transaction_type)
            if t_pm == PaymentMethod.CASH.value:
                if t_type == TransactionType.EXPENSE.value:
                    balance += float(t.amount or 0)
                elif t_type == TransactionType.INCOME.value:
                    balance -= float(t.amount or 0)

    if balance < amount:
        raise HTTPException(
            status_code=400,
            detail=f"Âm quỹ tiền mặt! Số dư: {balance:,.0f}₫ < {amount:,.0f}₫ cần chi"
        )

def validate_contract(db: Session, contract_id: Optional[str]):
    if not contract_id:
        return
    exists = db.query(Contract.id).filter(Contract.id == contract_id).first()
    if not exists:
        raise HTTPException(
            status_code=400,
            detail=f"Mã Hợp Đồng '{contract_id}' không tồn tại."
        )

def validate_project(db: Session, project_id: Optional[str]):
    if not project_id:
        return
    exists = db.query(ServiceLine.id).filter(ServiceLine.id == project_id).first()
    if not exists:
        raise HTTPException(
            status_code=400,
            detail=f"Mã Hạng mục '{project_id}' không tồn tại."
        )

def validate_employee_payload(payload, db: Session):
    if (
        payload.join_date
        and payload.probation_end_date
        and payload.probation_end_date < payload.join_date
    ):
        raise HTTPException(
            status_code=422,
            detail="Ngày kết thúc thử việc không được trước ngày vào làm.",
        )

    department = None
    if payload.department_id:
        department = db.query(Department).filter(
            Department.id == payload.department_id
        ).first()
        if not department:
            raise HTTPException(status_code=422, detail="Phòng ban không tồn tại.")

    if payload.user_id:
        user = db.query(User).filter(User.id == payload.user_id).first()
        if not user:
            raise HTTPException(
                status_code=422,
                detail="Tài khoản liên kết không tồn tại.",
            )

    return department

def parse_category(cat_val: str):
    if ": " in cat_val:
        parts = cat_val.split(": ", 1)
        return parts[0], parts[1]
    return "Khác", cat_val

def calculate_balances(db: Session, type_val: str, amount: float, method: str):
    bal_tm = FinanceRepository.get_running_balance(db, PaymentMethod.CASH.value)
    bal_ck = FinanceRepository.get_running_balance(db, PaymentMethod.BANK_TRANSFER.value)
    
    canon_pm = normalize_payment_method(method)
    canon_type = normalize_transaction_type(type_val)

    if canon_pm == PaymentMethod.CASH.value:
        if canon_type == TransactionType.INCOME.value:
            bal_tm += amount
        else:
            bal_tm -= amount
    elif canon_pm == PaymentMethod.BANK_TRANSFER.value:
        if canon_type == TransactionType.INCOME.value:
            bal_ck += amount
        else:
            bal_ck -= amount
            
    return bal_tm, bal_ck, bal_tm + bal_ck
