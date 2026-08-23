"""Node BÀN GIAO (K08) — cổng tài chính cuối cùng trước khi giao kết quả cho khách.

Node này đặc biệt vì TIỀN, khác K06 đặc biệt vì THỜI GIAN. Nó chia làm hai làn
chạy song song, hai người khác nhau lo:

    Làn A · HIỆN VẬT   NV phụ trách   nhận kết quả · bàn giao · lấy chữ ký khách
                                       ↳ xong thì MỞ KHOÁ node Lưu trữ
                                         và GIẢI PHÓNG tiền khoán ngay

    Làn B · TIỀN       Kế toán         ghi nhận từng đợt thu · đối chiếu công nợ
                                       ↳ xong thì ĐÓNG được node

Ba nguyên tắc rút từ thực tế công ty:

1. **Không chặn bàn giao khi còn nợ.** Có ca khách thiếu vài trăm nghìn mà hồ sơ
   phải giao gấp. Chặn cứng thì nhân viên tìm đường lách, còn tệ hơn. Thay vào đó
   hỏi xác nhận, cho giao, nhưng quy trình **treo ở "chưa hoàn thành"** cho tới khi
   thu đủ rồi **tự đóng**. Không ai phải ra quyết định miễn trừ cho từng ca.

2. **Tiền khoán bám vào làn A, không bám vào công nợ.** Nhân viên làm xong phần
   việc của họ rồi; khách chậm trả không phải lỗi của họ.

3. **Mục "thu đủ công nợ" TÍNH SỐNG, không ai tick tay.** Để kế toán tự tick thì
   cổng công nợ chỉ là hình thức. Nó đọc thẳng `receivables`, và chỉ đếm phiếu
   thu ĐÃ ĐƯỢC DUYỆT — nên gõ một phiếu khống cũng không mở được cổng.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.files.payment_receipts import public_receipt_attachments
from src.finance.services import APPROVED_TX_STATUSES, INCOME_TX_TYPES

# Trạng thái node coi như đã đóng — không thao tác được nữa.
_NODE_FINISHED = ("accepted", "cancelled", "skipped")

_APPROVED_SQL = "'" + "','".join(sorted(APPROVED_TX_STATUSES)) + "'"
_INCOME_SQL = "'" + "','".join(sorted(INCOME_TX_TYPES)) + "'"


def _node_or_404(db: Session, task_node_id: str) -> dict:
    row = db.execute(
        text("""
            select n.id, n.node_key, n.node_code, n.status, n.execution_data,
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

