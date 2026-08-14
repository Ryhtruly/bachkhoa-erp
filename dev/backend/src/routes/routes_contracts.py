import json
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Depends, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.core.auth import check_user_permission, require_authenticated_user, require_permission, User
from src.db.models import Contract, ContractGeneratedDocument, Customer, Role, ServiceLine, ServicePackage, TaskType, UserRole
from src.core import doc_generator
from src.contracts.services import build_current_contract_document_data
from src.contracts import (
    ContractService,
    ContractCreateSchema,
    ContractGenerateSchema,
    get_contract_cache_status,
    get_contract_read_model,
    query_contract_read_model
)
from src.contracts.workflow_runtime import (
    WorkflowValidationError,
    activate_workflow,
    cancel_workflow,
    replace_node_assignments,
    review_task_node_acceptance,
    save_workflow_draft,
)
from src.contracts.timeline import project_node_timeline
from src.services.timeline_realtime import publish_timeline_change, timeline_event_stream

from src.finance.services import APPROVED_TX_STATUSES, INCOME_TX_TYPES

# Hằng số cho truy vấn tiền — dùng chung một định nghĩa với tầng tài chính,
# tránh mỗi nơi liệt kê một kiểu rồi lệch nhau.
_APPROVED_SQL = "'" + "','".join(sorted(APPROVED_TX_STATUSES)) + "'"
_INCOME_SQL = "'" + "','".join(sorted(INCOME_TX_TYPES)) + "'"

router = APIRouter(tags=["03. Contracts & Workflows"])

DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def render_current_contract_document(db: Session, contract_id: str) -> Response:
    """Render a DOCX from the current persisted contract data without storing a file."""
    document_data, filename = build_current_contract_document_data(db, contract_id)
    try:
        document_bytes = doc_generator.render_contract_document(document_data, "mau_hop_dong_v1")
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=500, detail="Không thể tạo lại tài liệu hợp đồng.") from exc

    return Response(
        content=document_bytes,
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(filename)}"},
    )


class WorkflowRevisionPayload(BaseModel):
    graph: dict
    source_workflow_version_id: str | None = None
    change_reason: str | None = Field(default=None, max_length=1000)


class WorkflowAssignmentPayload(BaseModel):
    employee_id: str = Field(min_length=1, max_length=50)
    role_code: str = Field(default="MAIN", min_length=1, max_length=50)
    is_primary: bool = False
    notes: str | None = Field(default=None, max_length=1000)


class NodeAssignmentsPayload(BaseModel):
    assignments: list[WorkflowAssignmentPayload] = Field(default_factory=list)
    replacement_reason: str | None = Field(default=None, max_length=1000)


class WorkflowLayoutPayload(BaseModel):
    ui: dict


class ChecklistReviewPayload(BaseModel):
    decision: str
    note: str | None = None


class NodeAcceptanceReviewPayload(BaseModel):
    decision: str
    outcome: str | None = None
    note: str | None = None


class WorkflowCancellationPayload(BaseModel):
    cancellation_code: str = Field(min_length=1, max_length=50)
    reason: str = Field(min_length=5, max_length=1000)
    agency_handling_confirmed: bool = False
    agency_handling_note: str | None = Field(default=None, max_length=1000)


def _date_value(value):
    return value.isoformat() if value and hasattr(value, "isoformat") else value


def _money_value(value):
    return float(value or 0)


def _graph_has_payable_work(graph: dict) -> bool:
    nodes = graph.get("nodes") if isinstance(graph, dict) else None
    if not isinstance(nodes, dict):
        return False
    return any(
        bool((item.get("compensation") or {}).get("is_payable") or item.get("is_payable"))
        for node in nodes.values() if isinstance(node, dict)
        for item in (node.get("checklist") or []) if isinstance(item, dict)
    )


def _can_amend_workflow(db: Session, user: User) -> bool:
    # Quyền nghiệp vụ phải đi qua RBAC để Giám đốc có thể ủy quyền có kiểm soát,
    # không suy luận từ tên role hiển thị.
    return check_user_permission(db, user, "workflow", "approve")


def _require_director(
    user: User = Depends(require_authenticated_user),
    db: Session = Depends(get_db),
) -> User:
    """Timeline tổng chứa dữ liệu toàn công ty nên chỉ Giám đốc/Admin được đọc."""
    is_director = (user.username or "").lower() == "admin" or db.query(Role.id).join(
        UserRole, UserRole.role_id == Role.id
    ).filter(
        UserRole.user_id == user.id,
        Role.role_name == "admin",
    ).first() is not None
    if not is_director:
        raise HTTPException(status_code=403, detail="Chỉ Giám đốc được xem Quản Lý Timeline")
    return user


def _timeline_node_type(node_code: str | None, definition: dict) -> str:
    """Node thuộc phân hệ nào — nhận diện bằng CỜ, không bằng mã.

    Trước đây hàm này liệt kê cứng {"K04","K05",...}. Công ty đổi tên bước hoặc
    thêm bước là sai ngay, và nó cũng là nguồn sự thật thứ hai bên cạnh chính
    các cờ trên node. Node bàn giao (cờ is_handover) dùng chung cho cả hai phân
    hệ nên không thuộc riêng bên nào.
    """
    if definition.get("is_handover"):
        return "shared"
    if definition.get("requires_gov_submission"):
        return "legal"
    if definition.get("creates_survey_record"):
        return "survey"
    return "shared"


def _timeline_node_duration(definition: dict) -> tuple[int, int]:
    """Read the relative SLA configured on a workflow Node."""
    if not isinstance(definition, dict):
        return 0, 0
    try:
        days = max(0, int(definition.get("duration_days") or 0))
    except (TypeError, ValueError):
        days = 0
    try:
        hours = max(0, int(definition.get("duration_hours") or 0))
    except (TypeError, ValueError):
        hours = 0
    return days, hours


def _planned_node_range(definition: dict) -> tuple[str | None, str | None]:
    assignments = definition.get("assignments") if isinstance(definition, dict) else None
    if not isinstance(assignments, list):
        return None, None
    starts = [item.get("planned_start") for item in assignments if isinstance(item, dict) and item.get("planned_start")]
    ends = [item.get("planned_end") for item in assignments if isinstance(item, dict) and item.get("planned_end")]
    return (min(starts) if starts else None, max(ends) if ends else None)


