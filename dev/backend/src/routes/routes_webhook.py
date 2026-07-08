from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Dict, Any
from src.services import zalo_service
from src.services import telegram_service
from src.db.database import get_db
from src.db.models import Contract, Receivable, ProjectTask, Customer
from src.core import hr_engine

router = APIRouter(prefix="/webhook", tags=["Webhooks & Automations"])

class ZaloWebhookPayload(BaseModel):
    event_name: str
    sender: Dict[str, str]
    message: Dict[str, Any]

@router.post("/zalo")
async def receive_zalo_webhook(request: Request):
    try:
        payload = await request.json()
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
    try:
        payload = await request.json()
        employee_id = payload.get("personID")
        timestamp = payload.get("time")
        
        if employee_id and timestamp:
            result = hr_engine.process_hanet_checkin(employee_id, timestamp)
            if result["status"] == "Đi trễ":
                telegram_service.send_telegram_message(f"⏰ Nhân sự {employee_id} đi trễ lúc {result['checkin_time']}")
                
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

@router.post("/trigger-debt-reminders")
def trigger_debt_reminders(db: Session = Depends(get_db)):
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
def trigger_daily_care_cron(db: Session = Depends(get_db)):
    try:
        completed_tasks = db.query(ProjectTask).filter(ProjectTask.status == "Hoàn thành").all()
        return {"status": "success", "message": f"Đã quét {len(completed_tasks)} hồ sơ hoàn thành để CSKH định kỳ."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
