from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, text, or_
import datetime
import uuid
import os
import re
import io
import logging
import tempfile
from docxtpl import DocxTemplate

from src.db.database import get_db
from src.db.models import LeadPipeline, Customer, ServiceLine, Contract, AuditLog, Employee, FinanceSetting
from src.db.models.crm import ContractTemplate, CustomerIntakeSubmission, ContractGeneratedDocument
from src.db.models.finance import Receivable
from src.db.models.operations import TaskType, ServicePackage
from src.contracts import sync_contract_read_model_after_write
from src.contracts.services import ContractService, _create_initial_service_line, resolve_document_selection, telegram_service
from src.services.storage_service import upload_contract_document, CONTRACT_TEMPLATE_CONTENT_TYPE
from src.files.references import DossierFileReference
from src.core.auth import require_permission, User, is_payroll_all_user
from src.crm.commission import can_claim_lead, normalize_policy, workload_score
from src.core.finance_validation import parse_issued_money

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/crm", tags=["08. CRM & Quotations"])

class LeadCreateSchema(BaseModel):
    customer_name: str
    phone: str
    source: str = "Tự động"
    requirements: str = ""
    assigned_to: Optional[str] = None

class LeadStatusUpdate(BaseModel):
    new_status: str
    price: Optional[str] = None
    tax_id: Optional[str] = None
    area: Optional[str] = None


class CrmSettingsPayload(BaseModel):
    commission_rate_percent: Optional[float] = None
    max_workload_points: Optional[int] = None
    warning_workload_ratio: Optional[float] = None
    max_open_leads: Optional[int] = None
    contact_weight: Optional[int] = None
    quote_weight: Optional[int] = None
    negotiation_weight: Optional[int] = None


CRM_SETTING_KEYS = {
    "commission_rate_percent": "crm_commission_rate_percent",
    "max_workload_points": "crm_max_workload_points",
    "warning_workload_ratio": "crm_warning_workload_ratio",
    "max_open_leads": "crm_max_open_leads",
    "contact_weight": "crm_weight_contact",
    "quote_weight": "crm_weight_quote",
    "negotiation_weight": "crm_weight_negotiation",
}


def _assert_crm_manager(db: Session, user: User) -> None:
    try:
        manager = is_payroll_all_user(db, user)
    except AttributeError:
        manager = False
    if not manager:
        raise HTTPException(status_code=403, detail="CRM settings require director or accountant access")


def _crm_policy(db: Session) -> dict:
    stored = {
        row.key: row.value
        for row in db.query(FinanceSetting).filter(FinanceSetting.key.in_(CRM_SETTING_KEYS.values())).all()
    }
    raw = {
        "commission_rate_percent": stored.get("crm_commission_rate_percent", 0),
        "max_workload_points": stored.get("crm_max_workload_points", 15),
        "warning_workload_ratio": stored.get("crm_warning_workload_ratio", 0.8),
        "max_open_leads": stored.get("crm_max_open_leads", 20),
        "stage_weights": {
            "Tiếp cận": stored.get("crm_weight_contact", 1),
            "Báo giá": stored.get("crm_weight_quote", 2),
            "Đàm phán": stored.get("crm_weight_negotiation", 3),
        },
    }
    return normalize_policy(raw)


def _serialize_crm_policy(policy: dict) -> dict:
    return {
        "commission_rate_percent": float(policy["commission_rate_percent"]),
        "max_workload_points": policy["max_workload_points"],
        "warning_workload_ratio": float(policy["warning_workload_ratio"]),
        "max_open_leads": policy["max_open_leads"],
        "stage_weights": dict(policy["stage_weights"]),
    }


def _is_crm_manager(db: Session, user: User) -> bool:
    try:
        return is_payroll_all_user(db, user)
    except AttributeError:
        return False


@router.get("/settings")
def get_crm_settings(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("crm", "read")),
):
    _assert_crm_manager(db, user)
    return {"status": "success", "data": _serialize_crm_policy(_crm_policy(db))}


