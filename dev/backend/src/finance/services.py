import logging
import uuid
from datetime import datetime, date, timezone, timedelta
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Optional
from types import SimpleNamespace

logger = logging.getLogger(__name__)

from src.db.models import (
    CashflowTransaction, Contract, Customer, Receivable,
    ServiceLine, Employee, AuditLog, User, FinanceSetting, FundOpeningBalance, PayrollPeriod
)
from src.finance.repository import FinanceRepository
from src.finance.domain_rules import (
    check_closed_period, check_cash_balance, validate_contract,
    validate_project, validate_employee_payload, parse_category, calculate_balances
)
from src.finance.serializers import serialize_employee
from src.core.audit import log_action
from src.contracts.read_model import sync_contract_read_model_after_write
from src.config.company_identity import COMPANY_REPRESENTATIVE

# Chỉ phiếu đã duyệt mới được tính vào công nợ. Phiếu đang chờ duyệt không
# đụng tới sổ nợ — nếu không, nhân viên gõ một phiếu khống là công nợ tự biến mất
# mà chưa ai phê duyệt.
APPROVED_TX_STATUSES = {"Hoàn thành", "Đã duyệt", "COMPLETED", "approved"}
PENDING_TX_STATUSES = {"Chờ duyệt", "PENDING", "pending"}
# Hai bộ giá trị vì dữ liệu cũ dùng tiếng Anh, dữ liệu mới dùng tiếng Việt.
INCOME_TX_TYPES = {"Thu", "INCOME"}


