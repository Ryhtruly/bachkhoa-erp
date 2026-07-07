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
    # 1. Tìm mốc chốt chặn (Snapshot) mới nhất trước hoặc bằng thời gian cần xem
    from src.db.models import FundOpeningBalance
    
    q_snap = db.query(FundOpeningBalance).filter(FundOpeningBalance.hinh_thuc == hinh_thuc)
    if up_to_datetime:
        q_snap = q_snap.filter(FundOpeningBalance.ngay_ap_dung <= up_to_datetime)
    latest_snap = q_snap.order_by(FundOpeningBalance.ngay_ap_dung.desc(), FundOpeningBalance.id.desc()).first()
    
    if latest_snap:
        start_bal = float(latest_snap.so_tien_dau_ky)
        start_time = latest_snap.ngay_ap_dung
    else:
        # Nếu chưa từng có mốc chốt nào, lấy cấu hình ban đầu hệ thống
        key = "initial_cash_balance" if hinh_thuc == "Tiền mặt" else "initial_bank_balance"
        start_bal = get_setting_value(db, key, 0.0)
        start_time = None

    # 2. Tính tổng Thu / Chi phát sinh SAU mốc chốt sổ này
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
    
    # 2. Tính tổng Thu / Chi phát sinh SAU mốc chốt sổ này
    if start_time:
        q_thu = q_thu.filter(CashflowTransaction.ngay > start_time.date())
        q_chi = q_chi.filter(CashflowTransaction.ngay > start_time.date())
        
    if up_to_datetime:
        q_thu = q_thu.filter(CashflowTransaction.ngay <= up_to_datetime.date())
        q_chi = q_chi.filter(CashflowTransaction.ngay <= up_to_datetime.date())
        
    thu_sum = float(q_thu.scalar() or 0.0)
    chi_sum = float(q_chi.scalar() or 0.0)
    
    # 3. Trả về kết quả
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


def _check_closed_period(db: Session, target_date: date):
    from src.db.models import FundOpeningBalance
    latest_snap = db.query(FundOpeningBalance).order_by(FundOpeningBalance.ngay_ap_dung.desc()).first()
    if latest_snap and latest_snap.ngay_ap_dung:
        snap_date = latest_snap.ngay_ap_dung.date() if isinstance(latest_snap.ngay_ap_dung, datetime) else latest_snap.ngay_ap_dung
        if target_date <= snap_date:
            raise HTTPException(status_code=400, detail="Dữ liệu thuộc kỳ kế toán đã chốt, không thể thêm/sửa/hủy.")


