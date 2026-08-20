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
              coalesce(sum(amount) filter (where status in ({_APPROVED_SQL})), 0) as da_duyet,
              coalesce(sum(amount) filter (where status in ('Chờ duyệt','PENDING')), 0) as cho_duyet
            from public.cashflow_transactions
            where contract_id = :c and transaction_type in ({_INCOME_SQL})
        """),
        {"c": contract_id},
    ).mappings().first()

    paid = float(row["da_duyet"] or 0)
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
        "pending_amount": float(row["cho_duyet"] or 0),
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
              and coalesce(status, '') not in ('Đã hủy', 'Từ chối')
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

    da_dong = dossier["status"] == "CLOSED"
    return {
        "required": True,
        "is_open": da_dong,
        "dossier_id": dossier["id"],
        "dossier_status": dossier["status"],
        "reason": None if da_dong else "Chờ đóng hồ sơ nộp cơ quan",
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
    lan_a = exec_data.get("handover") or {}
    debt = debt_summary(db, node["contract_id"], node["total_value"])
    gate = submission_gate(db, node)

    lan_a_xong = bool(lan_a.get("delivered_at"))
    node_da_dong = node["status"] in _NODE_FINISHED

    # Ai đang xem quyết định họ thấy nút nào.
    from src.core.auth import check_user_permission
    from src.db.models import User
    from src.dossiers.actor_guard import employee_of, is_assigned_to_node

    duoc_phan_cong = False
    duoc_thu_tien = False
    if user_id:
        nv = employee_of(db, user_id)
        duoc_phan_cong = bool(nv) and is_assigned_to_node(
            db, task_node_id=task_node_id, employee_id=nv["id"]
        )
        u = db.query(User).filter(User.id == user_id).first()
        duoc_thu_tien = bool(u) and check_user_permission(db, u, "finance", "create")

    ben_ho_so, ben_tien = _chia_vai_ban_giao(db, task_node_id)
    nguoi_thu_tien = ben_tien[0]["full_name"] if ben_tien else None
    # Chỉ còn mỗi kế toán trong node thì đừng bịa ra người giao — để trống, người
    # dùng thấy ngay là node thiếu người phụ trách hồ sơ.
    nguoi_giao_hien_vat = ben_ho_so[0]["full_name"] if ben_ho_so else None
    nguoi_giao_user_ids = {r["user_id"] for r in ben_ho_so if r["user_id"]}

    return {
        "task_node_id": task_node_id,
        "node_code": node["node_code"],
        "node_status": node["status"],
        "is_finished": node_da_dong,
        "contract_id": node["contract_id"],
        "customer_name": node["customer_name"],
        "service_line_name": node["service_type"],
        "gate": gate,
        "debt": debt,
        "installments": installments(db, node["contract_id"]),
        "lane_a": {
            "label": "Giao hồ sơ cho khách",
            "desc": "Nhận kết quả, giao tài liệu, lấy chữ ký xác nhận",
            "actor": nguoi_giao_hien_vat,
            "done": lan_a_xong,
            "delivered_at": lan_a.get("delivered_at"),
            "delivered_by": lan_a.get("delivered_by"),
            "acknowledged_debt": lan_a.get("acknowledged_debt", False),
            "remaining_at_delivery": lan_a.get("remaining_at_delivery"),
            # Phải là người được phân công LO PHẦN HỒ SƠ. Kế toán cũng có tên
            # trong node này nhưng việc của họ là thu tiền — người mang hồ sơ
            # đến cho khách và lấy chữ ký là người khác.
            "can_do": (not lan_a_xong) and gate["is_open"] and (not node_da_dong)
                      and duoc_phan_cong and (user_id in nguoi_giao_user_ids),
        },
        "lane_b": {
            "label": "Thu đủ tiền hợp đồng",
            "desc": "Tự đánh dấu khi khách trả đủ — không ai tick tay được",
            # TÍNH SỐNG, không ai tick tay được.
            "done": debt["is_settled"],
            # Tiền là việc của KẾ TOÁN. Pháp lý, đo vẽ không có quyền finance nên
            # không thấy nút này — thay vì thấy rồi bấm vào mới bị chặn.
            # Không ràng vào trạng thái node: nợ thuộc về hợp đồng, nên bước bàn
            # giao đã đóng mà khách còn khất thì kế toán vẫn ghi nhận được.
            "can_record_payment": duoc_thu_tien and not debt["is_settled"],
            "actor": nguoi_thu_tien,
        },
        # Node chỉ đóng được khi CẢ HAI làn xong.
        "can_close": lan_a_xong and debt["is_settled"] and not node_da_dong,
        "blocked_reason": _blocked_reason(gate, lan_a_xong, debt),
    }


def _blocked_reason(gate: dict, lan_a_xong: bool, debt: dict) -> str | None:
    if not gate["is_open"]:
        return gate["reason"]
    if not lan_a_xong:
        return "Chưa giao hồ sơ cho khách"
    if not debt["is_settled"]:
        return f"Còn thiếu {debt['remaining']:,.0f}₫ chưa thu"
    return None


# ══════════════════════════════════════════════════════════════════
# Làn A — bàn giao hiện vật
# ══════════════════════════════════════════════════════════════════

def _chia_vai_ban_giao(db: Session, task_node_id: str) -> tuple[list, list]:
    """Chia người được phân công vào node bàn giao thành hai bên: lo hồ sơ / lo tiền.

    Tối ưu hóa: 1 câu query SQL duy nhất kết hợp quyền finance.create,
    loại bỏ hoàn toàn vòng lặp N+1 queries.
    """
    phan_cong = db.execute(
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

    ben_tien, ben_ho_so = [], []
    for row in phan_cong:
        (ben_tien if row["lo_tien"] else ben_ho_so).append(row)
    return ben_ho_so, ben_tien


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
    ben_ho_so, _ = _chia_vai_ban_giao(db, task_node_id)
    duoc_giao = {r["user_id"] for r in ben_ho_so if r["user_id"]}
    if actor_id not in duoc_giao:
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
             "con_thieu": debt["remaining"],
             "da_xac_nhan_van_giao": bool(acknowledged_debt and not debt["is_settled"]),
             "ghi_chu": note,
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
    """Mở node kế tiếp theo đường chuyển bước, không cần chờ node này nghiệm thu."""
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
                          "ly_do": "Đã bàn giao tài liệu cho khách"}, ensure_ascii=False)},
    )
    return nxt["id"]


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
    """Ghi nhận một đợt khách đưa tiền, mở từ node bàn giao.

    Node ở đây chỉ là CHỖ MỞ MÀN HÌNH, không phải điều kiện thu tiền: khoản nợ
    thuộc về hợp đồng, nên chốt xong bước bàn giao rồi khách mới trả nốt vẫn ghi
    nhận được. Trạng thái node chỉ dùng để ghi vào nhật ký.
    """
    node = _node_or_404(db, task_node_id)
    if not node["contract_id"]:
        raise HTTPException(status_code=400, detail="Công việc này không gắn hợp đồng nào")

    return _ghi_nhan_thu_tien(
        db,
        contract_id=node["contract_id"],
        amount=amount,
        receipt_attachments=receipt_attachments,
        payment_method=payment_method,
        payer_name=payer_name or node["customer_name"],
        note=note,
        actor_id=actor_id,
        mo_ta_mac_dinh=f"Thu tiền tại bước bàn giao — {node['service_type'] or ''}".strip(),
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
    """Ghi nhận đợt thu tiền thẳng theo hợp đồng, không cần đứng ở bước nào.

    Tiền là quan hệ giữa công ty và khách, không phải thuộc tính của một bước
    trong quy trình. Khách trả trước lúc quy trình chưa chạy tới bàn giao, hoặc
    trả nốt sau khi hồ sơ đã giao xong — kế toán đều phải ghi được ngay.
    """
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
        raise HTTPException(status_code=404, detail="Không tìm thấy hợp đồng")

    return _ghi_nhan_thu_tien(
        db,
        contract_id=contract_id,
        amount=amount,
        receipt_attachments=receipt_attachments,
        payment_method=payment_method,
        payer_name=payer_name or row["customer_name"],
        note=note,
        actor_id=actor_id,
        mo_ta_mac_dinh=f"Thu tiền hợp đồng {contract_id}",
        total_value=row["total_value"],
    )


def _ghi_nhan_thu_tien(
    db: Session,
    *,
    contract_id: str,
    amount: float,
    receipt_attachments: list[dict],
    payment_method: str,
    payer_name: str | None,
    note: str | None,
    actor_id: str,
    mo_ta_mac_dinh: str,
    total_value,
    task_node_id: str | None = None,
    node_status: str | None = None,
) -> dict:
    """Lõi ghi nhận một đợt khách đưa tiền.

    Phiếu tạo ra ở trạng thái **Chờ duyệt** — công nợ chỉ giảm khi giám đốc duyệt.
    Ảnh bill là bắt buộc: không có minh chứng thì con số chỉ là lời khai.
    """
    if amount is None or float(amount) <= 0:
        raise HTTPException(status_code=400, detail="Số tiền phải lớn hơn 0")
    if not receipt_attachments:
        raise HTTPException(status_code=400, detail="Bắt buộc đính ảnh bill/biên lai")

    debt = debt_summary(db, contract_id, total_value)
    con_lai_sau_duyet = debt["remaining"] - debt["pending_amount"]
    if float(amount) > con_lai_sau_duyet + 0.009:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Số tiền vượt quá công nợ còn lại. Còn thiếu {debt['remaining']:,.0f}₫"
                + (f", trong đó {debt['pending_amount']:,.0f}₫ đang chờ duyệt."
                   if debt["pending_amount"] else ".")
            ),
        )

    from src.finance.repository import FinanceRepository

    from datetime import date

    hom_nay = date.today()
    new_id = FinanceRepository.generate_voucher_id("Thu", db, hom_nay)
    first_receipt_url = f"/api/handover/payment-receipts/{receipt_attachments[0]['id']}"
    db.execute(
        text("""
            insert into public.cashflow_transactions
                (id, contract_id, transaction_type, amount, category_code,
                 payer_payee_name, payment_method, transaction_date, document_number,
                 description, receipt_attachment_url, receipt_attachments,
                 created_by_user_id, status, scope, created_at)
            values
                (:id, :contract_id, 'Thu', :amount, 'Thu tiền hợp đồng',
                 :payer, :method, :ngay, :id,
                 :mo_ta, :bill, cast(:attachments as jsonb),
                 :actor, 'Chờ duyệt', 'Công ty', now())
        """),
        {
            "id": new_id, "contract_id": contract_id, "amount": float(amount),
            "payer": payer_name, "method": payment_method or "Tiền mặt",
            "ngay": hom_nay,
            "mo_ta": note or mo_ta_mac_dinh,
            "bill": first_receipt_url,
            "attachments": json.dumps(receipt_attachments, ensure_ascii=False),
            "actor": actor_id,
        },
    )

    # Nhật ký gắn vào bước bàn giao khi có. Thu thẳng theo hợp đồng thì không có
    # node nào để gắn — phiếu thu tự nó đã là dấu vết.
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
                 "so_tien": float(amount),
                 "receipt_count": len(receipt_attachments),
             }, ensure_ascii=False)},
        )

    return {
        "voucher_id": new_id,
        "amount": float(amount),
        "status": "Chờ duyệt",
        "receipt_count": len(receipt_attachments),
    }


def tai_lieu_ban_giao(db: Session, task_node_id: str) -> dict:
    """Gom mọi tài liệu của hạng mục để giao cho khách.

    Tài liệu nằm rải ở bốn chỗ khác nhau — file hợp đồng, bộ hồ sơ pháp lý, thư
    mục bản vẽ, và minh chứng nhân viên nộp ở từng bước. Nhân viên đang phải tự
    nhớ và mở từng chỗ, sót một cái là khách phải quay lại.

    Chỉ liệt kê; việc đóng gói và kiểm tra quyền do tầng route lo.
    """
    node = _node_or_404(db, task_node_id)
    sl_id = node.get("service_line_id")

    muc: list[dict] = []

    hop_dong = db.execute(
        text("select file_link from public.contracts where id = :c"),
        {"c": node["contract_id"]},
    ).scalar()
    if hop_dong:
        muc.append({"nhom": "Hop dong", "ten": "Hop dong da ky", "url": hop_dong})

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
            muc.append({"nhom": "Ho so phap ly", "ten": "Bo ho so nop co quan", "url": r["dossier_file_url"]})
        if r["linked_survey_folder_url"]:
            muc.append({"nhom": "Ban ve", "ten": "Thu muc ban ve do dac", "url": r["linked_survey_folder_url"]})

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
                muc.append({
                    "nhom": f"Minh chung {r['node_code']}",
                    "ten": f.get("name") or r["checklist_name"],
                    "url": f["url"],
                })

    debt = debt_summary(db, node["contract_id"], node["total_value"])
    # Giao hồ sơ cho khách = việc trong checklist của bước, chốt bằng NGHIỆM THU.
    # Nên mở nút tải khi đã thu đủ tiền, HOẶC khi bước bàn giao đã nghiệm thu xong.
    da_nghiem_thu = node["status"] == "accepted"
    mo_tai = bool(debt["is_settled"] or da_nghiem_thu)
    return {
        "contract_id": node["contract_id"],
        "customer_name": node["customer_name"],
        "items": muc,
        "debt": debt,
        "can_download": mo_tai,
        "blocked_reason": None if mo_tai
            else f"Còn thiếu {debt['remaining']:,.0f}₫ — thu đủ tiền hoặc nghiệm thu xong bước bàn giao thì mới tải được bộ hồ sơ gốc",
    }


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

    ket_qua = []
    for r in rows:
        con_lai = max(0.0, float(r["total_value"] or 0) - float(r["paid"] or 0))
        cua_mo = r["dossier_status"] is None or r["dossier_status"] == "CLOSED"
        nguoi_giao = node_assignee_map.get(r["task_node_id"])
        ket_qua.append({
            **dict(r),
            "total_value": float(r["total_value"] or 0),
            "paid": float(r["paid"] or 0),
            "pending": float(r["pending"] or 0),
            "remaining": con_lai,
            "nguoi_giao": nguoi_giao,
            "can_deliver": False,
            "blocked_reason": None if cua_mo else (
                f"Chờ {r['dossier_assignee'] or 'nhân viên pháp lý'} đóng hồ sơ nộp cơ quan"
            ),
        })
    return ket_qua