def counts_toward_receivable(status: Optional[str], tx_type: Optional[str]) -> bool:
    """Phiếu này có được trừ vào công nợ hợp đồng không."""
    return (tx_type in INCOME_TX_TYPES) and (status in APPROVED_TX_STATUSES)


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

            category = payload.category if not getattr(payload, 'description', None) else payload.category
            desc = payload.description if getattr(payload, 'description', None) else ""
            if not desc:
                parts = payload.category.split(': ', 1)
                if len(parts) == 2:
                    category, desc = parts

            # 1. Check closed period
            check_closed_period(db, parsed_date)

            # 2. Check sensitive category (thụ lý bản vẽ)
            if "thụ lý bản vẽ" in category.lower():
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

            # 5. Thu tiền hợp đồng phải đi đường có bill.
            # Màn Thu công nợ bắt buộc đính ảnh bill/biên lai; phiếu thu ở Sổ quỹ
            # thì không có ô nào để đính. Để hở cả hai đường nghĩa là ai muốn né
            # phần chứng từ chỉ cần lập phiếu bên Sổ quỹ — chặt một chỗ mà lỏng
            # chỗ kia thì coi như không chặt. Khoản không gắn hợp đồng (lãi ngân
            # hàng, thu khác…) vẫn lập bình thường ở đây.
            if payload.type in INCOME_TX_TYPES and contract_id:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Thu tiền của hợp đồng phải ghi ở màn Thu công nợ để đính bill/biên lai. "
                        "Phiếu thu ở Sổ quỹ chỉ dùng cho khoản không gắn hợp đồng."
                    ),
                )

            # (Ngưỡng công nợ của thu tiền hợp đồng nay do màn Thu công nợ kiểm —
            #  xem `_ghi_nhan_thu_tien` trong dossiers/handover.py. Ở đây không
            #  còn đường vào nào cho thu tiền gắn hợp đồng nữa.)

            # 7. Project vs Non-project classification of project_id
            is_operational = False
            operational_expense_keywords = ["văn phòng phẩm", "tiếp khách", "điện nước", "bảo hiểm", "công tác phí", "shipper", "vận hành", "quản lý"]
            for kw in operational_expense_keywords:
                if kw in category.lower() or kw in desc.lower():
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
            tx_status = payload.status or "Hoàn thành"
            creator = payload.created_by or actor_id or COMPANY_REPRESENTATIVE
            approver = payload.approved_by or COMPANY_REPRESENTATIVE
            if creator != approver:
                tx_status = "Chờ duyệt"

            new_id = FinanceRepository.generate_voucher_id(payload.type, db, parsed_date)
            bal_tm, bal_ck, bal_sau = calculate_balances(db, payload.type, payload.amount, payload.payment_method)
            
            proj_label = ""
            if project_id:
                p = db.query(ServiceLine).filter(ServiceLine.id == project_id).first()
                if p:
                    if p.contract_id:
                        proj_label = f"HĐ {p.contract_id} — {p.service_type or 'Dự án'}"
                    else:
                        proj_label = p.service_type or "Dự án đo đạc"

            tc = CashflowTransaction(
                id=new_id,
                project_id=project_id,
                contract_id=contract_id,
                transaction_type=payload.type,
                amount=payload.amount,
                category_code=category,
                payer_payee_name=payload.payer_payee,
                payment_method=payload.payment_method,
                transaction_date=parsed_date,
                document_number=new_id,
                description=desc,
                department_code=payload.department_code or proj_label,
                balance_after=bal_sau,
                cash_balance_after=bal_tm,
                bank_balance_after=bal_ck,
                created_by_user_id=creator,
                approved_by_user_id=approver,
                status=tx_status,
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
                        "partner": tc.payer_payee_name or "",
                        "amount": float(tc.amount),
                        "type": tc.transaction_type,
                        "category": tc.category_code
                    }
                }
            ))

            # Chỉ trừ công nợ khi phiếu đã duyệt. Phiếu "Chờ duyệt" phải đợi
            # giám đốc bấm duyệt thì mới ghi nhận (xem approve_cashflow).
            if counts_toward_receivable(tx_status, payload.type) and contract_id:
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

            parsed_date = t.transaction_date
            if payload.transaction_date:
                try:
                    parsed_date = datetime.strptime(payload.transaction_date, "%Y-%m-%d").date()
                except ValueError:
                    pass

            check_closed_period(db, t.transaction_date or date.today())
            if parsed_date and parsed_date != t.transaction_date:
                check_closed_period(db, parsed_date)
            
            if t.status in APPROVED_TX_STATUSES:
                if hasattr(payload, 'contract_id') and payload.contract_id is not None:
                    if t.contract_id != payload.contract_id:
                        if t.transaction_type in INCOME_TX_TYPES:
                            if t.contract_id: FinanceService._sync_receivables(db, t.contract_id, -float(t.amount))
                            if payload.contract_id: FinanceService._sync_receivables(db, payload.contract_id, float(t.amount))
                        t.contract_id = payload.contract_id
                        db.commit()
                        return {"status": "success", "message": "Đã cập nhật hợp đồng"}
                    return {"status": "success", "message": "Không thay đổi gì"}
                raise HTTPException(status_code=400, detail="Phiếu đã hoàn thành, không thể sửa số tiền/thông tin khác")

            # 1. Validate sensitive category
            if "thụ lý bản vẽ" in payload.category.lower():
                if not payload.contract_id and not t.project_id:
                    raise HTTPException(
                        status_code=400,
                        detail="Hạng mục Chi thụ lý bản vẽ bắt buộc phải liên kết Hợp đồng hoặc Hồ sơ/Dự án."
                    )

            old_amount = float(t.amount)
            new_amount = float(payload.amount)
            amount_diff = new_amount - old_amount
            
            # 2. Check cash balance
            if t.transaction_type == "Chi" and payload.payment_method == "Tiền mặt":
                check_cash_balance(db, new_amount, exclude_transaction_id=t.id)

            if amount_diff != 0:
                calculate_balances(db, t.transaction_type, amount_diff, payload.payment_method)
                # Phiếu chưa duyệt chưa từng được cộng vào công nợ nên cũng không
                # có gì để điều chỉnh; số tiền cuối cùng sẽ được ghi nhận lúc duyệt.
                if counts_toward_receivable(t.status, t.transaction_type) and t.contract_id:
                    FinanceService._sync_receivables(db, t.contract_id, amount_diff)

            t.category_code = payload.category
            t.payer_payee_name = payload.payer_payee
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
            
            if t.status == "Đã hủy":
                raise HTTPException(status_code=400, detail="Phiếu này đã bị hủy trước đó.")
            
            check_closed_period(db, t.transaction_date or date.today())

            # Phải nhớ trạng thái trước khi ghi đè, vì việc hoàn công nợ phụ thuộc
            # vào chuyện phiếu ĐÃ từng được tính hay chưa.
            was_counted = counts_toward_receivable(t.status, t.transaction_type)

            t.status = "Đã hủy"
            t.cancellation_reason = reason
            t.cancelled_at = datetime.now()

            # 1. Hoàn lại công nợ — chỉ khi phiếu này thực sự đã được trừ trước đó.
            # Huỷ một phiếu còn "Chờ duyệt" mà vẫn cộng ngược sẽ thổi phồng công nợ.
            if was_counted and t.contract_id:
                FinanceService._sync_receivables(db, t.contract_id, -float(t.amount))
            
            # 2. Reverse Entry to correct Running Balance without deleting
            reverse_type = "Chi" if t.transaction_type == "Thu" else "Thu"
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
                status="Hoàn thành",
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
    def create_advance(db: Session, payload, actor_id: Optional[str] = None) -> dict:
        try:
            if payload.payment_method == "Tiền mặt":
                check_cash_balance(db, payload.amount)

            new_id = FinanceRepository.generate_voucher_id("Chi", db)
            bal_tm, bal_ck, bal_sau = calculate_balances(db, "Chi", payload.amount, payload.payment_method)

            proj_label = ""
            if getattr(payload, 'project_id', None):
                p = db.query(ServiceLine).filter(ServiceLine.id == payload.project_id).first()
                if p:
                    proj_label = f"HĐ {p.contract_id} — {p.service_type or 'Dự án'}" if p.contract_id else (p.service_type or "Dự án đo đạc")

            contract_id = getattr(payload, 'contract_id', None)
            if not contract_id and getattr(payload, 'project_id', None):
                p = db.query(ServiceLine).filter(ServiceLine.id == payload.project_id).first()
                if p: contract_id = p.contract_id

            creator = actor_id or getattr(payload, 'created_by', None) or COMPANY_REPRESENTATIVE
            tx_status = getattr(payload, 'status', None) or "Chờ duyệt"

            tc = CashflowTransaction(
                id=new_id,
                project_id=getattr(payload, 'project_id', None) or None,
                contract_id=contract_id,
                transaction_type="Chi",
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
                created_by_user_id=creator,
                status=tx_status
            )
            db.add(tc)

            log_action(
                db=db,
                actor_id=actor_id,
                action="CREATE_ADVANCE",
                object_type="CashflowTransaction",
                payload={"id": tc.id, "amount": float(tc.amount), "payer_payee": tc.payer_payee_name, "status": tc.status}
            )

            db.commit()
            return {"status": "success", "id": tc.id, "category": tc.category_code, "advance_status": tc.status}
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

            if advance.status == "Đã quyết toán":
                raise HTTPException(status_code=400, detail="Phiếu tạm ứng này đã được quyết toán.")

            adv_amt = float(advance.amount or 0)
            actual = payload.actual_amount
            diff = adv_amt - actual  # positive: return to register, negative: company pays employee
            auto_vouchers = []

            # 1. Mark original advance as resolved
            advance.status = "Đã quyết toán"

            # 2. Create the actual expenditure transaction
            exp_id = FinanceRepository.generate_voucher_id("Chi", db)
            bal_tm, bal_ck, bal_sau = calculate_balances(db, "Chi", 0.0, "Tạm ứng")
            
            actual_exp = CashflowTransaction(
                id=exp_id,
                project_id=advance.project_id,
                contract_id=advance.contract_id,
                transaction_type="Chi",
                amount=actual,
                category_code="Chi thực tế từ tạm ứng",
                payer_payee_name=advance.payer_payee_name,
                payment_method="Tạm ứng",
                transaction_date=date.today(),
                document_number=exp_id,
                description=f"Quyết toán chi thực tế: {payload.note or ''} (gốc: {payload.advance_id})",
                department_code=advance.department_code,
                balance_after=bal_sau,
                cash_balance_after=bal_tm,
                bank_balance_after=bal_ck,
                status="Hoàn thành"
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
                    transaction_type=vtype,
                    amount=abs(diff),
                    category_code="Quyết toán hoàn ứng",
                    payer_payee_name=advance.payer_payee_name,
                    payment_method="Tiền mặt",
                    transaction_date=date.today(),
                    document_number=new_id,
                    description=f"{note_prefix}: {payload.note or ''} (gốc: {payload.advance_id})",
                    department_code=advance.department_code,
                    balance_after=bal_sau,
                    cash_balance_after=bal_tm,
                    bank_balance_after=bal_ck,
                    status="Hoàn thành"
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
                p = db.query(ServiceLine).filter(ServiceLine.id == payload.project_id).first()
                if p:
                    proj_label = f"HĐ {p.contract_id} — {p.service_type or 'Dự án'}" if p.contract_id else (p.service_type or "Dự án đo đạc")

            tc = CashflowTransaction(
                id=new_id,
                project_id=payload.project_id,
                transaction_type="Chi",
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
                status="Hoàn thành"
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
            email=payload.email,
            phone=payload.phone,
            gender=payload.gender,
            date_of_birth=payload.date_of_birth,
            place_of_birth=payload.place_of_birth,
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

        allowed_fields = {
            "full_name", "department_id", "job_title", "contract_status",
            "join_date", "probation_end_date", "base_salary", "is_active",
            "email", "phone", "gender", "date_of_birth", "place_of_birth",
        }
        updates = {
            field: value
            for field, value in payload.model_dump(exclude_unset=True).items()
            if field in allowed_fields
        }
        validation_payload = SimpleNamespace(
            join_date=updates.get("join_date", employee.join_date),
            probation_end_date=updates.get("probation_end_date", employee.probation_end_date),
            department_id=updates.get("department_id", employee.department_id),
            user_id=None,
        )
        department = validate_employee_payload(validation_payload, db)

        for field, value in updates.items():
            setattr(employee, field, value)
        if "department_id" in updates:
            employee.department = department.name if department else None
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
    def set_employee_avatar(db: Session, employee_id: str, avatar_url: str) -> dict:
        employee = db.query(Employee).filter(Employee.id == employee_id).first()
        if not employee:
            raise HTTPException(status_code=404, detail="Không tìm thấy nhân sự.")
        employee.avatar_url = avatar_url
        employee.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(employee)
        return serialize_employee(employee)

    @staticmethod
    def close_fund(db: Session, payload) -> dict:
        try:
            try:
                dt_utc = datetime.fromisoformat(payload.closing_date.replace("Z", "+00:00"))
                tz_vietnam = timezone(timedelta(hours=7))
                closing_moment = dt_utc.astimezone(tz_vietnam)
            except ValueError:
                try:
                    closing_moment = datetime.strptime(payload.closing_date, "%Y-%m-%d %H:%M:%S")
                    closing_moment = closing_moment.replace(tzinfo=timezone(timedelta(hours=7)))
                except ValueError:
                    raise HTTPException(status_code=400, detail="Định dạng thời gian chốt không hợp lệ. Hãy dùng ISO format.")

            system_balance = FinanceRepository.get_running_balance(db, payload.payment_method, up_to_datetime=closing_moment)
            difference = payload.actual_amount - system_balance
            closing_user_name = payload.closing_user or "Kế toán"
            
            fob = FundOpeningBalance(
                payment_method=payload.payment_method,
                opening_balance=payload.actual_amount,
                effective_date=closing_moment,
                closing_user=closing_user_name,
                notes=payload.notes
            )
            db.add(fob)
            db.flush()

            if difference != 0:
                tx_type = "Thu" if difference > 0 else "Chi"
                category = "Thu chênh lệch kiểm kê quỹ" if difference > 0 else "Chi chênh lệch kiểm kê quỹ"
                new_id = FinanceRepository.generate_voucher_id(tx_type, db, closing_moment.date())
                
                bal_tm, bal_ck, bal_sau = calculate_balances(db, tx_type, abs(difference), payload.payment_method)
                voucher_time = closing_moment - timedelta(seconds=1)
                
                tc = CashflowTransaction(
                    id=new_id,
                    transaction_type=tx_type,
                    amount=abs(difference),
                    category_code=category,
                    payer_payee_name=closing_user_name,
                    payment_method=payload.payment_method,
                    transaction_date=closing_moment.date(),
                    created_at=voucher_time,
                    document_number=new_id,
                    description=f"{category}: {payload.notes or ''}",
                    balance_after=bal_sau,
                    cash_balance_after=bal_tm,
                    bank_balance_after=bal_ck,
                    status="Hoàn thành",
                    scope="Công ty",
                    created_by_user_id=closing_user_name,
                    approved_by_user_id=closing_user_name
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
            if payload.expense_approval_threshold is not None:
                keys_and_values["expense_approval_threshold"] = payload.expense_approval_threshold
            if payload.advance_admin_threshold is not None:
                keys_and_values["advance_admin_threshold"] = payload.advance_admin_threshold

            for k, v in keys_and_values.items():
                if v is not None:
                    setting = db.query(FinanceSetting).filter(FinanceSetting.key == k).first()
                    if setting:
                        setting.value = v
                    else:
                        db.add(FinanceSetting(key=k, value=v))
            db.commit()
            return {"status": "success", "message": "Cấu hình tài chính đã được cập nhật thành công"}
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    def _sync_receivables(db: Session, contract_id: str, amount: float):
        c = db.query(Contract).filter(Contract.id == contract_id).first()
        total = float(c.total_value or 0) if c else 0.0

        rec = db.query(Receivable).filter(Receivable.contract_id == contract_id).first()
        if rec:
            rec.paid_amount = max(0.0, float(rec.paid_amount or 0) + amount)
            # Số còn lại luôn suy ra từ giá trị hợp đồng, không trừ dần vào chính nó.
            # Trừ dần thì mỗi lần hoàn tác lại lệch thêm một ít và không bao giờ khớp lại.
            rec.remaining_amount = max(0.0, total - float(rec.paid_amount or 0))
        else:
            paid = max(0.0, amount)
            due_date_val = c.date_signed + timedelta(days=30) if c and c.date_signed else None
            db.add(Receivable(
                contract_id=contract_id,
                paid_amount=paid,
                remaining_amount=max(0.0, total - paid),
                due_date=due_date_val
            ))

    @staticmethod
    def approve_cashflow(db: Session, transaction_id: str, actor_id: str) -> dict:
        """Giám đốc duyệt phiếu. ĐÂY là lúc công nợ mới thực sự được ghi nhận."""
        try:
            t = db.query(CashflowTransaction).filter(CashflowTransaction.id == transaction_id).first()
            if not t:
                raise HTTPException(status_code=404, detail="Không tìm thấy phiếu")
            if t.status in APPROVED_TX_STATUSES:
                raise HTTPException(status_code=400, detail="Phiếu này đã được duyệt rồi")
            if t.status not in PENDING_TX_STATUSES:
                raise HTTPException(status_code=400, detail=f"Phiếu đang ở trạng thái '{t.status}', không duyệt được")

            check_closed_period(db, t.transaction_date or date.today())

            t.status = "Hoàn thành"
            t.approved_by_user_id = actor_id
            t.approved_at = datetime.now(timezone.utc)

            if t.contract_id:
                cat_desc = f"{t.category_code or ''} {t.description or ''}".lower()
                if counts_toward_receivable(t.status, t.transaction_type):
                    FinanceService._sync_receivables(db, t.contract_id, float(t.amount))
                elif (t.transaction_type in {"Chi", "EXPENSE"}) and any(k in cat_desc for k in ["hoàn", "refund", "trả lại"]):
                    FinanceService._sync_receivables(db, t.contract_id, -float(t.amount))

            log_action(
                db=db,
                actor_id=actor_id,
                action="APPROVE",
                object_type="CashflowTransaction",
                payload={"id": t.id, "amount": float(t.amount), "type": t.transaction_type, "status": "Hoàn thành"}
            )

            db.commit()
            sync_contract_read_model_after_write(db)
            return {"status": "success", "id": t.id, "new_status": t.status}
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    def reject_cashflow(db: Session, transaction_id: str, reason: str, actor_id: str) -> dict:
        """Giám đốc từ chối phiếu chờ duyệt. Không đụng công nợ vì phiếu chưa từng được tính."""
        if not (reason or "").strip():
            raise HTTPException(status_code=400, detail="Phải ghi lý do từ chối")
        try:
            t = db.query(CashflowTransaction).filter(CashflowTransaction.id == transaction_id).first()
            if not t:
                raise HTTPException(status_code=404, detail="Không tìm thấy phiếu")
            if t.status not in PENDING_TX_STATUSES:
                raise HTTPException(status_code=400, detail=f"Chỉ từ chối được phiếu đang chờ duyệt (hiện: '{t.status}')")

            t.status = "Từ chối"
            t.cancellation_reason = reason
            t.cancelled_at = datetime.now(timezone.utc)

            log_action(
                db=db,
                actor_id=actor_id,
                action="REJECT",
                object_type="CashflowTransaction",
                payload={"id": t.id, "reason": reason, "status": "Từ chối"}
            )

            db.commit()
            sync_contract_read_model_after_write(db)
            return {"status": "success", "id": t.id, "new_status": t.status}
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    def list_payroll_periods(db: Session) -> list:
        """Liệt kê tất cả các kỳ lương kèm trạng thái (Open, Locked, Paid)."""
        # Ensure current month period exists
        try:
            today = date.today()
            FinanceService.get_or_create_payroll_period(db, today)
        except Exception:
            pass

        periods = db.query(PayrollPeriod).order_by(PayrollPeriod.period_month.desc()).all()
        result = []
        for p in periods:
            result.append({
                "id": p.id,
                "period_month": str(p.period_month) if p.period_month else "",
                "status": p.status or "Open",
                "locked_at": p.locked_at.isoformat() if p.locked_at else None,
                "locked_by_user_id": p.locked_by_user_id,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
            })
        return result

    @staticmethod
    def get_or_create_payroll_period(db: Session, period_date: date) -> PayrollPeriod:
        """Lấy hoặc tạo mới kỳ lương tháng."""
        month_start = period_date.replace(day=1)
        period = db.query(PayrollPeriod).filter(PayrollPeriod.period_month == month_start).first()
        if not period:
            period = PayrollPeriod(
                id=f"pp_{uuid.uuid4().hex[:10]}",
                period_month=month_start,
                status="Open",
            )
            db.add(period)
            db.commit()
            db.refresh(period)
        return period

    @staticmethod
    def _resolve_payroll_period(db: Session, period_identifier: str) -> Optional[PayrollPeriod]:
        """Tìm kỳ lương theo ID hoặc theo chuỗi tháng (YYYY-MM hoặc YYYY-MM-DD)."""
        period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_identifier).first()
        if period:
            return period
        
        # Check if identifier is a month date string (e.g. '2026-08' or '2026-08-01')
        if "-" in period_identifier:
            parts = period_identifier.strip().split("-")
            if len(parts) >= 2:
                try:
                    y, m = int(parts[0]), int(parts[1])
                    m_date = date(y, m, 1)
                    return FinanceService.get_or_create_payroll_period(db, m_date)
                except Exception:
                    pass
        return None

    @staticmethod
    def lock_payroll_period(db: Session, period_id: str, actor_id: str) -> dict:
        """Giám đốc duyệt chốt bảng lương tháng (open -> locked)."""
        try:
            period = FinanceService._resolve_payroll_period(db, period_id)
            if not period:
                raise HTTPException(status_code=404, detail="Không tìm thấy kỳ lương này")
            if (period.status or "").lower() == "locked":
                raise HTTPException(status_code=400, detail="Kỳ lương này đã được chốt trước đó.")
            if (period.status or "").lower() == "paid":
                raise HTTPException(status_code=400, detail="Kỳ lương này đã được chi trả.")

            period.status = "Locked"
            period.locked_at = datetime.now(timezone.utc)
            period.locked_by_user_id = actor_id

            log_action(
                db=db,
                actor_id=actor_id,
                action="LOCK_PAYROLL_PERIOD",
                object_type="PayrollPeriod",
                payload={"period_id": period.id, "month": str(period.period_month), "status": "Locked"}
            )

            db.commit()
            return {
                "status": "success",
                "id": period.id,
                "period_month": str(period.period_month),
                "new_status": period.status,
                "locked_at": period.locked_at.isoformat() if period.locked_at else None,
                "locked_by_user_id": period.locked_by_user_id,
            }
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    def mark_paid_payroll_period(db: Session, period_id: str, actor_id: str) -> dict:
        """Kế toán/Giám đốc cập nhật trạng thái chi trả (locked -> paid)."""
        try:
            period = FinanceService._resolve_payroll_period(db, period_id)
            if not period:
                raise HTTPException(status_code=404, detail="Không tìm thấy kỳ lương này")
            if (period.status or "").lower() != "locked":
                raise HTTPException(status_code=400, detail=f"Chỉ có thể đánh dấu chi trả khi kỳ lương đã được Giám đốc chốt (Locked). Hiện: {period.status}")

            period.status = "Paid"
            period.paid_at = datetime.now(timezone.utc)

            log_action(
                db=db,
                actor_id=actor_id,
                action="PAID_PAYROLL_PERIOD",
                object_type="PayrollPeriod",
                payload={"period_id": period.id, "month": str(period.period_month), "status": "Paid"}
            )

            db.commit()
            return {
                "status": "success",
                "id": period.id,
                "period_month": str(period.period_month),
                "new_status": period.status,
                "paid_at": period.paid_at.isoformat() if period.paid_at else None,
            }
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    def create_refund_voucher(db: Session, contract_id: str, amount: Optional[float] = None, reason: Optional[str] = None, actor_id: Optional[str] = None) -> dict:
        """Tạo phiếu chi hoàn tiền nộp thừa cho khách hàng. Nếu là Giám đốc/Admin thì duyệt hoàn tất ngay."""
        contract = db.query(Contract).filter(Contract.id == contract_id).first()
        if not contract:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy hợp đồng {contract_id}")

        rec = db.query(Receivable).filter(Receivable.contract_id == contract_id).first()
        paid = float(rec.paid_amount or 0) if rec else 0.0
        total = float(contract.total_value or 0)
        excess = max(0.0, paid - total)

        refund_amount = amount if (amount and amount > 0) else excess
        if refund_amount <= 0:
            raise HTTPException(status_code=400, detail="Số tiền hoàn trả phải lớn hơn 0")

        customer = db.query(Customer).filter(Customer.id == contract.customer_id).first() if contract.customer_id else None
        partner_name = customer.full_name if customer else "Khách hàng"

        # Check if actor is director / admin
        actor = db.query(User).filter(User.id == actor_id).first() if actor_id else None
        is_director = False
        if actor:
            if actor.username == "admin" or actor.role == "admin" or getattr(actor, 'is_superuser', False):
                is_director = True
            elif getattr(actor, 'role_rel', None) and actor.role_rel.permissions:
                for p in actor.role_rel.permissions:
                    if (p.resource in ("finance", "contract", "*") and p.action in ("approve", "*")):
                        is_director = True
                        break

        status_val = "Hoàn thành" if is_director else "Chờ duyệt"
        approved_by = actor_id if is_director else None
        approved_at = datetime.now(timezone.utc) if is_director else None

        tx_id = FinanceRepository.generate_voucher_id("Chi", db, date.today())
        category_name = "Chi hoàn trả khách hàng do nộp thừa"
        desc = reason or f"Hoàn trả tiền nộp thừa cho HĐ {contract_id}"

        new_tx = CashflowTransaction(
            id=tx_id,
            transaction_date=date.today(),
            transaction_type="Chi",
            category_code=category_name,
            payer_payee_name=partner_name,
            amount=refund_amount,
            payment_method="Chuyển khoản",
            contract_id=contract_id,
            status=status_val,
            created_by_user_id=actor_id,
            approved_by_user_id=approved_by,
            approved_at=approved_at,
            description=desc
        )
        db.add(new_tx)

        if is_director:
            FinanceService._sync_receivables(db, contract_id, -refund_amount)

        log_action(
            db=db,
            actor_id=actor_id,
            action="APPROVE_REFUND" if is_director else "CREATE_REFUND_REQUEST",
            object_type="CashflowTransaction",
            payload={"id": tx_id, "contract_id": contract_id, "amount": refund_amount, "status": status_val, "reason": desc}
        )
        db.commit()

        msg = (
            f"✅ Đã duyệt và hoàn tiền thành công {refund_amount:,.0f}đ cho khách hàng"
            if is_director else
            f"Đã lập phiếu chi hoàn tiền {refund_amount:,.0f}đ (Đang chờ Giám đốc duyệt)"
        )

        return {
            "status": "success",
            "message": msg,
            "transaction_id": tx_id,
            "amount": refund_amount,
            "is_approved": is_director
        }
