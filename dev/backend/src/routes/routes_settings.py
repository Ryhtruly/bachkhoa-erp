from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from src.db.database import get_db
from src.db.models import SystemSetting, AuditLog
from src.core.auth import require_permission, User
from pydantic import BaseModel
from typing import List, Dict, Any
import os
import re
import httpx
from src.core.chatbot_engine import resolve_chatbot_llm

router = APIRouter(prefix="/api/settings", tags=["11. System & Webhooks"])
MASKED_SECRET = "********"
SENSITIVE_SETTING_KEYS = {
    "zalo_oa_token",
    "telegram_bot_token",
    "gemini_api_key",
    "vietqr_api_key",
    "hanet_client_secret",
    "stringee_api_key_secret",
    "google_sheets_service_account",
}


def _is_sensitive_key(key: str) -> bool:
    normalized = key.casefold()
    return key in SENSITIVE_SETTING_KEYS or any(
        marker in normalized
        for marker in ("token", "api_key", "secret", "private_key", "password")
    )

class SettingItem(BaseModel):
    key: str
    value: str
    description: str = ""

class TestRequest(BaseModel):
    service: str
    settings: Dict[str, Any]

@router.get("")
def get_all_settings(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("settings", "read"))
):
    try:
        settings = db.query(SystemSetting).all()
        result = {}
        for s in settings:
            result[s.key] = MASKED_SECRET if _is_sensitive_key(s.key) and s.value else s.value
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("")
def update_settings(
    payload: List[SettingItem],
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("settings", "update"))
):
    try:
        for item in payload:
            setting = db.query(SystemSetting).filter(SystemSetting.key == item.key).first()
            if setting:
                # The frontend receives a mask, never the secret itself. Keep
                # the stored value when the user saves without replacing it.
                if not (
                    _is_sensitive_key(item.key)
                    and item.value.strip() in {"", MASKED_SECRET}
                    and setting.value
                ):
                    setting.value = item.value
                if item.description:
                    setting.description = item.description
            else:
                new_setting = SystemSetting(
                    key=item.key,
                    value=item.value,
                    description=item.description
                )
                db.add(new_setting)

        db.add(AuditLog(
            actor_id=user.id,
            action="UPDATE_SETTINGS",
            object_type="SystemSetting",
            payload_json={"updated_keys": [item.key for item in payload]}
        ))
        db.commit()
        return {"status": "success", "message": "Đã cập nhật cài đặt."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

def _merged_settings(db: Session, form_settings: Dict[str, Any] | None) -> Dict[str, Any]:
    """Giá trị đã lưu, đè bằng giá trị đang gõ trên form (bỏ qua ô bí mật còn che)."""
    s = {row.key: row.value for row in db.query(SystemSetting).all()}
    for key, value in (form_settings or {}).items():
        if not (_is_sensitive_key(key) and str(value or "").strip() in {"", MASKED_SECRET}):
            s[key] = value
    return s


class ModelListRequest(BaseModel):
    settings: Dict[str, Any] = {}


@router.post("/gemini-models")
async def list_gemini_models(
    payload: ModelListRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("settings", "update"))
):
    """Model chat mà API key Gemini hiện tại được dùng, để chọn ở ô "Model Chatbot"."""
    s = _merged_settings(db, payload.settings)
    _, key, _ = resolve_chatbot_llm({**s, "chatbot_llm_provider": "gemini"}, os.getenv("GEMINI_API_KEY", ""))
    if not key or key == "your_gemini_api_key":
        raise HTTPException(status_code=400, detail="Chưa nhập Gemini API Key")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://generativelanguage.googleapis.com/v1beta/models",
                params={"pageSize": 1000},
                headers={"x-goog-api-key": key},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Không gọi được Google ({exc.__class__.__name__})") from exc
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Google trả lỗi HTTP {r.status_code} - kiểm tra lại API Key")

    models = []
    for item in r.json().get("models", []):
        name = str(item.get("name", "")).removeprefix("models/")
        methods = item.get("supportedGenerationMethods") or []
        if name.startswith("gemini-") and "generateContent" in methods and "embedding" not in name:
            models.append({"id": name, "label": item.get("displayName") or name})
    # Bản mới nhất lên đầu; "flash" (nhanh, rẻ) đứng trước "pro" cùng đời.
    models.sort(key=lambda m: ("flash" not in m["id"], m["id"]))
    def version(model_id: str) -> tuple:
        match = re.match(r"gemini-(\d+)(?:\.(\d+))?", model_id)
        return (int(match.group(1)), int(match.group(2) or 0)) if match else (0, 0)

    models.sort(key=lambda m: version(m["id"]), reverse=True)
    return {"models": models}


