from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from sqlalchemy.orm import Session
from typing import List, Dict
from pydantic import BaseModel
from src.db.database import get_db
from src.db.models import SystemSetting
from src.core import ai_vision_engine
from src.core.chatbot_engine import ask_chatbot

router = APIRouter(prefix="/api/ai", tags=["AI Quy Hoạch"])

@router.post("/analyze-planning")
async def analyze_planning(file: UploadFile = File(...)):
    """
    Upload a planning document (PDF/Image) for AI analysis (VN2000 extraction).
    """
    try:
        # In reality, save the file to a temp folder and pass to AI
        result = ai_vision_engine.analyze_planning_document(file.filename)
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ChatRequest(BaseModel):
    history: List[Dict[str, str]]

@router.post("/chat")
async def chat_with_bot(req: ChatRequest, db: Session = Depends(get_db)):
    try:
        # Get settings from DB
        settings = db.query(SystemSetting).all()
        config = {s.key: s.value for s in settings}
        
        sheet_id = config.get("chatbot_kb_sheet_id", "")
        service_account_json = config.get("google_sheets_service_account", "")
        provider = config.get("chatbot_llm_provider", "deepseek")
        
        if provider == "gemini":
            api_key = config.get("chatbot_llm_api_key", "")
            if not api_key:
                # Fallback to main gemini key if chatbot key is empty
                api_key = config.get("gemini_api_key", "")
        else:
            api_key = config.get("chatbot_llm_api_key", "")
            
        reply_text, is_safe, reason = await ask_chatbot(
            history=req.history,
            sheet_id=sheet_id,
            service_account_json=service_account_json,
            provider=provider,
            api_key=api_key
        )
        
        if reply_text == "[UNSAFE_TRANSFER]":
            reply_text = "Vấn đề này vượt quá khả năng xử lý của tôi, vui lòng liên hệ nhân viên quản lý để được hỗ trợ chi tiết hơn."
            
        return {"status": "success", "reply": reply_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

