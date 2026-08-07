from sqlalchemy.orm import Session
from src.db.models import CashflowTransaction, Contract, Customer, ServiceLine, Employee

def serialize_cashflow(t: CashflowTransaction, db: Session = None) -> dict:
    """Serialize 1 cashflow transaction."""
    contract_label = t.contract_id or ""
    project_label = t.project_id or ""

    if db is not None:
        if t.contract_id:
            c = db.query(Contract).filter(Contract.id == t.contract_id).first()
            if c:
                cust = db.query(Customer).filter(Customer.id == c.customer_id).first()
                cust_name = cust.full_name if cust else ""
                contract_label = f"{t.contract_id}" + (f" — {cust_name}" if cust_name else "")
        if t.project_id:
            p = db.query(ServiceLine).filter(ServiceLine.id == t.project_id).first()
            if p and p.service_type:
                project_label = f"{t.project_id} — {p.service_type}"

    formatted_date = t.transaction_date.strftime("%d/%m/%y") if t.transaction_date else (t.created_at.strftime("%d/%m/%y") if t.created_at else "")
    cat_code = t.category_code or "OTHER"
    desc = t.description or ""
    cat_label = f"{cat_code}: {desc}" if cat_code and desc else (cat_code or desc or "")

    return {
        "id": t.id,
        "transaction_type": t.transaction_type,
        "transaction_date": formatted_date,
        "category_code": cat_code,
        "description": desc,
        "category_label": cat_label,
        "payer_payee_name": t.payer_payee_name or "",
        "payment_method": t.payment_method or "",
        "project_label": project_label,
        "contract_label": contract_label,
        "amount": float(t.amount or 0),
        "contract_id": t.contract_id,
        "project_id": t.project_id,
        "balance_after": float(t.balance_after or 0),
        "cash_balance_after": float(t.cash_balance_after or 0),
        "bank_balance_after": float(t.bank_balance_after or 0),
        "status": t.status or "",
        "scope": getattr(t, "scope", "INTERNAL") or "INTERNAL",
        "is_pass_through_fee": bool(t.is_pass_through_fee),
    }

def serialize_cashflow_bulk(rows, db: Session) -> list:
    """Serialize multiple cashflow transactions, avoiding N+1 queries."""
    if not rows:
        return []
        
    contract_ids = {r.contract_id for r in rows if r.contract_id}
    project_ids = {r.project_id for r in rows if r.project_id}

    contracts = {
        c.id: c for c in db.query(Contract).filter(Contract.id.in_(contract_ids)).all()
    } if contract_ids else {}
    
    customer_ids = {c.customer_id for c in contracts.values() if c.customer_id}
    customers = {
        cu.id: cu for cu in db.query(Customer).filter(Customer.id.in_(customer_ids)).all()
    } if customer_ids else {}
    
    projects = {
        p.id: p for p in db.query(ServiceLine).filter(ServiceLine.id.in_(project_ids)).all()
    } if project_ids else {}

    result = []
    for t in rows:
        contract_label = t.contract_id or ""
        project_label = t.project_id or ""
        if t.contract_id and t.contract_id in contracts:
            c = contracts[t.contract_id]
            cust = customers.get(c.customer_id)
            cust_name = cust.full_name if cust else ""
            contract_label = f"{t.contract_id}" + (f" — {cust_name}" if cust_name else "")
        if t.project_id and t.project_id in projects:
            p = projects[t.project_id]
            if p.service_type:
                project_label = f"{t.project_id} — {p.service_type}"

        formatted_date = t.transaction_date.strftime("%d/%m/%y") if t.transaction_date else (t.created_at.strftime("%d/%m/%y") if t.created_at else "")
        cat_code = t.category_code or "OTHER"
        desc = t.description or ""
        cat_label = f"{cat_code}: {desc}" if cat_code and desc else (cat_code or desc or "")

        result.append({
            "id": t.id,
            "transaction_type": t.transaction_type,
            "transaction_date": formatted_date,
            "category_code": cat_code,
            "description": desc,
            "category_label": cat_label,
            "payer_payee_name": t.payer_payee_name or "",
            "payment_method": t.payment_method or "",
            "project_label": project_label,
            "contract_label": contract_label,
            "amount": float(t.amount or 0),
            "contract_id": t.contract_id,
            "project_id": t.project_id,
            "balance_after": float(t.balance_after or 0),
            "cash_balance_after": float(t.cash_balance_after or 0),
            "bank_balance_after": float(t.bank_balance_after or 0),
            "status": t.status or "",
            "scope": getattr(t, "scope", "INTERNAL") or "INTERNAL",
            "is_pass_through_fee": bool(t.is_pass_through_fee),
        })
    return result

def serialize_employee(employee: Employee, department_name: str = None) -> dict:
    """Serialize 1 employee."""
    return {
        "id": employee.id,
        "user_id": employee.user_id,
        "full_name": employee.full_name or "",
        "department_id": employee.department_id,
        "department": department_name or employee.department or "",
        "job_title": employee.job_title or "",
        "contract_status": employee.contract_status or "Probation",
        "join_date": employee.join_date.isoformat() if employee.join_date else None,
        "probation_end_date": (
            employee.probation_end_date.isoformat()
            if employee.probation_end_date else None
        ),
        "base_salary": float(employee.base_salary or 0),
        "is_active": bool(employee.is_active),
        "created_at": employee.created_at.isoformat() if employee.created_at else None,
        "updated_at": employee.updated_at.isoformat() if employee.updated_at else None,
    }
