"""Runtime document types attached to workflow checklist results."""

import io
import json
import logging
import uuid
from enum import Enum
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.files.references import DossierFileReference
from src.services.storage_service import delete_file, ensure_bucket, upload_file


logger = logging.getLogger(__name__)


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


def _normalized_name(value: str | None) -> tuple[str, str]:
    name = " ".join(str(value or "").split())
    return name, name.lower()


def add_type(
    db: Session,
    *,
    checklist_result_id: str,
    template_id: str | None = None,
    name: str | None = None,
    source: str | None = None,
    actor_id: str,
) -> dict[str, Any]:
    """Add one exact-combo template or one employee-created runtime type."""
    context = checklist_context(db, checklist_result_id)
    if not context:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục checklist.")

    selected_template_id = str(template_id or "").strip() or None
    if selected_template_id:
        suggestions = exact_combo_suggestions(db, checklist_result_id)["data"]
        selected = next(
            (item for item in suggestions if item["template_id"] == selected_template_id),
            None,
        )
        if not selected:
            raise HTTPException(
                status_code=409,
                detail="Mẫu giấy này không thuộc đúng gói, dạng hạng mục và bước hiện tại.",
            )
        resolved_name, normalized_name = _normalized_name(selected["name"])
        resolved_source = selected["source"]
        origin = "CONFIGURED"
    else:
        resolved_name, normalized_name = _normalized_name(name)
        if not resolved_name:
            raise HTTPException(status_code=422, detail="Tên loại giấy không được để trống.")
        if source not in SOURCE_LABELS:
            raise HTTPException(status_code=422, detail="Nguồn loại giấy không hợp lệ.")
        resolved_source = source
        origin = "EMPLOYEE_CREATED"

    inserted = db.execute(
        text("""
            insert into public.checklist_result_document_types
                (checklist_result_id, template_id, name, normalized_name, source,
                 origin, status, created_by)
            values (:checklist_result_id, :template_id, :name, :normalized_name,
                    :source, :origin, 'draft', :actor_id)
            on conflict (checklist_result_id, normalized_name, source) where is_active
            do nothing
            returning id
        """),
        {
            "checklist_result_id": checklist_result_id,
            "template_id": selected_template_id,
            "name": resolved_name,
            "normalized_name": normalized_name,
            "source": resolved_source,
            "origin": origin,
            "actor_id": actor_id,
        },
    ).mappings().first()
    if not inserted:
        raise HTTPException(
            status_code=409,
            detail="Loại giấy cùng tên và nguồn đã có trong checklist này.",
        )
    return {
        "id": inserted["id"],
        "template_id": selected_template_id,
        "name": resolved_name,
        "source": resolved_source,
        "origin": origin,
        "status": DocumentTypeStatus.DRAFT.value,
        "files": [],
        "file_count": 0,
    }


