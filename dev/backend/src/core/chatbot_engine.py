import json
import time
import httpx
from typing import List, Dict, Any, Tuple
import gspread
from google.oauth2.service_account import Credentials

# In-memory cache for Knowledge Base
KB_CACHE = {
    "text": "",
    "timestamp": 0
}
CACHE_TTL = 300  # 5 minutes

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
    api_key: str
) -> Tuple[str, bool, str]:
    """
    history: [{"role": "user", "content": "..."}, ...]
    Returns (reply_text, is_safe, reason)
    """
    
    if not api_key:
        return "Hệ thống AI chưa được cấp API Key trong Cấu Hình.", False, "Missing API Key"
        
    kb_text = get_knowledge_base(sheet_id, service_account_json)
    
    system_prompt = f"""Bạn là trợ lý AI (Nhân viên CSKH nội bộ) của hệ thống ERP Bách Khoa.
Bạn làm việc dựa trên Cơ Sở Tri Thức (KNOWLEDGE BASE) dưới đây.

CƠ SỞ TRI THỨC:
{kb_text}

NHIỆM VỤ CỦA BẠN:
1. Đọc kỹ CƠ SỞ TRI THỨC và Lịch sử trò chuyện để trả lời nhân viên/khách hàng.
2. Trả lời cực kỳ ngắn gọn, tự nhiên, đi thẳng vào vấn đề.
3. NẾU người dùng hỏi những vấn đề không có trong Cơ sở tri thức, hỏi những câu hỏi quá khó/chuyên sâu, hoặc bạn cảm thấy không chắc chắn, bạn KHÔNG ĐƯỢC tự bịa câu trả lời. Hãy trả về ĐÚNG chuỗi ký tự sau: "[UNSAFE_TRANSFER]" để nhường quản trị viên xử lý.
4. NẾU người dùng dùng từ ngữ thô tục, xúc phạm hoặc yêu cầu "gặp nhân viên thật", BẮT BUỘC trả về "[UNSAFE_TRANSFER]".
5. Chỉ trả về CÂU TRẢ LỜI CỦA BẠN (không kèm theo giải thích thừa)."""
    
    messages = [{"role": "system", "content": system_prompt}] + history
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if provider.lower() == "gemini":
                url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "gemini-1.5-flash",
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": 300
                }
                
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code == 401:
                    return "API Key Gemini không hợp lệ.", False, "Invalid API Key"
                elif resp.status_code != 200:
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
                    "model": "deepseek-chat",
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": 300
                }
                
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code == 401:
                    return "API Key AI không hợp lệ.", False, "Invalid API Key"
                elif resp.status_code != 200:
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