@router.put("/settings")
def update_crm_settings(
    payload: CrmSettingsPayload,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("crm", "update")),
):
    _assert_crm_manager(db, user)
    current = _serialize_crm_policy(_crm_policy(db))
    incoming = payload.model_dump(exclude_none=True)
    candidate = {
        "commission_rate_percent": incoming.get("commission_rate_percent", current["commission_rate_percent"]),
        "max_workload_points": incoming.get("max_workload_points", current["max_workload_points"]),
        "warning_workload_ratio": incoming.get("warning_workload_ratio", current["warning_workload_ratio"]),
        "max_open_leads": incoming.get("max_open_leads", current["max_open_leads"]),
        "stage_weights": {
            "Tiếp cận": incoming.get("contact_weight", current["stage_weights"]["Tiếp cận"]),
            "Báo giá": incoming.get("quote_weight", current["stage_weights"]["Báo giá"]),
            "Đàm phán": incoming.get("negotiation_weight", current["stage_weights"]["Đàm phán"]),
        },
    }
    normalized = normalize_policy(candidate)
    values = {
        "crm_commission_rate_percent": normalized["commission_rate_percent"],
        "crm_max_workload_points": normalized["max_workload_points"],
        "crm_warning_workload_ratio": normalized["warning_workload_ratio"],
        "crm_max_open_leads": normalized["max_open_leads"],
        "crm_weight_contact": normalized["stage_weights"]["Tiếp cận"],
        "crm_weight_quote": normalized["stage_weights"]["Báo giá"],
        "crm_weight_negotiation": normalized["stage_weights"]["Đàm phán"],
    }
    for key, value in values.items():
        row = db.query(FinanceSetting).filter(FinanceSetting.key == key).first()
        if row:
            row.value = value
        else:
            db.add(FinanceSetting(key=key, value=value))
    db.add(AuditLog(
        actor_id=user.id,
        action="UPDATE",
        object_type="CrmSettings",
        payload_json={"values": {key: str(value) for key, value in values.items()}},
    ))
    db.commit()
    return {"status": "success", "data": _serialize_crm_policy(normalized)}

@router.get("/stats")
def get_crm_stats(
    scope: str = Query("all"),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("crm", "read"))
):
    query = db.query(LeadPipeline)
    if scope == "mine":
        query = query.filter(or_(LeadPipeline.assigned_to.is_(None), LeadPipeline.assigned_to == user.id))
    elif scope != "all":
        raise HTTPException(status_code=422, detail="scope must be all or mine")
    total = query.count()
    won = query.filter(LeadPipeline.status == "Chốt").count()
    in_progress = query.filter(LeadPipeline.status.in_(["Tiếp cận", "Báo giá", "Đàm phán"])).count()
    win_rate = round((won / total * 100) if total > 0 else 0, 1)
    
    return {
        "status": "success",
        "data": {
            "total_leads": total,
            "won_leads": won,
            "in_progress": in_progress,
            "win_rate": win_rate
        }
    }

@router.post("/leads")
def create_lead(
    data: LeadCreateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("crm", "create"))
):
    # Find or Create Customer
    cust = db.query(Customer).filter(Customer.phone == data.phone).first()
    if not cust:
        cust = Customer(full_name=data.customer_name, phone=data.phone)
        db.add(cust)
        db.commit()
        db.refresh(cust)

    lead_id = f"LEAD-{str(uuid.uuid4())[:8].upper()}"
    new_lead = LeadPipeline(
        id=lead_id,
        customer_id=cust.id,
        source=data.source,
        requirements=data.requirements,
        status="Tiếp cận",
        assigned_to=data.assigned_to
    )
    db.add(new_lead)

    db.add(AuditLog(
        actor_id=user.id,
        action="CREATE",
        object_type="LeadPipeline",
        payload_json={"id": lead_id, "customer_name": data.customer_name}
    ))

    db.commit()
    db.refresh(new_lead)
    
    return {"status": "success", "data": {"id": new_lead.id}}

