"""Sổ giấy tờ hồ sơ — danh mục có trước, tệp scan gắn vào sau.

Trước đây hệ thống chỉ có "file đính kèm": mở ra thấy vài tệp rời, không ai biết
còn thiếu gì. Sổ giấy tờ đảo lại thứ tự: tạo hợp đồng là đổ sẵn danh mục giấy tờ
theo Dạng hồ sơ, mọi ô ở "Chưa có", rồi lấp dần.

Hai tầng:
  • Sổ gốc   — treo ở HỢP ĐỒNG, chứa giấy KHÁCH HÀNG cung cấp (CCCD, sổ đỏ).
               Một chủ đất một bộ, ba hạng mục dùng chung.
  • Sổ thủ tục — treo ở HẠNG MỤC, chứa giấy CÔNG TY soạn và CƠ QUAN trả.
               Mỗi thủ tục đòi bộ khác nhau: Tách thửa khác Hoàn công.
"""

from typing import Any

from fastapi import HTTPException
import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

SOURCES = ("KHACH_HANG", "CONG_TY", "CO_QUAN")
SOURCE_LABELS = {
    "KHACH_HANG": "Khách hàng cung cấp",
    "CONG_TY": "Công ty soạn/lập",
    "CO_QUAN": "Cơ quan Nhà nước trả",
}

SLOT_STATUSES = ("CHUA_CO", "DA_NHAN", "DA_KY", "DA_SCAN", "DA_NOP", "BI_TRA_LAI")
STATUS_LABELS = {
    "CHUA_CO": "Chưa có",
    "DA_NHAN": "Đã nhận",
    "DA_KY": "Đã ký",
    "DA_SCAN": "Đã scan",
    "DA_NOP": "Đã nộp",
    "BI_TRA_LAI": "Được trả lại",
}

COPY_TYPES = ("BAN_CHINH", "BAN_SAO", "BAN_SAO_Y")
COPY_TYPE_LABELS = {
    "BAN_CHINH": "Bản chính",
    "BAN_SAO": "Bản sao",
    "BAN_SAO_Y": "Bản sao y công chứng",
}

# Sổ gốc do bộ phận tiếp nhận giữ; sổ thủ tục do bộ phận đang chạy bước giữ.
# Dùng để quyết định ai sửa được ô nào mà không cần xin duyệt.
SOURCE_OWNER_DEPARTMENT = {
    "KHACH_HANG": ("SALES", "LEGAL"),
    "CONG_TY": ("SURVEY", "LEGAL"),
    "CO_QUAN": ("LEGAL",),
}


def _contract_or_404(db: Session, contract_id: str) -> dict:
    row = db.execute(
        text("select id from public.contracts where id = :id"),
        {"id": contract_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy hợp đồng.")
    return dict(row)


# Độ cụ thể tăng dần. Một mẫu khai ở nhiều phạm vi thì phạm vi CỤ THỂ NHẤT
# thắng — kể cả khi nó tắt (is_default = false).
#
# Tuyệt đối không OR các phạm vi lại với nhau: mẫu GLOBAL bật + PACKAGE tắt mà
# OR thì ra bật, tức là Giám đốc tắt cho gói Pháp Lý xong nó vẫn tự tick — im
# lặng phủ quyết đúng cái quyết định vừa đưa ra.
_APPLICABILITY_RANK = {"GLOBAL": 1, "PACKAGE": 2, "TASK_TYPE": 3}

_APPLICABLE_TEMPLATES_QUERY = text("""
    select t.id, t.name, t.source, t.is_required, t.needs_original,
           t.default_quantity, t.sort_order, t.note,
           a.applicability_type, a.is_default
    from public.service_lines sl
    join public.task_types tt on tt.id = sl.task_type_id
    join public.document_template_applicabilities a
      on a.applicability_type = 'GLOBAL'
      or (a.applicability_type = 'PACKAGE'
          and a.service_package_id = coalesce(sl.service_package_id, tt.service_package_id))
      or (a.applicability_type = 'TASK_TYPE' and a.task_type_id = tt.id)
    join public.document_checklist_templates t
      on t.id = a.template_id and coalesce(t.is_active, true)
    where sl.id = :service_line_id
    order by t.sort_order, t.name
""")


def applicable_templates(db: Session, service_line_id: str) -> list[dict[str, Any]]:
    """Bộ mẫu gợi ý cho một Hạng mục, đã gộp theo độ ưu tiên phạm vi.

    Mỗi ``template_id`` chỉ ra ĐÚNG MỘT dòng. Không có phạm vi nào khớp thì
    không gợi ý — im lặng chứ không rơi về "cho hết".
    """
    gop: dict[str, dict[str, Any]] = {}
    for row in db.execute(
        _APPLICABLE_TEMPLATES_QUERY, {"service_line_id": service_line_id}
    ).mappings():
        hang = _APPLICABILITY_RANK.get(row["applicability_type"], 0)
        cu_hon = gop.get(row["id"])
        if cu_hon is not None and cu_hon["_rank"] >= hang:
            continue
        gop[row["id"]] = {
            "id": row["id"],
            "name": row["name"],
            "source": row["source"],
            "source_label": SOURCE_LABELS.get(row["source"], row["source"]),
            "is_required": bool(row["is_required"]),
            "needs_original": bool(row["needs_original"]),
            "default_quantity": int(row["default_quantity"] or 1),
            "note": row["note"],
            "applicability_type": row["applicability_type"],
            "is_default": bool(row["is_default"]),
            "_rank": hang,
        }
    ket_qua = sorted(gop.values(), key=lambda x: (SOURCES.index(x["source"]) if x["source"] in SOURCES else 9, x["name"]))
    for muc in ket_qua:
        muc.pop("_rank", None)
    return ket_qua


def checklist_options(db: Session) -> list[dict[str, Any]]:
    """Các loại giấy khách cung cấp để Giám đốc tick chọn lúc soạn hợp đồng.

    Đây là bộ chung (task_type_id null) — phần riêng của từng thủ tục do
    open_service_line_register lo khi hạng mục chạy, kê lại ở đây là bắt scan
    hai lần.
    """
    rows = db.execute(
        text("""
            select t.id, t.name, t.is_required, t.needs_original,
                   t.default_quantity, t.sort_order, t.note
            from public.document_checklist_templates t
            where t.task_type_id is null
              and t.source = 'KHACH_HANG'
              and t.is_active
            order by t.sort_order, t.name
        """)
    ).mappings().all()
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "is_required": bool(row["is_required"]),
            "needs_original": bool(row["needs_original"]),
            "default_quantity": int(row["default_quantity"] or 1),
            "note": row["note"],
        }
        for row in rows
    ]


# Trong cửa sổ EXPAND, mã nguồn phải chạy được trên CẢ schema cũ lẫn mới: nếu
# đòi cột mới ngay thì thứ tự "apply migration rồi mới deploy" trở thành bắt
# buộc, lệch một nhịp là toàn bộ đường K01 gãy giữa giờ làm việc.
#
# Dò một lần rồi nhớ. Thiếu cột thì coi như mô hình cũ (version 1) — sai theo
# hướng an toàn, và kêu to trong log để không ai tưởng mọi thứ vẫn bình thường.
_SCHEMA_CO_VERSION: dict[str, Any] = {}


def co_so_giay_theo_hang_muc(db: Session) -> bool:
    """Schema đã đủ để đọc phiếu xin miễn theo Hạng mục chưa?

    Công khai để các module khác (chuông thông báo) chọn được biến thể truy vấn
    thay vì tự dò lại — dò hai nơi là hai chỗ có thể lệch nhau.
    """
    return _co_cot_waiver_service_line(db)


def reset_schema_cache() -> None:
    """Xoá kết quả dò schema.

    BẮT BUỘC restart backend sau khi apply EXPAND. Không restart thì tiến trình
    còn giữ kết quả "chưa có cột" trong bộ nhớ và tiếp tục chạy ở chế độ legacy
    dù CSDL đã sẵn sàng — hỏng âm thầm, không log, không ai biết.
    Hàm này để test và để gọi tay khi cần, không thay được việc restart.
    """
    _SCHEMA_CO_VERSION.clear()


def require_v2_schema(db: Session) -> None:
    """Cổng cho MỌI đường GHI phụ thuộc schema V2.

    Fallback chỉ được phép bảo vệ đường ĐỌC của dữ liệu cũ. Đường ghi mà cũng
    lặng lẽ rơi về V1 thì Hạng mục mới ra đời theo mô hình legacy — sai âm thầm,
    và chỉ lộ ra vài tuần sau khi sổ giấy tờ đếm trùng.
    503 chứ không phải 500: đây là "chưa migrate", một trạng thái tạm và biết
    trước, không phải lỗi bất ngờ của hệ thống.
    """
    if not _co_cot_register_version(db):
        raise HTTPException(
            status_code=503,
            detail="Tính năng sổ giấy tờ theo Hạng mục chưa được migrate. "
                   "Cần apply đợt EXPAND rồi khởi động lại backend.",
        )


def _co_cot_register_version(db: Session) -> bool:
    """Dò bằng information_schema — một câu hỏi thẳng, trả lời đúng/sai.

    KHÔNG bọc try/except quanh truy vấn nghiệp vụ rồi coi mọi lỗi là "thiếu cột":
    mất kết nối, hết quyền, timeout đều sẽ bị nuốt thành "chạy chế độ legacy" và
    hệ thống âm thầm sai trong khi vấn đề thật nằm chỗ khác. Lỗi CSDL phải nổ.
    """
    if "value" not in _SCHEMA_CO_VERSION:
        co = bool(db.execute(text("""
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'service_lines'
              and column_name = 'document_register_version'
        """)).first())
        _SCHEMA_CO_VERSION["value"] = co
        if not co:
            logging.getLogger(__name__).warning(
                "service_lines.document_register_version chưa có — sổ giấy tờ đang chạy "
                "theo mô hình legacy (v1) cho MỌI Hạng mục. Cần apply đợt EXPAND."
            )
    return _SCHEMA_CO_VERSION["value"]


