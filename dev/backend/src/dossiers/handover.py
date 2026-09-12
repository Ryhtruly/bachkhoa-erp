"""Node BÀN GIAO (K06) — cổng tài chính cuối cùng trước khi giao kết quả cho khách.

Node này đặc biệt vì TIỀN, khác K06 đặc biệt vì THỜI GIAN. Hai khối nghiệp vụ
được theo dõi song song: nhân viên phụ trách giao hồ sơ, còn kế toán theo dõi
thu đủ tiền hợp đồng.

Ba nguyên tắc rút từ thực tế công ty:

1. **Chặn bàn giao khi còn nợ**, trừ khi Giám đốc đã duyệt ngoại lệ có lý do.
   Cả giao diện lẫn API đều kiểm tra cùng một cờ để không thể vượt cổng bằng
   DevTools hoặc gọi thẳng endpoint.

2. **Tiền khoán bám vào việc giao hồ sơ, không bám vào công nợ.** Nhân viên làm xong phần
   việc của họ rồi; khách chậm trả không phải lỗi của họ.

3. **Mục "thu đủ công nợ" TÍNH SỐNG, không ai tick tay.** Để kế toán tự tick thì
   cổng công nợ chỉ là hình thức. Nó đọc thẳng `cashflow_transactions`, và chỉ đếm phiếu
   thu ĐÃ ĐƯỢC DUYỆT — nên gõ một phiếu khống cũng không mở được cổng.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.files.payment_receipts import public_receipt_attachments
from src.finance.services import APPROVED_TX_STATUSES, INCOME_TX_TYPES
from src.core.finance_validation import parse_issued_money

# Trạng thái node coi như đã đóng — không thao tác được nữa.
_NODE_FINISHED = ("accepted", "cancelled", "skipped")

_APPROVED_SQL = "'" + "','".join(sorted(APPROVED_TX_STATUSES)) + "'"
_INCOME_SQL = "'" + "','".join(sorted(INCOME_TX_TYPES)) + "'"


def _node_or_404(db: Session, task_node_id: str) -> dict:
    row = db.execute(
        text("""
            select n.id, n.node_key, n.node_code, n.status, n.started_at, n.execution_data,
                   n.workflow_instance_id, n.defined_by_revision_id,
                   wi.service_line_id, sl.contract_id, sl.service_type,
                   c.total_value, cu.full_name as customer_name,
                   -- Ưu tiên bản quy trình ĐANG CHẠY, lùi về bản đã sinh ra node.
                   --
                   -- Khi giám đốc sửa quy trình rồi Áp dụng, chỉ node CHƯA bắt đầu
                   -- mới được trỏ sang bản mới — cố ý, vì đổi thời lượng/checklist
                   -- của bước đang làm dở sẽ làm sai hạn và mất minh chứng đã nộp.
                   -- Nhưng CỜ nghiệp vụ thì khác: nó xác định bản chất của bước.
                   -- Đọc theo bản cũ thì tick "Bước bàn giao" xong vẫn báo bước này
                   -- không phải bàn giao, mà trên sơ đồ vẫn hiện nhãn Bàn giao.
                   coalesce(
                     r_act.graph->'nodes'->n.node_key,
                     r_def.graph->'nodes'->n.node_key
                   ) as node_def
            from public.task_nodes n
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            join public.service_lines sl on sl.id = wi.service_line_id
            left join public.contracts c on c.id = sl.contract_id
            left join public.customers cu on cu.id = c.customer_id
            left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
            left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
            where n.id = :i
        """),
        {"i": task_node_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy công việc")
    return dict(row)


def is_handover_node(node: dict) -> bool:
    """Nhận diện bằng CỜ, không bao giờ bằng mã node."""
    return bool((node.get("node_def") or {}).get("is_handover"))


# ══════════════════════════════════════════════════════════════════
# Công nợ — tính sống từ phiếu thu ĐÃ DUYỆT
# ══════════════════════════════════════════════════════════════════

def debt_summary(
    db: Session,
    contract_id: str | None,
    total_value: float | None,
    *,
    task_node_id: str | None = None,
) -> dict:
    """Tính công nợ thật và cổng nghiệp vụ thành hai khái niệm độc lập.

    ``is_settled`` chỉ được phép đúng khi tiền thực thu đã đủ. Phê duyệt ngoại lệ
    chỉ làm ``gate_open`` đúng cho đúng Node K06 được duyệt; nó không xóa nợ và
    không được dùng để chốt hợp đồng hoàn thành.
    """
    if contract_id:
        total = float(parse_issued_money(total_value, f"Giá trị hợp đồng {contract_id}"))
    else:
        total = float(total_value or 0)
        if total < 0:
            raise HTTPException(
                status_code=422,
                detail="Giá trị công nợ không được âm.",
            )
    if not contract_id:
        settled = total <= 0
        return {"contract_id": None, "total_value": total, "paid": 0.0,
                "remaining": total, "percent": 0, "is_settled": settled,
                "gate_open": settled, "has_override": False,
                "override_reason": None, "pending_amount": 0.0}

    row = db.execute(
        text(f"""
            select
              coalesce(sum(amount) filter (where status in ({_APPROVED_SQL})), 0) as approved_amount,
              coalesce(sum(amount) filter (where status in ('Chờ duyệt','PENDING')), 0) as pending_amount
            from public.cashflow_transactions
            where contract_id = :c and transaction_type in ({_INCOME_SQL})
        """),
        {"c": contract_id},
    ).mappings().first()

    paid = float(row["approved_amount"] or 0)
    remaining = max(0.0, total - paid)

    c_ovr = db.execute(
        text("select completion_override, completion_override_reason from public.contracts where id = :c"),
        {"c": contract_id}
    ).mappings().first()

    request_override = None
    if task_node_id:
        request_override = db.execute(
            text("""
                select id, reason, promised_payment_date, reviewed_at, reviewed_by
                from public.handover_debt_requests
                where task_node_id = :n and status = 'approved'
                order by reviewed_at desc
                limit 1
            """),
            {"n": task_node_id},
        ).mappings().first()

    # Giữ cờ cũ để các hồ sơ đã được duyệt trước migration vẫn hoạt động. Mọi
    # yêu cầu mới đều đi qua handover_debt_requests và khóa đúng theo task_node.
    legacy_override = bool(c_ovr["completion_override"]) if c_ovr else False
    has_override = bool(request_override) or legacy_override
    override_reason = (
        request_override["reason"] if request_override
        else (c_ovr["completion_override_reason"] if c_ovr else None)
    )
    is_settled = remaining <= 0.009

    return {
        "contract_id": contract_id,
        "total_value": total,
        "paid": paid,
        "remaining": remaining,
        "percent": round(paid / total * 100) if total else 100,
        "is_settled": is_settled,
        "gate_open": is_settled or has_override,
        "has_override": has_override,
        "override_reason": override_reason,
        # Tiền nhân viên đã gõ nhưng sếp CHƯA duyệt — hiện riêng để khỏi tưởng đã thu.
        "pending_amount": float(row["pending_amount"] or 0),
    }


def _public_debt_commitment(request_id: str, commitment: object) -> dict | None:
    """Chỉ xuất metadata an toàn; khóa MinIO luôn nằm phía server."""
    if isinstance(commitment, str):
        try:
            commitment = json.loads(commitment)
        except (TypeError, ValueError):
            commitment = {}
    if not isinstance(commitment, dict) or not commitment.get("object_key"):
        return None
    return {
        "id": commitment.get("id") or f"debt-commitment-{request_id}",
        "filename": commitment.get("filename") or "File cam kết",
        "content_type": commitment.get("content_type") or "application/octet-stream",
        "size": commitment.get("size"),
        "url": f"/api/handover/debt-requests/{request_id}/commitment",
    }


def _current_debt_request(db: Session, task_node_id: str) -> dict | None:
    row = db.execute(
        text("""
            select r.id, r.task_node_id, r.contract_id, r.requester_user_id,
                   r.remaining_amount_snapshot, r.reason, r.promised_payment_date,
                   r.commitment_file, r.status, r.reviewed_by, r.reviewed_at,
                   r.review_note, r.created_at,
                   req.full_name as requester_name,
                   rev.full_name as reviewer_name
            from public.handover_debt_requests r
            left join public.users req_u on req_u.id = r.requester_user_id
            left join public.employees req on req.user_id = req_u.id
            left join public.users rev_u on rev_u.id = r.reviewed_by
            left join public.employees rev on rev.user_id = rev_u.id
            where r.task_node_id = :n
            order by
              case r.status when 'pending' then 0 when 'approved' then 1 else 2 end,
              r.created_at desc
            limit 1
        """),
        {"n": task_node_id},
    ).mappings().first()
    if not row:
        return None
    result = dict(row)
    result["remaining_amount_snapshot"] = float(result["remaining_amount_snapshot"] or 0)
    # Không trả object_key/sha256 của kho riêng ra trình duyệt. Frontend chỉ
    # nhận URL có xác thực; endpoint tải sẽ kiểm tra lại người xin hoặc quyền
    # duyệt Node trước khi đọc MinIO.
    commitment = result.pop("commitment_file", None)
    result["commitment_attachment"] = _public_debt_commitment(result["id"], commitment)
    return result


def ensure_handover_work_gate_open(db: Session, task_node_id: str) -> dict:
    """Khóa mọi thao tác chuyên môn của K06 khi công nợ chưa được mở.

    Hàm này được gọi ở API nộp checklist/minh chứng, không chỉ ở API nộp
    nghiệm thu. Vì vậy người dùng không thể bỏ qua trạng thái khóa trên UI bằng
    cách gọi thẳng endpoint upload.

    Node thông thường không chịu cổng công nợ và được trả về ngay để giữ nguyên
    toàn bộ luồng Đo vẽ/Pháp lý khác.
    """
    node = _node_or_404(db, task_node_id)
    if not is_handover_node(node):
        return {"is_handover": False, "gate_open": True, "is_settled": True}

    debt = debt_summary(
        db,
        node.get("contract_id"),
        node.get("total_value"),
        task_node_id=task_node_id,
    )
    if debt["remaining"] > 0.009 and not debt["gate_open"]:
        raise HTTPException(
            status_code=423,
            detail=(
                "Hợp đồng còn công nợ. Hãy gửi Xin duyệt nợ và chờ Giám đốc "
                "phê duyệt trước khi thực hiện checklist hoặc nộp minh chứng."
            ),
        )
    return {"is_handover": True, **debt}


def _checklist_submission_state(db: Session, task_node_id: str) -> dict:
    row = db.execute(
        text("""
            with checklist_runtime_summary as (
                select
                    cr.id,
                    cr.status,
                    exists (
                        select 1
                        from public.checklist_result_document_types t
                        where t.checklist_result_id = cr.id
                          and t.is_active
                    ) as uses_runtime_types,
                    exists (
                        select 1
                        from public.checklist_result_document_types t
                        where t.checklist_result_id = cr.id
                          and t.is_active
                          and not exists (
                              select 1
                              from public.checklist_result_document_type_files f
                              where f.document_type_id = t.id
                                and f.is_active
                          )
                    ) as has_empty_types,
                    (
                        exists (
                            select 1
                            from public.checklist_result_document_types t
                            where t.checklist_result_id = cr.id
                              and t.is_active
                        )
                        and not exists (
                            select 1
                            from public.checklist_result_document_types t
                            where t.checklist_result_id = cr.id
                              and t.is_active
                              and (
                                  t.status <> 'approved'
                                  or not exists (
                                      select 1
                                      from public.checklist_result_document_type_files f
                                      where f.document_type_id = t.id
                                        and f.is_active
                                  )
                              )
                        )
                    ) as all_types_approved
                from public.task_node_checklist_results cr
                where cr.task_node_id = :n
            )
            select
                count(*) as total,
                count(*) filter (
                    where (
                        not uses_runtime_types
                        and status not in (
                            'pending_approval', 'late_pending_approval',
                            'approved', 'late_approved', 'not_applicable'
                        )
                    )
                    or (
                        uses_runtime_types
                        and has_empty_types
                    )
                ) as blocking,
                count(*) filter (
                    where (
                        not uses_runtime_types
                        and status in ('approved', 'late_approved', 'not_applicable')
                    )
                    or (
                        uses_runtime_types
                        and (all_types_approved or status in ('approved', 'late_approved', 'not_applicable'))
                    )
                ) as approved
            from checklist_runtime_summary
        """),
        {"n": task_node_id},
    ).mappings().first()
    total = int((row or {}).get("total") or 0)
    blocking = int((row or {}).get("blocking") or 0)
    approved = int((row or {}).get("approved") or 0)
    return {
        "total": total,
        "blocking": blocking,
        "approved": approved,
        "ready_for_acceptance": total > 0 and blocking == 0,
        "all_approved": total > 0 and approved == total,
    }


def installments(db: Session, contract_id: str | None) -> list[dict]:
    """Danh sách từng đợt khách đã đưa tiền — kèm ảnh bill và trạng thái duyệt."""
    if not contract_id:
        return []
    rows = db.execute(
        text(f"""
            select id, amount, transaction_date, status, receipt_attachment_url,
                   receipt_attachments,
                   payer_payee_name, payment_method, description, approved_at
            from public.cashflow_transactions
            where contract_id = :c and transaction_type in ({_INCOME_SQL})
              and coalesce(status, '') not in ('Đã hủy', 'Từ chối', 'CANCELLED', 'REJECTED')
            order by transaction_date asc, created_at asc
        """),
        {"c": contract_id},
    ).mappings().all()
    result = []
    for row in rows:
        item = dict(row)
        attachments = public_receipt_attachments(
            item.get("receipt_attachments"),
            item.get("receipt_attachment_url"),
        )
        item.update({
            "amount": float(row["amount"] or 0),
            "is_approved": row["status"] in APPROVED_TX_STATUSES,
            "receipt_attachments": attachments,
            "receipt_attachment_url": attachments[0]["url"] if attachments else None,
        })
        result.append(item)
    return result


# ══════════════════════════════════════════════════════════════════
# Cửa khoá: node Bàn giao phải chờ node Nộp đóng hồ sơ
# ══════════════════════════════════════════════════════════════════

def submission_gate(db: Session, node: dict) -> dict:
    """Hạng mục có hồ sơ nộp cơ quan thì phải đóng hồ sơ xong mới bàn giao được.

    Hạng mục đo vẽ thuần không có hồ sơ nộp -> cửa mở sẵn.
    """
    dossier = db.execute(
        text("""
            select id, status, dossier_name
            from public.legal_dossiers
            where service_line_id = :s
            limit 1
        """),
        {"s": node["service_line_id"]},
    ).mappings().first()

    if not dossier:
        return {"required": False, "is_open": True, "dossier_id": None,
                "dossier_status": None, "reason": None}

    is_closed = dossier["status"] == "CLOSED"
    return {
        "required": True,
        "is_open": is_closed,
        "dossier_id": dossier["id"],
        "dossier_status": dossier["status"],
        "reason": None if is_closed else "Chờ đóng hồ sơ nộp cơ quan",
    }


# ══════════════════════════════════════════════════════════════════
# Toàn cảnh node bàn giao
# ══════════════════════════════════════════════════════════════════

def get_state(db: Session, task_node_id: str, *, user_id: str | None = None) -> dict:
    """Toàn cảnh node bàn giao — kèm QUYỀN CỦA CHÍNH NGƯỜI ĐANG XEM.

    Trước đây hàm này chỉ xét trạng thái node: node mở thì trả can_do=True cho
    tất cả mọi người. Hậu quả: nhân viên pháp lý mở công việc ra cũng thấy nút
    "Ghi nhận thanh toán" — mà tiền là việc của kế toán. Bấm vào thì API chặn,
    nhưng bày một cái nút chắc chắn hỏng là cách nhanh nhất làm người dùng mất
    niềm tin vào phần mềm.

    Giờ backend quyết định: ai được làm gì thì mới thấy nút đó.
    """
    node = _node_or_404(db, task_node_id)
    if not is_handover_node(node):
        raise HTTPException(status_code=400, detail="Node này không phải bước bàn giao")

    exec_data = node["execution_data"] or {}
    lane_a_data = exec_data.get("handover") or {}
    debt = debt_summary(
        db, node["contract_id"], node["total_value"], task_node_id=task_node_id
    )
    debt_request = _current_debt_request(db, task_node_id)
    checklist_state = _checklist_submission_state(db, task_node_id)
    gate = submission_gate(db, node)

    is_lane_a_done = bool(
        checklist_state["all_approved"]
        or lane_a_data.get("delivered_at")
        or node["status"] == "accepted"
    )
    is_node_closed = node["status"] in _NODE_FINISHED

    # Ai đang xem quyết định họ thấy nút nào.
    from src.core.auth import check_user_permission
    from src.db.models import User
    from src.dossiers.actor_guard import employee_of, is_assigned_to_node

    is_assigned = False
    can_collect_payment = False
    if user_id:
        employee_record = employee_of(db, user_id)
        is_assigned = bool(employee_record) and is_assigned_to_node(
            db, task_node_id=task_node_id, employee_id=employee_record["id"]
        )
        u = db.query(User).filter(User.id == user_id).first()
        can_collect_payment = bool(u) and check_user_permission(db, u, "finance", "create")

    dossier_actors, finance_actors = _split_handover_roles(db, task_node_id)
    payment_collector_name = finance_actors[0]["full_name"] if finance_actors else None
    # Chỉ còn mỗi kế toán trong node thì đừng bịa ra người giao — để trống, người
    # dùng thấy ngay là node thiếu người phụ trách hồ sơ.
    dossier_deliverer_name = dossier_actors[0]["full_name"] if dossier_actors else None
    dossier_deliverer_user_ids = {r["user_id"] for r in dossier_actors if r["user_id"]}

    is_dossier_actor = bool(user_id and user_id in dossier_deliverer_user_ids)
    can_edit_checklist = bool(
        is_dossier_actor
        and node["status"] in ("in_progress", "rework_required")
        and gate["is_open"]
        and not is_node_closed
    )
    request_status = debt_request.get("status") if debt_request else None
    if node["status"] == "accepted":
        business_status = "completed" if debt["is_settled"] else "work_accepted_awaiting_payment"
    elif node["status"] == "submitted":
        business_status = "pending_acceptance"
    elif debt["remaining"] > 0.009 and not debt["gate_open"]:
        business_status = "debt_request_pending" if request_status == "pending" else "debt_locked"
    else:
        business_status = "in_progress"

    return {
        "task_node_id": task_node_id,
        "node_code": node["node_code"],
        "node_status": node["status"],
        "business_status": business_status,
        "is_finished": is_node_closed,
        "contract_id": node["contract_id"],
        "customer_name": node["customer_name"],
        "service_line_name": node["service_type"],
        "gate": gate,
        "debt": debt,
        "debt_request": debt_request,
        "checklist_state": checklist_state,
        "can_request_debt": bool(
            is_dossier_actor
            and node["status"] in ("in_progress", "rework_required")
            and debt["remaining"] > 0.009
            and not debt["gate_open"]
            and request_status != "pending"
        ),
        "can_submit_acceptance": bool(
            can_edit_checklist
            and debt["gate_open"]
            and checklist_state["ready_for_acceptance"]
        ),
        "installments": installments(db, node["contract_id"]),
        "lane_a": {
            "label": "Giao hồ sơ cho khách",
            "desc": "Nhận kết quả, giao tài liệu, lấy chữ ký xác nhận",
            "actor": dossier_deliverer_name,
            "done": is_lane_a_done,
            "delivered_at": lane_a_data.get("delivered_at"),
            "delivered_by": lane_a_data.get("delivered_by"),
            "acknowledged_debt": lane_a_data.get("acknowledged_debt", False),
            "remaining_at_delivery": lane_a_data.get("remaining_at_delivery"),
            # Phải là người được phân công LO PHẦN HỒ SƠ. Kế toán cũng có tên
            # trong node này nhưng việc của họ là thu tiền — người mang hồ sơ
            # đến cho khách và lấy chữ ký là người khác.
            "can_do": can_edit_checklist,
        },
        "lane_b": {
            "label": "Thu đủ tiền hợp đồng",
            "desc": "Tự đánh dấu khi khách trả đủ — không ai tick tay được",
            # Không ràng vào trạng thái node: nợ thuộc về hợp đồng, nên bước bàn
            # giao đã đóng mà khách còn khất thì kế toán vẫn ghi nhận được.
            "can_record_payment": can_collect_payment and not debt["is_settled"],
            "actor": payment_collector_name,
        },
        # Node chỉ đóng được khi CẢ HAI làn xong.
        "can_close": False,
        "blocked_reason": _blocked_reason(gate, is_lane_a_done, debt),
    }


def _blocked_reason(gate: dict, is_lane_a_done: bool, debt: dict) -> str | None:
    if not gate["is_open"]:
        return gate["reason"]
    if not debt.get("gate_open"):
        return f"Còn thiếu {debt['remaining']:,.0f}₫ và chưa được Giám đốc duyệt ngoại lệ"
    if not is_lane_a_done:
        return "Chưa được Giám đốc nghiệm thu việc giao hồ sơ"
    if not debt["is_settled"]:
        return f"Đã nghiệm thu công việc nhưng còn thiếu {debt['remaining']:,.0f}₫"
    return None


# ══════════════════════════════════════════════════════════════════
# Làn A — bàn giao hiện vật
# ══════════════════════════════════════════════════════════════════

def _split_handover_roles(db: Session, task_node_id: str) -> tuple[list, list]:
    """Chia người được phân công vào node bàn giao thành hai bên: lo hồ sơ / lo tiền.

    Tối ưu hóa: 1 câu query SQL duy nhất kết hợp quyền finance.create,
    loại bỏ hoàn toàn vòng lặp N+1 queries.
    """
    assigned_rows = db.execute(
        text("""
            select e.full_name, e.user_id, a.is_primary,
                   exists (
                       select 1
                       from public.user_roles ur
                       join public.roles r on r.id = ur.role_id
                       left join public.role_permissions rp on rp.role_id = r.id
                       where ur.user_id = e.user_id
                         and (
                             r.role_name ilike 'admin'
                             or (rp.resource in ('finance', 'cashflow') and rp.can_create = true)
                         )
                   ) as lo_tien
            from public.task_node_assignments a
            join public.employees e on e.id = a.employee_id
            where a.task_node_id = :n
              and a.assignment_status not in ('replaced','declined','cancelled')
            order by a.is_primary desc nulls last, a.created_at
        """),
        {"n": task_node_id},
    ).mappings().all()

    finance_actors, dossier_actors = [], []
    for row in assigned_rows:
        (finance_actors if row["lo_tien"] else dossier_actors).append(row)
    return dossier_actors, finance_actors


# Ít hơn chừng này thì lý do thường chỉ là "khách hẹn" — không đủ để Giám đốc
# quyết, và sau này đọc lại cũng không hiểu chuyện gì đã xảy ra.
MIN_DEBT_REASON_LENGTH = 10


def create_debt_request(
    db: Session,
    task_node_id: str,
    *,
    actor_id: str,
    reason: str,
    promised_payment_date: date,
    commitment_file: dict | None = None,
) -> dict:
    """Nhân viên xin mở khóa riêng cho một Node K06 đang còn công nợ."""
    node = _node_or_404(db, task_node_id)
    if not is_handover_node(node):
        raise HTTPException(status_code=400, detail="Node này không phải bước bàn giao")
    if node["status"] not in ("in_progress", "rework_required"):
        raise HTTPException(status_code=409, detail="Node không ở trạng thái cho phép xin duyệt nợ")

    dossier_actors, _ = _split_handover_roles(db, task_node_id)
    if actor_id not in {r["user_id"] for r in dossier_actors if r["user_id"]}:
        raise HTTPException(status_code=403, detail="Chỉ người phụ trách giao hồ sơ được xin duyệt nợ")

    clean_reason = (reason or "").strip()
    if len(clean_reason) < MIN_DEBT_REASON_LENGTH:
        raise HTTPException(
            status_code=422,
            detail=f"Lý do xin duyệt nợ phải có ít nhất {MIN_DEBT_REASON_LENGTH} ký tự — "
                   "ghi rõ khách hẹn trả thế nào để Giám đốc quyết được.",
        )
    if promised_payment_date <= date.today():
        raise HTTPException(
            status_code=422,
            detail="Ngày hẹn thanh toán phải sau hôm nay. Hẹn ngày đã qua thì không "
                   "còn là lời hứa trả tiền.",
        )
    # Bắt buộc có bằng chứng: ảnh cam kết nợ, tin nhắn khách xác nhận, hoặc phiếu
    # hẹn. Không có gì làm bằng thì lúc khách chối không còn chỗ nào đối chiếu.
    if not commitment_file:
        raise HTTPException(
            status_code=422,
            detail="Phải đính kèm cam kết nợ — ảnh giấy hẹn, tin nhắn hoặc email "
                   "khách xác nhận ngày trả.",
        )

    debt = debt_summary(
        db, node["contract_id"], node["total_value"], task_node_id=task_node_id
    )
    if debt["is_settled"]:
        raise HTTPException(status_code=409, detail="Hợp đồng đã thu đủ tiền, không cần xin duyệt nợ")
    if debt["gate_open"]:
        raise HTTPException(status_code=409, detail="Node này đã được mở khóa bàn giao")

    existing = db.execute(
        text("""
            select id from public.handover_debt_requests
            where task_node_id = :n and status = 'pending'
            limit 1
        """),
        {"n": task_node_id},
    ).scalar()
    if existing:
        raise HTTPException(status_code=409, detail="Yêu cầu xin duyệt nợ đang chờ Giám đốc xử lý")

    request_id = db.execute(
        text("""
            insert into public.handover_debt_requests
                (task_node_id, contract_id, requester_user_id,
                 remaining_amount_snapshot, reason, promised_payment_date,
                 commitment_file, status)
            values
                (:n, :c, :u, :remaining, :reason, :promised,
                 cast(:file as jsonb), 'pending')
            returning id
        """),
        {
            "n": task_node_id,
            "c": node["contract_id"],
            "u": actor_id,
            "remaining": debt["remaining"],
            "reason": clean_reason,
            "promised": promised_payment_date,
            "file": json.dumps(commitment_file or {}, ensure_ascii=False),
        },
    ).scalar_one()
    db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            values
                (:n, 'HANDOVER_DEBT_REQUESTED', :s, :s, :u, cast(:p as jsonb))
        """),
        {
            "n": task_node_id,
            "s": node["status"],
            "u": actor_id,
            "p": json.dumps({
                "request_id": request_id,
                "remaining_amount_snapshot": debt["remaining"],
                "promised_payment_date": promised_payment_date.isoformat(),
            }, ensure_ascii=False),
        },
    )
    db.execute(
        text("""
            insert into public.notifications (id, user_id, title, content, is_read, created_at)
            select gen_random_uuid()::text, ur.user_id,
                   'Yêu cầu duyệt nợ khi bàn giao',
                   :content, false, now()
            from public.user_roles ur
            join public.roles r on r.id = ur.role_id
            where r.role_name = 'admin'
        """),
        {"content": f"Hợp đồng {node['contract_id']} còn thiếu {debt['remaining']:,.0f}₫. Nhân viên xin bàn giao trước."},
    )
    return {
        "id": request_id,
        "task_node_id": task_node_id,
        "status": "pending",
        "remaining_amount_snapshot": debt["remaining"],
        "reason": clean_reason,
        "promised_payment_date": promised_payment_date,
        "commitment_attachment": _public_debt_commitment(request_id, commitment_file),
    }


