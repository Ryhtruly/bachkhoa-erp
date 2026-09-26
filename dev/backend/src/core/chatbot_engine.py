import json
import re
import time
import httpx
from typing import List, Dict, Any, Tuple, Optional
import gspread
from google.oauth2.service_account import Credentials

# In-memory cache for Knowledge Base
KB_CACHE = {
    "text": "",
    "timestamp": 0
}
CACHE_TTL = 300  # 5 minutes
MAX_KB_CHARS = 8000

from src.core.dlp import redact_sensitive_content

# Google ngừng model cũ theo đợt (gemini-2.0-flash tắt 01/06/2026, gemini-2.5-flash
# khoá với tài khoản mới). Model đổi được trong Cấu hình (chatbot_llm_model) mà
# không cần deploy lại; khi Google báo model bị ngừng và gợi ý model thay thế,
# ask_chatbot tự thử lại một lần bằng model đó.
DEFAULT_CHAT_MODELS = {"gemini": "gemini-3.8-flash", "deepseek": "deepseek-chat"}
_SUGGESTED_MODEL_RE = re.compile(r"use models/([A-Za-z0-9._-]+)")


def suggested_replacement_model(error_text: str) -> Optional[str]:
    """Model Google gợi ý trong lỗi 404 "no longer available … use models/X"."""
    match = _SUGGESTED_MODEL_RE.search(error_text or "")
    return match.group(1).rstrip(".") if match else None
SUPPORTED_PROVIDERS = tuple(DEFAULT_CHAT_MODELS)
MAX_REPLY_TOKENS = 2048


def resolve_chatbot_llm(config: Dict[str, Any], env_gemini_key: str = "") -> Tuple[str, str, str]:
    """Chọn (provider, api_key, model) từ system_settings.

    - Provider được chuẩn hoá (strip + lower), nên "Gemini " vẫn là gemini.
    - Chưa chọn provider: key riêng dạng "AIza…" là Gemini, key riêng khác là
      DeepSeek; không có key riêng thì dùng Gemini nếu đã có Gemini API Key
      (đúng như gợi ý "để trống sẽ dùng chung API Key Gemini" ở màn Cấu hình).
    - Key chatbot để trống + provider gemini → dùng chung Gemini API Key.
    """
    provider = str(config.get("chatbot_llm_provider") or "").strip().lower()
    chatbot_key = str(config.get("chatbot_llm_api_key") or "").strip()
    gemini_key = str(config.get("gemini_api_key") or "").strip() or (env_gemini_key or "").strip()

    if provider not in SUPPORTED_PROVIDERS:
        if chatbot_key:
            provider = "gemini" if chatbot_key.startswith("AIza") else "deepseek"
        else:
            provider = "gemini" if gemini_key else "deepseek"

    api_key = chatbot_key or (gemini_key if provider == "gemini" else "")
    model = str(config.get("chatbot_llm_model") or "").strip() or DEFAULT_CHAT_MODELS[provider]
    return provider, api_key, model

_redact_sensitive_content = redact_sensitive_content

def get_knowledge_base(sheet_id: str, service_account_json: str) -> str:
    """Reads Knowledge Base from Google Sheets and caches it."""
    global KB_CACHE
    
    if not sheet_id or not service_account_json:
        return "(Chưa cấu hình Google Sheets ID hoặc Service Account JSON. Vui lòng cấu hình trong Settings.)"
        
    now = time.time()
    if KB_CACHE["text"] and (now - KB_CACHE["timestamp"]) < CACHE_TTL:
        return KB_CACHE["text"]
        
    try:
        creds_dict = json.loads(service_account_json)
        scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
        creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
        client = gspread.authorize(creds)
        
        sheet = client.open_by_key(sheet_id).sheet1
        rows = sheet.get_all_values()
        
        kb_lines = []
        for row in rows:
            kb_lines.append(" | ".join([str(cell).strip() for cell in row if str(cell).strip()]))
            
        kb_text = "\n".join(kb_lines)
        kb_text = _redact_sensitive_content(kb_text)
        if len(kb_text) > MAX_KB_CHARS:
            kb_text = kb_text[:MAX_KB_CHARS] + "\n...[Dữ liệu tri thức đã được rút gọn để đảm bảo an toàn & chi phí]..."

        KB_CACHE["text"] = kb_text
        KB_CACHE["timestamp"] = now
        return kb_text
    except Exception as e:
        print(f"[Chatbot] Error reading KB from Sheets: {e}")
        if KB_CACHE["text"]:
            return KB_CACHE["text"]  # Fallback to old cache
        return f"(Lỗi khi đọc file Google Sheet: {e})"

