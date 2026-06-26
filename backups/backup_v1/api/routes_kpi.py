from fastapi import APIRouter, HTTPException
from src.core import kpi_engine

router = APIRouter(prefix="/api/kpi", tags=["Nhân Sự & KPI"])

@router.get("/scores")
def get_kpi_scores(month: str = "2026-03"):
    try:
        scores = kpi_engine.calculate_employee_kpi(month)
        return {"status": "success", "data": scores}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
