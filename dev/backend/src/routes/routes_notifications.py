from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.core.auth import check_user_permission, get_current_user
from src.db.database import get_db
from src.db.models import Employee, User
from src.services.timeline_realtime import notification_event_stream
from src.core.redis_utils import get_cached_json, invalidate_cache, set_cached_json
from src.contracts.workflow_runtime import flush_stale_review_batches

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

_SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
}

# Số phiếu xin bỏ giấy đang chờ của chính Hạng mục đó. Không đưa con số này lên
# chuông thì Giám đốc mở lượt nghiệm thu ra mà không biết mình sắp cho qua một
# hồ sơ thiếu giấy — và phiếu xin miễn thành cửa sau bỏ giấy im lặng.
_DEM_PHIEU_MIEN = """
           (select count(*)
              from public.document_slot_change_requests r
             where r.kind = 'WAIVE' and r.status = 'pending'
               and r.service_line_id = sl.id) as so_phieu_mien"""

_MANAGER_NODE_REVIEW_TMPL = """
    select a.id as ref_id, n.id as task_node_id, n.node_key, wn.name as node_name,
           c.id as contract_id, sl.id as service_line_id, a.submitted_at as created_at,
__DEM_PHIEU_MIEN__
    from public.task_node_acceptances a
    join public.task_nodes n on n.id = a.task_node_id
    join public.workflow_nodes wn on wn.code = n.node_code
    join public.workflow_instances wi on wi.id = n.workflow_instance_id
    join public.service_lines sl on sl.id = wi.service_line_id
    join public.contracts c on c.id = sl.contract_id
    where a.status = 'pending'
    order by a.submitted_at asc
    limit 50
    """


def _build_acceptance_query(db):
    """Chọn biến thể theo schema: DB chưa có cột service_line_id thì đếm ra 0
    chứ không làm vỡ cả chuông thông báo."""
    from src.dossiers.register import has_service_line_document_register

    waiver_count_sql = (
        _DEM_PHIEU_MIEN
        if has_service_line_document_register(db)
        else "           0 as so_phieu_mien"
    )
    return text(_MANAGER_NODE_REVIEW_TMPL.replace("__DEM_PHIEU_MIEN__", waiver_count_sql))


_MANAGER_CHECKLIST_REVIEW_QUERY = text(
    """
    select r.id as ref_id, n.id as task_node_id, n.node_key, wn.name as node_name,
           r.checklist_name, c.id as contract_id, sl.id as service_line_id,
           r.submitted_at as created_at
    from public.task_node_checklist_results r
    join public.task_nodes n on n.id = r.task_node_id
    join public.workflow_nodes wn on wn.code = n.node_code
    join public.workflow_instances wi on wi.id = n.workflow_instance_id
    join public.service_lines sl on sl.id = wi.service_line_id
    join public.contracts c on c.id = sl.contract_id
    where r.status in ('pending_approval', 'late_pending_approval')
    order by r.submitted_at asc
    limit 50
    """
)

# Phiếu thu/chi kế toán đã lập, đang nằm chờ giám đốc duyệt. Không có dòng này
# thì kế toán bấm gửi xong là tiền rơi vào im lặng: giám đốc không biết có gì để
# duyệt, kế toán không biết phiếu của mình đã đi tới đâu.
_MANAGER_CASHFLOW_APPROVAL_QUERY = text(
    """
    select t.id as voucher_id, t.transaction_type, t.amount,
           t.payer_payee_name, t.contract_id,
           coalesce(t.created_at, t.transaction_date::timestamptz) as created_at,
           bg.task_node_id, bg.node_key, bg.service_line_id
    from public.cashflow_transactions t
    -- Bám vào bước bàn giao của hợp đồng nếu có, để bấm thông báo là mở đúng chỗ.
    left join lateral (
        select n.id as task_node_id, n.node_key, sl.id as service_line_id
        from public.task_nodes n
        join public.workflow_instances wi on wi.id = n.workflow_instance_id
        join public.service_lines sl on sl.id = wi.service_line_id
        left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
        left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
        where sl.contract_id = t.contract_id
          and n.status <> 'cancelled'
          and coalesce((
                coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->>'is_handover'
              )::boolean, false)
        order by n.created_at desc
        limit 1
    ) bg on true
    where t.status in ('Chờ duyệt', 'PENDING', 'pending')
    order by coalesce(t.created_at, t.transaction_date::timestamptz) asc
    limit 50
    """
)


