"""Domain service for drafting and activating service-line workflows.

The graph remains the immutable definition of a revision.  Activation
materializes queryable runtime rows for nodes, checklist results and employee
assignments in the same database transaction.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import text
from sqlalchemy.orm import Session


ROLE_CODE_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")
APPROVER_ROLE_RE = re.compile(r"^[a-z][a-z0-9_]*$")
OUTCOME_CODE_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")
PAY_SCOPES = {"ONCE_PER_WORKFLOW", "PER_OCCURRENCE", "MANUAL"}
CANCELLATION_CODES = {
    "CUSTOMER_REQUEST",
    "DUPLICATE_OR_ERROR",
    "CONTRACT_TERMINATED",
    "SCOPE_CHANGED",
    "OTHER",
}


class WorkflowValidationError(ValueError):
    """A business validation error that is safe to return to the client."""


def _parse_datetime(value: Any, field_name: str) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as exc:
        raise WorkflowValidationError(f"{field_name} không đúng định dạng ngày giờ") from exc


def _normalize_assignment(raw: dict[str, Any], node_key: str) -> dict[str, Any]:
    employee_id = str(raw.get("employee_id") or "").strip()
    role_code = str(raw.get("role_code") or "MAIN").strip().upper()
    if not employee_id:
        raise WorkflowValidationError(f"Node {node_key}: phân công chưa chọn nhân viên")
    if not ROLE_CODE_RE.fullmatch(role_code):
        raise WorkflowValidationError(f"Node {node_key}: mã vai trò {role_code!r} không hợp lệ")

    return {
        "employee_id": employee_id,
        "role_code": role_code,
        "is_primary": bool(raw.get("is_primary")),
        "notes": str(raw.get("notes") or "").strip() or None,
    }


def _current_work_item_rates(db: Session) -> dict[str, dict[str, dict[str, Any]]]:
    """Return active, published rates effective today grouped by work item and role."""
    rows = db.execute(text("""
        select wi.id as work_item_id, wi.code, wi.name, wr.id as rate_id,
               wr.role_code, wr.amount
        from public.work_items wi
        join public.work_item_rates wr on wr.work_item_id = wi.id
        where wi.is_active
          and wr.status = 'published'
          and current_date <@ wr.effective_period
        order by wi.code, wr.role_code
    """)).mappings().all()
    result: dict[str, dict[str, dict[str, Any]]] = {}
    for row in rows:
        result.setdefault(row["work_item_id"], {})[row["role_code"]] = dict(row)
    return result


def _checklist_evidence_data(item: dict[str, Any], *, include_files: bool) -> dict[str, Any]:
    data = {
        "required": bool(item.get("require_evidence")),
        "description": item.get("evidence_description") or "",
        "drive_folder_url": item.get("drive_folder_url"),
    }
    if include_files:
        data["files"] = []
    return data


def _ensure_manual_checklist_assignment(
    db: Session,
    *,
    checklist_result_id: str,
    checklist_item: dict[str, Any],
    node_assignments: list[dict[str, Any]],
    actor_id: str,
    reason: str,
) -> None:
    """Persist the manually selected checklist owner without duplicating pay rows."""
    employee_id = checklist_item.get("assignee_employee_id")
    if not employee_id:
        return
    node_assignment = next(
        (item for item in node_assignments if item.get("employee_id") == employee_id),
        None,
    )
    if not node_assignment:
        return
    exists = db.execute(
        text("""
            select 1 from public.task_node_checklist_assignments
            where checklist_result_id = :checklist_result_id
              and employee_id = :employee_id
              and pay_slot = 'WORK'
              and status not in ('replaced', 'cancelled')
            limit 1
        """),
        {"checklist_result_id": checklist_result_id, "employee_id": employee_id},
    ).first()
    if exists:
        return
    db.execute(
        text("""
            insert into public.task_node_checklist_assignments
                (checklist_result_id, employee_id, role_code, pay_slot,
                 share_percent, status, assigned_by, reason)
            values
                (:checklist_result_id, :employee_id, :role_code, 'WORK',
                 100, 'assigned', :actor_id, :reason)
        """),
        {
            "checklist_result_id": checklist_result_id,
            "employee_id": employee_id,
            "role_code": node_assignment.get("role_code") or "MAIN",
            "actor_id": actor_id,
            "reason": reason,
        },
    )


def _validate_drive_url(value: Any, *, node_key: str, checklist_name: str) -> str | None:
    """Normalize an optional legacy evidence link.

    New checklist evidence is uploaded to MinIO at execution time.  Older graph
    revisions can still contain a Drive URL (or a MinIO/public object URL), so
    keep the field readable without making a Google hostname an activation
    requirement.
    """
    url = str(value or "").strip()
    if not url:
        return None
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise WorkflowValidationError(
            f"Node {node_key}: link minh chứng của checklist {checklist_name!r} "
            "phải là URL HTTP/HTTPS hợp lệ"
        )
    return url


def validate_workflow_graph(
    db: Session,
    graph: dict[str, Any],
    *,
    minimum_start_date: date | None = None,
) -> dict[str, Any]:
    """Validate and normalize the JSON graph against live catalog/employee rows."""
    if not isinstance(graph, dict):
        raise WorkflowValidationError("Cấu trúc workflow phải là một object JSON")
    raw_nodes = graph.get("nodes")
    if not isinstance(raw_nodes, dict) or not raw_nodes:
        raise WorkflowValidationError("Workflow phải có ít nhất một Node")

    start_node = str(graph.get("start_node") or "").strip()
    if not start_node or start_node not in raw_nodes:
        raise WorkflowValidationError("Node bắt đầu không tồn tại trong workflow")

    active_codes = {
        row[0]
        for row in db.execute(text(
            "select code from public.workflow_nodes where coalesce(is_active, true)"
        )).all()
    }
    normalized = dict(graph)
    normalized_nodes: dict[str, Any] = {}
    employee_ids: set[str] = set()
    work_item_rates = _current_work_item_rates(db)

    for raw_key, raw_node in raw_nodes.items():
        node_key = str(raw_key).strip()
        if not node_key or not isinstance(raw_node, dict):
            raise WorkflowValidationError("Mỗi Node phải có key và dữ liệu hợp lệ")
        node_code = str(raw_node.get("task_code") or "").strip().upper()
        if node_code not in active_codes:
            raise WorkflowValidationError(f"Node {node_key}: cụm công việc {node_code!r} không tồn tại hoặc đã tắt")

        transitions = raw_node.get("transitions") or {}
        if not isinstance(transitions, dict):
            raise WorkflowValidationError(f"Node {node_key}: transitions phải là object")
        normalized_transitions: dict[str, str] = {}
        for raw_outcome, raw_target in transitions.items():
            outcome = str(raw_outcome).strip().upper()
            target = str(raw_target).strip()
            if not OUTCOME_CODE_RE.fullmatch(outcome):
                raise WorkflowValidationError(f"Node {node_key}: mã kết quả {outcome!r} không hợp lệ")
            if target not in raw_nodes:
                raise WorkflowValidationError(f"Node {node_key}: nhánh {outcome} trỏ tới Node không tồn tại")
            normalized_transitions[outcome] = target

        checklist = raw_node.get("checklist") or []
        if not isinstance(checklist, list):
            raise WorkflowValidationError(f"Node {node_key}: checklist phải là danh sách")
        checklist_keys: set[str] = set()
        payable_work_items: set[str] = set()
        normalized_checklist: list[dict[str, Any]] = []
        for index, raw_item in enumerate(checklist, start=1):
            if not isinstance(raw_item, dict):
                raise WorkflowValidationError(f"Node {node_key}: checklist số {index} không hợp lệ")
            checklist_key = str(raw_item.get("key") or f"item_{index}").strip()
            checklist_name = str(raw_item.get("name") or "").strip()
            if not checklist_name:
                raise WorkflowValidationError(f"Node {node_key}: checklist số {index} chưa có tên")
            if checklist_key in checklist_keys:
                raise WorkflowValidationError(f"Node {node_key}: trùng key checklist {checklist_key}")
            checklist_keys.add(checklist_key)
            raw_compensation = raw_item.get("compensation") or {}
            if not isinstance(raw_compensation, dict):
                raise WorkflowValidationError(
                    f"Node {node_key}: cấu hình khoán của checklist {checklist_name!r} không hợp lệ"
                )
            is_payable = bool(
                raw_compensation.get("is_payable", raw_item.get("is_payable", False))
            )
            compensation: dict[str, Any] = {"is_payable": False}
            if is_payable:
                work_item_id = str(raw_compensation.get("work_item_id") or "").strip()
                if work_item_id not in work_item_rates:
                    raise WorkflowValidationError(
                        f"Node {node_key}: checklist {checklist_name!r} chưa chọn công việc khoán đang hiệu lực"
                    )
                if work_item_id in payable_work_items:
                    raise WorkflowValidationError(
                        f"Node {node_key}: một công việc khoán chỉ được gắn một lần trong cùng Node"
                    )
                payable_work_items.add(work_item_id)
                pay_scope = str(raw_compensation.get("pay_scope") or "ONCE_PER_WORKFLOW").upper()
                if pay_scope not in PAY_SCOPES:
                    raise WorkflowValidationError(
                        f"Node {node_key}: phạm vi tính khoán {pay_scope!r} không hợp lệ"
                    )
                compensation = {
                    "is_payable": True,
                    "work_item_id": work_item_id,
                    "pay_scope": pay_scope,
                    # Cùng pay_key sẽ chống tính trùng khi công việc xuất hiện ở nhiều Node.
                    "pay_key": str(raw_compensation.get("pay_key") or work_item_id).strip(),
                    "pay_group_key": str(raw_compensation.get("pay_group_key") or work_item_id).strip(),
                }

            require_evidence = bool(
                raw_item.get("require_evidence", raw_item.get("evidence_required", False))
            )
            approver_role = str(raw_item.get("approver_role") or "admin").strip().lower()
            if not APPROVER_ROLE_RE.fullmatch(approver_role):
                raise WorkflowValidationError(
                    f"Node {node_key}: vai trò duyệt của checklist {checklist_name!r} không hợp lệ"
                )
            assignee_employee_id = str(raw_item.get("assignee_employee_id") or "").strip() or None
            if assignee_employee_id:
                employee_ids.add(assignee_employee_id)

            normalized_item = {
                **raw_item,
                "key": checklist_key,
                "name": checklist_name,
                "required": raw_item.get("required") is not False,
                "require_evidence": require_evidence,
                "approver_role": approver_role,
                "assignee_employee_id": assignee_employee_id,
                "evidence_description": str(raw_item.get("evidence_description") or "").strip(),
                "drive_folder_url": _validate_drive_url(
                    raw_item.get("drive_folder_url"),
                    node_key=node_key,
                    checklist_name=checklist_name,
                ),
                "compensation": compensation,
            }
            normalized_item.pop("evidence_required", None)
            normalized_checklist.append(normalized_item)

        raw_assignments = raw_node.get("assignments") or []
        if not isinstance(raw_assignments, list):
            raise WorkflowValidationError(f"Node {node_key}: assignments phải là danh sách")
        assignments = [_normalize_assignment(item, node_key) for item in raw_assignments]
        assignment_keys: set[tuple[str, str]] = set()
        primary_count = 0
        json_assignments: list[dict[str, Any]] = []
        for assignment in assignments:
            key = (assignment["employee_id"], assignment["role_code"])
            if key in assignment_keys:
                raise WorkflowValidationError(f"Node {node_key}: một nhân viên bị giao trùng cùng vai trò")
            assignment_keys.add(key)
            employee_ids.add(assignment["employee_id"])
            primary_count += int(assignment["is_primary"])
            json_assignments.append(assignment)
        if primary_count > 1:
            raise WorkflowValidationError(f"Node {node_key}: chỉ được có một người phụ trách chính")

        assigned_employee_ids = {item["employee_id"] for item in json_assignments}
        for checklist_item in normalized_checklist:
            assignee_employee_id = checklist_item.get("assignee_employee_id")
            if assignee_employee_id and assignee_employee_id not in assigned_employee_ids:
                raise WorkflowValidationError(
                    f"Node {node_key}: người phụ trách checklist {checklist_item['name']!r} "
                    "phải nằm trong danh sách người thực hiện của Node"
                )

        for checklist_item in normalized_checklist:
            compensation = checklist_item["compensation"]
            if not compensation["is_payable"]:
                continue
            rates = work_item_rates[compensation["work_item_id"]]
            positive_roles = {
                role for role, rate in rates.items() if float(rate["amount"] or 0) > 0
            }
            assigned_by_role: dict[str, int] = {}
            for assignment in json_assignments:
                role = assignment["role_code"]
                assigned_by_role[role] = assigned_by_role.get(role, 0) + 1
            required_role = "MAIN" if "MAIN" in positive_roles else (
                "SUBMITTER" if "SUBMITTER" in positive_roles else None
            )
            if required_role and assigned_by_role.get(required_role, 0) == 0:
                raise WorkflowValidationError(
                    f"Node {node_key}: công việc khoán của checklist {checklist_item['name']!r} "
                    f"cần phân công vai trò {required_role}"
                )
            duplicated_roles = sorted(
                role for role in positive_roles if assigned_by_role.get(role, 0) > 1
            )
            if duplicated_roles:
                raise WorkflowValidationError(
                    f"Node {node_key}: chưa hỗ trợ chia khoán cho nhiều người cùng vai trò "
                    f"{', '.join(duplicated_roles)}; hãy chọn một người cho mỗi vai trò"
                )

        normalized_node = {
            **raw_node,
            "task_code": node_code,
            "name": str(raw_node.get("name") or node_code).strip(),
            "description": str(raw_node.get("description") or "").strip(),
            "checklist": normalized_checklist,
            "assignments": json_assignments,
            "transitions": normalized_transitions,
        }
        normalized_node.pop("evidence_required", None)
        normalized_nodes[node_key] = normalized_node

    if employee_ids:
        active_employee_ids = {
            row[0]
            for row in db.execute(
                text("select id from public.employees where id = any(:employee_ids) and coalesce(is_active, true)"),
                {"employee_ids": list(employee_ids)},
            ).all()
        }
        missing = sorted(employee_ids - active_employee_ids)
        if missing:
            raise WorkflowValidationError(f"Nhân viên không tồn tại hoặc đã ngừng hoạt động: {', '.join(missing)}")

    normalized["start_node"] = start_node
    normalized["nodes"] = normalized_nodes
    normalized["ui"] = graph.get("ui") if isinstance(graph.get("ui"), dict) else {}
    return normalized


def _validate_template(db: Session, template_id: str | None) -> None:
    if not template_id:
        return
    exists = db.execute(
        text("select 1 from public.workflow_templates where id = :id and status = 'published'"),
        {"id": template_id},
    ).first()
    if not exists:
        raise WorkflowValidationError("Mẫu workflow không tồn tại hoặc chưa được ban hành")


def save_workflow_draft(
    db: Session,
    *,
    service_line_id: str,
    graph: dict[str, Any],
    source_workflow_version_id: str | None,
    change_reason: str | None,
    actor_id: str,
) -> dict[str, Any]:
    """Upsert the sole draft revision for a service line without committing."""
    service_context = db.execute(
        text("""
            select sl.id, c.date_signed
            from public.service_lines sl
            join public.contracts c on c.id = sl.contract_id
            where sl.id = :id
        """),
        {"id": service_line_id},
    ).mappings().first()
    if not service_context:
        raise WorkflowValidationError("Hạng mục hợp đồng không tồn tại")
    normalized_graph = validate_workflow_graph(
        db,
        graph,
        minimum_start_date=service_context["date_signed"],
    )
    _validate_template(db, source_workflow_version_id)

    instance = db.execute(
        text("""
            select id, status, active_revision_id
            from public.workflow_instances
            where service_line_id = :service_line_id
            for update
        """),
        {"service_line_id": service_line_id},
    ).mappings().first()
    if not instance:
        instance = db.execute(
            text("""
                insert into public.workflow_instances
                    (service_line_id, source_workflow_version_id, status, created_by)
                values (:service_line_id, :template_id, 'not_started', :actor_id)
                returning id, status, active_revision_id
            """),
            {
                "service_line_id": service_line_id,
                "template_id": source_workflow_version_id,
                "actor_id": actor_id,
            },
        ).mappings().one()
    elif instance["status"] == "cancelled":
        raise WorkflowValidationError("Workflow đã hủy; không thể tạo thêm bản sửa đổi")
    elif instance["status"] == "completed":
        raise WorkflowValidationError("Workflow đã hoàn thành; không thể tạo thêm bản sửa đổi")

    draft = db.execute(
        text("""
            select id, revision_no
            from public.workflow_instance_revisions
            where workflow_instance_id = :instance_id and status = 'draft'
            for update
        """),
        {"instance_id": instance["id"]},
    ).mappings().first()
    params = {
        "instance_id": instance["id"],
        "template_id": source_workflow_version_id,
        "graph": json.dumps(normalized_graph, ensure_ascii=False),
        "change_reason": (change_reason or "").strip() or None,
        "actor_id": actor_id,
    }
    if draft:
        revision = db.execute(
            text("""
                update public.workflow_instance_revisions
                set source_workflow_version_id = :template_id,
                    graph = cast(:graph as jsonb),
                    change_reason = :change_reason,
                    created_by = :actor_id
                where id = :revision_id
                returning id, workflow_instance_id, revision_no, status
            """),
            {**params, "revision_id": draft["id"]},
        ).mappings().one()
    else:
        next_revision = db.execute(
            text("""
                select coalesce(max(revision_no), 0) + 1
                from public.workflow_instance_revisions
                where workflow_instance_id = :instance_id
            """),
            {"instance_id": instance["id"]},
        ).scalar_one()
        revision = db.execute(
            text("""
                insert into public.workflow_instance_revisions
                    (workflow_instance_id, revision_no, source_workflow_version_id,
                     parent_revision_id, graph, status, change_reason, created_by)
                values
                    (:instance_id, :revision_no, :template_id, :parent_revision_id,
                     cast(:graph as jsonb), 'draft', :change_reason, :actor_id)
                returning id, workflow_instance_id, revision_no, status
            """),
            {
                **params,
                "revision_no": next_revision,
                "parent_revision_id": instance["active_revision_id"],
            },
        ).mappings().one()

    db.execute(
        text("""
            update public.workflow_instances
            set source_workflow_version_id = :template_id, updated_at = now()
            where id = :instance_id
        """),
        params,
    )
    return {**dict(revision), "graph": normalized_graph}


def _apply_workflow_amendment(
    db: Session,
    *,
    instance: dict[str, Any],
    revision: dict[str, Any],
    source_workflow_version_id: str | None,
    actor_id: str,
) -> dict[str, Any]:
    """Activate a new revision while preserving Node executions from older revisions."""
    graph_nodes = revision["graph"]["nodes"]
    runtime_rows = db.execute(
        text("""
            select id, node_key, node_code, status, occurrence_no,
                   defined_by_revision_id, started_at
            from public.task_nodes
            where workflow_instance_id = :instance_id
              and status <> 'cancelled'
            order by occurrence_no desc, created_at desc
            for update
        """),
        {"instance_id": instance["id"]},
    ).mappings().all()
    runtime_by_key: dict[str, Any] = {}
    for row in runtime_rows:
        runtime_by_key.setdefault(row["node_key"], row)

    removed_keys = sorted(set(runtime_by_key) - set(graph_nodes))
    for node_key in removed_keys:
        row = runtime_by_key[node_key]
        if row["status"] not in {"pending", "ready"} or row["started_at"] is not None:
            raise WorkflowValidationError(
                f"Không thể xóa Node {node_key!r} vì công việc đã bắt đầu hoặc đã có kết quả"
            )

    for node_key in set(runtime_by_key) & set(graph_nodes):
        if runtime_by_key[node_key]["node_code"] != graph_nodes[node_key]["task_code"]:
            raise WorkflowValidationError(
                f"Node {node_key!r} đã chạy nên không thể đổi mã cụm công việc; "
                "hãy thêm Node mới và nối lại điều kiện"
            )

    db.execute(
        text("""
            update public.workflow_instance_revisions
            set status = 'superseded'
            where id = :active_revision_id and status = 'active'
        """),
        {"active_revision_id": instance["active_revision_id"]},
    )
    db.execute(
        text("""
            update public.workflow_instance_revisions
            set status = 'active', activated_by = :actor_id, activated_at = now()
            where id = :revision_id and status = 'draft'
        """),
        {"revision_id": revision["id"], "actor_id": actor_id},
    )
    db.execute(
        text("""
            update public.workflow_instances
            set active_revision_id = :revision_id,
                source_workflow_version_id = :template_id,
                updated_at = now()
            where id = :instance_id
        """),
        {
            "revision_id": revision["id"],
            "template_id": source_workflow_version_id,
            "instance_id": instance["id"],
        },
    )

    for node_key in removed_keys:
        row = runtime_by_key[node_key]
        db.execute(
            text("""
                update public.task_nodes
                set status = 'cancelled', updated_at = now(),
                    notes = concat_ws(E'\n', notes, :note)
                where id = :task_node_id
            """),
            {
                "task_node_id": row["id"],
                "note": f"Đã loại khỏi workflow tại Revision {revision['revision_no']}",
            },
        )
        db.execute(
            text("""
                insert into public.task_node_events
                    (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
                values (:task_node_id, 'REMOVED_BY_REVISION', :from_status, 'cancelled',
                        :actor_id, cast(:payload as jsonb))
            """),
            {
                "task_node_id": row["id"],
                "from_status": row["status"],
                "actor_id": actor_id,
                "payload": json.dumps({"revision_id": revision["id"]}),
            },
        )
    added_keys = [key for key in graph_nodes if key not in runtime_by_key]
    has_live_node = any(
        row["status"] in {"ready", "in_progress", "submitted", "rework_required", "blocked"}
        for row in runtime_rows
        if row["node_key"] not in removed_keys
    )
    work_item_rates = _current_work_item_rates(db)
    checklist_count = 0
    assignment_count = 0
    rebased_node_count = 0
    compensation_assignment_count = 0
    projected_compensation_amount = 0.0
    provisioned_records: dict[str, str] = {}

    # Pending/ready Nodes may receive revised checklist definitions. Started Nodes keep
    # their original execution snapshot so evidence and acceptance history never move.
    for node_key in sorted(set(runtime_by_key) & set(graph_nodes)):
        runtime_node = runtime_by_key[node_key]
        desired_node = graph_nodes[node_key]
        desired_assignments = desired_node.get("assignments") or []
        active_assignments = db.execute(
            text("""
                select employee_id, role_code, is_primary, notes
                from public.task_node_assignments
                where task_node_id = :task_node_id
                  and assignment_status in ('proposed', 'assigned', 'accepted')
            """),
            {"task_node_id": runtime_node["id"]},
        ).mappings().all()
        current_assignment_signature = sorted(
            (
                str(item["employee_id"]),
                str(item["role_code"]),
                bool(item["is_primary"]),
                str(item["notes"] or "").strip(),
            )
            for item in active_assignments
        )
        desired_assignment_signature = sorted(
            (
                str(item["employee_id"]),
                str(item["role_code"]),
                bool(item.get("is_primary")),
                str(item.get("notes") or "").strip(),
            )
            for item in desired_assignments
        )
        assignments_changed = current_assignment_signature != desired_assignment_signature

        is_unstarted = (
            runtime_node["status"] in {"pending", "ready"}
            and runtime_node["started_at"] is None
        )
        if not is_unstarted:
            existing_keys = {
                row[0] for row in db.execute(
                    text("""
                        select checklist_key from public.task_node_checklist_results
                        where task_node_id = :task_node_id
                    """),
                    {"task_node_id": runtime_node["id"]},
                ).all()
            }
            desired_keys = {
                item["key"] for item in (desired_node.get("checklist") or [])
            }
            if existing_keys != desired_keys:
                raise WorkflowValidationError(
                    f"Không thể thêm/xóa checklist của Node {node_key!r} vì công việc đã bắt đầu"
                )
            if assignments_changed:
                assignment_result = replace_node_assignments(
                    db,
                    task_node_id=str(runtime_node["id"]),
                    assignments=desired_assignments,
                    replacement_reason=f"Áp dụng Revision {revision['revision_no']}",
                    actor_id=actor_id,
                )
                assignment_count += assignment_result["assignment_count"]
                compensation_assignment_count += assignment_result[
                    "compensation_assignment_count"
                ]
                projected_compensation_amount += assignment_result[
                    "projected_compensation_amount"
                ]
            continue
        existing_rows = db.execute(
            text("""
                select id, checklist_key, status
                from public.task_node_checklist_results
                where task_node_id = :task_node_id
                for update
            """),
            {"task_node_id": runtime_node["id"]},
        ).mappings().all()
        existing_by_key = {row["checklist_key"]: row for row in existing_rows}
        desired_by_key = {
            item["key"]: item for item in (desired_node.get("checklist") or [])
        }

        for checklist_key in set(existing_by_key) - set(desired_by_key):
            current = existing_by_key[checklist_key]
            if current["status"] in {"approved", "late_approved", "failed"}:
                raise WorkflowValidationError(
                    f"Không thể xóa checklist {checklist_key!r} vì đã có kết quả"
                )
            db.execute(
                text("""
                    update public.task_node_checklist_results
                    set status = 'not_applicable', is_required = false, updated_at = now(),
                        note = concat_ws(E'\n', note, :note)
                    where id = :checklist_id
                """),
                {
                    "checklist_id": current["id"],
                    "note": f"Đã loại khỏi Revision {revision['revision_no']}",
                },
            )
            db.execute(
                text("""
                    update public.task_node_checklist_assignments
                    set status = 'cancelled', ended_at = now(), updated_at = now(), reason = :reason
                    where checklist_result_id = :checklist_id
                      and status not in ('replaced', 'cancelled')
                """),
                {
                    "checklist_id": current["id"],
                    "reason": f"Checklist bị loại khỏi Revision {revision['revision_no']}",
                },
            )

        assignments = desired_assignments
        for item in desired_by_key.values():
            current = existing_by_key.get(item["key"])
            if current and current["status"] in {"approved", "late_approved", "failed"}:
                continue
            if current and current["status"] in {"pending_approval", "late_pending_approval"}:
                raise WorkflowValidationError(
                    f"Không thể sửa checklist {item['key']!r} khi đang chờ duyệt"
                )
            compensation = item.get("compensation") or {"is_payable": False}
            is_payable = bool(compensation.get("is_payable"))
            evidence_definition = json.dumps(
                _checklist_evidence_data(item, include_files=False),
                ensure_ascii=False,
            )
            if current:
                checklist_result_id = current["id"]
                # Close the old pay assignment while the old checklist/rate pair still matches.
                db.execute(
                    text("""
                        update public.task_node_checklist_assignments
                        set status = 'replaced', ended_at = now(), updated_at = now(), reason = :reason
                        where checklist_result_id = :checklist_id
                          and status not in ('replaced', 'cancelled')
                    """),
                    {
                        "checklist_id": checklist_result_id,
                        "reason": f"Cập nhật theo Revision {revision['revision_no']}",
                    },
                )
                db.execute(
                    text("""
                        update public.task_node_checklist_results
                        set checklist_name = :checklist_name,
                            is_required = :is_required,
                            status = 'pending',
                            require_evidence = :require_evidence,
                            approver_role = :approver_role,
                            is_overdue = false,
                            late_reason = null,
                            evidence_data = coalesce(evidence_data, '{}'::jsonb)
                              || cast(:evidence_definition as jsonb),
                            work_item_id = :work_item_id,
                            is_payable = :is_payable,
                            pay_group_key = :pay_group_key,
                            pay_scope = :pay_scope,
                            pay_key = :pay_key,
                            updated_at = now()
                        where id = :checklist_id
                    """),
                    {
                        "checklist_id": checklist_result_id,
                        "checklist_name": item["name"],
                        "is_required": item.get("required") is not False,
                        "require_evidence": bool(item.get("require_evidence")),
                        "approver_role": item.get("approver_role") or "admin",
                        "evidence_definition": evidence_definition,
                        "work_item_id": compensation.get("work_item_id") if is_payable else None,
                        "is_payable": is_payable,
                        "pay_group_key": compensation.get("pay_group_key") if is_payable else None,
                        "pay_scope": compensation.get("pay_scope") if is_payable else None,
                        "pay_key": compensation.get("pay_key") if is_payable else None,
                    },
                )
            else:
                checklist_result_id = db.execute(
                    text("""
                        insert into public.task_node_checklist_results
                            (task_node_id, checklist_key, checklist_name, is_required,
                             status, require_evidence, approver_role, evidence_data,
                             work_item_id, is_payable,
                             pay_group_key, pay_scope, pay_key, condition_result)
                        values (:task_node_id, :checklist_key, :checklist_name, :is_required,
                                'pending', :require_evidence, :approver_role,
                                cast(:evidence_data as jsonb), :work_item_id, :is_payable,
                                :pay_group_key, :pay_scope, :pay_key, '{}'::jsonb)
                        returning id
                    """),
                    {
                        "task_node_id": runtime_node["id"],
                        "checklist_key": item["key"],
                        "checklist_name": item["name"],
                        "is_required": item.get("required") is not False,
                        "require_evidence": bool(item.get("require_evidence")),
                        "approver_role": item.get("approver_role") or "admin",
                        "evidence_data": json.dumps(
                            _checklist_evidence_data(item, include_files=True),
                            ensure_ascii=False,
                        ),
                        "work_item_id": compensation.get("work_item_id") if is_payable else None,
                        "is_payable": is_payable,
                        "pay_group_key": compensation.get("pay_group_key") if is_payable else None,
                        "pay_scope": compensation.get("pay_scope") if is_payable else None,
                        "pay_key": compensation.get("pay_key") if is_payable else None,
                    },
                ).scalar_one()
            checklist_count += 1

            if is_payable:
                rates = work_item_rates[compensation["work_item_id"]]
                for assignment in assignments:
                    rate = rates.get(assignment["role_code"])
                    if not rate or float(rate["amount"] or 0) <= 0:
                        continue
                    db.execute(
                        text("""
                            insert into public.task_node_checklist_assignments
                                (checklist_result_id, employee_id, role_code, pay_slot,
                                 share_percent, work_item_rate_id, status, assigned_by,
                                 approved_by, approved_at, reason)
                            values (:checklist_result_id, :employee_id, :role_code, 'PRIMARY',
                                    100, :rate_id, 'assigned', :actor_id,
                                    :actor_id, now(), :reason)
                        """),
                        {
                            "checklist_result_id": checklist_result_id,
                            "employee_id": assignment["employee_id"],
                            "role_code": assignment["role_code"],
                            "rate_id": rate["rate_id"],
                            "actor_id": actor_id,
                            "reason": f"Giám đốc duyệt Revision {revision['revision_no']}",
                        },
                    )
                    compensation_assignment_count += 1
                    projected_compensation_amount += float(rate["amount"] or 0)

            _ensure_manual_checklist_assignment(
                db,
                checklist_result_id=checklist_result_id,
                checklist_item=item,
                node_assignments=assignments,
                actor_id=actor_id,
                reason=f"Phân công checklist theo Revision {revision['revision_no']}",
            )

        # Node chưa bắt đầu phải theo đúng Revision vừa được áp dụng. Nếu giữ
        # defined_by_revision_id cũ, lúc nhân viên bấm Bắt đầu hệ thống sẽ đọc
        # duration/checklist của bản cũ và tính deadline sai.
        if runtime_node["defined_by_revision_id"] != revision["id"]:
            db.execute(
                text("""
                    update public.task_nodes
                    set defined_by_revision_id = :revision_id,
                        notes = :notes,
                        updated_at = now()
                    where id = :task_node_id
                      and status in ('pending', 'ready')
                      and started_at is null
                """),
                {
                    "task_node_id": runtime_node["id"],
                    "revision_id": revision["id"],
                    "notes": desired_node.get("description") or None,
                },
            )
            db.execute(
                text("""
                    insert into public.task_node_events
                        (task_node_id, event_type, from_status, to_status,
                         actor_user_id, payload)
                    values
                        (:task_node_id, 'REBASED_BY_REVISION', :status, :status,
                         :actor_id, cast(:payload as jsonb))
                """),
                {
                    "task_node_id": runtime_node["id"],
                    "status": runtime_node["status"],
                    "actor_id": actor_id,
                    "payload": json.dumps({
                        "from_revision_id": runtime_node["defined_by_revision_id"],
                        "to_revision_id": revision["id"],
                        "revision_no": revision["revision_no"],
                    }),
                },
            )
            rebased_node_count += 1

        if assignments_changed:
            # Checklist runtime rows above already use the assignment set from this
            # Revision. Replace only Node-level records here so the unified apply
            # action does not create a second set of active pay assignments.
            assignment_result = replace_node_assignments(
                db,
                task_node_id=str(runtime_node["id"]),
                assignments=desired_assignments,
                replacement_reason=f"Áp dụng Revision {revision['revision_no']}",
                actor_id=actor_id,
                sync_checklist_assignments=False,
            )
            assignment_count += assignment_result["assignment_count"]

    for node_key in added_keys:
        node = graph_nodes[node_key]
        occurrence_no = db.execute(
            text("""
                select coalesce(max(occurrence_no), 0) + 1
                from public.task_nodes
                where workflow_instance_id = :instance_id and node_key = :node_key
            """),
            {"instance_id": instance["id"], "node_key": node_key},
        ).scalar_one()
        assignments = node.get("assignments") or []
        status = (
            "ready"
            if node_key == revision["graph"]["start_node"] and not has_live_node
            else "pending"
        )
        task_node_id = db.execute(
            text("""
                insert into public.task_nodes
                    (workflow_instance_id, defined_by_revision_id, node_key, node_code,
                     occurrence_no, status, execution_data, notes)
                values (:instance_id, :revision_id, :node_key, :node_code, :occurrence_no, :status,
                        '{}'::jsonb, :notes)
                returning id
            """),
            {
                "instance_id": instance["id"],
                "revision_id": revision["id"],
                "node_key": node_key,
                "node_code": node["task_code"],
                "occurrence_no": occurrence_no,
                "status": status,
                "notes": node.get("description") or None,
            },
        ).scalar_one()

        for item in node.get("checklist") or []:
            compensation = item.get("compensation") or {"is_payable": False}
            is_payable = bool(compensation.get("is_payable"))
            checklist_result_id = db.execute(
                text("""
                    insert into public.task_node_checklist_results
                        (task_node_id, checklist_key, checklist_name, is_required,
                         status, require_evidence, approver_role, evidence_data,
                         work_item_id, is_payable,
                         pay_group_key, pay_scope, pay_key, condition_result)
                    values (:task_node_id, :checklist_key, :checklist_name, :is_required,
                            'pending', :require_evidence, :approver_role,
                            cast(:evidence_data as jsonb), :work_item_id, :is_payable,
                            :pay_group_key, :pay_scope, :pay_key, '{}'::jsonb)
                    returning id
                """),
                {
                    "task_node_id": task_node_id,
                    "checklist_key": item["key"],
                    "checklist_name": item["name"],
                    "is_required": item.get("required") is not False,
                    "require_evidence": bool(item.get("require_evidence")),
                    "approver_role": item.get("approver_role") or "admin",
                    "evidence_data": json.dumps(
                        _checklist_evidence_data(item, include_files=True),
                        ensure_ascii=False,
                    ),
                    "work_item_id": compensation.get("work_item_id") if is_payable else None,
                    "is_payable": is_payable,
                    "pay_group_key": compensation.get("pay_group_key") if is_payable else None,
                    "pay_scope": compensation.get("pay_scope") if is_payable else None,
                    "pay_key": compensation.get("pay_key") if is_payable else None,
                },
            ).scalar_one()
            checklist_count += 1
            if is_payable:
                rates = work_item_rates[compensation["work_item_id"]]
                for assignment in assignments:
                    rate = rates.get(assignment["role_code"])
                    if not rate or float(rate["amount"] or 0) <= 0:
                        continue
                    db.execute(
                        text("""
                            insert into public.task_node_checklist_assignments
                                (checklist_result_id, employee_id, role_code, pay_slot,
                                 share_percent, work_item_rate_id, status, assigned_by,
                                 approved_by, approved_at, reason)
                            values (:checklist_result_id, :employee_id, :role_code, 'PRIMARY',
                                    100, :rate_id, 'assigned', :actor_id,
                                    :actor_id, now(), :reason)
                        """),
                        {
                            "checklist_result_id": checklist_result_id,
                            "employee_id": assignment["employee_id"],
                            "role_code": assignment["role_code"],
                            "rate_id": rate["rate_id"],
                            "actor_id": actor_id,
                            "reason": "Giám đốc duyệt Node mới trong bản sửa đổi workflow",
                        },
                    )
                    compensation_assignment_count += 1
                    projected_compensation_amount += float(rate["amount"] or 0)

            _ensure_manual_checklist_assignment(
                db,
                checklist_result_id=checklist_result_id,
                checklist_item=item,
                node_assignments=assignments,
                actor_id=actor_id,
                reason="Phân công checklist cho Node mới trong bản sửa đổi workflow",
            )

        for assignment in assignments:
            db.execute(
                text("""
                insert into public.task_node_assignments
                    (task_node_id, employee_id, role_code, is_primary,
                     assignment_status, assigned_by, notes)
                values (:task_node_id, :employee_id, :role_code, :is_primary,
                        'assigned', :actor_id, :notes)
                """),
                {
                    "task_node_id": task_node_id,
                    "employee_id": assignment["employee_id"],
                    "role_code": assignment["role_code"],
                    "is_primary": assignment.get("is_primary", False),
                    "actor_id": actor_id,
                    "notes": assignment.get("notes"),
                },
            )
            assignment_count += 1
        db.execute(
            text("""
                insert into public.task_node_events
                    (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
                values (:task_node_id, 'ADDED_BY_REVISION', null, :status, :actor_id,
                        cast(:payload as jsonb))
            """),
            {
                "task_node_id": task_node_id,
                "status": status,
                "actor_id": actor_id,
                "payload": json.dumps({"revision_id": revision["id"]}),
            },
        )
        if status == "ready":
            provisioned_records.update(_ensure_node_module_records(
                db, task_node_id=task_node_id, actor_id=actor_id
            ))

    # Sửa thời lượng một node là dời hạn của cả dây phía sau — tính lại toàn bộ.
    planned_schedule = recompute_planned_deadlines(db, workflow_instance_id=instance["id"])

    return {
        "planned_end": planned_schedule.get("planned_end"),
        "instance_id": instance["id"],
        "revision_id": revision["id"],
        "revision_no": revision["revision_no"],
        "status": instance["status"],
        "amended": True,
        "node_count": len(added_keys),
        "removed_node_count": len(removed_keys),
        "checklist_count": checklist_count,
        "assignment_count": assignment_count,
        "rebased_node_count": rebased_node_count,
        "compensation_assignment_count": compensation_assignment_count,
        "projected_compensation_amount": projected_compensation_amount,
        **provisioned_records,
    }


def activate_workflow(
    db: Session,
    *,
    service_line_id: str,
    graph: dict[str, Any],
    source_workflow_version_id: str | None,
    change_reason: str | None,
    actor_id: str,
) -> dict[str, Any]:
    """Lock a revision and materialize all runtime rows without committing."""
    revision = save_workflow_draft(
        db,
        service_line_id=service_line_id,
        graph=graph,
        source_workflow_version_id=source_workflow_version_id,
        change_reason=change_reason,
        actor_id=actor_id,
    )
    instance = db.execute(
        text("""
            select id, status, active_revision_id
            from public.workflow_instances
            where id = :instance_id
            for update
        """),
        {"instance_id": revision["workflow_instance_id"]},
    ).mappings().one()
    if instance["active_revision_id"]:
        return _apply_workflow_amendment(
            db,
            instance=dict(instance),
            revision=revision,
            source_workflow_version_id=source_workflow_version_id,
            actor_id=actor_id,
        )

    db.execute(
        text("""
            update public.workflow_instance_revisions
            set status = 'active', activated_by = :actor_id, activated_at = now()
            where id = :revision_id and status = 'draft'
        """),
        {"revision_id": revision["id"], "actor_id": actor_id},
    )
    db.execute(
        text("""
            update public.workflow_instances
            set active_revision_id = :revision_id,
                source_workflow_version_id = :template_id,
                status = 'running', started_at = coalesce(started_at, now()), updated_at = now()
            where id = :instance_id
        """),
        {
            "revision_id": revision["id"],
            "template_id": source_workflow_version_id,
            "instance_id": instance["id"],
        },
    )

    graph_nodes = revision["graph"]["nodes"]
    start_node = revision["graph"]["start_node"]
    work_item_rates = _current_work_item_rates(db)
    created_node_ids: dict[str, str] = {}
    assignment_count = 0
    checklist_count = 0
    compensation_assignment_count = 0
    projected_compensation_amount = 0.0
    for node_key, node in graph_nodes.items():
        assignments = node.get("assignments") or []
        status = "ready" if node_key == start_node else "pending"
        task_node_id = db.execute(
            text("""
                insert into public.task_nodes
                    (workflow_instance_id, defined_by_revision_id, node_key, node_code,
                     occurrence_no, status, execution_data, notes)
                values
                    (:instance_id, :revision_id, :node_key, :node_code,
                     1, :status, '{}'::jsonb, :notes)
                returning id
            """),
            {
                "instance_id": instance["id"],
                "revision_id": revision["id"],
                "node_key": node_key,
                "node_code": node["task_code"],
                "status": status,
                "notes": node.get("description") or None,
            },
        ).scalar_one()
        created_node_ids[node_key] = task_node_id

        for item in node.get("checklist") or []:
            compensation = item.get("compensation") or {"is_payable": False}
            is_payable = bool(compensation.get("is_payable"))
            checklist_result_id = db.execute(
                text("""
                    insert into public.task_node_checklist_results
                        (task_node_id, checklist_key, checklist_name, is_required,
                         status, require_evidence, approver_role, evidence_data,
                         work_item_id, is_payable,
                         pay_group_key, pay_scope, pay_key, condition_result)
                    values
                        (:task_node_id, :checklist_key, :checklist_name, :is_required,
                         'pending', :require_evidence, :approver_role,
                         cast(:evidence_data as jsonb), :work_item_id, :is_payable,
                         :pay_group_key, :pay_scope, :pay_key, '{}'::jsonb)
                    returning id
                """),
                {
                    "task_node_id": task_node_id,
                    "checklist_key": item["key"],
                    "checklist_name": item["name"],
                    "is_required": item.get("required") is not False,
                    "require_evidence": bool(item.get("require_evidence")),
                    "approver_role": item.get("approver_role") or "admin",
                    "evidence_data": json.dumps(
                        _checklist_evidence_data(item, include_files=True),
                        ensure_ascii=False,
                    ),
                    "work_item_id": compensation.get("work_item_id") if is_payable else None,
                    "is_payable": is_payable,
                    "pay_group_key": compensation.get("pay_group_key") if is_payable else None,
                    "pay_scope": compensation.get("pay_scope") if is_payable else None,
                    "pay_key": compensation.get("pay_key") if is_payable else None,
                },
            ).scalar_one()
            checklist_count += 1

            if is_payable:
                rates = work_item_rates[compensation["work_item_id"]]
                for assignment in assignments:
                    rate = rates.get(assignment["role_code"])
                    if not rate or float(rate["amount"] or 0) <= 0:
                        continue
                    db.execute(
                        text("""
                            insert into public.task_node_checklist_assignments
                                (checklist_result_id, employee_id, role_code, pay_slot,
                                 share_percent, work_item_rate_id, status, assigned_by,
                                 approved_by, approved_at, reason)
                            values
                                (:checklist_result_id, :employee_id, :role_code, 'PRIMARY',
                                 100, :rate_id, 'assigned', :actor_id,
                                 :actor_id, now(), :reason)
                        """),
                        {
                            "checklist_result_id": checklist_result_id,
                            "employee_id": assignment["employee_id"],
                            "role_code": assignment["role_code"],
                            "rate_id": rate["rate_id"],
                            "actor_id": actor_id,
                            "reason": "Giám đốc duyệt cấu hình khoán khi kích hoạt workflow",
                        },
                    )
                    compensation_assignment_count += 1
                    projected_compensation_amount += float(rate["amount"] or 0)

            _ensure_manual_checklist_assignment(
                db,
                checklist_result_id=checklist_result_id,
                checklist_item=item,
                node_assignments=assignments,
                actor_id=actor_id,
                reason="Phân công checklist khi kích hoạt workflow",
            )

        for assignment in assignments:
            db.execute(
                text("""
                    insert into public.task_node_assignments
                        (task_node_id, employee_id, role_code, is_primary,
                         assignment_status, assigned_by, notes)
                    values
                        (:task_node_id, :employee_id, :role_code, :is_primary,
                         'assigned', :actor_id, :notes)
                """),
                {
                    "task_node_id": task_node_id,
                    "employee_id": assignment["employee_id"],
                    "role_code": assignment["role_code"],
                    "is_primary": assignment.get("is_primary", False),
                    "actor_id": actor_id,
                    "notes": assignment.get("notes"),
                },
            )
            assignment_count += 1

        db.execute(
            text("""
                insert into public.task_node_events
                    (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
                values
                    (:task_node_id, 'NODE_MATERIALIZED', null, :to_status, :actor_id,
                     cast(:payload as jsonb))
            """),
            {
                "task_node_id": task_node_id,
                "to_status": status,
                "actor_id": actor_id,
                "payload": json.dumps({
                    "revision_id": revision["id"],
                    "revision_no": revision["revision_no"],
                    "is_start_node": node_key == start_node,
                }),
            },
        )

    provisioned_records = _ensure_node_module_records(
        db, task_node_id=created_node_ids[start_node], actor_id=actor_id
    )

    # Dựng ngay lịch dự kiến cho TOÀN BỘ quy trình, không đợi từng node bắt đầu.
    # Giám đốc phải thấy ngày giao khách ngay lúc áp dụng quy trình.
    planned_schedule = recompute_planned_deadlines(db, workflow_instance_id=instance["id"])

    return {
        "planned_end": planned_schedule.get("planned_end"),
        "instance_id": instance["id"],
        "revision_id": revision["id"],
        "revision_no": revision["revision_no"],
        "status": "running",
        "node_count": len(created_node_ids),
        "checklist_count": checklist_count,
        "assignment_count": assignment_count,
        "compensation_assignment_count": compensation_assignment_count,
        "projected_compensation_amount": projected_compensation_amount,
        **provisioned_records,
    }


def replace_node_assignments(
    db: Session,
    *,
    task_node_id: str,
    assignments: list[dict[str, Any]],
    replacement_reason: str | None,
    actor_id: str,
    sync_checklist_assignments: bool = True,
) -> dict[str, Any]:
    """Replace active node assignments and append an immutable audit event."""
    node = db.execute(
        text("""
            select tn.id, tn.status, tn.workflow_instance_id, c.date_signed
            from public.task_nodes tn
            join public.workflow_instances wi on wi.id = tn.workflow_instance_id
            join public.service_lines sl on sl.id = wi.service_line_id
            join public.contracts c on c.id = sl.contract_id
            where tn.id = :task_node_id and wi.status in ('running', 'paused')
            for update of tn
        """),
        {"task_node_id": task_node_id},
    ).mappings().first()
    if not node:
        raise WorkflowValidationError("Node không tồn tại hoặc workflow không còn hoạt động")
    if node["status"] in ("submitted", "accepted", "skipped", "cancelled"):
        raise WorkflowValidationError("Không thể đổi phân công khi Node đã gửi duyệt hoặc đã kết thúc")

    normalized = [_normalize_assignment(item, str(task_node_id)) for item in assignments]
    duplicate_keys = [(item["employee_id"], item["role_code"]) for item in normalized]
    if len(duplicate_keys) != len(set(duplicate_keys)):
        raise WorkflowValidationError("Một nhân viên không được giao trùng cùng vai trò")
    if sum(int(item["is_primary"]) for item in normalized) > 1:
        raise WorkflowValidationError("Chỉ được có một người phụ trách chính")
    employee_ids = {item["employee_id"] for item in normalized}
    if employee_ids:
        active_ids = {
            row[0]
            for row in db.execute(
                text("select id from public.employees where id = any(:employee_ids) and coalesce(is_active, true)"),
                {"employee_ids": list(employee_ids)},
            ).all()
        }
        if active_ids != employee_ids:
            raise WorkflowValidationError("Danh sách phân công có nhân viên không còn hoạt động")

    payable_checklists = db.execute(
        text("""
            select id, checklist_name, work_item_id
            from public.task_node_checklist_results
            where task_node_id = :task_node_id
              and is_payable
              and status <> 'not_applicable'
            for update
        """),
        {"task_node_id": task_node_id},
    ).mappings().all()
    if payable_checklists and db.execute(
        text("select 1 from public.work_pay_entitlements where task_node_id = :task_node_id limit 1"),
        {"task_node_id": task_node_id},
    ).first():
        raise WorkflowValidationError("Node đã phát sinh lương khoán; không thể thay người nhận khoán")

    work_item_rates = _current_work_item_rates(db)
    for checklist in payable_checklists:
        rates = work_item_rates.get(checklist["work_item_id"], {})
        positive_roles = {
            role for role, rate in rates.items() if float(rate["amount"] or 0) > 0
        }
        assigned_by_role: dict[str, int] = {}
        for assignment in normalized:
            role = assignment["role_code"]
            assigned_by_role[role] = assigned_by_role.get(role, 0) + 1
        required_role = "MAIN" if "MAIN" in positive_roles else (
            "SUBMITTER" if "SUBMITTER" in positive_roles else None
        )
        if required_role and assigned_by_role.get(required_role, 0) == 0:
            raise WorkflowValidationError(
                f"Checklist {checklist['checklist_name']!r} cần phân công vai trò {required_role} để tính khoán"
            )
        duplicated_roles = sorted(
            role for role in positive_roles if assigned_by_role.get(role, 0) > 1
        )
        if duplicated_roles:
            raise WorkflowValidationError(
                f"Chưa hỗ trợ chia khoán cho nhiều người cùng vai trò {', '.join(duplicated_roles)}"
            )

    old_ids = [row[0] for row in db.execute(
        text("""
            select id from public.task_node_assignments
            where task_node_id = :task_node_id
              and assignment_status in ('proposed', 'assigned', 'accepted')
            for update
        """),
        {"task_node_id": task_node_id},
    ).all()]
    db.execute(
        text("""
            update public.task_node_assignments
            set assignment_status = 'replaced', ended_at = now(),
                replacement_reason = :reason, updated_at = now()
            where task_node_id = :task_node_id
              and assignment_status in ('proposed', 'assigned', 'accepted')
        """),
        {"task_node_id": task_node_id, "reason": (replacement_reason or "").strip() or None},
    )

    created_ids: list[str] = []
    for assignment in normalized:
        created_ids.append(db.execute(
            text("""
                insert into public.task_node_assignments
                    (task_node_id, employee_id, role_code, is_primary,
                     assignment_status, assigned_by, notes)
                values
                    (:task_node_id, :employee_id, :role_code, :is_primary,
                     'assigned', :actor_id, :notes)
                returning id
            """),
            {**assignment, "task_node_id": task_node_id, "actor_id": actor_id},
        ).scalar_one())

    # legal_submissions is provisioned when the Node becomes ready, which can
    # happen before a director assigns/reassigns the submitter. Keep that
    # operational contact in sync until the authority has issued a receipt;
    # after that point it is historical data and must not be rewritten.
    primary_assignment = next(
        (item for item in normalized if item["is_primary"]),
        normalized[0] if normalized else None,
    )
    legal_assignee_id = primary_assignment["employee_id"] if primary_assignment else None
    legal_contact_phone = None
    if legal_assignee_id:
        legal_contact_phone = db.execute(
            text("select phone from public.employees where id = :employee_id"),
            {"employee_id": legal_assignee_id},
        ).scalar()
    db.execute(
        text("""
            update public.legal_submissions
            set assigned_employee_id = :employee_id,
                contact_phone = :contact_phone,
                updated_at = now()
            where task_node_id = :task_node_id
              and receipt_code is null
        """),
        {
            "task_node_id": task_node_id,
            "employee_id": legal_assignee_id,
            "contact_phone": legal_contact_phone,
        },
    )

    compensation_assignment_count = 0
    projected_compensation_amount = 0.0
    if payable_checklists and sync_checklist_assignments:
        checklist_ids = [item["id"] for item in payable_checklists]
        db.execute(
            text("""
                update public.task_node_checklist_assignments
                set status = 'replaced', ended_at = now(), updated_at = now(), reason = :reason
                where checklist_result_id = any(:checklist_ids)
                  and status not in ('replaced', 'cancelled')
            """),
            {
                "checklist_ids": checklist_ids,
                "reason": (replacement_reason or "Điều chỉnh người nhận khoán").strip(),
            },
        )
        for checklist in payable_checklists:
            rates = work_item_rates.get(checklist["work_item_id"], {})
            for assignment in normalized:
                rate = rates.get(assignment["role_code"])
                if not rate or float(rate["amount"] or 0) <= 0:
                    continue
                db.execute(
                    text("""
                        insert into public.task_node_checklist_assignments
                            (checklist_result_id, employee_id, role_code, pay_slot,
                             share_percent, work_item_rate_id, status, assigned_by,
                             approved_by, approved_at, reason)
                        values
                            (:checklist_result_id, :employee_id, :role_code, 'PRIMARY',
                             100, :rate_id, 'assigned', :actor_id,
                             :actor_id, now(), :reason)
                    """),
                    {
                        "checklist_result_id": checklist["id"],
                        "employee_id": assignment["employee_id"],
                        "role_code": assignment["role_code"],
                        "rate_id": rate["rate_id"],
                        "actor_id": actor_id,
                        "reason": (replacement_reason or "Giám đốc điều chỉnh phân công khoán").strip(),
                    },
                )
                compensation_assignment_count += 1
                projected_compensation_amount += float(rate["amount"] or 0)

    db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            values
                (:task_node_id, 'ASSIGNMENTS_UPDATED', :status, :status, :actor_id,
                 cast(:payload as jsonb))
        """),
        {
            "task_node_id": task_node_id,
            "status": node["status"],
            "actor_id": actor_id,
            "payload": json.dumps({
                "replaced_assignment_ids": old_ids,
                "new_assignment_ids": created_ids,
                "compensation_assignment_count": compensation_assignment_count,
                "projected_compensation_amount": projected_compensation_amount,
                "reason": (replacement_reason or "").strip() or None,
            }),
        },
    )
    return {
        "task_node_id": task_node_id,
        "assignment_count": len(created_ids),
        "compensation_assignment_count": compensation_assignment_count,
        "projected_compensation_amount": projected_compensation_amount,
    }


def _require_node_assignment(db: Session, *, task_node_id: str, employee_id: str) -> None:
    assigned = db.execute(
        text("""
            select 1 from public.task_node_assignments
            where task_node_id = :task_node_id and employee_id = :employee_id
              and assignment_status not in ('replaced', 'declined')
        """),
        {"task_node_id": task_node_id, "employee_id": employee_id},
    ).first()
    if not assigned:
        raise WorkflowValidationError("Bạn không được phân công cho công việc này")


LEGAL_PACKAGE_ID = "sp_002"

_NODE_START_CONTEXT_QUERY = text("""
    select sl.id as service_line_id, sl.contract_id,
           sl.survey_drive_folder_url, sl.task_type_id,
           tt.service_package_id,
           cu.full_name as customer_name, cu.phone as customer_phone
    from public.workflow_instances wi
    join public.service_lines sl on sl.id = wi.service_line_id
    join public.contracts c on c.id = sl.contract_id
    left join public.task_types tt on tt.id = sl.task_type_id
    left join public.customers cu on cu.id = c.customer_id
    where wi.id = :workflow_instance_id
""")

_NODE_PRIMARY_ASSIGNEE_QUERY = text("""
    select e.id as employee_id, e.phone
    from public.task_node_assignments a
    join public.employees e on e.id = a.employee_id
    where a.task_node_id = :task_node_id
      and a.assignment_status not in ('replaced', 'declined')
    order by a.is_primary desc, a.created_at asc
    limit 1
""")


def _node_definition(db: Session, task_node: dict) -> dict | None:
    """Định nghĩa của Node trong graph của Revision đang áp dụng."""
    graph_row = db.execute(
        text("""
            select graph from public.workflow_instance_revisions
            where workflow_instance_id = :instance_id and id = :revision_id
        """),
        {
            "instance_id": task_node["workflow_instance_id"],
            "revision_id": task_node["defined_by_revision_id"],
        },
    ).mappings().first()
    return (graph_row["graph"]["nodes"] or {}).get(task_node["node_key"]) if graph_row else None


def recompute_planned_deadlines(db: Session, *, workflow_instance_id: str) -> dict[str, Any]:
    """Tính lại hạn của TOÀN BỘ node trong quy trình theo kế hoạch CỘNG DỒN.

    Trước đây mỗi node tính riêng: `hạn = lúc bấm bắt đầu + thời lượng của chính nó`.
    Cách đó sai ở hai chỗ:

    1. **Hạn đi giật lùi.** Node sau có thời lượng ngắn hơn node trước thì hạn của
       nó lại sớm hơn — K02 hạn 15/08 mà K03 (chạy sau) hạn 14/08.
    2. **Không biết ngày giao khách.** Quy trình 18 ngày mà hạn xa nhất chỉ 5 ngày,
       vì không có node nào cộng dồn thời lượng của các bước trước.

    Cách đúng: chạy dọc sơ đồ từ node bắt đầu, cộng dồn thời lượng.

        hạn(node) = hạn(node liền trước) + thời lượng(node)
        hạn(node đầu) = mốc khởi động + thời lượng(node đầu)

    Node có nhiều nhánh vào thì lấy mốc MUỘN NHẤT — phải chờ xong hết mới làm được.

    Đây là **kế hoạch cứng**: bắt đầu trễ thì hạn không dời, node báo trễ ngay.
    Đó là chủ ý — ngày giao khách phải cố định, và chậm thì phải thấy chậm.
    """
    rev = db.execute(
        text("""
            select r.graph, r.activated_at
            from public.workflow_instance_revisions r
            join public.workflow_instances wi on wi.active_revision_id = r.id
            where wi.id = :i
        """),
        {"i": workflow_instance_id},
    ).mappings().first()
    if not rev:
        return {"updated": 0}

    graph = rev["graph"] or {}
    graph_nodes = graph.get("nodes") or {}
    if not graph_nodes:
        return {"updated": 0}

    runtime = db.execute(
        text("""
            select node_key, id, started_at
            from public.task_nodes
            where workflow_instance_id = :i
        """),
        {"i": workflow_instance_id},
    ).mappings().all()
    if not runtime:
        return {"updated": 0}
    by_key = {r["node_key"]: r for r in runtime}

    # Mốc khởi động: lúc node đầu tiên thật sự bắt đầu. Chưa ai bắt đầu thì lấy
    # lúc giám đốc áp dụng quy trình, để sếp thấy ngay lịch dự kiến.
    started_timestamps = [r["started_at"] for r in runtime if r["started_at"]]
    anchor = min(started_timestamps) if started_timestamps else (rev["activated_at"] or datetime.now(timezone.utc))

    def get_node_duration(key: str) -> timedelta:
        d = graph_nodes.get(key) or {}
        return timedelta(days=int(d.get("duration_days") or 0),
                         hours=int(d.get("duration_hours") or 0))

    # Bậc vào để duyệt tô-pô. Bỏ cạnh tự trỏ và cạnh quay lui (quy trình cũ có
    # nhánh "cần bổ sung" quay ngược) — nếu không sẽ kẹt vòng lặp vô hạn.
    adj_list = {k: [] for k in graph_nodes}
    in_degrees = {k: 0 for k in graph_nodes}
    for key, d in graph_nodes.items():
        for dest in (d.get("transitions") or {}).values():
            if dest in graph_nodes and dest != key:
                adj_list[key].append(dest)
                in_degrees[dest] += 1

    deadlines: dict[str, datetime] = {}
    node_queue = [k for k, n in in_degrees.items() if n == 0] or [graph.get("start_node")]
    node_queue = [k for k in node_queue if k in graph_nodes]
    visited_nodes: set[str] = set()

    while node_queue:
        key = node_queue.pop(0)
        if key in visited_nodes:
            continue
        visited_nodes.add(key)
        incoming_anchor = deadlines.get(key, anchor)
        deadlines[key] = incoming_anchor + get_node_duration(key)
        for dest in adj_list[key]:
            # Node có nhiều nhánh vào phải chờ nhánh muộn nhất
            deadlines[dest] = max(deadlines.get(dest, deadlines[key]), deadlines[key])
            in_degrees[dest] -= 1
            if in_degrees[dest] <= 0 and dest not in visited_nodes:
                node_queue.append(dest)

    # Node còn kẹt do nhánh quay lui: vẫn phải có hạn, nối tiếp mốc muộn nhất
    for key in graph_nodes:
        if key not in deadlines:
            deadlines[key] = (max(deadlines.values()) if deadlines else anchor) + get_node_duration(key)

    # Quy trình chưa khai thời lượng ở bất kỳ bước nào là quy trình chưa có kế
    # hoạch — dựng hạn cho nó chỉ tạo ra một loạt việc "trễ" ngay từ lúc sinh ra.
    if sum((get_node_duration(k) for k in graph_nodes), timedelta(0)) == timedelta(0):
        return {"updated": 0, "anchor": anchor.isoformat() if anchor else None, "planned_end": None}

    updated_nodes_count = 0
    for key, deadline_dt in deadlines.items():
        node = by_key.get(key)
        # Bước khai 0 ngày vẫn phải có hạn: nó bằng hạn của bước liền trước, tức
        # phải xong trong cùng mốc đó. Bỏ qua thì nhân viên thấy "Không đặt hạn"
        # và không bao giờ bị nhắc trễ — đúng cái đang xảy ra ở node lưu trữ.
        if not node:
            continue
        db.execute(
            text("update public.task_nodes set deadline_at = :deadline_at, updated_at = now() where id = :i"),
            {"deadline_at": deadline_dt, "i": node["id"]},
        )
        updated_nodes_count += 1

    return {
        "updated": updated_nodes_count,
        "anchor": anchor.isoformat() if anchor else None,
        "planned_end": max(deadlines.values()).isoformat() if deadlines else None,
    }


def _maybe_create_legal_submission(
    db: Session, *, task_node: dict, node_def: dict, context: dict, actor_id: str
) -> str | None:
    """Node có cờ requires_gov_submission -> tự sinh 1 dòng legal_submissions.

    Ràng buộc: chỉ Hạng mục thuộc gói Pháp Lý mới sinh hồ sơ. Gói Đo Vẽ dù có kèm
    'hỗ trợ nộp' (trả 350k cho nhân viên) cũng KHÔNG theo dõi vòng đời hồ sơ — chặn
    ở đây để người dùng tick nhầm cờ cũng không tạo ra hồ sơ rác."""
    if not node_def.get("requires_gov_submission"):
        return None
    if context.get("service_package_id") != LEGAL_PACKAGE_ID:
        return None

    # Cùng lý do như hồ sơ đo vẽ: một hạng mục một hồ sơ nộp, không phải một
    # hồ sơ cho mỗi bước có cờ.
    existing_id = db.execute(
        text("""
            select id from public.legal_submissions
            where service_line_id = :service_line_id
            order by created_at, id
            limit 1
        """),
        {"service_line_id": context["service_line_id"]},
    ).scalar()
    if existing_id:
        return existing_id

    assignee = db.execute(
        _NODE_PRIMARY_ASSIGNEE_QUERY, {"task_node_id": task_node["id"]}
    ).mappings().first()

    # HỒ SƠ (1 dòng / Hạng mục) giữ trạng thái vòng đời. Mỗi LẦN NỘP là một dòng
    # legal_submissions riêng treo dưới nó — nộp lại lần 3 không tạo hồ sơ mới.
    dossier_id = db.execute(
        text("""
            insert into public.legal_dossiers
                (service_line_id, contract_id, task_node_id, dossier_name,
                 assigned_employee_id, status, created_by)
            values (:service_line_id, :contract_id, :task_node_id, :dossier_name,
                    :assigned_employee_id, 'ASSIGNED', :created_by)
            on conflict (service_line_id) do update set task_node_id = excluded.task_node_id
            returning id
        """),
        {
            "service_line_id": context["service_line_id"],
            "contract_id": context["contract_id"],
            "task_node_id": task_node["id"],
            "dossier_name": context["customer_name"],
            "assigned_employee_id": assignee["employee_id"] if assignee else None,
            "created_by": actor_id,
        },
    ).scalar()

    db.execute(
        text("""
            insert into public.legal_dossier_events (dossier_id, from_status, to_status, note, actor_user_id)
            values (:d, null, 'ASSIGNED', :n, :a)
        """),
        {"d": dossier_id, "n": "Bộ phận đo vẽ đã bàn giao, hồ sơ chờ tiếp nhận", "a": actor_id},
    )

    return db.execute(
        text("""
            insert into public.legal_submissions
                (task_node_id, dossier_id, submit_seq, service_line_id, contract_id,
                 dossier_name, case_description, assigned_employee_id, contact_phone,
                 linked_survey_folder_url, created_by)
            values
                (:task_node_id, :dossier_id, 1, :service_line_id, :contract_id,
                 :dossier_name, :case_description, :assigned_employee_id, :contact_phone,
                 :linked_survey_folder_url, :created_by)
            returning id
        """),
        {
            "task_node_id": task_node["id"],
            "dossier_id": dossier_id,
            "service_line_id": context["service_line_id"],
            "contract_id": context["contract_id"],
            "dossier_name": context["customer_name"],
            "case_description": node_def.get("name"),
            "assigned_employee_id": assignee["employee_id"] if assignee else None,
            # SĐT bên Pháp lý là của NHÂN VIÊN đi nộp (in trên biên nhận để cơ quan liên hệ),
            # khác với tab Đo vẽ dùng SĐT khách hàng.
            "contact_phone": assignee["phone"] if assignee else None,
            "linked_survey_folder_url": context["survey_drive_folder_url"],
            "created_by": actor_id,
        },
    ).scalar()


def _maybe_create_survey_record(
    db: Session, *, task_node: dict, node_def: dict, context: dict, actor_id: str
) -> str | None:
    """Node có cờ creates_survey_record -> tự sinh 1 dòng hồ sơ Đo vẽ.

    Chỉ lưu phần dữ liệu KHÔNG có sẵn ở nơi khác (tên hồ sơ, phường, độ ưu tiên).
    Khách hàng, SĐT, người phụ trách, các mốc ngày… đọc thẳng lúc hiển thị để
    không bao giờ lệch với dữ liệu gốc."""
    if not node_def.get("creates_survey_record"):
        return None

    # Một HẠNG MỤC chỉ có MỘT hồ sơ đo vẽ, dù bao nhiêu bước trong quy trình
    # mang cờ này. Trước đây chỉ chặn trùng theo task_node_id, nên một quy trình
    # lỡ bật cờ ở ba bước là sinh ra ba hồ sơ đo vẽ cho cùng một hạng mục —
    # người dùng thấy ba dòng y hệt nhau trong danh sách và không biết bỏ cái nào.
    existing_id = db.execute(
        text("""
            select id from public.survey_records
            where service_line_id = :service_line_id
            order by created_at, id
            limit 1
        """),
        {"service_line_id": context["service_line_id"]},
    ).scalar()
    if existing_id:
        return existing_id

    return db.execute(
        text("""
            insert into public.survey_records
                (task_node_id, service_line_id, contract_id, dossier_name, created_by)
            values
                (:task_node_id, :service_line_id, :contract_id, :dossier_name, :created_by)
            on conflict (task_node_id) do nothing
            returning id
        """),
        {
            "task_node_id": task_node["id"],
            "service_line_id": context["service_line_id"],
            "contract_id": context["contract_id"],
            "dossier_name": context["customer_name"],
            "created_by": actor_id,
        },
    ).scalar()


def _ensure_node_module_records(
    db: Session, *, task_node_id: str, actor_id: str
) -> dict[str, str]:
    """Ensure module rows as soon as a Node enters the ready state.

    The task-node row is locked so transition, retry and employee-start calls
    cannot create duplicate records concurrently.  Calling this again is safe
    and returns the existing record IDs.
    """
    node = db.execute(
        text("""
            select id, status, workflow_instance_id, defined_by_revision_id, node_key
            from public.task_nodes
            where id = :task_node_id
            for update
        """),
        {"task_node_id": task_node_id},
    ).mappings().first()
    if not node:
        return {}

    node = dict(node)
    node_def = _node_definition(db, node)
    if not node_def:
        return {}
    context = db.execute(
        _NODE_START_CONTEXT_QUERY,
        {"workflow_instance_id": node["workflow_instance_id"]},
    ).mappings().first()
    if not context:
        return {}

    context = dict(context)
    result: dict[str, str] = {}
    legal_submission_id = _maybe_create_legal_submission(
        db, task_node=node, node_def=node_def, context=context, actor_id=actor_id
    )
    if legal_submission_id:
        result["legal_submission_id"] = legal_submission_id
    survey_record_id = _maybe_create_survey_record(
        db, task_node=node, node_def=node_def, context=context, actor_id=actor_id
    )
    if survey_record_id:
        result["survey_record_id"] = survey_record_id
    return result


def start_task_node(db: Session, *, task_node_id: str, employee_id: str, actor_id: str) -> dict[str, Any]:
    """Employee begins work on a node they are assigned to: ready/rework_required -> in_progress."""
    _require_node_assignment(db, task_node_id=task_node_id, employee_id=employee_id)
    node = db.execute(
        text("""
            select id, status, workflow_instance_id, defined_by_revision_id, node_key
            from public.task_nodes
            where id = :task_node_id
            for update
        """),
        {"task_node_id": task_node_id},
    ).mappings().first()
    if not node:
        raise WorkflowValidationError("Node không tồn tại")
    if node["status"] not in ("ready", "rework_required"):
        raise WorkflowValidationError("Node phải ở trạng thái 'Sẵn sàng thực hiện' hoặc 'Cần làm lại' để bắt đầu")

    db.execute(
        text("""
            update public.task_nodes
            set status = 'in_progress', started_at = coalesce(started_at, now()), updated_at = now()
            where id = :task_node_id
        """),
        {"task_node_id": task_node_id},
    )
    db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            values
                (:task_node_id, 'NODE_STARTED', :from_status, 'in_progress', :actor_id, '{}'::jsonb)
        """),
        {"task_node_id": task_node_id, "from_status": node["status"], "actor_id": actor_id},
    )
    result = {"task_node_id": task_node_id, "status": "in_progress"}
    node_def = _node_definition(db, node)
    if not node_def:
        return result

    # Tính lại hạn cho TOÀN BỘ quy trình, không riêng node vừa bắt đầu — hạn là
    # chuỗi cộng dồn nên đụng một node là ảnh hưởng cả dây phía sau.
    recompute_planned_deadlines(db, workflow_instance_id=node["workflow_instance_id"])

    # Fallback cho các workflow được kích hoạt trước khi cơ chế provision-at-ready
    # được triển khai. Hàm ensure idempotent nên retry/rework không sinh bản ghi mới.
    result.update(_ensure_node_module_records(
        db, task_node_id=task_node_id, actor_id=actor_id
    ))
    return result


def submit_task_node_for_acceptance(
    db: Session, *, task_node_id: str, employee_id: str, actor_id: str, note: str | None
) -> dict[str, Any]:
    """Employee submits a node for manager review: in_progress -> submitted.

    Requires every required checklist item to already be approved/late-approved or not_applicable
    (evidence is reviewed independently via the checklist endpoints)."""
    _require_node_assignment(db, task_node_id=task_node_id, employee_id=employee_id)
    node = db.execute(
        text("select id, status from public.task_nodes where id = :task_node_id for update"),
        {"task_node_id": task_node_id},
    ).mappings().first()
    if not node:
        raise WorkflowValidationError("Node không tồn tại")
    if node["status"] != "in_progress":
        raise WorkflowValidationError("Node phải ở trạng thái 'Đang thực hiện' để nộp nghiệm thu")

    unresolved = db.execute(
        text("""
            select checklist_name from public.task_node_checklist_results
            where task_node_id = :task_node_id
              and status not in ('approved', 'late_approved', 'not_applicable')
            order by checklist_name
        """),
        {"task_node_id": task_node_id},
    ).mappings().all()
    if unresolved:
        names = ", ".join(row["checklist_name"] for row in unresolved)
        raise WorkflowValidationError(f"Còn checklist bắt buộc chưa đạt: {names}")

    attempt_no = (db.execute(
        text("select coalesce(max(attempt_no), 0) + 1 from public.task_node_acceptances where task_node_id = :task_node_id"),
        {"task_node_id": task_node_id},
    ).scalar_one())

    acceptance_id = db.execute(
        text("""
            insert into public.task_node_acceptances
                (task_node_id, attempt_no, status, submitted_by, submission_payload)
            values
                (:task_node_id, :attempt_no, 'pending', :actor_id, cast(:payload as jsonb))
            returning id
        """),
        {
            "task_node_id": task_node_id,
            "attempt_no": attempt_no,
            "actor_id": actor_id,
            "payload": json.dumps({"note": note} if note else {}),
        },
    ).scalar_one()

    db.execute(
        text("""
            update public.task_nodes
            set status = 'submitted', submitted_at = now(), updated_at = now()
            where id = :task_node_id
        """),
        {"task_node_id": task_node_id},
    )
    db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            values
                (:task_node_id, 'NODE_SUBMITTED', 'in_progress', 'submitted', :actor_id,
                 cast(:payload as jsonb))
        """),
        {
            "task_node_id": task_node_id,
            "actor_id": actor_id,
            "payload": json.dumps({"acceptance_id": acceptance_id, "attempt_no": attempt_no}),
        },
    )
    return {"task_node_id": task_node_id, "acceptance_id": acceptance_id, "status": "submitted"}


