from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.core.auth import check_user_permission, get_current_user
from src.db.database import get_db
from src.db.models import Employee, User
from src.services.timeline_realtime import notification_event_stream
from src.core.redis_utils import get_cached_json, set_cached_json

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


@router.get("/summary")
def get_notifications_summary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cache_key = f"bachkhoa:notifications:summary:{user.id}"
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached

    items = []

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