def _workflow_node_order(graph: dict) -> dict[str, int]:
    """Stable workflow order following transitions, independent from node dates."""
    graph_nodes = graph.get("nodes", {}) if isinstance(graph, dict) else {}
    if not isinstance(graph_nodes, dict):
        return {}
    queue = [graph.get("start_node")]
    ordered_keys: list[str] = []
    visited: set[str] = set()
    while queue:
        node_key = queue.pop(0)
        if not node_key or node_key in visited or node_key not in graph_nodes:
            continue
        visited.add(node_key)
        ordered_keys.append(node_key)
        definition = graph_nodes.get(node_key, {})
        transitions = definition.get("transitions", {}) if isinstance(definition, dict) else {}
        if isinstance(transitions, dict):
            queue.extend(target for target in transitions.values() if isinstance(target, str))
    remaining = [key for key in graph_nodes if key not in visited]
    remaining.sort(key=lambda key: (
        str(graph_nodes.get(key, {}).get("task_code", "999")),
        key,
    ))
    return {key: index for index, key in enumerate([*ordered_keys, *remaining])}


def _normalize_workflow_ui(raw_ui: dict) -> dict:
    if not isinstance(raw_ui, dict):
        raise HTTPException(status_code=422, detail="Bố cục workflow không hợp lệ")
    normalized: dict = {"edges": {}}
    for key, value in raw_ui.items():
        if key == "edges":
            if isinstance(value, dict):
                normalized["edges"] = value
            continue
        if not isinstance(value, dict):
            continue
        x, y = value.get("x"), value.get("y")
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            continue
        if abs(x) > 100000 or abs(y) > 100000:
            raise HTTPException(status_code=422, detail="Tọa độ Node vượt phạm vi cho phép")
        normalized[str(key)] = {"x": round(x), "y": round(y)}
    return normalized


@router.get("/cache/status")
def contract_cache_status(
    user: User = Depends(require_permission("contract", "read"))
):
    return get_contract_cache_status()


