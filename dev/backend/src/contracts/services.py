import logging
import io
import uuid
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote
from fastapi import HTTPException
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from src.db.models import (
    AuditLog,
    Contract,
    ContractGeneratedDocument,
    ContractTemplate,
    Customer,
    LeadPipeline,
    Receivable,
    ServiceLine,
    ServicePackage,
    TaskType,
    User,
)
from src.services import telegram_service
from src.services.storage_service import (
    CONTRACT_TEMPLATE_CONTENT_TYPE,
    get_contract_template,
    upload_contract_document,
)
from src.core import doc_generator
from src.core.audit import log_action
from src.contracts.read_model import sync_contract_read_model_after_write
from src.files.references import DossierFileReference


CONTRACT_CODE_PATTERN = re.compile(r"^(?P<sequence>\d+)/BK-\d{4}$")
CONTRACT_DOCUMENT_TEMPLATE_VERSION = "mau_hop_dong_v1"
DOCUMENT_FILENAME_INVALID_CHARACTERS = re.compile(r'[/\\?%*:|"<>]')


def next_contract_code(contract_ids, *, year: int | None = None) -> str:
    """Return the next global contract sequence with a minimum width of three."""
    highest_sequence = max((
        int(match.group("sequence"))
        for contract_id in contract_ids
        if (match := CONTRACT_CODE_PATTERN.match((contract_id or "").strip()))
    ), default=0)
    return f"{highest_sequence + 1:03d}/BK-{year or datetime.now().year}"


def build_contract_document_snapshot(contract_data: dict) -> tuple[dict, str, str]:
    """Freeze the data and template version needed to reproduce an issued document."""
    snapshot = dict(contract_data)
    contract_id = str(snapshot["contract_id"]).strip()
    customer_name = str(snapshot.get("customer_name") or "KhachHang").strip()
    snapshot["contract_id"] = contract_id
    snapshot["_template_version"] = CONTRACT_DOCUMENT_TEMPLATE_VERSION

    safe_contract_id = DOCUMENT_FILENAME_INVALID_CHARACTERS.sub("_", contract_id).replace(" ", "_")
    safe_customer_name = DOCUMENT_FILENAME_INVALID_CHARACTERS.sub("_", customer_name).replace(" ", "_")
    filename = f"HopDong_{safe_contract_id}_{safe_customer_name}.docx"
    document_route = f"/api/contracts/{quote(contract_id, safe='/')}/document"
    return snapshot, filename, document_route


def build_contract_document_metadata(contract_id: str, customer_name: str | None) -> tuple[str, str]:
    """Return the stable API route and safe local filename without freezing document content."""
    normalized_contract_id = str(contract_id or "").strip()
    normalized_customer_name = str(customer_name or "KhachHang").strip() or "KhachHang"
    safe_contract_id = DOCUMENT_FILENAME_INVALID_CHARACTERS.sub("_", normalized_contract_id).replace(" ", "_")
    safe_customer_name = DOCUMENT_FILENAME_INVALID_CHARACTERS.sub("_", normalized_customer_name).replace(" ", "_")
    return (
        f"HopDong_{safe_contract_id}_{safe_customer_name}.docx",
        f"/api/contracts/{quote(normalized_contract_id, safe='/')}/document",
    )


def resolve_published_contract_template(db: Session, template_id: str) -> ContractTemplate:
    template = (
        db.query(ContractTemplate)
        .filter(
            ContractTemplate.id == template_id,
            ContractTemplate.status == "published",
        )
        .first()
    )
    if not template:
        raise HTTPException(
            status_code=422,
            detail="Mẫu hợp đồng không tồn tại hoặc chưa được ban hành",
        )
    if not template.template_storage_key:
        raise HTTPException(status_code=422, detail="Mẫu hợp đồng chưa có tệp DOCX riêng tư")
    return template


def _document_date(value) -> str:
    return value.strftime("%Y-%m-%d") if value and hasattr(value, "strftime") else str(value or "")


_DIGIT_WORDS = ("không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín")


def _format_three_digits_vietnamese(n: int, is_full: bool) -> str:
    hundreds, tens, units = n // 100, (n % 100) // 10, n % 10
    parts = []
    if hundreds > 0 or is_full:
        parts.append(f"{_DIGIT_WORDS[hundreds]} trăm")
        if tens == 0 and units > 0:
            parts.append("lẻ")
    if tens > 1:
        parts.append(f"{_DIGIT_WORDS[tens]} mươi")
        if units == 1:
            parts.append("mốt")
        elif units == 5:
            parts.append("lăm")
        elif units > 0:
            parts.append(_DIGIT_WORDS[units])
    elif tens == 1:
        parts.append("mười")
        if units == 5:
            parts.append("lăm")
        elif units > 0:
            parts.append(_DIGIT_WORDS[units])
    elif units > 0:
        parts.append(_DIGIT_WORDS[units])
    return " ".join(parts)


