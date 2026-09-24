import asyncio
import os
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Request, status
from sqlalchemy.orm import Session
from typing import List, Dict, Literal
from pydantic import BaseModel, Field
from src.db.database import get_db
from src.db.models import SystemSetting
from src.core import ai_vision_engine
from src.core.chatbot_engine import ask_chatbot, resolve_chatbot_llm
from src.services.wiki_rag_service import search_chunks as wiki_search
from src.core.auth import require_authenticated_user, check_user_permission, User
from src.core.redis_utils import consume_rate_limit

router = APIRouter(prefix="/api/ai", tags=["10. AI Assistant"])

MAX_PLANNING_FILE_BYTES = 15 * 1024 * 1024
ALLOWED_PLANNING_EXTS = {".pdf", ".png", ".jpg", ".jpeg"}
ALLOWED_PLANNING_MIMES = {"application/pdf", "image/png", "image/jpeg"}

@router.post("/analyze-planning")
async def analyze_planning(
    file: UploadFile = File(...),
    user: User = Depends(require_authenticated_user)
):
    """
    Upload a planning document (PDF/Image) for AI analysis (VN2000 extraction).
    """
    import os
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_PLANNING_EXTS:
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận tệp quy hoạch định dạng PDF hoặc hình ảnh (PNG, JPG).")
    if file.content_type and file.content_type.lower() not in ALLOWED_PLANNING_MIMES:
        raise HTTPException(status_code=400, detail="MIME type của tệp không hợp lệ.")

    file_bytes = await file.read(MAX_PLANNING_FILE_BYTES + 1)
    if len(file_bytes) > MAX_PLANNING_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Tệp quy hoạch không được vượt quá 15MB.")

    try:
        result = await asyncio.to_thread(ai_vision_engine.analyze_planning_document, file.filename)
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ChatMessage(BaseModel):
    # System instructions are server-owned and must never be supplied by the
    # browser as part of the conversation history.
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    history: List[ChatMessage] = Field(min_length=1, max_length=20)

@router.post("/chat")
async def chat_with_bot(
    req: ChatRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_authenticated_user)
):
    allowed, _ = consume_rate_limit(
        f"bachkhoa:ai:chat:{user.id}",
        limit=30,
        window_seconds=60,
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Bạn đã gửi quá nhiều yêu cầu AI. Vui lòng thử lại sau.",
        )
    history = [message.model_dump() for message in req.history]
    try:
        # Get settings from DB
        settings = db.query(SystemSetting).all()
        config = {s.key: s.value for s in settings}
        
        sheet_id = config.get("chatbot_kb_sheet_id", "")
        service_account_json = config.get("google_sheets_service_account", "")
        env_gemini_key = os.getenv("GEMINI_API_KEY", "")
        if env_gemini_key == "your_gemini_api_key":
            env_gemini_key = ""
        provider, api_key, model = resolve_chatbot_llm(config, env_gemini_key)

        # Search wiki documents relevant to the latest user message
        wiki_context = None
        last_user_msg = next(
            (m["content"] for m in reversed(history) if m["role"] == "user"),
            None
        )
        if last_user_msg and check_user_permission(db, user, "wiki", "read"):
            try:
                wiki_context = await wiki_search(last_user_msg, db)
            except Exception as wiki_err:
                print(f"[wiki_rag] Search error (non-fatal): {wiki_err}")

        reply_text, is_safe, reason = await ask_chatbot(
            history=history,
            sheet_id=sheet_id,
            service_account_json=service_account_json,
            provider=provider,
            api_key=api_key,
            wiki_context=wiki_context,
            model=model,
        )
        
        if reply_text == "[UNSAFE_TRANSFER]":
            reply_text = "Vấn đề này vượt quá khả năng xử lý của tôi, vui lòng liên hệ nhân viên quản lý để được hỗ trợ chi tiết hơn."
            
        return {"status": "success", "reply": reply_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