@router.get("/")
def list_contracts(
    response: Response,
    month: str = Query(None),
    year: str = Query(None),
    date_signed: str = Query(None),
    search: str = Query(None),
    status: str = Query(None),
    service: str = Query(None),
    sort: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(0, ge=0, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    try:
        rows, source = get_contract_read_model(db)
        response.headers["X-Contract-Read-Source"] = source
        result = query_contract_read_model(
            rows,
            month=month,
            year=year,
            date_signed=date_signed,
            search=search,
            status=status,
            service=service,
            sort=sort,
            page=page,
            page_size=page_size,
        )
        return result if page_size > 0 else result["data"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/workspace-list")
def list_contract_workspace(
    search: str = Query(None),
    service: str = Query(None),
    date_signed: str = Query(None),
    sort: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    """Danh sách vận hành mới: chỉ dùng contracts và service_lines."""
    id_query = (
        db.query(Contract.id, Contract.date_signed)
        .join(ServiceLine, ServiceLine.contract_id == Contract.id)
        .outerjoin(Customer, Customer.id == Contract.customer_id)
    )
    if search and search.strip():
        keyword = f"%{search.strip()}%"
        id_query = id_query.filter(or_(
            Contract.id.ilike(keyword),
            Customer.full_name.ilike(keyword),
            Customer.phone.ilike(keyword),
            Contract.service_location.ilike(keyword),
            ServiceLine.service_type.ilike(keyword),
            ServiceLine.service_package.ilike(keyword),
        ))
    if service and service != "All":
        id_query = id_query.filter(or_(
            ServiceLine.service_type == service,
            ServiceLine.service_package == service,
        ))
    if date_signed:
        id_query = id_query.filter(func.to_char(Contract.date_signed, "YYYY-MM-DD") == date_signed)

    distinct_ids = id_query.distinct()
    total_contracts = distinct_ids.count()
    order_column = Contract.date_signed.asc() if sort == "asc" else Contract.date_signed.desc()
    contract_ids = [row[0] for row in (
        distinct_ids
        .order_by(order_column.nullslast(), Contract.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )]

    contract_rows = (
        db.query(Contract, Customer)
        .outerjoin(Customer, Customer.id == Contract.customer_id)
        .filter(Contract.id.in_(contract_ids))
        .all()
        if contract_ids else []
    )
    contract_by_id = {contract.id: (contract, customer) for contract, customer in contract_rows}
    line_rows = (
        db.query(ServiceLine, TaskType, ServicePackage)
        .outerjoin(TaskType, TaskType.id == ServiceLine.task_type_id)
        .outerjoin(ServicePackage, ServicePackage.id == ServiceLine.service_package_id)
        .filter(ServiceLine.contract_id.in_(contract_ids))
        .order_by(ServiceLine.id.asc())
        .all()
        if contract_ids else []
    )
    lines_by_contract = {}
    for line, task_type, package in line_rows:
        lines_by_contract.setdefault(line.contract_id, []).append({
            "id": line.id,
            "name": task_type.name if task_type else line.service_type,
            "package": package.name if package else line.service_package,
            "price": _money_value(line.price),
        })

    # Tiến độ và tiền: TÍNH SỐNG, không đọc cột status chết.
    # Cột contracts.status chưa bao giờ được cập nhật nên mọi hợp đồng đều hiện
    # "Chưa cập nhật" — vô nghĩa với người dùng. Suy ra từ quy trình và phiếu thu
    # đã duyệt thì không bao giờ lệch.
    tien_va_tien_do = {}
    if contract_ids:
        for r in db.execute(
            text(f"""
                select c.id,
                       coalesce((
                         select sum(t.amount) from public.cashflow_transactions t
                         where t.contract_id = c.id
                           and t.transaction_type in ({_INCOME_SQL})
                           and t.status in ({_APPROVED_SQL})
                       ), 0) as da_thu,
                       count(wi.id)                                       as so_quy_trinh,
                       count(*) filter (where wi.status = 'completed')     as so_xong,
                       count(*) filter (where wi.status = 'cancelled')     as so_huy
                from public.contracts c
                left join public.service_lines sl on sl.contract_id = c.id
                left join public.workflow_instances wi on wi.service_line_id = sl.id
                where c.id = any(:ids)
                group by c.id
            """),
            {"ids": list(contract_ids)},
        ).mappings():
            tien_va_tien_do[r["id"]] = dict(r)

    def _tien_do(info: dict, tong: float) -> str:
        if not info or not info["so_quy_trinh"]:
            return "Chưa có quy trình"
        if info["so_huy"] == info["so_quy_trinh"]:
            return "Đã huỷ"
        if info["so_xong"] == info["so_quy_trinh"]:
            # Nhãn phải vừa một dòng trong cột trạng thái; số nợ cụ thể đã nằm
            # ngay cột bên cạnh nên ở đây chỉ cần nói vì sao chưa chốt được.
            return "Hoàn thành" if float(info["da_thu"] or 0) >= tong - 0.01 else "Xong, còn nợ"
        return "Đang thực hiện"

    rows = []
    for contract_id in contract_ids:
        contract, customer = contract_by_id[contract_id]
        service_lines = lines_by_contract.get(contract_id, [])
        tong = _money_value(contract.total_value)
        info = tien_va_tien_do.get(contract_id)
        da_thu = float(info["da_thu"] or 0) if info else 0.0
        rows.append({
            "id": contract.id,
            "customer_name": customer.full_name if customer else "Chưa cập nhật",
            "customer_phone": customer.phone if customer else "",
            "date_signed": _date_value(contract.date_signed),
            "total_value": tong,
            "paid_amount": da_thu,
            "remaining_amount": max(0.0, tong - da_thu),
            "status": _tien_do(info, tong),
            "service_location": contract.service_location or "",
            "file_link": contract.file_link or "",
            "service_lines": service_lines,
            "service_line_count": len(service_lines),
            "service_line_total": sum(item["price"] for item in service_lines),
        })

    total_pages = (total_contracts + page_size - 1) // page_size
    return {
        "data": rows,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_groups": total_contracts,
            "total_contracts": total_contracts,
            "total_pages": total_pages,
        },
    }


@router.get("/timeline")
def get_contract_timeline(
    db: Session = Depends(get_db),
    user: User = Depends(_require_director),
):
    """Read-only Gantt read model: Hợp đồng -> Hạng mục -> Node."""
    contract_rows = db.execute(text("""
        select c.id as contract_id, c.status as contract_status, c.date_signed,
               customer.full_name as customer_name,
               sl.id as service_line_id,
               coalesce(tt.name, sl.service_type, 'Hạng mục chưa đặt tên') as service_line_name,
               coalesce(sp.name, sl.service_package, '') as service_package,
               wi.id as workflow_instance_id, wi.status as workflow_status,
               wi.active_revision_id,
               revision.revision_no as active_revision_no,
               revision.graph as active_graph,
               draft.id as draft_revision_id,
               draft.revision_no as draft_revision_no,
               draft.graph as draft_graph
        from public.contracts c
        left join public.customers customer on customer.id = c.customer_id
        left join public.service_lines sl on sl.contract_id = c.id
        left join public.task_types tt on tt.id = sl.task_type_id
        left join public.service_packages sp on sp.id = sl.service_package_id
        left join public.workflow_instances wi on wi.service_line_id = sl.id
        left join public.workflow_instance_revisions revision on revision.id = wi.active_revision_id
        left join lateral (
            select r.id, r.revision_no, r.graph
            from public.workflow_instance_revisions r
            where r.workflow_instance_id = wi.id and r.status = 'draft'
            order by r.revision_no desc
            limit 1
        ) draft on true
        order by c.date_signed desc nulls last, c.id, sl.id
    """)).mappings().all()

    node_rows = db.execute(text("""
        select n.id, n.workflow_instance_id, n.defined_by_revision_id,
               n.node_key, n.node_code, n.occurrence_no,
               coalesce(wn.name, n.node_code) as node_name,
               n.status, n.outcome, n.started_at, n.submitted_at, n.accepted_at,
               n.completed_at, n.deadline_at, n.is_overdue, n.blocked_reason,
               n.created_at
        from public.task_nodes n
        left join public.workflow_nodes wn on wn.code = n.node_code
        order by n.created_at, n.occurrence_no
    """)).mappings().all()

    assignment_rows = db.execute(text("""
        select a.task_node_id, a.employee_id, e.full_name, e.avatar_url,
               a.role_code, a.is_primary
        from public.task_node_assignments a
        join public.employees e on e.id = a.employee_id
        where a.assignment_status not in ('replaced', 'declined', 'cancelled')
          and coalesce(e.is_active, true)
        order by a.task_node_id, a.is_primary desc, a.created_at
    """)).mappings().all()

    event_rows = db.execute(text("""
        select task_node_id, event_type, to_status, created_at
        from public.task_node_events
        order by task_node_id, created_at
    """)).mappings().all()
    acceptance_rows = db.execute(text("""
        select task_node_id, attempt_no, created_at as submitted_at,
               status, reviewed_at, review_note
        from public.task_node_acceptances
        order by task_node_id, attempt_no, created_at
    """)).mappings().all()

    assignments_by_node: dict[str, list[dict]] = {}
    for assignment in assignment_rows:
        assignments_by_node.setdefault(assignment["task_node_id"], []).append({
            "employee_id": assignment["employee_id"],
            "full_name": assignment["full_name"],
            "avatar_url": assignment["avatar_url"],
            "role_code": assignment["role_code"],
            "is_primary": bool(assignment["is_primary"]),
        })

    events_by_node: dict[str, list] = {}
    for event in event_rows:
        events_by_node.setdefault(event["task_node_id"], []).append(event)
    acceptances_by_node: dict[str, list] = {}
    for acceptance in acceptance_rows:
        acceptances_by_node.setdefault(acceptance["task_node_id"], []).append(acceptance)

    raw_nodes_by_workflow: dict[str, list] = {}
    for node in node_rows:
        raw_nodes_by_workflow.setdefault(node["workflow_instance_id"], []).append(node)

    contracts: list[dict] = []
    contract_by_id: dict[str, dict] = {}
    now_value = datetime.now(timezone.utc).isoformat()
    for row in contract_rows:
        contract = contract_by_id.get(row["contract_id"])
        if contract is None:
            contract = {
                "id": row["contract_id"],
                "customer_name": row["customer_name"] or "Chưa cập nhật khách hàng",
                "status": row["contract_status"],
                "date_signed": _date_value(row["date_signed"]),
                "timeline_status": "unscheduled",
                "has_overdue": False,
                "service_lines": [],
            }
            contract_by_id[row["contract_id"]] = contract
            contracts.append(contract)
        if not row["service_line_id"]:
            continue

        graph = row["active_graph"] or {}
        if isinstance(graph, str):
            try:
                graph = json.loads(graph)
            except (TypeError, ValueError):
                graph = {}
        graph_nodes = graph.get("nodes", {}) if isinstance(graph, dict) else {}
        draft_graph = row["draft_graph"] or {}
        if isinstance(draft_graph, str):
            try:
                draft_graph = json.loads(draft_graph)
            except (TypeError, ValueError):
                draft_graph = {}
        draft_graph_nodes = draft_graph.get("nodes", {}) if isinstance(draft_graph, dict) else {}
        node_order = _workflow_node_order(graph)
        execution_nodes = []
        for node in raw_nodes_by_workflow.get(row["workflow_instance_id"], []):
            definition = graph_nodes.get(node["node_key"], {}) if isinstance(graph_nodes, dict) else {}
            definition = definition if isinstance(definition, dict) else {}
            draft_definition = (
                draft_graph_nodes.get(node["node_key"], {})
                if isinstance(draft_graph_nodes, dict) else {}
            )
            draft_definition = draft_definition if isinstance(draft_definition, dict) else {}
            duration_days, duration_hours = _timeline_node_duration(definition)
            draft_duration_days, draft_duration_hours = _timeline_node_duration(draft_definition)
            planned_start, planned_end = _planned_node_range(definition)
            started_at = _date_value(node["started_at"])
            completed_at = _date_value(node["completed_at"] or node["accepted_at"])
            if started_at:
                display_start = started_at
                display_end = completed_at or _date_value(node["deadline_at"]) or now_value
            else:
                display_start = planned_start
                display_end = planned_end or _date_value(node["deadline_at"])
            execution_nodes.append({
                "id": node["id"],
                "node_key": node["node_key"],
                "node_code": node["node_code"],
                "name": node["node_name"],
                "defined_by_revision_id": node["defined_by_revision_id"],
                "runtime_revision_current": (
                    node["defined_by_revision_id"] == row["active_revision_id"]
                ),
                "sequence_index": node_order.get(node["node_key"], len(node_order)),
                "occurrence_no": node["occurrence_no"],
                "status": node["status"],
                "outcome": node["outcome"],
                "node_type": _timeline_node_type(node["node_code"], definition),
                "started_at": started_at,
                "completed_at": completed_at,
                "deadline_at": _date_value(node["deadline_at"]),
                "duration_days": duration_days,
                "duration_hours": duration_hours,
                "draft_duration_days": draft_duration_days,
                "draft_duration_hours": draft_duration_hours,
                "display_start": display_start,
                "display_end": display_end,
                "is_overdue": bool(node["is_overdue"]),
                "blocked_reason": node["blocked_reason"],
                "assignees": assignments_by_node.get(node["id"], []),
                **project_node_timeline(
                    node,
                    events=events_by_node.get(node["id"], []),
                    acceptances=acceptances_by_node.get(node["id"], []),
                ),
            })
        execution_nodes.sort(key=lambda item: (item["sequence_index"], item["occurrence_no"] or 1))
        contract["service_lines"].append({
            "id": row["service_line_id"],
            "name": row["service_line_name"],
            "package": row["service_package"],
            "workflow_instance_id": row["workflow_instance_id"],
            "workflow_status": row["workflow_status"],
            "active_revision_id": row["active_revision_id"],
            "active_revision_no": row["active_revision_no"],
            "draft_revision_id": row["draft_revision_id"],
            "draft_revision_no": row["draft_revision_no"],
            "has_draft": bool(row["draft_revision_id"]),
            "nodes": execution_nodes,
        })

    for contract in contracts:
        workflows = [line["workflow_status"] for line in contract["service_lines"] if line["workflow_status"]]
        nodes = [node for line in contract["service_lines"] for node in line["nodes"]]
        contract["has_overdue"] = any(node["is_overdue"] for node in nodes)
        if contract["has_overdue"]:
            contract["timeline_status"] = "overdue"
        elif workflows and all(status == "completed" for status in workflows):
            contract["timeline_status"] = "completed"
        elif any(status in {"not_started", "running", "paused"} for status in workflows):
            contract["timeline_status"] = "running"
        elif workflows and all(status == "cancelled" for status in workflows):
            contract["timeline_status"] = "cancelled"

    return {"generated_at": now_value, "data": contracts}


@router.get("/timeline/events")
def stream_contract_timeline_events(
    user: User = Depends(_require_director),
):
    """Authenticated realtime invalidation stream for the director Timeline."""
    return StreamingResponse(
        timeline_event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/workspace")
def get_contract_workspace(
    contract_id: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "read")),
):
    """Read model for the contract tabs and per-service-line workflow editor."""
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Không tìm thấy hợp đồng")

    customer = (
        db.query(Customer).filter(Customer.id == contract.customer_id).first()
        if contract.customer_id else None
    )
    can_edit_workflow = check_user_permission(db, user, "workflow", "update")
    can_approve_workflow = check_user_permission(db, user, "workflow", "approve")
    can_assign_workflow = check_user_permission(db, user, "task_node", "approve")
    can_review_checklist = check_user_permission(db, user, "checklist", "approve")
    can_review_node = check_user_permission(db, user, "task_node", "approve")
    can_view_compensation = check_user_permission(db, user, "finance", "read")
    can_manage_compensation = check_user_permission(db, user, "finance", "approve")
    can_amend_workflow = can_edit_workflow and can_approve_workflow
    service_rows = (
        db.query(ServiceLine, TaskType, ServicePackage)
        .outerjoin(TaskType, TaskType.id == ServiceLine.task_type_id)
        .outerjoin(ServicePackage, ServicePackage.id == ServiceLine.service_package_id)
        .filter(ServiceLine.contract_id == contract.id)
        .order_by(ServiceLine.id.asc())
        .all()
    )

    service_lines = []
    for service_line, task_type, service_package in service_rows:
        workflow_row = db.execute(
            text(
                """
                select
                  wi.id as workflow_instance_id,
                  wi.status as workflow_status,
                  wi.active_revision_id,
                  wi.cancellation_code,
                  wi.cancellation_reason,
                  wi.cancellation_data,
                  wi.cancelled_at,
                  wi.cancelled_by,
                  cancelled_user.username as cancelled_by_username,
                  revision.id as revision_id,
                  revision.revision_no,
                  revision.status as revision_status,
                  revision.graph,
                  revision.change_reason,
                  revision.created_at as revision_created_at,
                  active_revision.graph as active_graph,
                  template.id as template_id,
                  template.code as template_code,
                  template.name as template_name,
                  template.version as template_version
                from public.workflow_instances wi
                left join lateral (
                  select r.*
                  from public.workflow_instance_revisions r
                  where r.workflow_instance_id = wi.id
                  order by
                    case r.status when 'draft' then 0 when 'active' then 1 else 2 end,
                    r.revision_no desc
                  limit 1
                ) revision on true
                left join public.workflow_instance_revisions active_revision
                  on active_revision.id = wi.active_revision_id
                left join public.workflow_templates template
                  on template.id = coalesce(
                    revision.source_workflow_version_id,
                    wi.source_workflow_version_id
                  )
                left join public.users cancelled_user on cancelled_user.id = wi.cancelled_by
                where wi.service_line_id = :service_line_id
                limit 1
                """
            ),
            {"service_line_id": service_line.id},
        ).mappings().first()

        execution_nodes = []
        if workflow_row and workflow_row["workflow_instance_id"]:
            execution_nodes = [dict(row) for row in db.execute(
                text(
                    """
                    select n.id, n.node_key, n.node_code, n.occurrence_no, n.status, n.outcome,
                           n.started_at, n.deadline_at, n.is_overdue, n.submitted_at,
                           n.accepted_at, n.completed_at, n.blocked_reason,
                           (
                             select a.id from public.task_node_acceptances a
                             where a.task_node_id = n.id and a.status = 'pending'
                             order by a.attempt_no desc limit 1
                           ) as pending_acceptance_id
                    from public.task_nodes n
                    where n.workflow_instance_id = :workflow_instance_id
                    order by n.created_at asc, n.occurrence_no asc
                    """
                ),
                {"workflow_instance_id": workflow_row["workflow_instance_id"]},
            ).mappings().all()]
            node_by_id = {node["id"]: node for node in execution_nodes}
            for node in execution_nodes:
                node["assignments"] = []
                node["checklist_results"] = []

            assignment_rows = db.execute(
                text(
                    """
                    select a.id, a.task_node_id, a.employee_id, e.full_name, e.avatar_url,
                           coalesce(d.name, e.department) as department_name,
                           e.job_title, a.role_code, a.is_primary,
                           a.assignment_status, a.notes
                    from public.task_node_assignments a
                    join public.task_nodes n on n.id = a.task_node_id
                    join public.employees e on e.id = a.employee_id
                    left join public.departments d on d.id = e.department_id
                    where n.workflow_instance_id = :workflow_instance_id
                      and a.assignment_status not in ('replaced', 'declined')
                    order by a.is_primary desc, a.created_at asc
                    """
                ),
                {"workflow_instance_id": workflow_row["workflow_instance_id"]},
            ).mappings().all()
            for assignment in assignment_rows:
                target = node_by_id.get(assignment["task_node_id"])
                if target is not None:
                    target["assignments"].append(dict(assignment))

            checklist_rows = db.execute(
                text(
                    """
                    select r.id, r.task_node_id, r.checklist_key, r.checklist_name,
                           r.is_required, r.status, r.require_evidence, r.approver_role,
                           r.is_overdue, r.late_reason, r.submitted_at,
                           r.evidence_data, r.note,
                           r.is_payable, r.work_item_id, wi.code as work_item_code,
                           wi.name as work_item_name, r.pay_group_key, r.pay_scope, r.pay_key
                    from public.task_node_checklist_results r
                    join public.task_nodes n on n.id = r.task_node_id
                    left join public.work_items wi on wi.id = r.work_item_id
                    where n.workflow_instance_id = :workflow_instance_id
                    order by r.created_at asc
                    """
                ),
                {"workflow_instance_id": workflow_row["workflow_instance_id"]},
            ).mappings().all()
            checklist_by_id = {}
            for checklist in checklist_rows:
                checklist = dict(checklist)
                checklist["compensation_assignments"] = []
                checklist_by_id[checklist["id"]] = checklist
                target = node_by_id.get(checklist["task_node_id"])
                if target is not None:
                    target["checklist_results"].append(checklist)

            if can_view_compensation and checklist_by_id:
                compensation_rows = db.execute(
                    text(
                        """
                        select ca.id, ca.checklist_result_id, ca.employee_id, e.full_name,
                               ca.role_code, ca.pay_slot, ca.share_percent,
                               ca.work_item_rate_id, wr.amount as rate_amount,
                               round(coalesce(ca.amount_override, wr.amount * ca.share_percent / 100.0), 2)
                                 as projected_amount,
                               ca.status, ca.approved_at
                        from public.task_node_checklist_assignments ca
                        join public.task_node_checklist_results cr
                          on cr.id = ca.checklist_result_id
                        join public.task_nodes n on n.id = cr.task_node_id
                        join public.employees e on e.id = ca.employee_id
                        left join public.work_item_rates wr on wr.id = ca.work_item_rate_id
                        where n.workflow_instance_id = :workflow_instance_id
                          and ca.status not in ('replaced', 'cancelled')
                        order by cr.created_at, ca.role_code, ca.pay_slot
                        """
                    ),
                    {"workflow_instance_id": workflow_row["workflow_instance_id"]},
                ).mappings().all()
                for compensation_assignment in compensation_rows:
                    target = checklist_by_id.get(compensation_assignment["checklist_result_id"])
                    if target is not None:
                        item = dict(compensation_assignment)
                        item["rate_amount"] = _money_value(item["rate_amount"])
                        item["projected_amount"] = _money_value(item["projected_amount"])
                        target["compensation_assignments"].append(item)

        workflow = None
        if workflow_row:
            agency_nodes = [
                node for node in execution_nodes
                if node["node_code"] in {"K06", "K07", "K08"}
                and (
                    node["status"] in {"in_progress", "submitted", "accepted"}
                    or node["started_at"] is not None
                    or node["submitted_at"] is not None
                    or node["accepted_at"] is not None
                )
            ]
            entitlement_summary = {"entitlement_count": 0, "entitlement_amount": 0}
            if can_view_compensation and workflow_row["workflow_instance_id"]:
                entitlement_summary = dict(db.execute(
                    text("""
                        select count(*)::integer as entitlement_count,
                               coalesce(sum(amount), 0) as entitlement_amount
                        from public.work_pay_entitlements
                        where workflow_instance_id = :workflow_instance_id
                          and status <> 'void'
                    """),
                    {"workflow_instance_id": workflow_row["workflow_instance_id"]},
                ).mappings().one())
            workflow = {
                "instance_id": workflow_row["workflow_instance_id"],
                "status": workflow_row["workflow_status"],
                "active_revision_id": workflow_row["active_revision_id"],
                "revision_id": workflow_row["revision_id"],
                "revision_no": workflow_row["revision_no"],
                "revision_status": workflow_row["revision_status"],
                "change_reason": workflow_row["change_reason"],
                "revision_created_at": _date_value(workflow_row["revision_created_at"]),
                # Khi đang sửa draft, frontend vẫn cần bản active để cảnh báo chính xác
                # nếu thay đổi chạm vào Node mà nhân viên đang thực hiện.
                "active_graph": workflow_row["active_graph"] or None,
                "cancellation": {
                    "code": workflow_row["cancellation_code"],
                    "reason": workflow_row["cancellation_reason"],
                    "data": workflow_row["cancellation_data"] or {},
                    "cancelled_at": _date_value(workflow_row["cancelled_at"]),
                    "cancelled_by": workflow_row["cancelled_by"],
                    "cancelled_by_username": workflow_row["cancelled_by_username"],
                } if workflow_row["workflow_status"] == "cancelled" else None,
                "cancellation_preview": {
                    "open_node_count": sum(
                        node["status"] in {
                            "pending", "ready", "in_progress", "submitted",
                            "rework_required", "blocked",
                        }
                        for node in execution_nodes
                    ),
                    "preserved_node_count": sum(
                        node["status"] in {"accepted", "skipped"}
                        for node in execution_nodes
                    ),
                    "agency_node_count": len(agency_nodes),
                    "requires_agency_handling": bool(agency_nodes),
                    "entitlement_count": int(entitlement_summary["entitlement_count"] or 0),
                    "entitlement_amount": _money_value(entitlement_summary["entitlement_amount"]),
                },
                "graph": workflow_row["graph"],
                "template": {
                    "id": workflow_row["template_id"],
                    "code": workflow_row["template_code"],
                    "name": workflow_row["template_name"],
                    "version": workflow_row["template_version"],
                } if workflow_row["template_id"] else None,
                "execution_nodes": execution_nodes,
            }

        service_lines.append({
            "id": service_line.id,
            "contract_id": service_line.contract_id,
            "service_package_id": service_line.service_package_id,
            "service_package": (
                service_package.name if service_package else service_line.service_package
            ),
            "task_type_id": service_line.task_type_id,
            "task_type": task_type.name if task_type else service_line.service_type,
            "service_type": service_line.service_type,
            "target_property": service_line.target_property,
            "price": _money_value(service_line.price),
            "workflow": workflow,
        })

    workflow_catalog = [dict(row) for row in db.execute(
        text(
            """
            select code, name, description
            from public.workflow_nodes
            where coalesce(is_active, true)
            order by code
            """
        )
    ).mappings().all()]

    workflow_templates = [dict(row) for row in db.execute(
        text(
            """
            select id, code, version, name, description, graph
            from public.workflow_templates
            where status = 'published'
            order by name, version desc
            """
        )
    ).mappings().all()]

    assignment_options = [dict(row) for row in db.execute(
        text(
            """
            select e.id, e.full_name, coalesce(d.name, e.department) as department_name,
                   e.job_title
            from public.employees e
            left join public.departments d on d.id = e.department_id
            where coalesce(e.is_active, true)
            order by coalesce(d.display_order, 999), e.full_name, e.id
            """
        )
    ).mappings().all()]

    work_item_catalog = []
    if can_view_compensation:
        work_item_rows = db.execute(
            text(
                """
                select wi.id, wi.code, wi.name, wi.output_definition,
                       wr.id as rate_id, wr.role_code, wr.amount
                from public.work_items wi
                join public.work_item_rates wr on wr.work_item_id = wi.id
                where wi.is_active
                  and wr.status = 'published'
                  and current_date <@ wr.effective_period
                order by wi.name, wr.role_code
                """
            )
        ).mappings().all()
        work_item_by_id = {}
        for row in work_item_rows:
            item = work_item_by_id.setdefault(row["id"], {
                "id": row["id"],
                "code": row["code"],
                "name": row["name"],
                "output_definition": row["output_definition"],
                "rates": [],
            })
            item["rates"].append({
                "id": row["rate_id"],
                "role_code": row["role_code"],
                "amount": _money_value(row["amount"]),
            })
        work_item_catalog = list(work_item_by_id.values())

    return {
        "contract": {
            "id": contract.id,
            "customer_id": contract.customer_id,
            "customer_name": customer.full_name if customer else "",
            "customer_phone": customer.phone if customer else "",
            "status": contract.status,
            "service_type": contract.service_type,
            "service_package": contract.service_package,
            "service_location": contract.service_location,
            "service_area": _money_value(contract.service_area),
            "total_value": _money_value(contract.total_value),
            "date_signed": _date_value(contract.date_signed),
            "file_link": contract.file_link,
            "document_type": contract.document_type,
            "has_technical": contract.has_technical,
            "addons": contract.addons or {},
        },
        "service_lines": service_lines,
        "workflow_catalog": workflow_catalog,
        "workflow_templates": workflow_templates,
        "assignment_options": assignment_options,
        "work_item_catalog": work_item_catalog,
        "capabilities": {
            "read_workspace": True,
            "edit_workflow": can_edit_workflow,
            "activate_workflow": can_approve_workflow,
            "assign_workflow": can_assign_workflow,
            "amend_workflow": can_amend_workflow,
            "cancel_workflow": can_approve_workflow,
            "review_workflow_checklist": can_review_checklist,
            "review_workflow_node": can_review_node,
            "view_workflow_compensation": can_view_compensation,
            "manage_workflow_compensation": can_manage_compensation,
            "contract_documents": False,
        },
    }


@router.put("/workflow/{service_line_id}/draft")
def save_service_line_workflow_draft(
    service_line_id: str,
    payload: WorkflowRevisionPayload,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("workflow", "update")),
):
    """Create or update the single editable revision for a contract service line."""
    has_active_revision = bool(db.execute(
        text("""
            select 1 from public.workflow_instances
            where service_line_id = :service_line_id and active_revision_id is not null
            limit 1
        """),
        {"service_line_id": service_line_id},
    ).first())
    if has_active_revision and not _can_amend_workflow(db, user):
        raise HTTPException(status_code=403, detail="Chỉ Giám đốc được sửa workflow đang vận hành")
    if _graph_has_payable_work(payload.graph) and not check_user_permission(db, user, "finance", "approve"):
        raise HTTPException(status_code=403, detail="Chỉ Giám đốc/Kế toán được cấu hình đơn giá khoán")
    try:
        result = save_workflow_draft(
            db,
            service_line_id=service_line_id,
            graph=payload.graph,
            source_workflow_version_id=payload.source_workflow_version_id,
            change_reason=payload.change_reason,
            actor_id=user.id,
        )
        db.commit()
        publish_timeline_change("workflow_draft_saved", entity_id=service_line_id)
        return {
            "message": "Đã lưu bản nháp workflow",
            "instance_id": result["workflow_instance_id"],
            "revision_id": result["id"],
            "revision_no": result["revision_no"],
            "status": result["status"],
        }
    except WorkflowValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.post("/workflow/{service_line_id}/activate")
def activate_service_line_workflow(
    service_line_id: str,
    payload: WorkflowRevisionPayload,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("workflow", "approve")),
):
    """Atomically lock a revision and materialize its runtime execution rows."""
    has_active_revision = bool(db.execute(
        text("""
            select 1 from public.workflow_instances
            where service_line_id = :service_line_id and active_revision_id is not null
            limit 1
        """),
        {"service_line_id": service_line_id},
    ).first())
    if has_active_revision and not _can_amend_workflow(db, user):
        raise HTTPException(status_code=403, detail="Chỉ Giám đốc được áp dụng bản sửa đổi workflow")
    if _graph_has_payable_work(payload.graph) and not check_user_permission(db, user, "finance", "approve"):
        raise HTTPException(status_code=403, detail="Chỉ Giám đốc/Kế toán được duyệt khoán khi kích hoạt")
    try:
        result = activate_workflow(
            db,
            service_line_id=service_line_id,
            graph=payload.graph,
            source_workflow_version_id=payload.source_workflow_version_id,
            change_reason=payload.change_reason,
            actor_id=user.id,
        )
        db.commit()
        publish_timeline_change("workflow_revision_activated", entity_id=service_line_id)
        return {"message": "Đã kích hoạt workflow", **result}
    except WorkflowValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.put("/workflow/{service_line_id}/layout")
def save_active_workflow_layout(
    service_line_id: str,
    payload: WorkflowLayoutPayload,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("workflow", "update")),
):
    """Persist visual coordinates without changing workflow business logic."""
    if not _can_amend_workflow(db, user):
        raise HTTPException(status_code=403, detail="Chỉ Giám đốc được lưu bố cục workflow")
    ui = _normalize_workflow_ui(payload.ui)
    row = db.execute(
        text("""
            update public.workflow_instance_revisions r
            set graph = jsonb_set(r.graph, '{ui}', cast(:ui as jsonb), true)
            from public.workflow_instances wi
            where wi.service_line_id = :service_line_id
              and wi.active_revision_id = r.id
              and wi.status in ('running', 'paused')
              and r.status = 'active'
            returning r.id, r.revision_no
        """),
        {"service_line_id": service_line_id, "ui": json.dumps(ui, ensure_ascii=False)},
    ).mappings().first()
    if not row:
        db.rollback()
        raise HTTPException(status_code=404, detail="Workflow chưa được kích hoạt")
    db.commit()
    return {"message": "Đã lưu bố cục workflow", **dict(row)}


