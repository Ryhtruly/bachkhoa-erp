import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text, or_
from sqlalchemy.orm import Session

from src.db.models import Employee, User, LeadPipeline, Customer
from src.core.auth import revoke_all_user_tokens
from src.core.redis_utils import invalidate_cache
from src.contracts.read_model import sync_contract_read_model_after_write

logger = logging.getLogger(__name__)


class EmployeeHandoverIn(BaseModel):
    to_employee_id: Optional[str] = None
    mode: Literal["reassign", "pool", "keep"] = "reassign"
    handover_contracts: bool = True
    handover_crm: bool = True
    deactivate_after: bool = False
    reason: Optional[str] = None


def get_employee_workload(db: Session, employee_id: str) -> Dict[str, Any]:
    """Retrieve all open/in-progress tasks, checklists, and CRM leads for an employee."""
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhân sự.")

    user_id = employee.user_id

    # 1. Active Contract Task Nodes
    node_rows = db.execute(
        text("""
            SELECT DISTINCT
                n.id AS task_node_id,
                n.node_code,
                n.status AS node_status,
                c.id AS contract_id,
                c.id AS contract_code,
                cust.full_name AS customer_name,
                a.role_code,
                a.is_primary,
                coalesce(wn.name, n.node_code) AS node_name
            FROM public.task_node_assignments a
            JOIN public.task_nodes n ON n.id = a.task_node_id
            JOIN public.workflow_instances wi ON wi.id = n.workflow_instance_id
            JOIN public.service_lines sl ON sl.id = wi.service_line_id
            JOIN public.contracts c ON c.id = sl.contract_id
            LEFT JOIN public.customers cust ON cust.id = c.customer_id
            LEFT JOIN public.workflow_nodes wn ON wn.code = n.node_code
            WHERE a.employee_id = :employee_id
              AND a.assignment_status IN ('assigned', 'accepted')
              AND n.status IN ('pending', 'in_progress', 'rework_required')
              AND wi.status IN ('running', 'paused')
            ORDER BY c.id, n.node_code
        """),
        {"employee_id": employee_id},
    ).mappings().all()

    active_nodes = [dict(row) for row in node_rows]

    # 2. Incomplete Checklists
    checklist_rows = db.execute(
        text("""
            SELECT DISTINCT
                cr.id AS checklist_result_id,
                cr.checklist_name,
                cr.status AS checklist_status,
                n.id AS task_node_id,
                n.node_code,
                c.id AS contract_code
            FROM public.task_node_checklist_assignments ca
            JOIN public.task_node_checklist_results cr ON cr.id = ca.checklist_result_id
            JOIN public.task_nodes n ON n.id = cr.task_node_id
            JOIN public.workflow_instances wi ON wi.id = n.workflow_instance_id
            JOIN public.service_lines sl ON sl.id = wi.service_line_id
            JOIN public.contracts c ON c.id = sl.contract_id
            WHERE ca.employee_id = :employee_id
              AND ca.status NOT IN ('replaced', 'cancelled')
              AND cr.status IN ('not_started', 'in_progress', 'rejected')
              AND n.status IN ('pending', 'in_progress', 'rework_required')
              AND wi.status IN ('running', 'paused')
        """),
        {"employee_id": employee_id},
    ).mappings().all()

    active_checklists = [dict(row) for row in checklist_rows]

    # 3. Active CRM Leads
    lead_filter = [LeadPipeline.assigned_to == employee_id]
    if user_id:
        lead_filter.append(LeadPipeline.assigned_to == user_id)

    lead_rows = (
        db.query(LeadPipeline, Customer)
        .outerjoin(Customer, Customer.id == LeadPipeline.customer_id)
        .filter(
            or_(*lead_filter),
            LeadPipeline.status.notin_(["Chốt", "Hủy", "won", "lost", "cancelled"]),
        )
        .order_by(LeadPipeline.created_at.desc())
        .all()
    )

    active_leads = []
    for lead, customer in lead_rows:
        active_leads.append({
            "id": lead.id,
            "customer_name": customer.full_name if customer else "Khách vãng lai",
            "phone": customer.phone if customer else "",
            "source": lead.source,
            "status": lead.status,
            "requirements": lead.requirements,
        })

    total_work = len(active_nodes) + len(active_checklists) + len(active_leads)

    return {
        "employee_id": employee.id,
        "employee_name": employee.full_name,
        "is_active": employee.is_active,
        "has_active_work": total_work > 0,
        "total_active_work": total_work,
        "active_nodes_count": len(active_nodes),
        "active_nodes": active_nodes,
        "active_checklists_count": len(active_checklists),
        "active_checklists": active_checklists,
        "active_leads_count": len(active_leads),
        "active_leads": active_leads,
    }


