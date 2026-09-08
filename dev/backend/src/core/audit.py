import json
import logging
from typing import Any, Optional
from sqlalchemy.orm import Session
from src.db.models import AuditLog, User

logger = logging.getLogger(__name__)


def log_action(
    db: Session,
    actor_id: Optional[str],
    action: str,
    object_type: str,
    payload: Optional[dict[str, Any]] = None,
) -> AuditLog:
    """Record an immutable audit log entry into the audit_log table.

    ``actor_id`` có khoá ngoại tới ``users`` nên actor tra không ra thì cột buộc
    phải để null — không cãi được. Nhưng để null RỖNG là đánh mất dấu người thao
    tác, mà đây đúng là những việc cần truy trách nhiệm nhất: duyệt thu chi, khoá
    bảng lương, xoá nợ. Nên id vẫn được giữ lại trong payload.

    Null KHÔNG kèm dấu = sự kiện hệ thống thật sự (người gọi không truyền actor).
    Null CÓ kèm ``actor_id_missing`` = có người thao tác nhưng tra không ra.

    Đường chạy bình thường (actor hợp lệ) không đổi một byte nào.
    """
    valid_actor = None
    actor_missing = None
    if actor_id:
        user_exists = db.query(User.id).filter(User.id == actor_id).first()
        if user_exists:
            valid_actor = actor_id
        else:
            actor_missing = actor_id
            logger.warning("Audit log actor_id '%s' not found in users table", actor_id)

    # Sao chép chứ không sửa tại chỗ: dict là của người gọi, họ còn dùng tiếp.
    payload_json = dict(payload or {})
    if actor_missing:
        payload_json["actor_id_missing"] = actor_missing

    log_entry = AuditLog(
        actor_id=valid_actor,
        action=action,
        object_type=object_type,
        payload_json=payload_json,
    )
    db.add(log_entry)
    return log_entry
