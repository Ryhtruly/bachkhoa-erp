from sqlalchemy.orm import Session
from src.db.models import Contract, Customer
import logging

logger = logging.getLogger(__name__)

CONTRACT_CACHE_REFRESH_SECONDS = 0

def warm_contract_read_model():
    pass

def get_contract_cache_status():
    return {"source": "db", "cached": False, "message": "Redis cache chưa được kích hoạt"}

def get_contract_read_model(db: Session):
    rows = db.query(Contract, Customer.full_name, Customer.phone).outerjoin(
        Customer, Contract.customer_id == Customer.id
    ).order_by(Contract.created_at.desc()).all()
    
    result = []
    for contract, cust_name, cust_phone in rows:
        result.append({
            "id": contract.id,
            "customer_name": cust_name or "",
            "phone": cust_phone or "",
            "service_type": contract.service_type or "",
            "total_value": float(contract.total_value or 0),
            "date_signed": str(contract.date_signed) if contract.date_signed else "",
            "file_link": contract.file_link or "",
            "status": "Đang thực hiện",
        })
    return result, "db"

def query_contract_read_model(rows, month=None, date_signed=None, search=None, status=None, service=None, sort="desc", page=1, page_size=0):
    filtered = rows
    if search:
        s = search.lower()
        filtered = [r for r in filtered if s in r.get("customer_name", "").lower() or s in r.get("id", "").lower()]
    if service:
        filtered = [r for r in filtered if service.lower() in r.get("service_type", "").lower()]
    if status:
        filtered = [r for r in filtered if r.get("status", "") == status]
    if sort == "asc":
        filtered = list(reversed(filtered))
    if page_size > 0:
        total = len(filtered)
        start = (page - 1) * page_size
        return {"data": filtered[start:start + page_size], "total": total, "page": page, "page_size": page_size}
    return {"data": filtered, "total": len(filtered), "page": 1, "page_size": 0}

def sync_contract_read_model_after_write(db: Session):
    pass

def get_contract_hierarchy(db: Session):
    return []
