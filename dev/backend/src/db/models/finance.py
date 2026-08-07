"""Finance & Accounting models: CashflowTransaction, Receivable, FundOpeningBalance, FinanceSetting, ContractExpense."""

from src.db.models._base import *


class CashflowTransaction(Base):
    __tablename__ = "cashflow_transactions"
    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects_tasks.id"), nullable=True)
    contract_id = Column(String, ForeignKey("contracts.id"), nullable=True)
    transaction_type = Column(String, nullable=True)  # Thu / Chi or INCOME / EXPENSE
    amount = Column(Numeric, nullable=True)
    category_code = Column(String, nullable=True)
    is_pass_through_fee = Column(Boolean, default=False)
    payer_payee_name = Column(String, nullable=True)
    payment_method = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)
    transaction_date = Column(Date, nullable=True)
    document_number = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    department_code = Column(String, nullable=True)
    balance_after = Column(Numeric, nullable=True)
    cash_balance_after = Column(Numeric, nullable=True)
    bank_balance_after = Column(Numeric, nullable=True)
    receipt_attachment_url = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_by_user_id = Column(String, nullable=True)
    approved_by_user_id = Column(String, nullable=True)
    status = Column(String, nullable=True)
    scope = Column(String, default="Công ty")
    cancellation_reason = Column(String, nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)


class Receivable(Base):
    __tablename__ = "receivables"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    contract_id = Column(String, ForeignKey("contracts.id"))
    paid_amount = Column(Numeric, default=0)
    remaining_amount = Column(Numeric, nullable=True)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)


class FundOpeningBalance(Base):
    __tablename__ = "fund_opening_balances"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    payment_method = Column(String(50), nullable=True)
    opening_balance = Column(Numeric, default=0)
    effective_date = Column(Date, nullable=True)
    closing_user = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)


class FinanceSetting(Base):
    __tablename__ = "finance_settings"
    setting_key = Column(String(100), primary_key=True)
    setting_value = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)


class ContractExpense(Base):
    __tablename__ = "contract_expenses"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    contract_id = Column(String, ForeignKey("contracts.id"))
    amount = Column(Numeric, default=0)
    category = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