def review_debt_request(
    db: Session,
    request_id: str,
    *,
    decision: str,
    review_note: str | None,
    actor_id: str,
) -> dict:
    """Giám đốc duyệt/từ chối đúng yêu cầu của đúng Node, có audit bất biến."""
    if decision not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Quyết định phải là approved hoặc rejected")
    note = (review_note or "").strip() or None
    if decision == "rejected" and not note:
        raise HTTPException(
            status_code=422,
            detail="Không duyệt yêu cầu nợ phải ghi rõ lý do để nhân viên xử lý.",
        )
    row = db.execute(
        text("""
            select r.id, r.task_node_id, r.contract_id, r.requester_user_id,
                   r.status, r.reason, r.promised_payment_date, n.status as node_status
            from public.handover_debt_requests r
            join public.task_nodes n on n.id = r.task_node_id
            where r.id = :i
            for update of r
        """),
        {"i": request_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu xin duyệt nợ")
    if row["status"] != "pending":
        raise HTTPException(status_code=409, detail="Yêu cầu này đã được xử lý")

    db.execute(
        text("""
            update public.handover_debt_requests
            set status = :decision, reviewed_by = :actor, reviewed_at = now(),
                review_note = :note, updated_at = now()
            where id = :i
        """),
        {"decision": decision, "actor": actor_id, "note": note, "i": request_id},
    )
    event_type = "HANDOVER_DEBT_APPROVED" if decision == "approved" else "HANDOVER_DEBT_REJECTED"
    db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            values (:n, :event, :s, :s, :actor, cast(:payload as jsonb))
        """),
        {
            "n": row["task_node_id"],
            "event": event_type,
            "s": row["node_status"],
            "actor": actor_id,
            "payload": json.dumps({
                "request_id": request_id,
                "decision": decision,
                "review_note": note,
            }, ensure_ascii=False),
        },
    )
    db.execute(
        text("""
            insert into public.notifications (id, user_id, title, content, is_read, created_at)
            values (gen_random_uuid()::text, :u, :title, :content, false, now())
        """),
        {
            "u": row["requester_user_id"],
            "title": "Yêu cầu duyệt nợ đã được xử lý",
            "content": (
                f"Giám đốc đã duyệt cho bàn giao trước đối với hợp đồng {row['contract_id']}."
                if decision == "approved"
                else f"Giám đốc từ chối yêu cầu bàn giao trước đối với hợp đồng {row['contract_id']}."
            ),
        },
    )
    if decision == "approved":
        # Nếu mọi checklist K06 đã được duyệt từ trước, quyết định ngoại lệ này
        # chính là điều kiện cuối: đóng bước ngay, không bắt nhân viên nộp lại.
        from src.contracts.workflow_runtime import auto_finalize_node_if_ready

        auto_finalize_node_if_ready(
            db,
            task_node_id=row["task_node_id"],
            actor_id=actor_id,
        )
    return {
        "id": request_id,
        "task_node_id": row["task_node_id"],
        "contract_id": row["contract_id"],
        "status": decision,
        "review_note": note,
    }


def submit_handover_for_acceptance(
    db: Session,
    task_node_id: str,
    *,
    actor_id: str,
    note: str | None,
) -> dict:
    """Nhân viên nộp toàn bộ K06 để Giám đốc nghiệm thu, không tự đóng Node."""
    node = _node_or_404(db, task_node_id)
    if not is_handover_node(node):
        raise HTTPException(status_code=400, detail="Node này không phải bước bàn giao")
    if node["status"] not in ("in_progress", "rework_required"):
        raise HTTPException(status_code=409, detail="Node không ở trạng thái cho phép nộp nghiệm thu")

    gate = submission_gate(db, node)
    if not gate["is_open"]:
        raise HTTPException(status_code=409, detail=gate["reason"])
    dossier_actors, _ = _split_handover_roles(db, task_node_id)
    if actor_id not in {r["user_id"] for r in dossier_actors if r["user_id"]}:
        raise HTTPException(status_code=403, detail="Chỉ người phụ trách giao hồ sơ được nộp nghiệm thu")

    debt = debt_summary(
        db, node["contract_id"], node["total_value"], task_node_id=task_node_id
    )
    if debt["remaining"] > 0.009 and not debt["gate_open"]:
        # 423 Locked, không phải 400: yêu cầu không sai định dạng — cổng đang
        # khoá vì công nợ. Dùng đúng mã mà `ensure_handover_work_gate_open` đã
        # dùng cho CÙNG điều kiện này: một nguyên nhân thì một mã lỗi, để giao
        # diện không phải đoán theo từng endpoint.
        #
        # Và phải nói RÕ còn thiếu bao nhiêu cùng lối đi tiếp, nếu không nhân
        # viên đứng trước một nút xám không biết làm gì.
        raise HTTPException(
            status_code=423,
            detail=(
                f"Hợp đồng còn nợ {debt['remaining']:,.0f}đ nên chưa nộp nghiệm thu "
                "bàn giao được. Thu nốt tiền, hoặc gửi đơn xin duyệt nợ kèm cam kết "
                "để Giám đốc mở khoá."
            ),
        )
    checklist_state = _checklist_submission_state(db, task_node_id)
    if checklist_state["total"] == 0:
        raise HTTPException(status_code=400, detail="Node bàn giao chưa có checklist nghiệm thu")
    if not checklist_state["ready_for_acceptance"]:
        raise HTTPException(status_code=400, detail="Phải nộp đủ toàn bộ checklist và minh chứng bắt buộc")

    # K06 has a dedicated submit endpoint, but runtime document types still use
    # the same one-submit state machine as every other node. Keep this after
    # actor/debt/checklist gates so a forbidden or financially blocked request
    # cannot mutate employee evidence.
    from src.dossiers.checklist_document_types import submit_types_for_node

    submitted_types = submit_types_for_node(db, task_node_id, actor_id)
    unresolved = submitted_types.get("unresolved_checklists", [])
    if unresolved:
        names = ", ".join(unresolved)
        raise HTTPException(
            status_code=400,
            detail=f"Còn nhiệm vụ chưa điền xong: {names}",
        )

    attempt_no = db.execute(
        text("""
            select coalesce(max(attempt_no), 0) + 1
            from public.task_node_acceptances where task_node_id = :n
        """),
        {"n": task_node_id},
    ).scalar_one()
    acceptance_id = db.execute(
        text("""
            insert into public.task_node_acceptances
                (task_node_id, attempt_no, status, submitted_by, submission_payload)
            values (:n, :attempt, 'pending', :actor, cast(:payload as jsonb))
            returning id
        """),
        {
            "n": task_node_id,
            "attempt": attempt_no,
            "actor": actor_id,
            "payload": json.dumps({"note": note, "handover": True}, ensure_ascii=False),
        },
    ).scalar_one()
    exec_data = node.get("execution_data") or {}
    exec_data["handover"] = {
        **(exec_data.get("handover") or {}),
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "submitted_by": actor_id,
        "remaining_at_submission": debt["remaining"],
        "used_debt_override": bool(debt["remaining"] > 0.009),
    }
    db.execute(
        text("""
            update public.task_nodes
            set status = 'submitted', submitted_at = now(),
                execution_data = jsonb_set(
                    cast(:data as jsonb),
                    '{actual_duration_seconds}',
                    to_jsonb(greatest(0, extract(epoch from (now() - coalesce(started_at, now())))::bigint)),
                    true
                ),
                updated_at = now()
            where id = :n
        """),
        {"n": task_node_id, "data": json.dumps(exec_data, ensure_ascii=False)},
    )
    db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            values (:n, 'NODE_SUBMITTED', :from_status, 'submitted', :actor, cast(:payload as jsonb))
        """),
        {
            "n": task_node_id,
            "from_status": node["status"],
            "actor": actor_id,
            "payload": json.dumps({"acceptance_id": acceptance_id, "handover": True}, ensure_ascii=False),
        },
    )
    return {
        "task_node_id": task_node_id,
        "acceptance_id": acceptance_id,
        "status": "submitted",
    }


