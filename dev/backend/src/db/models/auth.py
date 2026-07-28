"""Core System & Security models: User, Role, UserRole, RolePermission, AuthToken, AuditLog, Notification."""

from src.db.models._base import *


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    email = Column(String, unique=True, index=True, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    role_name = Column(String, unique=True)

class UserRole(Base):
    __tablename__ = "user_roles"
    user_id = Column(String, ForeignKey("users.id"), primary_key=True)
    role_id = Column(Integer, ForeignKey("roles.id"), primary_key=True)

class RolePermission(Base):
    __tablename__ = "role_permissions"
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    resource = Column(String(50), primary_key=True)
    can_read = Column(Boolean, nullable=True, default=False)
    can_create = Column(Boolean, nullable=True, default=False)
    can_update = Column(Boolean, nullable=True, default=False)
    can_delete = Column(Boolean, nullable=True, default=False)
    can_approve = Column(Boolean, nullable=True, default=False)

class AuthToken(Base):
    __tablename__ = "auth_tokens"
    token = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"))
    expires_at = Column(DateTime(timezone=True))
    user_agent = Column(String, nullable=True)

class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    actor_id = Column(String, ForeignKey("users.id"), nullable=True)
    action = Column(String)
    object_type = Column(String)
    payload_json = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"))
    title = Column(String)
    content = Column(Text)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
