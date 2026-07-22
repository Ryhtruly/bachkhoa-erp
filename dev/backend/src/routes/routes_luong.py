import json
import logging
import os
from datetime import datetime, date
import uuid
from typing import Optional

import redis
from redis.exceptions import RedisError
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from src.db.database import get_db
from src.db.models import TaskType, TaskTypeRate, Employee, ProjectTask

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/luong", tags=["Lương Khoán & Bảng Giá"])

# ─── REDIS CACHE ──────────────────────────────────────────────────────────────
RATES_CACHE_KEY = "bachkhoa:read:rates:v1"
RATES_CACHE_TTL = int(os.getenv("RATES_CACHE_TTL_SECONDS", "1800"))
_redis_client = None

def _get_redis_client():
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis.from_url(
            os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0"),
            decode_responses=True,
            socket_connect_timeout=0.5,
            socket_timeout=1.0,
            health_check_interval=30,
        )
    return _redis_client

def _build_rates_model(db: Session):
    """Build rates read model from DB."""
    task_types = db.query(TaskType).order_by(TaskType.name).all()
    result = []
    for tt in task_types:
        main_rate = db.query(TaskTypeRate).filter(
            TaskTypeRate.task_type_id == tt.id,
            TaskTypeRate.role == "main",
            TaskTypeRate.effective_to.is_(None),
        ).first()
        support_rate = db.query(TaskTypeRate).filter(
            TaskTypeRate.task_type_id == tt.id,
            TaskTypeRate.role == "support",
            TaskTypeRate.effective_to.is_(None),
        ).first()
        result.append({
            "task_type_id": tt.id,
            "task_type_name": tt.name,
            "main_rate": float(main_rate.rate) if main_rate else 0,
            "support_rate": float(support_rate.rate) if support_rate else 0,
            "main_rate_id": main_rate.id if main_rate else None,
            "support_rate_id": support_rate.id if support_rate else None,
        })
    return result

def _write_rates_cache(rows):
    payload = json.dumps({
        "loaded_at": datetime.now().isoformat(),
        "rows": rows,
    }, ensure_ascii=False, separators=(",", ":"))
    _get_redis_client().setex(RATES_CACHE_KEY, RATES_CACHE_TTL, payload)

def refresh_rates_cache(db: Session):
    """Rebuild rates cache from DB."""
    rows = _build_rates_model(db)
    try:
        _write_rates_cache(rows)
        logger.info("Rates cache refreshed: %s rows", len(rows))
    except RedisError as exc:
        logger.warning("Cannot write rates cache: %s", exc)
    return rows

def get_rates_from_cache(db: Session):
    """Read from Redis, fallback to DB on miss."""
    try:
        raw = _get_redis_client().get(RATES_CACHE_KEY)
        if raw:
            payload = json.loads(raw)
            rows = payload.get("rows")
            if isinstance(rows, list):
                return rows, "redis"
    except (RedisError, json.JSONDecodeError, TypeError) as exc:
        logger.warning("Cannot read rates cache: %s", exc)
    rows = refresh_rates_cache(db)
    return rows, "supabase"

def invalidate_rates_cache():
    try:
        _get_redis_client().delete(RATES_CACHE_KEY)
    except RedisError as exc:
        logger.warning("Cannot invalidate rates cache: %s", exc)

# ─── SCHEMAS ──────────────────────────────────────────────────────────────────

class TaskTypeSchema(BaseModel):
    name: str

class TaskTypeRateSchema(BaseModel):
    task_type_id: str
    role: str  # "main" or "support"
    rate: float
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None

# ─── QUẢN LÝ BẢNG GIÁ KHOÁN ───────────────────────────────────────────────────

@router.get("/rates")
def get_salary_rates(db: Session = Depends(get_db)):
    """Lấy bảng đơn giá khoán - cached Redis, fallback Supabase."""
    rows, source = get_rates_from_cache(db)
    return {"status": "success", "data": rows, "source": source}

