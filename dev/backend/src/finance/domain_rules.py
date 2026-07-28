from fastapi import HTTPException
from sqlalchemy.orm import Session
from datetime import date, datetime, timezone, timedelta
from typing import Optional

from src.db.models import Contract, ProjectTask, Department, User, FundOpeningBalance
from src.finance.repository import FinanceRepository

def check_closed_period(db: Session, target_date: date):
    latest_snap = db.query(FundOpeningBalance).order_by(FundOpeningBalance.ngay_ap_dung.desc()).first()
    if latest_snap and latest_snap.ngay_ap_dung:
        tz_vn = timezone(timedelta(hours=7))
        snap_time = latest_snap.ngay_ap_dung
        if isinstance(snap_time, datetime):
            snap_time_local = snap_time.astimezone(tz_vn) if snap_time.tzinfo else snap_time.replace(tzinfo=timezone.utc).astimezone(tz_vn)
            snap_date = snap_time_local.date()
        else:
            snap_date = snap_time
        if target_date <= snap_date:
            raise HTTPException(status_code=400, detail="Dữ liệu thuộc kỳ kế toán đã chốt, không thể thêm/sửa/hủy.")

def check_cash_balance(db: Session, amount: float, exclude_transaction_id: Optional[str] = None):
    balance = FinanceRepository.get_running_balance(db, "Tiền mặt")
    if exclude_transaction_id:
        from src.db.models import CashflowTransaction
        t = db.query(CashflowTransaction).filter(CashflowTransaction.id == exclude_transaction_id).first()
        if t and t.loai == "Chi" and t.hinh_thuc == "Tiền mặt":
            balance += float(t.so_tien or 0)
        elif t and t.loai == "Thu" and t.hinh_thuc == "Tiền mặt":
            balance -= float(t.so_tien or 0)

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
    exists = db.query(ProjectTask.id).filter(ProjectTask.id == project_id).first()
    if not exists:
        raise HTTPException(
            status_code=400,
            detail=f"Mã Hồ Sơ '{project_id}' không tồn tại."
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
    bal_tm = FinanceRepository.get_running_balance(db, "Tiền mặt")
    bal_ck = FinanceRepository.get_running_balance(db, "Chuyển khoản")
    
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
