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


_MATERIALIZE_CONFIGURED_TYPES_QUERY = text("""
    insert into public.checklist_result_document_types
        (checklist_result_id, template_id, name, normalized_name, source,
         origin, status, created_by)
    select cr.id,
           t.id,
           t.name,
           lower(regexp_replace(btrim(t.name), '[[:space:]]+', ' ', 'g')),
           t.source,
           'CONFIGURED',
           'draft',
           :actor_id
    from public.task_node_checklist_results cr
    join public.task_nodes n on n.id = cr.task_node_id
    join public.workflow_instance_revisions r
      on r.workflow_instance_id = n.workflow_instance_id
     and r.id = coalesce(:revision_id, n.defined_by_revision_id)
    cross join lateral jsonb_array_elements(coalesce(
        r.graph->'nodes'->n.node_key->'checklist', '[]'::jsonb
    )) checklist_item
    cross join lateral jsonb_array_elements(coalesce(
        checklist_item->'output_documents', '[]'::jsonb
    )) output_document
    join public.document_checklist_templates t
      on t.id = output_document->>'template_id'
    where cr.id = :checklist_result_id
      and checklist_item->>'key' = cr.checklist_key
    on conflict (checklist_result_id, normalized_name, source) where is_active
    do nothing
    returning id
""")


_EXACT_COMBO_SUGGESTIONS_QUERY = text("""
    select t.id as template_id, t.name, t.source
    from public.document_template_applicabilities a
    join public.document_checklist_templates t on t.id = a.template_id
    where a.applicability_type = 'COMBO'
      and a.service_package_id = :service_package_id
      and a.task_type_id = :task_type_id
      and a.node_code = :node_code
      and a.is_default
      and coalesce(t.is_active, true)
    order by t.sort_order, t.name, t.id
""")


def materialize_configured_types(
    db: Session,
    checklist_result_id: str,
    actor_id: str | None = None,
    *,
    revision_id: str | None = None,
) -> int:
    """Snapshot outputs from the node's defining revision, or an explicit target."""
    created = db.execute(
        _MATERIALIZE_CONFIGURED_TYPES_QUERY,
        {
            "checklist_result_id": checklist_result_id,
            "actor_id": actor_id,
            "revision_id": revision_id,
        },
    ).fetchall()
    return len(created)


def exact_combo_suggestions(
    db: Session, checklist_result_id: str
) -> dict[str, Any]:
    """Return only active defaults matching the checklist's exact server scope."""
    context = checklist_context(db, checklist_result_id)
    response_context = {
        "service_package_name": context.get("service_package_name"),
        "task_type_name": context.get("task_type_name"),
        "node_code": context.get("node_code"),
    }
    scope = {
        "service_package_id": context.get("service_package_id"),
        "task_type_id": context.get("task_type_id"),
        "node_code": context.get("node_code"),
    }
    if not all(scope.values()):
        return {"data": [], "context": response_context}

    rows = db.execute(_EXACT_COMBO_SUGGESTIONS_QUERY, scope).mappings().all()
    return {
        "data": [
            {
                "template_id": row["template_id"],
                "name": row["name"],
                "source": row["source"],
                "source_label": SOURCE_LABELS.get(row["source"], row["source"]),
            }
            for row in rows
        ],
        "context": response_context,
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
