"""Canonical enums and normalization utilities for Finance & Accounting domain."""

from enum import Enum
from typing import Optional


class TransactionType(str, Enum):
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"
    ADVANCE = "ADVANCE"
    REIMBURSEMENT = "REIMBURSEMENT"


class TransactionStatus(str, Enum):
    COMPLETED = "COMPLETED"
    PENDING = "PENDING"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    SETTLED = "SETTLED"


APPROVED_STATUS_SET = {
    TransactionStatus.COMPLETED.value,
    TransactionStatus.SETTLED.value,
}

PENDING_STATUS_SET = {
    TransactionStatus.PENDING.value,
}

# Canonical values are used by business logic and are the only values read or
# written by the runtime.  Vietnamese strings belong only to presentation
# labels and to the one-time SQL backfill migration.
APPROVED_STATUS_DB_VALUES = (
    TransactionStatus.COMPLETED.value,
    TransactionStatus.SETTLED.value,
)

PENDING_STATUS_DB_VALUES = (TransactionStatus.PENDING.value,)
REJECTED_STATUS_DB_VALUES = (TransactionStatus.REJECTED.value,)
CANCELLED_STATUS_DB_VALUES = (TransactionStatus.CANCELLED.value,)

STATUS_DB_VALUES_BY_CANONICAL = {
    TransactionStatus.COMPLETED.value: APPROVED_STATUS_DB_VALUES,
    TransactionStatus.SETTLED.value: APPROVED_STATUS_DB_VALUES,
    TransactionStatus.PENDING.value: PENDING_STATUS_DB_VALUES,
    TransactionStatus.REJECTED.value: REJECTED_STATUS_DB_VALUES,
    TransactionStatus.CANCELLED.value: CANCELLED_STATUS_DB_VALUES,
}


class PaymentMethod(str, Enum):
    CASH = "CASH"
    BANK_TRANSFER = "BANK_TRANSFER"


class TransactionScope(str, Enum):
    COMPANY = "COMPANY"
    INTERNAL = "INTERNAL"


INCOME_TYPE_DB_VALUES = (
    TransactionType.INCOME.value,
)

EXPENSE_TYPE_DB_VALUES = (TransactionType.EXPENSE.value,)

ADVANCE_TYPE_DB_VALUES = (TransactionType.ADVANCE.value,)

REIMBURSEMENT_TYPE_DB_VALUES = (TransactionType.REIMBURSEMENT.value,)

EXPENDITURE_TYPE_DB_VALUES = (
    *EXPENSE_TYPE_DB_VALUES,
    *ADVANCE_TYPE_DB_VALUES,
)

CASH_PAYMENT_METHOD_DB_VALUES = (PaymentMethod.CASH.value,)
BANK_PAYMENT_METHOD_DB_VALUES = (PaymentMethod.BANK_TRANSFER.value,)
COMPANY_SCOPE_DB_VALUES = (TransactionScope.COMPANY.value,)
INTERNAL_SCOPE_DB_VALUES = (TransactionScope.INTERNAL.value,)

ALL_STATUS_DB_VALUES = (
    *APPROVED_STATUS_DB_VALUES,
    *PENDING_STATUS_DB_VALUES,
    *REJECTED_STATUS_DB_VALUES,
    *CANCELLED_STATUS_DB_VALUES,
)
ALL_TRANSACTION_TYPE_DB_VALUES = (
    *INCOME_TYPE_DB_VALUES,
    *EXPENSE_TYPE_DB_VALUES,
    *ADVANCE_TYPE_DB_VALUES,
    *REIMBURSEMENT_TYPE_DB_VALUES,
)
ALL_PAYMENT_METHOD_DB_VALUES = (
    *CASH_PAYMENT_METHOD_DB_VALUES,
    *BANK_PAYMENT_METHOD_DB_VALUES,
)
ALL_SCOPE_DB_VALUES = (
    *COMPANY_SCOPE_DB_VALUES,
    *INTERNAL_SCOPE_DB_VALUES,
)


# ─── Normalization maps (canonical English values and lowercase English input) ───

TX_TYPE_MAP = {
    "income": TransactionType.INCOME.value,
    "expense": TransactionType.EXPENSE.value,
    "advance": TransactionType.ADVANCE.value,
    "reimbursement": TransactionType.REIMBURSEMENT.value,
}

