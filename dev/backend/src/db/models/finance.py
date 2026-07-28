"""Finance & Accounting models: CashflowTransaction, Receivable, FundOpeningBalance, FinanceSetting, ContractExpense."""

from src.db.models._base import *


class CashflowTransaction(Base):
    __tablename__ = "cashflow_transactions"
    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects_tasks.id"), nullable=True)
    contract_id = Column(String, ForeignKey("contracts.id"), nullable=True)
    loai = Column(String, nullable=True) # Thu / Chi
    so_tien = Column(Numeric, nullable=True)
    hang_muc = Column(String, nullable=True)
    nguoi_nhan_nop = Column(String, nullable=True)
    hinh_thuc = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)
    ngay = Column(Date, nullable=True)
    so_chung_tu = Column(String, nullable=True)
    dien_giai = Column(Text, nullable=True)
    du_an_phong_ban = Column(String, nullable=True)
    so_du_sau_gd = Column(Numeric, nullable=True)
    so_du_tien_mat = Column(Numeric, nullable=True)
    so_du_ck = Column(Numeric, nullable=True)
    chung_tu = Column(Text, nullable=True)
    ghi_chu = Column(Text, nullable=True)
    nguoi_lap = Column(String, nullable=True)
    nguoi_duyet = Column(String, nullable=True)
    trang_thai = Column(String, nullable=True)
    scope = Column(String, default="Công ty")
    voided_reason = Column(String, nullable=True)
    voided_at = Column(DateTime(timezone=True), nullable=True)


class Receivable(Base):
    __tablename__ = "receivables"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    contract_id = Column(String, ForeignKey("contracts.id"))
    paid_amount = Column(Numeric, default=0)
    remaining_amount = Column(Numeric, nullable=True)
    due_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)


class FundOpeningBalance(Base):
    __tablename__ = "fund_opening_balances"
    
    id = Column(Integer, primary_key=True, index=True)
    hinh_thuc = Column(String(50), nullable=True) # 'Tiền mặt' hoặc 'Chuyển khoản'
    so_tien_dau_ky = Column(Numeric(15, 2), nullable=True)
    ngay_ap_dung = Column(DateTime(timezone=True), nullable=True)
    nguoi_chot = Column(String(100), nullable=True)
    ghi_chu = Column(Text, nullable=True)


class FinanceSetting(Base):
    __tablename__ = "finance_settings"
    key = Column(String, primary_key=True)
    value = Column(Numeric, default=0.0)


class ContractExpense(Base):
    __tablename__ = "contract_expenses"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    contract_id = Column(String, ForeignKey("contracts.id"), nullable=True)
    expense_type = Column(String, nullable=True)
    amount = Column(Numeric, nullable=True)
    approved_by = Column(String, ForeignKey("users.id"), nullable=True)
    cashflow_id = Column(String, ForeignKey("cashflow_transactions.id"), nullable=True)
