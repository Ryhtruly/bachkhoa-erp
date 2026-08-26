"""Vòng đời hồ sơ pháp lý — 4 hành động và nhật ký chuyển trạng thái.

Bộ nút này dùng CHUNG cho cả trang Hồ Sơ Pháp Lý lẫn Lịch trình của nhân viên.
Viết hai bản là hai chỗ để lệch nhau.
"""

from typing import Optional

from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.core.auth import check_user_permission, require_permission
from src.db.database import get_db
from src.db.models import User
from src.dossiers import documents
from src.dossiers.actor_guard import assert_can_act_on_node, format_on_behalf_note
from src.services.timeline_realtime import publish_timeline_change
from src.dossiers.legal_lifecycle import (
    ACTION_LABELS,
    CLOSE_RESULTS,
    PAUSE_REASONS,
    STATUS_LABELS,
    apply_transition,
    available_actions,
    elapsed_working_seconds,
    get_dossier,
)

router = APIRouter(prefix="/api/legal-dossiers", tags=["Legal Dossiers"])


_BASE_SQL = """
    select d.id, d.service_line_id, d.contract_id, d.task_node_id, d.dossier_name,
           d.assigned_employee_id, d.status, d.sub_status, d.closed_note,
           d.assigned_at, d.first_accepted_at, d.closed_at,
           d.total_pending_seconds, d.pending_since, d.created_at, d.updated_at,
           e.full_name  as assigned_employee_name,
           e.avatar_url as assigned_employee_avatar,
           sl.service_type as service_line_name,
           cu.full_name as customer_name,
           n.status as node_status, n.deadline_at,
           (select count(*) from public.legal_submissions s where s.dossier_id = d.id) as submission_count,
           (select max(s.receipt_code) from public.legal_submissions s
             where s.dossier_id = d.id and s.receipt_code is not null) as latest_receipt_code
    from public.legal_dossiers d
    left join public.employees e on e.id = d.assigned_employee_id
    left join public.service_lines sl on sl.id = d.service_line_id
    left join public.contracts c on c.id = d.contract_id
    left join public.customers cu on cu.id = c.customer_id
    left join public.task_nodes n on n.id = d.task_node_id
"""


class TransitionSchema(BaseModel):
    action: str
    sub_status: Optional[str] = None
    note: Optional[str] = None
    # Chỉ giám đốc dùng, và chỉ khi bấm đúng nút "Xử lý thay" ở giao diện.
    on_behalf_reason: Optional[str] = None


class NewSubmissionSchema(BaseModel):
    receipt_code: Optional[str] = None
    received_date: Optional[str] = None
    expected_return_date: Optional[str] = None
    submit_reason: Optional[str] = None
    receipt_photo_url: Optional[str] = None
    note: Optional[str] = None


def _serialize(row: dict) -> dict:
    d = dict(row)
    d["status_label"] = STATUS_LABELS.get(d["status"], d["status"])
    d["available_actions"] = [
        {"action": a, "label": ACTION_LABELS[a]} for a in available_actions(d["status"])
    ]
    d["working_seconds"] = elapsed_working_seconds(d)
    return d


@router.get("/meta")
def get_meta(user: User = Depends(require_permission("legal_submission", "read"))):
    """Danh sách lý do tạm dừng và kết quả đóng — để giao diện không viết cứng."""
    return {
        "status": "success",
        "data": {
            "statuses": [{"value": k, "label": v} for k, v in STATUS_LABELS.items()],
            "pause_reasons": [{"value": k, "label": v} for k, v in PAUSE_REASONS.items()],
            "close_results": [{"value": k, "label": v} for k, v in CLOSE_RESULTS.items()],
        },
    }


@router.get("/")
def list_dossiers(
    status: Optional[str] = Query(None),
    contract_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submission", "read")),
):
    where, params = [], {}
    if status and status != "All":
        where.append("d.status = :status")
        params["status"] = status
    if contract_id:
        where.append("d.contract_id = :contract_id")
        params["contract_id"] = contract_id
    where_sql = f"where {' and '.join(where)}" if where else ""

    rows = db.execute(
        text(f"{_BASE_SQL} {where_sql} order by d.updated_at desc limit 200"), params
    ).mappings().all()
    return {"status": "success", "data": [_serialize(r) for r in rows]}


@router.get("/by-task-node/{task_node_id}")
def get_by_task_node(
    task_node_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submission", "read")),
):
    """Lịch trình của nhân viên dùng đường này — họ thấy công việc, không thấy hồ sơ."""
    row = db.execute(
        text(f"{_BASE_SQL} where d.task_node_id = :i"), {"i": task_node_id}
    ).mappings().first()
    if not row:
        return {"status": "success", "data": None}
    return {"status": "success", "data": _serialize(row)}


