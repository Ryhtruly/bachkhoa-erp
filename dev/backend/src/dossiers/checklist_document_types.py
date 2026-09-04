"""Runtime document types attached to workflow checklist results."""

from enum import Enum
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


class DocumentTypeStatus(str, Enum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"


SOURCE_LABELS = {
    "KHACH_HANG": "Khách hàng cung cấp",
    "CONG_TY": "Công ty soạn/lập",
    "CO_QUAN": "Pháp lý",
}


def checklist_context(db: Session, checklist_result_id: str) -> dict[str, Any]:
    """Derive the exact template-applicability scope from a checklist result."""
    row = db.execute(
        text("""
            select cr.id as checklist_result_id,
                   sl.contract_id,
                   sl.id as service_line_id,
                   coalesce(sl.service_package_id, tt.service_package_id)
                     as service_package_id,
                   sp.name as service_package_name,
                   tt.id as task_type_id,
                   tt.name as task_type_name,
                   n.id as task_node_id,
                   n.node_code
            from public.task_node_checklist_results cr
            join public.task_nodes n on n.id = cr.task_node_id
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            join public.service_lines sl on sl.id = wi.service_line_id
            join public.task_types tt on tt.id = sl.task_type_id
            left join public.service_packages sp
              on sp.id = coalesce(sl.service_package_id, tt.service_package_id)
            where cr.id = :id
        """),
        {"id": checklist_result_id},
    ).mappings().first()
    return dict(row) if row else {}


def progress(db: Session, checklist_result_id: str) -> dict[str, Any]:
    rows = [dict(row) for row in db.execute(text("""
        select t.status, count(f.document_id) filter (where f.is_active) as file_count
        from public.checklist_result_document_types t
        left join public.checklist_result_document_type_files f
          on f.document_type_id = t.id and f.is_active
        where t.checklist_result_id = :id and t.is_active
        group by t.id, t.status
    """), {"id": checklist_result_id}).mappings().all()]
    total = len(rows)
    approved = sum(
        1
        for row in rows
        if row["status"] == DocumentTypeStatus.APPROVED.value
        and row["file_count"] > 0
    )
    return {
        "approved": approved,
        "total": total,
        "percent": round(approved * 100 / total) if total else 0,
        "is_complete": total > 0 and approved == total,
    }