_EMPLOYEE_NODE_START_QUERY = text(
    """
    select distinct n.id as task_node_id, n.node_key, wn.name as node_name,
           c.id as contract_id, sl.id as service_line_id, n.status, n.updated_at as created_at
    from public.task_nodes n
    join public.task_node_assignments a
      on a.task_node_id = n.id and a.employee_id = :employee_id
     and a.assignment_status not in ('replaced', 'declined')
    join public.workflow_nodes wn on wn.code = n.node_code
    join public.workflow_instances wi on wi.id = n.workflow_instance_id
    join public.service_lines sl on sl.id = wi.service_line_id
    join public.contracts c on c.id = sl.contract_id
    where n.status in ('ready', 'rework_required')
    order by n.updated_at asc
    limit 50
    """
)

_EMPLOYEE_CHECKLIST_RESUBMIT_QUERY = text(
    """
    select distinct r.id as ref_id, n.id as task_node_id, n.node_key, wn.name as node_name,
           r.checklist_name, c.id as contract_id, sl.id as service_line_id,
           r.updated_at as created_at
    from public.task_node_checklist_results r
    join public.task_nodes n on n.id = r.task_node_id
    join public.task_node_assignments a
      on a.task_node_id = n.id and a.employee_id = :employee_id
     and a.assignment_status not in ('replaced', 'declined')
    join public.workflow_nodes wn on wn.code = n.node_code
    join public.workflow_instances wi on wi.id = n.workflow_instance_id
    join public.service_lines sl on sl.id = wi.service_line_id
    join public.contracts c on c.id = sl.contract_id
    where r.status = 'failed'
    order by r.updated_at asc
    limit 50
    """
)


_EMPLOYEE_LEGAL_DOSSIER_QUERY = text(
    """
    select d.id as dossier_id, d.status, d.sub_status, d.dossier_name,
           d.task_node_id, n.node_key, wn.name as node_name,
           d.contract_id, d.service_line_id,
           coalesce(d.updated_at, d.created_at) as created_at
    from public.legal_dossiers d
    join public.task_nodes n on n.id = d.task_node_id
    join public.workflow_nodes wn on wn.code = n.node_code
    where d.assigned_employee_id = :employee_id
      and d.status in ('ASSIGNED', 'PENDING')
    order by created_at asc
    limit 50
    """
)


def _iso(value):
    return value.isoformat() if value else None



# ── Feed sự kiện cho nhân viên ───────────────────────────────────────────────
#
# Chuông cũ dựng bằng truy vấn SUY RA nên chỉ thấy việc ĐANG CẦN LÀM. Sự kiện ĐÃ
# XẢY RA — "hồ sơ của bạn vừa được duyệt", "bị trả 2 tờ, đây là lý do" — thì suy
# không ra: duyệt xong bước đi tiếp là mất dấu.
#
# Chỉ lấy sự kiện của bước NGƯỜI ĐÓ đang giữ hoặc từng giữ, và chỉ những loại
# thật sự cần nhân viên biết. Bơm mọi loại sự kiện vào đây là biến chuông thành
# nhật ký hệ thống, và tin quan trọng chìm mất.
_EMPLOYEE_FEED_TYPES = (
    "NODE_REVIEW_COMPLETED",   # kết quả duyệt cả đợt, kèm lý do từng tờ bị trả
    "HELP_CLAIMED",            # có người nhận làm hộ
    "HELP_EXPIRED",            # hết 4 giờ không ai nhận, việc về lại tay mình
    "NODE_PAUSED",
    "NODE_RESUMED",
)