@router.post("/workflow/{service_line_id}/cancel")
def cancel_service_line_workflow(
    service_line_id: str,
    payload: WorkflowCancellationPayload,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("workflow", "approve")),
):
    """Terminally cancel a workflow while preserving audit, evidence and earned pay."""
    if not _can_amend_workflow(db, user):
        raise HTTPException(status_code=403, detail="Chỉ Giám đốc được hủy workflow")
    try:
        result = cancel_workflow(
            db,
            service_line_id=service_line_id,
            cancellation_code=payload.cancellation_code,
            reason=payload.reason,
            agency_handling_confirmed=payload.agency_handling_confirmed,
            agency_handling_note=payload.agency_handling_note,
            actor_id=user.id,
        )
        db.commit()
        publish_timeline_change("workflow_cancelled", entity_id=service_line_id)
        return {"message": "Đã hủy workflow", **result}
    except WorkflowValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.put("/workflow/nodes/{task_node_id}/assignments")
def update_task_node_assignments(
    task_node_id: str,
    payload: NodeAssignmentsPayload,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("task_node", "approve")),
):
    """Reassign an already activated node while preserving assignment history."""
    has_payable_work = bool(db.execute(
        text("""
            select 1 from public.task_node_checklist_results
            where task_node_id = :task_node_id and is_payable
            limit 1
        """),
        {"task_node_id": task_node_id},
    ).first())
    if has_payable_work and not check_user_permission(db, user, "finance", "approve"):
        raise HTTPException(
            status_code=403,
            detail="Node có khoán: chỉ Giám đốc/Kế toán được đổi người nhận khoán",
        )
    try:
        result = replace_node_assignments(
            db,
            task_node_id=task_node_id,
            assignments=[item.model_dump() for item in payload.assignments],
            replacement_reason=payload.replacement_reason,
            actor_id=user.id,
        )
        db.commit()
        publish_timeline_change("node_assignments_updated", entity_id=task_node_id)
        return {"message": "Đã cập nhật phân công", **result}
    except WorkflowValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.post("/workflow/checklist/{checklist_result_id}/review")
