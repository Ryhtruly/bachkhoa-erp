from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from src.db.database import get_db
from src.db.models import SystemSetting
from pydantic import BaseModel
from typing import List, Dict, Any
import httpx

router = APIRouter(prefix="/api/settings", tags=["Cài đặt Hệ thống"])

class SettingItem(BaseModel):
    key: str
    value: str
    description: str = ""

class TestRequest(BaseModel):
    service: str
    settings: Dict[str, Any]

@router.get("")
def get_all_settings(db: Session = Depends(get_db)):
    try:
        settings = db.query(SystemSetting).all()
        result = {}
        for s in settings:
            result[s.key] = s.value
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("")
def update_settings(payload: List[SettingItem], db: Session = Depends(get_db)):
    try:
        for item in payload:
            setting = db.query(SystemSetting).filter(SystemSetting.key == item.key).first()
            if setting:
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
        
        db.commit()
        return {"status": "success", "message": "Đã cập nhật cài đặt."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/test")
async def test_connection(payload: TestRequest):
    """Test real API connection for a given service."""
    service = payload.service
    s = payload.settings
    
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            
            if service == "telegram":
                token = s.get("telegram_bot_token", "")
                if not token:
                    return {"ok": False, "message": "Chưa nhập Telegram Bot Token"}
                r = await client.get(f"https://api.telegram.org/bot{token}/getMe")
                data = r.json()
                if data.get("ok"):
                    return {"ok": True, "message": f"Bot: @{data['result']['username']}"}
                return {"ok": False, "message": data.get("description", "Token không hợp lệ")}

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
                    f"https://generativelanguage.googleapis.com/v1/models?key={key}"
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
        return {"ok": False, "message": str(e)}