@router.post("/test")
async def test_connection(
    payload: TestRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("settings", "update"))
):
    """Test real API connection for a given service."""
    service = payload.service
    s = _merged_settings(db, payload.settings)

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            if service == "telegram":
                token = s.get("telegram_bot_token", "")
                if not token:
                    return {"ok": False, "message": "Chưa nhập Telegram Bot Token"}
                try:
                    r = await client.get(f"https://api.telegram.org/bot{token}/getMe")
                    data = r.json()
                    if data.get("ok"):
                        return {"ok": True, "message": f"Bot: @{data['result']['username']}"}
                    return {"ok": False, "message": data.get("description", "Token không hợp lệ")}
                except Exception as ex:
                    err_msg = str(ex).replace(token, "[REDACTED]")
                    return {"ok": False, "message": f"Lỗi kết nối Telegram: {err_msg}"}

            elif service == "zalo":
                token = s.get("zalo_oa_token", "")
                if not token:
                    return {"ok": False, "message": "Chưa nhập Zalo OA Access Token"}
                r = await client.get(
                    "https://openapi.zalo.me/v2.0/oa/getoa",
                    headers={"access_token": token}
                )
                data = r.json()
                if data.get("error") == 0:
                    return {"ok": True, "message": f"OA: {data.get('data', {}).get('name', 'OK')}"}
                return {"ok": False, "message": data.get("message", "Token không hợp lệ")}

            elif service == "gemini":
                key = s.get("gemini_api_key", "")
                if not key:
                    return {"ok": False, "message": "Chưa nhập Gemini API Key"}
                r = await client.get(
                    "https://generativelanguage.googleapis.com/v1/models",
                    headers={"x-goog-api-key": key}
                )
                if r.status_code == 200:
                    return {"ok": True, "message": "Gemini API Key hợp lệ"}
                return {"ok": False, "message": f"HTTP {r.status_code} - Key không hợp lệ"}

            elif service == "vietqr":
                key = s.get("vietqr_api_key", "")
                # Test tra cứu MST thử với mã số thực của Bách Khoa hoặc 1 công ty lớn
                r = await client.get(
                    "https://api.vietqr.io/v2/business/0101684224",
                    headers={"x-client-id": key} if key else {}
                )
                if r.status_code == 200:
                    data = r.json()
                    return {"ok": True, "message": f"API hoạt động: {data.get('data', {}).get('name', 'OK')}"}
                return {"ok": False, "message": f"HTTP {r.status_code}"}

            elif service == "hanet":
                client_id = s.get("hanet_client_id", "")
                client_secret = s.get("hanet_client_secret", "")
                if not client_id or not client_secret:
                    return {"ok": False, "message": "Chưa nhập Hanet Client ID hoặc Secret"}
                r = await client.post(
                    "https://oauth.hanet.com/token",
                    data={"grant_type": "client_credentials", "client_id": client_id, "client_secret": client_secret}
                )
                data = r.json()
                if data.get("access_token"):
                    return {"ok": True, "message": "Hanet kết nối thành công"}
                return {"ok": False, "message": data.get("error_description", "Sai Client ID hoặc Secret")}

            elif service == "stringee":
                key_sid = s.get("stringee_api_key_sid", "")
                key_secret = s.get("stringee_api_key_secret", "")
                if not key_sid or not key_secret:
                    return {"ok": False, "message": "Chưa nhập Stringee API Key SID và Secret"}
                # Stringee dùng JWT để xác thực — chỉ kiểm tra format
                if key_sid.startswith("SK.") and len(key_secret) > 10:
                    return {"ok": True, "message": "Format Stringee Key hợp lệ — Deploy để test thực tế"}
                return {"ok": False, "message": "Sai format — SID phải bắt đầu bằng 'SK.'"}

            elif service == "google_sheets":
                cred_json = s.get("google_sheets_service_account", "")
                if not cred_json or len(cred_json) < 50:
                    return {"ok": False, "message": "Chưa nhập Service Account JSON"}
                import json as _json
                try:
                    cred = _json.loads(cred_json)
                    if cred.get("type") == "service_account" and cred.get("private_key"):
                        return {"ok": True, "message": f"Service Account: {cred.get('client_email', 'OK')}"}
                    return {"ok": False, "message": "JSON không đúng format Service Account"}
                except:
                    return {"ok": False, "message": "JSON không hợp lệ"}

            else:
                return {"ok": False, "message": f"Không nhận dạng được service: {service}"}

    except httpx.TimeoutException:
        return {"ok": False, "message": "Timeout — kiểm tra kết nối mạng"}
    except Exception as e:
        # Lỗi mạng của httpx (ConnectError…) có thể có str() rỗng: vẫn phải nêu loại lỗi.
        msg = str(e) or f"Lỗi kết nối ({e.__class__.__name__})"
        for val in s.values():
            if val and isinstance(val, str) and len(val) > 5:
                msg = msg.replace(val, "[REDACTED]")
        return {"ok": False, "message": msg}