@router.get("/leads")
def get_leads(
    scope: str = Query("all"),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("crm", "read"))
):
    manager_view = _is_crm_manager(db, user)
    query = db.query(LeadPipeline)
    if scope == "mine":
        query = query.filter(or_(LeadPipeline.assigned_to.is_(None), LeadPipeline.assigned_to == user.id))
    elif scope != "all":
        raise HTTPException(status_code=422, detail="scope must be all or mine")
    leads = query.order_by(LeadPipeline.created_at.desc()).all()
    results = []
    for l in leads:
        cust = db.query(Customer).filter(Customer.id == l.customer_id).first()
        row = {
            "id": l.id,
            "customer_name": cust.full_name if cust else "Unknown",
            "phone": cust.phone if cust else "",
            "source": l.source,
            "requirements": l.requirements,
            "status": l.status,
            "assigned_to": l.assigned_to if manager_view or l.assigned_to == user.id else None,
            "created_at": l.created_at.strftime("%Y-%m-%d %H:%M") if l.created_at else ""
        }
        if manager_view and l.assigned_to:
            owner = (
                db.query(Employee)
                .filter(Employee.user_id == l.assigned_to)
                .first()
            )
            row["assigned_to_name"] = owner.full_name if owner else ""
            row["assigned_to_avatar_url"] = owner.avatar_url if owner else None
        results.append(row)
    return {"status": "success", "data": results}


