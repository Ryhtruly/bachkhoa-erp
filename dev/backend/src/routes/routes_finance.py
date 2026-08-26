import io
import json
import logging
import re
import uuid

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Query, File, UploadFile
from sqlalchemy.orm import Session
from datetime import date, datetime, timezone, timedelta

from src.db.database import get_db
from src.db.models import AuditLog, SystemSetting
from src.core.auth import require_permission, require_any_permission, User
from src.services.storage_service import delete_file, ensure_bucket, upload_file
from src.services.timeline_realtime import publish_timeline_change
from src.core.redis_utils import get_cached_json, invalidate_money_caches, set_cached_json
from src.finance import (
    FinanceRepository, FinanceService,
    CashflowIn, CashflowUpdateIn, CashflowVoidIn,
    AdvanceCreateIn, AdvanceClearIn, FundCloseIn,
    WageCreateIn, EmployeeUpsertIn, FinanceSettingsIn, DocumentSignersIn, RefundExcessIn,
    serialize_cashflow, serialize_cashflow_bulk, serialize_employee,
    TransactionType, TransactionStatus, PaymentMethod, TransactionScope,
    normalize_transaction_type, normalize_status, normalize_payment_method, normalize_scope,
    get_transaction_type_label, get_status_label, get_payment_method_label, get_scope_label
)
from src.finance.document_signers import decode_document_signers, normalize_document_signers

ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_AVATAR_BYTES = 5 * 1024 * 1024

router = APIRouter(prefix="/api/finance", tags=["06. Finance & Cashflow"])
logger = logging.getLogger(__name__)

# ══════════════════════════════════════════════════════════════
# 1. DÒNG TIỀN — Cashflow
# ══════════════════════════════════════════════════════════════