def mark_delivered(
    db: Session, task_node_id: str, *, acknowledged_debt: bool, note: str | None, actor_id: str
) -> dict:
    """Endpoint tương thích cũ: chuyển thành nộp nghiệm thu, không tự đóng K06."""
    node = _node_or_404(db, task_node_id)
    if not is_handover_node(node):
        raise HTTPException(status_code=400, detail="Node này không phải bước bàn giao")
    if node["status"] in _NODE_FINISHED:
        raise HTTPException(status_code=409, detail="Node đã đóng, không thao tác được nữa")

    gate = submission_gate(db, node)
    if not gate["is_open"]:
        raise HTTPException(status_code=409, detail=gate["reason"])

    # Ẩn nút ở giao diện là chưa đủ — chặn luôn ở đây, nếu không kế toán vẫn gọi
    # thẳng API ghi nhận bàn giao được.
    dossier_actors, _ = _split_handover_roles(db, task_node_id)
    allowed_deliverer_user_ids = {r["user_id"] for r in dossier_actors if r["user_id"]}
    if actor_id not in allowed_deliverer_user_ids:
        raise HTTPException(
            status_code=403,
            detail=(
                "Việc giao hồ sơ cho khách thuộc về người phụ trách hồ sơ của bước này. "
                "Người thu tiền chỉ ghi nhận thanh toán."
            ),
        )

    debt = debt_summary(
        db, node["contract_id"], node["total_value"], task_node_id=task_node_id
    )
    # Không tin thuộc tính disabled hoặc acknowledged_debt do client gửi lên.
    # Chỉ số dư thực tế hoặc phê duyệt ngoại lệ của Giám đốc mới mở được cổng.
    if debt["remaining"] > 0.009 and not debt.get("gate_open", False):
        raise HTTPException(
            status_code=400,
            detail=("Hồ sơ chưa đủ điều kiện bàn giao do còn nợ tiền và chưa có "
                    "phê duyệt ngoại lệ của Giám đốc."),
        )

    submission = submit_handover_for_acceptance(
        db, task_node_id, actor_id=actor_id, note=note
    )
    return {
        **submission,
        "delivered": False,
        "acknowledged_debt": bool(debt["remaining"] > 0.009),
        "remaining": debt["remaining"],
        "node_finalized": False,
    }