def _sync_receivables(db: Session, contract_id: str, amount: float):
    rec = db.query(Receivable).filter(Receivable.contract_id == contract_id).first()
    if rec:
        rec.paid_amount = float(rec.paid_amount or 0) + amount
        rec.remaining_amount = max(0.0, float(rec.remaining_amount or 0) - amount)
    else:
        c = db.query(Contract).filter(Contract.id == contract_id).first()
        total = float(c.total_value or 0) if c else 0.0
        due_date_val = c.date_signed + datetime.timedelta(days=30) if c and c.date_signed else None
        db.add(Receivable(
            contract_id=contract_id,
            paid_amount=amount,
            remaining_amount=max(0.0, total - amount),
            due_date=due_date_val
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

        # 1. Check closed period
        _check_closed_period(db, parsed_date)

        # 2. Check sensitive category (thụ lý bản vẽ)
        if "thụ lý bản vẽ" in hang_muc.lower():
            if not payload.contract_id and not payload.project_id:
                raise HTTPException(
                    status_code=400,
                    detail="Hạng mục Chi thụ lý bản vẽ bắt buộc phải liên kết Hợp đồng hoặc Hồ sơ/Dự án."
                )

        # 3. Check cash balance for "Chi" and "Tiền mặt"
        if payload.type == "Chi" and payload.payment_method == "Tiền mặt":
            _check_cash(db, payload.amount)

        # 4. Customer lookup and autofill contract/project
        contract_id = payload.contract_id or None
        project_id = payload.project_id or None
        if not contract_id and payload.payer_payee:
            cust = db.query(Customer).filter(Customer.full_name == payload.payer_payee).first()
            if cust:
                c = db.query(Contract).filter(Contract.customer_id == cust.id).order_by(Contract.created_at.desc()).first()
                if c:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Phát hiện đối tác '{payload.payer_payee}' có Hợp đồng. Vui lòng chọn rõ Hợp đồng, không để trống."
                    )

        # 5. Check Receivables threshold
        if payload.type == "Thu" and contract_id:
            rec = db.query(Receivable).filter(Receivable.contract_id == contract_id).first()
            if rec:
                if payload.amount > float(rec.remaining_amount or 0):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Số tiền thu ({payload.amount:,.0f}₫) vượt quá công nợ còn lại ({float(rec.remaining_amount or 0):,.0f}₫)"
                    )
            else:
                c = db.query(Contract).filter(Contract.id == contract_id).first()
                total = float(c.total_value or 0) if c else 0.0
                if payload.amount > total:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Số tiền thu ({payload.amount:,.0f}₫) vượt quá giá trị hợp đồng ({total:,.0f}₫)"
                    )

        # 6. Project vs Non-project classification of project_id
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
    try:
        t = db.query(CashflowTransaction).filter(CashflowTransaction.id == transaction_id).first()
        if not t:
            raise HTTPException(status_code=404, detail="Không tìm thấy phiếu thu/chi này")

        parsed_date = t.ngay
        if payload.ngay:
            try:
                parsed_date = datetime.strptime(payload.ngay, "%Y-%m-%d").date()
            except ValueError:
                pass

        _check_closed_period(db, t.ngay or date.today())
        if parsed_date and parsed_date != t.ngay:
            _check_closed_period(db, parsed_date)
        
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
        t.ngay = parsed_date

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
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

def crud_void_cashflow(db: Session, transaction_id: str, reason: str, actor_id: str):
    try:
        t = db.query(CashflowTransaction).filter(CashflowTransaction.id == transaction_id).first()
        if not t:
            raise HTTPException(status_code=404, detail="Không tìm thấy phiếu")
        
        if t.trang_thai == "Đã hủy":
            raise HTTPException(status_code=400, detail="Phiếu này đã bị hủy trước đó.")
        
        _check_closed_period(db, t.ngay or date.today())
        
        t.trang_thai = "Đã hủy"
        t.voided_reason = reason
        t.voided_at = datetime.now()
        
        # 1. Sync Receivables backward if it was Thu
        if t.loai == "Thu" and t.contract_id:
            _sync_receivables(db, t.contract_id, -float(t.so_tien))
        
        # 2. Reverse Entry to correct Running Balance without deleting
        reverse_type = "Chi" if t.loai == "Thu" else "Thu"
        rev_id = _voucher_id(reverse_type, db)
        bal_tm, bal_ck, bal_sau = _calculate_balances(db, reverse_type, float(t.so_tien), t.hinh_thuc)
        
        reverse_tc = CashflowTransaction(
            id=rev_id,
            project_id=t.project_id,
            contract_id=t.contract_id,
            loai=reverse_type,
            so_tien=t.so_tien,
            hang_muc="Hoàn tác (Hủy phiếu)",
            nguoi_nhan_nop=t.nguoi_nhan_nop,
            hinh_thuc=t.hinh_thuc,
            ngay=date.today(),
            so_chung_tu=rev_id,
            dien_giai=f"Hủy tự động cho phiếu gốc: {t.id} - Lý do: {reason}",
            du_an_phong_ban=t.du_an_phong_ban,
            so_du_sau_gd=bal_sau,
            so_du_tien_mat=bal_tm,
            so_du_ck=bal_ck,
            nguoi_lap=actor_id,
            trang_thai="Hoàn thành",
            scope=t.scope
        )
        db.add(reverse_tc)
        
        from src.db.models import AuditLog
        db.add(AuditLog(
            actor_id=actor_id,
            action="VOID",
            object_type="CashflowTransaction",
            payload_json={"id": t.id, "reason": reason}
        ))
        
        db.commit()
        return {"status": "success", "message": "Đã hủy và tạo reverse entry thành công."}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