def review_checklist_evidence(
    checklist_result_id: str,
    payload: ChecklistReviewPayload,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("checklist", "approve")),
):
    """Giám đốc/quản lý duyệt Đạt/Không đạt minh chứng nhân viên vừa nộp."""
    if payload.decision not in ("approved", "failed"):
        raise HTTPException(status_code=422, detail="decision phải là 'approved' hoặc 'failed'.")

    checklist = db.execute(
        text(
            """
            select id, status, is_payable, approver_role, is_overdue, late_reason
            from public.task_node_checklist_results
            where id = :id
            """
        ),
        {"id": checklist_result_id},
    ).mappings().first()
    if not checklist:
        raise HTTPException(status_code=404, detail="Không tìm thấy checklist.")
    if checklist["status"] not in ("pending_approval", "late_pending_approval"):
        raise HTTPException(status_code=409, detail="Checklist chưa được nộp minh chứng để duyệt.")
    if user.username != "admin":
        has_approver_role = db.query(UserRole.id).join(Role, Role.id == UserRole.role_id).filter(
            UserRole.user_id == user.id,
            Role.role_name.ilike(checklist["approver_role"]),
        ).first()
        if not has_approver_role:
            raise HTTPException(
                status_code=403,
                detail=f"Checklist này yêu cầu vai trò duyệt '{checklist['approver_role']}'.",
            )
    if checklist["status"] == "late_pending_approval" and payload.decision == "failed":
        raise HTTPException(
            status_code=422,
            detail="Xử lý từ chối checklist nộp trễ thuộc quyết định nghiệp vụ riêng, chưa áp dụng ở phiên bản này.",
        )
    if checklist["is_payable"] and payload.decision == "approved" and not check_user_permission(db, user, "finance", "approve"):
        raise HTTPException(
            status_code=403,
            detail="Checklist có gắn khoán: chỉ Giám đốc/Kế toán được duyệt đạt.",
        )

    next_status = (
        "late_approved"
        if checklist["status"] == "late_pending_approval" and payload.decision == "approved"
        else payload.decision
    )
    db.execute(
        text(
            """
            update public.task_node_checklist_results
            set status = :decision, completed_by = :user_id, completed_at = now(),
                note = :note, updated_at = now()
            where id = :id
            """
        ),
        {"id": checklist_result_id, "decision": next_status, "user_id": user.id, "note": payload.note},
    )
    db.commit()
    publish_timeline_change("checklist_reviewed", entity_id=checklist_result_id)
    return {"id": checklist_result_id, "status": next_status}