# ══════════════════════════════════════════════════════════════════
# Làn B — ghi nhận đợt thu tiền
# ══════════════════════════════════════════════════════════════════

def record_payment(
    db: Session,
    task_node_id: str,
    *,
    amount: float,
    receipt_attachments: list[dict],
    payment_method: str,
    payer_name: str | None,
    note: str | None,
    actor_id: str,
) -> dict:
    node = _node_or_404(db, task_node_id)
    if not node["contract_id"]:
        raise HTTPException(status_code=400, detail="Node not linked to a contract")

    return _record_payment_transaction(
        db,
        contract_id=node["contract_id"],
        amount=amount,
        receipt_attachments=receipt_attachments,
        payment_method=payment_method,
        payer_name=payer_name or node["customer_name"],
        note=note,
        actor_id=actor_id,
        default_desc=f"Payment at handover — {node['service_type'] or ''}".strip(),
        task_node_id=task_node_id,
        node_status=node["status"],
        total_value=node["total_value"],
    )


def record_contract_payment(
    db: Session,
    contract_id: str,
    *,
    amount: float,
    receipt_attachments: list[dict],
    payment_method: str,
    payer_name: str | None,
    note: str | None,
    actor_id: str,
) -> dict:
    row = db.execute(
        text("""
            select c.id, c.total_value, cu.full_name as customer_name
            from public.contracts c
            left join public.customers cu on cu.id = c.customer_id
            where c.id = :c
        """),
        {"c": contract_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Contract not found")

    return _record_payment_transaction(
        db,
        contract_id=contract_id,
        amount=amount,
        receipt_attachments=receipt_attachments,
        payment_method=payment_method,
        payer_name=payer_name or row["customer_name"],
        note=note,
        actor_id=actor_id,
        default_desc=f"Contract payment {contract_id}",
        total_value=row["total_value"],
    )


def _record_payment_transaction(
    db: Session,
    *,
    contract_id: str,
    amount: float,
    receipt_attachments: list[dict],
    payment_method: str,
    payer_name: str | None,
    note: str | None,
    actor_id: str,
    default_desc: str,
    total_value,
    task_node_id: str | None = None,
    node_status: str | None = None,
) -> dict:
    if amount is None or float(amount) <= 0:
        raise HTTPException(status_code=400, detail="Amount must be > 0")
    if not receipt_attachments:
        raise HTTPException(status_code=400, detail="Receipt attachments required")

    debt = debt_summary(db, contract_id, total_value)
    remaining_after_approval = debt["remaining"] - debt["pending_amount"]
    if float(amount) > remaining_after_approval + 0.009:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Amount exceeds remaining balance. Remaining: {debt['remaining']:,.0f}₫"
                + (f", of which {debt['pending_amount']:,.0f}₫ pending approval."
                   if debt["pending_amount"] else ".")
            ),
        )

    from src.finance.repository import FinanceRepository
    from src.finance.enums import TransactionType, TransactionStatus, TransactionScope, normalize_payment_method
    from datetime import date

    today_date = date.today()
    canon_type = TransactionType.INCOME.value
    canon_pm = normalize_payment_method(payment_method)
    canon_status = TransactionStatus.PENDING.value
    canon_scope = TransactionScope.COMPANY.value
    new_id = FinanceRepository.generate_voucher_id(canon_type, db, today_date)
    first_att = receipt_attachments[0]
    first_receipt_url = first_att.get("url") or f"/api/handover/payment-receipts/{first_att.get('id', 'receipt_1')}"
    db.execute(
        text("""
            insert into public.cashflow_transactions
                (id, contract_id, transaction_type, amount, category_code,
                 payer_payee_name, payment_method, transaction_date, document_number,
                 description, receipt_attachment_url, receipt_attachments,
                 created_by_user_id, status, scope, created_at)
            values
                (:id, :contract_id, :tx_type, :amount, 'Thu tiền hợp đồng',
                 :payer, :method, :transaction_date, :id,
                 :description, :bill, cast(:attachments as jsonb),
                 :actor, :status, :scope, now())
        """),
        {
            "id": new_id, "contract_id": contract_id, "tx_type": canon_type, "amount": float(amount),
            "payer": payer_name, "method": canon_pm,
            "transaction_date": today_date,
            "description": note or default_desc,
            "bill": first_receipt_url,
            "attachments": json.dumps(receipt_attachments, ensure_ascii=False),
            "actor": actor_id,
            "status": canon_status,
            "scope": canon_scope,
        },
    )

    if task_node_id:
        db.execute(
            text("""
                insert into public.task_node_events
                    (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
                values (:i, 'HANDOVER_PAYMENT_RECORDED', :s, :s, :a, cast(:p as jsonb))
            """),
            {"i": task_node_id, "s": node_status, "a": actor_id,
             "p": json.dumps({
                 "voucher_id": new_id,
                 "amount": float(amount),
                 "receipt_count": len(receipt_attachments),
             }, ensure_ascii=False)},
        )

    return {
        "voucher_id": new_id,
        "amount": float(amount),
        "status": canon_status,
        "receipt_count": len(receipt_attachments),
    }


