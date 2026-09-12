import logging
import uuid
from datetime import datetime, date, timezone, timedelta
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text
from typing import Optional
from types import SimpleNamespace

logger = logging.getLogger(__name__)

from src.db.models import (
    CashflowTransaction, AdvanceRequest, Contract, Customer, Receivable,
    ServiceLine, Employee, AuditLog, User, Role, UserRole, FinanceSetting, FundOpeningBalance, PayrollPeriod,
    SystemSetting,
)
from src.dossiers.actor_guard import is_director as check_is_director
from src.finance.repository import FinanceRepository
from src.finance.domain_rules import (
    check_closed_period, check_cash_balance, validate_contract,
    validate_project, validate_employee_payload, parse_category, calculate_balances
)
from src.finance.serializers import serialize_employee
from src.core.audit import log_action
from src.core.redis_utils import invalidate_money_caches
from src.contracts.read_model import sync_contract_read_model_after_write
from src.finance.enums import (
    TransactionType, TransactionStatus, PaymentMethod, TransactionScope,
    normalize_transaction_type, normalize_status, normalize_payment_method, normalize_scope,
    get_transaction_type_label, get_status_label, get_payment_method_label
)
from src.finance.document_signers import create_document_signer_snapshot, decode_document_signers
from src.config.company_identity import COMPANY_REPRESENTATIVE

# Chỉ phiếu đã duyệt mới được tính vào công nợ. Phiếu đang chờ duyệt không
# đụng tới sổ nợ — nếu không, nhân viên gõ một phiếu khống là công nợ tự biến mất
# mà chưa ai phê duyệt.
APPROVED_TX_STATUSES = {TransactionStatus.COMPLETED.value, "Hoàn thành", "Đã duyệt", "COMPLETED", "approved", "Đã quyết toán"}
PENDING_TX_STATUSES = {TransactionStatus.PENDING.value, "Chờ duyệt", "PENDING", "pending"}
# Bộ giá trị chấp nhận cho loại phiếu Thu
INCOME_TX_TYPES = {TransactionType.INCOME.value, "Thu", "INCOME"}


def _resolve_user_snapshot(db: Session, user_id: Optional[str]) -> dict | None:
    if not user_id:
        return None
    row = (
        db.query(User, Employee)
        .outerjoin(Employee, Employee.user_id == User.id)
        .filter(User.id == user_id)
        .first()
    )
    if not row:
        return {"user_id": user_id}
    user, employee = row
    return {
        "user_id": user.id,
        "name": (employee.full_name if employee else None) or user.username,
        "department": employee.department if employee else None,
        "role": employee.job_title if employee else None,
    }


def capture_document_signer_snapshot(
    db: Session,
    actor_id: Optional[str] = None,
    *,
    creator: dict | str | None = None,
    recipient: dict | str | None = None,
    counterparty: dict | str | None = None,
) -> dict:
    setting = db.query(SystemSetting).filter(SystemSetting.key == "finance.document_signers").first()
    configured = decode_document_signers(setting.value if setting else None)
    if isinstance(creator, dict) and creator.get("user_id") and not creator.get("name"):
        creator = {**(_resolve_user_snapshot(db, creator["user_id"]) or {}), **creator}
    return create_document_signer_snapshot(
        configured,
        captured_by=actor_id,
        creator=creator or _resolve_user_snapshot(db, actor_id),
        recipient=recipient,
        counterparty=counterparty,
    )


def counts_toward_receivable(status: Optional[str], tx_type: Optional[str]) -> bool:
    """Phiếu này có được trừ vào công nợ hợp đồng không."""
    if not status or not tx_type:
        return False
    c_type = normalize_transaction_type(tx_type)
    c_status = normalize_status(status)
    return (c_type == TransactionType.INCOME.value) and (c_status == TransactionStatus.COMPLETED.value)


