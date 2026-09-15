import hashlib
import hmac
import json
import time

from fastapi import APIRouter, Request, HTTPException, Depends, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Dict, Any
from src.config.settings import settings
from src.services import zalo_service
from src.services import telegram_service
from src.db.database import get_db
from sqlalchemy import text
from src.db.models import Contract, Receivable, Customer
from src.core import hr_engine
from src.core.redis_utils import get_cached_json, set_cached_json

router = APIRouter(prefix="/webhook", tags=["11. System & Webhooks"])


def _verify_webhook_signature(
    body: bytes,
    signature: str | None,
    timestamp: str | None = None,
    nonce: str | None = None,
) -> None:
    """Accept only callbacks signed by the trusted integration gateway with freshness check."""
    secret = settings.WEBHOOK_SHARED_SECRET
    if len(secret) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook chưa được cấu hình khóa xác thực.",
        )
    supplied = (signature or "").strip()
    if supplied.startswith("sha256="):
        supplied = supplied[7:]
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Webhook signature không hợp lệ.")

    if not timestamp:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Thiếu webhook timestamp.",
        )
    try:
        ts = float(timestamp)
        if abs(time.time() - ts) > 300:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Webhook timestamp đã hết hạn hoặc không hợp lệ.",
            )
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Webhook timestamp không hợp lệ.",
        )

    if nonce:
        cache_key = f"bachkhoa:webhook:nonce:{nonce}"
        if get_cached_json(cache_key):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Webhook event đã được xử lý (trùng nonce).",
            )
        set_cached_json(cache_key, True, ttl_seconds=600)
    return True

class ZaloWebhookPayload(BaseModel):
    event_name: str
    sender: Dict[str, str]
    message: Dict[str, Any]

@router.post("/zalo")
async def receive_zalo_webhook(request: Request):
    body = await request.body()
    _verify_webhook_signature(
        body,
        request.headers.get("X-Webhook-Signature"),
        timestamp=request.headers.get("X-Webhook-Timestamp"),
        nonce=request.headers.get("X-Webhook-Nonce") or request.headers.get("X-Webhook-ID"),
    )
    try:
        payload = json.loads(body)
        event = payload.get("event_name")
        if event == "user_send_text":
            user_id = payload.get("sender", {}).get("id")
            text = payload.get("message", {}).get("text", "")
            
            if "báo giá" in text.lower() or "đo đạc" in text.lower():
                zalo_service.send_zalo_message(user_id, "Cảm ơn bạn đã quan tâm. Chuyên viên của Bách Khoa sẽ liên hệ tư vấn báo giá ngay lập tức.")
                telegram_service.send_telegram_message(f"🚨 Khách hàng {user_id} nhắn tin qua Zalo yêu cầu báo giá: '{text}'")
            else:
                zalo_service.send_zalo_message(user_id, "Bách Khoa đã nhận được tin nhắn của bạn. Chúng tôi sẽ phản hồi sớm nhất.")
                
        return {"error": 0, "message": "Success"}
    except Exception as e:
        return {"error": -1, "message": "Failed"}

@router.post("/hanet")
async def receive_hanet_webhook(request: Request):
    body = await request.body()
    _verify_webhook_signature(
        body,
        request.headers.get("X-Webhook-Signature"),
        timestamp=request.headers.get("X-Webhook-Timestamp"),
        nonce=request.headers.get("X-Webhook-Nonce") or request.headers.get("X-Webhook-ID"),
    )
    try:
        payload = json.loads(body)
        employee_id = payload.get("personID")
        timestamp = payload.get("time")
        
        if employee_id and timestamp:
            result = hr_engine.process_hanet_checkin(employee_id, timestamp)
            if result["status"] == "Đi trễ":
                telegram_service.send_telegram_message(f"⏰ Nhân sự {employee_id} đi trễ lúc {result['checkin_time']}")
                
        return {"status": "success"}
    except Exception:
        return {"status": "error"}

from src.core.auth import require_permission, User

@router.post("/trigger-debt-reminders")
def trigger_debt_reminders(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "update"))
):
    try:
        reminded_count = 0
        receivables = db.query(Receivable).filter(Receivable.remaining_amount > 0).all()
        
        for rec in receivables:
            contract = db.query(Contract).filter(Contract.id == rec.contract_id).first()
            if contract:
                customer = db.query(Customer).filter(Customer.id == contract.customer_id).first()
                if customer:
                    zalo_service.remind_debt(customer.full_name, customer.phone or "09xxxxxxxx", contract.id, rec.remaining_amount)
                    reminded_count += 1
                    
        return {"status": "success", "reminders_sent": reminded_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/trigger-daily-care-cron")
def trigger_daily_care_cron(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("crm", "read"))
):
    try:
        completed_count = db.execute(text(
            "select count(*) from public.workflow_instances where status = 'completed'"
        )).scalar_one()
        return {"status": "success", "message": f"Đã quét {completed_count} hạng mục hoàn thành để CSKH định kỳ."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
