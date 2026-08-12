"""CRM & Sales models: Customer, LeadPipeline, Contract, ZaloInteraction, ServiceLine."""

from src.db.models._base import *


class Customer(Base):
    __tablename__ = "customers"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    customer_type = Column(String, nullable=False, default="individual")
    full_name = Column(String)
    phone = Column(String, unique=True, index=True)
    address = Column(String, nullable=True)
    tax_id = Column(String, nullable=True)
    preferred_contact_channel = Column(String, nullable=True)
    id_card_number = Column(String, nullable=True)
    id_card_date = Column(Date, nullable=True)
    id_card_place = Column(String, nullable=True)
    email = Column(String, nullable=True)
    zalo_phone = Column(String, nullable=True)
    representative_name = Column(String, nullable=True)
    representative_role = Column(String, nullable=True)
    source_channel = Column(String, nullable=True)
    source_reference = Column(JSONB, nullable=True, default=dict)
    data_quality_status = Column(String, nullable=True, default="unverified")
    identity_verified_at = Column(DateTime(timezone=True), nullable=True)
    identity_verified_by = Column(String, ForeignKey("users.id"), nullable=True)
    customer_group = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)


class CustomerIntakeSubmission(Base):
    __tablename__ = "customer_intake_submissions"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    source_channel = Column(String, nullable=False, default="google_form")
    google_form_id = Column(Text, nullable=True)
    google_response_id = Column(Text, nullable=True)
    sheet_id = Column(Text, nullable=True)
    worksheet_name = Column(Text, nullable=True)
    sheet_row_number = Column(Integer, nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    raw_payload = Column(JSONB, nullable=False, default=dict)
    normalized_payload = Column(JSONB, nullable=False, default=dict)
    validation_errors = Column(JSONB, nullable=False, default=list)
    status = Column(String, nullable=False, default="new")
    linked_customer_id = Column(String, ForeignKey("customers.id"), nullable=True)
    linked_lead_id = Column(String, ForeignKey("leads_pipeline.id"), nullable=True)
    linked_contract_id = Column(String, ForeignKey("contracts.id"), nullable=True)
    linked_service_line_id = Column(String, ForeignKey("service_lines.id"), nullable=True)
    processed_by = Column(String, ForeignKey("users.id"), nullable=True)
    processed_at = Column(DateTime(timezone=True), nullable=True)
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
    effective_date = Column(Date, nullable=True)
    signing_place = Column(String, nullable=True)
    file_link = Column(String, nullable=True)
    status = Column(String, nullable=True)
    service_location = Column(String, nullable=True)
    service_area = Column(Numeric, nullable=True)
    sale_id = Column(String, nullable=True)
    service_package = Column(String, nullable=True)
    document_type = Column(String, nullable=True)
    has_technical = Column(String, nullable=True)
    addons = Column(JSONB, nullable=True)
    vat_policy = Column(String, nullable=True, default="not_included")
    vat_rate = Column(Numeric, nullable=True)
    vat_note = Column(Text, nullable=True)
    appendix_summary = Column(Text, nullable=True)
    copies_total = Column(Integer, nullable=True, default=2)
    copies_party_a = Column(Integer, nullable=True, default=1)
    copies_party_b = Column(Integer, nullable=True, default=1)
    page_count = Column(Integer, nullable=True)
    late_payment_days = Column(Integer, nullable=True)
    refund_period_days = Column(Integer, nullable=True)
    remedy_period_days = Column(Integer, nullable=True)
    acceptance_period_days = Column(Integer, nullable=True)
    response_period_days = Column(Integer, nullable=True)
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
    service_package_id = Column(String, ForeignKey("service_packages.id"), nullable=True)
    service_type = Column(String, nullable=True)
    task_type_id = Column(String, ForeignKey("task_types.id"), nullable=True)
    target_property = Column(String, nullable=True)
    land_owner_name = Column(String, nullable=True)
    property_certificate_number = Column(String, nullable=True)
    property_address = Column(Text, nullable=True)
    property_metadata = Column(JSONB, nullable=True, default=dict)
    price = Column(Numeric, nullable=True)


class ContractTemplate(Base):
    __tablename__ = "contract_templates"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String, nullable=False)
    version = Column(Integer, nullable=False, default=1)
    name = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    template_file_name = Column(Text, nullable=True)
    template_file_link = Column(Text, nullable=True)
    placeholder_schema = Column(JSONB, nullable=False, default=list)
    render_rules = Column(JSONB, nullable=False, default=dict)
    status = Column(String, nullable=False, default="draft")
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)


class ContractAppendix(Base):
    __tablename__ = "contract_appendices"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    contract_id = Column(String, ForeignKey("contracts.id"), nullable=False)
    appendix_code = Column(String, nullable=False)
    title = Column(Text, nullable=False)
    file_link = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="draft")
    signed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)


class ContractGeneratedDocument(Base):
    __tablename__ = "contract_generated_documents"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    contract_id = Column(String, ForeignKey("contracts.id"), nullable=False)
    template_id = Column(String, ForeignKey("contract_templates.id"), nullable=True)
    status = Column(String, nullable=False, default="draft")
    output_file_link = Column(Text, nullable=True)
    output_file_name = Column(Text, nullable=True)
    render_data_snapshot = Column(JSONB, nullable=False, default=dict)
    generated_by = Column(String, ForeignKey("users.id"), nullable=True)
    generated_at = Column(DateTime(timezone=True), nullable=True)
    signed_at = Column(DateTime(timezone=True), nullable=True)
    voided_at = Column(DateTime(timezone=True), nullable=True)
    void_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)