class FinanceService:

    @staticmethod
    def create_advance_request(db: Session, payload, employee: Employee, actor_id: str) -> dict:
        """Create only an employee request; it never touches the cash ledger."""
        validate_project(db, getattr(payload, "project_id", None))
        validate_contract(db, getattr(payload, "contract_id", None))
        project_id = getattr(payload, "project_id", None) or None
        contract_id = getattr(payload, "contract_id", None) or None
        if project_id and not contract_id:
            project = db.query(ServiceLine).filter(ServiceLine.id == project_id).first()
            contract_id = project.contract_id if project else None
        elif project_id and contract_id:
            project = db.query(ServiceLine).filter(ServiceLine.id == project_id).first()
            if project and project.contract_id and project.contract_id != contract_id:
                raise HTTPException(status_code=400, detail="Hợp đồng không khớp với hạng mục đã chọn.")

        request = AdvanceRequest(
            employee_id=employee.id,
            requested_by_user_id=actor_id,
            project_id=project_id,
            contract_id=contract_id,
            amount=payload.amount,
            payment_method=normalize_payment_method(payload.payment_method),
            note=payload.note.strip(),
            status="PENDING",
        )
        db.add(request)
        log_action(
            db=db,
            actor_id=actor_id,
            action="CREATE_ADVANCE_REQUEST",
            object_type="AdvanceRequest",
            payload={"amount": float(payload.amount), "employee_id": employee.id},
        )
        db.commit()
        db.refresh(request)
        return {"status": "success", "id": request.id, "request_status": request.status}

    @staticmethod
    def review_advance_request(
        db: Session, request_id: str, *, approved: bool, reason: str | None, actor_id: str
    ) -> dict:
        if not check_is_director(db, actor_id):
            raise HTTPException(status_code=403, detail="Chỉ Giám đốc được duyệt yêu cầu tạm ứng.")
        request = db.query(AdvanceRequest).filter(AdvanceRequest.id == request_id).first()
        if not request:
            raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu tạm ứng.")
        if request.status != "PENDING":
            raise HTTPException(status_code=400, detail=f"Yêu cầu đang ở trạng thái {request.status}, không thể duyệt lại.")
        if not approved and not (reason or "").strip():
            raise HTTPException(status_code=400, detail="Từ chối yêu cầu phải ghi rõ lý do.")

        request.status = "DIRECTOR_APPROVED" if approved else "REJECTED"
        request.reviewed_by_user_id = actor_id
        request.reviewed_at = datetime.now(timezone.utc)
        request.rejection_reason = None if approved else reason.strip()
        log_action(
            db=db,
            actor_id=actor_id,
            action="APPROVE_ADVANCE_REQUEST" if approved else "REJECT_ADVANCE_REQUEST",
            object_type="AdvanceRequest",
            payload={"request_id": request.id, "reason": reason if not approved else None},
        )
        db.commit()
        return {"status": "success", "id": request.id, "request_status": request.status}

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

            canon_type = normalize_transaction_type(payload.type)
            canon_pm = normalize_payment_method(payload.payment_method)
            canon_scope = normalize_scope(payload.scope)

            # 3. Check cash balance for EXPENSE and CASH
            if canon_type == TransactionType.EXPENSE.value and canon_pm == PaymentMethod.CASH.value:
                check_cash_balance(db, payload.amount)

            contract_id = payload.contract_id.strip() if payload.contract_id and payload.contract_id.strip() else None
            project_id = payload.project_id.strip() if payload.project_id and payload.project_id.strip() else None
            if contract_id:
                validate_contract(db, contract_id)
            if project_id:
                validate_project(db, project_id)
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

            # 7. Approval Workflow Status.  Creation and approval are separate
            # actions even for the director, so a body/request cannot create a
            # posted voucher without an explicit approve call.
            tx_status = TransactionStatus.PENDING.value
            creator = actor_id or getattr(payload, 'created_by', None) or COMPANY_REPRESENTATIVE
            approver = None

            canon_type = normalize_transaction_type(payload.type)
            canon_pm = normalize_payment_method(payload.payment_method)
            canon_scope = normalize_scope(payload.scope)

            new_id = FinanceRepository.generate_voucher_id(canon_type, db, parsed_date)
            bal_tm, bal_ck, bal_sau = calculate_balances(db, canon_type, payload.amount, canon_pm)
            
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
                transaction_type=canon_type,
                amount=payload.amount,
                category_code=category,
                payer_payee_name=payload.payer_payee,
                payment_method=canon_pm,
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
                scope=canon_scope,
                signer_snapshot=(
                    capture_document_signer_snapshot(
                        db,
                        creator,
                        counterparty={"name": payload.payer_payee},
                    )
                    if tx_status == TransactionStatus.COMPLETED.value else None
                ),
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
            
            clean_contract_id = payload.contract_id.strip() if hasattr(payload, 'contract_id') and payload.contract_id and payload.contract_id.strip() else None
            if clean_contract_id:
                validate_contract(db, clean_contract_id)

            if t.status in APPROVED_TX_STATUSES:
                if hasattr(payload, 'contract_id') and payload.contract_id is not None:
                    if t.contract_id != clean_contract_id:
                        if t.transaction_type in INCOME_TX_TYPES:
                            if t.contract_id: FinanceService._sync_receivables(db, t.contract_id, -float(t.amount))
                            if clean_contract_id: FinanceService._sync_receivables(db, clean_contract_id, float(t.amount))
                        t.contract_id = clean_contract_id
                        db.commit()
                        invalidate_money_caches()
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
            canon_pm = normalize_payment_method(payload.payment_method)
            canon_type = normalize_transaction_type(t.transaction_type)
            if canon_type == TransactionType.EXPENSE.value and canon_pm == PaymentMethod.CASH.value:
                check_cash_balance(db, new_amount, exclude_transaction_id=t.id)

            if amount_diff != 0:
                calculate_balances(db, canon_type, amount_diff, canon_pm)
                # Phiếu chưa duyệt chưa từng được cộng vào công nợ nên cũng không
                # có gì để điều chỉnh; số tiền cuối cùng sẽ được ghi nhận lúc duyệt.
                if counts_toward_receivable(t.status, t.transaction_type) and t.contract_id:
                    FinanceService._sync_receivables(db, t.contract_id, amount_diff)

            t.category_code = payload.category
            t.payer_payee_name = payload.payer_payee
            t.payment_method = canon_pm
            t.amount = new_amount
            t.description = payload.description
            t.contract_id = clean_contract_id
            if payload.scope:
                t.scope = normalize_scope(payload.scope)
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
            
            if t.status in (TransactionStatus.CANCELLED.value, "Đã hủy", "CANCELLED"):
                raise HTTPException(status_code=400, detail="Phiếu này đã bị hủy trước đó.")
            
            cat_lower = (t.category_code or "").lower()
            if "hoàn tác" in cat_lower or "hủy phiếu" in cat_lower:
                raise HTTPException(status_code=400, detail="Không thể hủy phiếu hoàn tác. Đây là chứng từ đối ứng bảo toàn sổ quỹ.")

            check_closed_period(db, t.transaction_date or date.today())

            # Phải nhớ trạng thái trước khi ghi đè, vì việc hoàn công nợ phụ thuộc
            # vào chuyện phiếu ĐÃ từng được tính hay chưa.
            old_status = t.status
            was_counted = counts_toward_receivable(old_status, t.transaction_type)

            t.status = TransactionStatus.CANCELLED.value
            t.cancellation_reason = reason
            t.cancelled_at = datetime.now(timezone.utc)

            # 1. Hoàn lại công nợ — chỉ khi phiếu này thực sự đã được tính vào công nợ trước đó.
            # Huỷ một phiếu còn "Chờ duyệt" mà vẫn cộng ngược sẽ thổi phồng công nợ.
            if t.contract_id:
                cat_desc = f"{t.category_code or ''} {t.description or ''}".lower()
                is_approved_refund = (old_status in APPROVED_TX_STATUSES) and (t.transaction_type in {"Chi", "EXPENSE"}) and any(k in cat_desc for k in ["hoàn", "refund", "trả lại"])
                if was_counted:
                    FinanceService._sync_receivables(db, t.contract_id, -float(t.amount))
                elif is_approved_refund:
                    FinanceService._sync_receivables(db, t.contract_id, float(t.amount))

            target_actor = actor_id or t.created_by_user_id
            actor_exists = db.query(User.id).filter(User.id == target_actor).first() if target_actor else None
            actor_id_val = target_actor if actor_exists else None

            db.add(AuditLog(
                actor_id=actor_id_val,
                action="VOID",
                object_type="CashflowTransaction",
                payload_json={
                    "id": t.id,
                    "amount": float(t.amount or 0),
                    "type": t.transaction_type,
                    "reason": reason,
                    "cancelled_at": t.cancelled_at.isoformat()
                }
            ))
            
            db.commit()
            return {"status": "success", "message": f"Đã hủy phiếu {t.id} thành công."}
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    def create_advance(db: Session, payload, actor_id: Optional[str] = None) -> dict:
        try:
            request = None
            if getattr(payload, "request_id", None):
                request = db.query(AdvanceRequest).filter(AdvanceRequest.id == payload.request_id).first()
                if not request:
                    raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu tạm ứng.")
                if request.status != "DIRECTOR_APPROVED":
                    raise HTTPException(status_code=400, detail="Yêu cầu phải được Giám đốc duyệt trước khi lập phiếu chính thức.")
                if request.official_transaction_id:
                    raise HTTPException(status_code=409, detail="Yêu cầu này đã có phiếu tạm ứng chính thức.")
                project_id = request.project_id
                contract_id = request.contract_id
                amount = float(request.amount)
                payer_payee = db.query(Employee.full_name).filter(Employee.id == request.employee_id).scalar() or "Nhân viên"
                note = request.note
                payment_method = request.payment_method
            else:
                # Compatibility for old internal scripts; the public route below
                # rejects this shape so it cannot bypass the request workflow.
                project_id = getattr(payload, "project_id", None)
                contract_id = getattr(payload, "contract_id", None)
                amount = float(payload.amount)
                payer_payee = payload.payer_payee
                note = payload.note
                payment_method = payload.payment_method

            canon_pm = normalize_payment_method(payment_method)
            if canon_pm == PaymentMethod.CASH.value:
                check_cash_balance(db, amount)

            new_id = FinanceRepository.generate_voucher_id(TransactionType.EXPENSE.value, db)
            bal_tm, bal_ck, bal_sau = calculate_balances(db, TransactionType.ADVANCE.value, amount, canon_pm)

            proj_label = ""
            if project_id:
                p = db.query(ServiceLine).filter(ServiceLine.id == project_id).first()
                if p:
                    proj_label = f"HĐ {p.contract_id} — {p.service_type or 'Dự án'}" if p.contract_id else (p.service_type or "Dự án đo đạc")

            if not contract_id and project_id:
                p = db.query(ServiceLine).filter(ServiceLine.id == project_id).first()
                if p: contract_id = p.contract_id

            creator = actor_id or COMPANY_REPRESENTATIVE
            # A director-approved request is the approval; the accountant's
            # issuance is the official, posted voucher.
            tx_status = TransactionStatus.COMPLETED.value if request else TransactionStatus.PENDING.value

            tc = CashflowTransaction(
                id=new_id,
                project_id=project_id or None,
                contract_id=contract_id,
                transaction_type=TransactionType.ADVANCE.value,
                amount=amount,
                category_code="Chi phí tạm ứng",
                payer_payee_name=payer_payee,
                payment_method=canon_pm,
                transaction_date=date.today(),
                document_number=new_id,
                description=f"Tạm ứng: {note or 'Chi công trường'}",
                department_code=proj_label,
                balance_after=bal_sau,
                cash_balance_after=bal_tm,
                bank_balance_after=bal_ck,
                created_by_user_id=creator,
                approved_by_user_id=request.reviewed_by_user_id if request else None,
                approved_at=request.reviewed_at if request else None,
                status=tx_status,
                signer_snapshot=(
                    capture_document_signer_snapshot(
                        db,
                        creator,
                        recipient={"name": payer_payee},
                    )
                    if tx_status == TransactionStatus.COMPLETED.value else None
                ),
            )
            db.add(tc)

            if request:
                request.status = "ISSUED"
                request.official_transaction_id = tc.id

            log_action(
                db=db,
                actor_id=actor_id,
                action="CREATE_ADVANCE",
                object_type="CashflowTransaction",
                payload={"id": tc.id, "amount": float(tc.amount), "payer_payee": tc.payer_payee_name, "status": tc.status, "request_id": getattr(request, "id", None)}
            )

            db.commit()
            return {"status": "success", "id": tc.id, "category": tc.category_code, "advance_status": tc.status}
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    def clear_advance(db: Session, payload, actor_id: Optional[str] = None) -> dict:
        try:
            advance = db.query(CashflowTransaction).filter(
                CashflowTransaction.id == payload.advance_id
            ).first()
            if not advance:
                raise HTTPException(status_code=404, detail="Không tìm thấy phiếu tạm ứng")

            if (
                advance.transaction_type == TransactionType.REIMBURSEMENT.value
                or "Quyết toán ngày" in (advance.description or "")
            ):
                raise HTTPException(status_code=400, detail="Phiếu tạm ứng này đã được quyết toán.")

            if advance.status not in APPROVED_TX_STATUSES and advance.status != "Hoàn thành" and advance.status != TransactionStatus.COMPLETED.value:
                raise HTTPException(
                    status_code=400,
                    detail=f"Không thể quyết toán phiếu tạm ứng đang ở trạng thái '{advance.status}'. Phiếu phải được duyệt chi (Hoàn thành) trước khi quyết toán."
                )

            adv_amt = float(advance.amount or 0)
            actual = float(payload.actual_amount or 0)
            diff = adv_amt - actual  # positive: employee returns leftover to company (+Thu), negative: company pays deficit to employee (-Chi)
            auto_vouchers = []

            # 1. Mark original advance as resolved and append settlement note
            advance.status = TransactionStatus.COMPLETED.value
            if not advance.signer_snapshot:
                advance.signer_snapshot = capture_document_signer_snapshot(
                    db,
                    actor_id or advance.created_by_user_id,
                    creator={"user_id": advance.created_by_user_id} if advance.created_by_user_id else None,
                    recipient={"name": advance.payer_payee_name},
                )
            settle_note = f"[Quyết toán ngày {date.today().strftime('%d/%m/%Y')}: Thực chi {actual:,.0f}đ, chênh lệch {diff:,.0f}đ. {payload.note or ''}]".strip()
            if advance.description:
                advance.description = f"{advance.description} | {settle_note}"
            else:
                advance.description = settle_note

            creator = actor_id or getattr(advance, 'created_by_user_id', None) or COMPANY_REPRESENTATIVE

            # 2. Only create cashflow vouchers if there is a real cash difference (Hoàn ứng thừa hoặc Chi bù thiếu)
            if abs(diff) > 0:
                vtype = TransactionType.INCOME.value if diff > 0 else TransactionType.EXPENSE.value
                cat_code = "Thu hoàn tiền tạm ứng thừa" if diff > 0 else "Chi bù tiền tạm ứng thiếu"
                note_prefix = "Thu hoàn ứng thừa" if diff > 0 else "Chi bù tạm ứng thiếu"
                new_id = FinanceRepository.generate_voucher_id(vtype, db)
                pmethod = normalize_payment_method(advance.payment_method or PaymentMethod.BANK_TRANSFER.value)
                bal_tm, bal_ck, bal_sau = calculate_balances(db, vtype, abs(diff), pmethod)

                tc = CashflowTransaction(
                    id=new_id,
                    project_id=advance.project_id,
                    contract_id=advance.contract_id,
                    transaction_type=vtype,
                    amount=abs(diff),
                    category_code=cat_code,
                    payer_payee_name=advance.payer_payee_name,
                    payment_method=pmethod,
                    transaction_date=date.today(),
                    document_number=new_id,
                    description=f"{note_prefix}: {payload.note or ''} (gốc: {payload.advance_id})".strip(),
                    department_code=advance.department_code,
                    balance_after=bal_sau,
                    cash_balance_after=bal_tm,
                    bank_balance_after=bal_ck,
                    created_by_user_id=creator,
                    status=TransactionStatus.COMPLETED.value,
                    signer_snapshot=capture_document_signer_snapshot(
                        db,
                        actor_id or creator,
                        recipient={"name": advance.payer_payee_name},
                    ),
                )
                db.add(tc)
                auto_vouchers.append({"id": tc.id, "type": vtype, "amount": abs(diff), "purpose": note_prefix})

            log_action(
                db=db,
                actor_id=actor_id,
                action="CLEAR_ADVANCE",
                object_type="CashflowTransaction",
                payload={
                    "advance_id": payload.advance_id,
                    "advance_amount": adv_amt,
                    "actual_amount": actual,
                    "difference": diff,
                    "auto_vouchers": auto_vouchers
                }
            )

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
    def close_fund(db: Session, payload, actor_id: Optional[str] = None) -> dict:
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
            closing_user_name = actor_id or "Kế toán"
            canon_pm = normalize_payment_method(payload.payment_method)
            
            fob = FundOpeningBalance(
                payment_method=canon_pm,
                opening_balance=payload.actual_amount,
                effective_date=closing_moment,
                closing_user=closing_user_name,
                notes=payload.notes
            )
            db.add(fob)
            db.flush()

            if difference != 0:
                tx_type = TransactionType.INCOME.value if difference > 0 else TransactionType.EXPENSE.value
                category = "Thu chênh lệch kiểm kê quỹ" if difference > 0 else "Chi chênh lệch kiểm kê quỹ"
                new_id = FinanceRepository.generate_voucher_id(tx_type, db, closing_moment.date())
                
                bal_tm, bal_ck, bal_sau = calculate_balances(db, tx_type, abs(difference), canon_pm)
                voucher_time = closing_moment - timedelta(seconds=1)
                
                tc = CashflowTransaction(
                    id=new_id,
                    transaction_type=tx_type,
                    amount=abs(difference),
                    category_code=category,
                    payer_payee_name=closing_user_name,
                    payment_method=canon_pm,
                    transaction_date=closing_moment.date(),
                    created_at=voucher_time,
                    document_number=new_id,
                    description=f"{category}: {payload.notes or ''}",
                    balance_after=bal_sau,
                    cash_balance_after=bal_tm,
                    bank_balance_after=bal_ck,
                    status=TransactionStatus.COMPLETED.value,
                    scope=TransactionScope.COMPANY.value,
                    created_by_user_id=closing_user_name,
                    approved_by_user_id=closing_user_name,
                    signer_snapshot=capture_document_signer_snapshot(db, closing_user_name)
                )
                db.add(tc)

            db.commit()
            return {"status": "success", "message": "Chốt quỹ thành công!", "id": fob.id}
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
            if payload.payroll_cycle_type is not None:
                is_cutoff = str(payload.payroll_cycle_type).upper() in ("CUSTOM_CUTOFF", "CUTOFF", "1")
                keys_and_values["payroll_cycle_type"] = 1 if is_cutoff else 0
            if payload.payroll_cutoff_day is not None:
                keys_and_values["payroll_cutoff_day"] = payload.payroll_cutoff_day
            if payload.payroll_payment_day is not None:
                keys_and_values["payroll_payment_day"] = payload.payroll_payment_day

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
            if rec.remaining_amount <= 0.009 and float(rec.paid_amount or 0) >= total - 0.009 and getattr(rec, 'is_written_off', False):
                rec.is_written_off = False
                rec.written_off_reason = None
                rec.written_off_by = None
                rec.written_off_at = None
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
    def _finalize_contract_after_full_payment(db: Session, contract_id: str) -> bool:
        """Chốt trạng thái tài chính sau khi phiếu thu làm số dư về 0.

        Nghiệm thu chuyên môn có thể xảy ra trước nếu Giám đốc duyệt ngoại lệ,
        nhưng workflow/hợp đồng chỉ được đánh dấu hoàn thành khi không còn nợ.
        """
        balance = db.execute(
            text("""
                select coalesce(c.total_value, 0) as total_value,
                       coalesce(sum(t.amount) filter (
                           where t.transaction_type in ('Thu', 'INCOME')
                             and t.status in ('Hoàn thành', 'Đã duyệt', 'COMPLETED', 'approved')
                       ), 0) as paid
                from public.contracts c
                left join public.cashflow_transactions t on t.contract_id = c.id
                where c.id = :contract_id
                group by c.id, c.total_value
            """),
            {"contract_id": contract_id},
        ).mappings().first()
        if not balance:
            return False
        if float(balance["total_value"] or 0) - float(balance["paid"] or 0) > 0.009:
            return False

        db.execute(
            text("""
                update public.workflow_instances wi
                set status = 'completed', completed_at = coalesce(completed_at, now()),
                    updated_at = now()
                where wi.status = 'running'
                  and exists (
                    select 1 from public.service_lines sl
                    where sl.id = wi.service_line_id and sl.contract_id = :contract_id
                  )
                  and not exists (
                    select 1 from public.task_nodes n
                    where n.workflow_instance_id = wi.id
                      and n.status not in ('accepted', 'skipped', 'cancelled')
                  )
            """),
            {"contract_id": contract_id},
        )
        db.execute(
            text("""
                update public.contracts c
                set status = 'completed', completion_override = false,
                    updated_at = now()
                where c.id = :contract_id
                  and not exists (
                    select 1
                    from public.workflow_instances wi
                    join public.service_lines sl on sl.id = wi.service_line_id
                    where sl.contract_id = c.id
                      and wi.status not in ('completed', 'cancelled')
                  )
            """),
            {"contract_id": contract_id},
        )
        return True

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

            t.status = TransactionStatus.COMPLETED.value
            t.approved_by_user_id = actor_id
            t.approved_at = datetime.now(timezone.utc)
            if not t.signer_snapshot:
                t.signer_snapshot = capture_document_signer_snapshot(
                    db,
                    actor_id,
                    creator={"user_id": t.created_by_user_id} if t.created_by_user_id else None,
                    counterparty={"name": t.payer_payee_name} if t.payer_payee_name else None,
                )

            if t.contract_id:
                cat_desc = f"{t.category_code or ''} {t.description or ''}".lower()
                if counts_toward_receivable(t.status, t.transaction_type):
                    FinanceService._sync_receivables(db, t.contract_id, float(t.amount))
                elif (normalize_transaction_type(t.transaction_type) == TransactionType.EXPENSE.value) and any(k in cat_desc for k in ["hoàn", "refund", "trả lại"]):
                    FinanceService._sync_receivables(db, t.contract_id, -float(t.amount))

                # Flush trước để câu SUM phía dưới nhìn thấy phiếu vừa duyệt.
                db.flush()
                # Khi phiếu này thu đủ nợ, K06 đã đủ checklist được đóng ngay.
                # Sau đó mới xét hoàn thành Hợp đồng để không chốt trước workflow.
                from src.contracts.workflow_runtime import auto_finalize_contract_handover_nodes

                auto_finalize_contract_handover_nodes(
                    db,
                    contract_id=t.contract_id,
                    actor_id=actor_id,
                )
                FinanceService._finalize_contract_after_full_payment(db, t.contract_id)

            log_action(
                db=db,
                actor_id=actor_id,
                action="APPROVE",
                object_type="CashflowTransaction",
                payload={"id": t.id, "amount": float(t.amount), "type": t.transaction_type, "status": TransactionStatus.COMPLETED.value}
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

            t.status = TransactionStatus.REJECTED.value
            t.cancellation_reason = reason
            t.cancelled_at = datetime.now(timezone.utc)

            log_action(
                db=db,
                actor_id=actor_id,
                action="REJECT",
                object_type="CashflowTransaction",
                payload={"id": t.id, "reason": reason, "status": TransactionStatus.REJECTED.value}
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

            next_month = (period.period_month.replace(day=28) + timedelta(days=4)).replace(day=1)
            snapshot_rows = db.execute(text("""
                select e.id as employee_id,
                       coalesce(e.base_salary, 0) as base_salary,
                       coalesce(sum(case when wpe.status in ('eligible', 'approved', 'locked') then wpe.amount else 0 end), 0) as piece_amount,
                       count(case when wpe.status in ('eligible', 'approved', 'locked') then wpe.id end) as tasks_completed,
                       coalesce((select sum(a.amount) from employee_pay_adjustments a
                                 where a.employee_id = e.id and a.status in ('approved', 'locked')
                                   and a.effective_date >= :period_month and a.effective_date < :next_month), 0) as adjustment_amount
                from employees e
                left join work_pay_entitlements wpe
                  on wpe.employee_id = e.id
                 and wpe.earned_at >= :period_month
                 and wpe.earned_at < :next_month
                group by e.id, e.base_salary
            """), {
                "period_month": period.period_month,
                "next_month": next_month,
            }).mappings().all()
            period.snapshot = {
                str(row["employee_id"]): {
                    "base_salary": float(row["base_salary"] or 0),
                    "piece_amount": float(row["piece_amount"] or 0),
                    "tasks_completed": int(row["tasks_completed"] or 0),
                    "adjustment_amount": float(row["adjustment_amount"] or 0),
                }
                for row in snapshot_rows
            }

            # Lock every eligible/approved entitlement in the period.  No
            # employee-specific close call can leave a mutable row behind.
            db.execute(text("""
                update work_pay_entitlements
                   set status = 'locked',
                       approved_by = coalesce(approved_by, :actor_id),
                       approved_at = coalesce(approved_at, now())
                 where earned_at >= :period_month and earned_at < :next_month
                   and status in ('eligible', 'approved')
            """), {"period_month": period.period_month, "next_month": next_month, "actor_id": actor_id})
            db.execute(text("""
                update employee_pay_adjustments
                   set status = 'locked',
                       approved_by = coalesce(approved_by, :actor_id),
                       approved_at = coalesce(approved_at, now())
                 where effective_date >= :period_month and effective_date < :next_month
                   and status = 'approved'
            """), {"period_month": period.period_month, "next_month": next_month, "actor_id": actor_id})

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
                "payment_source": "external",
                "cashflow_recorded": False,
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
        if refund_amount > excess + 0.009:
            raise HTTPException(status_code=400, detail="Số tiền hoàn không được vượt quá phần khách đã nộp thừa.")

        customer = db.query(Customer).filter(Customer.id == contract.customer_id).first() if contract.customer_id else None
        partner_name = customer.full_name if customer else "Khách hàng"

        # Check if actor is director / admin
        is_director = check_is_director(db, actor_id) if actor_id else False

        status_val = TransactionStatus.COMPLETED.value if is_director else TransactionStatus.PENDING.value
        approved_by = actor_id if is_director else None
        approved_at = datetime.now(timezone.utc) if is_director else None

        tx_id = FinanceRepository.generate_voucher_id(TransactionType.EXPENSE.value, db, date.today())
        category_name = "Chi hoàn trả khách hàng do nộp thừa"
        desc = reason or f"Hoàn trả tiền nộp thừa cho HĐ {contract_id}"

        new_tx = CashflowTransaction(
            id=tx_id,
            transaction_date=date.today(),
            transaction_type=TransactionType.EXPENSE.value,
            category_code=category_name,
            payer_payee_name=partner_name,
            amount=refund_amount,
            payment_method=PaymentMethod.BANK_TRANSFER.value,
            contract_id=contract_id,
            status=status_val,
            created_by_user_id=actor_id,
            approved_by_user_id=approved_by,
            approved_at=approved_at,
            signer_snapshot=(
                capture_document_signer_snapshot(
                    db,
                    actor_id,
                    counterparty={"name": partner_name},
                )
                if is_director else None
            ),
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
