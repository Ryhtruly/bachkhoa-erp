"""Ai được thao tác trên một công việc — quy tắc dùng chung.

Nguyên tắc đã chốt với khách:

    **Giám đốc DUYỆT kết quả, không tự làm việc thay nhân viên.**

Ông ấy bấm *Duyệt đạt* / *Cần làm lại*, chứ không bấm *Tiếp nhận hồ sơ* hộ ai.
Trước đây bộ 4 nút vòng đời hồ sơ nằm ngay trong Workflow Designer — màn hình của
giám đốc — nên ông ấy lái được cả vòng đời pháp lý. Sai vai.

Nhưng thực tế vẫn có ca cần can thiệp: nhân viên nghỉ đột xuất, hồ sơ kẹt cả tuần.
Nên có **một lối riêng**, không lẫn vào bộ nút thường:

    · Người được phân công  →  thao tác bình thường
    · Giám đốc               →  phải bấm nút "Xử lý thay", BẮT BUỘC ghi lý do,
                                nhật ký ghi rõ đã làm thay ai

Chặn ở **backend**, không chỉ ẩn nút: ai biết đường dẫn API vẫn gọi thẳng được.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

# Lý do xử lý thay phải đủ dài để người đọc sau còn hiểu, không phải gõ cho xong.
_MIN_REASON_LEN = 10


def employee_of(db: Session, user_id: str) -> dict | None:
    row = db.execute(
        text("""
            select id, full_name from employees
            where user_id = :u and is_active is not false
            limit 1
        """),
        {"u": user_id},
    ).mappings().first()
    return dict(row) if row else None


def is_director(db: Session, user_id: str) -> bool:
    """Giám đốc = tài khoản admin hoặc có vai trò admin/director."""
    return db.execute(
        text("""
            select 1 from users u
            left join user_roles ur on ur.user_id = u.id
            left join roles r on r.id = ur.role_id
            where u.id = :u and (lower(u.username) = 'admin' or lower(r.role_name) in ('admin', 'director', 'giam_doc', 'giám đốc'))
            limit 1
        """),
        {"u": user_id},
    ).first() is not None


def is_assigned_to_node(db: Session, *, task_node_id: str, employee_id: str) -> bool:
    return db.execute(
        text("""
            select 1 from task_node_assignments
            where task_node_id = :n and employee_id = :e
              and assignment_status not in ('replaced', 'declined', 'cancelled')
            limit 1
        """),
        {"n": task_node_id, "e": employee_id},
    ).first() is not None


def assert_can_act_on_node(
    db: Session,
    *,
    task_node_id: str | None,
    user_id: str,
    on_behalf_reason: str | None = None,
    action_description: str = "thao tác trên công việc này",
) -> dict:
    """Chặn thao tác nếu không phải người được phân công.

    Trả về mô tả người thực hiện để nơi gọi ghi vào nhật ký.

    Giám đốc muốn làm thay thì phải truyền `on_behalf_reason` — tức là ở giao diện
    họ đã bấm đúng nút "Xử lý thay" và điền lý do, chứ không phải vô tình bấm
    nhầm bộ nút của nhân viên.
    """
    nv = employee_of(db, user_id)
    if task_node_id and nv and is_assigned_to_node(db, task_node_id=task_node_id, employee_id=nv["id"]):
        return {"on_behalf": False, "actor_employee_id": nv["id"], "reason": None}

    if not is_director(db, user_id):
        raise HTTPException(
            status_code=403,
            detail=f"Chỉ người được phân công mới {action_description}.",
        )

    # Tới đây: là giám đốc nhưng không được phân công -> phải đi lối "xử lý thay"
    cleaned_reason = (on_behalf_reason or "").strip()
    if len(cleaned_reason) < _MIN_REASON_LEN:
        raise HTTPException(
            status_code=403,
            detail=(
                "Bạn không được phân công cho công việc này. Muốn xử lý thay nhân viên "
                f"thì phải ghi lý do (tối thiểu {_MIN_REASON_LEN} ký tự)."
            ),
        )

    return {
        "on_behalf": True,
        "actor_employee_id": nv["id"] if nv else None,
        "reason": cleaned_reason,
    }


def format_on_behalf_note(actor: dict, note: str | None) -> str | None:
    """Ghép ghi chú của người dùng với dấu vết xử lý thay, để nhật ký tự nói ra."""
    if not actor.get("on_behalf"):
        return note
    audit_trace = f"[Giám đốc xử lý thay] {actor['reason']}"
    return f"{note} · {audit_trace}" if note else audit_trace
