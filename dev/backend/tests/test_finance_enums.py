import pytest
from pydantic import ValidationError
from src.finance.enums import (
    TransactionType,
    TransactionStatus,
    PaymentMethod,
    TransactionScope,
    normalize_transaction_type,
    normalize_status,
    normalize_payment_method,
    normalize_scope,
    get_transaction_type_label,
    get_status_label,
    get_payment_method_label,
    get_scope_label,
    APPROVED_STATUS_SET,
    PENDING_STATUS_SET,
    APPROVED_STATUS_DB_VALUES,
    PENDING_STATUS_DB_VALUES,
)
from src.finance.schemas import CashflowIn, AdvanceCreateIn, FundCloseIn


def test_transaction_type_enum_and_normalization():
    assert normalize_transaction_type("income") == TransactionType.INCOME.value
    assert normalize_transaction_type("INCOME") == TransactionType.INCOME.value
    assert normalize_transaction_type("expense") == TransactionType.EXPENSE.value
    assert normalize_transaction_type("advance") == TransactionType.ADVANCE.value
    assert normalize_transaction_type("reimbursement") == TransactionType.REIMBURSEMENT.value
    assert normalize_transaction_type("Thu") != TransactionType.INCOME.value
    assert normalize_transaction_type("Tạm ứng") != TransactionType.ADVANCE.value

    assert get_transaction_type_label("INCOME") == "Thu"
    assert get_transaction_type_label("EXPENSE") == "Chi"
    assert get_transaction_type_label("ADVANCE") == "Tạm ứng"
    assert get_transaction_type_label("REIMBURSEMENT") == "Hoàn ứng"


def test_transaction_status_enum_and_normalization():
    assert normalize_status("COMPLETED") == TransactionStatus.COMPLETED.value
    assert normalize_status("SETTLED") == TransactionStatus.SETTLED.value
    assert normalize_status("PENDING") == TransactionStatus.PENDING.value
    assert normalize_status("REJECTED") == TransactionStatus.REJECTED.value
    assert normalize_status("CANCELLED") == TransactionStatus.CANCELLED.value

    # Legacy Vietnamese/lowercase values must not be treated as persisted
    # Finance enum values after the backfill migration.
    assert normalize_status("Hoàn thành") != TransactionStatus.COMPLETED.value
    assert normalize_status("Đã quyết toán") != TransactionStatus.SETTLED.value
    assert normalize_status("Chờ duyệt") != TransactionStatus.PENDING.value

    assert get_status_label("COMPLETED") == "Hoàn thành"
    assert get_status_label("PENDING") == "Chờ duyệt"
    assert get_status_label("REJECTED") == "Từ chối"
    assert get_status_label("CANCELLED") == "Đã hủy"
    assert get_status_label("SETTLED") == "Đã quyết toán"


def test_finance_status_sets_are_canonical_and_db_aliases_are_centralized():
    assert APPROVED_STATUS_SET == {"COMPLETED", "SETTLED"}
    assert PENDING_STATUS_SET == {"PENDING"}
    assert not {"Hoàn thành", "Đã duyệt", "Đã quyết toán"}.intersection(APPROVED_STATUS_SET)
    assert APPROVED_STATUS_DB_VALUES == ("COMPLETED", "SETTLED")
    assert PENDING_STATUS_DB_VALUES == ("PENDING",)


def test_payment_method_enum_and_normalization():
    assert normalize_payment_method("cash") == PaymentMethod.CASH.value
    assert normalize_payment_method("bank") == PaymentMethod.BANK_TRANSFER.value
    assert normalize_payment_method("bank_transfer") == PaymentMethod.BANK_TRANSFER.value
    assert normalize_payment_method("Tiền mặt") != PaymentMethod.CASH.value

    assert get_payment_method_label("CASH") == "Tiền mặt"
    assert get_payment_method_label("BANK_TRANSFER") == "Chuyển khoản"


def test_scope_enum_and_normalization():
    assert normalize_scope("company") == TransactionScope.COMPANY.value
    assert normalize_scope("internal") == TransactionScope.INTERNAL.value
    assert normalize_scope("Công ty") != TransactionScope.COMPANY.value

    assert get_scope_label("COMPANY") == "Công ty"
    assert get_scope_label("INTERNAL") == "Nội bộ"


def test_pydantic_schema_normalization():
    cf = CashflowIn(
        type="INCOME",
        amount=1000000,
        category="Test Category",
        payer_payee="Test Partner",
        payment_method="CASH",
        scope="COMPANY",
        status="PENDING"
    )
    assert cf.type == "INCOME"
    assert cf.payment_method == "CASH"
    assert cf.scope == "COMPANY"
    assert cf.status == "PENDING"

    adv = AdvanceCreateIn(
        amount=500000,
        payer_payee="Test Staff",
        payment_method="BANK_TRANSFER"
    )
    assert adv.payment_method == "BANK_TRANSFER"

    fc = FundCloseIn(
        payment_method="CASH",
        actual_amount=1500000,
        closing_date="2026-08-22"
    )
    assert fc.payment_method == "CASH"


def test_pydantic_finance_schema_rejects_legacy_vietnamese_enum_values():
    with pytest.raises(ValidationError):
        CashflowIn(
            type="Thu",
            amount=100000,
            category="Thu khác",
            payer_payee="Khách hàng",
            payment_method="Tiền mặt",
            scope="Công ty",
        )
