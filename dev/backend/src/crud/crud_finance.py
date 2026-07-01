from sqlalchemy.orm import Session
from sqlalchemy import func, extract, or_
from typing import Optional
from datetime import datetime, date
from src.db.models import CashflowTransaction, Contract, Customer, Receivable, ProjectTask, FinanceSetting


def get_setting_value(db: Session, key: str, default: float = 0.0) -> float:
    try:
        setting = db.query(FinanceSetting).filter(FinanceSetting.key == key).first()
        if setting:
            return float(setting.value or 0.0)
    except Exception:
        pass
    return default


def get_running_balance(db: Session, hinh_thuc: str, up_to_datetime: Optional[datetime] = None) -> float:
    # 1. Find the latest closing snapshot before or at up_to_datetime
    from src.db.models import FundOpeningBalance
    
    q_snap = db.query(FundOpeningBalance).filter(FundOpeningBalance.hinh_thuc == hinh_thuc)
    if up_to_datetime:
        q_snap = q_snap.filter(FundOpeningBalance.ngay_ap_dung <= up_to_datetime)
    latest_snap = q_snap.order_by(FundOpeningBalance.ngay_ap_dung.desc(), FundOpeningBalance.id.desc()).first()
    
    if latest_snap:
        start_bal = float(latest_snap.so_tien_dau_ky)
        start_time = latest_snap.ngay_ap_dung
    else:
        key = "initial_cash_balance" if hinh_thuc == "Tiền mặt" else "initial_bank_balance"
        start_bal = get_setting_value(db, key, 0.0)
        start_time = None

    # 2. Sum transactions after start_time up to up_to_datetime
    q_thu = db.query(func.sum(CashflowTransaction.so_tien)).filter(
        CashflowTransaction.loai == "Thu",
        CashflowTransaction.hinh_thuc == hinh_thuc,
        CashflowTransaction.scope == "Công ty"
    )
    
    q_chi = db.query(func.sum(CashflowTransaction.so_tien)).filter(
        CashflowTransaction.loai == "Chi",
        CashflowTransaction.hinh_thuc == hinh_thuc,
        CashflowTransaction.scope == "Công ty"
    )
    
    if start_time:
        q_thu = q_thu.filter(CashflowTransaction.created_at > start_time)
        q_chi = q_chi.filter(CashflowTransaction.created_at > start_time)
        
    if up_to_datetime:
        q_thu = q_thu.filter(CashflowTransaction.created_at <= up_to_datetime)
        q_chi = q_chi.filter(CashflowTransaction.created_at <= up_to_datetime)
        
    thu_sum = float(q_thu.scalar() or 0.0)
    chi_sum = float(q_chi.scalar() or 0.0)
    
    return start_bal + thu_sum - chi_sum


# ══════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════

def _row(t: CashflowTransaction, db: Session = None) -> dict:
    """Serialize 1 giao dịch."""
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
        "trang_thai": t.trang_thai or ""
    }


def _row_bulk(rows, db: Session) -> list:
    """Serialize nhiều giao dịch 1 lần, tránh N+1 query."""
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


def _voucher_id(type_val: str, db: Session, target_date: date = None) -> str:
    prefix = "PT" if type_val == "Thu" else "PC"
    now = target_date or datetime.now().date()
    month_str = now.strftime("%m")
    year_str = now.strftime("%Y")
    
    serial = 1
    while True:
        proposed_id = f"{prefix}-{month_str}/{year_str}-{serial:03d}"
        exists = db.query(CashflowTransaction.id).filter(CashflowTransaction.id == proposed_id).first()
        if not exists:
            return proposed_id
        serial += 1


def _validate_contract(db: Session, contract_id: str):
    pass


def _validate_project(db: Session, project_id: str):
    pass


def _check_cash(db: Session, amount: float, exclude_transaction_id: Optional[str] = None):
    balance = get_running_balance(db, "Tiền mặt")
    if exclude_transaction_id:
        t = db.query(CashflowTransaction).filter(CashflowTransaction.id == exclude_transaction_id).first()
        if t and t.loai == "Chi" and t.hinh_thuc == "Tiền mặt":
            balance += float(t.so_tien or 0)
        elif t and t.loai == "Thu" and t.hinh_thuc == "Tiền mặt":
            balance -= float(t.so_tien or 0)

    if balance < amount:
        raise HTTPException(
            status_code=400,
            detail=f"Âm quỹ tiền mặt! Số dư: {balance:,.0f}₫ < {amount:,.0f}₫ cần chi"
        )


def _calculate_balances(db: Session, type_val: str, amount: float, method: str):
    bal_tm = get_running_balance(db, "Tiền mặt")
    bal_ck = get_running_balance(db, "Chuyển khoản")
    
    if method == "Tiền mặt":
        if type_val == "Thu":
            bal_tm += amount
        else:
            bal_tm -= amount
    else:
        if type_val == "Thu":
            bal_ck += amount
        else:
            bal_ck -= amount
            
    return bal_tm, bal_ck, bal_tm + bal_ck


