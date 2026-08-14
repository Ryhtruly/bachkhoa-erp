from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.core.auth import check_user_permission, get_current_user
from src.db.database import get_db
from src.db.models import Employee, User

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

_MANAGER_NODE_REVIEW_QUERY = text(
    """
    select a.id as ref_id, n.id as task_node_id, n.node_key, wn.name as node_name,
           c.id as contract_id, sl.id as service_line_id, a.submitted_at as created_at
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
)

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
    items = []

    if check_user_permission(db, user, "contract", "update"):
        for row in db.execute(_MANAGER_NODE_REVIEW_QUERY).mappings().all():
            items.append({
                "type": "node_review",
                "label": f"Node {row['node_key'].upper()} — {row['node_name']} chờ duyệt nghiệm thu",
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
                nhan = f"Hồ sơ '{row['dossier_name']}' — có hồ sơ mới từ bộ phận đo vẽ, chờ tiếp nhận"
            else:
                ly_do = {
                    "AGENCY": "đang chờ cơ quan",
                    "SURVEYOR": "đang chờ đo vẽ sửa bản vẽ",
                    "INTERNAL": "đang chờ nội bộ",
                }.get(row["sub_status"], "đang tạm dừng")
                nhan = f"Hồ sơ '{row['dossier_name']}' {ly_do}"
            items.append({
                "type": "legal_dossier",
                "label": nhan,
                "contract_id": row["contract_id"],
                "service_line_id": row["service_line_id"],
                "node_key": row["node_key"],
                "task_node_id": row["task_node_id"],
                "dossier_id": row["dossier_id"],
                "created_at": _iso(row["created_at"]),
            })

    items.sort(key=lambda item: item["created_at"] or "")
    return {"count": len(items), "items": items}