def get_handover_deliverables(db: Session, task_node_id: str) -> dict:
    """Gom mọi tài liệu của hạng mục để giao cho khách."""
    node = _node_or_404(db, task_node_id)
    sl_id = node.get("service_line_id")

    items: list[dict] = []

    contract_file_link = db.execute(
        text("select file_link from public.contracts where id = :c"),
        {"c": node["contract_id"]},
    ).scalar()
    if contract_file_link:
        items.append({"nhom": "Hop dong", "ten": "Hop dong da ky", "url": contract_file_link})

    for r in db.execute(
        text("""
            select dossier_file_url, linked_survey_folder_url, receipt_code
            from public.legal_submissions
            where service_line_id = :s
            order by submit_seq
        """),
        {"s": sl_id},
    ).mappings():
        if r["dossier_file_url"]:
            items.append({"nhom": "Ho so phap ly", "ten": "Bo ho so nop co quan", "url": r["dossier_file_url"]})
        if r["linked_survey_folder_url"]:
            items.append({"nhom": "Ban ve", "ten": "Thu muc ban ve do dac", "url": r["linked_survey_folder_url"]})

    for r in db.execute(
        text("""
            select r.checklist_name, r.evidence_data, n.node_code
            from public.task_node_checklist_results r
            join public.task_nodes n on n.id = r.task_node_id
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            where wi.service_line_id = :s
              and r.evidence_data is not null
            order by n.node_code, r.checklist_name
        """),
        {"s": sl_id},
    ).mappings():
        for f in (r["evidence_data"] or {}).get("files", []) or []:
            if f.get("url"):
                items.append({
                    "nhom": f"Minh chung {r['node_code']}",
                    "ten": f.get("name") or r["checklist_name"],
                    "url": f["url"],
                })

    debt = debt_summary(db, node["contract_id"], node["total_value"])
    is_accepted = node["status"] == "accepted"
    can_download = bool(debt["is_settled"] or is_accepted)
    return {
        "contract_id": node["contract_id"],
        "customer_name": node["customer_name"],
        "items": items,
        "debt": debt,
        "can_download": can_download,
        "blocked_reason": None if can_download
            else f"Còn thiếu {debt['remaining']:,.0f}₫ — thu đủ tiền hoặc nghiệm thu xong bước bàn giao thì mới tải được bộ hồ sơ gốc",
    }