def debt_summary(db: Session, contract_id: str | None, total_value: float | None) -> dict:
    total = float(total_value or 0)
    if not contract_id:
        return {"contract_id": None, "total_value": total, "paid": 0.0,
                "remaining": total, "percent": 0, "is_settled": total <= 0,
                "pending_amount": 0.0}

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

    return {
        "contract_id": contract_id,
        "total_value": total,
        "paid": paid,
        "remaining": remaining,
        "percent": round(paid / total * 100) if total else 100,
        "is_settled": remaining <= 0.009 or (bool(c_ovr["completion_override"]) if c_ovr else False),
        "has_override": bool(c_ovr["completion_override"]) if c_ovr else False,
        "override_reason": c_ovr["completion_override_reason"] if c_ovr else None,
        # Tiền nhân viên đã gõ nhưng sếp CHƯA duyệt — hiện riêng để khỏi tưởng đã thu.
        "pending_amount": float(row["pending_amount"] or 0),
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
    debt = debt_summary(db, node["contract_id"], node["total_value"])
    gate = submission_gate(db, node)

    is_lane_a_done = bool(lane_a_data.get("delivered_at"))
    is_node_closed = node["status"] in _NODE_FINISHED

    # Ai đang xem quyết định họ thấy nút nào.
    from src.core.auth import check_user_permission
    from src.db.models import User
    from src.dossiers.actor_guard import employee_of, is_assigned_to_node

    is_assigned = False
    can_collect_payment = False
    if user_id:
        nv = employee_of(db, user_id)
        is_assigned = bool(nv) and is_assigned_to_node(
            db, task_node_id=task_node_id, employee_id=nv["id"]
        )
        u = db.query(User).filter(User.id == user_id).first()
        can_collect_payment = bool(u) and check_user_permission(db, u, "finance", "create")

    dossier_actors, finance_actors = _split_handover_roles(db, task_node_id)
    payment_collector_name = finance_actors[0]["full_name"] if finance_actors else None
    # Chỉ còn mỗi kế toán trong node thì đừng bịa ra người giao — để trống, người
    # dùng thấy ngay là node thiếu người phụ trách hồ sơ.
    dossier_deliverer_name = dossier_actors[0]["full_name"] if dossier_actors else None
    dossier_deliverer_user_ids = {r["user_id"] for r in dossier_actors if r["user_id"]}

    return {
        "task_node_id": task_node_id,
        "node_code": node["node_code"],
        "node_status": node["status"],
        "is_finished": is_node_closed,
        "contract_id": node["contract_id"],
        "customer_name": node["customer_name"],
        "service_line_name": node["service_type"],
        "gate": gate,
        "debt": debt,
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
            "can_do": (not is_lane_a_done) and gate["is_open"] and (not is_node_closed)
                      and is_assigned and (user_id in dossier_deliverer_user_ids),
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
        "can_close": is_lane_a_done and debt["is_settled"] and not is_node_closed,
        "blocked_reason": _blocked_reason(gate, is_lane_a_done, debt),
    }


def _blocked_reason(gate: dict, is_lane_a_done: bool, debt: dict) -> str | None:
    if not gate["is_open"]:
        return gate["reason"]
    if not is_lane_a_done:
        return "Chưa giao hồ sơ cho khách"
    if not debt["is_settled"]:
        return f"Còn thiếu {debt['remaining']:,.0f}₫ chưa thu"
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


def mark_delivered(
    db: Session, task_node_id: str, *, acknowledged_debt: bool, note: str | None, actor_id: str
) -> dict:
    """Xác nhận đã giao tài liệu cho khách.

    Còn nợ vẫn giao được, nhưng nhân viên phải bấm xác nhận và việc đó được ghi
    nhật ký — ai bấm, lúc nào, còn thiếu bao nhiêu.
    """
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

    exec_data = node["execution_data"] or {}
    if (exec_data.get("handover") or {}).get("delivered_at"):
        raise HTTPException(status_code=409, detail="Đã ghi nhận bàn giao trước đó")

    debt = debt_summary(db, node["contract_id"], node["total_value"])
    if not debt["is_settled"] and not acknowledged_debt:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Còn thiếu {debt['remaining']:,.0f}₫. Phải xác nhận vẫn giao "
                "tài liệu thì mới ghi nhận được."
            ),
        )

    exec_data["handover"] = {
        "delivered_at": datetime.now(timezone.utc).isoformat(),
        "delivered_by": actor_id,
        "acknowledged_debt": bool(acknowledged_debt and not debt["is_settled"]),
        "remaining_at_delivery": debt["remaining"],
        "note": note,
    }
    db.execute(
        text("update public.task_nodes set execution_data = cast(:d as jsonb), "
             "updated_at = now() where id = :i"),
        {"d": json.dumps(exec_data, ensure_ascii=False), "i": task_node_id},
    )

    db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            values (:i, 'HANDOVER_DELIVERED', :s, :s, :a, cast(:p as jsonb))
        """),
        {"i": task_node_id, "s": node["status"], "a": actor_id,
         "p": json.dumps({
             "remaining_amount": debt["remaining"],
             "is_delivery_acknowledged": bool(acknowledged_debt and not debt["is_settled"]),
             "note": note,
         }, ensure_ascii=False)},
    )

    # Xong làn A là mở khoá bước Lưu trữ ngay — việc nội bộ đó không liên quan
    # gì tới tiền, không có lý do gì bắt nó chờ khách trả nợ.
    unlocked = _unlock_next_node(db, node, actor_id)

    return {
        "task_node_id": task_node_id,
        "delivered": True,
        "acknowledged_debt": exec_data["handover"]["acknowledged_debt"],
        "remaining": debt["remaining"],
        "unlocked_node_id": unlocked,
    }


def _unlock_next_node(db: Session, node: dict, actor_id: str) -> str | None:
    node_def = node.get("node_def") or {}
    transitions = node_def.get("transitions") or {}
    next_key = transitions.get("COMPLETED") or (
        next(iter(transitions.values())) if len(transitions) == 1 else None
    )
    if not next_key:
        return None

    nxt = db.execute(
        text("""
            select id, status from public.task_nodes
            where workflow_instance_id = :w and node_key = :k
            for update
        """),
        {"w": node["workflow_instance_id"], "k": next_key},
    ).mappings().first()
    if not nxt or nxt["status"] != "pending":
        return None

    db.execute(
        text("update public.task_nodes set status = 'ready', updated_at = now() where id = :i"),
        {"i": nxt["id"]},
    )
    db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            values (:i, 'NODE_UNLOCKED', 'pending', 'ready', :a, cast(:p as jsonb))
        """),
        {"i": nxt["id"], "a": actor_id,
         "p": json.dumps({"unlocked_by_task_node_id": node["id"],
                          "reason": "Handover complete"}, ensure_ascii=False)},
    )
    return nxt["id"]


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
    """Mọi hợp đồng còn nợ — danh sách việc đi đòi tiền của kế toán.

    Trước đây danh sách này bám theo BƯỚC bàn giao: chỉ hiện hồ sơ đang đứng đúng
    ở bước đó. Hợp đồng vừa ký chưa chạy tới bước bàn giao, hợp đồng đã đóng bước
    bàn giao mà khách còn khất nợ, và hợp đồng có quy trình không khai bước bàn
    giao nào — cả ba đều biến mất khỏi màn hình, trong khi tiền vẫn còn nợ. Kế
    toán mở đúng màn thu công nợ của mình mà không thấy khoản phải đòi.

    Nay đi từ HỢP ĐỒNG: còn nợ thì còn nằm trong danh sách. Bước bàn giao (nếu
    có) chỉ là thông tin kèm theo — đã giao hàng chưa, ai là người giao, hồ sơ
    nộp cơ quan đã đóng chưa.
    """
    rows = db.execute(
        text(f"""
            select c.id as contract_id,
                   cu.full_name as customer_name,
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
              and coalesce(c.total_value, 0) - coalesce(paid_tx.paid_amount, 0) > 0.009
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
        is_gate_open = r["dossier_status"] is None or r["dossier_status"] == "CLOSED"
        deliverer_name = node_assignee_map.get(r["task_node_id"])
        handover_results.append({
            **dict(r),
            "total_value": float(r["total_value"] or 0),
            "paid": float(r["paid"] or 0),
            "pending": float(r["pending"] or 0),
            "remaining": remaining_amount,
            "deliverer_name": deliverer_name,
            "is_delivered": bool(r.get("da_ban_giao") or r.get("delivered_at")),
            "can_deliver": False,
            "blocked_reason": None if is_gate_open else (
                f"Chờ {r['dossier_assignee'] or 'nhân viên pháp lý'} đóng hồ sơ nộp cơ quan"
            ),
            "installments": contract_installments_map.get(r["contract_id"], []),
        })
    return handover_results
