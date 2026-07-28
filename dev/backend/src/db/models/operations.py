"""Production & Operations models: TaskType, TaskTypeRate, ProjectTask, TaskSubmission, TaskPayRecord, LegalSubmission."""

from src.db.models._base import *


class TaskType(Base):
    __tablename__ = "task_types"
    id = Column(String, primary_key=True, default=lambda: f"tt_{uuid.uuid4().hex[:10]}")
    name = Column(String(100), unique=True, nullable=True)


class TaskTypeRate(Base):
    __tablename__ = "task_type_rates"
    id = Column(String, primary_key=True, default=lambda: f"ttr_{uuid.uuid4().hex[:10]}")
    task_type_id = Column(String, ForeignKey("task_types.id"), nullable=True)
    role = Column(String(10), nullable=True)
    rate = Column(Numeric(15, 2), nullable=True, default=0)
    effective_from = Column(Date, nullable=True, default=datetime.date.today)
    effective_to = Column(Date, nullable=True)


class ProjectTask(Base):
    __tablename__ = "projects_tasks"
    id = Column(String, primary_key=True) # e.g. BK-HS-0001
    # Một mã hợp đồng đầy đủ có thể gắn với nhiều hồ sơ.
    # Hồ sơ chưa ký hợp đồng vẫn được phép để null.
    contract_id = Column(String, ForeignKey("contracts.id"), nullable=True)
    department = Column(String, nullable=True)
    assignee_id = Column(String, ForeignKey("users.id"), nullable=True)
    support_id = Column(String, ForeignKey("users.id"), nullable=True)
    priority = Column(String, nullable=True, default="Trung bình")
    deadline = Column(Date, nullable=True)
    status = Column(String, nullable=True)
    completion_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)
    review_note = Column(Text, nullable=True)
    department_id = Column(String, ForeignKey("departments.id"), nullable=True)
    task_type_id = Column(String, ForeignKey("task_types.id"), nullable=True)
    task_name = Column(String, nullable=True)
    ward = Column(String(100), nullable=True)
    start_date = Column(Date, nullable=True)
    stake_count = Column(Integer, nullable=True)
    stake_type = Column(String(50), nullable=True)
    service_line_id = Column(String, ForeignKey("service_lines.id"), nullable=True)
    current_package = Column(String, nullable=True)
    is_overdue_flag = Column(Boolean, nullable=False, default=False)


class TaskSubmission(Base):
    __tablename__ = "task_submissions"
    id = Column(String, primary_key=True, default=lambda: f"sub_{uuid.uuid4().hex[:12]}")
    task_id = Column(String, ForeignKey("projects_tasks.id"), nullable=True)
    submitted_by = Column(String(100), nullable=True)
    submission_date = Column(Date, nullable=True, default=datetime.date.today)
    is_first_submission = Column(Boolean, nullable=True, default=False)
    result = Column(String(100), nullable=True)
    expected_return_date = Column(Date, nullable=True)
    receipt_photo_url = Column(Text, nullable=True)
    received_by = Column(String(100), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    receipt_code = Column(String, nullable=True)
    gov_status = Column(String, nullable=True)


class TaskPayRecord(Base):
    __tablename__ = "task_pay_records"
    id = Column(String, primary_key=True, default=lambda: f"tpr_{uuid.uuid4().hex[:10]}")
    task_id = Column(String, ForeignKey("projects_tasks.id"), nullable=True)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=True)
    role = Column(String(10), nullable=True)
    payroll_month = Column(Date, nullable=True)
    base_rate = Column(Numeric(15, 2), nullable=True, default=0)
    stake_allowance = Column(Numeric(15, 2), nullable=True, default=0)
    cancellation_allowance = Column(Numeric(15, 2), nullable=True, default=0)
    priority_bonus = Column(Numeric(15, 2), nullable=True, default=0)
    penalty = Column(Numeric(15, 2), nullable=True, default=0)
    payment_status = Column(String(20), nullable=True, default="Chưa thanh toán")
    paid_at = Column(DateTime(timezone=True), nullable=True)
    note = Column(Text, nullable=True)


class LegalSubmission(Base):
    __tablename__ = "legal_submissions"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id = Column(String, ForeignKey("projects_tasks.id"), nullable=True)
    portal_tracking_code = Column(String, nullable=True)
    portal_status = Column(String, nullable=True)
    handler_id = Column(String, ForeignKey("users.id"), nullable=True)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)


class ServicePackage(Base):
    __tablename__ = "service_packages"
    id = Column(String, primary_key=True, default=lambda: f"sp_{uuid.uuid4().hex[:10]}")
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    display_order = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=True, default=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)


class TaskTransition(Base):
    __tablename__ = "task_transitions"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id = Column(String, ForeignKey("projects_tasks.id"), nullable=False)
    from_service_line_id = Column(String, ForeignKey("service_lines.id"), nullable=True)
    to_service_line_id = Column(String, ForeignKey("service_lines.id"), nullable=True)
    from_package = Column(String, nullable=True)
    to_package = Column(String, nullable=True)
    reason = Column(Text, nullable=True)
    transitioned_by = Column(String, ForeignKey("users.id"), nullable=True)
    transitioned_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