async def ask_chatbot(
    history: List[Dict[str, str]], 
    sheet_id: str, 
    service_account_json: str, 
    provider: str, 
    api_key: str,
    wiki_context: Optional[List[Dict]] = None,
    model: Optional[str] = None,
) -> Tuple[str, bool, str]:
    """
    history: [{"role": "user", "content": "..."}, ...]
    wiki_context: list of {content, similarity, doc_title, category} from wiki RAG search
    Returns (reply_text, is_safe, reason)
    """
    
    if not api_key:
        return "Hệ thống AI chưa được cấp API Key trong Cấu Hình.", False, "Missing API Key"
        
    kb_text = get_knowledge_base(sheet_id, service_account_json)

    # Build knowledge section: wiki chunks takes priority, then Google Sheets KB
    knowledge_parts = []
    if wiki_context:
        wiki_section = "\n\n".join(
            f"[{c.get('category', 'Wiki')}] {c.get('doc_title', 'Tài liệu')}:\n{redact_sensitive_content(c.get('content', ''))}"
            for c in wiki_context
        )
        knowledge_parts.append(f"TÀI LIỆU NỘI BỘ (Wiki):\n{wiki_section}")
    if kb_text.strip() and not kb_text.startswith("(Chưa cấu hình") and not kb_text.startswith("(Lỗi"):
        knowledge_parts.append(f"GOOGLE SHEETS KB:\n{kb_text}")

    full_knowledge = "\n\n---\n\n".join(knowledge_parts) if knowledge_parts else "(Chưa có cơ sở tri thức nào được cấu hình.)"
    
    system_prompt = f"""Bạn là trợ lý AI (Nhân viên CSKH nội bộ) của hệ thống ERP Bách Khoa.
Bạn làm việc dựa trên Cơ Sở Tri Thức (KNOWLEDGE BASE) dưới đây.

CƠ SỞ TRI THỨC:
{full_knowledge}

NHIỆM VỤ CỦA BẠN:
1. Đọc kỹ CƠ SỞ TRI THỨC và Lịch sử trò chuyện để trả lời nhân viên/khách hàng.
2. Trả lời cực kỳ ngắn gọn, tự nhiên, đi thẳng vào vấn đề.
3. NẾU người dùng hỏi những vấn đề không có trong Cơ sở tri thức, hỏi những câu hỏi quá khó/chuyên sâu, hoặc bạn cảm thấy không chắc chắn, bạn KHÔNG ĐƯỢC tự bịa câu trả lời. Hãy trả về ĐÚNG chuỗi ký tự sau: "[UNSAFE_TRANSFER]" để nhường quản trị viên xử lý.
4. NẾU người dùng dùng từ ngữ thô tục, xúc phạm hoặc yêu cầu "gặp nhân viên thật", BẮT BUỘC trả về "[UNSAFE_TRANSFER]".
5. Chỉ trả về CÂU TRẢ LỜI CỦA BẠN (không kèm theo giải thích thừa)."""
    
    safe_history = [
        {
            "role": m.get("role", "user"),
            "content": redact_sensitive_content(m.get("content", ""))
        }
        for m in history
    ]
    messages = [{"role": "system", "content": system_prompt}] + safe_history
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if provider.lower() == "gemini":
                url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
                chat_model = model or DEFAULT_CHAT_MODELS["gemini"]

                def gemini_payload(model_name: str) -> dict:
                    payload = {
                        "model": model_name,
                        "messages": messages,
                        "temperature": 0.7,
                        "max_tokens": MAX_REPLY_TOKENS,
                    }
                    # Gemini 2.5+ là model "thinking": token suy nghĩ tính vào max_tokens,
                    # để mặc định thì câu trả lời có thể bị cắt rỗng → bot luôn "chuyển giao".
                    if model_name.startswith("gemini-") and not model_name.startswith(("gemini-1", "gemini-2.0")):
                        payload["reasoning_effort"] = "low"
                    return payload

                resp = await client.post(url, headers=headers, json=gemini_payload(chat_model))
                if resp.status_code == 404:
                    replacement = suggested_replacement_model(resp.text)
                    if replacement and replacement != chat_model:
                        print(f"[Chatbot] Model {chat_model} bị ngừng, thử lại bằng {replacement}")
                        chat_model = replacement
                        resp = await client.post(url, headers=headers, json=gemini_payload(chat_model))
                if resp.status_code == 401:
                    return "API Key Gemini không hợp lệ.", False, "Invalid API Key"
                elif resp.status_code == 404:
                    print(f"[Chatbot] {provider} HTTP 404: {resp.text[:500]}")
                    return (
                        f'Model "{chat_model}" không còn dùng được. Vào Cấu Hình → "Model Chatbot", '
                        'bấm "Tải danh sách model" để chọn model khác rồi lưu lại.'
                    ), False, "Model Not Found"
                elif resp.status_code != 200:
                    print(f"[Chatbot] {provider} HTTP {resp.status_code}: {resp.text[:500]}")
                    return f"Lỗi từ máy chủ AI: {resp.text}", False, "AI Error"
                    
                data = resp.json()
                reply_text = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                
            else:
                # DeepSeek or standard OpenAI compatible
                url = "https://api.deepseek.com/chat/completions"
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": model or DEFAULT_CHAT_MODELS["deepseek"],
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": MAX_REPLY_TOKENS,
                }
                
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code == 401:
                    return "API Key AI không hợp lệ.", False, "Invalid API Key"
                elif resp.status_code != 200:
                    print(f"[Chatbot] {provider} HTTP {resp.status_code}: {resp.text[:500]}")
                    return f"Lỗi từ máy chủ AI: {resp.text}", False, "AI Error"
                    
                data = resp.json()
                reply_text = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()

        if not reply_text or "[UNSAFE_TRANSFER]" in reply_text:
            return "[UNSAFE_TRANSFER]", False, "Nhận diện câu hỏi phức tạp hoặc lệnh chuyển giao."
            
        return reply_text, True, "OK"
        
    except httpx.TimeoutException:
        return "Quá thời gian kết nối (Timeout) tới AI, vui lòng thử lại.", False, "Timeout"
    except Exception as e:
        return f"Lỗi nội bộ: {str(e)}", False, "Exception"