def execute_employee_handover(
    db: Session,
    from_employee_id: str,
    payload: EmployeeHandoverIn,
    actor_id: str,
) -> Dict[str, Any]:
    """Execute the workload handover and optionally deactivate the employee."""
    from_emp = db.query(Employee).filter(Employee.id == from_employee_id).first()
    if not from_emp:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhân sự bàn giao.")

    to_emp = None
    if payload.mode == "reassign":
        if not payload.to_employee_id:
            raise HTTPException(status_code=422, detail="Vui lòng chọn nhân sự tiếp nhận bàn giao.")
        if payload.to_employee_id == from_employee_id:
            raise HTTPException(status_code=422, detail="Không thể bàn giao cho chính nhân sự này.")
        to_emp = db.query(Employee).filter(
            Employee.id == payload.to_employee_id,
            Employee.is_active.is_(True),
        ).first()
        if not to_emp:
            raise HTTPException(status_code=404, detail="Nhân sự tiếp nhận không tồn tại hoặc đã ngừng hoạt động.")

    reason = (payload.reason or "").strip() or f"Bàn giao công việc nhân sự ({from_emp.full_name})"
    reassigned_nodes_count = 0
    reassigned_checklists_count = 0
    reassigned_leads_count = 0

    # 1. Process Contract Task Nodes & Checklists
    if payload.handover_contracts:
        active_nodes = db.execute(
            text("""
                SELECT DISTINCT
                    n.id AS task_node_id,
                    a.role_code,
                    a.is_primary
                FROM public.task_node_assignments a
                JOIN public.task_nodes n ON n.id = a.task_node_id
                JOIN public.workflow_instances wi ON wi.id = n.workflow_instance_id
                WHERE a.employee_id = :employee_id
                  AND a.assignment_status IN ('assigned', 'accepted')
                  AND n.status IN ('pending', 'in_progress', 'rework_required')
                  AND wi.status IN ('running', 'paused')
            """),
            {"employee_id": from_employee_id},
        ).mappings().all()

        for row in active_nodes:
            nid = row["task_node_id"]
            role_code = row["role_code"]
            is_primary = row["is_primary"]

            if payload.mode == "reassign" and to_emp:
                # Mark old assignment as replaced
                db.execute(
                    text("""
                        UPDATE public.task_node_assignments
                        SET assignment_status = 'replaced',
                            ended_at = now(),
                            replacement_reason = :reason,
                            updated_at = now()
                        WHERE task_node_id = :task_node_id
                          AND employee_id = :employee_id
                          AND assignment_status IN ('assigned', 'accepted')
                    """),
                    {
                        "task_node_id": nid,
                        "employee_id": from_employee_id,
                        "reason": reason,
                    },
                )

                # Check if to_emp is already assigned to this node
                existing = db.execute(
                    text("""
                        SELECT id FROM public.task_node_assignments
                        WHERE task_node_id = :task_node_id
                          AND employee_id = :to_employee_id
                          AND assignment_status IN ('assigned', 'accepted')
                    """),
                    {"task_node_id": nid, "to_employee_id": to_emp.id},
                ).first()

                if not existing:
                    db.execute(
                        text("""
                            INSERT INTO public.task_node_assignments (
                                id, task_node_id, employee_id, role_code, is_primary,
                                assignment_status, created_at, updated_at
                            ) VALUES (
                                gen_random_uuid(), :task_node_id, :to_employee_id, :role_code,
                                :is_primary, 'assigned', now(), now()
                            )
                        """),
                        {
                            "task_node_id": nid,
                            "to_employee_id": to_emp.id,
                            "role_code": role_code,
                            "is_primary": is_primary,
                        },
                    )

                # Update checklist assignments
                db.execute(
                    text("""
                        UPDATE public.task_node_checklist_assignments ca
                        SET status = 'replaced',
                            ended_at = now(),
                            updated_at = now(),
                            reason = :reason
                        FROM public.task_node_checklist_results cr
                        WHERE ca.checklist_result_id = cr.id
                          AND cr.task_node_id = :task_node_id
                          AND ca.employee_id = :employee_id
                          AND ca.status NOT IN ('replaced', 'cancelled')
                    """),
                    {
                        "task_node_id": nid,
                        "employee_id": from_employee_id,
                        "reason": reason,
                    },
                )

                # Assign active checklists to to_emp
                db.execute(
                    text("""
                        INSERT INTO public.task_node_checklist_assignments (
                            id, checklist_result_id, employee_id, role_code, status, assigned_at, created_at, updated_at
                        )
                        SELECT 
                            gen_random_uuid(), cr.id, :to_employee_id, :role_code, 'assigned', now(), now(), now()
                        FROM public.task_node_checklist_results cr
                        WHERE cr.task_node_id = :task_node_id
                          AND cr.status IN ('not_started', 'in_progress', 'rejected')
                          AND NOT EXISTS (
                              SELECT 1 FROM public.task_node_checklist_assignments ca2
                              WHERE ca2.checklist_result_id = cr.id
                                AND ca2.employee_id = :to_employee_id
                                AND ca2.status NOT IN ('replaced', 'cancelled')
                          )
                    """),
                    {
                        "task_node_id": nid,
                        "to_employee_id": to_emp.id,
                        "role_code": role_code,
                    },
                )
                reassigned_nodes_count += 1

            elif payload.mode == "pool":
                # Release node to task pool
                db.execute(
                    text("""
                        UPDATE public.task_node_assignments
                        SET assignment_status = 'replaced',
                            ended_at = now(),
                            replacement_reason = :reason,
                            updated_at = now()
                        WHERE task_node_id = :task_node_id
                          AND employee_id = :employee_id
                          AND assignment_status IN ('assigned', 'accepted')
                    """),
                    {
                        "task_node_id": nid,
                        "employee_id": from_employee_id,
                        "reason": reason,
                    },
                )
                db.execute(
                    text("""
                        UPDATE public.task_node_checklist_assignments ca
                        SET status = 'replaced',
                            ended_at = now(),
                            updated_at = now(),
                            reason = :reason
                        FROM public.task_node_checklist_results cr
                        WHERE ca.checklist_result_id = cr.id
                          AND cr.task_node_id = :task_node_id
                          AND ca.employee_id = :employee_id
                          AND ca.status NOT IN ('replaced', 'cancelled')
                    """),
                    {
                        "task_node_id": nid,
                        "employee_id": from_employee_id,
                        "reason": reason,
                    },
                )
                db.execute(
                    text("""
                        UPDATE public.task_nodes
                        SET is_help_requested = TRUE,
                            yield_reason = :reason,
                            status = CASE WHEN status = 'in_progress' THEN 'pending' ELSE status END,
                            updated_at = now()
                        WHERE id = :task_node_id
                    """),
                    {
                        "task_node_id": nid,
                        "reason": reason,
                    },
                )
                reassigned_nodes_count += 1

    # 2. Process CRM Leads
    if payload.handover_crm and payload.mode == "reassign" and to_emp:
        target_user_id = to_emp.user_id
        lead_filter = []
        if from_emp.user_id:
            lead_filter.append(LeadPipeline.assigned_to == from_emp.user_id)
        if from_emp.id:
            lead_filter.append(LeadPipeline.assigned_to == from_emp.id)

        if target_user_id and lead_filter:
            leads_to_reassign = (
                db.query(LeadPipeline)
                .filter(
                    or_(*lead_filter),
                    LeadPipeline.status.notin_(["Chốt", "Hủy", "won", "lost", "cancelled"]),
                )
                .all()
            )

            for lead in leads_to_reassign:
                lead.assigned_to = target_user_id
                lead.updated_at = datetime.now(timezone.utc)
                reassigned_leads_count += 1

    # 3. Deactivate if requested
    if payload.deactivate_after:
        from_emp.is_active = False
        from_emp.updated_at = datetime.now(timezone.utc)

        if from_emp.user_id:
            user = db.query(User).filter(User.id == from_emp.user_id).first()
            if user:
                user.is_active = False
                user.updated_at = datetime.now(timezone.utc)
                try:
                    revoke_all_user_tokens(user.id)
                except Exception as exc:
                    logger.warning("Không thể thu hồi token khi vô hiệu hoá %s: %s", user.id, exc)
                try:
                    invalidate_cache(f"bachkhoa:user_profile:{user.id}")
                    invalidate_cache(f"bachkhoa:auth:me:{user.id}")
                except Exception:
                    pass

    db.commit()

    # Clear catalog caches and sync read model
    try:
        invalidate_cache("bachkhoa:catalog:assignment_options")
        sync_contract_read_model_after_write(db)
    except Exception as exc:
        logger.warning("Lỗi đồng bộ read model sau bàn giao: %s", exc)

    return {
        "status": "success",
        "message": "Chuyển giao công việc thành công.",
        "reassigned_nodes_count": reassigned_nodes_count,
        "reassigned_leads_count": reassigned_leads_count,
        "deactivated": payload.deactivate_after,
        "to_employee_name": to_emp.full_name if to_emp else None,
    }

