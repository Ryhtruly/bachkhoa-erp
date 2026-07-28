import logging
import uuid
from datetime import datetime, date, timezone, timedelta
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Optional

logger = logging.getLogger(__name__)

from src.db.models import (
    CashflowTransaction, Contract, Customer, Receivable,
    ProjectTask, Employee, AuditLog, User, FinanceSetting, FundOpeningBalance
)
from src.finance.repository import FinanceRepository
from src.finance.domain_rules import (
    check_closed_period, check_cash_balance, validate_contract,
    validate_project, validate_employee_payload, parse_category, calculate_balances
)
from src.finance.serializers import serialize_employee

class FinanceService:

    @staticmethod
    def create_cashflow(db: Session, payload, actor_id: Optional[str] = None) -> dict:
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
            check_closed_period(db, parsed_date)

            # 2. Check sensitive category (thụ lý bản vẽ)
            if "thụ lý bản vẽ" in hang_muc.lower():
                if not payload.contract_id and not payload.project_id:
                    raise HTTPException(
                        status_code=400,
                        detail="Hạng mục Chi thụ lý bản vẽ bắt buộc phải liên kết Hợp đồng hoặc Hồ sơ/Dự án."
                    )

            # 3. Check cash balance for "Chi" and "Tiền mặt"
            if payload.type == "Chi" and payload.payment_method == "Tiền mặt":
                check_cash_balance(db, payload.amount)

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

            # 7. Approval Workflow Status
            trang_thai = payload.trang_thai or "Hoàn thành"
            creator = payload.nguoi_lap or actor_id or "Lê Văn Dựng"
            approver = payload.nguoi_duyet or "Lê Văn Dựng"
            if creator != approver:
                trang_thai = "Chờ duyệt"

            new_id = FinanceRepository.generate_voucher_id(payload.type, db, parsed_date)
            bal_tm, bal_ck, bal_sau = calculate_balances(db, payload.type, payload.amount, payload.payment_method)
            
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
            target_actor = actor_id or creator
            actor_exists = db.query(User.id).filter(User.id == target_actor).first() if target_actor else None
            actor_id_val = target_actor if actor_exists else None
            
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
                FinanceService._sync_receivables(db, contract_id, payload.amount)
                
            db.commit()
            return {"status": "success", "id": tc.id, "type": payload.type}
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    def update_cashflow(db: Session, transaction_id: str, payload, actor_id: Optional[str] = None) -> dict:
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

            check_closed_period(db, t.ngay or date.today())
            if parsed_date and parsed_date != t.ngay:
                check_closed_period(db, parsed_date)
            
            if t.trang_thai in ["Hoàn thành", "Đã duyệt"]:
                if hasattr(payload, 'contract_id') and payload.contract_id is not None:
                    if t.contract_id != payload.contract_id:
                        if t.loai == "Thu":
                            if t.contract_id: FinanceService._sync_receivables(db, t.contract_id, -float(t.so_tien))
                            if payload.contract_id: FinanceService._sync_receivables(db, payload.contract_id, float(t.so_tien))
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
                check_cash_balance(db, new_amount, exclude_transaction_id=t.id)

            if amount_diff != 0:
                calculate_balances(db, t.loai, amount_diff, payload.hinh_thuc)
                if t.loai == "Thu" and t.contract_id:
                    FinanceService._sync_receivables(db, t.contract_id, amount_diff)

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
            target_actor = actor_id or t.nguoi_lap or "Lê Văn Dựng"
            actor_exists = db.query(User.id).filter(User.id == target_actor).first() if target_actor else None
            actor_id_val = target_actor if actor_exists else None

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

    @staticmethod
    def void_cashflow(db: Session, transaction_id: str, reason: str, actor_id: str) -> dict:
        try:
            t = db.query(CashflowTransaction).filter(CashflowTransaction.id == transaction_id).first()
            if not t:
                raise HTTPException(status_code=404, detail="Không tìm thấy phiếu")
            
            if t.trang_thai == "Đã hủy":
                raise HTTPException(status_code=400, detail="Phiếu này đã bị hủy trước đó.")
            
            check_closed_period(db, t.ngay or date.today())
            
            t.trang_thai = "Đã hủy"
            t.voided_reason = reason
            t.voided_at = datetime.now()
            
            # 1. Sync Receivables backward if it was Thu
            if t.loai == "Thu" and t.contract_id:
                FinanceService._sync_receivables(db, t.contract_id, -float(t.so_tien))
            
            # 2. Reverse Entry to correct Running Balance without deleting
            reverse_type = "Chi" if t.loai == "Thu" else "Thu"
            rev_id = FinanceRepository.generate_voucher_id(reverse_type, db)
            bal_tm, bal_ck, bal_sau = calculate_balances(db, reverse_type, float(t.so_tien), t.hinh_thuc)
            
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
            
            target_actor = actor_id or t.nguoi_lap
            actor_exists = db.query(User.id).filter(User.id == target_actor).first() if target_actor else None
            actor_id_val = target_actor if actor_exists else None

            db.add(AuditLog(
                actor_id=actor_id_val,
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

    @staticmethod
    def create_advance(db: Session, payload) -> dict:
        try:
            if payload.payment_method == "Tiền mặt":
                check_cash_balance(db, payload.amount)

            new_id = FinanceRepository.generate_voucher_id("Chi", db)
            bal_tm, bal_ck, bal_sau = calculate_balances(db, "Chi", payload.amount, payload.payment_method)

            proj_label = ""
            if payload.project_id:
                p = db.query(ProjectTask).filter(ProjectTask.id == payload.project_id).first()
                if p: proj_label = f"{p.id} — {p.task_name or ''}"

            tc = CashflowTransaction(
                id=new_id,
                project_id=payload.project_id or None,
                loai="Chi",
                so_tien=payload.amount,
                hang_muc="Chi phí tạm ứng",
                nguoi_nhan_nop=payload.payer_payee,
                hinh_thuc=payload.payment_method,
                ngay=date.today(),
                so_chung_tu=new_id,
                dien_giai=f"Tạm ứng: {payload.note or 'Chi công trường'}",
                du_an_phong_ban=proj_label,
                so_du_sau_gd=bal_sau,
                so_du_tien_mat=bal_tm,
                so_du_ck=bal_ck,
                trang_thai="Hoàn thành"
            )
            db.add(tc)
            db.commit()
            return {"status": "success", "id": tc.id, "category": tc.hang_muc}
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    def clear_advance(db: Session, payload) -> dict:
        try:
            advance = db.query(CashflowTransaction).filter(
                CashflowTransaction.id == payload.advance_id
            ).first()
            if not advance:
                raise HTTPException(status_code=404, detail="Không tìm thấy phiếu tạm ứng")

            if advance.trang_thai == "Đã quyết toán":
                raise HTTPException(status_code=400, detail="Phiếu tạm ứng này đã được quyết toán.")

            adv_amt = float(advance.so_tien or 0)
            actual = payload.actual_amount
            diff = adv_amt - actual  # positive: return to register, negative: company pays employee
            auto_vouchers = []

            # 1. Mark original advance as resolved
            advance.trang_thai = "Đã quyết toán"

            # 2. Create the actual expenditure transaction (Chi, hinh_thuc="Tạm ứng")
            exp_id = FinanceRepository.generate_voucher_id("Chi", db)
            bal_tm, bal_ck, bal_sau = calculate_balances(db, "Chi", 0.0, "Tạm ứng")
            
            actual_exp = CashflowTransaction(
                id=exp_id,
                project_id=advance.project_id,
                contract_id=advance.contract_id,
                loai="Chi",
                so_tien=actual,
                hang_muc="Chi thực tế từ tạm ứng",
                nguoi_nhan_nop=advance.nguoi_nhan_nop,
                hinh_thuc="Tạm ứng",
                ngay=date.today(),
                so_chung_tu=exp_id,
                dien_giai=f"Quyết toán chi thực tế: {payload.note or ''} (gốc: {payload.advance_id})",
                du_an_phong_ban=advance.du_an_phong_ban,
                so_du_sau_gd=bal_sau,
                so_du_tien_mat=bal_tm,
                so_du_ck=bal_ck,
                trang_thai="Hoàn thành"
            )
            db.add(actual_exp)
            auto_vouchers.append({"id": exp_id, "type": "Chi", "amount": actual, "purpose": "Chi thực tế"})

            # 3. Create the return or overspent transaction
            if abs(diff) > 0:
                vtype = "Thu" if diff > 0 else "Chi"
                note_prefix = "Hoàn ứng thừa" if diff > 0 else "Bù ứng thiếu"
                new_id = FinanceRepository.generate_voucher_id(vtype, db)
                bal_tm, bal_ck, bal_sau = calculate_balances(db, vtype, abs(diff), "Tiền mặt")

                tc = CashflowTransaction(
                    id=new_id,
                    project_id=advance.project_id,
                    loai=vtype,
                    so_tien=abs(diff),
                    hang_muc="Quyết toán hoàn ứng",
                    nguoi_nhan_nop=advance.nguoi_nhan_nop,
                    hinh_thuc="Tiền mặt",
                    ngay=date.today(),
                    so_chung_tu=new_id,
                    dien_giai=f"{note_prefix}: {payload.note or ''} (gốc: {payload.advance_id})",
                    du_an_phong_ban=advance.du_an_phong_ban,
                    so_du_sau_gd=bal_sau,
                    so_du_tien_mat=bal_tm,
                    so_du_ck=bal_ck,
                    trang_thai="Hoàn thành"
                )
                db.add(tc)
                auto_vouchers.append({"id": tc.id, "type": vtype, "amount": abs(diff)})

            db.commit()
            return {
                "status": "success", "advance_amount": adv_amt,
                "actual_amount": actual, "difference": diff,
                "auto_vouchers": auto_vouchers
            }
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    def create_worker_wage(db: Session, payload) -> dict:
        try:
            if payload.payment_method == "Tiền mặt":
                check_cash_balance(db, payload.amount)

            new_id = FinanceRepository.generate_voucher_id("Chi", db)
            bal_tm, bal_ck, bal_sau = calculate_balances(db, "Chi", payload.amount, payload.payment_method)

            proj_label = ""
            if payload.project_id:
                p = db.query(ProjectTask).filter(ProjectTask.id == payload.project_id).first()
                if p: proj_label = f"{p.id} — {p.task_name or ''}"

            tc = CashflowTransaction(
                id=new_id,
                project_id=payload.project_id,
                loai="Chi",
                so_tien=payload.amount,
                hang_muc="Lương khoán tổ thợ",
                nguoi_nhan_nop=payload.payer_payee,
                hinh_thuc=payload.payment_method,
                ngay=date.today(),
                so_chung_tu=new_id,
                dien_giai=f"Lương khoán: {payload.note or payload.payer_payee}",
                du_an_phong_ban=proj_label,
                so_du_sau_gd=bal_sau,
                so_du_tien_mat=bal_tm,
                so_du_ck=bal_ck,
                trang_thai="Hoàn thành"
            )
            db.add(tc)
            db.commit()
            return {"status": "success", "id": tc.id}
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    def create_employee(db: Session, payload) -> dict:
        department = validate_employee_payload(payload, db)
        employee = Employee(
            id=f"emp_{uuid.uuid4().hex[:12]}",
            user_id=payload.user_id,
            full_name=payload.full_name,
            department_id=payload.department_id,
            department=department.name if department else None,
            job_title=payload.job_title,
            contract_status=payload.contract_status,
            join_date=payload.join_date or date.today(),
            probation_end_date=payload.probation_end_date,
            base_salary=payload.base_salary,
            is_active=payload.is_active,
        )
        try:
            db.add(employee)
            db.commit()
            db.refresh(employee)
            return serialize_employee(employee, department.name if department else None)
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Không thể tạo nhân sự do dữ liệu liên kết bị trùng hoặc không hợp lệ.",
            ) from exc

    @staticmethod
    def update_employee(db: Session, employee_id: str, payload) -> dict:
        employee = db.query(Employee).filter(Employee.id == employee_id).first()
        if not employee:
            raise HTTPException(status_code=404, detail="Không tìm thấy nhân sự.")

        department = validate_employee_payload(payload, db)
        employee.user_id = payload.user_id
        employee.full_name = payload.full_name
        employee.department_id = payload.department_id
        employee.department = department.name if department else None
        employee.job_title = payload.job_title
        employee.contract_status = payload.contract_status
        employee.join_date = payload.join_date or employee.join_date or date.today()
        employee.probation_end_date = payload.probation_end_date
        employee.base_salary = payload.base_salary
        employee.is_active = payload.is_active
        employee.updated_at = datetime.now(timezone.utc)

        try:
            db.commit()
            db.refresh(employee)
            return serialize_employee(employee, department.name if department else None)
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Không thể cập nhật nhân sự do dữ liệu liên kết không hợp lệ.",
            ) from exc

    @staticmethod
    def delete_employee(db: Session, employee_id: str) -> dict:
        employee = db.query(Employee).filter(Employee.id == employee_id).first()
        if not employee:
            raise HTTPException(status_code=404, detail="Không tìm thấy nhân sự.")

        try:
            db.delete(employee)
            db.commit()
            return {"status": "success", "id": employee_id}
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail=(
                    "Nhân sự đã phát sinh chấm công hoặc bảng lương nên không thể xóa. "
                    "Hãy chuyển trạng thái sang Ngừng hoạt động."
                ),
            ) from exc

    @staticmethod
    def close_fund(db: Session, payload) -> dict:
        try:
            try:
                dt_utc = datetime.fromisoformat(payload.ngay_chot.replace("Z", "+00:00"))
                tz_vietnam = timezone(timedelta(hours=7))
                dt_chot = dt_utc.astimezone(tz_vietnam)
            except ValueError:
                try:
                    dt_chot = datetime.strptime(payload.ngay_chot, "%Y-%m-%d %H:%M:%S")
                    dt_chot = dt_chot.replace(tzinfo=timezone(timedelta(hours=7)))
                except ValueError:
                    raise HTTPException(status_code=400, detail="Định dạng thời gian chốt không hợp lệ. Hãy dùng ISO format.")

            so_du_he_thong = FinanceRepository.get_running_balance(db, payload.hinh_thuc, up_to_datetime=dt_chot)
            chênh_lệch = payload.so_tien_thuc_te - so_du_he_thong
            nguoi_chot = payload.nguoi_chot or "Kế toán"
            
            fob = FundOpeningBalance(
                hinh_thuc=payload.hinh_thuc,
                so_tien_dau_ky=payload.so_tien_thuc_te,
                ngay_ap_dung=dt_chot,
                nguoi_chot=nguoi_chot,
                ghi_chu=payload.ghi_chu
            )
            db.add(fob)
            db.flush()

            if chênh_lệch != 0:
                loai = "Thu" if chênh_lệch > 0 else "Chi"
                hang_muc = "Thu chênh lệch kiểm kê quỹ" if chênh_lệch > 0 else "Chi chênh lệch kiểm kê quỹ"
                new_id = FinanceRepository.generate_voucher_id(loai, db, dt_chot.date())
                
                bal_tm, bal_ck, bal_sau = calculate_balances(db, loai, abs(chênh_lệch), payload.hinh_thuc)
                thoi_gian_phieu = dt_chot - timedelta(seconds=1)
                
                tc = CashflowTransaction(
                    id=new_id,
                    loai=loai,
                    so_tien=abs(chênh_lệch),
                    hang_muc=hang_muc,
                    nguoi_nhan_nop=nguoi_chot,
                    hinh_thuc=payload.hinh_thuc,
                    ngay=dt_chot.date(),
                    created_at=thoi_gian_phieu,
                    so_chung_tu=new_id,
                    dien_giai=f"{hang_muc}: {payload.ghi_chu or ''}",
                    so_du_sau_gd=bal_sau,
                    so_du_tien_mat=bal_tm,
                    so_du_ck=bal_ck,
                    trang_thai="Hoàn thành",
                    scope="Công ty",
                    nguoi_lap=nguoi_chot,
                    nguoi_duyet=nguoi_chot
                )
                db.add(tc)

            db.commit()
            return {"status": "success", "message": "Chốt quỹ thành công!"}
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    def save_settings(db: Session, payload) -> dict:
        try:
            keys_and_values = {
                "initial_cash_balance": payload.initial_cash_balance,
                "initial_bank_balance": payload.initial_bank_balance,
                "initial_total_income": payload.initial_total_income,
                "initial_total_expenditure": payload.initial_total_expenditure
            }
            for k, v in keys_and_values.items():
                setting = db.query(FinanceSetting).filter(FinanceSetting.key == k).first()
                if setting:
                    setting.value = v
                else:
                    db.add(FinanceSetting(key=k, value=v))
            db.commit()
            return {"status": "success", "message": "Cấu hình số dư đầu kỳ đã được cập nhật thành công"}
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    def _sync_receivables(db: Session, contract_id: str, amount: float):
        rec = db.query(Receivable).filter(Receivable.contract_id == contract_id).first()
        if rec:
            rec.paid_amount = float(rec.paid_amount or 0) + amount
            rec.remaining_amount = max(0.0, float(rec.remaining_amount or 0) - amount)
        else:
            c = db.query(Contract).filter(Contract.id == contract_id).first()
            total = float(c.total_value or 0) if c else 0.0
            due_date_val = c.date_signed + timedelta(days=30) if c and c.date_signed else None
            db.add(Receivable(
                contract_id=contract_id,
                paid_amount=amount,
                remaining_amount=max(0.0, total - amount),
                due_date=due_date_val
            ))
