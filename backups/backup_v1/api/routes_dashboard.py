from fastapi import APIRouter, HTTPException
from src.services import excel_adapter as excel_db

router = APIRouter(prefix="/api", tags=["Dashboard & Config"])

@router.get("/dashboard")
def get_dashboard():
    try:
        summary = excel_db.get_dashboard_summary()
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/config")
def get_config():
    try:
        rows = excel_db.read_sheet("THIET_LAP")
        
        departments = []
        personnel = []
        services = []
        
        for r in rows:
            dep = r.get("PHÒNG BAN")
            pers = r.get("NHÂN SỰ")
            serv = r.get("DỊCH VỤ")
            
            if dep and dep not in departments:
                departments.append(dep)
            if pers and pers not in personnel:
                personnel.append(pers)
            if serv and serv not in services:
                services.append(serv)
                
        return {
            "departments": departments,
            "personnel": personnel,
            "services": services
        }
    except Exception as e:
        return {
            "departments": ["Phòng Giám đốc", "Phòng Kinh doanh", "Phòng Marketing", "Phòng Đo đạc", "Phòng Pháp lý"],
            "personnel": ["Giám đốc", "Lê Văn Dựng", "Tạ Khắc Tập", "Trương Tấn Quốc", "Nguyễn Minh Thông", "Võ Thành Minh", "Võ Tứ Hợp", "Lê Tấn Đạt"],
            "services": ["Đo hiện trạng", "Cắm mốc", "Hoàn công", "Cấp đổi", "Hợp thửa", "Tách Thửa", "Cấp sổ lần đầu", "Chuyển mục đích", "Xin phép xây dựng"]
        }