def _co_cot_waiver_service_line(db: Session) -> bool:
    if "waiver" not in _SCHEMA_CO_VERSION:
        _SCHEMA_CO_VERSION["waiver"] = bool(db.execute(text("""
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'document_slot_change_requests'
              and column_name = 'service_line_id'
        """)).first())
    return _SCHEMA_CO_VERSION["waiver"]


def register_version(db: Session, service_line_id: str) -> int:
    """Hạng mục này đọc sổ theo mô hình nào.

    Không suy từ created_at, cũng không suy từ "đã có slot chưa": một Hạng mục
    hợp lệ hoàn toàn có thể chọn 0 loại giấy, lúc đó không có slot là kết quả
    đúng chứ không phải dấu hiệu của mô hình cũ.
    """
    if not _co_cot_register_version(db):
        return 1
    ban = db.execute(
        text("select document_register_version from public.service_lines where id = :id"),
        {"id": service_line_id},
    ).scalar()
    if ban is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy Hạng mục.")
    return int(ban)


def materialize_service_line_register(
    db: Session,
    service_line_id: str,
    *,
    template_ids: list[str],
    actor_id: str | None = None,
) -> int:
    """Chụp lựa chọn thực tế của người soạn hợp đồng thành ô giấy của Hạng mục.

    ``template_ids`` là thứ người dùng THỰC SỰ để lại sau khi thêm/bớt, không
    phải danh sách is_default. Tự materialize theo is_default sẽ dựng lại đúng
    những mẫu vừa bị bỏ tick.

    Danh sách rỗng là hợp lệ: Hạng mục không thu giấy nào. Chính vì thế mô hình
    sổ phải được đánh dấu bằng cột riêng chứ không suy từ "có slot hay không".

    Gọi lại nhiều lần an toàn — chỉ thêm phần còn thiếu, không đụng ô đã có (và
    do đó không xoá mất tệp đã gắn vào ô).
    """
    require_v2_schema(db)
    line = db.execute(
        text("select id, contract_id from public.service_lines where id = :id"),
        {"id": service_line_id},
    ).mappings().first()
    if not line:
        raise HTTPException(status_code=404, detail="Không tìm thấy Hạng mục.")
    if not template_ids:
        return 0

    created = db.execute(
        text("""
            insert into public.dossier_document_slots
                (scope, contract_id, service_line_id, template_id, name, source,
                 is_required, needs_original, quantity, sort_order, updated_by)
            select 'SERVICE_LINE', :contract_id, :service_line_id, t.id, t.name, t.source,
                   t.is_required, t.needs_original, t.default_quantity, t.sort_order, :actor
            from public.document_checklist_templates t
            where t.id = any(:template_ids)
              and coalesce(t.is_active, true)
              and not exists (
                select 1 from public.dossier_document_slots s
                where s.service_line_id = :service_line_id and s.name = t.name
              )
            returning id
        """),
        {
            "contract_id": line["contract_id"],
            "service_line_id": service_line_id,
            "template_ids": list(template_ids),
            "actor": actor_id,
        },
    ).fetchall()
    return len(created)


def open_contract_register(
    db: Session,
    contract_id: str,
    *,
    actor_id: str | None = None,
    template_ids: list[str] | None = None,
) -> int:
    """Đổ sổ gốc cho hợp đồng từ bộ mẫu chung. Gọi lại nhiều lần vẫn an toàn.

    ``template_ids`` là bộ giấy Giám đốc chốt ngay lúc soạn hợp đồng. Truyền None
    thì giữ nguyên hành vi cũ — đổ cả bộ chung — vì hợp đồng tạo qua đường khác
    (API ngoài, hợp đồng cũ kích hoạt quy trình muộn) không được gãy chỉ vì màn
    soạn hợp đồng thêm một bước chọn.

    Danh sách RỖNG khác None: đó là Giám đốc cố ý nói "hợp đồng này không thu
    giấy nào từ khách", phải tôn trọng chứ không được hiểu thành "chưa chọn".
    """
    _contract_or_404(db, contract_id)
    created = db.execute(
        text("""
            insert into public.dossier_document_slots
                (scope, contract_id, service_line_id, template_id, name, source,
                 is_required, needs_original, quantity, sort_order, updated_by)
            select 'CONTRACT', :contract_id, null, t.id, t.name, t.source,
                   t.is_required, t.needs_original, t.default_quantity, t.sort_order, :actor
            from public.document_checklist_templates t
            where t.task_type_id is null
              and t.source = 'KHACH_HANG'
              and t.is_active
              and (:loc_theo_chon = false or t.id = any(:template_ids))
              and not exists (
                select 1 from public.dossier_document_slots s
                where s.contract_id = :contract_id
                  and s.scope = 'CONTRACT'
                  and s.name = t.name
              )
            returning id
        """),
        {
            "contract_id": contract_id,
            "actor": actor_id,
            "loc_theo_chon": template_ids is not None,
            "template_ids": list(template_ids or []),
        },
    ).fetchall()
    return len(created)


def open_service_line_register(
    db: Session, service_line_id: str, *, actor_id: str | None = None
) -> int:
    """Đổ sổ thủ tục cho hạng mục: bộ chung (công ty + cơ quan) cộng phần riêng
    của đúng Dạng hồ sơ mà hạng mục đó chạy."""
    line = db.execute(
        text("""
            select sl.id, sl.contract_id, sl.task_type_id
            from public.service_lines sl where sl.id = :id
        """),
        {"id": service_line_id},
    ).mappings().first()
    if not line:
        raise HTTPException(status_code=404, detail="Không tìm thấy hạng mục.")

    created = db.execute(
        text("""
            insert into public.dossier_document_slots
                (scope, contract_id, service_line_id, template_id, name, source,
                 is_required, needs_original, quantity, sort_order, updated_by)
            select 'SERVICE_LINE', :contract_id, :service_line_id, t.id, t.name, t.source,
                   t.is_required, t.needs_original, t.default_quantity, t.sort_order, :actor
            from public.document_checklist_templates t
            where t.is_active
              and (
                -- Bộ chung: chỉ phần công ty soạn và cơ quan trả. Giấy khách đưa
                -- đã nằm ở sổ gốc hợp đồng, kê lại ở đây là bắt scan hai lần.
                (t.task_type_id is null and t.source in ('CONG_TY', 'CO_QUAN'))
                -- Phần riêng của đúng thủ tục thì lấy hết, kể cả giấy khách đưa
                -- (ví dụ Hoàn công cần Giấy phép xây dựng — chỉ thủ tục này mới đòi).
                or t.task_type_id = :task_type_id
              )
              and not exists (
                select 1 from public.dossier_document_slots s
                where s.service_line_id = :service_line_id and s.name = t.name
              )
            returning id
        """),
        {
            "contract_id": line["contract_id"],
            "service_line_id": service_line_id,
            "task_type_id": line["task_type_id"],
            "actor": actor_id,
        },
    ).fetchall()
    return len(created)


# Một ô đang được miễn khi có phiếu WAIVE đã DUYỆT và chưa bị rút. Ba trạng thái
# khác đều KHÔNG tính: pending (sếp chưa xem), rejected (sếp bắt lấy bằng được),
# revoked (đã miễn rồi nhưng hoàn cảnh đổi nên đòi lại).
#
# Điều kiện này được dùng chung cho cả truy vấn hiển thị lẫn cổng chặn nộp K01.
# Hai nơi tự viết hai điều kiện riêng là con đường ngắn nhất tới cảnh nút sáng
# mà máy chủ từ chối — hoặc tệ hơn, cổng thủng mà màn hình vẫn báo xanh.
# Biến thể dùng khi schema CHƯA có cột service_line_id: không join, mọi ô đều
# coi như chưa miễn. Cổng chặn y như trước khi có tính năng miễn — an toàn.
_ACTIVE_WAIVER_JOIN_LEGACY = """
    left join lateral (
      select null::varchar as id, null::text as reason, null::text as review_note,
             null::timestamptz as reviewed_at, null::varchar as reviewed_by
      where false
    ) mien on true
"""

# Phải lọc theo Hạng mục y như _ACTIVE_WAIVER_JOIN: thiếu điều kiện này thì Hạng
# mục B thấy "đang xin miễn" chỉ vì Hạng mục A vừa gửi phiếu trên cùng một ô giấy
# cấp Hợp đồng, và nút xin miễn của B biến mất.
_WAIVER_PENDING_SQL = """exists (
             select 1 from public.document_slot_change_requests r
             where r.slot_id = s.id and r.kind = 'WAIVE' and r.status = 'pending'
               and r.service_line_id = :service_line_id
           )"""

_ACTIVE_WAIVER_JOIN = """
    left join lateral (
      select r.id, r.reason, r.review_note, r.reviewed_at, r.reviewed_by
      from public.document_slot_change_requests r
      where r.slot_id = s.id
        and r.kind = 'WAIVE'
        and r.status = 'approved'
        and r.revoked_at is null
        -- Ô cấp Hợp đồng dùng chung nhiều Hạng mục: miễn cho Hạng mục A tuyệt
        -- đối không được làm Hạng mục B hết đòi giấy.
        and r.service_line_id = :service_line_id
      limit 1
    ) mien on true
"""


