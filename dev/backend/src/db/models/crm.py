"""CRM & Sales models: Customer, LeadPipeline, Contract, ZaloInteraction, ServiceLine."""

from src.db.models._base import *


class Customer(Base):
    __tablename__ = "customers"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    full_name = Column(String)
    phone = Column(String, unique=True, index=True)
    address = Column(String, nullable=True)
    tax_id = Column(String, nullable=True)
    customer_group = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

class LeadPipeline(Base):
    __tablename__ = "leads_pipeline"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    customer_id = Column(String, ForeignKey("customers.id"))
    source = Column(String, nullable=True)
    requirements = Column(Text, nullable=True)
    status = Column(String)
    assigned_to = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

class Contract(Base):
    __tablename__ = "contracts"
    id = Column(String, primary_key=True) # e.g. 128/BK-2026
    customer_id = Column(String, ForeignKey("customers.id"))
    lead_id = Column(String, ForeignKey("leads_pipeline.id"), nullable=True)
    service_type = Column(String, nullable=True)
    total_value = Column(Numeric, nullable=True)
    date_signed = Column(Date, nullable=True)
    file_link = Column(String, nullable=True)
    status = Column(String, nullable=True)
    service_location = Column(String, nullable=True)
    service_area = Column(Numeric, nullable=True)
    sale_id = Column(String, nullable=True)
    service_package = Column(String, nullable=True)
    document_type = Column(String, nullable=True)
    has_technical = Column(String, nullable=True)
    addons = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

class ZaloInteraction(Base):
    __tablename__ = "zalo_interactions"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    zalo_user_id = Column(String, nullable=True)
    customer_id = Column(String, ForeignKey("customers.id"), nullable=True)
    message_content = Column(Text, nullable=True)
    intent = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

class ServiceLine(Base):
    __tablename__ = "service_lines"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    contract_id = Column(String, ForeignKey("contracts.id"), nullable=True)
    service_package = Column(String, nullable=True)
    service_type = Column(String, nullable=True)
    target_property = Column(String, nullable=True)
    price = Column(Numeric, nullable=True)
