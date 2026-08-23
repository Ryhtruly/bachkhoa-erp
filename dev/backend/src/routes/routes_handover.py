"""Node bàn giao (K08) — cổng công nợ, 2 làn Pháp lý / Kế toán."""

import io
import json
import os
import zipfile
import logging
from typing import Optional
from urllib.parse import quote, unquote
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.core.auth import check_user_permission, get_current_user, require_permission
from src.db.database import get_db
from src.db.models import User
from src.dossiers import handover as HO
from src.dossiers.actor_guard import assert_can_act_on_node, format_on_behalf_note
from src.files.payment_receipts import (
    MAX_RECEIPT_BYTES,
    MAX_RECEIPT_FILES,
    build_receipt_metadata,
    validate_receipt,
)
from src.services.timeline_realtime import publish_timeline_change
from src.core.redis_utils import (
    redis_distributed_lock, get_cached_json, set_cached_json,
    invalidate_cache, invalidate_money_caches,
)
from src.services.storage_service import (
    BUCKET as MINIO_BUCKET,
    ENDPOINT as MINIO_ENDPOINT,
    PUBLIC_URL as MINIO_PUBLIC_URL,
    delete_finance_file,
    get_file,
    ensure_finance_bucket,
    get_finance_file,
    upload_finance_file,
)

router = APIRouter(prefix="/api/handover", tags=["Handover"])
logger = logging.getLogger(__name__)


class DeliverSchema(BaseModel):
    # Nhân viên phải bấm xác nhận khi còn nợ — không chặn, nhưng có dấu vết.
    acknowledged_debt: bool = False
    note: Optional[str] = None
    # Chỉ giám đốc dùng, khi bấm nút "Xử lý thay".
    on_behalf_reason: Optional[str] = None


@router.get("/outstanding")
def list_outstanding(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read")),
):
    """Đã giao — chưa thu đủ. Màn hình chính của kế toán."""
    cache_key = "bachkhoa:handover:outstanding"
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached

    rows = HO.outstanding_handovers(db)
    result = {
        "status": "success",
        "data": rows,
        "meta": {"total": len(rows), "total_remaining": sum(r["remaining"] for r in rows)},
    }
    set_cached_json(cache_key, result, ttl_seconds=60)
    return result


@router.get("/{task_node_id}")
def get_handover_state(
    task_node_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("task_node", "read")),
):
    return {"status": "success", "data": HO.get_state(db, task_node_id, user_id=user.id)}


