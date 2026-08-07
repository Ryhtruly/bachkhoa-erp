"""Finance & Accounting models: CashflowTransaction, Receivable, FundOpeningBalance, FinanceSetting, ContractExpense."""

from src.db.models._base import *


class CashflowTransaction(Base):
    __tablename__ = "cashflow_transactions"
    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects_tasks.id"), nullable=True)
    contract_id = Column(String, ForeignKey("contracts.id"), nullable=True)
    transaction_type = Column(String(20), nullable=True)  # 'INCOME' | 'EXPENSE'
    amount = Column(Numeric(15, 2), nullable=True)
    payment_method = Column(String(50), nullable=True)  # 'BANK_TRANSFER' | 'CASH' | 'OTHER'
    category_code = Column(String(50), nullable=True)  # 'SERVICE_FEE' | 'STATE_FEE_ADVANCE' | 'REFUND' | 'OTHER'
    is_pass_through_fee = Column(Boolean, default=False)  # True = state fee pass-through, not BK revenue
    payer_payee_name = Column(String(255), nullable=True)
    transaction_date = Column(Date, nullable=True)
    document_number = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    department_code = Column(String(50), nullable=True)
    balance_after = Column(Numeric(15, 2), nullable=True)
    cash_balance_after = Column(Numeric(15, 2), nullable=True)
    bank_balance_after = Column(Numeric(15, 2), nullable=True)
    receipt_attachment_url = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_by_user_id = Column(String, nullable=True)
    approved_by_user_id = Column(String, nullable=True)
    status = Column(String(50), nullable=True)  # 'COMPLETED' | 'PENDING' | 'CANCELLED'
    scope = Column(String(50), default="INTERNAL")
    cancellation_reason = Column(Text, nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)


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
