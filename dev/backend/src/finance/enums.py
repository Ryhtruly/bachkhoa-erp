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


class PaymentMethod(str, Enum):
    CASH = "CASH"
    BANK_TRANSFER = "BANK_TRANSFER"


class TransactionScope(str, Enum):
    COMPANY = "COMPANY"
    INTERNAL = "INTERNAL"


# ─── Normalization maps (supports legacy Vietnamese & English inputs) ───

TX_TYPE_MAP = {
    "income": TransactionType.INCOME.value,
    "thu": TransactionType.INCOME.value,
    "thu tiền": TransactionType.INCOME.value,
    "thu_tien": TransactionType.INCOME.value,
    "expense": TransactionType.EXPENSE.value,
    "chi": TransactionType.EXPENSE.value,
    "chi tiền": TransactionType.EXPENSE.value,
    "chi_tien": TransactionType.EXPENSE.value,
    "advance": TransactionType.ADVANCE.value,
    "tạm ứng": TransactionType.ADVANCE.value,
    "tam_ung": TransactionType.ADVANCE.value,
    "reimbursement": TransactionType.REIMBURSEMENT.value,
    "hoàn ứng": TransactionType.REIMBURSEMENT.value,
    "hoan_ung": TransactionType.REIMBURSEMENT.value,
    "quyết toán": TransactionType.REIMBURSEMENT.value,
    "quyet_toan": TransactionType.REIMBURSEMENT.value,
    "advance_clear": TransactionType.REIMBURSEMENT.value,
}

STATUS_MAP = {
    "completed": TransactionStatus.COMPLETED.value,
    "approved": TransactionStatus.COMPLETED.value,
    "hoàn thành": TransactionStatus.COMPLETED.value,
    "hoan_thanh": TransactionStatus.COMPLETED.value,
    "đã duyệt": TransactionStatus.COMPLETED.value,
    "da_duyet": TransactionStatus.COMPLETED.value,
    "đã quyết toán": TransactionStatus.COMPLETED.value,
    "da_quyet_toan": TransactionStatus.COMPLETED.value,
    "pending": TransactionStatus.PENDING.value,
    "chờ duyệt": TransactionStatus.PENDING.value,
    "cho_duyet": TransactionStatus.PENDING.value,
    "rejected": TransactionStatus.REJECTED.value,
    "từ chối": TransactionStatus.REJECTED.value,
    "tu_choi": TransactionStatus.REJECTED.value,
    "cancelled": TransactionStatus.CANCELLED.value,
    "đã hủy": TransactionStatus.CANCELLED.value,
    "da_huy": TransactionStatus.CANCELLED.value,
}

PAYMENT_METHOD_MAP = {
    "cash": PaymentMethod.CASH.value,
    "tiền mặt": PaymentMethod.CASH.value,
    "tien_mat": PaymentMethod.CASH.value,
    "tm": PaymentMethod.CASH.value,
    "bank_transfer": PaymentMethod.BANK_TRANSFER.value,
    "bank": PaymentMethod.BANK_TRANSFER.value,
    "chuyển khoản": PaymentMethod.BANK_TRANSFER.value,
    "chuyen_khoan": PaymentMethod.BANK_TRANSFER.value,
    "ckhoản": PaymentMethod.BANK_TRANSFER.value,
    "ck": PaymentMethod.BANK_TRANSFER.value,
}

SCOPE_MAP = {
    "company": TransactionScope.COMPANY.value,
    "công ty": TransactionScope.COMPANY.value,
    "cong_ty": TransactionScope.COMPANY.value,
    "internal": TransactionScope.INTERNAL.value,
    "nội bộ": TransactionScope.INTERNAL.value,
    "noi_bo": TransactionScope.INTERNAL.value,
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
    aliases = {canon, val, TX_TYPE_LABELS.get(canon, "")}
    for k, v in TX_TYPE_MAP.items():
        if v == canon:
            aliases.add(k)
            aliases.add(k.capitalize())
            aliases.add(k.upper())
    return [a for a in aliases if a]


def get_status_aliases(val: Optional[str]) -> list[str]:
    if not val or val in ("All", ""):
        return []
    canon = normalize_status(val)
    aliases = {canon, val, STATUS_LABELS.get(canon, "")}
    for k, v in STATUS_MAP.items():
        if v == canon:
            aliases.add(k)
            aliases.add(k.capitalize())
            aliases.add(k.upper())
    return [a for a in aliases if a]


def get_payment_method_aliases(val: Optional[str]) -> list[str]:
    if not val or val in ("All", ""):
        return []
    canon = normalize_payment_method(val)
    aliases = {canon, val, PAYMENT_METHOD_LABELS.get(canon, "")}
    for k, v in PAYMENT_METHOD_MAP.items():
        if v == canon:
            aliases.add(k)
            aliases.add(k.capitalize())
            aliases.add(k.upper())
    return [a for a in aliases if a]


def get_scope_aliases(val: Optional[str]) -> list[str]:
    if not val or val in ("All", ""):
        return []
    canon = normalize_scope(val)
    aliases = {canon, val, SCOPE_LABELS.get(canon, "")}
    for k, v in SCOPE_MAP.items():
        if v == canon:
            aliases.add(k)
            aliases.add(k.capitalize())
            aliases.add(k.upper())
    return [a for a in aliases if a]