@router.get("/{dossier_id}")
def get_dossier_detail(
    dossier_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submission", "read")),
):
    row = db.execute(
        text(f"{_BASE_SQL} where d.id = :i"), {"i": dossier_id}
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ pháp lý")

    data = _serialize(row)
    data["events"] = [
        dict(r) for r in db.execute(
            text("""
                select ev.id, ev.from_status, ev.to_status, ev.sub_status, ev.note,
                       ev.created_at, u.username as actor_username
                from public.legal_dossier_events ev
                left join public.users u on u.id = ev.actor_user_id
                where ev.dossier_id = :i
                order by ev.created_at asc
            """),
            {"i": dossier_id},
        ).mappings().all()
    ]
    data["submissions"] = [
        dict(r) for r in db.execute(
            text("""
                select id, submit_seq, receipt_code, receipt_photo_url, received_date,
                       expected_return_date, submit_reason, note, created_at
                from public.legal_submissions
                where dossier_id = :i
                order by submit_seq asc
            """),
            {"i": dossier_id},
        ).mappings().all()
    ]
    return {"status": "success", "data": data}


@router.post("/{dossier_id}/transition")
def transition(
    dossier_id: str,
    payload: TransitionSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submission", "read")),
):
    """Tiếp nhận · Tạm dừng · Tiếp tục · Đóng hồ sơ.

    Đây là việc của NHÂN VIÊN PHÁP LÝ được phân công vào node nộp hồ sơ.
    Giám đốc chỉ XEM; muốn làm thay phải đi lối "Xử lý thay" kèm lý do.
    """
    if not check_user_permission(db, user, "legal_submission", "update"):
        raise HTTPException(status_code=403, detail="Không có quyền xử lý hồ sơ pháp lý")

    dossier = get_dossier(db, dossier_id)
    actor = assert_can_act_on_node(
        db,
        task_node_id=dossier["task_node_id"],
        user_id=user.id,
        on_behalf_reason=payload.on_behalf_reason,
        action_description="xử lý vòng đời hồ sơ này",
    )

    result = apply_transition(
        db, dossier_id, payload.action,
        sub_status=payload.sub_status,
        note=format_on_behalf_note(actor, payload.note),
        actor_user_id=user.id,
    )

    # Đóng hồ sơ = đã có kết quả từ cơ quan → thử NGHIỆM THU LUÔN bước nộp cơ quan
    # (cơ chế mới) nếu checklist cũng đã được duyệt hết. Bọc savepoint để đóng hồ sơ
    # luôn thành công dù việc tự nghiệm thu có trục trặc.
    node_finalized = False
    if result.get("to_status") == "CLOSED":
        from src.contracts.workflow_runtime import auto_finalize_node_if_ready
        try:
            with db.begin_nested():
                auto = auto_finalize_node_if_ready(
                    db, task_node_id=dossier["task_node_id"], actor_id=user.id
                )
                node_finalized = bool(auto.get("finalized"))
        except Exception:
            import logging
            logging.getLogger(__name__).exception("Auto-finalize sau khi đóng hồ sơ %s lỗi", dossier_id)

    db.commit()
    if node_finalized:
        from src.core.redis_utils import invalidate_cache, invalidate_money_caches
        invalidate_cache("bachkhoa:contract_workspace:*")
        invalidate_money_caches()
    return {"status": "success", "data": {**result, "on_behalf": actor["on_behalf"], "node_finalized": node_finalized}}


@router.post("/{dossier_id}/submissions")
def add_submission(
    dossier_id: str,
    payload: NewSubmissionSchema,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submission", "read")),
):
    """Thêm một LẦN NỘP mới vào hồ sơ đã có — không tạo hồ sơ mới.

    Đây là thứ thay thế node K07 cũ: bị cơ quan trả về thì nộp lại, mỗi lần một
    dòng, chứ không sinh thêm một hồ sơ nữa để rồi hai bản ghi lệch nhau.
    """
    if not check_user_permission(db, user, "legal_submission", "update"):
        raise HTTPException(status_code=403, detail="Không có quyền xử lý hồ sơ pháp lý")

    dossier = get_dossier(db, dossier_id)
    assert_can_act_on_node(
        db, task_node_id=dossier["task_node_id"], user_id=user.id,
        on_behalf_reason=payload.note,
        action_description="thêm lần nộp mới cho hồ sơ này",
    )
    if dossier["status"] == "CLOSED":
        raise HTTPException(status_code=409, detail="Hồ sơ đã đóng, không nộp thêm được")

    seq = db.execute(
        text("select coalesce(max(submit_seq), 0) + 1 from public.legal_submissions where dossier_id = :i"),
        {"i": dossier_id},
    ).scalar()

    new_id = db.execute(
        text("""
            insert into public.legal_submissions
                (dossier_id, submit_seq, task_node_id, service_line_id, contract_id,
                 dossier_name, assigned_employee_id, receipt_code, receipt_photo_url,
                 received_date, expected_return_date, submit_reason, note,
                 is_first_submission, created_by)
            values
                (:dossier_id, :seq, :task_node_id, :service_line_id, :contract_id,
                 :dossier_name, :assigned_employee_id, :receipt_code, :receipt_photo_url,
                 cast(nullif(:received_date, '') as date),
                 cast(nullif(:expected_return_date, '') as date),
                 :submit_reason, :note, false, :created_by)
            returning id
        """),
        {
            "dossier_id": dossier_id, "seq": seq,
            "task_node_id": dossier["task_node_id"],
            "service_line_id": dossier["service_line_id"],
            "contract_id": dossier["contract_id"],
            "dossier_name": dossier["dossier_name"],
            "assigned_employee_id": dossier["assigned_employee_id"],
            "receipt_code": payload.receipt_code,
            "receipt_photo_url": payload.receipt_photo_url,
            "received_date": payload.received_date or "",
            "expected_return_date": payload.expected_return_date or "",
            "submit_reason": payload.submit_reason,
            "note": payload.note,
            "created_by": user.id,
        },
    ).scalar()

    db.execute(
        text("""
            insert into public.legal_dossier_events
                (dossier_id, from_status, to_status, note, actor_user_id)
            values (:d, :s, :s, :n, :a)
        """),
        {"d": dossier_id, "s": dossier["status"],
         "n": f"Nộp lần {seq}" + (f" — {payload.submit_reason}" if payload.submit_reason else ""),
         "a": user.id},
    )
    db.commit()
    return {"status": "success", "data": {"id": new_id, "submit_seq": seq}}


# ── Kho giấy tờ của hồ sơ (tab Hồ sơ pháp lý) ──────────────────────────────────
# Từ K04 trở đi mỗi bước sinh ra một bộ giấy tờ khác nhau, nên kho được chia
# thành ba ngăn theo giai đoạn và chỉ ngăn của bước ĐANG chạy mới nhận thêm tệp.

@router.get("/{dossier_id}/documents")
def list_dossier_documents(
    dossier_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submission", "read")),
):
    return documents.list_documents(db, dossier_id)


@router.post("/{dossier_id}/documents")
async def upload_dossier_document(
    dossier_id: str,
    stage: str = Form(...),
    slot_key: Optional[str] = Form(None),
    note: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submission", "read")),
):
    """Nhân viên scan giấy tờ và lưu vào đúng ngăn giai đoạn của hồ sơ."""
    if not check_user_permission(db, user, "legal_submission", "update"):
        raise HTTPException(status_code=403, detail="Không có quyền xử lý hồ sơ pháp lý")

    data = await file.read(documents.MAX_DOCUMENT_BYTES + 1)
    try:
        result = documents.create_document(
            db,
            dossier_id,
            stage=stage,
            file_name=file.filename or "tai-lieu",
            content_type=file.content_type,
            data=data,
            actor_id=user.id,
            slot_key=slot_key,
            note=note,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    publish_timeline_change("legal_dossier_document_added", entity_id=dossier_id)
    return {"status": "success", "data": result}


@router.get("/documents/{document_id}/download")
def download_dossier_document(
    document_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submission", "read")),
):
    """Đọc tệp qua máy chủ — bucket là private, không phát link trực tiếp."""
    row, body = documents.read_document(db, document_id)
    return Response(
        content=body,
        media_type=row["content_type"] or "application/octet-stream",
        headers={
            "Content-Disposition": (
                f'inline; filename*=UTF-8\'\'{quote(row["file_name"])}'
            ),
            "Cache-Control": "private, max-age=60",
        },
    )


@router.delete("/documents/{document_id}")
def remove_dossier_document(
    document_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("legal_submission", "read")),
):
    if not check_user_permission(db, user, "legal_submission", "update"):
        raise HTTPException(status_code=403, detail="Không có quyền xử lý hồ sơ pháp lý")
    result = documents.delete_document(db, document_id, actor_id=user.id)
    db.commit()
    publish_timeline_change("legal_dossier_document_removed", entity_id=document_id)
    return {"status": "success", "data": result}