def _sync_receivables(db: Session, contract_id: str, amount: float):
    rec = db.query(Receivable).filter(Receivable.contract_id == contract_id).first()
    if rec:
        rec.paid_amount = float(rec.paid_amount or 0) + amount
        rec.remaining_amount = max(0.0, float(rec.remaining_amount or 0) - amount)
    else:
        c = db.query(Contract).filter(Contract.id == contract_id).first()
        total = float(c.total_value or 0) if c else 0.0
        db.add(Receivable(
            contract_id=contract_id,
            paid_amount=amount,
            remaining_amount=max(0.0, total - amount),
        ))


def _parse_category(cat_val: str):
    if ": " in cat_val:
        parts = cat_val.split(": ", 1)
        return parts[0], parts[1]
    return "Khác", cat_val


# ══════════════════════════════════════════════════════════════
# 1. DÒNG TIỀN — Cashflow
# ══════════════════════════════════════════════════════════════


from fastapi import HTTPException

def crud_get_cashflow_detail(db: Session, transaction_id: str):
    t = db.query(CashflowTransaction).filter(CashflowTransaction.id == transaction_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu")
    
    contract_info = None
    if t.contract_id:
        c = db.query(Contract).filter(Contract.id == t.contract_id).first()
        if c:
            cust = db.query(Customer).filter(Customer.id == c.customer_id).first()
            contract_info = {
                "id": c.id,
                "service_type": c.service_type,
                "total_value": float(c.total_value or 0),
                "date_signed": str(c.date_signed) if c.date_signed else "",
                "customer_name": cust.full_name if cust else "",
                "customer_phone": cust.phone if cust else ""
            }

    data = _row(t, db)
    data["contract_info"] = contract_info
    data["ngay"] = str(t.ngay) if t.ngay else ""
    data["ghi_chu"] = t.ghi_chu or ""
    return data

def crud_create_cashflow(db: Session, payload):
    try:
        parsed_date = date.today()
        if payload.ngay:
            try:
                parsed_date = datetime.strptime(payload.ngay, "%Y-%m-%d").date()
            except ValueError:
                pass

        hang_muc = payload.category if not getattr(payload, 'dien_giai', None) else payload.category
        dien_giai = payload.dien_giai if getattr(payload, 'dien_giai', None) else ""
        if not dien_giai:
            parts = payload.category.split(': ', 1)
            if len(parts) == 2:
                hang_muc, dien_giai = parts

        # 1. Check sensitive category (thụ lý bản vẽ)
        if "thụ lý bản vẽ" in hang_muc.lower():
            if not payload.contract_id and not payload.project_id:
                raise HTTPException(
                    status_code=400,
                    detail="Hạng mục Chi thụ lý bản vẽ bắt buộc phải liên kết Hợp đồng hoặc Hồ sơ/Dự án."
                )

        # 2. Check cash balance for "Chi" and "Tiền mặt"
        if payload.type == "Chi" and payload.payment_method == "Tiền mặt":
            _check_cash(db, payload.amount)

        # 3. Customer lookup and autofill contract/project
        contract_id = payload.contract_id or None
        project_id = payload.project_id or None
        if not contract_id and payload.payer_payee:
            cust = db.query(Customer).filter(Customer.full_name == payload.payer_payee).first()
            if cust:
                c = db.query(Contract).filter(Contract.customer_id == cust.id).order_by(Contract.created_at.desc()).first()
                if c:
                    contract_id = c.id
                    p = db.query(ProjectTask).filter(ProjectTask.contract_id == c.id).order_by(ProjectTask.created_at.desc()).first()
                    if p:
                        project_id = p.id

        # 4. Project vs Non-project classification of project_id
        is_operational = False
        op_keywords = ["văn phòng phẩm", "tiếp khách", "điện nước", "bảo hiểm", "công tác phí", "shipper", "vận hành", "quản lý"]
        for kw in op_keywords:
            if kw in hang_muc.lower() or kw in dien_giai.lower():
                is_operational = True
                break

        if is_operational:
            project_id = None
        else:
            if contract_id and not project_id:
                p = db.query(ProjectTask).filter(ProjectTask.contract_id == contract_id).order_by(ProjectTask.created_at.desc()).first()
                if p:
                    project_id = p.id

        # 5. Approval Workflow Status
        trang_thai = payload.trang_thai or "Hoàn thành"
        creator = payload.nguoi_lap or "Lê Văn Dựng"
        approver = payload.nguoi_duyet or "Lê Văn Dựng"
        if creator != approver:
            trang_thai = "Chờ duyệt"

        new_id = _voucher_id(payload.type, db, parsed_date)
        bal_tm, bal_ck, bal_sau = _calculate_balances(db, payload.type, payload.amount, payload.payment_method)
        
        proj_label = ""
        if project_id:
            p = db.query(ProjectTask).filter(ProjectTask.id == project_id).first()
            if p: proj_label = f"{p.id} — {p.task_name or ''}"

        tc = CashflowTransaction(
            id=new_id,
            project_id=project_id,
            contract_id=contract_id,
            loai=payload.type,
            so_tien=payload.amount,
            hang_muc=hang_muc,
            nguoi_nhan_nop=payload.payer_payee,
            hinh_thuc=payload.payment_method,
            ngay=parsed_date,
            so_chung_tu=new_id,
            dien_giai=dien_giai,
            du_an_phong_ban=payload.du_an_phong_ban or proj_label,
            so_du_sau_gd=bal_sau,
            so_du_tien_mat=bal_tm,
            so_du_ck=bal_ck,
            nguoi_lap=creator,
            nguoi_duyet=approver,
            trang_thai=trang_thai,
            scope=payload.scope or "Công ty"
        )
        db.add(tc)

        # Create audit log
        from src.db.models import AuditLog, User
        actor_exists = db.query(User.id).filter(User.id == creator).first()
        actor_id_val = creator if actor_exists else None
        
        db.add(AuditLog(
            actor_id=actor_id_val,
            action="CREATE",
            object_type="CashflowTransaction",
            payload_json={
                "id": tc.id,
                "new": {
                    "Đối tác": tc.nguoi_nhan_nop,
                    "amount": float(tc.so_tien),
                    "type": tc.loai,
                    "hang_muc": tc.hang_muc
                }
            }
        ))

        if payload.type == "Thu" and contract_id:
            _sync_receivables(db, contract_id, payload.amount)
        db.commit()
        return {"status": "success", "id": tc.id, "type": payload.type}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

def crud_update_cashflow(db: Session, transaction_id: str, payload):
    t = db.query(CashflowTransaction).filter(CashflowTransaction.id == transaction_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu thu/chi này")
    
    if t.trang_thai in ["Hoàn thành", "Đã duyệt"]:
        if hasattr(payload, 'contract_id') and payload.contract_id is not None:
            if t.contract_id != payload.contract_id:
                if t.loai == "Thu":
                    if t.contract_id: _sync_receivables(db, t.contract_id, -float(t.so_tien))
                    if payload.contract_id: _sync_receivables(db, payload.contract_id, float(t.so_tien))
                t.contract_id = payload.contract_id
                db.commit()
                return {"status": "success", "message": "Đã cập nhật hợp đồng"}
            return {"status": "success", "message": "Không thay đổi gì"}
        raise HTTPException(status_code=400, detail="Phiếu đã hoàn thành, không thể sửa số tiền/thông tin khác")

    # 1. Validate sensitive category
    if "thụ lý bản vẽ" in payload.hang_muc.lower():
        if not payload.contract_id and not t.project_id:
            raise HTTPException(
                status_code=400,
                detail="Hạng mục Chi thụ lý bản vẽ bắt buộc phải liên kết Hợp đồng hoặc Hồ sơ/Dự án."
            )

    old_amount = float(t.so_tien)
    new_amount = float(payload.so_tien)
    amount_diff = new_amount - old_amount
    
    # 2. Check cash balance
    if t.loai == "Chi" and payload.hinh_thuc == "Tiền mặt":
        _check_cash(db, new_amount, exclude_transaction_id=t.id)

    if amount_diff != 0:
        _calculate_balances(db, t.loai, amount_diff, payload.hinh_thuc)
        if t.loai == "Thu" and t.contract_id:
            _sync_receivables(db, t.contract_id, amount_diff)

    t.hang_muc = payload.hang_muc
    t.nguoi_nhan_nop = payload.nguoi_nhan_nop
    t.hinh_thuc = payload.hinh_thuc
    t.so_tien = new_amount
    t.dien_giai = payload.dien_giai
    t.contract_id = payload.contract_id or None
    if payload.scope:
        t.scope = payload.scope
    if payload.ngay:
        try:
            t.ngay = datetime.strptime(payload.ngay, "%Y-%m-%d").date()
        except ValueError:
            pass

    # Create audit log
    from src.db.models import AuditLog, User
    actor_id_val = t.nguoi_lap or "Lê Văn Dựng"
    actor_exists = db.query(User.id).filter(User.id == actor_id_val).first()
    actor_id_val = actor_id_val if actor_exists else None

    db.add(AuditLog(
        actor_id=actor_id_val,
        action="UPDATE",
        object_type="CashflowTransaction",
        payload_json={
            "id": t.id,
            "old": {
                "amount": old_amount
            },
            "new": {
                "amount": new_amount,
                "Diễn giải": payload.dien_giai
            }
        }
    ))

    db.commit()
    return {"status": "success"}