def format_currency_in_words(amount) -> str:
    """Đọc số tiền thành chữ để ghi vào hợp đồng."""
    try:
        n = int(round(float(amount or 0)))
    except (TypeError, ValueError):
        return ""
    if n <= 0:
        return ""

    units_scale = ("", "nghìn", "triệu", "tỷ")
    groups = []
    while n > 0:
        groups.append(n % 1000)
        n //= 1000

    parts = []
    for i in range(len(groups) - 1, -1, -1):
        if not groups[i]:
            continue
        group_str = _format_three_digits_vietnamese(groups[i], i < len(groups) - 1)
        parts.append(f"{group_str} {units_scale[i]}".strip())
    result_str = " ".join(parts)
    return f"{result_str[:1].upper()}{result_str[1:]} đồng chẵn"

# Backward compatibility alias
doc_tien_thanh_chu = format_currency_in_words


def _format_vietnamese_currency_number(amount) -> str:
    """20000000 → "20.000.000" (dấu chấm phân nhóm, đúng cách viết ở VN)."""
    try:
        return f"{float(amount or 0):,.0f}".replace(",", ".")
    except (TypeError, ValueError):
        return "0"


def _format_vietnamese_date(value) -> str:
    """14/08/2026 → "14 tháng 08 năm 2026"."""
    if value and hasattr(value, "strftime"):
        return value.strftime("%d tháng %m năm %Y")
    return ""


def build_current_contract_document_data(db: Session, contract_id: str) -> tuple[dict, str]:
    """Map only currently persisted contract records to DOCX template placeholders."""
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Không tìm thấy hợp đồng.")

    customer = db.query(Customer).filter(Customer.id == contract.customer_id).first()
    service_line = db.query(ServiceLine).filter(ServiceLine.contract_id == contract.id).first()
    receivable = db.query(Receivable).filter(Receivable.contract_id == contract.id).first()
    customer_name = getattr(customer, "full_name", "") or ""
    filename, _ = build_contract_document_metadata(contract.id, customer_name)

    total_val = contract.total_value if contract.total_value is not None else getattr(service_line, "price", None)
    property_addr = getattr(service_line, "property_address", "") or getattr(customer, "address", "") or ""
    service_type_val = contract.service_type or getattr(service_line, "service_type", "") or ""
    property_area = ""
    metadata = getattr(service_line, "property_metadata", None)
    if isinstance(metadata, dict):
        property_area = str(metadata.get("area") or metadata.get("dien_tich") or "")

    amount_number_str = _format_vietnamese_currency_number(total_val)
    amount_text_str = format_currency_in_words(total_val)
    signed_date_str = _format_vietnamese_date(contract.date_signed)
    due_date_str = _format_vietnamese_date(getattr(receivable, "due_date", None))

    return {
        # ── mau_hop_dong.docx ─────────────────────────────────────
        "TEN_KHACH_HANG": customer_name,
        "SO_HOP_DONG": contract.id,
        "DIA_CHI": property_addr,
        "SO_DIEN_THOAI": getattr(customer, "phone", "") or "",
        "KHACH_HANG_EMAIL": getattr(customer, "email", "") or "",
        "GIA_TRI_HOP_DONG": amount_number_str,
        "LOAI_DICH_VU": service_type_val,
        "NGAY_KY": signed_date_str,
        "NGAY_HET_HAN": due_date_str,
        "MA_HO_SO": str(getattr(service_line, "id", "") or "")[:8],

        # ── Mau_Hop_Dong_Do_Dac_Bach_Khoa.docx ────────────────────
        "contract_id": contract.id,
        "customer_name": customer_name,
        "customer_phone": getattr(customer, "phone", "") or "",
        "customer_address": getattr(customer, "address", "") or "",
        "customer_tax_id": getattr(customer, "tax_id", "") or "",
        "service_type": service_type_val,
        "service_location": property_addr,
        "service_area": property_area,
        "total_amount": amount_number_str,
        "total_amount_text": amount_text_str,
        "created_date": signed_date_str,

        # ── Giữ lại cho nơi khác đang đọc bộ tên cũ ───────────────
        "phone": getattr(customer, "phone", "") or "",
        "customer_email": getattr(customer, "email", "") or "",
        "address": property_addr,
        "contract_value": total_val if total_val is not None else "",
        "date_signed": signed_date_str,
        "due_date": due_date_str,
        "sales_source": "",
    }, filename


CHE_DO_CHON_GIAY = ("DEFAULT", "CUSTOM", "NONE")


