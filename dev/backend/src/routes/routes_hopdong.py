from fastapi import APIRouter, HTTPException, Depends, Query, Response
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.contracts import (
    ContractService,
    HopdongCreateSchema,
    ContractGenerateSchema,
    get_contract_cache_status,
    get_contract_read_model,
    query_contract_read_model
)

router = APIRouter(prefix="/api/hopdong", tags=["Hợp Đồng"])


@router.get("/cache/status")
def contract_cache_status():
    return get_contract_cache_status()


@router.get("/")
def list_hopdong(
    response: Response,
    month: str = Query(None),
    year: str = Query(None),
    date_signed: str = Query(None),
    search: str = Query(None),
    status: str = Query(None),
    service: str = Query(None),
    sort: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(0, ge=0, le=100),
    db: Session = Depends(get_db),
):
    try:
        rows, source = get_contract_read_model(db)
        response.headers["X-Contract-Read-Source"] = source
        result = query_contract_read_model(
            rows,
            month=month,
            year=year,
            date_signed=date_signed,
            search=search,
            status=status,
            service=service,
            sort=sort,
            page=page,
            page_size=page_size,
        )
        return result if page_size > 0 else result["data"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
def create_hopdong(payload: HopdongCreateSchema, db: Session = Depends(get_db)):
    return ContractService.create_contract(db, payload)


@router.post("/generate")
def generate_and_save_contract(payload: ContractGenerateSchema, db: Session = Depends(get_db)):
    return ContractService.generate_and_save_contract(db, payload)