# Backward compatibility alias
tai_lieu_ban_giao = get_handover_deliverables


# ══════════════════════════════════════════════════════════════════
# Màn hình kế toán: "Đã giao — chưa thu đủ"
# ══════════════════════════════════════════════════════════════════

def outstanding_handovers(db: Session) -> list[dict]:
    """Công nợ đang thu và lịch sử K06 đã được duyệt giao trước.

    Trước đây danh sách này bám theo BƯỚC bàn giao: chỉ hiện hồ sơ đang đứng đúng
    ở bước đó. Hợp đồng vừa ký chưa chạy tới bước bàn giao, hợp đồng đã đóng bước
    bàn giao mà khách còn khất nợ, và hợp đồng có quy trình không khai bước bàn
    giao nào — cả ba đều biến mất khỏi màn hình, trong khi tiền vẫn còn nợ. Kế
    toán mở đúng màn thu công nợ của mình mà không thấy khoản phải đòi.

    Nay đi từ HỢP ĐỒNG: còn nợ thì còn nằm trong danh sách. Nếu K06 từng được
    Giám đốc duyệt giao trước khi thu đủ, card vẫn được giữ lại sau khi tất toán
    để đổi từ cảnh báo đỏ sang xác nhận xanh thay vì biến mất không dấu vết.
    """
    rows = db.execute(
        text(f"""
            select c.id as contract_id,
                   cu.full_name as customer_name,
                   c.completion_override,
                   c.completion_override_reason,
                   c.completion_override_at,
                   c.completion_override_by,
                   debt_approval.id as debt_request_id,
                   debt_approval.reason as debt_request_reason,
                   debt_approval.promised_payment_date,
                   debt_approval.reviewed_at as debt_request_reviewed_at,
                   debt_approval.reviewed_by as debt_request_reviewed_by,
                   coalesce(c.total_value, 0) as total_value,
                   coalesce(paid_tx.paid_amount, 0) as paid,
                   coalesce(pending_tx.pending_amount, 0) as pending,
                   bg.task_node_id, bg.node_status, bg.delivered_at,
                   bg.delivered_at is not null as da_ban_giao,
                   coalesce(bg.service_type, c.service_type) as service_type,
                   bg.dossier_status, bg.dossier_assignee
            from public.contracts c
            left join public.customers cu on cu.id = c.customer_id
            left join (
                select t.contract_id, sum(t.amount) as paid_amount
                from public.cashflow_transactions t
                where t.transaction_type in ({_INCOME_SQL})
                  and t.status in ({_APPROVED_SQL})
                group by t.contract_id
            ) paid_tx on paid_tx.contract_id = c.id
            -- Phiếu kế toán đã gửi, giám đốc chưa duyệt. Chưa trừ vào công nợ
            -- nhưng phải hiện ra, nếu không kế toán gửi xong nhìn màn hình y hệt
            -- lúc chưa gửi và tưởng hệ thống nuốt mất phiếu.
            left join (
                select t.contract_id, sum(t.amount) as pending_amount
                from public.cashflow_transactions t
                where t.transaction_type in ({_INCOME_SQL})
                  and t.status in ('Chờ duyệt', 'PENDING', 'pending')
                group by t.contract_id
            ) pending_tx on pending_tx.contract_id = c.id
            -- Phê duyệt giao trước là lịch sử nghiệp vụ của K06, KHÔNG phải
            -- trạng thái đã thu đủ. Giữ record này để kế toán thấy cảnh báo đỏ
            -- đến khi số dư thật bằng 0, sau đó card chuyển xanh.
            left join lateral (
                select r.id, r.reason, r.promised_payment_date,
                       r.reviewed_at, r.reviewed_by
                from public.handover_debt_requests r
                where r.contract_id = c.id and r.status = 'approved'
                order by r.reviewed_at desc nulls last, r.created_at desc
                limit 1
            ) debt_approval on true
            -- Bước bàn giao của hợp đồng, nếu quy trình có khai. Không có cũng
            -- không sao — hợp đồng vẫn hiện, vì tiền vẫn nợ.
            left join lateral (
                select n.id as task_node_id, n.status as node_status,
                       n.execution_data->'handover'->>'delivered_at' as delivered_at,
                       sl.service_type,
                       d.status as dossier_status,
                       de.full_name as dossier_assignee
                from public.task_nodes n
                join public.workflow_instances wi on wi.id = n.workflow_instance_id
                join public.service_lines sl on sl.id = wi.service_line_id
                -- Cùng lý do như _node_or_404: cờ phải đọc theo bản đang chạy.
                left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
                left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
                left join public.legal_dossiers d on d.service_line_id = sl.id
                left join public.employees de on de.id = d.assigned_employee_id
                where sl.contract_id = c.id
                  and n.status <> 'cancelled'
                  and coalesce((
                        coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->>'is_handover'
                      )::boolean, false)
                order by (n.execution_data->'handover'->>'delivered_at') asc nulls last,
                         n.created_at asc
                limit 1
            ) bg on true
            where coalesce(c.status, '') not in ('Đã huỷ', 'Đã hủy', 'cancelled')
              and (
                coalesce(c.total_value, 0) - coalesce(paid_tx.paid_amount, 0) > 0.009
                or debt_approval.id is not null
                or coalesce(c.completion_override, false)
              )
            order by bg.delivered_at asc nulls last, c.created_at asc
        """)
    ).mappings().all()

    if not rows:
        return []

    # 1. Batch fetch user_ids có quyền finance để xác định ai là bên tiền / bên hồ sơ
    finance_user_ids = set(
        r[0] for r in db.execute(text("""
            select distinct ur.user_id
            from public.user_roles ur
            join public.role_permissions rp on rp.role_id = ur.role_id
            where rp.resource = 'finance'
              and (rp.can_create = true or rp.can_approve = true or rp.can_update = true)
        """)).all()
    )

    # 2. Batch fetch tất cả phân công của các task node trong danh sách (1 truy vấn duy nhất).
    #    Hợp đồng chưa có bước bàn giao thì không có node nào để hỏi — bỏ qua.
    node_ids = [r["task_node_id"] for r in rows if r["task_node_id"]]
    node_assignee_map = {}
    if node_ids:
        assignments = db.execute(
            text("""
                select a.task_node_id, e.full_name, e.user_id, a.is_primary
                from public.task_node_assignments a
                join public.employees e on e.id = a.employee_id
                where a.task_node_id = any(:node_ids)
                  and a.assignment_status not in ('replaced','declined','cancelled')
                order by a.is_primary desc nulls last, a.created_at
            """),
            {"node_ids": node_ids}
        ).mappings().all()

        for a in assignments:
            nid = a["task_node_id"]
            # Người không thuộc nhóm kế toán/tài chính chính là bên phụ trách hồ sơ (người đi giao)
            if a["user_id"] not in finance_user_ids:
                if nid not in node_assignee_map:
                    node_assignee_map[nid] = a["full_name"]

    # 3. Batch fetch lịch sử các đợt thanh toán của từng hợp đồng
    contract_ids = [r["contract_id"] for r in rows if r["contract_id"]]
    contract_installments_map: dict[str, list[dict]] = {}
    if contract_ids:
        tx_rows = db.execute(
            text(f"""
                select id, contract_id, amount, transaction_date, status,
                       receipt_attachment_url, receipt_attachments,
                       payer_payee_name, payment_method, description, approved_at
                from public.cashflow_transactions
                where contract_id = any(:c_ids) and transaction_type in ({_INCOME_SQL})
                  and coalesce(status, '') not in ('Đã hủy', 'Từ chối')
                order by transaction_date desc, created_at desc
            """),
            {"c_ids": contract_ids}
        ).mappings().all()

        for tx in tx_rows:
            cid = tx["contract_id"]
            if cid not in contract_installments_map:
                contract_installments_map[cid] = []
            attachments = public_receipt_attachments(
                tx.get("receipt_attachments"),
                tx.get("receipt_attachment_url"),
            )
            item = dict(tx)
            item.update({
                "amount": float(tx["amount"] or 0),
                "is_approved": tx["status"] in APPROVED_TX_STATUSES,
                "receipt_attachments": attachments,
                "receipt_attachment_url": attachments[0]["url"] if attachments else None,
            })
            contract_installments_map[cid].append(item)

    handover_results = []
    for r in rows:
        remaining_amount = max(0.0, float(r["total_value"] or 0) - float(r["paid"] or 0))
        is_financially_settled = remaining_amount <= 0.009
        has_handover_debt_approval = bool(
            r.get("debt_request_id") or r.get("completion_override")
        )
        is_gate_open = r["dossier_status"] is None or r["dossier_status"] == "CLOSED"
        deliverer_name = node_assignee_map.get(r["task_node_id"])
        handover_results.append({
            **dict(r),
            "total_value": float(r["total_value"] or 0),
            "paid": float(r["paid"] or 0),
            "pending": float(r["pending"] or 0),
            "remaining": remaining_amount,
            "is_financially_settled": is_financially_settled,
            "has_handover_debt_approval": has_handover_debt_approval,
            "financial_status": (
                "settled_after_handover_override"
                if is_financially_settled and has_handover_debt_approval
                else "settled" if is_financially_settled
                else "outstanding_after_handover_override"
                if has_handover_debt_approval
                else "outstanding"
            ),
            "handover_debt_reason": (
                r.get("debt_request_reason") or r.get("completion_override_reason")
            ),
            "deliverer_name": deliverer_name,
            "is_delivered": bool(r.get("da_ban_giao") or r.get("delivered_at")),
            "can_deliver": False,
            "blocked_reason": None if is_gate_open else (
                f"Chờ {r['dossier_assignee'] or 'nhân viên pháp lý'} đóng hồ sơ nộp cơ quan"
            ),
            "installments": contract_installments_map.get(r["contract_id"], []),
        })
    return handover_results
