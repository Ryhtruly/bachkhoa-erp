from sqlalchemy.orm import Session
from src.db.models import CashflowTransaction, Contract, Customer, ServiceLine, Employee
from src.files.payment_receipts import public_receipt_attachments


def _receipt_fields(t: CashflowTransaction) -> dict:
    attachments = public_receipt_attachments(
        getattr(t, "receipt_attachments", None),
        getattr(t, "receipt_attachment_url", None),
    )
    return {
        "receipt_attachments": attachments,
        "receipt_attachment_url": attachments[0]["url"] if attachments else None,
    }

def serialize_cashflow(t: CashflowTransaction, db: Session) -> dict:
    """Serialize 1 cashflow transaction, including labels."""
    contract_label = ""
    if t.contract_id:
        c = db.query(Contract).filter(Contract.id == t.contract_id).first()
        if c:
            cust_name = ""
            if c.customer_id:
                cust = db.query(Customer).filter(Customer.id == c.customer_id).first()
                if cust:
                    cust_name = cust.full_name or ""
            contract_label = f"{c.id} — {cust_name}".strip(" —")

    project_label = ""
    if t.project_id:
        p = db.query(ServiceLine).filter(ServiceLine.id == t.project_id).first()
        if p:
            project_label = f"{p.id} — {p.service_type or ''}".strip(" —")

    raw_type = t.transaction_type or ""
    raw_amount = float(t.amount or 0)
    raw_desc = t.description or ""
    raw_cat = t.category_code or "Other"
    raw_partner = t.payer_payee_name or ""
    raw_method = t.payment_method or ""
    raw_date = t.transaction_date
    date_str = raw_date.strftime("%Y-%m-%d") if raw_date else (t.created_at.strftime("%Y-%m-%d") if t.created_at else "")

    return {
        "id": t.id,
        "transaction_type": raw_type,
        "type": raw_type,
        "date": date_str,
        "transaction_date": date_str,
        "category": raw_cat,
        "description": raw_desc,
        "partner": raw_partner,
        "payer_payee": raw_partner,
        "payment_method": raw_method,
        "project": project_label,
        "contract": contract_label,
        "amount": raw_amount,
        "contract_id": t.contract_id,
        "project_id": t.project_id,
        "balance_after": float(t.balance_after or 0),
        "cash_balance_after": float(t.cash_balance_after or 0),
        "bank_balance_after": float(t.bank_balance_after or 0),
        "status": t.status or "",
        "scope": t.scope or "Công ty",
        "Ngày": date_str,
        "Hạng mục": raw_cat,
        "Diễn giải": raw_desc,
        "Đối tác": raw_partner,
        "Hình thức": raw_method,
        **_receipt_fields(t),
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
    
    projects = {
        p.id: p for p in db.query(ServiceLine).filter(ServiceLine.id.in_(project_ids)).all()
    } if project_ids else {}

    customer_ids = {c.customer_id for c in contracts.values() if c.customer_id}
    customers = {
        c.id: c for c in db.query(Customer).filter(Customer.id.in_(customer_ids)).all()
    } if customer_ids else {}

    result = []
    for t in rows:
        contract_label = ""
        if t.contract_id and t.contract_id in contracts:
            c = contracts[t.contract_id]
            cust_name = customers[c.customer_id].full_name if c.customer_id and c.customer_id in customers else ""
            contract_label = f"{c.id} — {cust_name}".strip(" —")

        project_label = ""
        if t.project_id and t.project_id in projects:
            p = projects[t.project_id]
            project_label = f"{p.id} — {p.service_type or ''}".strip(" —")

        raw_type = t.transaction_type or ""
        raw_amount = float(t.amount or 0)
        raw_desc = t.description or ""
        raw_cat = t.category_code or "Other"
        raw_partner = t.payer_payee_name or ""
        raw_method = t.payment_method or ""
        raw_date = t.transaction_date
        date_str = raw_date.strftime("%Y-%m-%d") if raw_date else (t.created_at.strftime("%Y-%m-%d") if t.created_at else "")

        result.append({
            "id": t.id,
            "transaction_type": raw_type,
            "type": raw_type,
            "date": date_str,
            "transaction_date": date_str,
            "category": raw_cat,
            "description": raw_desc,
            "partner": raw_partner,
            "payer_payee": raw_partner,
            "payment_method": raw_method,
            "project": project_label,
            "contract": contract_label,
            "amount": raw_amount,
            "contract_id": t.contract_id,
            "project_id": t.project_id,
            "balance_after": float(t.balance_after or 0),
            "cash_balance_after": float(t.cash_balance_after or 0),
            "bank_balance_after": float(t.bank_balance_after or 0),
            "status": t.status or "",
            "scope": t.scope or "Công ty",
            "Ngày": date_str,
            "Hạng mục": raw_cat,
            "Diễn giải": raw_desc,
            "Đối tác": raw_partner,
            "Hình thức": raw_method,
            **_receipt_fields(t),
        })
    return result

def serialize_employee(employee: Employee, department_name: str = None, account=None) -> dict:
    """Serialize 1 employee. `account` is the linked User row, if any."""
    return {
        "id": employee.id,
        "user_id": employee.user_id,
        "full_name": employee.full_name,
        "department_id": employee.department_id,
        "department": department_name or employee.department or "",
        "job_title": employee.job_title or "",
        "contract_status": employee.contract_status or "Probation",
        "join_date": employee.join_date.strftime("%Y-%m-%d") if employee.join_date else "",
        "probation_end_date": employee.probation_end_date.strftime("%Y-%m-%d") if employee.probation_end_date else "",
        "base_salary": float(employee.base_salary or 0),
        "is_active": bool(employee.is_active if employee.is_active is not None else True),
        "created_at": employee.created_at.strftime("%Y-%m-%d %H:%M:%S") if employee.created_at else "",
        "updated_at": employee.updated_at.strftime("%Y-%m-%d %H:%M:%S") if employee.updated_at else "",
        "email": employee.email,
        "phone": employee.phone,
        "gender": employee.gender,
        "date_of_birth": employee.date_of_birth.strftime("%Y-%m-%d") if employee.date_of_birth else "",
        "place_of_birth": employee.place_of_birth,
        "avatar_url": employee.avatar_url,
        "account_username": account.username if account else None,
        "account_email": account.email if account else None,
        "account_is_active": bool(account.is_active) if account else None,
        "account_email_verified": bool(account.email_verified) if account else None,
    }