_SLOTS_QUERY_TMPL = """
    select s.id, s.scope, s.contract_id, s.service_line_id, s.name, s.source,
           s.template_id,
           s.is_required, s.needs_original, s.quantity, s.copy_type,
           s.storage_location_id, loc.name as storage_location_name, loc.kind as storage_kind,
           s.status, s.note, s.sort_order,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', d.id, 'file_name', d.file_name,
                      'content_type', d.content_type, 'size_bytes', d.size_bytes,
                      'uploaded_at', d.uploaded_at, 'doc_status', d.doc_status
                    ) order by d.uploaded_at desc)
             from (
               select d.*
               from public.dossier_document_links l
               join public.dossier_documents d on d.id = l.document_id
               where l.slot_id = s.id and l.link_status = 'DANG_DUNG'
                 and d.doc_status <> 'DA_GO'
               union
               select d.*
               from public.dossier_documents d
               where d.slot_id = s.id and d.doc_status <> 'DA_GO'
             ) d
           ), '[]'::jsonb) as files,
           exists (
             select 1
             from public.dossier_document_links l
             join public.dossier_documents d on d.id = l.document_id
             where l.slot_id = s.id and l.link_status = 'DANG_DUNG'
               and d.doc_status = 'DA_THAY_THE'
           ) as has_newer_revision,
           mien.id as waiver_id, mien.reason as waiver_reason,
           mien.review_note as waiver_note, mien.reviewed_at as waiver_at,
           nguoi_duyet.full_name as waiver_by_name,
           __WAIVER_PENDING__ as waiver_pending
    from public.dossier_document_slots s
    left join public.document_storage_locations loc on loc.id = s.storage_location_id
__WAIVER_JOIN__
    left join public.employees nguoi_duyet on nguoi_duyet.user_id = mien.reviewed_by
    where s.contract_id = :contract_id
      and (
        (:service_line_id is null and s.scope = 'CONTRACT')
        or (:service_line_id is not null
            and (s.scope = 'CONTRACT' or s.service_line_id = :service_line_id))
      )
    order by s.scope desc, s.sort_order, s.name
"""


def _slots_query(db: Session):
    """Chọn biến thể truy vấn theo schema hiện có, và nhớ lại."""
    co_cot = _co_cot_waiver_service_line(db)
    khoa = "slots_sql_v2" if co_cot else "slots_sql_v1"
    if khoa not in _SCHEMA_CO_VERSION:
        cho_pending = _WAIVER_PENDING_SQL if co_cot else "false"
        _SCHEMA_CO_VERSION[khoa] = text(
            _SLOTS_QUERY_TMPL
            .replace("__WAIVER_JOIN__",
                     _ACTIVE_WAIVER_JOIN if co_cot else _ACTIVE_WAIVER_JOIN_LEGACY)
            .replace("__WAIVER_PENDING__", cho_pending)
        )
    return _SCHEMA_CO_VERSION[khoa]


def _serialize(row) -> dict[str, Any]:
    files = list(row["files"] or [])
    return {
        "id": row["id"],
        "scope": row["scope"],
        "service_line_id": row["service_line_id"],
        "name": row["name"],
        "source": row["source"],
        "source_label": SOURCE_LABELS.get(row["source"], row["source"]),
        "is_required": bool(row["is_required"]),
        "needs_original": bool(row["needs_original"]),
        "quantity": int(row["quantity"] or 1),
        "copy_type": row["copy_type"],
        "copy_type_label": COPY_TYPE_LABELS.get(row["copy_type"]),
        "storage_location_id": row["storage_location_id"],
        "storage_location_name": row["storage_location_name"],
        # Giấy không nằm trong kho công ty thì phải nói rõ — đó là thứ cần biết
        # ngay khi khách gọi hỏi giấy tờ của họ đang ở đâu.
        "storage_is_external": row["storage_kind"] == "BEN_NGOAI",
        "status": row["status"],
        "status_label": STATUS_LABELS.get(row["status"], row["status"]),
        "note": row["note"],
        # Ô tự thêm không có template_id — sếp cần thấy rõ để soi lúc duyệt.
        "template_id": row["template_id"],
        "is_custom": row["template_id"] is None,
        "files": files,
        "file_count": len(files),
        "has_newer_revision": bool(row.get("has_newer_revision", False)),
        # Ô được miễn vẫn hiện nguyên trên sổ, chỉ thôi đòi giấy. Xoá nó khỏi
        # danh sách là đánh mất chính thứ cần đọc lại sau này: hồ sơ này lẽ ra
        # cần tờ đó, và đây là lý do vì sao nó vắng.
        "is_waived": bool(row.get("waiver_id")),
        "waiver": {
            "id": row["waiver_id"],
            "reason": row["waiver_reason"],
            "director_note": row["waiver_note"],
            "approved_at": row["waiver_at"],
            "approved_by_name": row["waiver_by_name"],
        } if row.get("waiver_id") else None,
        "waiver_pending": bool(row.get("waiver_pending", False)),
    }


def phan_bo_loai_giay_theo_buoc(db: Session, service_line_id: str) -> dict[str, str]:
    """template_id → node_key nào đang nhận loại giấy đó.

    Đọc từ graph đang chạy của Hạng mục: mỗi mục checklist khai
    ``output_documents`` với ``template_id``. Một loại giấy được nhiều bước dùng
    thì lấy bước ĐẦU TIÊN theo thứ tự node — hiển thị cần một câu trả lời, còn
    việc dùng lại ở bước sau vẫn hợp lệ (nghiệp vụ cho phép).

    Loại nào không bước nào nhận thì không có trong dict — đó chính là nhóm
    "chưa phân bước" mà Giám đốc còn phải cấu hình.
    """
    dong = db.execute(
        text("""
            select k.key as node_key,
                   muc->'output_documents' as tai_lieu
            from public.workflow_instances wi
            join public.workflow_instance_revisions r
              on r.id = coalesce(wi.active_revision_id, (
                   select id from public.workflow_instance_revisions
                   where workflow_instance_id = wi.id
                   order by revision_no desc limit 1))
            cross join lateral jsonb_each(coalesce(r.graph->'nodes', '{}'::jsonb)) k
            cross join lateral jsonb_array_elements(
                   coalesce(k.value->'checklist', '[]'::jsonb)) muc
            where wi.service_line_id = :sl
              and muc ? 'output_documents'
            order by k.key
        """),
        {"sl": service_line_id},
    ).mappings().all()

    theo_mau: dict[str, str] = {}
    for row in dong:
        for muc in list(row["tai_lieu"] or []):
            tpl = muc.get("template_id")
            if tpl and tpl not in theo_mau:
                theo_mau[tpl] = row["node_key"]
    return theo_mau


def get_register(
    db: Session, contract_id: str, *, service_line_id: str | None = None
) -> dict[str, Any]:
    """Sổ giấy tờ nhìn từ một hạng mục: kèm luôn sổ gốc của hợp đồng.

    Mở chi tiết Đo vẽ hay Pháp lý đều thấy cả hai — giấy của bộ phận kia là
    "tài liệu chuyển giao", xem được nhưng không sửa thẳng.
    """
    _contract_or_404(db, contract_id)
    rows = db.execute(
        _slots_query(db),
        {"contract_id": contract_id, "service_line_id": service_line_id},
    ).mappings().all()

    slots = [_serialize(row) for row in rows]
    by_source: dict[str, list[dict]] = {source: [] for source in SOURCES}
    for slot in slots:
        by_source.setdefault(slot["source"], []).append(slot)

    required = [slot for slot in slots if slot["is_required"]]
    done = [slot for slot in required if slot["status"] != "CHUA_CO"]

    return {
        "contract_id": contract_id,
        "service_line_id": service_line_id,
        # Giao diện phải biết Hạng mục đang ở mô hình sổ nào: V1 chỉ được xem,
        # không bày thao tác ghi của V2 (xin miễn, đề xuất loại giấy).
        "register_version": register_version(db, service_line_id) if service_line_id else 1,
        # template_id -> node_key. Giao diện dùng để dán nhãn "Bước này / Chưa
        # phân bước / Bước K0x" lên từng ô giấy, và đếm số loại chưa ai nhận.
        "phan_bo_theo_buoc": (
            phan_bo_loai_giay_theo_buoc(db, service_line_id) if service_line_id else {}
        ),
        "groups": [
            {
                "source": source,
                "label": SOURCE_LABELS[source],
                "slots": by_source.get(source, []),
            }
            for source in SOURCES
        ],
        "summary": {
            "total": len(slots),
            "required": len(required),
            "required_done": len(done),
            "missing": [slot["name"] for slot in required if slot["status"] == "CHUA_CO"],
        },
    }


