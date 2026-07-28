from sqlalchemy.orm import Session
from src.db.models import CashflowTransaction, Contract, Customer, ProjectTask, Employee

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
            p = db.query(ProjectTask).filter(ProjectTask.id == t.project_id).first()
            if p and p.task_name:
                project_label = f"{t.project_id} — {p.task_name}"

    return {
        "id": t.id,
        "type": t.loai,
        "Ngày": t.ngay.strftime("%d/%m/%y") if t.ngay else (t.created_at.strftime("%d/%m/%y") if t.created_at else ""),
        "Hạng mục": t.hang_muc or "Khác",
        "Diễn giải": t.dien_giai or "",
        "Danh mục": f"{t.hang_muc}: {t.dien_giai}" if t.hang_muc and t.dien_giai else (t.hang_muc or t.dien_giai or ""),
        "Đối tác": t.nguoi_nhan_nop or "",
        "Hình thức": t.hinh_thuc or "",
        "Dự án": project_label,
        "Hợp đồng": contract_label,
        "amount": float(t.so_tien or 0),
        "contract_id": t.contract_id,
        "project_id": t.project_id,
        "so_du_sau_gd": float(t.so_du_sau_gd or 0),
        "so_du_tien_mat": float(t.so_du_tien_mat or 0),
        "so_du_ck": float(t.so_du_ck or 0),
        "trang_thai": t.trang_thai or "",
        "scope": getattr(t, "scope", "Công ty") or "Công ty"
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
        p.id: p for p in db.query(ProjectTask).filter(ProjectTask.id.in_(project_ids)).all()
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
            if p.task_name:
                project_label = f"{t.project_id} — {p.task_name}"

        result.append({
            "id": t.id,
            "type": t.loai,
            "Ngày": t.ngay.strftime("%d/%m/%y") if t.ngay else (t.created_at.strftime("%d/%m/%y") if t.created_at else ""),
            "Hạng mục": t.hang_muc or "Khác",
            "Diễn giải": t.dien_giai or "",
            "Danh mục": f"{t.hang_muc}: {t.dien_giai}" if t.hang_muc and t.dien_giai else (t.hang_muc or t.dien_giai or ""),
            "Đối tác": t.nguoi_nhan_nop or "",
            "Hình thức": t.hinh_thuc or "",
            "Dự án": project_label,
            "Hợp đồng": contract_label,
            "amount": float(t.so_tien or 0),
            "contract_id": t.contract_id,
            "project_id": t.project_id,
            "so_du_sau_gd": float(t.so_du_sau_gd or 0),
            "so_du_tien_mat": float(t.so_du_tien_mat or 0),
            "so_du_ck": float(t.so_du_ck or 0),
            "trang_thai": t.trang_thai or "",
            "scope": getattr(t, "scope", "Công ty") or "Công ty"
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