@router.post("/leads/{lead_id}/claim")
def claim_lead(
    lead_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("crm", "update")),
):
    lead = (
        db.query(LeadPipeline)
        .filter(LeadPipeline.id == lead_id)
        .with_for_update()
        .first()
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead.assigned_to and lead.assigned_to != user.id:
        raise HTTPException(status_code=409, detail="Lead is already assigned")
    if lead.status not in ("Tiếp cận", "Báo giá", "Đàm phán"):
        raise HTTPException(status_code=409, detail="Only active leads can be claimed")

    if not _is_crm_manager(db, user):
        policy = _crm_policy(db)
        owned = (
            db.query(LeadPipeline)
            .filter(
                LeadPipeline.assigned_to == user.id,
                LeadPipeline.status.in_(["Tiếp cận", "Báo giá", "Đàm phán"]),
            )
            .all()
        )
        current_workload = workload_score((item.status for item in owned), policy["stage_weights"])
        if not can_claim_lead(current_workload, len(owned), policy):
            raise HTTPException(status_code=409, detail="Sale workload limit reached")

    lead.assigned_to = user.id
    db.add(AuditLog(
        actor_id=user.id,
        action="CLAIM",
        object_type="LeadPipeline",
        payload_json={"id": lead_id, "assigned_to": user.id},
    ))
    db.commit()
    return {"status": "success", "data": {"id": lead.id, "assigned_to": lead.assigned_to}}

@router.put("/leads/{lead_id}/status")
def update_lead_status(
    lead_id: str,
    body: LeadStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("crm", "update"))
):
    lead = db.query(LeadPipeline).filter(LeadPipeline.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    old_status = lead.status
    issued_total = None
    if body.new_status == "Chốt" and old_status != "Chốt":
        # Validate before changing the lead or creating any finance/dossier row.
        issued_total = parse_issued_money(body.price)

    if not _is_crm_manager(db, user) and lead.assigned_to != user.id:
        raise HTTPException(status_code=403, detail="Only the assigned Sale can update this lead")
    if not lead.assigned_to:
        raise HTTPException(status_code=409, detail="Claim the lead before changing its status")

    lead.status = body.new_status
    contract_created = False
    # --- AUTOMATION: Nếu chốt thành công -> Sinh Hợp đồng & Hồ sơ hoàn chỉnh ---
    if body.new_status == "Chốt" and old_status != "Chốt":
        customer = db.query(Customer).filter(Customer.id == lead.customer_id).first()
        if customer and body.tax_id and body.tax_id.strip():
            customer.tax_id = body.tax_id.strip()

        # 1. Mã hợp đồng chuẩn theo quy tắc Bách Khoa (xxx/BK-2026)
        contract_id = ContractService.get_next_contract_code(db)

        # 2. Xử lý giá trị hợp đồng
        numeric_total_value = float(issued_total)

        # 3. Quy đổi diện tích cho cột số (service_area)
        numeric_area = None
        if body.area:
            area_match = re.search(r"[\d\.]+", str(body.area).replace(",", "."))
            if area_match:
                try:
                    numeric_area = float(area_match.group(0))
                except (ValueError, TypeError):
                    pass

        # 4. Phân tích Dịch vụ và liên kết Gói (TaskType / ServicePackage)
        raw_req = (lead.requirements or "").strip()
        clean_svc = raw_req.split("|")[0].split("-")[0].strip() if raw_req else "Đo hiện trạng"
        task_type = (
            db.query(TaskType)
            .filter(or_(
                func.lower(TaskType.name) == clean_svc.lower(),
                TaskType.name.ilike(f"%{clean_svc}%")
            ))
            .first()
        )
        if not task_type:
            task_type = db.query(TaskType).filter(TaskType.id == "tt_001").first()

        service_package = None
        if task_type and task_type.service_package_id:
            service_package = db.query(ServicePackage).filter(ServicePackage.id == task_type.service_package_id).first()

        final_service_name = task_type.name if task_type else (clean_svc or "Đo hiện trạng")

        # 5. Mẫu hợp đồng ban hành (ContractTemplate)
        published_template = (
            db.query(ContractTemplate)
            .filter(ContractTemplate.status == "published")
            .order_by(ContractTemplate.version.desc())
            .first()
        )

        # 6. Chuẩn bị file Word (.docx) và Render thông tin
        template_path = os.path.join(os.path.dirname(__file__), "..", "templates", "Mau_Hop_Dong_Do_Dac_Bach_Khoa.docx")
        safe_id = contract_id.replace("/", "_").replace("\\", "_")
        safe_cust = re.sub(r'[^a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9]', '_', customer.full_name if customer else 'KhachHang')
        output_filename = f"HopDong_{safe_id}_{safe_cust}.docx"

        formatted_price = f"{int(numeric_total_value):,}".replace(",", ".") + " VNĐ" if numeric_total_value > 0 else "Chưa báo giá"
        price_text = "Chưa báo giá"
        if numeric_total_value > 0:
            try:
                from num2words import num2words
                price_text = num2words(int(numeric_total_value), lang='vi').capitalize() + " đồng"
            except Exception:
                pass

        context = {
            "contract_id": contract_id,
            "created_date": datetime.datetime.now().strftime("%d/%m/%Y"),
            "customer_name": customer.full_name if customer else "Khách hàng",
            "customer_address": customer.address or "",
            "customer_phone": customer.phone or "",
            "customer_tax_id": (customer.tax_id if customer and customer.tax_id else (body.tax_id or "Chưa cập nhật")),
            "service_type": final_service_name,
            "service_location": customer.address or "Tại hiện trường",
            "service_area": body.area or "Cập nhật sau",
            "total_amount": formatted_price,
            "total_amount_text": price_text
        }

        file_link = None
        doc_bytes = None
        if os.path.exists(template_path) and customer:
            try:
                doc = DocxTemplate(template_path)
                doc.render(context)
                with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as temporary:
                    output_path = temporary.name
                try:
                    doc.save(output_path)
                    with open(output_path, "rb") as f:
                        doc_bytes = f.read()
                finally:
                    try:
                        os.unlink(output_path)
                    except FileNotFoundError:
                        pass
                # The document is stored in the private object store below;
                # the browser must use the authorized contract endpoint.
                file_link = f"/api/contracts/{contract_id}/document"
            except Exception as doc_err:
                logger.warning("Không render được file docx: %s", doc_err)

        # 7. Khởi tạo Contract
        commission_policy = _crm_policy(db)
        new_contract = Contract(
            id=contract_id,
            customer_id=lead.customer_id,
            lead_id=lead.id,
            contract_template_id=published_template.id if published_template else None,
            service_type=final_service_name,
            total_value=numeric_total_value,
            date_signed=datetime.datetime.now(datetime.timezone.utc).date(),
            service_location=customer.address if customer else None,
            service_area=numeric_area,
            file_link=file_link,
            status="Chờ thực hiện",
            sale_id=lead.assigned_to,
            commission_rate_snapshot=commission_policy["commission_rate_percent"],
            commission_locked_at=datetime.datetime.now(datetime.timezone.utc),
        )
        db.add(new_contract)

        # 8. Khởi tạo ServiceLine chuẩn v2 với sổ giấy tờ tự động
        new_service_line = _create_initial_service_line(
            db,
            contract_id=contract_id,
            service_type=final_service_name,
            price=numeric_total_value,
            address=customer.address if customer else None,
            task_type_id=task_type.id if task_type else None,
            checklist_template_ids=resolve_document_selection("DEFAULT", None),
            actor_id=user.id,
        )
        if service_package and not new_service_line.service_package:
            new_service_line.service_package = service_package.name

        # 9. Ghi nhận Công nợ (Receivable) cho bộ phận Tài chính / Thu nợ
        rec = Receivable(
            id=str(uuid.uuid4()),
            contract_id=contract_id,
            paid_amount=0.0,
            remaining_amount=numeric_total_value,
        )
        db.add(rec)

        # 10. Tải file hợp đồng lên hệ thống lưu trữ MinIO & Đăng ký Tủ hồ sơ
        if doc_bytes:
            try:
                document_id = str(uuid.uuid4())
                output_storage_key = DossierFileReference.build(
                    contract_id=contract_id,
                    document_id=document_id,
                    filename=output_filename,
                ).object_key
                upload_contract_document(
                    io.BytesIO(doc_bytes),
                    output_storage_key,
                    metadata={"contract_id": contract_id, "template_id": str(published_template.id if published_template else "")},
                )
                db.execute(
                    text("""
                        insert into public.dossier_documents
                            (id, dossier_id, service_line_id, contract_id, scope, stage,
                             object_key, file_name, content_type, size_bytes, uploaded_by)
                        values (:id, null, null, :contract_id, 'CONTRACT', 'soan-ho-so',
                                :object_key, :file_name, :content_type, :size_bytes, :uploaded_by)
                    """),
                    {
                        "id": document_id,
                        "contract_id": contract_id,
                        "object_key": output_storage_key,
                        "file_name": output_filename,
                        "content_type": CONTRACT_TEMPLATE_CONTENT_TYPE,
                        "size_bytes": len(doc_bytes),
                        "uploaded_by": user.id,
                    },
                )
                db.add(ContractGeneratedDocument(
                    id=document_id,
                    contract_id=contract_id,
                    template_id=published_template.id if published_template else None,
                    status="generated",
                    output_file_link=file_link,
                    output_file_name=output_filename,
                    output_storage_key=output_storage_key,
                    render_data_snapshot=context,
                    generated_by=user.id,
                    generated_at=datetime.datetime.now(datetime.timezone.utc),
                ))
            except Exception as storage_err:
                logger.warning("Không thể lưu tài liệu hợp đồng lên storage: %s", storage_err)

        # 11. Liên kết ngược tới đơn tiếp nhận CustomerIntakeSubmission (nếu có)
        submission = db.query(CustomerIntakeSubmission).filter(
            CustomerIntakeSubmission.linked_lead_id == lead.id
        ).first()
        if submission:
            submission.linked_contract_id = contract_id
            submission.linked_service_line_id = new_service_line.id
            submission.status = "converted"
            submission.processed_by = user.id
            submission.processed_at = datetime.datetime.now(datetime.timezone.utc)

        # 12. Mở sổ giấy tờ hợp đồng
        try:
            from src.dossiers.register import open_contract_register
            open_contract_register(db, contract_id, actor_id=user.id)
        except Exception as reg_err:
            logger.warning("Không thể mở sổ cho hợp đồng %s: %s", contract_id, reg_err)

        # 13. Thông báo Telegram
        try:
            telegram_service.notify_new_contract({
                "contract_id": contract_id,
                "customer_name": customer.full_name if customer else "Khách hàng",
                "service_type": final_service_name,
                "contract_value": numeric_total_value
            })
        except Exception:
            pass

        contract_created = True

    db.add(AuditLog(
        actor_id=user.id,
        action="UPDATE_STATUS",
        object_type="LeadPipeline",
        payload_json={"id": lead_id, "old_status": old_status, "new_status": body.new_status}
    ))
        
    db.commit()
    if contract_created:
        sync_contract_read_model_after_write(db)
    return {
        "status": "success",
        "data": {
            "id": lead.id,
            "status": lead.status,
            "contract_id": contract_id if contract_created else None,
            "contract_created": contract_created,
            "service_line_id": new_service_line.id if contract_created else None,
            "file_link": new_contract.file_link if contract_created else None,
        }
    }