def update_slot(
    db: Session,
    slot_id: str,
    *,
    actor_id: str,
    actor_department: str | None,
    status: str | None = None,
    copy_type: str | None = None,
    storage_location_id: str | None = None,
    quantity: int | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    """Cập nhật một ô giấy. Giấy của bộ phận khác thì phải xin duyệt, không sửa thẳng."""
    row = db.execute(
        text("""
            select id, source, status, name, scope, contract_id, service_line_id
            from public.dossier_document_slots where id = :id
        """),
        {"id": slot_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy ô giấy tờ.")

    owners = SOURCE_OWNER_DEPARTMENT.get(row["source"], ())
    department = str(actor_department or "").upper()
    if owners and department and department not in owners and not slot_unlocked(db, slot_id):
        raise HTTPException(
            status_code=403,
            detail=(
                f"“{row['name']}” là tài liệu chuyển giao của bộ phận khác. "
                "Cần gửi yêu cầu sửa để Giám đốc duyệt."
            ),
        )

    if status is not None and status not in SLOT_STATUSES:
        raise HTTPException(status_code=400, detail="Trạng thái giấy tờ không hợp lệ.")
    if copy_type is not None and copy_type != "" and copy_type not in COPY_TYPES:
        raise HTTPException(status_code=400, detail="Loại bản (chính/sao) không hợp lệ.")

    db.execute(
        text("""
            update public.dossier_document_slots
            set status = coalesce(:status, status),
                copy_type = coalesce(nullif(:copy_type, ''), copy_type),
                storage_location_id = case when :storage_location_id = '' then null
                                           else coalesce(:storage_location_id, storage_location_id) end,
                quantity = coalesce(:quantity, quantity),
                note = coalesce(:note, note),
                updated_by = :actor,
                updated_at = now()
            where id = :id
        """),
        {
            "id": slot_id,
            "status": status,
            "copy_type": copy_type,
            "storage_location_id": storage_location_id,
            "quantity": quantity,
            "note": note,
            "actor": actor_id,
        },
    )
    return {"id": slot_id, "status": status or row["status"]}


# ── Phiếu xin sửa tài liệu chuyển giao ────────────────────────────────────────
# Giấy của bộ phận khác không sửa thẳng được. Muốn sửa thì lập phiếu, Giám đốc
# duyệt sẽ mở khoá ô đó trong một khoảng thời gian rồi tự đóng lại — tránh mở
# một lần rồi sửa mãi về sau.

UNLOCK_HOURS = 24


def slot_unlocked(db: Session, slot_id: str) -> bool:
    return bool(db.execute(
        text("""
            select 1 from public.document_slot_change_requests
            where slot_id = :slot_id and status = 'approved'
              and unlocked_until is not null and unlocked_until > now()
            limit 1
        """),
        {"slot_id": slot_id},
    ).first())


def request_slot_change(db: Session, slot_id: str, *, reason: str, requester_id: str) -> dict[str, Any]:
    ly_do = (reason or "").strip()
    if len(ly_do) < 5:
        raise HTTPException(status_code=422, detail="Cần ghi rõ lý do xin sửa (tối thiểu 5 ký tự).")
    row = db.execute(
        text("select id, name from public.dossier_document_slots where id = :id"),
        {"id": slot_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy ô giấy tờ.")
    if db.execute(
        text("""
            select 1 from public.document_slot_change_requests
            where slot_id = :id and kind = 'UNLOCK' and status = 'pending' limit 1
        """),
        {"id": slot_id},
    ).first():
        raise HTTPException(status_code=409, detail="Ô giấy tờ này đang có một phiếu chờ duyệt.")

    request_id = db.execute(
        text("""
            insert into public.document_slot_change_requests (slot_id, requested_by, reason)
            values (:slot_id, :requester, :reason)
            returning id
        """),
        {"slot_id": slot_id, "requester": requester_id, "reason": ly_do},
    ).scalar()
    return {"id": request_id, "slot_id": slot_id, "slot_name": row["name"], "status": "pending"}


def _duoc_lam_hang_muc(db: Session, service_line_id: str, user_id: str) -> bool:
    """Người này có đang thực sự làm Hạng mục đó không.

    Xin miễn giấy là một QUYẾT ĐỊNH NGHIỆP VỤ trên hồ sơ của người khác, không
    phải hành động đọc. Chỉ có ``contract:read`` mà cho xin miễn thì bất kỳ ai
    xem được hợp đồng cũng dựng được phiếu lên Hạng mục họ không dính dáng.
    """
    return bool(db.execute(
        text("""
            select 1
            from public.task_node_assignments a
            join public.employees e on e.id = a.employee_id
            join public.task_nodes n on n.id = a.task_node_id
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            where e.user_id = :user_id
              and coalesce(e.is_active, true)
              and a.assignment_status not in ('replaced', 'declined', 'cancelled')
              and wi.service_line_id = :sl
            limit 1
        """),
        {"user_id": user_id, "sl": service_line_id},
    ).first())


def request_slot_waiver(
    db: Session, slot_id: str, *, service_line_id: str, reason: str,
    requester_id: str, la_quan_tri: bool = False,
) -> dict[str, Any]:
    """Nhân viên xin bỏ một loại giấy khỏi hồ sơ này vì thực tế không có.

    Không sửa mẫu, không xoá ô, không đụng hợp đồng khác — chỉ đánh dấu đúng ô
    này của đúng hồ sơ này. Ô vẫn nằm trên sổ để sau còn đọc lại được vì sao nó
    vắng; trước đây bí quá không có đường nào nên người ta tải đại một tệp vào
    cho qua cổng, và sổ ghi nhận một thứ không có thật.
    """
    ly_do = (reason or "").strip()
    if len(ly_do) < 5:
        raise HTTPException(
            status_code=422,
            detail="Cần ghi rõ vì sao hồ sơ này không cần loại giấy đó (tối thiểu 5 ký tự).",
        )
    row = db.execute(
        text("""
            select s.id, s.name, s.scope, s.contract_id, s.service_line_id, s.is_required
            from public.dossier_document_slots s where s.id = :id
        """),
        {"id": slot_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy ô giấy tờ.")

    # Hạng mục do SERVER xác thực, không tin id frontend gửi lên: nếu tin, một
    # request nặn tay có thể miễn giấy cho Hạng mục thuộc hợp đồng khác.
    line = db.execute(
        text("select id, contract_id from public.service_lines where id = :id"),
        {"id": service_line_id},
    ).mappings().first()
    if not line:
        raise HTTPException(status_code=404, detail="Không tìm thấy Hạng mục.")
    if line["contract_id"] != row["contract_id"]:
        raise HTTPException(
            status_code=409,
            detail="Ô giấy này không thuộc hợp đồng của Hạng mục đang mở.",
        )
    if row["scope"] == "SERVICE_LINE" and row["service_line_id"] != service_line_id:
        raise HTTPException(
            status_code=409,
            detail="Ô giấy này thuộc Hạng mục khác.",
        )

    if not la_quan_tri and not _duoc_lam_hang_muc(db, service_line_id, requester_id):
        raise HTTPException(
            status_code=403,
            detail="Chỉ người đang làm Hạng mục này mới xin miễn giấy được.",
        )

    # Chỉ xin miễn được thứ đang thực sự CHẶN. Ô không bắt buộc thì thiếu cũng
    # không sao; ô đã đủ tài liệu thì không còn gì để miễn — cho xin trong hai ca
    # đó chỉ tạo rác cho hàng chờ của Giám đốc.
    if not bool(row["is_required"]):
        raise HTTPException(
            status_code=409,
            detail=f"“{row['name']}” không bắt buộc nên không cần xin miễn.",
        )
    da_co_tep = db.execute(
        text("""
            select 1 from public.dossier_document_links l
            join public.dossier_documents d on d.id = l.document_id
            where l.slot_id = :id and l.link_status = 'DANG_DUNG'
              and d.doc_status <> 'DA_GO'
            limit 1
        """),
        {"id": slot_id},
    ).first()
    if da_co_tep:
        raise HTTPException(
            status_code=409,
            detail=f"“{row['name']}” đã có tài liệu — không còn lý do để miễn.",
        )

    dang_co = db.execute(
        text("""
            select status from public.document_slot_change_requests
            where slot_id = :id and kind = 'WAIVE'
              and service_line_id = :sl
              and (status = 'pending' or (status = 'approved' and revoked_at is null))
            limit 1
        """),
        {"id": slot_id, "sl": service_line_id},
    ).scalar()
    if dang_co == "pending":
        raise HTTPException(status_code=409, detail=f"“{row['name']}” đang có phiếu xin bỏ chờ Giám đốc duyệt.")
    if dang_co == "approved":
        raise HTTPException(status_code=409, detail=f"“{row['name']}” đã được miễn cho hồ sơ này rồi.")

    # Chỉ số uq_document_slot_change_one_pending còn khoá theo slot_id KHÔNG kèm
    # Hạng mục (bản vá cho phiếu đã duyệt đã xong, bản cho phiếu chờ thì chưa —
    # xem supabase/pending/). Với ô giấy cấp Hợp đồng dùng chung, Hạng mục khác
    # đang có phiếu chờ sẽ làm INSERT này vỡ thành 500. Bắt trước để trả lời
    # đúng bản chất thay vì ném lỗi hệ thống vào mặt nhân viên.
    # Lấy cả cờ tồn tại lẫn tên: service_type có thể rỗng, nên KHÔNG được dùng
    # chính giá trị tên làm điều kiện kiểm tra.
    khac = db.execute(
        text("""
            select r.kind, coalesce(nullif(sl.service_type, ''), 'khác') as ten
            from public.document_slot_change_requests r
            left join public.service_lines sl on sl.id = r.service_line_id
            where r.slot_id = :id and r.status = 'pending'
            limit 1
        """),
        {"id": slot_id},
    ).mappings().first()
    if khac:
        # Nói ĐÚNG loại phiếu đang chặn. Bản trước gộp mọi kind lại rồi báo
        # "Hạng mục khác đang xin bỏ" — trong khi thực tế là phiếu xin mở khoá
        # của chính Hạng mục này. Người dùng đi tìm một Hạng mục không tồn tại.
        if khac["kind"] == "WAIVE":
            ly_do = f"Hạng mục “{khac['ten']}” đang có phiếu xin bỏ chờ duyệt"
        else:
            ly_do = "ô này đang có phiếu xin sửa/mở khoá chờ duyệt"
        raise HTTPException(
            status_code=409,
            detail=(
                f"“{row['name']}”: {ly_do}. Mỗi ô giấy chỉ được có một phiếu chờ "
                "duyệt tại một thời điểm — đợi phiếu đó được quyết rồi gửi lại."
            ),
        )

    request_id = db.execute(
        text("""
            insert into public.document_slot_change_requests
                (id, slot_id, service_line_id, requested_by, reason, kind, status)
            values (gen_random_uuid()::text, :slot_id, :sl, :requester, :reason, 'WAIVE', 'pending')
            returning id
        """),
        {"slot_id": slot_id, "sl": service_line_id, "requester": requester_id, "reason": ly_do},
    ).scalar()
    return {"id": request_id, "slot_id": slot_id, "slot_name": row["name"],
            "service_line_id": service_line_id, "kind": "WAIVE", "status": "pending"}


def revoke_slot_waiver(
    db: Session, slot_id: str, *, service_line_id: str, actor_id: str
) -> dict[str, Any]:
    """Đòi lại một loại giấy đã được miễn.

    Làm giữa chừng mới lòi ra là vẫn cần — cơ quan đòi, hoặc hồ sơ đổi hướng.
    Không xoá phiếu cũ: đánh dấu đã rút để lịch sử còn đủ cả hai chiều.
    """
    row = db.execute(
        text("""
            select r.id, s.name
            from public.document_slot_change_requests r
            join public.dossier_document_slots s on s.id = r.slot_id
            where r.slot_id = :id and r.kind = 'WAIVE'
              and r.service_line_id = :sl
              and r.status = 'approved' and r.revoked_at is null
            limit 1
        """),
        {"id": slot_id, "sl": service_line_id},
    ).mappings().first()
    if not row:
        raise HTTPException(
            status_code=404, detail="Ô này không đang được miễn cho Hạng mục đang mở.")

    db.execute(
        text("""
            update public.document_slot_change_requests
            set revoked_at = now(), revoked_by = :actor, updated_at = now()
            where id = :id
        """),
        {"id": row["id"], "actor": actor_id},
    )
    return {"id": row["id"], "slot_id": slot_id, "slot_name": row["name"], "status": "revoked"}


def review_slot_change(
    db: Session, request_id: str, *, decision: str, review_note: str | None, actor_id: str
) -> dict[str, Any]:
    if decision not in ("approved", "rejected"):
        raise HTTPException(status_code=422, detail="Quyết định phải là 'approved' hoặc 'rejected'.")
    row = db.execute(
        text("""
            select r.id, r.slot_id, r.requested_by, r.status, r.kind, s.name as slot_name
            from public.document_slot_change_requests r
            join public.dossier_document_slots s on s.id = r.slot_id
            where r.id = :id
            for update of r
        """),
        {"id": request_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu.")
    if row["status"] != "pending":
        raise HTTPException(status_code=409, detail="Phiếu này đã được xử lý.")
    la_phieu_mien = row["kind"] == "WAIVE"

    note = (review_note or "").strip() or None
    if decision == "rejected" and not note:
        raise HTTPException(status_code=422, detail="Từ chối thì phải ghi rõ lý do cho nhân viên.")

    db.execute(
        text("""
            update public.document_slot_change_requests
            set status = :decision, reviewed_by = :actor, reviewed_at = now(),
                review_note = :note,
                unlocked_until = case when :decision = 'approved' and not :la_mien
                                      then now() + make_interval(hours => :hours) end,
                updated_at = now()
            where id = :id
        """),
        {"decision": decision, "actor": actor_id, "note": note,
         "hours": UNLOCK_HOURS, "id": request_id, "la_mien": la_phieu_mien},
    )
    db.execute(
        text("""
            insert into public.notifications (id, user_id, title, content, is_read, created_at)
            values (gen_random_uuid()::text, :u, :title, :content, false, now())
        """),
        {
            "u": row["requested_by"],
            "title": (
                (f"Đã miễn “{row['slot_name']}” cho hồ sơ này" if decision == "approved"
                 else f"Vẫn phải lấy “{row['slot_name']}” — liên hệ khách")
                if la_phieu_mien else
                ("Được duyệt sửa tài liệu chuyển giao" if decision == "approved"
                 else "Yêu cầu sửa tài liệu bị từ chối")
            ),
            # Từ chối miễn nghĩa là "đi lấy bằng được", nên lý do của sếp là thứ
            # nhân viên bắt buộc phải đọc — không được để rỗng.
            "content": note or (
                "" if la_phieu_mien else
                (f"Ô giấy được mở khoá {UNLOCK_HOURS} giờ." if decision == "approved" else "")
            ),
        },
    )
    return {
        "id": request_id,
        "kind": row["kind"],
        "slot_id": row["slot_id"],
        "slot_name": row["slot_name"],
        "status": decision,
        "unlock_hours": 0 if la_phieu_mien else (UNLOCK_HOURS if decision == "approved" else 0),
    }


# ── Nạp scan vào một ô giấy ───────────────────────────────────────────────────

def upload_source_document(
    db: Session,
    *,
    contract_id: str,
    file_name: str,
    content_type: str | None,
    data: bytes,
    actor_id: str,
    slot_id: str | None = None,
) -> dict[str, Any]:
    """Nhận một tệp vào KHO NGUỒN của Hợp đồng.

    Upload trước, phân loại sau: lúc khách đưa giấy thì chưa ai biết tờ đó dùng
    cho hạng mục nào — việc phân loại là của bước K01. Ép chọn ô giấy ngay lúc
    upload là bắt người tiếp nhận đoán, và đoán sai thì file nằm nhầm chỗ.

    ``slot_id`` là tuỳ chọn: truyền vào khi người dùng nạp thẳng vào một ô đã
    biết, bỏ trống khi chỉ đổ giấy vào kho.
    """
    import io
    import uuid

    from src.dossiers.documents import _validate_upload
    from src.files.references import ContractFileReference
    from src.services.storage_service import delete_file, ensure_bucket, upload_file

    _validate_upload(file_name, content_type, data)
    _contract_or_404(db, contract_id)

    # Sinh id trước để đặt khoá lưu trữ: khoá gắn với document_id nên file nằm
    # yên một chỗ dù sau này phân loại lại bao nhiêu lần.
    document_id = uuid.uuid4().hex
    reference = ContractFileReference.build(
        contract_id=contract_id, document_id=document_id, filename=file_name
    )

    ensure_bucket()
    upload_file(io.BytesIO(data), reference.object_key)

    try:
        db.execute(
            text("""
                insert into public.dossier_documents
                    (id, dossier_id, service_line_id, contract_id, scope, stage, slot_id,
                     object_key, file_name, content_type, size_bytes, uploaded_by)
                values (:id, null, null, :contract_id, 'CONTRACT', 'ho-so-goc', :slot_id,
                        :object_key, :file_name, :content_type, :size_bytes, :uploaded_by)
            """),
            {
                "id": document_id,
                "contract_id": contract_id,
                "slot_id": slot_id,
                "object_key": reference.object_key,
                "file_name": file_name,
                "content_type": content_type,
                "size_bytes": len(data),
                "uploaded_by": actor_id,
            },
        )
        if slot_id:
            link_source_document(
                db,
                slot_id,
                document_id,
                actor_id=actor_id,
            )
    except Exception:
        # Ghi DB hỏng mà file đã lên kho thì thành object mồ côi không ai trỏ tới.
        try:
            delete_file(reference.object_key)
        except Exception:
            pass
        raise

    return {
        "id": document_id,
        "contract_id": contract_id,
        "file_name": file_name,
        "object_key": reference.object_key,
        "slot_id": slot_id,
    }


def _write_document_link_audit(
    db: Session,
    *,
    actor_id: str | None,
    action: str,
    document_id: str,
    slot_id: str,
    contract_id: str,
) -> None:
    """Ghi đúng tệp bị tác động; không giấu document_id trong chuỗi JSON."""
    import json

    # actor_id có khoá ngoại tới users: tra không ra thì cột buộc để null. Nhưng
    # null rỗng là mất dấu người phân loại giấy tờ, nên id được giữ trong payload.
    # Gộp trong một câu lệnh: hai câu thì tốn thêm một vòng tới database và có khe
    # cho người dùng bị xoá xen vào giữa.
    db.execute(
        text("""
            insert into public.audit_log
                (actor_id, action, object_type, object_id, payload_json, created_at)
            select
                (select u.id from public.users u where u.id = :actor),
                :action, 'dossier_document', :document_id,
                case
                  when :actor is not null
                   and not exists (select 1 from public.users u where u.id = :actor)
                  then cast(:payload as jsonb) || jsonb_build_object('actor_id_missing', :actor)
                  else cast(:payload as jsonb)
                end,
                now()
        """),
        {
            "actor": actor_id,
            "action": action,
            "document_id": document_id,
            "payload": json.dumps({
                "slot_id": slot_id,
                "contract_id": contract_id,
            }, ensure_ascii=False),
        },
    )


def link_source_document(
    db: Session,
    slot_id: str,
    document_id: str,
    *,
    actor_id: str,
) -> dict[str, Any]:
    """Phân loại một tệp nguồn vào một ô giấy khách hàng phải cung cấp.

    Tệp không bị copy hoặc đổi object key. Một document_id có thể xuất hiện ở
    nhiều ô của nhiều Hạng mục trong cùng Hợp đồng.
    """
    row = db.execute(
        text("""
            select s.id as slot_id, s.name as slot_name, s.source,
                   s.status as slot_status, s.contract_id,
                   d.id as document_id, d.doc_status
            from public.dossier_document_slots s
            join public.dossier_documents d
              on d.id = :document_id and d.contract_id = s.contract_id
            where s.id = :slot_id
        """),
        {"slot_id": slot_id, "document_id": document_id},
    ).mappings().first()
    if not row:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy tệp và ô giấy thuộc cùng một hợp đồng.",
        )
    if row["source"] != "KHACH_HANG":
        raise HTTPException(
            status_code=409,
            detail="Kho giấy khách gửi chỉ được phân loại vào ô nguồn Khách hàng.",
        )
    if row["doc_status"] in ("DA_GO", "KHONG_HOP_LE"):
        raise HTTPException(status_code=409, detail="Tệp này không còn hợp lệ để phân loại.")

    # K01 phân loại giấy khách gửi — nhưng tệp đang nằm trong một đề xuất chưa
    # duyệt thì chưa phải tài liệu chính thức, không được gán vào ô giấy.
    from src.dossiers.slot_requests import assert_document_not_reserved

    assert_document_not_reserved(db, document_id)

    existing = db.execute(
        text("""
            select id, link_status
            from public.dossier_document_links
            where document_id = :document_id and slot_id = :slot_id
            for update
        """),
        {"document_id": document_id, "slot_id": slot_id},
    ).mappings().first()
    if existing:
        link_id = existing["id"]
        if existing["link_status"] != "DANG_DUNG":
            db.execute(
                text("""
                    update public.dossier_document_links
                    set link_status = 'DANG_DUNG', linked_by = :actor,
                        linked_at = now(), unlinked_by = null, unlinked_at = null
                    where id = :id
                """),
                {"id": link_id, "actor": actor_id},
            )
    else:
        link_id = db.execute(
            text("""
                insert into public.dossier_document_links
                    (contract_id, document_id, slot_id, linked_by)
                values (:contract_id, :document_id, :slot_id, :actor)
                returning id
            """),
            {
                "contract_id": row["contract_id"],
                "document_id": document_id,
                "slot_id": slot_id,
                "actor": actor_id,
            },
        ).scalar()

    slot_status = row["slot_status"]
    if slot_status == "CHUA_CO":
        db.execute(
            text("""
                update public.dossier_document_slots
                set status = 'DA_NHAN', updated_by = :actor, updated_at = now()
                where id = :slot_id and status = 'CHUA_CO'
            """),
            {"slot_id": slot_id, "actor": actor_id},
        )
        slot_status = "DA_NHAN"

    _write_document_link_audit(
        db,
        actor_id=actor_id,
        action="LINK_SOURCE_DOCUMENT",
        document_id=document_id,
        slot_id=slot_id,
        contract_id=row["contract_id"],
    )
    return {
        "id": link_id,
        "document_id": document_id,
        "slot_id": slot_id,
        "slot_status": slot_status,
        "link_status": "DANG_DUNG",
    }


def unlink_source_document(
    db: Session,
    slot_id: str,
    document_id: str,
    *,
    actor_id: str,
) -> dict[str, Any]:
    """Gỡ phân loại nhưng giữ nguyên tệp nguồn và lịch sử nối."""
    row = db.execute(
        text("""
            select id, slot_id, document_id, contract_id, link_status
            from public.dossier_document_links
            where slot_id = :slot_id and document_id = :document_id
            for update
        """),
        {"slot_id": slot_id, "document_id": document_id},
    ).mappings().first()
    if not row or row["link_status"] != "DANG_DUNG":
        raise HTTPException(status_code=404, detail="Không tìm thấy phân loại đang dùng.")

    db.execute(
        text("""
            update public.dossier_document_links
            set link_status = 'DA_GO', unlinked_by = :actor, unlinked_at = now()
            where id = :id
        """),
        {"id": row["id"], "actor": actor_id},
    )
    remaining = db.execute(
        text("""
            select
              (select count(*) from public.dossier_document_links
               where slot_id = :slot_id and link_status = 'DANG_DUNG') as active_links,
              (select count(*) from public.dossier_documents
               where slot_id = :slot_id and doc_status <> 'DA_GO') as legacy_documents
        """),
        {"slot_id": slot_id},
    ).mappings().first()
    has_document = int(remaining["active_links"] or 0) + int(remaining["legacy_documents"] or 0) > 0
    slot_status = None
    if not has_document:
        db.execute(
            text("""
                update public.dossier_document_slots
                set status = 'CHUA_CO', updated_by = :actor, updated_at = now()
                where id = :slot_id
            """),
            {"slot_id": slot_id, "actor": actor_id},
        )
        slot_status = "CHUA_CO"

    _write_document_link_audit(
        db,
        actor_id=actor_id,
        action="UNLINK_SOURCE_DOCUMENT",
        document_id=document_id,
        slot_id=slot_id,
        contract_id=row["contract_id"],
    )
    return {
        "id": row["id"],
        "document_id": document_id,
        "slot_id": slot_id,
        "link_status": "DA_GO",
        "slot_status": slot_status,
    }



_K01_SLOTS_TMPL = """
            select s.id, s.name, s.is_required,
                   mien.id is not null as is_waived,
                   __WAIVER_PENDING__ as waiver_pending,
                   count(l.id) filter (where l.link_status = 'DANG_DUNG'
                                      and d.doc_status <> 'DA_GO') as active_link_count,
                   coalesce(bool_or(d.doc_status = 'DA_THAY_THE')
                            filter (where l.link_status = 'DANG_DUNG'), false) as has_superseded
            from public.dossier_document_slots s
            left join public.dossier_document_links l on l.slot_id = s.id
            left join public.dossier_documents d on d.id = l.document_id
__WAIVER_JOIN__
            where s.contract_id = :contract_id
              and s.source = 'KHACH_HANG'
              -- Hạng mục v2 KHÔNG đọc ô cấp Hợp đồng: bộ giấy của nó đã được
              -- chốt riêng, cộng thêm bộ cũ vào là đếm trùng CCCD/Sổ đỏ.
              and (
                (:register_version = 1 and s.scope = 'CONTRACT')
                or (s.scope = 'SERVICE_LINE' and s.service_line_id = :service_line_id)
              )
            group by s.id, s.name, s.is_required, s.sort_order, mien.id
            order by s.sort_order, s.name
        """


def _k01_slots_query(db: Session):
    """Cùng một nguồn sự thật với màn hiển thị, và cùng chịu được hai schema."""
    co_cot = _co_cot_waiver_service_line(db)
    khoa = "k01_sql_v2" if co_cot else "k01_sql_v1"
    if khoa not in _SCHEMA_CO_VERSION:
        _SCHEMA_CO_VERSION[khoa] = text(
            _K01_SLOTS_TMPL
            .replace("__WAIVER_JOIN__",
                     _ACTIVE_WAIVER_JOIN if co_cot else _ACTIVE_WAIVER_JOIN_LEGACY)
            .replace("__WAIVER_PENDING__", _WAIVER_PENDING_SQL if co_cot else "false")
        )
    return _SCHEMA_CO_VERSION[khoa]


def k01_blockers(db: Session, service_line_id: str) -> dict[str, Any]:
    """Một nguồn sự thật cho cả API hiển thị và cổng nộp checklist K01."""
    context = db.execute(
        text("""
            select id as service_line_id, contract_id
            from public.service_lines where id = :service_line_id
        """),
        {"service_line_id": service_line_id},
    ).mappings().first()
    if not context:
        raise HTTPException(status_code=404, detail="Không tìm thấy Hạng mục hợp đồng.")

    slots = db.execute(
        _k01_slots_query(db),
        {
            "contract_id": context["contract_id"],
            "service_line_id": service_line_id,
            "register_version": register_version(db, service_line_id),
        },
    ).mappings().all()
    stats = db.execute(
        text("""
            select
              count(*) filter (where d.doc_status <> 'DA_GO') as total_source_docs,
              count(*) filter (
                where d.doc_status <> 'DA_GO' and not exists (
                  select 1 from public.dossier_document_links l
                  where l.document_id = d.id and l.link_status = 'DANG_DUNG'
                )
              ) as unclassified,
              count(*) filter (
                where d.doc_status <> 'DA_GO' and exists (
                  select 1 from public.dossier_document_links l
                  where l.document_id = d.id and l.link_status = 'DANG_DUNG'
                )
              ) as linked_docs,
              (select count(*) from public.dossier_document_links l
               join public.dossier_documents linked on linked.id = l.document_id
               where linked.contract_id = :contract_id
                 and linked.doc_status <> 'DA_GO' and l.link_status = 'DANG_DUNG') as total_links
            from public.dossier_documents d
            where d.contract_id = :contract_id and d.scope = 'CONTRACT'
        """),
        {"contract_id": context["contract_id"]},
    ).mappings().first() or {}

    # MỘT CỔNG DUY NHẤT: phiếu xin miễn ĐANG CHỜ cũng thôi chặn nộp, y như phiếu
    # đã duyệt. Giấy khách không có thật thì bắt đợi duyệt phiếu mới cho nộp là
    # treo cả bước — trong khi người quyết được việc đó chính là Giám đốc ở cổng
    # nghiệm thu ngay sau đây. Đổi lại, cả hai danh sách phải được đưa tận mắt
    # Giám đốc lúc nghiệm thu, nếu không thì đây thành cửa sau bỏ giấy im lặng.
    def _duoc_bo_qua(row) -> bool:
        return bool(row["is_waived"]) or bool(row.get("waiver_pending"))

    waived = [row["name"] for row in slots if bool(row["is_waived"])]
    waiver_pending = [row["name"] for row in slots
                      if bool(row.get("waiver_pending")) and not bool(row["is_waived"])]
    required_missing = [row["name"] for row in slots
                        if row["is_required"] and not _duoc_bo_qua(row)
                        and not int(row["active_link_count"] or 0)]
    optional_missing = [row["name"] for row in slots
                        if not row["is_required"] and not _duoc_bo_qua(row)
                        and not int(row["active_link_count"] or 0)]
    superseded_in_use = [
        {"slot_id": row["id"], "slot_name": row["name"]}
        for row in slots if bool(row["has_superseded"])
    ]
    required_superseded = [
        row["name"] for row in slots
        if row["is_required"] and not _duoc_bo_qua(row) and bool(row["has_superseded"])
    ]
    blockers = []
    if required_missing:
        blockers.append({"code": "REQUIRED_MISSING", "slot_names": required_missing})
    if required_superseded:
        blockers.append({"code": "REQUIRED_SUPERSEDED", "slot_names": required_superseded})
    return {
        "service_line_id": service_line_id,
        "contract_id": context["contract_id"],
        "total_source_docs": int(stats.get("total_source_docs") or 0),
        "unclassified": int(stats.get("unclassified") or 0),
        "linked_docs": int(stats.get("linked_docs") or 0),
        "total_links": int(stats.get("total_links") or 0),
        "required_missing": required_missing,
        "waived": waived,
        "waiver_pending": waiver_pending,
        "optional_missing": optional_missing,
        "superseded_in_use": superseded_in_use,
        "required_superseded": required_superseded,
        "blockers": blockers,
        "can_submit": not blockers,
    }


def attach_scan(
    db: Session,
    slot_id: str,
    *,
    file_name: str,
    content_type: str | None,
    data: bytes,
    actor_id: str,
    actor_department: str | None,
) -> dict[str, Any]:
    """Nạp bản scan thẳng vào một ô giấy đã biết.

    Nạp xong thì trạng thái ô tự nhảy sang "Đã scan" nếu đang ở mức thấp hơn —
    nhân viên vừa tải ảnh vừa phải nhớ đổi trạng thái là thừa một thao tác, và
    quên thì sổ báo thiếu oan.
    """
    from src.dossiers.documents import _validate_upload
    from src.files.references import DossierFileReference
    from src.services.storage_service import delete_file, ensure_bucket, upload_file

    _validate_upload(file_name, content_type, data)

    row = db.execute(
        text("""
            select id, name, source, scope, status, contract_id, service_line_id
            from public.dossier_document_slots where id = :id
        """),
        {"id": slot_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy ô giấy tờ.")

    owners = SOURCE_OWNER_DEPARTMENT.get(row["source"], ())
    department = str(actor_department or "").upper()
    if owners and department and department not in owners and not slot_unlocked(db, slot_id):
        raise HTTPException(
            status_code=403,
            detail=(
                f"“{row['name']}” là tài liệu chuyển giao của bộ phận khác. "
                "Cần gửi yêu cầu sửa để Giám đốc duyệt."
            ),
        )

    if row["scope"] == "CONTRACT":
        # Ô của sổ gốc: tệp vào kho nguồn của Hợp đồng, rồi trỏ vào ô này.
        result = upload_source_document(
            db,
            contract_id=row["contract_id"],
            file_name=file_name,
            content_type=content_type,
            data=data,
            actor_id=actor_id,
            slot_id=slot_id,
        )
    else:
        import io
        import uuid

        document_id = uuid.uuid4().hex
        reference = DossierFileReference.build(
            contract_id=row["contract_id"],
            document_id=document_id,
            filename=file_name,
        )
        ensure_bucket()
        upload_file(io.BytesIO(data), reference.object_key)
        try:
            db.execute(
                text("""
                    insert into public.dossier_documents
                        (id, dossier_id, service_line_id, contract_id, scope, stage, slot_id,
                         object_key, file_name, content_type, size_bytes, uploaded_by)
                    values (:id, null, :service_line_id, :contract_id, 'SERVICE_LINE', 'soan-ho-so',
                            :slot_id, :object_key, :file_name, :content_type, :size_bytes,
                            :uploaded_by)
                """),
                {
                    "id": document_id,
                    "service_line_id": row["service_line_id"],
                    "contract_id": row["contract_id"],
                    "slot_id": slot_id,
                    "object_key": reference.object_key,
                    "file_name": file_name,
                    "content_type": content_type,
                    "size_bytes": len(data),
                    "uploaded_by": actor_id,
                },
            )
        except Exception:
            try:
                delete_file(reference.object_key)
            except Exception:
                pass
            raise
        result = {
            "id": document_id,
            "slot_id": slot_id,
            "file_name": file_name,
            "object_key": reference.object_key,
        }

    if row["status"] in ("CHUA_CO", "DA_NHAN"):
        db.execute(
            text("""
                update public.dossier_document_slots
                set status = 'DA_SCAN', updated_by = :actor, updated_at = now()
                where id = :id
            """),
            {"id": slot_id, "actor": actor_id},
        )

    return result


def read_scan(db: Session, document_id: str) -> tuple[dict, bytes]:
    from src.services.storage_service import get_file

    row = db.execute(
        text("""
            select id, object_key, file_name, content_type
            from public.dossier_documents where id = :id
        """),
        {"id": document_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy tệp.")
    return dict(row), get_file(row["object_key"])["Body"].read()


# ── Ô giấy phát sinh ngoài mẫu ────────────────────────────────────────────────

def suggest_slot_names(db: Session, *, query: str = "") -> list[dict[str, Any]]:
    """Gợi ý tên giấy từ bộ mẫu đã có, để tên tự gõ không trôi mỗi người một kiểu.

    Không có gợi ý thì sáu tháng sau sổ sẽ có "CCCD", "cccd chủ hộ" và
    "Căn cước công dân" thành ba thư mục khác nhau của cùng một tờ giấy.
    """
    rows = db.execute(
        text("""
            select distinct t.name, t.source
            from public.document_checklist_templates t
            where t.is_active
              and (:query = '' or t.name ilike '%' || :query || '%')
            order by t.name
            limit 20
        """),
        {"query": (query or "").strip()},
    ).mappings().all()
    return [{"name": row["name"], "source": row["source"]} for row in rows]


def add_slot(
    db: Session,
    *,
    contract_id: str,
    service_line_id: str | None,
    name: str,
    source: str,
    actor_id: str,
    needs_original: bool = False,
    quantity: int = 1,
    note: str | None = None,
) -> dict[str, Any]:
    """Nhân viên thêm một loại giấy phát sinh ngoài mẫu.

    Ô tự thêm luôn là KHÔNG BẮT BUỘC: để nhân viên tự đặt một ô bắt buộc rồi
    chính mình không lấp được là tự khoá đường nộp nghiệm thu của mình.
    Muốn thành bắt buộc thì đưa vào mẫu — đó là việc của Giám đốc.
    """
    ten = (name or "").strip()
    if len(ten) < 3:
        raise HTTPException(status_code=422, detail="Tên giấy tờ quá ngắn.")
    if source not in SOURCES:
        raise HTTPException(status_code=422, detail="Nguồn giấy tờ không hợp lệ.")
    _contract_or_404(db, contract_id)

    trung = db.execute(
        text("""
            select 1 from public.dossier_document_slots
            where contract_id = :contract_id
              and lower(name) = lower(:name)
              and ((:service_line_id is null and scope = 'CONTRACT')
                   or service_line_id = :service_line_id)
            limit 1
        """),
        {"contract_id": contract_id, "service_line_id": service_line_id, "name": ten},
    ).first()
    if trung:
        raise HTTPException(status_code=409, detail=f"Sổ đã có mục “{ten}”.")

    slot_id = db.execute(
        text("""
            insert into public.dossier_document_slots
                (scope, contract_id, service_line_id, template_id, name, source,
                 is_required, needs_original, quantity, note, sort_order, updated_by)
            values (:scope, :contract_id, :service_line_id, null, :name, :source,
                    false, :needs_original, :quantity, :note, 900, :actor)
            returning id
        """),
        {
            "scope": "SERVICE_LINE" if service_line_id else "CONTRACT",
            "contract_id": contract_id,
            "service_line_id": service_line_id,
            "name": ten,
            "source": source,
            "needs_original": bool(needs_original),
            "quantity": max(1, int(quantity or 1)),
            "note": (note or "").strip() or None,
            "actor": actor_id,
        },
    ).scalar()
    return {"id": slot_id, "name": ten, "source": source, "is_custom": True}


def remove_slot(db: Session, slot_id: str, *, actor_id: str) -> dict[str, Any]:
    """Gỡ một ô TỰ THÊM. Ô sinh từ mẫu thì không gỡ — đó là yêu cầu của thủ tục.

    Phải đếm hai đường mới đủ: tệp gắn thẳng vào ô qua ``dossier_documents.slot_id``
    (đường cũ), và mối nối còn hiệu lực trong ``dossier_document_links`` (đường
    mới, một tệp nguồn dùng cho nhiều hạng mục). Bỏ sót đường thứ hai thì lệnh
    xoá đi tới khoá ngoại ``restrict`` và vỡ thành lỗi DB thô, không ai hiểu.
    """
    row = db.execute(
        text("""
            select id, name, template_id,
                   (select count(*) from public.dossier_documents d
                     where d.slot_id = s.id) as so_tep,
                   (select count(*) from public.dossier_document_links l
                     where l.slot_id = s.id and l.link_status = 'DANG_DUNG') as so_noi
            from public.dossier_document_slots s where id = :id
        """),
        {"id": slot_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy ô giấy tờ.")
    if row["template_id"]:
        raise HTTPException(
            status_code=409,
            detail=f"“{row['name']}” là giấy tờ bắt buộc theo thủ tục, không gỡ được.",
        )
    so_tep = int(row["so_tep"] or 0)
    so_noi = int(row["so_noi"] or 0)
    if so_tep > 0:
        raise HTTPException(
            status_code=409,
            detail=f"“{row['name']}” đang có {so_tep} bản scan. Gỡ tệp trước đã.",
        )
    if so_noi > 0:
        raise HTTPException(
            status_code=409,
            detail=(
                f"“{row['name']}” đang nhận {so_noi} tài liệu từ kho nguồn. "
                "Gỡ tài liệu khỏi ô này trước đã."
            ),
        )
    db.execute(
        text("delete from public.dossier_document_slots where id = :id"), {"id": slot_id}
    )
    return {"id": slot_id, "deleted": True}


# ── Đưa mục phát sinh vào bộ mẫu ──────────────────────────────────────────────
# Đây là cách bộ mẫu tự lớn lên theo thực tế, thay vì phải ngồi nghĩ đủ giấy tờ
# cho 22 thủ tục ngay từ đầu. Cũng là chốt chặn để tên giấy không trôi: một khi
# đã vào mẫu thì lần sau nó hiện sẵn, không ai gõ lại theo kiểu của mình nữa.

def list_custom_slots(db: Session, contract_id: str) -> list[dict[str, Any]]:
    """Các mục nhân viên tự thêm — thứ Giám đốc cần soi khi duyệt."""
    rows = db.execute(
        text("""
            select s.id, s.name, s.source, s.scope, s.needs_original, s.quantity,
                   s.service_line_id, sl.task_type_id,
                   coalesce(tt.name, 'Mọi thủ tục') as task_type_name,
                   (select count(*) from public.dossier_documents d where d.slot_id = s.id) as file_count
            from public.dossier_document_slots s
            left join public.service_lines sl on sl.id = s.service_line_id
            left join public.task_types tt on tt.id = sl.task_type_id
            where s.contract_id = :contract_id and s.template_id is null
            order by s.created_at
        """),
        {"contract_id": contract_id},
    ).mappings().all()
    return [dict(row) for row in rows]


def promote_slot_to_template(db: Session, slot_id: str, *, actor_id: str) -> dict[str, Any]:
    """Biến một mục phát sinh thành giấy tờ chuẩn của thủ tục.

    Mục treo ở HỢP ĐỒNG thì vào bộ chung: hợp đồng có thể có nhiều hạng mục khác
    thủ tục nên không quy được về một Dạng hồ sơ cụ thể.
    Mục treo ở HẠNG MỤC thì vào đúng Dạng hồ sơ của hạng mục đó.
    """
    row = db.execute(
        text("""
            select s.id, s.name, s.source, s.scope, s.needs_original, s.quantity,
                   s.template_id, sl.task_type_id
            from public.dossier_document_slots s
            left join public.service_lines sl on sl.id = s.service_line_id
            where s.id = :id
        """),
        {"id": slot_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy ô giấy tờ.")
    if row["template_id"]:
        raise HTTPException(status_code=409, detail="Mục này đã là giấy tờ chuẩn của thủ tục.")

    task_type_id = row["task_type_id"] if row["scope"] == "SERVICE_LINE" else None

    template_id = db.execute(
        text("""
            insert into public.document_checklist_templates
                (task_type_id, name, source, is_required, needs_original,
                 default_quantity, sort_order, note)
            values (:task_type_id, :name, :source, false, :needs_original,
                    :quantity, 800, :note)
            on conflict (coalesce(task_type_id, '~chung~'), name) do update
                set is_active = true, updated_at = now()
            returning id
        """),
        {
            "task_type_id": task_type_id,
            "name": row["name"],
            "source": row["source"],
            "needs_original": row["needs_original"],
            "quantity": row["quantity"],
            "note": "Bổ sung từ thực tế hồ sơ, Giám đốc duyệt khi nghiệm thu",
        },
    ).scalar()

    # Nối ô hiện tại vào mẫu vừa tạo: từ giờ nó không còn là "phát sinh" nữa.
    db.execute(
        text("""
            update public.dossier_document_slots
            set template_id = :template_id, updated_by = :actor, updated_at = now()
            where id = :id
        """),
        {"template_id": template_id, "actor": actor_id, "id": slot_id},
    )
    return {
        "slot_id": slot_id,
        "template_id": template_id,
        "name": row["name"],
        "scope": "Mọi thủ tục" if task_type_id is None else "Thủ tục của hạng mục này",
    }


# ── Cấu hình bộ mẫu giấy tờ (màn Giám đốc) ────────────────────────────────────

def list_templates(db: Session) -> dict[str, Any]:
    """Bộ mẫu gom theo Dạng hồ sơ, kèm số hồ sơ đang dùng từng mục."""
    rows = db.execute(
        text("""
            select t.id, t.task_type_id, t.name, t.source, t.is_required,
                   t.needs_original, t.default_quantity, t.sort_order, t.note, t.is_active,
                   coalesce(tt.name, '— Bộ chung (mọi thủ tục) —') as task_type_name,
                   (select count(*) from public.dossier_document_slots s
                    where s.template_id = t.id) as in_use
            from public.document_checklist_templates t
            left join public.task_types tt on tt.id = t.task_type_id
            order by (t.task_type_id is not null), tt.name nulls first, t.sort_order, t.name
        """)
    ).mappings().all()

    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = row["task_type_id"] or ""
        grouped.setdefault(key, {
            "task_type_id": row["task_type_id"],
            "task_type_name": row["task_type_name"],
            "items": [],
        })["items"].append({
            "id": row["id"],
            "name": row["name"],
            "source": row["source"],
            "source_label": SOURCE_LABELS.get(row["source"], row["source"]),
            "is_required": bool(row["is_required"]),
            "needs_original": bool(row["needs_original"]),
            "default_quantity": int(row["default_quantity"] or 1),
            "sort_order": int(row["sort_order"] or 0),
            "note": row["note"],
            "is_active": bool(row["is_active"]),
            "in_use": int(row["in_use"] or 0),
        })

    task_types = db.execute(
        text("select id, name from public.task_types order by name")
    ).mappings().all()
    return {
        "groups": list(grouped.values()),
        "task_types": [{"id": row["id"], "name": row["name"]} for row in task_types],
    }


def upsert_template(
    db: Session,
    *,
    template_id: str | None,
    task_type_id: str | None,
    name: str,
    source: str,
    is_required: bool,
    needs_original: bool,
    default_quantity: int,
    sort_order: int,
    note: str | None,
    is_active: bool,
) -> dict[str, Any]:
    ten = (name or "").strip()
    if len(ten) < 3:
        raise HTTPException(status_code=422, detail="Tên giấy tờ quá ngắn.")
    if source not in SOURCES:
        raise HTTPException(status_code=422, detail="Nguồn giấy tờ không hợp lệ.")

    params = {
        "id": template_id,
        "task_type_id": task_type_id or None,
        "name": ten,
        "source": source,
        "is_required": bool(is_required),
        "needs_original": bool(needs_original),
        "quantity": max(1, int(default_quantity or 1)),
        "sort_order": int(sort_order or 0),
        "note": (note or "").strip() or None,
        "is_active": bool(is_active),
    }
    if template_id:
        db.execute(
            text("""
                update public.document_checklist_templates
                set name = :name, source = :source, is_required = :is_required,
                    needs_original = :needs_original, default_quantity = :quantity,
                    sort_order = :sort_order, note = :note, is_active = :is_active,
                    updated_at = now()
                where id = :id
            """),
            params,
        )
        return {"id": template_id, "name": ten}

    new_id = db.execute(
        text("""
            insert into public.document_checklist_templates
                (task_type_id, name, source, is_required, needs_original,
                 default_quantity, sort_order, note, is_active)
            values (:task_type_id, :name, :source, :is_required, :needs_original,
                    :quantity, :sort_order, :note, :is_active)
            on conflict (coalesce(task_type_id, '~chung~'), name) do update
                set source = excluded.source, is_required = excluded.is_required,
                    needs_original = excluded.needs_original,
                    default_quantity = excluded.default_quantity,
                    note = excluded.note, is_active = true, updated_at = now()
            returning id
        """),
        params,
    ).scalar()
    return {"id": new_id, "name": ten}


def deactivate_template(db: Session, template_id: str) -> dict[str, Any]:
    """Tắt một mục khỏi mẫu. KHÔNG xoá: hồ sơ đang chạy vẫn trỏ vào nó."""
    row = db.execute(
        text("select id, name from public.document_checklist_templates where id = :id"),
        {"id": template_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục trong mẫu.")
    db.execute(
        text("""
            update public.document_checklist_templates
            set is_active = false, updated_at = now() where id = :id
        """),
        {"id": template_id},
    )
    return {"id": template_id, "name": row["name"], "is_active": False}


# ── Danh mục nơi lưu bản cứng ─────────────────────────────────────────────────

def list_storage_locations(db: Session) -> list[dict[str, Any]]:
    rows = db.execute(
        text("""
            select id, name, kind, sort_order, implies_status
            from public.document_storage_locations
            where is_active
            order by sort_order, name
        """)
    ).mappings().all()
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "kind": row["kind"],
            "is_external": row["kind"] == "BEN_NGOAI",
            "implies_status": row["implies_status"],
            "implies_status_label": STATUS_LABELS.get(row["implies_status"]),
        }
        for row in rows
    ]


def upsert_storage_location(
    db: Session, *, location_id: str | None, name: str, kind: str, sort_order: int,
    implies_status: str | None = None,
) -> dict[str, Any]:
    ten = (name or "").strip()
    if len(ten) < 2:
        raise HTTPException(status_code=422, detail="Tên nơi lưu quá ngắn.")
    if kind not in ("TAI_CHO", "BEN_NGOAI"):
        raise HTTPException(status_code=422, detail="Loại nơi lưu không hợp lệ.")
    ngu_y = (implies_status or "").strip() or None
    if ngu_y and ngu_y not in SLOT_STATUSES:
        raise HTTPException(status_code=422, detail="Trạng thái ngụ ý không hợp lệ.")

    if location_id:
        db.execute(
            text("""
                update public.document_storage_locations
                set name = :name, kind = :kind, sort_order = :sort_order,
                    implies_status = :implies_status, updated_at = now()
                where id = :id
            """),
            {"id": location_id, "name": ten, "kind": kind,
             "sort_order": sort_order, "implies_status": ngu_y},
        )
        return {"id": location_id, "name": ten}

    new_id = db.execute(
        text("""
            insert into public.document_storage_locations
                (name, kind, sort_order, implies_status)
            values (:name, :kind, :sort_order, :implies_status)
            on conflict (name) do update set is_active = true, kind = excluded.kind,
                                             sort_order = excluded.sort_order,
                                             implies_status = excluded.implies_status,
                                             updated_at = now()
            returning id
        """),
        {"name": ten, "kind": kind, "sort_order": sort_order, "implies_status": ngu_y},
    ).scalar()
    return {"id": new_id, "name": ten}


def deactivate_storage_location(db: Session, location_id: str) -> dict[str, Any]:
    """Tắt chứ không xoá — hồ sơ cũ vẫn trỏ vào nơi lưu đó."""
    db.execute(
        text("""
            update public.document_storage_locations
            set is_active = false, updated_at = now() where id = :id
        """),
        {"id": location_id},
    )
    return {"id": location_id, "is_active": False}
