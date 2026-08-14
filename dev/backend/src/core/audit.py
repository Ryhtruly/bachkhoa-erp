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
    """Record an immutable audit log entry into the audit_log table."""
    valid_actor = None
    if actor_id:
        user_exists = db.query(User.id).filter(User.id == actor_id).first()
        if user_exists:
            valid_actor = actor_id
        else:
            logger.warning("Audit log actor_id '%s' not found in users table", actor_id)

    log_entry = AuditLog(
        actor_id=valid_actor,
        action=action,
        object_type=object_type,
        payload_json=payload or {},
    )
    db.add(log_entry)
    return log_entry
