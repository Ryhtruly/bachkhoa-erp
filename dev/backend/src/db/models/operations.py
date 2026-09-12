"""Production & Operations models still used by the legacy application paths."""

from src.db.models._base import *


class TaskType(Base):
    __tablename__ = "task_types"
    id = Column(String, primary_key=True, default=lambda: f"tt_{uuid.uuid4().hex[:10]}")
    name = Column(String(100), unique=True, nullable=True)
    # Mã ổn định để nối bằng khoá, không phụ thuộc tên tiếng Việt (SV_/LG_/CP_).
    code = Column(String, unique=True, nullable=True)
    service_package_id = Column(String, ForeignKey("service_packages.id"), nullable=True)


class ServicePackage(Base):
    __tablename__ = "service_packages"
    id = Column(String, primary_key=True, default=lambda: f"sp_{uuid.uuid4().hex[:10]}")
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    display_order = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=True, default=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)


class WorkItem(Base):
    """Reusable piece-rate work-item catalog entry.

    The workflow tables reference this catalog by id.  Deactivation is
    intentionally represented by ``is_active`` so historical assignments and
    entitlements remain readable and cannot be physically removed by mistake.
    """

    __tablename__ = "work_items"
    id = Column(String(50), primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    department_id = Column(String(50), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    output_definition = Column(Text, nullable=True)
    default_unit = Column(String, nullable=False, default="job")
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(String(50), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now, nullable=False)


class WorkItemRate(Base):
    """Effective-dated piece-rate version owned by one work item."""

    __tablename__ = "work_item_rates"
    id = Column(String(50), primary_key=True, default=lambda: str(uuid.uuid4()))
    work_item_id = Column(String(50), ForeignKey("work_items.id", ondelete="RESTRICT"), nullable=False)
    role_code = Column(String, nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date, nullable=True)
    status = Column(String(20), nullable=False, default="draft")
    approved_by = Column(String(50), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    approval_source = Column(String, nullable=False, default="manual")
    source_note = Column(Text, nullable=True)
    created_by = Column(String(50), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)
