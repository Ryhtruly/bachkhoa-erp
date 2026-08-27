import os
from sqlalchemy import Sequence
from src.db.models._base import *

_is_sqlite = (
    os.getenv("TEST_DATABASE_URL", "").startswith("sqlite")
    or os.getenv("DATABASE_URL", "").startswith("sqlite")
)

audit_log_id_seq = Sequence(
    "audit_log_id_seq",
    schema="public",
    metadata=Base.metadata,
)


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    email = Column(String, unique=True, index=True, nullable=True)
    is_active = Column(Boolean, default=True)
    invite_token_hash = Column(String, nullable=True)
    invite_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    email_verified = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    role_name = Column(String, unique=True)
    display_name = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    is_system = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

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


class PermissionResource(Base):
    __tablename__ = "permission_resources"
    code = Column(Text, primary_key=True)
    name = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=100)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)


class Permission(Base):
    __tablename__ = "permissions"
    code = Column(Text, primary_key=True)
    resource_code = Column(Text, ForeignKey("permission_resources.code", ondelete="CASCADE"), nullable=False)
    action_code = Column(Text, nullable=False)
    scope_code = Column(Text, nullable=False, default="all")
    name = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)


class RolePermissionGrant(Base):
    __tablename__ = "role_permission_grants"
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    permission_code = Column(Text, ForeignKey("permissions.code", ondelete="CASCADE"), primary_key=True)
    granted_by = Column(String, ForeignKey("users.id"), nullable=True)
    granted_at = Column(DateTime(timezone=True), default=get_utc_now)
    note = Column(Text, nullable=True)


class UserPermissionOverride(Base):
    __tablename__ = "user_permission_overrides"
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    permission_code = Column(Text, ForeignKey("permissions.code", ondelete="CASCADE"), primary_key=True)
    effect = Column(Text, nullable=False)
    reason = Column(Text, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)


class RoleScopeRule(Base):
    __tablename__ = "role_scope_rules"
    role_id = Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    resource_code = Column(Text, ForeignKey("permission_resources.code", ondelete="CASCADE"), primary_key=True)
    scope_code = Column(Text, primary_key=True)
    rules = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

class AuthToken(Base):
    __tablename__ = "auth_tokens"
    token = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"))
    expires_at = Column(DateTime(timezone=True))
    user_agent = Column(String, nullable=True)

class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(
        Integer().with_variant(BigInteger, "postgresql"),
        primary_key=True,
        autoincrement=True,
        server_default=audit_log_id_seq.next_value(),
    )
    actor_id = Column(String, ForeignKey("users.id"), nullable=True)
    action = Column(String)
    object_type = Column(String)
    # Đi cặp với object_type. Có trên live từ migration audit_log_object_id nhưng
    # model quên khai, nên mọi database dựng mới từ model đều thiếu cột này và
    # các câu INSERT có object_id lăn ra lỗi.
    object_id = Column(String, nullable=True)
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
