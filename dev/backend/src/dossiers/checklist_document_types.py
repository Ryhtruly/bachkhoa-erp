"""Runtime document types attached to workflow checklist results."""

import io
import uuid
from enum import Enum
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.files.references import DossierFileReference
from src.services.storage_service import ensure_bucket, upload_file


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
        try:
            with db.begin_nested():
                ensure_bucket()
                upload_file(io.BytesIO(data), reference.object_key)
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