def phan_giai_lua_chon_giay(mode, template_ids):
    """Đổi payload tường minh thành thứ tầng dưới hiểu, hoặc 422.

    Trả về ``TU_DONG_THEO_MAC_DINH`` (sentinel nội bộ) hoặc một danh sách mã mẫu.
    Sentinel là chi tiết cài đặt của server — KHÔNG bao giờ được sinh ra từ việc
    client thiếu field.
    """
    from fastapi import HTTPException

    if mode is None:
        raise HTTPException(
            status_code=422,
            detail="Thiếu document_selection_mode. Phải nói rõ DEFAULT, CUSTOM hay NONE.",
        )
    if mode not in CHE_DO_CHON_GIAY:
        raise HTTPException(
            status_code=422,
            detail=f"document_selection_mode không hợp lệ. Chọn: {', '.join(CHE_DO_CHON_GIAY)}.",
        )

    if mode == "DEFAULT":
        if template_ids:
            raise HTTPException(
                status_code=422,
                detail="Chế độ DEFAULT không nhận danh sách tự chọn. Dùng CUSTOM nếu muốn tự chọn.",
            )
        return TU_DONG_THEO_MAC_DINH

    if mode == "CUSTOM":
        # Yêu cầu ít nhất một mã: "CUSTOM mà rỗng" và "NONE" nhìn giống nhau
        # trong dữ liệu nhưng khác hẳn về ý định. Bắt nói rõ bằng NONE.
        if not template_ids:
            raise HTTPException(
                status_code=422,
                detail="Chế độ CUSTOM phải chọn ít nhất một loại giấy. "
                       "Không thu giấy nào thì dùng NONE.",
            )
        return list(template_ids)

    # NONE
    if template_ids:
        raise HTTPException(
            status_code=422,
            detail="Chế độ NONE không đi kèm danh sách giấy tờ.",
        )
    return []


class _TuDongTheoMacDinh:
    """Sentinel: người gọi KHÔNG đi qua màn chọn giấy.

    Phân biệt ba thứ hoàn toàn khác nhau, mà nếu cùng biểu diễn bằng ``None``
    thì frontend quên gửi field sẽ bị hiểu nhầm thành "tự chọn mặc định":

    * ``[]``                  — người dùng CHỦ ĐỘNG chọn không thu giấy nào
    * ``["t1", "t2"]``        — chọn đúng hai mẫu đó
    * ``TU_DONG_THEO_MAC_DINH`` — luồng tự động, chưa có UI chọn; lấy đúng những
      applicability có ``is_default = true``, không phải mọi mẫu phù hợp
    """

    def __repr__(self) -> str:  # pragma: no cover - chỉ để log dễ đọc
        return "TU_DONG_THEO_MAC_DINH"


TU_DONG_THEO_MAC_DINH = _TuDongTheoMacDinh()


def _create_initial_service_line(
    db: Session,
    *,
    contract_id: str,
    service_type: str,
    price: float,
    address: str | None = None,
    task_type_id: str | None = None,
    priority: str = "NORMAL",
    priority_reason: str | None = None,
    priority_set_by: str | None = None,
    # KHÔNG có giá trị mặc định: mọi nơi tạo Hạng mục buộc phải nói rõ ý định.
    # Có mặc định thì một đường tạo mới quên truyền sẽ lặng lẽ dựng cả bộ giấy.
    checklist_template_ids: list[str] | _TuDongTheoMacDinh,
    actor_id: str | None = None,
) -> ServiceLine:
    """Create the first contract item from the create-contract form.

    Nối hạng mục theo KHOÁ (`task_type_id`) khi form gửi lên; chỉ lùi về so tên
    khi thiếu khoá (hợp đồng cũ / gọi API tay). Tên có thể trùng giữa hai gói nên
    so tên là đường dễ chọn nhầm.
    """
    normalized_service = (service_type or "").strip()
    task_type = None
    service_package = None
    if task_type_id:
        task_type = db.query(TaskType).filter(TaskType.id == task_type_id).first()
    if task_type is None and normalized_service:
        task_type = (
            db.query(TaskType)
            .filter(func.lower(TaskType.name) == normalized_service.lower())
            .first()
        )
        if task_type and task_type.service_package_id:
            service_package = (
                db.query(ServicePackage)
                .filter(ServicePackage.id == task_type.service_package_id)
                .first()
            )

    # Chặn TRƯỚC khi tạo. Nếu schema chưa sẵn sàng thì phải từ chối tường minh
    # (503) chứ không được đẻ ra một Hạng mục V1 rồi coi như thành công — đó
    # đúng là kiểu hỏng âm thầm mà cả thiết kế này sinh ra để tránh.
    from src.dossiers.register import require_v2_schema

    require_v2_schema(db)

    service_line = ServiceLine(
        id=str(uuid.uuid4()),
        contract_id=contract_id,
        service_package_id=task_type.service_package_id if task_type else None,
        service_package=service_package.name if service_package else None,
        task_type_id=task_type.id if task_type else None,
        service_type=task_type.name if task_type else normalized_service,
        target_property=address or None,
        property_address=address or None,
        price=price,
        priority=priority,
        priority_reason=priority_reason if priority != "NORMAL" else None,
        priority_set_by=priority_set_by if priority != "NORMAL" else None,
        priority_set_at=(datetime.now(timezone.utc) if priority != "NORMAL" else None),
    )
    db.add(service_line)

    # Sổ giấy tờ phải ra đời CÙNG Hạng mục, trong cùng transaction.
    #
    # Tách hai bước là mở ra một khe: Hạng mục đã là version 2 (nghĩa là "chỉ đọc
    # sổ riêng của tôi") nhưng sổ chưa kịp dựng — nhân viên mở ra thấy trống
    # trơn, tưởng hợp đồng không cần giấy nào và cho qua K01. Lỗi ở bước
    # materialize thì Hạng mục cũng phải biến mất theo.
    #
    # flush để service_line có mặt trong transaction: slot có FK trỏ vào nó.
    db.flush()

    # Ghi mô hình sổ bằng SQL thuần, KHÔNG qua model: cột này chưa được map để
    # các truy vấn ORM khác còn chạy được trên CSDL chưa migrate. Đến đây thì
    # require_v2_schema() ở trên đã bảo đảm cột tồn tại.
    db.execute(
        text("update service_lines set document_register_version = 2 where id = :id"),
        {"id": service_line.id},
    )

    _materialize_so_giay_to(
        db,
        service_line_id=service_line.id,
        checklist_template_ids=checklist_template_ids,
        actor_id=actor_id,
    )
    return service_line


