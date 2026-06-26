from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from core import kpi_engine
from src.db.database import get_db

router = APIRouter(prefix="/api/kpi", tags=["Nhân Sự & KPI"])

@router.get("/scores")
def get_kpi_scores(month: str = "2026-03", db: Session = Depends(get_db)):
    try:
        scores = kpi_engine.calculate_employee_kpi(db, month)
        return {"status": "success", "data": scores}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
