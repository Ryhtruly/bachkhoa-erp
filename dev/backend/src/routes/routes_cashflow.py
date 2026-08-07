from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from src.schemas.models import CashflowTransactionCreateSchema
from src.db.database import get_db
from src.db.models import CashflowTransaction
from src.core.auth import require_permission, User
from datetime import datetime
import uuid

router = APIRouter(prefix="/api/cashflow", tags=["06. Finance & Cashflow"])

@router.get("/transactions", summary="List Cashflow Transactions", description="Retrieve list of cash inflow and outflow transaction vouchers.")
def list_transactions(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    try:
        transactions = db.query(CashflowTransaction).order_by(CashflowTransaction.created_at.desc()).all()
        result = []
        for t in transactions:
            raw_type = t.transaction_type or ""
            raw_amount = float(t.amount or 0)
            
            result.append({
                "id": t.id,
                "transaction_type": raw_type,
                "created_at": t.created_at.strftime("%Y-%m-%d %H:%M:%S") if t.created_at else "",
                "task_id": t.project_id or "",
                "contract_id": t.contract_id or "",
                "description": t.description or "",
                "department": t.department_code or "",
                "payer_payee": t.payer_payee_name or "",
                "payment_method": t.payment_method or "",
                "category": t.category_code or "",
                "income_amount": raw_amount if raw_type in ["Thu", "INCOME"] else 0,
                "expense_amount": raw_amount if raw_type in ["Chi", "EXPENSE"] else 0,
                "amount": raw_amount
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/transactions", summary="Create Cashflow Transaction", description="Record a new cash inflow or outflow transaction voucher.")
def create_transaction(
    payload: CashflowTransactionCreateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "create"))
):
    try:
        new_item = CashflowTransaction(
            id=f"PTC-{uuid.uuid4().hex[:8].upper()}",
            transaction_type=payload.transaction_type,
            amount=payload.amount,
            description=payload.description,
            payer_payee_name=payload.payer_payee_name,
            payment_method=payload.payment_method,
            created_at=datetime.utcnow()
        )
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return {"message": "Transaction created successfully", "data": {"id": new_item.id}}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/piece-rates", summary="List Piece-Rate Payroll Ledger", description="Retrieve piece-rate payroll tracking ledger for staff.")
def list_piece_rate_payroll(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "read"))
):
    return []