@router.get("/next-voucher-id")
def get_next_voucher_id(
    type: str = "Thu",
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    return {"next_id": FinanceRepository.generate_voucher_id(type, db)}

@router.get("/cashflow")
def list_cashflow(
    month: str = Query(None),
    type: str = Query(None),
    payment_method: str = Query(None),
    project_id: str = Query(None),
    contract_id: str = Query(None),
    scope: str = Query(None),
    status: str = Query(None),
    category: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    cache_key = f"bachkhoa:finance:cashflow:{month or 'all'}:{type or 'all'}:{payment_method or 'all'}:{project_id or 'all'}:{contract_id or 'all'}:{scope or 'all'}:{status or 'all'}:{category or 'all'}"
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached

    rows = FinanceRepository.list_cashflow_transactions(
        db, month=month, type=type, payment_method=payment_method,
        project_id=project_id, contract_id=contract_id, scope=scope,
        status=status, category=category
    )
    result = serialize_cashflow_bulk(rows, db)
    set_cached_json(cache_key, result, ttl_seconds=60)
    return result

@router.get("/cashflow/by-contract/{contract_id}")
def cashflow_by_contract(
    contract_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    res = FinanceRepository.get_cashflow_by_contract(db, contract_id)
    if not res:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy Hợp Đồng '{contract_id}'")
    return {
        "contract_id": contract_id,
        "customer_name": res["customer_name"],
        "total_value": float(res["contract"].total_value or 0),
        "total_income": res["total_income"],
        "total_expenditure": res["total_expenditure"],
        "transactions": serialize_cashflow_bulk(res["transactions"], db),
    }

@router.get("/cashflow/by-project/{project_id}")
def cashflow_by_project(
    project_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    res = FinanceRepository.get_cashflow_by_project(db, project_id)
    if not res:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy Hồ Sơ '{project_id}'")
    return {
        "project_id": project_id,
        "task_name": res["task_name"],
        "contract_id": res["contract_id"],
        "total_income": res["total_income"],
        "total_expenditure": res["total_expenditure"],
        "transactions": serialize_cashflow_bulk(res["transactions"], db),
    }

@router.get("/cashflow/cash")
def cashflow_cash(
    month: str = Query(None),
    type: str = Query(None),
    payment_method: str = Query(None),
    project_id: str = Query(None),
    contract_id: str = Query(None),
    scope: str = Query(None),
    status: str = Query(None),
    category: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    cache_key = f"bachkhoa:finance:cash:{month or 'all'}:{type or 'all'}:{project_id or 'all'}:{contract_id or 'all'}:{scope or 'all'}:{status or 'all'}:{category or 'all'}"
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached

    balance = FinanceRepository.get_running_balance(db, "CASH")
    initial_income = FinanceRepository.get_setting_value(db, "initial_total_income")
    initial_expense = FinanceRepository.get_setting_value(db, "initial_total_expenditure")
    
    rows = FinanceRepository.list_cashflow_transactions(
        db, month=month, type=type, payment_method="CASH",
        project_id=project_id, contract_id=contract_id, scope=scope,
        status=status, category=category
    )
    
    approved_set = {TransactionStatus.COMPLETED.value, "Hoàn thành", "Đã duyệt", "COMPLETED", "approved", "Đã quyết toán", None, ""}
    filtered_income = sum(float(r.amount or 0) for r in rows if normalize_transaction_type(r.transaction_type) == TransactionType.INCOME.value and (r.status in approved_set or not r.status))
    filtered_expenditure = sum(float(r.amount or 0) for r in rows if normalize_transaction_type(r.transaction_type) in (TransactionType.EXPENSE.value, TransactionType.ADVANCE.value) and (r.status in approved_set or not r.status))

    result = {
        "balance": balance,
        "total_income": initial_income + filtered_income,
        "total_expenditure": initial_expense + filtered_expenditure,
        "transactions": serialize_cashflow_bulk(rows, db)
    }
    set_cached_json(cache_key, result, ttl_seconds=60)
    return result

@router.get("/cashflow/bank")
def cashflow_bank(
    month: str = Query(None),
    type: str = Query(None),
    payment_method: str = Query(None),
    project_id: str = Query(None),
    contract_id: str = Query(None),
    scope: str = Query(None),
    status: str = Query(None),
    category: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    cache_key = f"bachkhoa:finance:bank:{month or 'all'}:{type or 'all'}:{project_id or 'all'}:{contract_id or 'all'}:{scope or 'all'}:{status or 'all'}:{category or 'all'}"
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached

    balance = FinanceRepository.get_running_balance(db, "BANK_TRANSFER")
    initial_income = FinanceRepository.get_setting_value(db, "initial_total_income")
    initial_expense = FinanceRepository.get_setting_value(db, "initial_total_expenditure")
    
    rows = FinanceRepository.list_cashflow_transactions(
        db, month=month, type=type, payment_method="BANK_TRANSFER",
        project_id=project_id, contract_id=contract_id, scope=scope,
        status=status, category=category
    )
    
    approved_set = {TransactionStatus.COMPLETED.value, "Hoàn thành", "Đã duyệt", "COMPLETED", "approved", "Đã quyết toán", None, ""}
    filtered_income = sum(float(r.amount or 0) for r in rows if normalize_transaction_type(r.transaction_type) == TransactionType.INCOME.value and (r.status in approved_set or not r.status))
    filtered_expenditure = sum(float(r.amount or 0) for r in rows if normalize_transaction_type(r.transaction_type) in (TransactionType.EXPENSE.value, TransactionType.ADVANCE.value) and (r.status in approved_set or not r.status))

    result = {
        "balance": balance,
        "total_income": initial_income + filtered_income,
        "total_expenditure": initial_expense + filtered_expenditure,
        "transactions": serialize_cashflow_bulk(rows, db)
    }
    set_cached_json(cache_key, result, ttl_seconds=60)
    return result

@router.post("/cashflow/create")
def create_cashflow(
    payload: CashflowIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "create"))
):
    result = FinanceService.create_cashflow(db, payload, actor_id=user.id)
    invalidate_money_caches()
    return result

@router.get("/cashflow/{transaction_id:path}")
def get_cashflow_detail(
    transaction_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    return FinanceRepository.get_cashflow_detail(db, transaction_id)

@router.put("/cashflow/{transaction_id:path}")
def update_cashflow(
    transaction_id: str,
    payload: CashflowUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "update"))
):
    result = FinanceService.update_cashflow(db, transaction_id, payload, actor_id=user.id)
    invalidate_money_caches()
    return result

@router.post("/cashflow/{transaction_id:path}/void")
def void_cashflow(
    transaction_id: str,
    payload: CashflowVoidIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "delete"))
):
    actor = payload.actor_id or user.id
    result = FinanceService.void_cashflow(db, transaction_id, payload.reason, actor)
    invalidate_money_caches()
    return result


@router.post("/cashflow/{transaction_id:path}/approve")
def approve_cashflow(
    transaction_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "approve"))
):
    """Duyệt phiếu chờ duyệt. Đây mới là lúc công nợ được ghi nhận."""
    result = FinanceService.approve_cashflow(db, transaction_id, actor_id=user.id)
    # Duyệt xong thì phiếu rời hàng chờ — chuông phải bỏ dòng đó ngay.
    publish_timeline_change("cashflow_approved", entity_id=transaction_id)
    invalidate_money_caches()
    return result