_EMPLOYEE_FEED_QUERY = text("""
    select ev.id as event_id, ev.event_type, ev.payload, ev.created_at,
           n.id as task_node_id, n.node_key, wn.name as node_name,
           c.id as contract_id, sl.id as service_line_id
    from public.task_node_events ev
    join public.task_nodes n on n.id = ev.task_node_id
    join public.workflow_nodes wn on wn.code = n.node_code
    join public.workflow_instances wi on wi.id = n.workflow_instance_id
    join public.service_lines sl on sl.id = wi.service_line_id
    join public.contracts c on c.id = sl.contract_id
    where ev.event_type = any(:event_types)
      and exists (
        select 1 from public.task_node_assignments a
        where a.task_node_id = n.id and a.employee_id = :employee_id
          and a.assignment_status <> 'declined'
      )
      -- Người tự gây ra sự kiện thì không cần báo cho chính họ.
      and (ev.actor_user_id is null or ev.actor_user_id <> :user_id)
      and not exists (
        select 1 from public.notification_reads r
        where r.event_id = ev.id and r.user_id = :user_id
      )
    order by ev.created_at desc
    limit 30
""")


def _feed_label(row) -> str:
    """Câu nhân viên đọc trên chuông. Nói kết quả, không nói tên sự kiện."""
    payload = row["payload"] or {}
    node = f"{row['node_key'].upper()} — {row['node_name']}"
    if row["event_type"] == "NODE_REVIEW_COMPLETED":
        summary = payload.get("summary") or {}
        rejected = int(summary.get("rejectedCount") or 0)
        if rejected:
            # Lý do đi kèm ngay câu đầu: bắt mở ra mới thấy là bắt nhân viên đi
            # tìm đúng thứ mình cần sửa.
            reasons = "; ".join(
                f"{item.get('documentName')}: {item.get('reason')}"
                for item in (payload.get("rejectedItems") or [])[:2]
            )
            return f"{node} — cần sửa {rejected} tờ · {reasons}"
        approved = int(summary.get("approvedCount") or 0)
        total = int(summary.get("total") or 0)
        if int(summary.get("pendingCount") or 0):
            return f"{node} — đã duyệt {approved}/{total}, còn tờ chờ duyệt"
        return f"{node} — duyệt đạt toàn bộ giấy tờ"
    if row["event_type"] == "HELP_CLAIMED":
        return f"{node} — đã có người nhận làm hộ"
    if row["event_type"] == "HELP_EXPIRED":
        return f"{node} — hết hạn nhờ hỗ trợ, việc trở lại với bạn"
    if row["event_type"] == "NODE_PAUSED":
        return f"{node} — tạm dừng: {payload.get('note') or payload.get('reason_type')}"
    if row["event_type"] == "NODE_RESUMED":
        return f"{node} — đã chạy tiếp"
    return node


def employee_event_feed(db: Session, *, user_id: str, employee_id: str | None) -> list[dict]:
    """Sự kiện chưa đọc của các bước người này đang giữ.

    Thiếu bảng notification_reads (migration C3 chưa lên) thì trả rỗng và đi
    tiếp — chuông cũ vẫn chạy, không được để cả chuông vỡ vì một phần mới.
    """
    if not employee_id:
        return []
    if not db.execute(text("select to_regclass('public.notification_reads')")).scalar():
        # Migration C3 chưa lên. Trả rỗng và đi tiếp — chuông cũ vẫn chạy, không
        # được để cả chuông vỡ vì một phần mới.
        #
        # Kiểm bảng thay vì bọc try/except quanh truy vấn: một except rộng ở đây
        # nuốt luôn lỗi cú pháp SQL, và feed im lặng trả rỗng mãi mà không ai
        # biết vì sao — đúng cái vừa xảy ra khi viết hàm này.
        return []
    rows = db.execute(_EMPLOYEE_FEED_QUERY, {
        "event_types": list(_EMPLOYEE_FEED_TYPES),
        "employee_id": employee_id,
        "user_id": user_id,
    }).mappings().all()
    return [{
        "type": "node_event",
        "event_id": row["event_id"],
        "event_type": row["event_type"],
        "label": _feed_label(row),
        "contract_id": row["contract_id"],
        "service_line_id": row["service_line_id"],
        "node_key": row["node_key"],
        "task_node_id": row["task_node_id"],
        "created_at": _iso(row["created_at"]),
    } for row in rows]


