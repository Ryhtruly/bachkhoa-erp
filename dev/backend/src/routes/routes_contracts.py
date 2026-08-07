import json
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.core.auth import check_user_permission, require_permission, User
from src.db.models import Contract, Customer, ServiceLine, ServicePackage, TaskType
from src.contracts import (
    ContractService,
    HopdongCreateSchema,
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
    save_workflow_draft,
)

router = APIRouter(tags=["Hợp Đồng"])


class WorkflowRevisionPayload(BaseModel):
    graph: dict
    source_workflow_version_id: str | None = None
    change_reason: str | None = Field(default=None, max_length=1000)


class WorkflowAssignmentPayload(BaseModel):
    employee_id: str = Field(min_length=1, max_length=50)
    role_code: str = Field(default="MAIN", min_length=1, max_length=50)
    is_primary: bool = False
    planned_start: datetime | None = None
    planned_end: datetime | None = None
    notes: str | None = Field(default=None, max_length=1000)


class NodeAssignmentsPayload(BaseModel):
    assignments: list[WorkflowAssignmentPayload] = Field(default_factory=list)
    replacement_reason: str | None = Field(default=None, max_length=1000)


class WorkflowLayoutPayload(BaseModel):
    ui: dict


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
    if (user.username or "").lower() == "admin":
        return True
    return bool(db.execute(
        text("""
            select 1
            from public.user_roles ur
            join public.roles r on r.id = ur.role_id
            where ur.user_id = :user_id
              and (
                lower(r.role_name) = 'admin'
                or lower(r.role_name) like '%director%'
                or lower(r.role_name) like '%giám đốc%'
                or lower(r.role_name) like '%giam doc%'
              )
            limit 1
        """),
        {"user_id": user.id},
    ).first())


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
def list_hopdong(
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

    rows = []
    for contract_id in contract_ids:
        contract, customer = contract_by_id[contract_id]
        service_lines = lines_by_contract.get(contract_id, [])
        rows.append({
            "id": contract.id,
            "customer_name": customer.full_name if customer else "Chưa cập nhật",
            "customer_phone": customer.phone if customer else "",
            "date_signed": _date_value(contract.date_signed),
            "total_value": _money_value(contract.total_value),
            "status": contract.status or "Chưa cập nhật",
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
    can_update = check_user_permission(db, user, "contract", "update")
    can_view_compensation = check_user_permission(db, user, "finance", "read")
    can_manage_compensation = check_user_permission(db, user, "finance", "approve")
    can_amend_workflow = can_update and _can_amend_workflow(db, user)
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
                    select id, node_key, node_code, occurrence_no, status, outcome,
                           planned_start, planned_end, started_at, submitted_at,
                           accepted_at, completed_at, blocked_reason
                    from public.task_nodes
                    where workflow_instance_id = :workflow_instance_id
                    order by created_at asc, occurrence_no asc
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
                    select a.id, a.task_node_id, a.employee_id, e.full_name,
                           coalesce(d.name, e.department) as department_name,
                           e.job_title, a.role_code, a.is_primary,
                           a.assignment_status, a.planned_start, a.planned_end,
                           a.notes
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
                           r.is_required, r.status, r.evidence_data, r.note,
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
            "edit_workflow": can_update,
            "activate_workflow": can_update,
            "assign_workflow": can_update,
            "amend_workflow": can_amend_workflow,
            "cancel_workflow": can_amend_workflow,
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
    user: User = Depends(require_permission("contract", "update")),
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
    user: User = Depends(require_permission("contract", "update")),
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
    user: User = Depends(require_permission("contract", "update")),
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
    user: User = Depends(require_permission("contract", "update")),
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
    user: User = Depends(require_permission("contract", "update")),
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
        return {"message": "Đã cập nhật phân công", **result}
    except WorkflowValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.post("/")
def create_hopdong(
    payload: HopdongCreateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "create")),
):
    return ContractService.create_contract(db, payload, actor_id=user.id)


@router.post("/generate")
def generate_and_save_contract(
    payload: ContractGenerateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("contract", "create")),
):
    return ContractService.generate_and_save_contract(db, payload, actor_id=user.id)
