"""Máy trạng thái hồ sơ pháp lý — node K06 "Nộp & theo dõi hồ sơ".

Đây là node đặc biệt vì THỜI GIAN: nộp xong phải chờ cơ quan nhà nước hàng tuần,
có thể bị trả về, nộp lại nhiều lần, rồi mới đóng được. Mọi node khác chỉ đi một
chiều: bắt đầu → làm → nộp nghiệm thu → duyệt.

    ASSIGNED ──Tiếp nhận──▶ PROCESSING ──Tạm dừng──▶ PENDING
                                ▲                       │
                                └──────Tiếp tục─────────┘
                                │
                            Đóng hồ sơ
                                ▼
                             CLOSED  ──▶ mở khoá node Bàn giao

Ba nguyên tắc:

1. **Chặn bước nhảy không hợp lệ.** Không cho đóng hồ sơ chưa ai tiếp nhận.
2. **Mỗi lần chuyển ghi một dòng nhật ký.** Không có nhật ký thì không tính được
   KPI có đóng băng, và cũng không ai biết hồ sơ tắc ở đâu.
3. **Thời gian nằm PENDING bị trừ khỏi KPI.** Nhân viên không chịu trách nhiệm cho
   việc cơ quan nhà nước ngâm hồ sơ.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

# ── Trạng thái ────────────────────────────────────────────────────
ASSIGNED = "ASSIGNED"
PROCESSING = "PROCESSING"
PENDING = "PENDING"
CLOSED = "CLOSED"

STATUS_LABELS = {
    ASSIGNED: "Chờ tiếp nhận",
    PROCESSING: "Đang xử lý",
    PENDING: "Tạm dừng",
    CLOSED: "Đã đóng",
}

# ── Lý do tạm dừng ────────────────────────────────────────────────
AGENCY = "AGENCY"
SURVEYOR = "SURVEYOR"
INTERNAL = "INTERNAL"

PAUSE_REASONS = {
    AGENCY: "Chờ cơ quan — đang thẩm định, ra thông báo thuế, đòi bổ sung giấy tờ",
    SURVEYOR: "Chờ đo vẽ — bản vẽ sai ranh, phải đo lại",
    INTERNAL: "Chờ nội bộ — chờ sếp ký, chờ khách đóng thuế",
}

# ── Kết quả đóng hồ sơ ────────────────────────────────────────────
DONE = "DONE"
REJECTED = "REJECTED"

CLOSE_RESULTS = {
    DONE: "Lấy được kết quả",
    REJECTED: "Bị bác hẳn",
}

# ── Hành động ─────────────────────────────────────────────────────
ACCEPT = "accept"
PAUSE = "pause"
RESUME = "resume"
CLOSE = "close"

ACTION_LABELS = {
    ACCEPT: "Tiếp nhận",
    PAUSE: "Tạm dừng",
    RESUME: "Tiếp tục",
    CLOSE: "Đóng hồ sơ",
}

# Chuyển từ đâu sang đâu. Không có trong bảng này là không hợp lệ.
_TRANSITIONS = {
    ACCEPT: ({ASSIGNED}, PROCESSING),
    PAUSE: ({PROCESSING}, PENDING),
    RESUME: ({PENDING}, PROCESSING),
    CLOSE: ({PROCESSING}, CLOSED),
}


def available_actions(status: str | None) -> list[str]:
    """Từ trạng thái hiện tại thì bấm được nút nào."""
    return [a for a, (froms, _) in _TRANSITIONS.items() if status in froms]


def _validate(action: str, current: str, sub_status: str | None) -> str:
    if action not in _TRANSITIONS:
        raise HTTPException(status_code=400, detail=f"Hành động không hợp lệ: {action}")

    froms, to = _TRANSITIONS[action]
    if current not in froms:
        allowed_actions_str = ", ".join(ACTION_LABELS[a] for a in available_actions(current)) or "không có"
        raise HTTPException(
            status_code=409,
            detail=(
                f"Hồ sơ đang ở '{STATUS_LABELS.get(current, current)}' nên không "
                f"{ACTION_LABELS[action].lower()} được. Hiện chỉ làm được: {allowed_actions_str}."
            ),
        )

    if action == PAUSE and sub_status not in PAUSE_REASONS:
        raise HTTPException(
            status_code=400,
            detail=f"Tạm dừng phải chọn lý do, một trong: {list(PAUSE_REASONS)}",
        )
    if action == CLOSE and sub_status not in CLOSE_RESULTS:
        raise HTTPException(
            status_code=400,
            detail=f"Đóng hồ sơ phải chọn kết quả, một trong: {list(CLOSE_RESULTS)}",
        )
    return to


def get_dossier(db: Session, dossier_id: str) -> dict:
    row = db.execute(
        text("select * from public.legal_dossiers where id = :i"), {"i": dossier_id}
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ pháp lý")
    return dict(row)


def apply_transition(
    db: Session,
    dossier_id: str,
    action: str,
    *,
    sub_status: str | None = None,
    note: str | None = None,
    actor_user_id: str | None = None,
) -> dict:
    """Chuyển trạng thái hồ sơ, ghi nhật ký, và cộng dồn thời gian tạm dừng."""
    dossier = get_dossier(db, dossier_id)
    current = dossier["status"]
    new_status = _validate(action, current, sub_status)

    # Mốc thời gian cho KPI. Quãng nằm PENDING bị trừ khỏi giờ xử lý.
    #
    # Dùng clock_timestamp() chứ KHÔNG dùng now(): trong Postgres, now() là thời
    # điểm MỞ GIAO DỊCH và đứng yên suốt giao dịch đó. Đo khoảng thời gian bằng
    # now() thì một giao dịch mở sẵn từ trước sẽ cho ra 0 giây — KPI luôn bằng 0
    # mà không ai biết vì sao.
    _ACCUMULATED_PAUSE_SQL = (
        "total_pending_seconds = total_pending_seconds + "
        "coalesce(extract(epoch from (clock_timestamp() - pending_since))::bigint, 0)"
    )

    sets = ["status = :status", "sub_status = :sub_status", "updated_at = clock_timestamp()"]
    params = {"i": dossier_id, "status": new_status, "sub_status": sub_status}

    if action == ACCEPT and not dossier["first_accepted_at"]:
        sets.append("first_accepted_at = clock_timestamp()")
    elif action == PAUSE:
        sets.append("pending_since = clock_timestamp()")
    elif action == RESUME:
        sets.append(_ACCUMULATED_PAUSE_SQL)
        sets.append("pending_since = null")
    elif action == CLOSE:
        sets.append("closed_at = clock_timestamp()")
        sets.append("closed_note = :note")
        params["note"] = note
        # Đóng hồ sơ trong lúc đang tạm dừng thì vẫn phải chốt nốt quãng đó
        if current == PENDING:
            sets.append(_ACCUMULATED_PAUSE_SQL)
            sets.append("pending_since = null")

    db.execute(
        text(f"update public.legal_dossiers set {', '.join(sets)} where id = :i"), params
    )

    db.execute(
        text("""
            insert into public.legal_dossier_events
                (dossier_id, from_status, to_status, sub_status, note, actor_user_id)
            values (:d, :f, :t, :s, :n, :a)
        """),
        {"d": dossier_id, "f": current, "t": new_status,
         "s": sub_status, "n": note, "a": actor_user_id},
    )

    # Tạm dừng vì bản vẽ sai ranh -> đẩy ngược việc về bên đo vẽ
    reopened_survey = False
    if action == PAUSE and sub_status == SURVEYOR:
        reopened_survey = reopen_survey_work(db, dossier)

    return {
        "id": dossier_id,
        "from_status": current,
        "to_status": new_status,
        "sub_status": sub_status,
        "reopened_survey": reopened_survey,
    }


def reopen_survey_work(db: Session, dossier: dict) -> bool:
    """Mở lại việc đo vẽ của cùng hợp đồng để nhân viên đo lại.

    Node chuyển sang 'rework_required' — trạng thái này đã nằm sẵn trong truy vấn
    chuông báo của nhân viên, nên họ nhận thông báo mà không cần thêm cơ chế nào.
    """
    task_node_id = db.execute(
        text("""
            select s.task_node_id
            from public.survey_records s
            join public.task_nodes n on n.id = s.task_node_id
            where s.contract_id = :c
            order by n.created_at desc
            limit 1
        """),
        {"c": dossier["contract_id"]},
    ).scalar()
    if not task_node_id:
        return False

    db.execute(
        text("""
            update public.task_nodes
            set status = 'rework_required',
                notes = concat_ws(' | ', notes, :reason),
                updated_at = now()
            where id = :i and status not in ('cancelled', 'skipped')
        """),
        {"i": task_node_id, "reason": "Pháp lý trả về: bản vẽ cần chỉnh lại"},
    )
    return True


def elapsed_working_seconds(dossier: dict) -> int:
    """Giờ xử lý thực = tổng thời gian từ lúc tiếp nhận, TRỪ các quãng tạm dừng."""
    from datetime import datetime, timezone

    start = dossier.get("first_accepted_at")
    if not start:
        return 0
    end = dossier.get("closed_at") or datetime.now(timezone.utc)
    total = int((end - start).total_seconds())

    paused = int(dossier.get("total_pending_seconds") or 0)
    # Đang tạm dừng dở thì cộng nốt quãng chưa chốt
    if dossier.get("pending_since") and not dossier.get("closed_at"):
        paused += int((datetime.now(timezone.utc) - dossier["pending_since"]).total_seconds())

    return max(0, total - paused)
