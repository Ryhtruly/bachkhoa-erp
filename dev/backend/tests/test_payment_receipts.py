from datetime import date
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from src.files.payment_receipts import (
    MAX_RECEIPT_BYTES,
    build_receipt_metadata,
    public_receipt_attachments,
    validate_receipt,
)
from src.finance.serializers import serialize_cashflow_bulk
from src.services import storage_service
from src.routes import routes_handover


@pytest.mark.parametrize(
    ("filename", "declared_type", "content", "expected_type"),
    [
        ("bill.jpg", "image/jpeg", b"\xff\xd8\xffreceipt", "image/jpeg"),
        ("bill.png", "image/png", b"\x89PNG\r\n\x1a\nreceipt", "image/png"),
        ("bill.webp", "image/webp", b"RIFF1234WEBPreceipt", "image/webp"),
        ("bill.pdf", "application/pdf", b"%PDF-1.7\nreceipt", "application/pdf"),
    ],
)
def test_validate_receipt_uses_file_signature(filename, declared_type, content, expected_type):
    receipt = validate_receipt(filename, declared_type, content)
    assert receipt.content_type == expected_type
    assert receipt.filename == filename
    assert receipt.size == len(content)


def test_validate_receipt_rejects_renamed_or_oversized_file():
    with pytest.raises(ValueError, match="JPEG"):
        validate_receipt("fake.jpg", "image/jpeg", b"<html>not an image</html>")

    with pytest.raises(ValueError, match="5MB"):
        validate_receipt("huge.jpg", "image/jpeg", b"\xff\xd8\xff" + b"x" * MAX_RECEIPT_BYTES)


def test_metadata_is_unique_private_and_public_shape_hides_storage_details():
    receipt = validate_receipt("Biên nhận số 1.png", "image/png", b"\x89PNG\r\n\x1a\nreceipt")
    first = build_receipt_metadata("K08/2026", "batch-1", receipt)
    second = build_receipt_metadata("K08/2026", "batch-1", receipt)

    assert first["id"] != second["id"]
    assert first["object_key"].startswith("finance/payment-receipts/K08_2026/batch-1/")

    public = public_receipt_attachments([first])
    assert public == [{
        "id": first["id"],
        "filename": "Biên nhận số 1.png",
        "content_type": "image/png",
        "size": receipt.size,
        "url": f"/api/handover/payment-receipts/{first['id']}",
    }]
    assert "object_key" not in public[0]
    assert "sha256" not in public[0]


def test_bulk_cashflow_serializer_keeps_old_fields_and_adds_safe_receipts():
    receipt = validate_receipt("bill.pdf", "application/pdf", b"%PDF-1.7\nreceipt")
    metadata = build_receipt_metadata("K08", "batch", receipt)
    row = SimpleNamespace(
        id="PT-001",
        transaction_type="Thu",
        amount=1_000_000,
        description="Khách thanh toán",
        category_code="OTHER_INCOME",
        payer_payee_name="Khách A",
        payment_method="Chuyển khoản",
        transaction_date=date(2026, 8, 14),
        created_at=None,
        contract_id=None,
        project_id=None,
        balance_after=1_000_000,
        cash_balance_after=0,
        bank_balance_after=1_000_000,
        status="Chờ duyệt",
        scope="Công ty",
        receipt_attachments=[metadata],
        receipt_attachment_url=None,
    )

    result = serialize_cashflow_bulk([row], db=None)[0]
    assert result["id"] == "PT-001"
    assert result["transaction_date"] == "2026-08-14"
    assert result["receipt_attachment_url"].endswith(metadata["id"])
    assert result["receipt_attachments"][0]["filename"] == "bill.pdf"


def test_finance_bucket_is_created_without_public_policy(monkeypatch):
    calls = []

    class FakeS3:
        def head_bucket(self, **kwargs):
            calls.append(("head", kwargs))
            raise RuntimeError("missing")

        def create_bucket(self, **kwargs):
            calls.append(("create", kwargs))

        def put_bucket_policy(self, **kwargs):
            calls.append(("policy", kwargs))

    monkeypatch.setattr(storage_service, "_s3", FakeS3())
    storage_service.ensure_finance_bucket()

    assert calls == [
        ("head", {"Bucket": storage_service.FINANCE_BUCKET}),
        ("create", {"Bucket": storage_service.FINANCE_BUCKET}),
    ]


def test_finance_upload_targets_private_bucket_with_explicit_content_type(monkeypatch):
    captured = {}

    class FakeS3:
        def upload_fileobj(self, file_obj, bucket, object_name, ExtraArgs):
            captured.update({
                "data": file_obj.read(),
                "bucket": bucket,
                "object_name": object_name,
                "extra_args": ExtraArgs,
            })

    monkeypatch.setattr(storage_service, "_s3", FakeS3())
    result = storage_service.upload_finance_file(
        BytesIO(b"receipt"),
        "finance/payment-receipts/task/batch/id_bill.png",
        content_type="image/png",
        metadata={"receipt-id": "id-1"},
    )

    assert result == captured["object_name"]
    assert captured["bucket"] == storage_service.FINANCE_BUCKET
    assert captured["extra_args"] == {
        "ContentType": "image/png",
        "Metadata": {"receipt-id": "id-1"},
    }


def test_receipt_view_denies_non_finance_user_who_did_not_create_payment(monkeypatch):
    class FakeResult:
        def mappings(self):
            return self

        def first(self):
            return {
                "id": "PT-001",
                "created_by_user_id": "creator-1",
                "receipt_attachments": [{"id": "receipt-1", "object_key": "private/key"}],
            }

    db = SimpleNamespace(execute=lambda *_args, **_kwargs: FakeResult())
    monkeypatch.setattr(routes_handover, "check_user_permission", lambda *_args: False)
    monkeypatch.setattr(
        routes_handover,
        "get_finance_file",
        lambda *_args: pytest.fail("storage must not be read before authorization"),
    )

    with pytest.raises(HTTPException) as error:
        routes_handover.view_payment_receipt(
            "receipt-1",
            db=db,
            user=SimpleNamespace(id="other-user"),
        )
    assert error.value.status_code == 403


def test_rejected_payment_cleans_up_uploaded_objects(monkeypatch):
    deleted = []

    class FakeDb:
        rolled_back = False

        def rollback(self):
            self.rolled_back = True

    db = FakeDb()
    upload = UploadFile(
        BytesIO(b"\x89PNG\r\n\x1a\nreceipt"),
        filename="bill.png",
        headers=Headers({"content-type": "image/png"}),
    )
    monkeypatch.setattr(routes_handover, "check_user_permission", lambda *_args: True)
    monkeypatch.setattr(routes_handover, "ensure_finance_bucket", lambda: None)
    monkeypatch.setattr(routes_handover, "upload_finance_file", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(routes_handover, "delete_finance_file", deleted.append)

    def reject_business_write(*_args, **_kwargs):
        raise HTTPException(status_code=400, detail="invalid payment")

    monkeypatch.setattr(routes_handover.HO, "record_payment", reject_business_write)

    with pytest.raises(HTTPException) as error:
        routes_handover.record_payment(
            "task/K08",
            amount=1_000_000,
            payment_method="Chuyển khoản",
            payer_name="Khách A",
            note=None,
            receipt_files=[upload],
            db=db,
            user=SimpleNamespace(id="accountant-1"),
        )

    assert error.value.status_code == 400
    assert db.rolled_back is True
    assert len(deleted) == 1
    assert deleted[0].startswith("finance/payment-receipts/task_K08/")
