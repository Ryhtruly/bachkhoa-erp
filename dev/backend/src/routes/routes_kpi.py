from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from core import kpi_engine
from src.db.database import get_db
from src.core.auth import get_current_user, User
from src.dossiers.actor_guard import is_director

router = APIRouter(prefix="/api/kpi", tags=["07. Payroll & Piece Rates"])


def require_kpi_viewer(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    """KPI là dữ liệu đánh giá nhân sự, chỉ Giám đốc được xem."""
    if not is_director(db, user.id):
        raise HTTPException(status_code=403, detail="Chỉ Giám đốc được xem KPI nhân sự")
    return user

@router.get("/scores")
def get_kpi_scores(
    month: str = "2026-03",
    db: Session = Depends(get_db),
    user: User = Depends(require_kpi_viewer)
):
    try:
        scores = kpi_engine.calculate_employee_kpi(db, month)
        return {"status": "success", "data": scores}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

