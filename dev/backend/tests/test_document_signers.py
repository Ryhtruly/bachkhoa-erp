import json
from datetime import datetime, timezone

from src.db.models import CashflowTransaction, SystemSetting
from src.finance.document_signers import (
    DEFAULT_DOCUMENT_SIGNERS,
    create_document_signer_snapshot,
    decode_document_signers,
    normalize_document_signers,
)


def test_document_signers_default_to_known_director_and_empty_accountant():
    result = normalize_document_signers({})

    assert result == DEFAULT_DOCUMENT_SIGNERS
    assert result["director_name"] == "Lê Văn Sáu"
    assert result["accountant_name"] == ""
    assert result["accountant_role"] == "Kế toán trưởng"


def test_document_signers_trim_values_and_keep_supported_accountant_role():
    result = normalize_document_signers({
        "director_name": "  Lê Văn Sáu  ",
        "accountant_name": "  Nguyễn Kế Toán  ",
        "accountant_role": "Kế toán phụ trách",
        "cashier_name": "  Trần Thủ Quỹ  ",
    })

    assert result["director_name"] == "Lê Văn Sáu"
    assert result["accountant_name"] == "Nguyễn Kế Toán"
    assert result["accountant_role"] == "Kế toán phụ trách"
    assert result["cashier_name"] == "Trần Thủ Quỹ"


def test_document_signers_reject_unknown_role_and_decode_invalid_json_safely():
    result = normalize_document_signers({"accountant_role": "Kế toán bất kỳ"})
    assert result["accountant_role"] == "Kế toán trưởng"

    assert decode_document_signers("not-json") == DEFAULT_DOCUMENT_SIGNERS


def test_document_signers_endpoint_is_readable_and_writable_with_finance_approval(client, finance_clerk_user):
    user, headers = finance_clerk_user

    get_response = client.get("/api/finance/document-signers", headers=headers)
    assert get_response.status_code == 200
    assert get_response.json()["director_name"] == "Lê Văn Sáu"

    save_response = client.post(
        "/api/finance/document-signers",
        json={
            "director_name": "Lê Văn Sáu",
            "accountant_name": "",
            "accountant_role": "Kế toán trưởng",
            "cashier_name": "",
            "payroll_accountant_name": "",
        },
        headers=headers,
    )
    assert save_response.status_code == 200
    assert save_response.json()["accountant_name"] == ""


def test_document_signer_snapshot_is_normalized_and_keeps_capture_metadata():
    snapshot = create_document_signer_snapshot(
        {
            "director_name": "  Lê Văn Sáu  ",
            "accountant_name": "Nguyễn Kế Toán",
            "accountant_role": "Kế toán phụ trách",
        },
        captured_by="director-user",
        captured_at=datetime(2026, 8, 23, 10, 30, tzinfo=timezone.utc),
    )

    assert snapshot["director_name"] == "Lê Văn Sáu"
    assert snapshot["accountant_name"] == "Nguyễn Kế Toán"
    assert snapshot["accountant_role"] == "Kế toán phụ trách"
    assert snapshot["captured_by"] == "director-user"
    assert snapshot["captured_at"] == "2026-08-23T10:30:00+00:00"


def test_document_signer_snapshot_keeps_transaction_people_at_capture_time():
    snapshot = create_document_signer_snapshot(
        {"director_name": "Lê Văn Sáu"},
        creator={
            "user_id": "creator-1",
            "name": "Nguyễn Văn A",
            "role": "Kế toán",
        },
        recipient={
            "employee_id": "employee-1",
            "name": "Nguyễn Văn B",
            "role": "Nhân viên đo vẽ",
            "department": "Phòng Đo vẽ",
        },
    )

    assert snapshot["creator_user_id"] == "creator-1"
    assert snapshot["creator_name"] == "Nguyễn Văn A"
    assert snapshot["creator_role"] == "Kế toán"
    assert snapshot["recipient_employee_id"] == "employee-1"
    assert snapshot["recipient_name"] == "Nguyễn Văn B"
    assert snapshot["recipient_department"] == "Phòng Đo vẽ"


def test_approved_cashflow_stores_signer_snapshot_and_serializes_it(client, finance_clerk_user, db):
    user, headers = finance_clerk_user
    db.merge(SystemSetting(
        key="finance.document_signers",
        value=json.dumps({
            "director_name": "Lê Văn Sáu",
            "accountant_name": "Nguyễn Kế Toán",
            "accountant_role": "Kế toán phụ trách",
            "cashier_name": "Trần Thủ Quỹ",
            "payroll_accountant_name": "",
        }, ensure_ascii=False),
    ))
    db.commit()

    created = client.post(
        "/api/finance/cashflow/create",
        json={
            "type": "Chi",
            "amount": 1000,
            "category": "Test snapshot",
            "payer_payee": "Đối tác snapshot",
            "payment_method": "Chuyển khoản",
            "transaction_date": "2026-08-23",
            "description": "Kiểm tra snapshot người ký",
            "scope": "Công ty",
        },
        headers=headers,
    )
    assert created.status_code == 200, created.text
    voucher_id = created.json()["id"]

    pending = db.query(CashflowTransaction).filter(CashflowTransaction.id == voucher_id).first()
    assert pending.signer_snapshot is None

    approved = client.post(f"/api/finance/cashflow/{voucher_id}/approve", headers=headers)
    assert approved.status_code == 200, approved.text

    db.expire_all()
    transaction = db.query(CashflowTransaction).filter(CashflowTransaction.id == voucher_id).first()
    assert transaction.signer_snapshot["director_name"] == "Lê Văn Sáu"
    assert transaction.signer_snapshot["accountant_name"] == "Nguyễn Kế Toán"
    assert transaction.signer_snapshot["accountant_role"] == "Kế toán phụ trách"
    assert transaction.signer_snapshot["captured_by"] == user.id

    detail = client.get(f"/api/finance/cashflow/{voucher_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["signer_snapshot"]["accountant_name"] == "Nguyễn Kế Toán"
    assert detail.json()["created_by_user_id"] == user.id
    assert detail.json()["created_by_name"] == user.username
    assert detail.json()["signer_snapshot"]["creator_user_id"] == user.id
    assert detail.json()["signer_snapshot"]["creator_name"] == user.username
    assert detail.json()["signer_snapshot"]["counterparty_name"] == "Đối tác snapshot"
