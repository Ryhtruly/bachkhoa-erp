"""Validation and immutable metadata for payment receipt objects."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import re
import uuid


MAX_RECEIPT_BYTES = 5 * 1024 * 1024
MAX_RECEIPT_FILES = 5
ALLOWED_RECEIPT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
}


def _safe_segment(value: object, fallback: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", str(value or ""))
    safe = re.sub(r"_+", "_", safe).strip("_.")
    return safe or fallback


def _detect_content_type(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    return None


@dataclass(frozen=True)
class ValidatedReceipt:
    filename: str
    content_type: str
    data: bytes
    sha256: str

    @property
    def size(self) -> int:
        return len(self.data)


def validate_receipt(filename: str | None, declared_content_type: str | None, data: bytes) -> ValidatedReceipt:
    if not data:
        raise ValueError("File bill/biên lai đang rỗng.")
    if len(data) > MAX_RECEIPT_BYTES:
        raise ValueError("Mỗi file bill/biên lai không được vượt quá 5MB.")

    detected_type = _detect_content_type(data)
    if detected_type not in ALLOWED_RECEIPT_TYPES:
        raise ValueError("Chỉ chấp nhận ảnh JPEG, PNG, WEBP hoặc file PDF.")

    declared_type = (declared_content_type or "").lower().split(";", 1)[0].strip()
    if declared_type and declared_type != "application/octet-stream" and declared_type != detected_type:
        raise ValueError("Định dạng thực tế của file không khớp với loại file được khai báo.")

    display_name = str(filename or "receipt").replace("\\", "/").rsplit("/", 1)[-1]
    display_name = re.sub(r"[\x00-\x1f\x7f]", "", display_name).strip()[:180] or "receipt"
    return ValidatedReceipt(
        filename=display_name,
        content_type=detected_type,
        data=data,
        sha256=hashlib.sha256(data).hexdigest(),
    )


def build_receipt_metadata(task_node_id: str, batch_id: str, receipt: ValidatedReceipt) -> dict:
    receipt_id = uuid.uuid4().hex
    safe_node_id = _safe_segment(task_node_id, "task")
    safe_batch_id = _safe_segment(batch_id, "batch")
    object_key = (
        f"finance/payment-receipts/{safe_node_id}/{safe_batch_id}/"
        f"{receipt_id}_{_safe_segment(receipt.filename, 'receipt')}"
    )
    return {
        "id": receipt_id,
        "object_key": object_key,
        "filename": receipt.filename,
        "content_type": receipt.content_type,
        "size": receipt.size,
        "sha256": receipt.sha256,
    }


def public_receipt_attachments(attachments: object, legacy_url: str | None = None) -> list[dict]:
    public_items: list[dict] = []
    if isinstance(attachments, list):
        for item in attachments:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            public_items.append({
                "id": str(item["id"]),
                "filename": str(item.get("filename") or "Bill / biên lai"),
                "content_type": str(item.get("content_type") or "application/octet-stream"),
                "size": int(item.get("size") or 0),
                "url": f"/api/handover/payment-receipts/{item['id']}",
            })

    if not public_items and legacy_url:
        public_items.append({
            "id": None,
            "filename": "Bill / biên lai cũ",
            "content_type": "application/octet-stream",
            "size": 0,
            "url": legacy_url,
            "legacy": True,
        })
    return public_items