@router.post("/workflow/acceptances/{acceptance_id}/review")
def review_node_acceptance(
    acceptance_id: str,
    payload: NodeAcceptanceReviewPayload,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("task_node", "approve")),
):
    """Giám đốc/quản lý duyệt Node đã nộp nghiệm thu: Đạt (mở node tiếp theo + phát sinh khoán) hoặc Cần làm lại."""
    try:
        result = review_task_node_acceptance(
            db,
            acceptance_id=acceptance_id,
            decision=payload.decision,
            outcome=payload.outcome,
            review_note=payload.note,
            actor_id=user.id,
        )
        db.commit()
        publish_timeline_change("node_acceptance_reviewed", entity_id=acceptance_id)
        return result
    except WorkflowValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/")
def create_contract(
    payload: ContractCreateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "create")),
):
    return ContractService.create_contract(db, payload, actor_id=user.id)


@router.get("/next-code")
def get_next_contract_code(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("contract", "create")),
):
    return {"contract_id": ContractService.get_next_contract_code(db)}


@router.post("/generate")
def generate_and_save_contract(
    payload: ContractGenerateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "create")),
):
    return ContractService.generate_and_save_contract(db, payload, actor_id=user.id)


@router.get("/{contract_id:path}/document")
def get_contract_document(
    contract_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("contract", "read")),
):
    return render_current_contract_document(db, contract_id)


