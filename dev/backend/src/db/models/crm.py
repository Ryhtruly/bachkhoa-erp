"""CRM & Sales models: Customer, LeadPipeline, Contract, ZaloInteraction, ServiceLine."""

from sqlalchemy import CheckConstraint, DDL, UniqueConstraint, event

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
    customer = relationship("Customer")
    lead_id = Column(String, ForeignKey("leads_pipeline.id"), nullable=True)
    contract_template_id = Column(
        String,
        ForeignKey("contract_templates.id", ondelete="RESTRICT"),
        nullable=True,
    )
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
    commission_rate_snapshot = Column(Numeric(5, 2), nullable=True)
    commission_locked_at = Column(DateTime(timezone=True), nullable=True)
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
    completion_override = Column(Boolean, default=False, server_default=text("false"), nullable=False)
    completion_override_by = Column(String, ForeignKey("users.id"), nullable=True)
    completion_override_reason = Column(Text, nullable=True)
    completion_override_at = Column(DateTime(timezone=True), nullable=True)
    # Loyalty / Priority discount — ghi nhận khi khách hàng đạt bậc ưu đãi
    loyalty_tier_id = Column(String, nullable=True)
    loyalty_tier_name = Column(String, nullable=True)
    loyalty_discount_percent = Column(Numeric(5, 2), nullable=True)
    loyalty_discount_amount = Column(Numeric, nullable=True)
    original_value = Column(Numeric, nullable=True)
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


class CustomerLoyaltyTier(Base):
    """Bậc ưu đãi khách hàng thân thiết — cấu hình bởi giám đốc/quản lý."""
    __tablename__ = "customer_loyalty_tiers"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tier_name = Column(String(100), nullable=False, unique=True)
    min_contracts = Column(Integer, nullable=False, unique=True)
    discount_percent = Column(Numeric(5, 2), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)


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
    # Ưu tiên hồ sơ (Q5): đặt từ đầu, khoá khi kích hoạt. Giám đốc mới đặt được.
    priority = Column(String, nullable=False, default="NORMAL", server_default=text("'NORMAL'"))
    priority_reason = Column(Text, nullable=True)
    priority_set_by = Column(String, nullable=True)
    priority_set_at = Column(DateTime(timezone=True), nullable=True)
    survey_drive_folder_url = Column(Text, nullable=True)
    legal_drive_folder_url = Column(Text, nullable=True)
    # document_register_version CỐ Ý KHÔNG map ở đây trong suốt cửa sổ EXPAND.
    #
    # Map vào model là mọi truy vấn ORM trên ServiceLine đều SELECT cột đó — kể
    # cả danh sách hợp đồng, cache, báo cáo — nên chỉ cần CSDL chưa có cột là
    # toàn bộ gãy 500. Ghi/đọc cột này đi bằng SQL thuần, sau cổng
    # require_v2_schema(). Map vào model ở đợt CONTRACT, khi cột đã chắc chắn có.


class ContractTemplate(Base):
    __tablename__ = "contract_templates"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String, nullable=False)
    version = Column(Integer, nullable=False, default=1)
    name = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    template_file_name = Column(Text, nullable=True)
    template_file_link = Column(Text, nullable=True)
    template_storage_key = Column(Text, nullable=True)
    storage_provider = Column(Text, nullable=False, default="s3-compatible")
    placeholder_schema = Column(JSONB, nullable=False, default=list)
    render_rules = Column(JSONB, nullable=False, default=dict)
    status = Column(String, nullable=False, default="draft")
    # Upload lifecycle (see supabase/migrations/20260925100000_*): 'pending'
    # while a reservation awaits its bytes, 'ready' once an object is stored,
    # 'failed' when a previous attempt needs an explicit retry. The ORM/server
    # default 'ready' keeps legacy writers that persist a storage key working;
    # the management service always reserves with an explicit 'pending'.
    upload_state = Column(String, nullable=False, default="ready", server_default=text("'ready'"))
    content_sha256 = Column(String(64), nullable=True)
    content_size = Column(BigInteger, nullable=True)
    publish_requested = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    __table_args__ = (
        # The baseline DDL already enforces UNIQUE (code, version); mirror it
        # here so metadata-created databases (SQLite dev, fresh PG) enforce the
        # same pair uniqueness.
        UniqueConstraint("code", "version", name="uq_contract_templates_code_version"),
        # Mirror of the pre-existing baseline status CHECK.
        CheckConstraint(
            "status IN ('draft', 'published', 'archived')",
            name="contract_templates_status_check",
        ),
        CheckConstraint(
            "upload_state IN ('pending', 'ready', 'failed')",
            name="contract_templates_upload_state_check",
        ),
        # Only a finished upload may leave draft: published/archived rows must
        # point at stored bytes.
        CheckConstraint(
            "upload_state = 'ready' OR status = 'draft'",
            name="contract_templates_upload_state_status_check",
        ),
        # A 'ready' row must reference a non-blank storage key. trim() is used
        # instead of btrim() — identical for the default space set, and SQLite
        # (which runs most of the existing suite) has no btrim function.
        CheckConstraint(
            "upload_state <> 'ready' OR nullif(trim(template_storage_key), '') IS NOT NULL",
            name="contract_templates_ready_requires_key_check",
        ),
        # Digest/size travel together: NULL/NULL for rows that predate content
        # tracking, otherwise a 64-char lowercase hex digest and 1..20 MiB.
        # The POSIX regex operator is PostgreSQL-only (SQLite cannot even parse
        # `~`, which would break metadata.create_all for the whole suite), so
        # this CHECK is emitted on PostgreSQL only; the migration enforces it
        # on every PG database regardless of how tables were created.
        CheckConstraint(
            "((content_sha256 IS NULL AND content_size IS NULL) OR "
            "(content_sha256 IS NOT NULL AND content_size IS NOT NULL AND "
            "content_sha256 ~ '^[0-9a-f]{64}$' AND content_size BETWEEN 1 AND 20971520))",
            name="contract_templates_content_integrity_check",
            _create_rule=lambda compiler: compiler.dialect.name == "postgresql",
        ),
    )


# One published version per template code. Registered as a PostgreSQL-only DDL
# listener (instead of __table_args__) on purpose: on SQLite the partial
# predicate would be dropped and degrade into a plain UNIQUE(code), forbidding
# multiple drafts of one code. The migration installs the same index on every
# PostgreSQL database regardless of how its tables were created.
event.listen(
    ContractTemplate.__table__,
    "after_create",
    DDL(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_templates_published_code "
        "ON contract_templates (code) WHERE status = 'published'"
    ).execute_if(dialect="postgresql"),
)


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
    output_storage_key = Column(Text, nullable=True)
    render_data_snapshot = Column(JSONB, nullable=False, default=dict)
    generated_by = Column(String, ForeignKey("users.id"), nullable=True)
    generated_at = Column(DateTime(timezone=True), nullable=True)
    signed_at = Column(DateTime(timezone=True), nullable=True)
    voided_at = Column(DateTime(timezone=True), nullable=True)
    void_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)