@router.post("/rates")
def save_salary_rate(payload: TaskTypeRateSchema, db: Session = Depends(get_db)):
    """Thêm mới hoặc cập nhật đơn giá khoán."""
    try:
        # Kiểm tra task_type tồn tại
        task_type = db.query(TaskType).filter(TaskType.id == payload.task_type_id).first()
        if not task_type:
            raise HTTPException(status_code=404, detail="Không tìm thấy loại hồ sơ")
        
        # Tìm rate hiện tại (chưa hết hiệu lực)
        existing_rate = db.query(TaskTypeRate).filter(
            TaskTypeRate.task_type_id == payload.task_type_id,
            TaskTypeRate.role == payload.role,
            TaskTypeRate.effective_to.is_(None)
        ).first()
        
        if existing_rate:
            # Cập nhật rate hiện tại
            existing_rate.rate = payload.rate
            if payload.effective_to:
                existing_rate.effective_to = datetime.strptime(payload.effective_to, "%Y-%m-%d").date()
        else:
            # Tạo rate mới
            effective_from = datetime.strptime(payload.effective_from, "%Y-%m-%d").date() if payload.effective_from else date.today()
            new_rate = TaskTypeRate(
                id=f"ttr_{uuid.uuid4().hex[:10]}",
                task_type_id=payload.task_type_id,
                role=payload.role,
                rate=payload.rate,
                effective_from=effective_from,
                effective_to=datetime.strptime(payload.effective_to, "%Y-%m-%d").date() if payload.effective_to else None
            )
            db.add(new_rate)
        
        db.commit()
        invalidate_rates_cache()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/rates/{rate_id}")
def delete_salary_rate(rate_id: str, db: Session = Depends(get_db)):
    """Xóa một dòng đơn giá."""
    try:
        rate = db.query(TaskTypeRate).filter(TaskTypeRate.id == rate_id).first()
        if not rate:
            raise HTTPException(status_code=404, detail="Không tìm thấy dòng giá")
        
        db.delete(rate)
        db.commit()
        invalidate_rates_cache()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/task-types")
def create_task_type(payload: TaskTypeSchema, db: Session = Depends(get_db)):
    """Thêm loại hồ sơ mới."""
    try:
        # Kiểm tra trùng tên
        existing = db.query(TaskType).filter(TaskType.name == payload.name).first()
        if existing:
            raise HTTPException(status_code=400, detail="Loại hồ sơ đã tồn tại")
        
        new_type = TaskType(
            id=f"tt_{uuid.uuid4().hex[:10]}",
            name=payload.name
        )
        db.add(new_type)
        db.commit()
        invalidate_rates_cache()
        return {"status": "success", "id": new_type.id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/task-types/{task_type_id}")
def delete_task_type(task_type_id: str, db: Session = Depends(get_db)):
    """Xóa loại hồ sơ (chỉ khi không có rates hoặc tasks liên kết)."""
    try:
        task_type = db.query(TaskType).filter(TaskType.id == task_type_id).first()
        if not task_type:
            raise HTTPException(status_code=404, detail="Không tìm thấy loại hồ sơ")
        
        # Kiểm tra có rates không
        has_rates = db.query(TaskTypeRate).filter(TaskTypeRate.task_type_id == task_type_id).count()
        if has_rates > 0:
            raise HTTPException(status_code=400, detail="Không thể xóa loại hồ sơ có đơn giá")
        
        db.delete(task_type)
        db.commit()
        invalidate_rates_cache()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ─── QUẢN LÝ CHI TIẾT LƯƠNG KHOÁN (TỪNG HỒ SƠ) ────────────────────────────────

@router.get("/items")
def get_salary_items(month: str, employee_id: str = None, db: Session = Depends(get_db)):
    """Xem danh sách các mục khoán trong tháng (sử dụng task_pay_records)."""
    try:
        from src.db.models import TaskPayRecord
        
        q = db.query(TaskPayRecord).filter(
            func.extract('month', TaskPayRecord.payroll_month) == int(month.split('-')[1]),
            func.extract('year', TaskPayRecord.payroll_month) == int(month.split('-')[0])
        )
        if employee_id:
            q = q.filter(TaskPayRecord.employee_id == employee_id)
            
        items = q.order_by(TaskPayRecord.payroll_month.desc()).all()
        result = []
        for item in items:
            emp = db.query(Employee).filter(Employee.id == item.employee_id).first()
            task = db.query(ProjectTask).filter(ProjectTask.id == item.task_id).first() if item.task_id else None
            
            result.append({
                "id": item.id,
                "nhan_vien": emp.full_name if emp else item.employee_id,
                "ma_ho_so": item.task_id or "",
                "ten_ho_so": task.task_name if task else "",
                "loai_ho_so": "",
                "vai_tro": item.role or "",
                "don_gia": float(item.base_rate) if item.base_rate else 0,
                "he_so": 1,
                "thanh_tien": float(item.base_rate) if item.base_rate else 0,
                "ghi_chu": item.note or ""
            })
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
