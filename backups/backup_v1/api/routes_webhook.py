from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
from src.services import zalo_service
from src.services import telegram_service
from src.services import excel_adapter as excel_db
from src.core import hr_engine

router = APIRouter(prefix="/webhook", tags=["Webhooks & Automations"])

class ZaloWebhookPayload(BaseModel):
    event_name: str
    sender: Dict[str, str]
    message: Dict[str, Any]
    # Simplified Zalo Webhook payload structure

@router.post("/zalo")
async def receive_zalo_webhook(request: Request):
    """
    Webhook endpoint to receive incoming messages from Zalo OA.
    When a customer messages the OA, this endpoint processes it.
    """
    try:
        # In a real app, you would validate the Mac signature from Zalo here
        payload = await request.json()
        
        event = payload.get("event_name")
        if event == "user_send_text":
            user_id = payload.get("sender", {}).get("id")
            text = payload.get("message", {}).get("text", "")
            
            # Simple AI routing logic
            if "báo giá" in text.lower() or "đo đạc" in text.lower():
                zalo_service.send_zalo_message(user_id, "Cảm ơn bạn đã quan tâm. Chuyên viên của Bách Khoa sẽ liên hệ tư vấn báo giá ngay lập tức.")
                # Also notify CEO/Sale via Telegram
                telegram_service.send_telegram_message(f"🚨 Khách hàng {user_id} nhắn tin qua Zalo yêu cầu báo giá: '{text}'")
            else:
                zalo_service.send_zalo_message(user_id, "Bách Khoa đã nhận được tin nhắn của bạn. Chúng tôi sẽ phản hồi sớm nhất.")
                
        return {"error": 0, "message": "Success"}
    except Exception as e:
        print(f"Webhook error: {e}")
        return {"error": -1, "message": "Failed"}

@router.post("/hanet")
async def receive_hanet_webhook(request: Request):
    """
    Receive facial recognition check-in events from Hanet camera.
    """
    try:
        payload = await request.json()
        # Mock Hanet payload format
        employee_id = payload.get("personID")
        timestamp = payload.get("time") # epoch time
        
        if employee_id and timestamp:
            result = hr_engine.process_hanet_checkin(employee_id, timestamp)
            if result["status"] == "Đi trễ":
                telegram_service.send_telegram_message(f"⏰ Nhân sự {employee_id} đi trễ lúc {result['checkin_time']}")
                
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

@router.post("/trigger-debt-reminders")
def trigger_debt_reminders():
    """
    Manually trigger the debt reminder workflow (NV10/NV06).
    In a real system, this would be a Cronjob.
    """
    try:
        hopdong = excel_db.read_sheet("DATABASE_HOP_DONG")
        reminded_count = 0
        
        for hd in hopdong:
            status = str(hd.get("Tình trạng", "")).strip()
            # If contract is pending payment or overdue
            if status in ["Chờ thanh toán", "Quá hạn thanh toán"]:
                debt = float(hd.get("Còn nợ") or 0)
                if debt > 0:
                    contract_id = hd.get("Mã hợp đồng")
                    customer = hd.get("Tên khách hàng")
                    phone = "09xxxxxxxx" # Should be fetched from DATABASE_HOSO
                    
                    # Send reminder
                    zalo_service.remind_debt(customer, phone, contract_id, debt)
                    reminded_count += 1
                    
        return {"status": "success", "reminders_sent": reminded_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/trigger-daily-care-cron")
def trigger_daily_care_cron():
    """
    Cronjob giả lập: Chạy mỗi ngày 1 lần vào buổi sáng.
    Quét hồ sơ để nhắn tin Sinh nhật hoặc Chúc mừng / Nhắc bảo hành.
    """
    try:
        # Mock logic
        messages_sent = 0
        hoso = excel_db.read_sheet("DATABASE_HOSO")
        
        # In a real app, check Date of Birth from DATABASE_KHACH_HANG
        # and Completion Date from DATABASE_HOSO for warranty reminders.
        # For mock:
        print("[Cronjob] Đang quét dữ liệu khách hàng để CSKH tự động...")
        for hs in hoso:
            if hs.get("Trạng thái") == "Hoàn thành":
                # Simulated trigger condition
                # zalo_service.send_zalo_message(phone, "Chúc mừng sinh nhật quý khách!")
                pass
                
        return {"status": "success", "message": "Đã chạy Cronjob CSKH định kỳ thành công."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
