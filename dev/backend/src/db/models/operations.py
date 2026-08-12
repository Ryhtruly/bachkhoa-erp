"""Production & Operations models still used by the legacy application paths."""

from src.db.models._base import *


class TaskType(Base):
    __tablename__ = "task_types"
    id = Column(String, primary_key=True, default=lambda: f"tt_{uuid.uuid4().hex[:10]}")
    name = Column(String(100), unique=True, nullable=True)
    service_package_id = Column(String, ForeignKey("service_packages.id"), nullable=True)


class ServicePackage(Base):
    __tablename__ = "service_packages"
    id = Column(String, primary_key=True, default=lambda: f"sp_{uuid.uuid4().hex[:10]}")
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    display_order = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=True, default=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