STATUS_MAP = {
    "completed": TransactionStatus.COMPLETED.value,
    "settled": TransactionStatus.SETTLED.value,
    "pending": TransactionStatus.PENDING.value,
    "rejected": TransactionStatus.REJECTED.value,
    "cancelled": TransactionStatus.CANCELLED.value,
}

PAYMENT_METHOD_MAP = {
    "cash": PaymentMethod.CASH.value,
    "bank_transfer": PaymentMethod.BANK_TRANSFER.value,
    "bank": PaymentMethod.BANK_TRANSFER.value,
}

SCOPE_MAP = {
    "company": TransactionScope.COMPANY.value,
    "internal": TransactionScope.INTERNAL.value,
}

# ─── Vietnamese Display Labels for UI Presentation ───

TX_TYPE_LABELS = {
    TransactionType.INCOME.value: "Thu",
    TransactionType.EXPENSE.value: "Chi",
    TransactionType.ADVANCE.value: "Tạm ứng",
    TransactionType.REIMBURSEMENT.value: "Hoàn ứng",
}

STATUS_LABELS = {
    TransactionStatus.COMPLETED.value: "Hoàn thành",
    TransactionStatus.PENDING.value: "Chờ duyệt",
    TransactionStatus.REJECTED.value: "Từ chối",
    TransactionStatus.CANCELLED.value: "Đã hủy",
    TransactionStatus.SETTLED.value: "Đã quyết toán",
}

PAYMENT_METHOD_LABELS = {
    PaymentMethod.CASH.value: "Tiền mặt",
    PaymentMethod.BANK_TRANSFER.value: "Chuyển khoản",
}

SCOPE_LABELS = {
    TransactionScope.COMPANY.value: "Công ty",
    TransactionScope.INTERNAL.value: "Nội bộ",
}


def normalize_transaction_type(val: Optional[str]) -> str:
    if not val:
        return TransactionType.INCOME.value
    clean = str(val).strip().lower()
    return TX_TYPE_MAP.get(clean, val.upper() if val.isalpha() else val)


def normalize_status(val: Optional[str]) -> str:
    if not val:
        return TransactionStatus.PENDING.value
    clean = str(val).strip().lower()
    return STATUS_MAP.get(clean, val.upper() if val.isalpha() else val)


def normalize_payment_method(val: Optional[str]) -> str:
    if not val:
        return PaymentMethod.CASH.value
    clean = str(val).strip().lower()
    return PAYMENT_METHOD_MAP.get(clean, val.upper() if val.isalpha() else val)


def normalize_scope(val: Optional[str]) -> str:
    if not val:
        return TransactionScope.COMPANY.value
    clean = str(val).strip().lower()
    return SCOPE_MAP.get(clean, val.upper() if val.isalpha() else val)


def get_transaction_type_label(val: Optional[str]) -> str:
    normalized = normalize_transaction_type(val)
    return TX_TYPE_LABELS.get(normalized, val or "Thu")


def get_status_label(val: Optional[str]) -> str:
    normalized = normalize_status(val)
    return STATUS_LABELS.get(normalized, val or "Chờ duyệt")


def get_payment_method_label(val: Optional[str]) -> str:
    normalized = normalize_payment_method(val)
    return PAYMENT_METHOD_LABELS.get(normalized, val or "Tiền mặt")


def get_scope_label(val: Optional[str]) -> str:
    normalized = normalize_scope(val)
    return SCOPE_LABELS.get(normalized, val or "Công ty")


def get_transaction_type_aliases(val: Optional[str]) -> list[str]:
    if not val or val in ("All", ""):
        return []
    canon = normalize_transaction_type(val)
    return [canon] if canon in ALL_TRANSACTION_TYPE_DB_VALUES else []


def get_status_aliases(val: Optional[str]) -> list[str]:
    if not val or val in ("All", ""):
        return []
    canon = normalize_status(val)
    return [canon] if canon in ALL_STATUS_DB_VALUES else []


def get_payment_method_aliases(val: Optional[str]) -> list[str]:
    if not val or val in ("All", ""):
        return []
    canon = normalize_payment_method(val)
    return [canon] if canon in ALL_PAYMENT_METHOD_DB_VALUES else []


def get_scope_aliases(val: Optional[str]) -> list[str]:
    if not val or val in ("All", ""):
        return []
    canon = normalize_scope(val)
    return [canon] if canon in ALL_SCOPE_DB_VALUES else []