def review_task_node_acceptance(
    db: Session,
    *,
    acceptance_id: str,
    decision: str,
    outcome: str | None,
    review_note: str | None,
    actor_id: str,
) -> dict[str, Any]:
    """Manager reviews a submitted node: accepted (advances the graph) or rework_required."""
    if decision not in ("accepted", "rework_required"):
        raise WorkflowValidationError("decision phải là 'accepted' hoặc 'rework_required'")

    acceptance = db.execute(
        text("""
            select a.id, a.status, a.task_node_id, n.node_key, n.status as node_status,
                   n.workflow_instance_id, n.defined_by_revision_id
            from public.task_node_acceptances a
            join public.task_nodes n on n.id = a.task_node_id
            where a.id = :acceptance_id
            for update of a, n
        """),
        {"acceptance_id": acceptance_id},
    ).mappings().first()
    if not acceptance:
        raise WorkflowValidationError("Không tìm thấy lượt nghiệm thu")
    if acceptance["status"] != "pending":
        raise WorkflowValidationError("Lượt nghiệm thu này đã được duyệt")
    if acceptance["node_status"] != "submitted":
        raise WorkflowValidationError("Node không còn ở trạng thái chờ nghiệm thu")

    task_node_id = acceptance["task_node_id"]

    unresolved = db.execute(
        text("""
            select checklist_name
            from public.task_node_checklist_results
            where task_node_id = :task_node_id
              and status not in ('approved', 'late_approved', 'not_applicable')
            order by checklist_name
        """),
        {"task_node_id": task_node_id},
    ).mappings().all()
    if unresolved:
        names = ", ".join(row["checklist_name"] for row in unresolved)
        raise WorkflowValidationError(
            f"Không thể nghiệm thu Node vì còn checklist chưa được duyệt: {names}"
        )

    # ── Cổng kiểm soát công nợ Node K08 (Bàn giao kết quả) ──
    node_key_str = (acceptance.get("node_key") or "").upper()
    if decision == "accepted" and ("K08" in node_key_str or "HANDOVER" in node_key_str or "BAN_GIAO" in node_key_str):
        contract_info = db.execute(
            text("""
                select wi.contract_id, c.total_value, c.completion_override,
                       coalesce(r.paid_amount, 0) as paid_amount
                from public.workflow_instances wi
                left join public.contracts c on c.id = wi.contract_id
                left join public.receivables r on r.contract_id = wi.contract_id
                where wi.id = :instance_id
            """),
            {"instance_id": acceptance["workflow_instance_id"]},
        ).mappings().first()

        if contract_info and contract_info["contract_id"]:
            c_total = float(contract_info["total_value"] or 0)
            c_paid = float(contract_info["paid_amount"] or 0)
            c_debt = max(c_total - c_paid, 0.0)
            has_override = bool(contract_info["completion_override"])

            if c_debt > 0 and not has_override:
                raise WorkflowValidationError(
                    f"Chặn bàn giao: Hợp đồng {contract_info['contract_id']} còn nợ ({c_debt:,.0f}đ). "
                    "Hệ thống chặn hoàn thành Node K08 trừ khi có Giám đốc duyệt cho nợ ngoại lệ."
                )

    if decision == "rework_required":
        db.execute(
            text("""
                update public.task_node_acceptances
                set status = 'rework_required', reviewer_user_id = :actor_id, reviewed_at = now(),
                    review_note = :note
                where id = :acceptance_id
            """),
            {"acceptance_id": acceptance_id, "actor_id": actor_id, "note": review_note},
        )
        db.execute(
            text("""
                update public.task_nodes
                set status = 'rework_required', updated_at = now()
                where id = :task_node_id
            """),
            {"task_node_id": task_node_id},
        )
        db.execute(
            text("""
                insert into public.task_node_events
                    (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
                values
                    (:task_node_id, 'NODE_REJECTED', 'submitted', 'rework_required', :actor_id,
                     cast(:payload as jsonb))
            """),
            {
                "task_node_id": task_node_id,
                "actor_id": actor_id,
                "payload": json.dumps({"acceptance_id": acceptance_id, "review_note": review_note or ""}),
            },
        )
        return {"task_node_id": task_node_id, "status": "rework_required"}

    graph_row = db.execute(
        text("""
            select graph from public.workflow_instance_revisions
            where workflow_instance_id = :instance_id and id = :revision_id
        """),
        {
            "instance_id": acceptance["workflow_instance_id"],
            "revision_id": acceptance["defined_by_revision_id"],
        },
    ).mappings().first()
    node_def = (graph_row["graph"]["nodes"] or {}).get(acceptance["node_key"]) if graph_row else None
    transitions = (node_def or {}).get("transitions") or {}
    if outcome and transitions and outcome not in transitions:
        raise WorkflowValidationError(f"Outcome '{outcome}' không hợp lệ cho node này")
    if transitions and not outcome:
        raise WorkflowValidationError("Cần chọn outcome để xác định bước tiếp theo")

    db.execute(
        text("""
            update public.task_node_acceptances
            set status = 'accepted', reviewer_user_id = :actor_id, reviewed_at = now(),
                review_note = :note
            where id = :acceptance_id
        """),
        {"acceptance_id": acceptance_id, "actor_id": actor_id, "note": review_note},
    )
    db.execute(
        text("""
            update public.task_nodes
            set status = 'accepted', outcome = :outcome, accepted_at = now(), completed_at = now(), updated_at = now()
            where id = :task_node_id
        """),
        {"task_node_id": task_node_id, "outcome": outcome},
    )
    db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            values
                (:task_node_id, 'NODE_ACCEPTED', 'submitted', 'accepted', :actor_id, cast(:payload as jsonb))
        """),
        {
            "task_node_id": task_node_id,
            "actor_id": actor_id,
            "payload": json.dumps({"acceptance_id": acceptance_id, "outcome": outcome}),
        },
    )

    entitlement_count, entitlement_amount = _generate_work_pay_entitlements(
        db,
        task_node_id=task_node_id,
        workflow_instance_id=acceptance["workflow_instance_id"],
        acceptance_id=acceptance_id,
        actor_id=actor_id,
    )

    next_node_key = transitions.get(outcome) if outcome else None
    unlocked_node_id = None
    if next_node_key:
        next_node = db.execute(
            text("""
                select id, status from public.task_nodes
                where workflow_instance_id = :instance_id and node_key = :node_key
                for update
            """),
            {"instance_id": acceptance["workflow_instance_id"], "node_key": next_node_key},
        ).mappings().first()
        if next_node and next_node["status"] == "pending":
            db.execute(
                text("""
                    update public.task_nodes
                    set status = 'ready', updated_at = now()
                    where id = :node_id
                """),
                {"node_id": next_node["id"]},
            )
            db.execute(
                text("""
                    insert into public.task_node_events
                        (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
                    values
                        (:node_id, 'NODE_UNLOCKED', 'pending', 'ready', :actor_id,
                         cast(:payload as jsonb))
                """),
                {
                    "node_id": next_node["id"],
                    "actor_id": actor_id,
                    "payload": json.dumps({"unlocked_by_task_node_id": task_node_id}),
                },
            )
            unlocked_node_id = next_node["id"]
            _ensure_node_module_records(
                db, task_node_id=next_node["id"], actor_id=actor_id
            )

    if not next_node_key:
        remaining = db.execute(
            text("""
                select 1 from public.task_nodes
                where workflow_instance_id = :instance_id
                  and status not in ('accepted', 'skipped', 'cancelled')
                limit 1
            """),
            {"instance_id": acceptance["workflow_instance_id"]},
        ).first()
        if not remaining:
            db.execute(
                text("""
                    update public.workflow_instances
                    set status = 'completed', completed_at = now(), updated_at = now()
                    where id = :instance_id and status = 'running'
                """),
                {"instance_id": acceptance["workflow_instance_id"]},
            )

    return {
        "task_node_id": task_node_id,
        "status": "accepted",
        "unlocked_node_id": unlocked_node_id,
        "entitlement_count": entitlement_count,
        "entitlement_amount": entitlement_amount,
    }


def _generate_work_pay_entitlements(
    db: Session, *, task_node_id: str, workflow_instance_id: str, acceptance_id: str, actor_id: str
) -> tuple[int, float]:
    """Create idempotent pay entitlements for every approved payable checklist on this node."""
    payable = db.execute(
        text("""
            select r.id as checklist_result_id, r.checklist_name, r.work_item_id
            from public.task_node_checklist_results r
            where r.task_node_id = :task_node_id and r.is_payable
              and r.status in ('approved', 'late_approved')
        """),
        {"task_node_id": task_node_id},
    ).mappings().all()
    if not payable:
        return 0, 0.0

    work_item_rates = _current_work_item_rates(db)
    count = 0
    total = 0.0
    for checklist in payable:
        assignments = db.execute(
            text("""
                select id, employee_id, role_code, work_item_rate_id
                from public.task_node_checklist_assignments
                where checklist_result_id = :checklist_result_id
                  and status not in ('replaced', 'cancelled')
            """),
            {"checklist_result_id": checklist["checklist_result_id"]},
        ).mappings().all()
        for assignment in assignments:
            rate = work_item_rates.get(checklist["work_item_id"], {}).get(assignment["role_code"])
            amount = float(rate["amount"]) if rate else None
            if not amount or amount <= 0:
                continue
            idempotency_key = f"{assignment['id']}:{acceptance_id}"
            exists = db.execute(
                text("select 1 from public.work_pay_entitlements where idempotency_key = :key"),
                {"key": idempotency_key},
            ).first()
            if exists:
                continue
            db.execute(
                text("""
                    insert into public.work_pay_entitlements
                        (workflow_instance_id, task_node_id, checklist_result_id, checklist_assignment_id,
                         acceptance_id, work_item_rate_id, employee_id, role_code, amount, earned_at,
                         status, calculation_snapshot, idempotency_key)
                    values
                        (:workflow_instance_id, :task_node_id, :checklist_result_id, :checklist_assignment_id,
                         :acceptance_id, :work_item_rate_id, :employee_id, :role_code, :amount, now(),
                         'eligible', cast(:snapshot as jsonb), :idempotency_key)
                """),
                {
                    "workflow_instance_id": workflow_instance_id,
                    "task_node_id": task_node_id,
                    "checklist_result_id": checklist["checklist_result_id"],
                    "checklist_assignment_id": assignment["id"],
                    "acceptance_id": acceptance_id,
                    "work_item_rate_id": assignment["work_item_rate_id"],
                    "employee_id": assignment["employee_id"],
                    "role_code": assignment["role_code"],
                    "amount": amount,
                    "snapshot": json.dumps({
                        "checklist_name": checklist["checklist_name"],
                        "role_code": assignment["role_code"],
                        "rate_amount": amount,
                    }),
                    "idempotency_key": idempotency_key,
                },
            )
            count += 1
            total += amount
    return count, total


def cancel_workflow(
    db: Session,
    *,
    service_line_id: str,
    cancellation_code: str,
    reason: str,
    agency_handling_confirmed: bool,
    agency_handling_note: str | None,
    actor_id: str,
) -> dict[str, Any]:
    """Terminally cancel one workflow while preserving evidence and earned pay."""
    code = str(cancellation_code or "").strip().upper()
    normalized_reason = str(reason or "").strip()
    normalized_agency_note = str(agency_handling_note or "").strip() or None
    if code not in CANCELLATION_CODES:
        raise WorkflowValidationError("Nhóm lý do hủy quy trình không hợp lệ")
    if len(normalized_reason) < 5:
        raise WorkflowValidationError("Lý do hủy quy trình phải có ít nhất 5 ký tự")

    instance = db.execute(
        text("""
            select id, status, active_revision_id
            from public.workflow_instances
            where service_line_id = :service_line_id
            for update
        """),
        {"service_line_id": service_line_id},
    ).mappings().first()
    if not instance:
        raise WorkflowValidationError("Hạng mục chưa có workflow để hủy")
    if instance["status"] == "cancelled":
        raise WorkflowValidationError("Workflow này đã được hủy trước đó")
    if instance["status"] == "completed":
        raise WorkflowValidationError("Workflow đã hoàn thành; không thể chuyển thành đã hủy")
    if instance["status"] not in {"not_started", "running", "paused"}:
        raise WorkflowValidationError("Trạng thái workflow hiện tại không cho phép hủy")

    node_rows = [dict(row) for row in db.execute(
        text("""
            select id, node_key, node_code, status, outcome,
                   started_at, submitted_at, accepted_at
            from public.task_nodes
            where workflow_instance_id = :workflow_instance_id
            order by id
            for update
        """),
        {"workflow_instance_id": instance["id"]},
    ).mappings().all()]
    agency_nodes = [
        node for node in node_rows
        if node["node_code"] in {"K06", "K07", "K08"}
        and (
            node["status"] in {"in_progress", "submitted", "accepted"}
            or node["started_at"] is not None
            or node["submitted_at"] is not None
            or node["accepted_at"] is not None
        )
    ]
    if agency_nodes and not agency_handling_confirmed:
        raise WorkflowValidationError(
            "Hồ sơ đã đi vào khâu cơ quan nhà nước; cần xác nhận phương án rút/bàn giao hồ sơ"
        )
    if agency_nodes and (not normalized_agency_note or len(normalized_agency_note) < 5):
        raise WorkflowValidationError(
            "Cần ghi rõ phương án xử lý hồ sơ đang ở cơ quan trước khi hủy"
        )

    cancellable_statuses = {
        "pending", "ready", "in_progress", "submitted",
        "rework_required", "blocked",
    }
    cancelled_nodes = [node for node in node_rows if node["status"] in cancellable_statuses]
    cancelled_node_ids = [node["id"] for node in cancelled_nodes]

    entitlement = db.execute(
        text("""
            select count(*)::integer as entitlement_count,
                   coalesce(sum(amount), 0) as entitlement_amount
            from public.work_pay_entitlements
            where workflow_instance_id = :workflow_instance_id
              and status <> 'void'
        """),
        {"workflow_instance_id": instance["id"]},
    ).mappings().one()

    if cancelled_node_ids:
        db.execute(
            text("""
                update public.task_node_acceptances
                set status = 'rejected', reviewer_user_id = :actor_id,
                    reviewed_at = now(), review_note = :reason
                where task_node_id = any(:task_node_ids)
                  and status = 'pending'
            """),
            {
                "task_node_ids": cancelled_node_ids,
                "actor_id": actor_id,
                "reason": f"Workflow bị hủy: {normalized_reason}",
            },
        )
        assignment_count = db.execute(
            text("""
                update public.task_node_assignments
                set assignment_status = 'cancelled', ended_at = now(),
                    replacement_reason = :reason, updated_at = now()
                where task_node_id = any(:task_node_ids)
                  and assignment_status in ('proposed', 'assigned', 'accepted')
                returning id
            """),
            {"task_node_ids": cancelled_node_ids, "reason": normalized_reason},
        ).rowcount
        checklist_assignment_count = db.execute(
            text("""
                update public.task_node_checklist_assignments ca
                set status = 'cancelled', ended_at = now(), reason = :reason, updated_at = now()
                from public.task_node_checklist_results cr
                where ca.checklist_result_id = cr.id
                  and cr.task_node_id = any(:task_node_ids)
                  and ca.status in ('proposed', 'assigned')
                returning ca.id
            """),
            {"task_node_ids": cancelled_node_ids, "reason": normalized_reason},
        ).rowcount
        checklist_count = db.execute(
            text("""
                update public.task_node_checklist_results
                set status = 'not_applicable',
                    note = concat_ws(E'\n', nullif(note, ''), :note),
                    updated_at = now()
                where task_node_id = any(:task_node_ids)
                  and status = 'pending'
                returning id
            """),
            {
                "task_node_ids": cancelled_node_ids,
                "note": f"Không tiếp tục do workflow bị hủy: {normalized_reason}",
            },
        ).rowcount

        for node in cancelled_nodes:
            db.execute(
                text("""
                    insert into public.task_node_events
                        (task_node_id, event_type, from_status, to_status,
                         actor_user_id, payload)
                    values
                        (:task_node_id, 'WORKFLOW_CANCELLED', :from_status, 'cancelled',
                         :actor_id, cast(:payload as jsonb))
                """),
                {
                    "task_node_id": node["id"],
                    "from_status": node["status"],
                    "actor_id": actor_id,
                    "payload": json.dumps({
                        "workflow_instance_id": instance["id"],
                        "cancellation_code": code,
                        "reason": normalized_reason,
                        "agency_handling_note": normalized_agency_note,
                    }, ensure_ascii=False),
                },
            )
        db.execute(
            text("""
                update public.task_nodes
                set status = 'cancelled',
                    blocked_reason = case
                      when status = 'blocked' then blocked_reason
                      else null
                    end,
                    notes = concat_ws(E'\n', nullif(notes, ''), :note),
                    updated_at = now()
                where id = any(:task_node_ids)
            """),
            {
                "task_node_ids": cancelled_node_ids,
                "note": f"Workflow bị hủy: {normalized_reason}",
            },
        )
    else:
        assignment_count = 0
        checklist_assignment_count = 0
        checklist_count = 0

    discarded_revision_count = db.execute(
        text("""
            update public.workflow_instance_revisions
            set status = 'discarded',
                change_reason = concat_ws(E'\n', nullif(change_reason, ''), :reason)
            where workflow_instance_id = :workflow_instance_id
              and status = 'draft'
            returning id
        """),
        {
            "workflow_instance_id": instance["id"],
            "reason": f"Bản nháp bị đóng do hủy workflow: {normalized_reason}",
        },
    ).rowcount

    cancellation_data = {
        "previous_status": instance["status"],
        "cancelled_node_count": len(cancelled_node_ids),
        "preserved_node_count": len(node_rows) - len(cancelled_node_ids),
        "cancelled_assignment_count": assignment_count,
        "cancelled_compensation_assignment_count": checklist_assignment_count,
        "cancelled_checklist_count": checklist_count,
        "discarded_draft_revision_count": discarded_revision_count,
        "preserved_entitlement_count": int(entitlement["entitlement_count"] or 0),
        "preserved_entitlement_amount": float(entitlement["entitlement_amount"] or 0),
        "agency_handling_required": bool(agency_nodes),
        "agency_handling_confirmed": bool(agency_nodes and agency_handling_confirmed),
        "agency_handling_note": normalized_agency_note,
        "agency_node_ids": [node["id"] for node in agency_nodes],
    }
    db.execute(
        text("""
            update public.workflow_instances
            set status = 'cancelled', cancellation_code = :cancellation_code,
                cancellation_reason = :cancellation_reason,
                cancellation_data = cast(:cancellation_data as jsonb),
                cancelled_by = :actor_id, cancelled_at = now(), updated_at = now()
            where id = :workflow_instance_id
        """),
        {
            "workflow_instance_id": instance["id"],
            "cancellation_code": code,
            "cancellation_reason": normalized_reason,
            "cancellation_data": json.dumps(cancellation_data, ensure_ascii=False),
            "actor_id": actor_id,
        },
    )
    return {
        "instance_id": instance["id"],
        "status": "cancelled",
        **cancellation_data,
    }