def _materialize_so_giay_to(
    db: Session,
    *,
    service_line_id: str,
    checklist_template_ids: list[str] | _TuDongTheoMacDinh,
    actor_id: str | None,
) -> int:
    """Chụp lựa chọn giấy tờ thành sổ của Hạng mục. Dùng chung cho MỌI đường tạo.

    ``None`` = người gọi không đi qua màn chọn (đường tự động, API ngoài) — dựng
    theo bộ gợi ý mặc định để Hạng mục không ra đời với sổ trống ngoài ý muốn.
    ``[]`` = người dùng CỐ Ý không thu giấy nào — tôn trọng, và đó vẫn là một
    Hạng mục version 2 hợp lệ.
    """
    from src.core.audit import log_action
    from src.dossiers.register import applicable_templates, materialize_service_line_register

    if isinstance(checklist_template_ids, _TuDongTheoMacDinh):
        chon = [
            muc["id"] for muc in applicable_templates(db, service_line_id)
            if muc["is_default"]
        ]
        nguon_chon = "TU_DONG_MAC_DINH"
    else:
        # Kể cả danh sách rỗng — đó là một lựa chọn, không phải thiếu dữ liệu.
        chon = list(checklist_template_ids)
        nguon_chon = "NGUOI_DUNG_CHON"

    so_o = materialize_service_line_register(
        db, service_line_id, template_ids=chon, actor_id=actor_id
    )
    log_action(
        db,
        actor_id,
        "SERVICE_LINE_REGISTER_MATERIALIZED",
        "service_line",
        {
            "service_line_id": service_line_id,
            "nguon_chon": nguon_chon,
            "so_mau_chon": len(chon),
            "so_o_tao": so_o,
            "document_register_version": 2,
        },
    )
    return so_o


