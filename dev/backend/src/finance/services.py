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
    ServiceLine, Employee, AuditLog, User, FinanceSetting, FundOpeningBalance
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
            if payload.transaction_date:
                try:
                    parsed_date = datetime.strptime(payload.transaction_date, "%Y-%m-%d").date()
                except ValueError:
                    pass

            category_code = payload.category if not getattr(payload, 'description', None) else payload.category
            description = payload.description if getattr(payload, 'description', None) else ""
            if not description:
                parts = payload.category.split(': ', 1)
                if len(parts) == 2:
                    category_code, description = parts

            # 1. Check closed period
            check_closed_period(db, parsed_date)

            # 2. Check sensitive category (thụ lý bản vẽ)
            if "thụ lý bản vẽ" in category_code.lower():
                if not payload.contract_id and not payload.project_id:
                    raise HTTPException(
                        status_code=400,
                        detail="Hạng mục Chi thụ lý bản vẽ bắt buộc phải liên kết Hợp đồng hoặc Hồ sơ/Dự án."
                    )

            # 3. Check cash balance for "EXPENSE" and "CASH"
            if payload.type == "EXPENSE" and payload.payment_method == "CASH":
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
            if payload.type == "INCOME" and contract_id:
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
                if kw in category_code.lower() or kw in description.lower():
                    is_operational = True
                    break

            if is_operational:
                project_id = None
            else:
                if contract_id and not project_id:
                    p = db.query(ServiceLine).filter(ServiceLine.contract_id == contract_id).first()
                    if p:
                        project_id = p.id

            # 7. Approval Workflow Status
            status = payload.status or "COMPLETED"
            creator = payload.created_by_user_id or actor_id or "Lê Văn Dựng"
            approver = payload.approved_by_user_id or "Lê Văn Dựng"
            if creator != approver:
                status = "PENDING"

            new_id = FinanceRepository.generate_voucher_id(payload.type, db, parsed_date)
            bal_tm, bal_ck, bal_sau = calculate_balances(db, payload.type, payload.amount, payload.payment_method)
            
            proj_label = ""
            if project_id:
                p = db.query(ServiceLine).filter(ServiceLine.id == project_id).first()
                if p: proj_label = f"{p.id} — {p.service_type or ''}"

            tc = CashflowTransaction(
                id=new_id,
                project_id=project_id,
                contract_id=contract_id,
                transaction_type=payload.type,
                amount=payload.amount,
                category_code=category_code,
                payer_payee_name=payload.payer_payee,
                payment_method=payload.payment_method,
                transaction_date=parsed_date,
                document_number=new_id,
                description=description,
                department_code=payload.department_code or proj_label,
                balance_after=bal_sau,
                cash_balance_after=bal_tm,
                bank_balance_after=bal_ck,
                created_by_user_id=creator,
                approved_by_user_id=approver,
                status=status,
                scope=payload.scope or "INTERNAL"
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
                        "payer_payee_name": tc.payer_payee_name,
                        "amount": float(tc.amount),
                        "transaction_type": tc.transaction_type,
                        "category_code": tc.category_code
                    }
                }
            ))

            if payload.type == "INCOME" and contract_id:
                FinanceService._sync_receivables(db, contract_id, payload.amount)
                
            db.commit()
            return {"status": "success", "id": tc.id, "transaction_type": payload.type}
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

            parsed_date = t.transaction_date
            if payload.transaction_date:
                try:
                    parsed_date = datetime.strptime(payload.transaction_date, "%Y-%m-%d").date()
                except ValueError:
                    pass

            check_closed_period(db, t.transaction_date or date.today())
            if parsed_date and parsed_date != t.transaction_date:
                check_closed_period(db, parsed_date)
            
            if t.status in ["COMPLETED", "APPROVED"]:
                if hasattr(payload, 'contract_id') and payload.contract_id is not None:
                    if t.contract_id != payload.contract_id:
                        if t.transaction_type == "INCOME":
                            if t.contract_id: FinanceService._sync_receivables(db, t.contract_id, -float(t.amount))
                            if payload.contract_id: FinanceService._sync_receivables(db, payload.contract_id, float(t.amount))
                        t.contract_id = payload.contract_id
                        db.commit()
                        return {"status": "success", "message": "Đã cập nhật hợp đồng"}
                    return {"status": "success", "message": "Không thay đổi gì"}
                raise HTTPException(status_code=400, detail="Phiếu đã hoàn thành, không thể sửa số tiền/thông tin khác")

            # 1. Validate sensitive category
            if "thụ lý bản vẽ" in payload.category_code.lower():
                if not payload.contract_id and not t.project_id:
                    raise HTTPException(
                        status_code=400,
                        detail="Hạng mục Chi thụ lý bản vẽ bắt buộc phải liên kết Hợp đồng hoặc Hồ sơ/Dự án."
                    )

            old_amount = float(t.amount)
            new_amount = float(payload.amount)
            amount_diff = new_amount - old_amount
            
            # 2. Check cash balance
            if t.transaction_type == "EXPENSE" and payload.payment_method == "CASH":
                check_cash_balance(db, new_amount, exclude_transaction_id=t.id)

            if amount_diff != 0:
                calculate_balances(db, t.transaction_type, amount_diff, payload.payment_method)
                if t.transaction_type == "INCOME" and t.contract_id:
                    FinanceService._sync_receivables(db, t.contract_id, amount_diff)

            t.category_code = payload.category_code
            t.payer_payee_name = payload.payer_payee_name
            t.payment_method = payload.payment_method
            t.amount = new_amount
            t.description = payload.description
            t.contract_id = payload.contract_id or None
            if payload.scope:
                t.scope = payload.scope
            t.transaction_date = parsed_date

            # Create audit log
            target_actor = actor_id or t.created_by_user_id or "Lê Văn Dựng"
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
                        "description": payload.description
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
            
            if t.status == "CANCELLED":
                raise HTTPException(status_code=400, detail="Phiếu này đã bị hủy trước đó.")
            
            check_closed_period(db, t.transaction_date or date.today())
            
            t.status = "CANCELLED"
            t.cancellation_reason = reason
            t.cancelled_at = datetime.now()
            
            # 1. Sync Receivables backward if it was INCOME
            if t.transaction_type == "INCOME" and t.contract_id:
                FinanceService._sync_receivables(db, t.contract_id, -float(t.amount))
            
            # 2. Reverse Entry to correct Running Balance without deleting
            reverse_type = "EXPENSE" if t.transaction_type == "INCOME" else "INCOME"
            rev_id = FinanceRepository.generate_voucher_id(reverse_type, db)
            bal_tm, bal_ck, bal_sau = calculate_balances(db, reverse_type, float(t.amount), t.payment_method)
            
            reverse_tc = CashflowTransaction(
                id=rev_id,
                project_id=t.project_id,
                contract_id=t.contract_id,
                transaction_type=reverse_type,
                amount=t.amount,
                category_code="Hoàn tác (Hủy phiếu)",
                payer_payee_name=t.payer_payee_name,
                payment_method=t.payment_method,
                transaction_date=date.today(),
                document_number=rev_id,
                description=f"Hủy tự động cho phiếu gốc: {t.id} - Lý do: {reason}",
                department_code=t.department_code,
                balance_after=bal_sau,
                cash_balance_after=bal_tm,
                bank_balance_after=bal_ck,
                created_by_user_id=actor_id,
                status="COMPLETED",
                scope=t.scope
            )
            db.add(reverse_tc)
            
            target_actor = actor_id or t.created_by_user_id
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
            if payload.payment_method == "CASH":
                check_cash_balance(db, payload.amount)

            new_id = FinanceRepository.generate_voucher_id("EXPENSE", db)
            bal_tm, bal_ck, bal_sau = calculate_balances(db, "EXPENSE", payload.amount, payload.payment_method)

            proj_label = ""
            if payload.project_id:
                p = db.query(ServiceLine).filter(ServiceLine.id == payload.project_id).first()
                if p: proj_label = f"{p.id} — {p.service_type or ''}"

            tc = CashflowTransaction(
                id=new_id,
                project_id=payload.project_id or None,
                transaction_type="EXPENSE",
                amount=payload.amount,
                category_code="Chi phí tạm ứng",
                payer_payee_name=payload.payer_payee,
                payment_method=payload.payment_method,
                transaction_date=date.today(),
                document_number=new_id,
                description=f"Tạm ứng: {payload.note or 'Chi công trường'}",
                department_code=proj_label,
                balance_after=bal_sau,
                cash_balance_after=bal_tm,
                bank_balance_after=bal_ck,
                status="COMPLETED"
            )
            db.add(tc)
            db.commit()
            return {"status": "success", "id": tc.id, "category_code": tc.category_code}
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

            if advance.status == "COMPLETED":
                raise HTTPException(status_code=400, detail="Phiếu tạm ứng này đã được quyết toán.")

            adv_amt = float(advance.amount or 0)
            actual = payload.actual_amount
            diff = adv_amt - actual  # positive: return to register, negative: company pays employee
            auto_vouchers = []

            # 1. Mark original advance as resolved
            advance.status = "COMPLETED"

            # 2. Create the actual expenditure transaction
            exp_id = FinanceRepository.generate_voucher_id("EXPENSE", db)
            bal_tm, bal_ck, bal_sau = calculate_balances(db, "EXPENSE", 0.0, "OTHER")
            
            actual_exp = CashflowTransaction(
                id=exp_id,
                project_id=advance.project_id,
                contract_id=advance.contract_id,
                transaction_type="EXPENSE",
                amount=actual,
                category_code="Chi thực tế từ tạm ứng",
                payer_payee_name=advance.payer_payee_name,
                payment_method="OTHER",
                transaction_date=date.today(),
                document_number=exp_id,
                description=f"Quyết toán chi thực tế: {payload.note or ''} (gốc: {payload.advance_id})",
                department_code=advance.department_code,
                balance_after=bal_sau,
                cash_balance_after=bal_tm,
                bank_balance_after=bal_ck,
                status="COMPLETED"
            )
            db.add(actual_exp)
            auto_vouchers.append({"id": exp_id, "transaction_type": "EXPENSE", "amount": actual, "purpose": "Chi thực tế"})

            # 3. Create the return or overspent transaction
            if abs(diff) > 0:
                vtype = "INCOME" if diff > 0 else "EXPENSE"
                note_prefix = "Hoàn ứng thừa" if diff > 0 else "Bù ứng thiếu"
                new_id = FinanceRepository.generate_voucher_id(vtype, db)
                bal_tm, bal_ck, bal_sau = calculate_balances(db, vtype, abs(diff), "CASH")

                tc = CashflowTransaction(
                    id=new_id,
                    project_id=advance.project_id,
                    transaction_type=vtype,
                    amount=abs(diff),
                    category_code="Quyết toán hoàn ứng",
                    payer_payee_name=advance.payer_payee_name,
                    payment_method="CASH",
                    transaction_date=date.today(),
                    document_number=new_id,
                    description=f"{note_prefix}: {payload.note or ''} (gốc: {payload.advance_id})",
                    department_code=advance.department_code,
                    balance_after=bal_sau,
                    cash_balance_after=bal_tm,
                    bank_balance_after=bal_ck,
                    status="COMPLETED"
                )
                db.add(tc)
                auto_vouchers.append({"id": tc.id, "transaction_type": vtype, "amount": abs(diff)})

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
            if payload.payment_method == "CASH":
                check_cash_balance(db, payload.amount)

            new_id = FinanceRepository.generate_voucher_id("EXPENSE", db)
            bal_tm, bal_ck, bal_sau = calculate_balances(db, "EXPENSE", payload.amount, payload.payment_method)

            proj_label = ""
            if payload.project_id:
                p = db.query(ServiceLine).filter(ServiceLine.id == payload.project_id).first()
                if p: proj_label = f"{p.id} — {p.service_type or ''}"

            tc = CashflowTransaction(
                id=new_id,
                project_id=payload.project_id,
                transaction_type="EXPENSE",
                amount=payload.amount,
                category_code="Lương khoán tổ thợ",
                payer_payee_name=payload.payer_payee,
                payment_method=payload.payment_method,
                transaction_date=date.today(),
                document_number=new_id,
                description=f"Lương khoán: {payload.note or payload.payer_payee}",
                department_code=proj_label,
                balance_after=bal_sau,
                cash_balance_after=bal_tm,
                bank_balance_after=bal_ck,
                status="COMPLETED"
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
                dt_utc = datetime.fromisoformat(payload.close_datetime.replace("Z", "+00:00"))
                tz_vietnam = timezone(timedelta(hours=7))
                dt_chot = dt_utc.astimezone(tz_vietnam)
            except ValueError:
                try:
                    dt_chot = datetime.strptime(payload.close_datetime, "%Y-%m-%d %H:%M:%S")
                    dt_chot = dt_chot.replace(tzinfo=timezone(timedelta(hours=7)))
                except ValueError:
                    raise HTTPException(status_code=400, detail="Định dạng thời gian chốt không hợp lệ. Hãy dùng ISO format.")

            system_balance = FinanceRepository.get_running_balance(db, payload.payment_method, up_to_datetime=dt_chot)
            difference = payload.actual_amount - system_balance
            closed_by = payload.closed_by or "Kế toán"
            
            # Map English payment method back to Vietnamese for FundOpeningBalance (not migrated)
            fob_hinh_thuc = "Tiền mặt" if payload.payment_method == "CASH" else "Chuyển khoản"
            
            fob = FundOpeningBalance(
                hinh_thuc=fob_hinh_thuc,
                so_tien_dau_ky=payload.actual_amount,
                ngay_ap_dung=dt_chot,
                nguoi_chot=closed_by,
                ghi_chu=payload.notes
            )
            db.add(fob)
            db.flush()

            if difference != 0:
                tx_type = "INCOME" if difference > 0 else "EXPENSE"
                category_code = "Thu chênh lệch kiểm kê quỹ" if difference > 0 else "Chi chênh lệch kiểm kê quỹ"
                new_id = FinanceRepository.generate_voucher_id(tx_type, db, dt_chot.date())
                
                bal_tm, bal_ck, bal_sau = calculate_balances(db, tx_type, abs(difference), payload.payment_method)
                thoi_gian_phieu = dt_chot - timedelta(seconds=1)
                
                tc = CashflowTransaction(
                    id=new_id,
                    transaction_type=tx_type,
                    amount=abs(difference),
                    category_code=category_code,
                    payer_payee_name=closed_by,
                    payment_method=payload.payment_method,
                    transaction_date=dt_chot.date(),
                    created_at=thoi_gian_phieu,
                    document_number=new_id,
                    description=f"{category_code}: {payload.notes or ''}",
                    balance_after=bal_sau,
                    cash_balance_after=bal_tm,
                    bank_balance_after=bal_ck,
                    status="COMPLETED",
                    scope="INTERNAL",
                    created_by_user_id=closed_by,
                    approved_by_user_id=closed_by
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
