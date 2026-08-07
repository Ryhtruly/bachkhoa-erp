"""Domain service for drafting and activating service-line workflows.

The graph remains the immutable definition of a revision.  Activation
materializes queryable runtime rows for nodes, checklist results and employee
assignments in the same database transaction.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import text
from sqlalchemy.orm import Session


ROLE_CODE_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")
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

    planned_start = _parse_datetime(raw.get("planned_start"), "Thời gian bắt đầu")
    planned_end = _parse_datetime(raw.get("planned_end"), "Thời gian kết thúc")
    if planned_start and planned_end and planned_end < planned_start:
        raise WorkflowValidationError(f"Node {node_key}: thời gian kết thúc phải sau thời gian bắt đầu")

    return {
        "employee_id": employee_id,
        "role_code": role_code,
        "is_primary": bool(raw.get("is_primary")),
        "planned_start": planned_start,
        "planned_end": planned_end,
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


def _validate_drive_url(value: Any, *, node_key: str, checklist_name: str) -> str | None:
    url = str(value or "").strip()
    if not url:
        return None
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in {
        "drive.google.com", "docs.google.com"
    }:
        raise WorkflowValidationError(
            f"Node {node_key}: link minh chứng của checklist {checklist_name!r} "
            "phải là link Google Drive hợp lệ"
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

            normalized_checklist.append({
                **raw_item,
                "key": checklist_key,
                "name": checklist_name,
                "required": raw_item.get("required") is not False,
                "evidence_required": bool(raw_item.get("evidence_required")),
                "evidence_description": str(raw_item.get("evidence_description") or "").strip(),
                "drive_folder_url": _validate_drive_url(
                    raw_item.get("drive_folder_url"),
                    node_key=node_key,
                    checklist_name=checklist_name,
                ),
                "compensation": compensation,
            })

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
            json_assignments.append({
                **assignment,
                "planned_start": assignment["planned_start"].isoformat() if assignment["planned_start"] else None,
                "planned_end": assignment["planned_end"].isoformat() if assignment["planned_end"] else None,
            })
        if primary_count > 1:
            raise WorkflowValidationError(f"Node {node_key}: chỉ được có một người phụ trách chính")
        if minimum_start_date:
            for assignment in assignments:
                for field_name, value in (
                    ("Ngày bắt đầu", assignment["planned_start"]),
                    ("Ngày kết thúc", assignment["planned_end"]),
                ):
                    if value and value.date() < minimum_start_date:
                        raise WorkflowValidationError(
                            f"Node {node_key}: {field_name} không được trước ngày ký hợp đồng "
                            f"{minimum_start_date.isoformat()}"
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

        normalized_nodes[node_key] = {
            **raw_node,
            "task_code": node_code,
            "name": str(raw_node.get("name") or node_code).strip(),
            "description": str(raw_node.get("description") or "").strip(),
            "checklist": normalized_checklist,
            "assignments": json_assignments,
            "transitions": normalized_transitions,
        }

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
            select id, node_key, node_code, status, occurrence_no
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
        if row["status"] not in {"pending", "ready"}:
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
    compensation_assignment_count = 0
    projected_compensation_amount = 0.0

    # Pending/ready Nodes may receive revised checklist definitions. Started Nodes keep
    # their original execution snapshot so evidence and acceptance history never move.
    for node_key in sorted(set(runtime_by_key) & set(graph_nodes)):
        runtime_node = runtime_by_key[node_key]
        desired_node = graph_nodes[node_key]
        if runtime_node["status"] not in {"pending", "ready"}:
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
            if current["status"] in {"passed", "failed"}:
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

        assignments = desired_node.get("assignments") or []
        for item in desired_by_key.values():
            current = existing_by_key.get(item["key"])
            if current and current["status"] in {"passed", "failed"}:
                continue
            compensation = item.get("compensation") or {"is_payable": False}
            is_payable = bool(compensation.get("is_payable"))
            evidence_definition = json.dumps({
                "required": bool(item.get("evidence_required")),
                "description": item.get("evidence_description") or "",
                "drive_folder_url": item.get("drive_folder_url"),
            }, ensure_ascii=False)
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
                             status, evidence_data, work_item_id, is_payable,
                             pay_group_key, pay_scope, pay_key, condition_result)
                        values (:task_node_id, :checklist_key, :checklist_name, :is_required,
                                'pending', cast(:evidence_data as jsonb), :work_item_id, :is_payable,
                                :pay_group_key, :pay_scope, :pay_key, '{}'::jsonb)
                        returning id
                    """),
                    {
                        "task_node_id": runtime_node["id"],
                        "checklist_key": item["key"],
                        "checklist_name": item["name"],
                        "is_required": item.get("required") is not False,
                        "evidence_data": json.dumps({
                            "required": bool(item.get("evidence_required")),
                            "description": item.get("evidence_description") or "",
                            "drive_folder_url": item.get("drive_folder_url"),
                            "files": [],
                        }, ensure_ascii=False),
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
        planned_starts = [_parse_datetime(item.get("planned_start"), "Thời gian bắt đầu") for item in assignments]
        planned_ends = [_parse_datetime(item.get("planned_end"), "Thời gian kết thúc") for item in assignments]
        status = (
            "ready"
            if node_key == revision["graph"]["start_node"] and not has_live_node
            else "pending"
        )
        task_node_id = db.execute(
            text("""
                insert into public.task_nodes
                    (workflow_instance_id, defined_by_revision_id, node_key, node_code,
                     occurrence_no, status, execution_data, planned_start, planned_end, notes)
                values (:instance_id, :revision_id, :node_key, :node_code, :occurrence_no, :status,
                        '{}'::jsonb, :planned_start, :planned_end, :notes)
                returning id
            """),
            {
                "instance_id": instance["id"],
                "revision_id": revision["id"],
                "node_key": node_key,
                "node_code": node["task_code"],
                "occurrence_no": occurrence_no,
                "status": status,
                "planned_start": min((v for v in planned_starts if v), default=None),
                "planned_end": max((v for v in planned_ends if v), default=None),
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
                         status, evidence_data, work_item_id, is_payable,
                         pay_group_key, pay_scope, pay_key, condition_result)
                    values (:task_node_id, :checklist_key, :checklist_name, :is_required,
                            'pending', cast(:evidence_data as jsonb), :work_item_id, :is_payable,
                            :pay_group_key, :pay_scope, :pay_key, '{}'::jsonb)
                    returning id
                """),
                {
                    "task_node_id": task_node_id,
                    "checklist_key": item["key"],
                    "checklist_name": item["name"],
                    "is_required": item.get("required") is not False,
                    "evidence_data": json.dumps({
                        "required": bool(item.get("evidence_required")),
                        "description": item.get("evidence_description") or "",
                        "drive_folder_url": item.get("drive_folder_url"),
                        "files": [],
                    }, ensure_ascii=False),
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

        for assignment in assignments:
            db.execute(
                text("""
                    insert into public.task_node_assignments
                        (task_node_id, employee_id, role_code, is_primary,
                         assignment_status, planned_start, planned_end, assigned_by, notes)
                    values (:task_node_id, :employee_id, :role_code, :is_primary,
                            'assigned', :planned_start, :planned_end, :actor_id, :notes)
                """),
                {
                    "task_node_id": task_node_id,
                    "employee_id": assignment["employee_id"],
                    "role_code": assignment["role_code"],
                    "is_primary": assignment.get("is_primary", False),
                    "planned_start": _parse_datetime(assignment.get("planned_start"), "Thời gian bắt đầu"),
                    "planned_end": _parse_datetime(assignment.get("planned_end"), "Thời gian kết thúc"),
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

    return {
        "instance_id": instance["id"],
        "revision_id": revision["id"],
        "revision_no": revision["revision_no"],
        "status": instance["status"],
        "amended": True,
        "node_count": len(added_keys),
        "removed_node_count": len(removed_keys),
        "checklist_count": checklist_count,
        "assignment_count": assignment_count,
        "compensation_assignment_count": compensation_assignment_count,
        "projected_compensation_amount": projected_compensation_amount,
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
        planned_starts = [_parse_datetime(item.get("planned_start"), "Thời gian bắt đầu") for item in assignments]
        planned_ends = [_parse_datetime(item.get("planned_end"), "Thời gian kết thúc") for item in assignments]
        planned_start = min((value for value in planned_starts if value), default=None)
        planned_end = max((value for value in planned_ends if value), default=None)
        status = "ready" if node_key == start_node else "pending"
        task_node_id = db.execute(
            text("""
                insert into public.task_nodes
                    (workflow_instance_id, defined_by_revision_id, node_key, node_code,
                     occurrence_no, status, execution_data, planned_start, planned_end, notes)
                values
                    (:instance_id, :revision_id, :node_key, :node_code,
                     1, :status, '{}'::jsonb, :planned_start, :planned_end, :notes)
                returning id
            """),
            {
                "instance_id": instance["id"],
                "revision_id": revision["id"],
                "node_key": node_key,
                "node_code": node["task_code"],
                "status": status,
                "planned_start": planned_start,
                "planned_end": planned_end,
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
                         status, evidence_data, work_item_id, is_payable,
                         pay_group_key, pay_scope, pay_key, condition_result)
                    values
                        (:task_node_id, :checklist_key, :checklist_name, :is_required,
                         'pending', cast(:evidence_data as jsonb), :work_item_id, :is_payable,
                         :pay_group_key, :pay_scope, :pay_key, '{}'::jsonb)
                    returning id
                """),
                {
                    "task_node_id": task_node_id,
                    "checklist_key": item["key"],
                    "checklist_name": item["name"],
                    "is_required": item.get("required") is not False,
                    "evidence_data": json.dumps({
                        "required": bool(item.get("evidence_required")),
                        "description": item.get("evidence_description") or "",
                        "drive_folder_url": item.get("drive_folder_url"),
                        "files": [],
                    }, ensure_ascii=False),
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

        for assignment in assignments:
            db.execute(
                text("""
                    insert into public.task_node_assignments
                        (task_node_id, employee_id, role_code, is_primary,
                         assignment_status, planned_start, planned_end, assigned_by, notes)
                    values
                        (:task_node_id, :employee_id, :role_code, :is_primary,
                         'assigned', :planned_start, :planned_end, :actor_id, :notes)
                """),
                {
                    "task_node_id": task_node_id,
                    "employee_id": assignment["employee_id"],
                    "role_code": assignment["role_code"],
                    "is_primary": assignment.get("is_primary", False),
                    "planned_start": _parse_datetime(assignment.get("planned_start"), "Thời gian bắt đầu"),
                    "planned_end": _parse_datetime(assignment.get("planned_end"), "Thời gian kết thúc"),
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

    return {
        "instance_id": instance["id"],
        "revision_id": revision["id"],
        "revision_no": revision["revision_no"],
        "status": "running",
        "node_count": len(created_node_ids),
        "checklist_count": checklist_count,
        "assignment_count": assignment_count,
        "compensation_assignment_count": compensation_assignment_count,
        "projected_compensation_amount": projected_compensation_amount,
    }


def replace_node_assignments(
    db: Session,
    *,
    task_node_id: str,
    assignments: list[dict[str, Any]],
    replacement_reason: str | None,
    actor_id: str,
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
    if node["date_signed"]:
        for assignment in normalized:
            for field_name, value in (
                ("Ngày bắt đầu", assignment["planned_start"]),
                ("Ngày kết thúc", assignment["planned_end"]),
            ):
                if value and value.date() < node["date_signed"]:
                    raise WorkflowValidationError(
                        f"{field_name} không được trước ngày ký hợp đồng {node['date_signed'].isoformat()}"
                    )
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
            where task_node_id = :task_node_id and is_payable
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
                     assignment_status, planned_start, planned_end, assigned_by, notes)
                values
                    (:task_node_id, :employee_id, :role_code, :is_primary,
                     'assigned', :planned_start, :planned_end, :actor_id, :notes)
                returning id
            """),
            {**assignment, "task_node_id": task_node_id, "actor_id": actor_id},
        ).scalar_one())

    compensation_assignment_count = 0
    projected_compensation_amount = 0.0
    if payable_checklists:
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

    starts = [item["planned_start"] for item in normalized if item["planned_start"]]
    ends = [item["planned_end"] for item in normalized if item["planned_end"]]
    db.execute(
        text("""
            update public.task_nodes
            set planned_start = :planned_start, planned_end = :planned_end, updated_at = now()
            where id = :task_node_id
        """),
        {
            "task_node_id": task_node_id,
            "planned_start": min(starts) if starts else None,
            "planned_end": max(ends) if ends else None,
        },
    )
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
