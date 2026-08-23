"""Finance & Accounting models: CashflowTransaction, Receivable, FundOpeningBalance, FinanceSetting, ContractExpense."""

from src.db.models._base import *


class CashflowTransaction(Base):
    __tablename__ = "cashflow_transactions"
    id = Column(String, primary_key=True)
    # Cột này chứa id của service_lines (Hạng mục) — xem create_cashflow.
    # Trước đây khai báo khoá ngoại tới "projects_tasks", một bảng KHÔNG tồn tại
    # trong CSDL lẫn trong model, khiến SQLAlchemy không dựng nổi thứ tự bảng và
    # mọi lần tạo phiếu thu/chi đều lỗi 500.
    project_id = Column(String, ForeignKey("service_lines.id"), nullable=True)
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
    receipt_attachments = Column(JSONB, nullable=False, default=list)
    notes = Column(Text, nullable=True)
    created_by_user_id = Column(String, nullable=True)
    approved_by_user_id = Column(String, nullable=True)
    status = Column(String, nullable=True)
    scope = Column(String, default="COMPANY")
    cancellation_reason = Column(String, nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    # Snapshot of the configured signers captured when the document is completed.
    # Nullable for legacy transactions created before signer snapshots existed.
    signer_snapshot = Column(JSONB, nullable=True)
    __table_args__ = (
        Index("idx_cashflow_composite_balance", "payment_method", "transaction_type", "scope", "status"),
        Index("idx_cashflow_composite_monthly", "scope", "transaction_date", "transaction_type"),
    )


class Receivable(Base):
    __tablename__ = "receivables"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    contract_id = Column(String, ForeignKey("contracts.id"))
    paid_amount = Column(Numeric, default=0)
    remaining_amount = Column(Numeric, nullable=True)
    due_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)
    is_refunded = Column(Boolean, default=False, nullable=False)
    refund_reason = Column(Text, nullable=True)
    refund_by = Column(String, ForeignKey("users.id"), nullable=True)
    refund_at = Column(DateTime(timezone=True), nullable=True)
    is_written_off = Column(Boolean, default=False, nullable=False)
    written_off_reason = Column(Text, nullable=True)
    written_off_by = Column(String, ForeignKey("users.id"), nullable=True)
    written_off_at = Column(DateTime(timezone=True), nullable=True)
    carried_forward_to = Column(String, ForeignKey("contracts.id"), nullable=True)
    carried_forward_from = Column(String, ForeignKey("contracts.id"), nullable=True)


class FundOpeningBalance(Base):
    __tablename__ = "fund_opening_balances"
    id = Column(Integer, primary_key=True, autoincrement=True)
    payment_method = Column(String(50), nullable=True)
    opening_balance = Column(Numeric, default=0)
    effective_date = Column(Date, nullable=True)
    closing_user = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)


class FinanceSetting(Base):
    __tablename__ = "finance_settings"
    key = Column(String(100), primary_key=True)
    value = Column(Numeric, nullable=True)


class ContractExpense(Base):
    __tablename__ = "contract_expenses"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    contract_id = Column(String, ForeignKey("contracts.id"))
    amount = Column(Numeric, default=0)
    category = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