@router.post("/cashflow/{transaction_id:path}/reject")
def reject_cashflow(
    transaction_id: str,
    payload: CashflowVoidIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "approve"))
):
    """Từ chối phiếu chờ duyệt, bắt buộc ghi lý do."""
    result = FinanceService.reject_cashflow(db, transaction_id, payload.reason, actor_id=user.id)
    publish_timeline_change("cashflow_rejected", entity_id=transaction_id)
    invalidate_money_caches()
    return result


# ══════════════════════════════════════════════════════════════
# 2. CHỨNG TỪ & CÔNG NỢ
# ══════════════════════════════════════════════════════════════

from src.core.redis_utils import get_cached_json, set_cached_json, invalidate_cache

@router.get("/contracts")
def list_contracts(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    cache_key = "bachkhoa:finance:contracts"
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached

    result = FinanceRepository.list_contracts_with_payments(db)
    set_cached_json(cache_key, result, ttl_seconds=120)
    return result

@router.get("/receivables")
def list_receivables(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    cache_key = "bachkhoa:finance:receivables"
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached

    result = FinanceRepository.list_receivables_formatted(db)
    set_cached_json(cache_key, result, ttl_seconds=120)
    return result

@router.get("/payables")
def list_payables(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    cache_key = "bachkhoa:finance:payables"
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached

    result = FinanceRepository.list_payables_formatted(db)
    set_cached_json(cache_key, result, ttl_seconds=120)
    return result


# ══════════════════════════════════════════════════════════════
# 3. TẠM ỨNG
# ══════════════════════════════════════════════════════════════

@router.get("/advance")
def list_advance(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    cache_key = "bachkhoa:finance:advance"
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached

    result = FinanceRepository.list_advances_formatted(db)
    set_cached_json(cache_key, result, ttl_seconds=120)
    return result

@router.post("/advance/create")
def create_advance(
    payload: AdvanceCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "create"))
):
    result = FinanceService.create_advance(db, payload, actor_id=user.id)
    invalidate_money_caches()
    return result

@router.post("/advance/clear")
def clear_advance(
    payload: AdvanceClearIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "update"))
):
    result = FinanceService.clear_advance(db, payload, actor_id=user.id)
    invalidate_money_caches()
    return result


# ══════════════════════════════════════════════════════════════
# 4. NHÂN SỰ & LƯƠNG
# ══════════════════════════════════════════════════════════════

@router.get("/employees/departments")
def list_employee_departments(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("hr", "read"))
):
    departments = FinanceRepository.list_employee_departments(db)
    return [{"id": department.id, "name": department.name} for department in departments]

@router.get("/departments")
def list_departments(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    departments = FinanceRepository.list_employee_departments(db)
    return [{"id": department.id, "name": department.name} for department in departments]

@router.get("/employees")
def list_employees(
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission(("hr", "read"), ("finance", "read")))
):
    rows = FinanceRepository.list_employees(db)
    return [serialize_employee(employee, department_name, account) for employee, department_name, account in rows]

@router.get("/employees/{employee_id}")
def get_employee(
    employee_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("hr", "read"))
):
    row = FinanceRepository.get_employee_by_id(db, employee_id)
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhân sự.")
    return serialize_employee(row[0], row[1], row[2])

@router.post("/employees", status_code=201)
def create_employee(
    payload: EmployeeUpsertIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("hr", "create"))
):
    return FinanceService.create_employee(db, payload)

@router.put("/employees/{employee_id}")
def update_employee(
    employee_id: str,
    payload: EmployeeUpsertIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("hr", "update"))
):
    return FinanceService.update_employee(db, employee_id, payload)

@router.delete("/employees/{employee_id}")
def delete_employee(
    employee_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("hr", "delete"))
):
    return FinanceService.delete_employee(db, employee_id)