class ContractService:

    @staticmethod
    def get_next_contract_code(db: Session) -> str:
        if db.bind and db.bind.dialect.name == "postgresql":
            db.execute(
                text("SELECT pg_advisory_xact_lock(:lock_key)"),
                {"lock_key": 2_026_081_201},
            )
        contract_ids = (contract_id for contract_id, in db.query(Contract.id).all())
        return next_contract_code(contract_ids)

    @staticmethod
    def create_contract(db: Session, payload, actor_id: Optional[str] = None) -> dict:
        try:
            template = resolve_published_contract_template(db, payload.contract_template_id)
            cust_name = payload.customer_name
            contract_id = (payload.contract_id or "").strip() or ContractService.get_next_contract_code(db)
            service_type = payload.service_type
            contract_val = float(payload.contract_value or 0)
            paid_val = float(payload.paid_amount or 0)

            customer = db.query(Customer).filter(Customer.full_name == cust_name).first()
            if not customer:
                customer = Customer(id=str(uuid.uuid4()), full_name=cust_name)
                db.add(customer)
                db.flush()
                
            new_hd = Contract(
                id=contract_id,
                customer_id=customer.id,
                service_type=service_type,
                total_value=contract_val,
                date_signed=datetime.now().date(),
                contract_template_id=template.id,
            )
            db.add(new_hd)

            service_line = _create_initial_service_line(
                db,
                contract_id=new_hd.id,
                service_type=service_type,
                price=contract_val,
                # Đường tạo hợp đồng từ task (không qua màn soạn) — khai DEFAULT
                # tường minh, đúng như đường CRM.
                checklist_template_ids=phan_giai_lua_chon_giay("DEFAULT", None),
                actor_id=actor_id,
            )

            rec = Receivable(
                id=str(uuid.uuid4()),
                contract_id=new_hd.id,
                paid_amount=paid_val,
                remaining_amount=contract_val - paid_val
            )
            db.add(rec)

            actor_exists = db.query(User.id).filter(User.id == actor_id).first() if actor_id else None
            actor_id_val = actor_id if actor_exists else None

            db.add(AuditLog(
                actor_id=actor_id_val,
                action="CREATE",
                object_type="Contract",
                payload_json={
                    "id": new_hd.id,
                    "customer": cust_name,
                    "total_value": contract_val
                }
            ))
            
            # Sổ gốc mở ngay lúc ký hợp đồng: đó là lúc CSKH cầm giấy tờ của
            # khách trên tay. Chờ tới khi kích hoạt quy trình mới dựng sổ thì
            # giấy đã nhận rồi mà không có chỗ ghi.
            #
            # Nhưng KHÔNG được để hợp đồng hỏng vì sổ: sổ là thứ phái sinh và tự
            # lành — mở lại lúc kích hoạt quy trình, và thao tác mở là idempotent.
            # Hợp đồng mới là thứ khách đã ký, mất nó mới là mất thật.
            try:
                from src.dossiers.register import open_contract_register

                # Không truyền template_ids nữa: lựa chọn đã materialize vào
                # sổ của Hạng mục ở trên. Giữ lời gọi này cho tương thích —
                # Hạng mục version 2 không đọc ô cấp Hợp đồng nên chúng vô hại,
                # còn hợp đồng cũ / đường API ngoài vẫn cần sổ gốc.
                open_contract_register(db, new_hd.id, actor_id=actor_id_val)
            except Exception:
                logging.getLogger(__name__).warning(
                    "Không mở được sổ giấy tờ cho hợp đồng %s; sẽ mở lại khi kích hoạt quy trình.",
                    new_hd.id,
                    exc_info=True,
                )

            db.commit()
            sync_contract_read_model_after_write(db)

            telegram_service.notify_new_contract({
                "contract_id": new_hd.id,
                "customer_name": cust_name,
                "service_type": service_type,
                "contract_value": contract_val
            })
            return {
                "status": "success",
                "id": new_hd.id,
                "service_line_id": service_line.id,
            }
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    def _find_or_create_customer(db: Session, payload, *, cust_name, phone, address, actor_id):
        """Tìm khách cũ theo KHOÁ ĐỊNH DANH, không theo tên (tên dễ trùng)."""
        from datetime import date as _date

        ctype = (getattr(payload, "customer_type", None) or "individual").strip().lower()
        tax_id = (getattr(payload, "tax_id", None) or "").strip() or None
        cccd = (getattr(payload, "id_card_number", None) or "").strip() or None

        address_location = {
            'detail': (getattr(payload, 'address_detail', None) or '').strip(),
            'province_code': (getattr(payload, 'province_code', None) or '').strip(),
            'province_name': (getattr(payload, 'province_name', None) or '').strip(),
            'ward_code': (getattr(payload, 'ward_code', None) or '').strip(),
            'ward_name': (getattr(payload, 'ward_name', None) or '').strip(),
        }
        address_location = {key: value for key, value in address_location.items() if value}

        customer = None
        cid = (getattr(payload, "customer_id", None) or "").strip()
        if cid:
            customer = db.query(Customer).filter(Customer.id == cid).first()
        if customer is None and ctype == "business" and tax_id:
            customer = db.query(Customer).filter(Customer.tax_id == tax_id).first()
        if customer is None and ctype != "business" and cccd:
            customer = db.query(Customer).filter(Customer.id_card_number == cccd).first()
        if customer is None and phone:
            customer = db.query(Customer).filter(Customer.phone == phone).first()

        def _parse_date(v):
            try:
                return _date.fromisoformat(v) if v else None
            except Exception:
                return None

        if customer is None:
            customer = Customer(
                id=str(uuid.uuid4()),
                customer_type=ctype,
                full_name=cust_name,
                phone=phone,
                address=address,
                tax_id=tax_id,
                id_card_number=cccd,
                id_card_date=_parse_date(getattr(payload, "id_card_date", None)),
                id_card_place=(getattr(payload, "id_card_place", None) or "").strip() or None,
                email=(getattr(payload, "email", None) or "").strip() or None,
                zalo_phone=(getattr(payload, "zalo_phone", None) or "").strip() or None,
                representative_name=(getattr(payload, "representative_name", None) or "").strip() or None,
                representative_role=(getattr(payload, "representative_role", None) or "").strip() or None,
                source_channel="contract_form",
            )
            if address_location:
                customer.source_reference = {'contract_address': address_location}
            db.add(customer)
            db.flush()
            return customer

        def _fill_empty(field, value):
            if value and not getattr(customer, field, None):
                setattr(customer, field, value)

        _fill_empty("tax_id", tax_id)
        _fill_empty("id_card_number", cccd)
        _fill_empty("id_card_date", _parse_date(getattr(payload, "id_card_date", None)))
        _fill_empty("id_card_place", (getattr(payload, "id_card_place", None) or "").strip() or None)
        _fill_empty("email", (getattr(payload, "email", None) or "").strip() or None)
        _fill_empty("zalo_phone", (getattr(payload, "zalo_phone", None) or "").strip() or None)
        _fill_empty("representative_name", (getattr(payload, "representative_name", None) or "").strip() or None)
        _fill_empty("representative_role", (getattr(payload, "representative_role", None) or "").strip() or None)
        _fill_empty("address", address)
        if address_location:
            source_reference = dict(getattr(customer, 'source_reference', None) or {})
            source_reference.setdefault('contract_address', address_location)
            customer.source_reference = source_reference
        db.flush()
        return customer

    @staticmethod
    def generate_and_save_contract(db: Session, payload, actor_id: Optional[str] = None) -> dict:
        # Phân giải lựa chọn giấy tờ NGAY ĐẦU, trước mọi lệnh ghi.
        #
        # Payload thiếu hoặc mâu thuẫn phải nổ 422 khi chưa có gì được tạo — bảo
        # đảm bằng thứ tự thực thi chứ không dựa vào rollback. Rollback vẫn có,
        # nhưng phụ thuộc vào nó nghĩa là mọi đường gọi mới đều phải nhớ bọc
        # try/except cho đúng, và sẽ có ngày ai đó quên.
        lua_chon_giay = phan_giai_lua_chon_giay(
            getattr(payload, "document_selection_mode", None),
            getattr(payload, "document_template_ids", None),
        )
        try:
            template = resolve_published_contract_template(db, payload.contract_template_id)
            contract_id = (payload.contract_id or "").strip() or ContractService.get_next_contract_code(db)
            cust_name = payload.customer_name
            document_filename, document_route = build_contract_document_metadata(contract_id, cust_name)
            phone = payload.phone
            address = payload.address
            service_type = payload.service_type
            contract_val = float(payload.contract_value or 0)
            date_signed_str = payload.date_signed

            customer = ContractService._find_or_create_customer(
                db, payload, cust_name=cust_name, phone=phone, address=address, actor_id=actor_id
            )
                
            try:
                d_signed = datetime.strptime(date_signed_str, "%Y-%m-%d").date()
            except Exception:
                d_signed = datetime.now().date()
                
            new_hd = Contract(
                id=contract_id,
                customer_id=customer.id,
                service_type=service_type,
                total_value=contract_val,
                date_signed=d_signed,
                file_link=document_route,
                contract_template_id=template.id,
            )
            db.add(new_hd)

            document_snapshot, _, _ = build_contract_document_snapshot({
                'contract_id': contract_id,
                'customer_name': cust_name,
                'customer_phone': phone,
                'phone': phone,
                'customer_address': address,
                'address': address,
                'service_type': service_type,
                'contract_value': contract_val,
                'total_amount': contract_val,
                'date_signed': date_signed_str,
                'due_date': getattr(payload, 'due_date', '') or '',
                'sales_source': getattr(payload, 'sales_source', '') or '',
                'customer_email': getattr(payload, 'email', None) or getattr(payload, 'customer_email', '') or '',
            })
            template_bytes = get_contract_template(template.template_storage_key)
            document_bytes = doc_generator.render_contract_document(
                document_snapshot,
                CONTRACT_DOCUMENT_TEMPLATE_VERSION,
                template_bytes=template_bytes,
            )
            document_id = str(uuid.uuid4())
            output_storage_key = DossierFileReference.build(
                contract_id=contract_id,
                document_id=document_id,
                # The user-facing filename may contain the customer's name;
                # object keys must not. Keep the display filename in DB, but use
                # a neutral immutable leaf in private storage.
                filename=f"contract-{document_id}.docx",
            ).object_key
            upload_contract_document(
                io.BytesIO(document_bytes),
                output_storage_key,
                metadata={'contract_id': contract_id, 'template_id': str(template.id)},
            )

            # Xác thực actor TRƯỚC khi tạo Hạng mục: materialize sổ giấy tờ ghi
            # audit ngay trong lời gọi đó, cần biết ai là người thao tác.
            actor_exists = db.query(User.id).filter(User.id == actor_id).first() if actor_id else None
            actor_id_val = actor_id if actor_exists else None

            service_line = _create_initial_service_line(
                db,
                contract_id=new_hd.id,
                service_type=service_type,
                price=contract_val,
                address=address,
                task_type_id=getattr(payload, "task_type_id", None),
                # Lựa chọn của người soạn hợp đồng neo vào HẠNG MỤC, không vào
                # Hợp đồng: một Hợp đồng nhiều Hạng mục thì mỗi Hạng mục có bộ
                # giấy riêng, chốt ở cấp Hợp đồng là sai phạm vi.
                checklist_template_ids=lua_chon_giay,
                actor_id=actor_id_val,
                priority=(getattr(payload, "priority", None) or "NORMAL"),
                priority_reason=getattr(payload, "priority_reason", None),
                priority_set_by=actor_id,
            )

            # ContractGeneratedDocument is retained as the generation/audit
            # record, while dossier_documents is the single file registry used
            # by the document rules. The object is uploaded exactly once and
            # this row only records that same object key.
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
                    "file_name": document_filename,
                    "content_type": CONTRACT_TEMPLATE_CONTENT_TYPE,
                    "size_bytes": len(document_bytes),
                    "uploaded_by": actor_id_val,
                },
            )
            
            rec = Receivable(
                id=str(uuid.uuid4()),
                contract_id=new_hd.id,
                paid_amount=0.0,
                remaining_amount=contract_val
            )
            db.add(rec)
            
            db.add(ContractGeneratedDocument(
                id=document_id,
                contract_id=contract_id,
                template_id=template.id,
                status="generated",
                output_file_link=document_route,
                output_file_name=document_filename,
                output_storage_key=output_storage_key,
                render_data_snapshot=document_snapshot,
                generated_by=actor_id_val,
                generated_at=datetime.now(timezone.utc),
            ))

            db.add(AuditLog(
                actor_id=actor_id_val,
                action="GENERATE",
                object_type="Contract",
                payload_json={
                    "id": new_hd.id,
                    "customer": cust_name,
                    "total_value": contract_val
                }
            ))
                    
            db.commit()
            sync_contract_read_model_after_write(db)
            
            telegram_service.notify_new_contract({
                "contract_id": new_hd.id,
                "customer_name": cust_name,
                "service_type": service_type,
                "contract_value": contract_val
            })
            return {
                "status": "success",
                "id": new_hd.id,
                "service_line_id": service_line.id,
                "download_url": document_route,
            }
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    def override_handover(db: Session, contract_id: str, reason: str, actor_id: str) -> dict:
        """Giám đốc duyệt cho nợ và cho phép xuất biên bản bàn giao tại Node K06."""
        if not (reason or "").strip():
            raise HTTPException(status_code=400, detail="Bắt buộc phải nhập lý do phê duyệt ngoại lệ.")
        try:
            contract = db.query(Contract).filter(Contract.id == contract_id).first()
            if not contract:
                raise HTTPException(status_code=404, detail=f"Không tìm thấy hợp đồng '{contract_id}'.")

            contract.completion_override = True
            contract.completion_override_by = actor_id
            contract.completion_override_reason = reason
            contract.completion_override_at = datetime.now(timezone.utc)

            log_action(
                db=db,
                actor_id=actor_id,
                action="OVERRIDE_HANDOVER",
                object_type="Contract",
                payload={"contract_id": contract_id, "reason": reason, "completion_override": True}
            )

            db.commit()
            sync_contract_read_model_after_write(db)
            return {
                "status": "success",
                "contract_id": contract.id,
                "completion_override": True,
                "completion_override_reason": contract.completion_override_reason,
                "completion_override_at": contract.completion_override_at.isoformat() if contract.completion_override_at else None,
            }
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    def write_off_debt(db: Session, contract_id: str, reason: str, actor_id: str) -> dict:
        """Giám đốc duyệt xóa nợ / miễn giảm công nợ cho hợp đồng."""
        if not (reason or "").strip():
            raise HTTPException(status_code=400, detail="Bắt buộc phải nhập lý do xóa nợ / miễn giảm.")
        try:
            contract = db.query(Contract).filter(Contract.id == contract_id).first()
            if not contract:
                raise HTTPException(status_code=404, detail=f"Không tìm thấy hợp đồng '{contract_id}'.")

            rec = db.query(Receivable).filter(Receivable.contract_id == contract_id).first()
            if not rec:
                rec = Receivable(
                    contract_id=contract_id,
                    paid_amount=0.0,
                    remaining_amount=float(contract.total_value or 0.0),
                )
                db.add(rec)
                db.flush()

            rec.is_written_off = True
            rec.written_off_by = actor_id
            rec.written_off_reason = reason
            rec.written_off_at = datetime.now(timezone.utc)

            log_action(
                db=db,
                actor_id=actor_id,
                action="WRITE_OFF_DEBT",
                object_type="Receivable",
                payload={"contract_id": contract_id, "reason": reason, "remaining_amount": float(rec.remaining_amount or 0)}
            )

            db.commit()
            sync_contract_read_model_after_write(db)
            return {
                "status": "success",
                "contract_id": contract.id,
                "is_written_off": True,
                "written_off_reason": rec.written_off_reason,
                "written_off_at": rec.written_off_at.isoformat() if rec.written_off_at else None,
            }
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    def get_eligible_carry_forward_targets(db: Session, contract_id: str) -> dict:
        """Lấy danh sách các hợp đồng hợp lệ của cùng khách hàng để nhận chuyển nợ."""
        source_c = db.query(Contract).filter(Contract.id == contract_id).first()
        if not source_c:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy hợp đồng nguồn '{contract_id}'.")

        # Lấy thông tin khách hàng
        customer = db.query(Customer).filter(Customer.id == source_c.customer_id).first() if source_c.customer_id else None
        customer_name = customer.full_name if customer else "Khách hàng"

        # Lọc các hợp đồng khác của cùng khách hàng
        query = db.query(Contract).filter(
            Contract.id != contract_id,
            Contract.status.notin_(["cancelled", "closed", "written_off"]) if Contract.status is not None else True
        )
        if source_c.customer_id:
            query = query.filter(Contract.customer_id == source_c.customer_id)

        target_contracts = query.order_by(Contract.date_signed.desc().nullslast(), Contract.created_at.desc()).all()

        targets_data = []
        for tc in target_contracts:
            rec = db.query(Receivable).filter(Receivable.contract_id == tc.id).first()
            remaining = float(rec.remaining_amount) if rec and rec.remaining_amount is not None else float(tc.total_value or 0.0)
            paid = float(rec.paid_amount) if rec and rec.paid_amount is not None else 0.0

            targets_data.append({
                "id": tc.id,
                "customer_id": tc.customer_id,
                "customer_name": customer_name,
                "service_type": tc.service_type or tc.service_package or "Hợp đồng dịch vụ",
                "total_value": float(tc.total_value or 0.0),
                "paid_amount": paid,
                "remaining_amount": remaining,
                "date_signed": tc.date_signed.strftime("%d/%m/%Y") if tc.date_signed else None,
                "status": tc.status or "active"
            })

        return {
            "source_contract_id": contract_id,
            "customer_id": source_c.customer_id,
            "customer_name": customer_name,
            "targets": targets_data
        }

    @staticmethod
    def carry_forward_debt(db: Session, contract_id: str, target_contract_id: str, reason: str, actor_id: str) -> dict:
        """Giám đốc duyệt chuyển nợ hợp đồng cũ sang hợp đồng mới."""
        if not (target_contract_id or "").strip():
            raise HTTPException(status_code=400, detail="Bắt buộc phải chọn hợp đồng nhận nợ.")
        if contract_id == target_contract_id:
            raise HTTPException(status_code=400, detail="Không thể chuyển nợ sang chính hợp đồng này.")
        if not (reason or "").strip():
            raise HTTPException(status_code=400, detail="Bắt buộc phải nhập lý do chuyển nợ.")
        try:
            source_c = db.query(Contract).filter(Contract.id == contract_id).first()
            if not source_c:
                raise HTTPException(status_code=404, detail=f"Không tìm thấy hợp đồng nguồn '{contract_id}'.")

            target_c = db.query(Contract).filter(Contract.id == target_contract_id).first()
            if not target_c:
                raise HTTPException(status_code=404, detail=f"Không tìm thấy hợp đồng đích '{target_contract_id}'.")

            source_rec = db.query(Receivable).filter(Receivable.contract_id == contract_id).first()
            if not source_rec:
                source_rec = Receivable(
                    contract_id=contract_id,
                    paid_amount=0.0,
                    remaining_amount=float(source_c.total_value or 0.0),
                )
                db.add(source_rec)
                db.flush()

            debt_amount = float(source_rec.remaining_amount or 0.0)

            target_rec = db.query(Receivable).filter(Receivable.contract_id == target_contract_id).first()
            if not target_rec:
                target_rec = Receivable(
                    contract_id=target_contract_id,
                    paid_amount=0.0,
                    remaining_amount=float(target_c.total_value or 0.0),
                )
                db.add(target_rec)
                db.flush()

            # Set carry forward links
            source_rec.carried_forward_to = target_contract_id
            target_rec.carried_forward_from = contract_id
            target_rec.remaining_amount = float(target_rec.remaining_amount or 0.0) + debt_amount

            log_action(
                db=db,
                actor_id=actor_id,
                action="CARRY_FORWARD_DEBT",
                object_type="Receivable",
                payload={
                    "source_contract_id": contract_id,
                    "target_contract_id": target_contract_id,
                    "debt_transferred": debt_amount,
                    "reason": reason,
                }
            )

            db.commit()
            sync_contract_read_model_after_write(db)
            return {
                "status": "success",
                "source_contract_id": contract_id,
                "target_contract_id": target_contract_id,
                "debt_transferred": debt_amount,
                "carried_forward_to": target_contract_id,
            }
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))