def _document_type_for_update(db: Session, document_type_id: str) -> dict[str, Any]:
    row = db.execute(
        text("""
            select t.id, t.checklist_result_id, t.template_id, t.name, t.source,
                   t.status, sl.contract_id, sl.id as service_line_id,
                   n.id as task_node_id, n.node_code,
                   (select count(*)
                    from public.checklist_result_document_type_files f
                    where f.document_type_id = t.id and f.is_active) as file_count
            from public.checklist_result_document_types t
            join public.task_node_checklist_results cr
              on cr.id = t.checklist_result_id
            join public.task_nodes n on n.id = cr.task_node_id
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            join public.service_lines sl on sl.id = wi.service_line_id
            where t.id = :id and t.is_active
            for update of t
        """),
        {"id": document_type_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy loại giấy trong checklist.")
    return dict(row)


def _assert_file_set_mutable(document_type: dict[str, Any]) -> None:
    if document_type["status"] == DocumentTypeStatus.APPROVED.value:
        raise HTTPException(
            status_code=409,
            detail="Loại giấy đã được duyệt đạt nên không thể thay đổi tệp.",
        )


def _reset_rejected_type(db: Session, document_type: dict[str, Any]) -> None:
    if document_type["status"] != DocumentTypeStatus.REJECTED.value:
        return
    db.execute(
        text("""
            update public.checklist_result_document_types
            set status = 'draft', rejection_reason = null, reviewed_by = null,
                reviewed_at = null, updated_at = now()
            where id = :id and status = 'rejected'
        """),
        {"id": document_type["id"]},
    )
    document_type["status"] = DocumentTypeStatus.DRAFT.value


def _document_stage(node_code: str | None) -> str:
    from src.dossiers.documents import STAGE_BY_UPPER_NODE_CODE

    return STAGE_BY_UPPER_NODE_CODE.get(str(node_code or "").strip().upper()) or "ho-so-goc"


def _failure(file_name: str, exc: Exception) -> dict[str, Any]:
    detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
    result: dict[str, Any] = {
        "file_name": file_name,
        "status": "failed",
        "error": str(detail) or exc.__class__.__name__,
    }
    if isinstance(exc, HTTPException):
        result["status_code"] = exc.status_code
    return result


def add_files(
    db: Session,
    *,
    document_type_id: str,
    uploads: list[tuple[str, str | None, bytes]],
    actor_id: str,
) -> list[dict[str, Any]]:
    """Attach many immutable objects, isolating every file in a DB savepoint."""
    from src.dossiers.documents import _validate_upload

    document_type = _document_type_for_update(db, document_type_id)
    _assert_file_set_mutable(document_type)
    if not uploads:
        raise HTTPException(status_code=422, detail="Phải chọn ít nhất một tệp.")

    file_count = int(document_type.get("file_count") or 0)
    results: list[dict[str, Any]] = []
    for file_name, content_type, data in uploads:
        try:
            _validate_upload(file_name, content_type, data)
        except HTTPException as exc:
            results.append(_failure(file_name, exc))
            continue

        document_id = uuid.uuid4().hex
        reference = DossierFileReference.build(
            contract_id=document_type["contract_id"],
            document_id=document_id,
            filename=file_name,
        )
        uploaded_object_key: str | None = None
        try:
            with db.begin_nested():
                ensure_bucket()
                upload_file(io.BytesIO(data), reference.object_key)
                uploaded_object_key = reference.object_key
                db.execute(
                    text("""
                        insert into public.dossier_documents
                            (id, service_line_id, contract_id, scope, stage,
                             task_node_id, slot_id, object_key, file_name,
                             content_type, size_bytes, uploaded_by)
                        values (:id, :service_line_id, :contract_id, 'SERVICE_LINE',
                                :stage, :task_node_id, null, :object_key, :file_name,
                                :content_type, :size_bytes, :uploaded_by)
                    """),
                    {
                        "id": document_id,
                        "service_line_id": document_type["service_line_id"],
                        "contract_id": document_type["contract_id"],
                        "stage": _document_stage(document_type.get("node_code")),
                        "task_node_id": document_type["task_node_id"],
                        "object_key": reference.object_key,
                        "file_name": file_name,
                        "content_type": content_type,
                        "size_bytes": len(data),
                        "uploaded_by": actor_id,
                    },
                )
                db.execute(
                    text("""
                        insert into public.checklist_result_document_type_files
                            (document_type_id, document_id, created_by)
                        values (:document_type_id, :document_id, :actor_id)
                    """),
                    {
                        "document_type_id": document_type_id,
                        "document_id": document_id,
                        "actor_id": actor_id,
                    },
                )
                _reset_rejected_type(db, document_type)
        except Exception as exc:
            if uploaded_object_key:
                try:
                    delete_file(uploaded_object_key)
                except Exception:
                    logger.warning(
                        "Could not compensate failed checklist document upload %s",
                        uploaded_object_key,
                        exc_info=True,
                    )
            results.append(_failure(file_name, exc))
            continue

        file_count += 1
        results.append({
            "document_id": document_id,
            "file_name": file_name,
            "content_type": content_type,
            "size_bytes": len(data),
            "status": "success",
            "file_count": file_count,
        })

    for result in results:
        if result["status"] == "success":
            result["file_count"] = file_count
    return results


def remove_file(
    db: Session,
    *,
    document_type_id: str,
    document_id: str,
    actor_id: str,
) -> dict[str, Any]:
    """Soft-remove one active file while retaining its object and audit row."""
    document_type = _document_type_for_update(db, document_type_id)
    _assert_file_set_mutable(document_type)
    removed = db.execute(
        text("""
            update public.checklist_result_document_type_files f
            set is_active = false, removed_by = :actor_id, removed_at = now()
            where f.document_type_id = :document_type_id
              and f.document_id = :document_id and f.is_active
            returning f.document_id
        """),
        {
            "document_type_id": document_type_id,
            "document_id": document_id,
            "actor_id": actor_id,
        },
    ).mappings().first()
    if not removed:
        raise HTTPException(status_code=404, detail="Không tìm thấy tệp đang hoạt động trong loại giấy.")
    db.execute(
        text("""
            update public.dossier_documents
            set doc_status = 'DA_GO'
            where id = :document_id and doc_status = 'DANG_DUNG'
        """),
        {"document_id": document_id},
    )
    _reset_rejected_type(db, document_type)
    return {
        "document_type_id": document_type_id,
        "document_id": document_id,
        "status": "removed",
        "file_count": max(0, int(document_type.get("file_count") or 0) - 1),
    }


def attach_existing_file(
    db: Session,
    *,
    document_type_id: str,
    document_id: str,
    actor_id: str,
) -> dict[str, Any]:
    """Move one same-contract raw customer file into a runtime type."""
    document_type = _document_type_for_update(db, document_type_id)
    _assert_file_set_mutable(document_type)
    if document_type["source"] != "KHACH_HANG":
        raise HTTPException(
            status_code=409,
            detail="Kho giấy khách gửi chỉ được phân loại vào loại nguồn Khách hàng.",
        )

    document = db.execute(
        text("""
            select d.id, d.file_name, d.content_type, d.size_bytes, d.doc_status,
                   d.scope, d.slot_id,
                   exists (
                     select 1 from public.dossier_document_links l
                     where l.document_id = d.id and l.link_status = 'DANG_DUNG'
                   ) as has_active_links,
                   exists (
                     select 1 from public.checklist_result_document_type_files f
                     where f.document_id = d.id and f.is_active
                   ) as has_active_type_link
            from public.dossier_documents d
            where d.id = :document_id and d.contract_id = :contract_id
            for update
        """),
        {"document_id": document_id, "contract_id": document_type["contract_id"]},
    ).mappings().first()
    if not document:
        raise HTTPException(status_code=409, detail="Tài liệu không thuộc hợp đồng này.")
    if document["doc_status"] != "DANG_DUNG":
        raise HTTPException(status_code=409, detail="Tài liệu này không còn hiệu lực.")
    if (
        document["scope"] != "CONTRACT"
        or document["slot_id"]
        or document["has_active_links"]
        or document["has_active_type_link"]
    ):
        raise HTTPException(status_code=409, detail="Tài liệu này đã được phân loại.")

    from src.dossiers.slot_requests import assert_document_not_reserved

    assert_document_not_reserved(db, document_id)
    db.execute(
        text("""
            insert into public.checklist_result_document_type_files
                (document_type_id, document_id, created_by)
            values (:document_type_id, :document_id, :actor_id)
        """),
        {
            "document_type_id": document_type_id,
            "document_id": document_id,
            "actor_id": actor_id,
        },
    )
    db.execute(
        text("""
            update public.dossier_documents
            set scope = 'SERVICE_LINE', service_line_id = :service_line_id,
                task_node_id = :task_node_id, slot_id = null
            where id = :document_id
        """),
        {
            "service_line_id": document_type["service_line_id"],
            "task_node_id": document_type["task_node_id"],
            "document_id": document_id,
        },
    )
    db.execute(
        text("""
            insert into public.audit_log
                (actor_id, action, object_type, object_id, payload_json, created_at)
            select
                (select u.id from users u where u.id = :actor),
                :action, 'dossier_document', :document_id,
                case
                  when :actor is not null
                   and not exists (select 1 from users u where u.id = :actor)
                  then cast(:payload as jsonb) || jsonb_build_object('actor_id_missing', :actor)
                  else cast(:payload as jsonb)
                end,
                now()
        """),
        {
            "actor": actor_id,
            "action": "LINK_SOURCE_DOCUMENT",
            "document_id": document_id,
            "payload": json.dumps({
                "document_type_id": document_type_id,
                "checklist_result_id": document_type["checklist_result_id"],
                "contract_id": document_type["contract_id"],
                "service_line_id": document_type["service_line_id"],
                "task_node_id": document_type["task_node_id"],
            }, ensure_ascii=False),
        },
    )
    _reset_rejected_type(db, document_type)
    return {
        "document_type_id": document_type_id,
        "document_id": document_id,
        "file_name": document["file_name"],
        "content_type": document.get("content_type"),
        "size_bytes": document.get("size_bytes"),
        "status": "success",
        "file_count": int(document_type.get("file_count") or 0) + 1,
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


def node_type_review_summary(db: Session, task_node_id: str) -> dict[str, Any]:
    """Summarize active runtime types without treating an empty set as a blocker."""
    rows = [dict(row) for row in db.execute(text("""
        select t.status,
               count(f.document_id) filter (where f.is_active) as file_count
        from public.checklist_result_document_types t
        join public.task_node_checklist_results cr
          on cr.id = t.checklist_result_id
        left join public.checklist_result_document_type_files f
          on f.document_type_id = t.id and f.is_active
        where cr.task_node_id = :task_node_id and t.is_active
        group by t.id, t.status
    """), {"task_node_id": task_node_id}).mappings().all()]
    total = len(rows)
    approved = sum(
        1 for row in rows
        if row["status"] == DocumentTypeStatus.APPROVED.value
        and int(row["file_count"] or 0) > 0
    )
    return {
        "total": total,
        "approved": approved,
        "pending_review": sum(
            1 for row in rows if row["status"] == DocumentTypeStatus.PENDING_REVIEW.value
        ),
        "rejected": sum(
            1 for row in rows if row["status"] == DocumentTypeStatus.REJECTED.value
        ),
        "missing_files": sum(1 for row in rows if int(row["file_count"] or 0) == 0),
        "is_complete": approved == total,
    }


def submit_types_for_node(
    db: Session, task_node_id: str, actor_id: str
) -> dict[str, Any]:
    """Validate and submit every active runtime type in the locked node."""
    # One statement deliberately replaces the workflow's former unresolved-
    # checklist query. Besides reducing round trips, it keeps validation and the
    # status update behind the same locked snapshot.
    summary = db.execute(
        text("""
            with locked_checklists as materialized (
                select cr.id, cr.checklist_name, cr.status
                from public.task_node_checklist_results cr
                where cr.task_node_id = :task_node_id
                order by cr.id
                for update of cr
            ),
            locked_types as materialized (
                select t.id, t.name, t.status,
                       (select count(*)
                        from public.checklist_result_document_type_files f
                        where f.document_type_id = t.id and f.is_active) as file_count
                from public.checklist_result_document_types t
                join locked_checklists cr on cr.id = t.checklist_result_id
                where t.is_active
                order by t.id
                for update of t
            ),
            validation as (
                select
                    coalesce((select array_agg(name order by name)
                              from locked_types where file_count = 0), '{}'::text[])
                      as missing_types,
                    coalesce((select array_agg(checklist_name order by checklist_name)
                              from locked_checklists
                              where status not in (
                                  'pending_approval', 'late_pending_approval',
                                  'approved', 'late_approved', 'not_applicable'
                              )), '{}'::text[])
                      as unresolved_checklists,
                    (select count(*) from locked_types) as total,
                    (select count(*) from locked_types where status = 'approved') as approved,
                    (select count(*) from locked_types where status = 'pending_review')
                      as already_pending
            ),
            updated as (
                update public.checklist_result_document_types t
                set status = 'pending_review', rejection_reason = null,
                    reviewed_by = null, reviewed_at = null, updated_at = now()
                where t.id in (select id from locked_types)
                  and t.status in ('draft', 'rejected')
                  and not exists (select 1 from locked_types where file_count = 0)
                  and not exists (
                      select 1 from locked_checklists
                      where status not in (
                          'pending_approval', 'late_pending_approval',
                          'approved', 'late_approved', 'not_applicable'
                      )
                  )
                returning t.id
            )
            select v.missing_types, v.unresolved_checklists, v.total, v.approved,
                   v.already_pending + (select count(*) from updated) as pending_review
            from validation v
        """),
        {"task_node_id": task_node_id, "actor_id": actor_id},
    ).mappings().first()
    summary = dict(summary or {})
    missing = list(summary.get("missing_types") or [])
    if missing:
        raise HTTPException(
            status_code=422,
            detail="Các loại giấy sau chưa có tệp: " + ", ".join(missing) + ".",
        )
    result = {
        "total": int(summary.get("total") or 0),
        "pending_review": int(summary.get("pending_review") or 0),
        "approved": int(summary.get("approved") or 0),
    }
    unresolved = list(summary.get("unresolved_checklists") or [])
    if unresolved:
        result["unresolved_checklists"] = unresolved
    return result


def promote_completed_checklist_types(
    db: Session, checklist_result_id: str, actor_id: str
) -> list[str]:
    """Materialize official links and exact-COMBO templates at checklist 100%."""
    locked = db.execute(
        text("""
            select 1 from public.task_node_checklist_results
            where id = :checklist_result_id
            for update
        """),
        {"checklist_result_id": checklist_result_id},
    ).scalar()
    if not locked:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục checklist.")

    completion = progress(db, checklist_result_id)
    if not completion["is_complete"]:
        return []

    context = checklist_context(db, checklist_result_id)
    if not context:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục checklist.")
    if not all(
        context.get(key)
        for key in ("service_package_id", "task_type_id", "node_code")
    ):
        raise HTTPException(
            status_code=409,
            detail="Checklist thiếu Gói dịch vụ, Dạng hạng mục hoặc Mã bước để học mẫu.",
        )

    types = [dict(row) for row in db.execute(
        text("""
            select t.id, t.template_id, t.slot_id, t.name, t.source, t.origin,
                   t.status, t.promoted_template_id
            from public.checklist_result_document_types t
            where t.checklist_result_id = :checklist_result_id
              and t.is_active
            order by t.id
            for update of t
        """),
        {"checklist_result_id": checklist_result_id},
    ).mappings().all()]

    from src.dossiers.slot_requests import promote_template_for_combo

    promoted_template_ids: list[str] = []
    for document_type in types:
        template_id = document_type.get("template_id")
        if document_type["origin"] == "EMPLOYEE_CREATED":
            promoted_template_id = document_type.get("promoted_template_id")
            if not promoted_template_id:
                promoted_template_id = promote_template_for_combo(
                    db,
                    name=document_type["name"],
                    source=document_type["source"],
                    service_package_id=context["service_package_id"],
                    task_type_id=context["task_type_id"],
                    node_code=context["node_code"],
                    actor_id=actor_id,
                )
                db.execute(
                    text("""
                        update public.checklist_result_document_types
                        set promoted_template_id = :template_id, updated_at = now()
                        where id = :type_id
                    """),
                    {"type_id": document_type["id"], "template_id": promoted_template_id},
                )
            template_id = promoted_template_id
            promoted_template_ids.append(promoted_template_id)

        slot_id = document_type.get("slot_id")
        if not slot_id:
            slot_id = db.execute(
                text("""
                    insert into public.dossier_document_slots
                        (scope, contract_id, service_line_id, template_id, name, source,
                         is_required, needs_original, quantity, note, sort_order, updated_by)
                    values ('SERVICE_LINE', :contract_id, :service_line_id, :template_id,
                            :name, :source, false, false, 1,
                            'Đạt 100% từ checklist nghiệm thu.', 900, :actor_id)
                    returning id
                """),
                {
                    "type_id": document_type["id"],
                    "contract_id": context["contract_id"],
                    "service_line_id": context["service_line_id"],
                    "template_id": template_id,
                    "name": document_type["name"],
                    "source": document_type["source"],
                    "actor_id": actor_id,
                },
            ).scalar()
            db.execute(
                text("""
                    update public.checklist_result_document_types
                    set slot_id = :slot_id, updated_at = now()
                    where id = :type_id and slot_id is null
                """),
                {"type_id": document_type["id"], "slot_id": slot_id},
            )

        db.execute(
            text("""
                insert into public.dossier_document_links
                    (contract_id, document_id, slot_id, linked_by)
                select d.contract_id, f.document_id, :slot_id, :actor_id
                from public.checklist_result_document_type_files f
                join public.dossier_documents d on d.id = f.document_id
                where f.document_type_id = :type_id and f.is_active
                on conflict (document_id, slot_id) do nothing
            """),
            {
                "type_id": document_type["id"],
                "slot_id": slot_id,
                "actor_id": actor_id,
            },
        )
        db.execute(
            text("""
                insert into public.checklist_result_document_links
                    (contract_id, checklist_result_id, document_id, created_by,
                     review_status, rejection_reason, reviewed_by, reviewed_at)
                select d.contract_id, :checklist_result_id, f.document_id, :actor_id,
                       'approved', null, :actor_id, now()
                from public.checklist_result_document_type_files f
                join public.dossier_documents d on d.id = f.document_id
                where f.document_type_id = :type_id and f.is_active
                on conflict (checklist_result_id, document_id) do update
                set review_status = 'approved', rejection_reason = null,
                    reviewed_by = excluded.reviewed_by,
                    reviewed_at = excluded.reviewed_at
            """),
            {
                "type_id": document_type["id"],
                "checklist_result_id": checklist_result_id,
                "actor_id": actor_id,
            },
        )
    return promoted_template_ids


def review_type(
    db: Session,
    *,
    checklist_result_id: str,
    type_id: str,
    decision: str,
    reason: str | None,
    actor_id: str,
) -> dict[str, Any]:
    """Review one runtime document type and return the node immediately on reject."""
    if decision not in (DocumentTypeStatus.APPROVED.value, DocumentTypeStatus.REJECTED.value):
        raise HTTPException(status_code=422, detail="Quyết định phải là 'approved' hoặc 'rejected'.")
    normalized_reason = " ".join(str(reason or "").split())
    if decision == DocumentTypeStatus.REJECTED.value and not normalized_reason:
        raise HTTPException(status_code=422, detail="Từ chối loại giấy thì phải ghi rõ lý do.")

    checklist = db.execute(
        text("""
            select cr.id, cr.task_node_id, n.status as node_status
            from public.task_node_checklist_results cr
            join public.task_nodes n on n.id = cr.task_node_id
            where cr.id = :checklist_result_id
            for update of cr, n
        """),
        {"checklist_result_id": checklist_result_id},
    ).mappings().first()
    if not checklist:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục checklist.")
    if checklist["node_status"] != "submitted":
        raise HTTPException(status_code=409, detail="Chỉ duyệt loại giấy khi bước đang chờ nghiệm thu.")

    document_type = db.execute(
        text("""
            select t.id, t.checklist_result_id, t.name, t.status,
                   (select count(*)
                    from public.checklist_result_document_type_files f
                    where f.document_type_id = t.id and f.is_active) as file_count
            from public.checklist_result_document_types t
            where t.id = :type_id
              and t.checklist_result_id = :checklist_result_id
              and t.is_active
            for update of t
        """),
        {"type_id": type_id, "checklist_result_id": checklist_result_id},
    ).mappings().first()
    if not document_type:
        raise HTTPException(status_code=404, detail="Không tìm thấy loại giấy trong checklist.")
    if decision == DocumentTypeStatus.APPROVED.value and int(document_type["file_count"] or 0) == 0:
        raise HTTPException(status_code=422, detail="Loại giấy chưa có tệp nên không thể duyệt đạt.")

    db.execute(
        text("""
            update public.checklist_result_document_types
            set status = :status, rejection_reason = :reason,
                reviewed_by = :actor_id, reviewed_at = now(), updated_at = now()
            where id = :type_id
            returning id
        """),
        {
            "type_id": type_id,
            "status": decision,
            "reason": normalized_reason or None,
            "actor_id": actor_id,
        },
    )

    if decision == DocumentTypeStatus.REJECTED.value:
        # Runtime-type review joins the established batch path so the existing
        # employee notification and rework machinery remain the single source
        # of truth. The same transaction preserves the type and its files when
        # the node is returned.
        db.execute(
            text("""
                update public.task_nodes
                set last_reviewed_at = clock_timestamp(), updated_at = now()
                where id = :task_node_id
            """),
            {"task_node_id": checklist["task_node_id"]},
        )
        from src.contracts.workflow_runtime import flush_node_review_batch

        batch_result = flush_node_review_batch(
            db,
            task_node_id=checklist["task_node_id"],
            actor_id=actor_id,
            runtime_batch=[{
                "review_status": decision,
                "rejection_reason": normalized_reason,
                "checklist_name": document_type["name"],
                "checklist_result_id": checklist_result_id,
                "document_name": document_type["name"],
            }],
        )
        if not batch_result or not batch_result["node_status_changed"]:
            raise HTTPException(
                status_code=409,
                detail="Không thể trả bước vì lượt nghiệm thu không còn chờ.",
            )
        return {
            "id": type_id,
            "checklist_result_id": checklist_result_id,
            "task_node_id": checklist["task_node_id"],
            "status": decision,
            "rejection_reason": normalized_reason,
            "node_status": "rework_required",
            "progress": progress(db, checklist_result_id),
            "promoted_template_ids": [],
        }

    current_progress = progress(db, checklist_result_id)
    promoted = (
        promote_completed_checklist_types(db, checklist_result_id, actor_id)
        if current_progress["is_complete"]
        else []
    )
    return {
        "id": type_id,
        "checklist_result_id": checklist_result_id,
        "status": decision,
        "rejection_reason": None,
        "node_status": checklist["node_status"],
        "progress": current_progress,
        "promoted_template_ids": promoted,
    }