@router.post("/employees/{employee_id}/avatar")
async def upload_employee_avatar(
    employee_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("hr", "update"))
):
    if file.content_type not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(status_code=422, detail="Chỉ chấp nhận ảnh JPEG, PNG, WEBP hoặc GIF.")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=422, detail="Ảnh không được vượt quá 5MB.")

    ensure_bucket()
    safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", file.filename or "avatar")
    safe_name = re.sub(r"_+", "_", safe_name).strip("_")
    object_name = f"avatars/{employee_id}_{uuid.uuid4().hex[:8]}_{safe_name}"
    avatar_url = upload_file(io.BytesIO(file_bytes), object_name)

    try:
        return FinanceService.set_employee_avatar(db, employee_id, avatar_url)
    except Exception:
        try:
            delete_file(object_name)
        except Exception:
            logger.exception("Unable to compensate avatar upload for employee %s", employee_id)
        raise

@router.get("/payroll")
def list_payroll(
    month: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "read"))
):
    target_month = month or date.today().strftime("%Y-%m")
    cache_key = f"bachkhoa:finance:payroll:{target_month}"
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached

    result = FinanceRepository.list_payroll_formatted(db, target_month)
    set_cached_json(cache_key, result, ttl_seconds=60)
    return result

@router.get("/payroll/workers")
def list_worker_wages(
    project_id: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "read"))
):
    return FinanceRepository.list_worker_wages_formatted(db, project_id)

@router.get("/payroll/workers/records")
def get_worker_wage_records(
    month: str = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "read"))
):
    return FinanceRepository.list_worker_wage_records_formatted(db, month)

@router.post("/payroll/workers/create")
def create_worker_wage(
    payload: WageCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "create"))
):
    return FinanceService.create_worker_wage(db, payload, actor_id=user.id)


@router.get("/payroll/periods")
def list_payroll_periods(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "read"))
):
    """Danh sách các kỳ lương kèm trạng thái chốt."""
    cache_key = "bachkhoa:finance:payroll_periods"
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached

    result = FinanceService.list_payroll_periods(db)
    set_cached_json(cache_key, result, ttl_seconds=300)
    return result


@router.post("/payroll/periods/{period_id}/lock")
def lock_payroll_period(
    period_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "approve"))
):
    """Giám đốc duyệt chốt bảng lương tháng (open -> locked)."""
    result = FinanceService.lock_payroll_period(db, period_id, actor_id=user.id)
    invalidate_cache("bachkhoa:finance:*")
    invalidate_cache("bachkhoa:payroll:*")
    return result


@router.post("/payroll/periods/{period_id}/mark-paid")
def mark_paid_payroll_period(
    period_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll", "update"))
):
    """Kế toán/Giám đốc đánh dấu đã chi trả lương (locked -> paid)."""
    result = FinanceService.mark_paid_payroll_period(db, period_id, actor_id=user.id)
    invalidate_cache("bachkhoa:finance:*")
    invalidate_cache("bachkhoa:payroll:*")
    return result


# ══════════════════════════════════════════════════════════════
# 5. BÁO CÁO & LỢI NHUẬN
# ══════════════════════════════════════════════════════════════

@router.get("/summary")
def get_summary(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    cache_key = "bachkhoa:finance:summary"
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached

    result = FinanceRepository.get_summary_report(db)
    set_cached_json(cache_key, result, ttl_seconds=120)
    return result

@router.get("/projects")
def list_projects(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    cache_key = "bachkhoa:finance:projects"
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached

    result = FinanceRepository.list_projects(db)
    set_cached_json(cache_key, result, ttl_seconds=300)
    return result

@router.get("/settings")
def get_finance_settings(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    cache_key = "bachkhoa:finance:settings"
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached

    result = FinanceRepository.get_finance_settings(db)
    set_cached_json(cache_key, result, ttl_seconds=600)
    return result

@router.post("/settings")
def save_finance_settings(
    payload: FinanceSettingsIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "approve"))
):
    result = FinanceService.save_settings(db, payload)
    invalidate_cache("bachkhoa:finance:*")
    invalidate_cache("bachkhoa:payroll:*")
    return result


@router.get("/document-signers")
def get_document_signers(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    setting = db.query(SystemSetting).filter(SystemSetting.key == "finance.document_signers").first()
    return decode_document_signers(setting.value if setting else None)


@router.post("/document-signers")
def save_document_signers(
    payload: DocumentSignersIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "approve"))
):
    values = normalize_document_signers(payload.model_dump())
    setting = db.query(SystemSetting).filter(SystemSetting.key == "finance.document_signers").first()
    encoded = json.dumps(values, ensure_ascii=False, sort_keys=True)

    if setting:
        setting.value = encoded
        setting.description = "Tên và chức danh người ký chứng từ tài chính"
    else:
        db.add(SystemSetting(
            key="finance.document_signers",
            value=encoded,
            description="Tên và chức danh người ký chứng từ tài chính"
        ))

    db.add(AuditLog(
        actor_id=user.id,
        action="UPDATE_DOCUMENT_SIGNERS",
        object_type="SystemSetting",
        payload_json={"setting": values}
    ))
    db.commit()
    return values