class OverrideHandoverIn(BaseModel):
    reason: str = Field(min_length=1, max_length=1000, description="Lý do duyệt cho nợ và bàn giao")


class WriteOffDebtIn(BaseModel):
    reason: str = Field(min_length=1, max_length=1000, description="Lý do xóa nợ / miễn giảm")


class CarryForwardDebtIn(BaseModel):
    target_contract_id: str = Field(min_length=1, max_length=100, description="Mã hợp đồng nhận nợ")
    reason: str = Field(min_length=1, max_length=1000, description="Lý do chuyển nợ")


@router.post("/{contract_id:path}/override-handover")
def override_handover(
    contract_id: str,
    payload: OverrideHandoverIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "approve")),
):
    """Giám đốc duyệt cho nợ và cho phép xuất biên bản bàn giao tại Node K08."""
    return ContractService.override_handover(db, contract_id, payload.reason, actor_id=user.id)


@router.post("/{contract_id:path}/write-off-debt")
def write_off_debt(
    contract_id: str,
    payload: WriteOffDebtIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "approve")),
):
    """Giám đốc duyệt xóa nợ / miễn giảm công nợ cho hợp đồng."""
    return ContractService.write_off_debt(db, contract_id, payload.reason, actor_id=user.id)


@router.get("/{contract_id:path}/eligible-carry-forward-targets")
def get_eligible_carry_forward_targets(
    contract_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "read")),
):
    """Lấy danh sách các hợp đồng hợp lệ của cùng khách hàng để chuyển nợ sang."""
    return ContractService.get_eligible_carry_forward_targets(db, contract_id)


@router.post("/{contract_id:path}/carry-forward-debt")
def carry_forward_debt(
    contract_id: str,
    payload: CarryForwardDebtIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("finance", "approve")),
):
    """Giám đốc duyệt chuyển nợ hợp đồng cũ sang hợp đồng mới."""
    return ContractService.carry_forward_debt(
        db, contract_id, payload.target_contract_id, payload.reason, actor_id=user.id
    )