@router.get("/summary")
def get_notifications_summary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Chốt lười TRƯỚC khi đọc cache: nhân viên bị trả bài sẽ bấm chuông, chứ
    # không tự mở lại bước mình vừa nộp. Đây là cổng thật của đường chốt lười —
    # chỉ gắn ở cổng chi tiết bước thì đúng người cần tin lại không kích hoạt
    # được nó.
    #
    # Chạy trước cache vì nếu chốt xong mới trả cache cũ thì tin vừa sinh ra phải
    # đợi hết TTL mới hiện.
    employee_id = db.execute(
        text("select id from public.employees where user_id = :u limit 1"),
        {"u": user.id},
    ).scalar()
    if flush_stale_review_batches(db, employee_id=employee_id):
        db.commit()
        invalidate_cache(f"bachkhoa:notifications:summary:{user.id}")

    cache_key = f"bachkhoa:notifications:summary:{user.id}"
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached

    items = []

    # Sự kiện đã xảy ra, xếp TRƯỚC việc đang chờ: "bạn bị trả 2 tờ, đây là lý do"
    # cần thấy ngay, còn danh sách việc tồn thì lúc nào cũng ở đó.
    items.extend(employee_event_feed(db, user_id=user.id, employee_id=employee_id))

    if check_user_permission(db, user, "contract", "update"):
        for row in db.execute(_build_acceptance_query(db)).mappings().all():
            so_mien = int(row["so_phieu_mien"] or 0)
            items.append({
                "type": "node_review",
                "label": (
                    f"Node {row['node_key'].upper()} — {row['node_name']} chờ duyệt nghiệm thu"
                    + (f" · nhân viên xin bỏ {so_mien} loại giấy" if so_mien else "")
                ),
                "waiver_pending_count": so_mien,
                "contract_id": row["contract_id"],
                "service_line_id": row["service_line_id"],
                "node_key": row["node_key"],
                "task_node_id": row["task_node_id"],
                "created_at": _iso(row["created_at"]),
            })
        for row in db.execute(_MANAGER_CHECKLIST_REVIEW_QUERY).mappings().all():
            items.append({
                "type": "checklist_review",
                "label": f"Checklist '{row['checklist_name']}' ({row['node_key'].upper()}) chờ duyệt minh chứng",
                "contract_id": row["contract_id"],
                "service_line_id": row["service_line_id"],
                "node_key": row["node_key"],
                "task_node_id": row["task_node_id"],
                "created_at": _iso(row["created_at"]),
            })

    # Người duyệt tiền là giám đốc. Kế toán lập phiếu xong thì phiếu phải hiện
    # ở chuông của người duyệt, không để nằm chờ vô hạn trong sổ quỹ.
    if check_user_permission(db, user, "finance", "approve"):
        for row in db.execute(_MANAGER_CASHFLOW_APPROVAL_QUERY).mappings().all():
            is_receipt = row["transaction_type"] in ("Thu", "INCOME")
            voucher_label = "Phiếu thu" if is_receipt else "Phiếu chi"
            partner_name = row["payer_payee_name"] or "khách"
            items.append({
                "type": "cashflow_approval",
                "label": (
                    f"{voucher_label} {row['voucher_id']} — {float(row['amount'] or 0):,.0f}₫ "
                    f"từ {partner_name} chờ duyệt"
                ),
                "contract_id": row["contract_id"],
                "service_line_id": row["service_line_id"],
                "node_key": row["node_key"],
                "task_node_id": row["task_node_id"],
                "voucher_id": row["voucher_id"],
                "created_at": _iso(row["created_at"]),
            })

    employee = (
        db.query(Employee)
        .filter(Employee.user_id == user.id, Employee.is_active == True)
        .first()
    )
    if employee:
        for row in db.execute(_EMPLOYEE_NODE_START_QUERY, {"employee_id": employee.id}).mappings().all():
            action = "cần bắt đầu" if row["status"] == "ready" else "bị yêu cầu làm lại"
            items.append({
                "type": "node_start",
                "label": f"Node {row['node_key'].upper()} — {row['node_name']} {action}",
                "contract_id": row["contract_id"],
                "service_line_id": row["service_line_id"],
                "node_key": row["node_key"],
                "task_node_id": row["task_node_id"],
                "created_at": _iso(row["created_at"]),
            })
        for row in db.execute(_EMPLOYEE_CHECKLIST_RESUBMIT_QUERY, {"employee_id": employee.id}).mappings().all():
            items.append({
                "type": "checklist_resubmit",
                "label": f"Checklist '{row['checklist_name']}' ({row['node_key'].upper()}) bị từ chối — cần nộp lại",
                "contract_id": row["contract_id"],
                "service_line_id": row["service_line_id"],
                "node_key": row["node_key"],
                "task_node_id": row["task_node_id"],
                "created_at": _iso(row["created_at"]),
            })
        # Hồ sơ pháp lý chờ tiếp nhận / đang tạm dừng. Không có chuông thì nhân viên
        # pháp lý phải tự vào dò xem có việc mới không.
        for row in db.execute(
            _EMPLOYEE_LEGAL_DOSSIER_QUERY, {"employee_id": employee.id}
        ).mappings().all():
            if row["status"] == "ASSIGNED":
                notification_label = f"Hồ sơ '{row['dossier_name']}' — có hồ sơ mới từ bộ phận đo vẽ, chờ tiếp nhận"
            else:
                pause_reason = {
                    "AGENCY": "đang chờ cơ quan",
                    "SURVEYOR": "đang chờ đo vẽ sửa bản vẽ",
                    "INTERNAL": "đang chờ nội bộ",
                }.get(row["sub_status"], "đang tạm dừng")
                notification_label = f"Hồ sơ '{row['dossier_name']}' {pause_reason}"
            items.append({
                "type": "legal_dossier",
                "label": notification_label,
                "contract_id": row["contract_id"],
                "service_line_id": row["service_line_id"],
                "node_key": row["node_key"],
                "task_node_id": row["task_node_id"],
                "dossier_id": row["dossier_id"],
                "created_at": _iso(row["created_at"]),
            })

    items.sort(key=lambda item: item["created_at"] or "")
    result = {"count": len(items), "items": items}
    set_cached_json(cache_key, result, ttl_seconds=10)
    return result


class MarkReadIn(BaseModel):
    event_ids: list[str]


@router.post("/mark-read")
def mark_events_read(
    payload: MarkReadIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Đánh dấu đã đọc. Không xoá sự kiện — sự kiện là lịch sử chung của bước.

    ``on conflict do nothing``: bấm hai lần, hoặc hai tab cùng gửi, đều ra một
    dòng. Đọc rồi đọc lại không phải là lỗi.
    """
    if not payload.event_ids:
        return {"marked": 0}
    marked = db.execute(
        text("""
            insert into public.notification_reads (user_id, event_id)
            select :user_id, unnest(cast(:event_ids as text[]))
            on conflict (user_id, event_id) do nothing
        """),
        {"user_id": user.id, "event_ids": payload.event_ids},
    ).rowcount
    db.commit()
    invalidate_cache(f"bachkhoa:notifications:summary:{user.id}")
    return {"marked": int(marked or 0)}


@router.get("/events")
def stream_notification_events(
    user: User = Depends(get_current_user),
):
    """Authenticated invalidation stream; clients re-read their DB-backed summary."""
    return StreamingResponse(
        notification_event_stream(),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