@router.get("/fund-balances/calculate")
def calculate_system_balance(
    payment_method: Optional[str] = Query(None, description="'Tiền mặt', 'Chuyển khoản' hoặc bỏ trống để lấy cả hai quỹ"),
    closing_date: str = Query(..., description="Mốc thời gian chốt (ISO string)"),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    try:
        closing_moment = datetime.fromisoformat(closing_date.replace("Z", "+00:00"))
        tz_vietnam = timezone(timedelta(hours=7))
        closing_moment = closing_moment.astimezone(tz_vietnam)
    except ValueError:
        try:
            closing_moment = datetime.strptime(closing_date, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            raise HTTPException(status_code=400, detail="Định dạng thời gian chốt không hợp lệ. Hãy dùng ISO format.")

    canon_pm = normalize_payment_method(payment_method) if (payment_method and payment_method not in ["all", "Tất cả", ""]) else None
    if not canon_pm:
        combined = FinanceRepository.get_combined_fund_balances(db, up_to_datetime=closing_moment)
        return {
            "status": "success",
            "cash_balance": combined["cash_balance"],
            "bank_balance": combined["bank_balance"],
            "system_balance": combined["system_balance"]
        }
    else:
        bal = FinanceRepository.get_running_balance(db, canon_pm, up_to_datetime=closing_moment)
        return {
            "status": "success",
            "system_balance": bal,
            "cash_balance": bal if canon_pm == PaymentMethod.CASH.value else None,
            "bank_balance": bal if canon_pm == PaymentMethod.BANK_TRANSFER.value else None
        }

@router.get("/fund-balances/history")
def get_fund_balances_history(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    history = FinanceRepository.get_fund_balances_history(db)
    res = []
    for h in history:
        tz_vn = timezone(timedelta(hours=7))
        raw_date = h.effective_date
        if raw_date:
            dt_local = raw_date.astimezone(tz_vn) if raw_date.tzinfo else raw_date.replace(tzinfo=timezone.utc).astimezone(tz_vn)
            date_str = dt_local.strftime("%d/%m/%Y %H:%M")
        else:
            date_str = ""
        res.append({
            "id": h.id,
            "payment_method": h.payment_method,
            "opening_balance": float(h.opening_balance or 0),
            "effective_date": date_str,
            "closing_user": h.closing_user,
            "notes": h.notes
        })
    return res

@router.post("/fund-balances/close")
def close_fund(
    payload: FundCloseIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "approve"))
):
    return FinanceService.close_fund(db, payload)

@router.get("/monthly-dashboard")
def get_monthly_dashboard(
    month: str = Query(..., description="Format: YYYY-MM"),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read"))
):
    cache_key = f"bachkhoa:finance:monthly_dashboard:{month}"
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached

    result = FinanceRepository.get_monthly_dashboard(db, month)
    set_cached_json(cache_key, result, ttl_seconds=60)
    return result

@router.post("/contracts/{contract_id}/refund-excess")
def create_refund_excess_voucher(
    contract_id: str,
    payload: RefundExcessIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "create"))
):
    """Lập phiếu chi hoàn trả tiền thừa cho khách hàng (trạng thái Chờ duyệt)."""
    return FinanceService.create_refund_voucher(
        db=db,
        contract_id=contract_id,
        amount=payload.amount,
        reason=payload.reason,
        actor_id=user.id
    )