@router.get("/payment-receipts/{receipt_id}")
def view_payment_receipt(
    receipt_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Stream one private receipt to finance readers or the payment creator."""
    row = db.execute(
        text("""
            select id, created_by_user_id, receipt_attachments
            from public.cashflow_transactions
            where receipt_attachments @> cast(:needle as jsonb)
            limit 1
        """),
        {"needle": json.dumps([{"id": receipt_id}])},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy bill/biên lai")
    can_read_finance = check_user_permission(db, user, "finance", "read")
    is_creator = str(row["created_by_user_id"] or "") == str(user.id)
    if not can_read_finance and not is_creator:
        raise HTTPException(status_code=403, detail="Không có quyền xem bill/biên lai này")

    attachment = next(
        (item for item in (row["receipt_attachments"] or []) if item.get("id") == receipt_id),
        None,
    )
    if not attachment or not attachment.get("object_key"):
        raise HTTPException(status_code=404, detail="Bill/biên lai không còn khả dụng")

    try:
        stored = get_finance_file(attachment["object_key"])
    except Exception as exc:
        logger.warning("Unable to read payment receipt %s: %s", receipt_id, exc)
        raise HTTPException(status_code=404, detail="File bill/biên lai không tồn tại trên kho lưu trữ") from exc

    body = stored["Body"]

    def iter_body():
        try:
            yield from body.iter_chunks(chunk_size=64 * 1024)
        finally:
            body.close()

    filename = str(attachment.get("filename") or "receipt")
    content_type = str(attachment.get("content_type") or stored.get("ContentType") or "application/octet-stream")
    disposition = "attachment" if content_type == "application/pdf" else "inline"
    return StreamingResponse(
        iter_body(),
        media_type=content_type,
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(filename)}",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/{task_node_id}/deliverables")
def list_handover_deliverables(
    task_node_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Danh sách tài liệu sẽ giao cho khách, kèm điều kiện mở khoá."""
    return {"data": HO.get_handover_deliverables(db, task_node_id)}


@router.get("/{task_node_id}/deliverables.zip")
def download_handover_package(
    task_node_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Đóng gói toàn bộ tài liệu bàn giao thành một file zip."""
    deliverables_package = HO.get_handover_deliverables(db, task_node_id)
    if not deliverables_package["can_download"]:
        raise HTTPException(status_code=409, detail=deliverables_package["blocked_reason"])
    if not deliverables_package["items"]:
        raise HTTPException(status_code=404, detail="Hạng mục này chưa có tài liệu nào để bàn giao")

    buffer = io.BytesIO()
    external_links: list[str] = []
    static_dir = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "static"))

    def _fetch_file_content(url: str):
        if "/payment-receipts/" in url:
            return get_finance_file(url.split("/api/handover/payment-receipts/")[-1])["Body"].read()

        if url.startswith("/static/"):
            safe_path = os.path.normpath(os.path.join(static_dir, url[len("/static/"):]))
            if not safe_path.startswith(static_dir + os.sep) or not os.path.isfile(safe_path):
                return None
            with open(safe_path, "rb") as f:
                return f.read()

        for base_url in {MINIO_ENDPOINT, MINIO_PUBLIC_URL}:
            prefix = f"{base_url.rstrip(chr(47))}/{MINIO_BUCKET}/" if base_url else None
            if prefix and url.startswith(prefix):
                return get_file(unquote(url[len(prefix):].split("?")[0]))
        return None

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, item in enumerate(deliverables_package["items"], start=1):
            url = item["url"]
            try:
                content = _fetch_file_content(url)
            except Exception:
                logger.warning("Không lấy được tệp cho gói bàn giao: %s", url)
                content = None
            if content:
                filename = os.path.basename(item["ten"]) or f"tai_lieu_{i}"
                zf.writestr(f"{item['nhom']}/{i:02d}_{filename}", content)
            else:
                external_links.append(f"[{item['nhom']}] {item['ten']}\n    {url}")

        if external_links:
            zf.writestr(
                "DANH_MUC.txt",
                "TAI LIEU CHI CO DUONG DAN — PHAI LAY TAY:\n\n" + "\n\n".join(external_links) + "\n",
            )

    buffer.seek(0)
    zip_filename = f"HoSoBanGiao_{deliverables_package['contract_id'].replace('/', '-')}.zip"
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(zip_filename)}"},
    )


@router.post("/{task_node_id}/deliver")
def deliver(
    task_node_id: str,
    payload: DeliverSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("task_node", "read")),
):
    """Làn A — xác nhận đã bàn giao tài liệu cho khách.

    Việc của NGƯỜI ĐƯỢC PHÂN CÔNG vào node bàn giao. Giám đốc chỉ xem; muốn làm
    thay phải đi lối "Xử lý thay" kèm lý do.
    """
    if not check_user_permission(db, user, "checklist", "update"):
        raise HTTPException(status_code=403, detail="Không có quyền xác nhận bàn giao")

    actor = assert_can_act_on_node(
        db, task_node_id=task_node_id, user_id=user.id,
        on_behalf_reason=payload.on_behalf_reason,
        action_description="xác nhận bàn giao cho công việc này",
    )
    result = HO.mark_delivered(
        db, task_node_id,
        acknowledged_debt=payload.acknowledged_debt,
        note=format_on_behalf_note(actor, payload.note),
        actor_id=user.id,
    )
    db.commit()
    return {"status": "success", "data": {**result, "on_behalf": actor["on_behalf"]}}


def _nhan_bill_roi_ghi(db, user, receipt_files, khoa_luu_tru: str, ghi_nhan):
    """Nhận bill, đẩy lên kho, rồi gọi `ghi_nhan(attachments)` để tạo phiếu thu.

    Tách ra vì có hai đường vào cùng làm việc này: thu tại bước bàn giao và thu
    thẳng theo hợp đồng. Cả hai đều phải có bill, và nếu ghi nhận hỏng thì file
    vừa đẩy lên phải được xoá — nếu không kho sẽ đầy ảnh mồ côi.
    """
    if not check_user_permission(db, user, "finance", "create"):
        raise HTTPException(status_code=403, detail="Không có quyền ghi nhận thu tiền")
    if not receipt_files:
        raise HTTPException(status_code=422, detail="Bắt buộc đính bill/biên lai")
    if len(receipt_files) > MAX_RECEIPT_FILES:
        raise HTTPException(status_code=422, detail=f"Mỗi đợt thanh toán chỉ được đính tối đa {MAX_RECEIPT_FILES} file")

    uploaded_keys: list[str] = []
    attachments: list[dict] = []
    batch_id = uuid.uuid4().hex
    try:
        ensure_finance_bucket()
        for upload in receipt_files:
            file_bytes = upload.file.read(MAX_RECEIPT_BYTES + 1)
            try:
                receipt = validate_receipt(upload.filename, upload.content_type, file_bytes)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc

            metadata = build_receipt_metadata(khoa_luu_tru, batch_id, receipt)
            upload_finance_file(
                io.BytesIO(receipt.data),
                metadata["object_key"],
                content_type=receipt.content_type,
                metadata={
                    "receipt-id": metadata["id"],
                    "sha256": metadata["sha256"],
                },
            )
            uploaded_keys.append(metadata["object_key"])
            attachments.append(metadata)

        result = ghi_nhan(attachments)
        db.commit()
        # Đánh thức chuông của giám đốc ngay. Không có tín hiệu này thì phiếu chờ
        # duyệt chỉ hiện sau khi người ta tình cờ tải lại trang.
        publish_timeline_change("cashflow_payment_recorded", entity_id=result.get("voucher_id"))
        invalidate_money_caches()
        return {"status": "success", "data": result}
    except HTTPException:
        db.rollback()
        for object_key in uploaded_keys:
            try:
                delete_finance_file(object_key)
            except Exception:
                logger.exception("Unable to clean up rejected receipt object %s", object_key)
        raise
    except Exception as exc:
        db.rollback()
        for object_key in uploaded_keys:
            try:
                delete_finance_file(object_key)
            except Exception:
                logger.exception("Unable to clean up failed receipt object %s", object_key)
        logger.exception("Unable to record payment receipt")
        raise HTTPException(status_code=503, detail="Không lưu được bill/biên lai. Vui lòng thử lại.") from exc


# `:path` vì mã hợp đồng có dấu gạch chéo — "003/BK-2026". Cùng lý do như các
# route hợp đồng khác trong routes_contracts.py.
@router.post("/contracts/{contract_id:path}/payments")
def record_contract_payment(
    contract_id: str,
    amount: float = Form(...),
    payment_method: str = Form("Tiền mặt"),
    payer_name: Optional[str] = Form(None),
    note: Optional[str] = Form(None),
    receipt_files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read")),
):
    """Thu tiền theo hợp đồng — không phụ thuộc quy trình đang đứng ở bước nào."""
    with redis_distributed_lock(
        f"payment:contract:{contract_id}",
        timeout_seconds=5,
        custom_error_msg="Đang xử lý một đợt thanh toán cho hợp đồng này, vui lòng đợi trong giây lát.",
    ):
        return _nhan_bill_roi_ghi(
            db, user, receipt_files, contract_id,
            lambda attachments: HO.record_contract_payment(
                db,
                contract_id,
                amount=amount,
                receipt_attachments=attachments,
                payment_method=payment_method,
                payer_name=payer_name,
                note=note,
                actor_id=user.id,
            ),
        )


@router.post("/{task_node_id}/payments")
def record_payment(
    task_node_id: str,
    amount: float = Form(...),
    payment_method: str = Form("Tiền mặt"),
    payer_name: Optional[str] = Form(None),
    note: Optional[str] = Form(None),
    receipt_files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read")),
):
    """Làn B — ghi nhận một đợt khách đưa tiền. Phiếu vào trạng thái Chờ duyệt."""
    with redis_distributed_lock(
        f"payment:node:{task_node_id}",
        timeout_seconds=5,
        custom_error_msg="Đang xử lý một đợt thanh toán cho bước này, vui lòng đợi trong giây lát.",
    ):
        return _nhan_bill_roi_ghi(
            db, user, receipt_files, task_node_id,
            lambda attachments: HO.record_payment(
                db,
                task_node_id,
                amount=amount,
                receipt_attachments=attachments,
                payment_method=payment_method,
                payer_name=payer_name,
                note=note,
                actor_id=user.id,
            ),
        )
