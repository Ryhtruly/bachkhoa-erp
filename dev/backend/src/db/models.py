from sqlalchemy import Column, Integer, String, Boolean, Numeric, Date, DateTime, ForeignKey, Text, BigInteger
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
import uuid
import datetime
from src.db.database import Base

def get_utc_now():
    return datetime.datetime.now(datetime.timezone.utc)

# ----------------- A. Core System & Security -----------------

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
    can_read = Column(Boolean, nullable=False, default=False)
    can_create = Column(Boolean, nullable=False, default=False)
    can_update = Column(Boolean, nullable=False, default=False)
    can_delete = Column(Boolean, nullable=False, default=False)
    can_approve = Column(Boolean, nullable=False, default=False)

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

# ----------------- B. CRM & Sales -----------------

class Customer(Base):
    __tablename__ = "customers"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    full_name = Column(String)
    phone = Column(String, unique=True, index=True)
    address = Column(String, nullable=True)
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
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

# ----------------- C. Production & Operations -----------------

class TaskType(Base):
    __tablename__ = "task_types"
    id = Column(String, primary_key=True, default=lambda: f"tt_{uuid.uuid4().hex[:10]}")
    name = Column(String(100), unique=True, nullable=False)


class TaskTypeRate(Base):
    __tablename__ = "task_type_rates"
    id = Column(String, primary_key=True, default=lambda: f"ttr_{uuid.uuid4().hex[:10]}")
    task_type_id = Column(String, ForeignKey("task_types.id"), nullable=False)
    role = Column(String(10), nullable=False)
    rate = Column(Numeric(15, 2), nullable=False, default=0)
    effective_from = Column(Date, nullable=False, default=datetime.date.today)
    effective_to = Column(Date, nullable=True)


class ProjectTask(Base):
    __tablename__ = "projects_tasks"
    id = Column(String, primary_key=True) # e.g. BK-HS-0001
    # Một mã hợp đồng đầy đủ có thể gắn với nhiều hồ sơ.
    # Hồ sơ chưa ký hợp đồng vẫn được phép để null.
    contract_id = Column(String, ForeignKey("contracts.id"), nullable=True)
    department = Column(String, nullable=True)
    task_name = Column(String, nullable=True)
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
    ward = Column(String(100), nullable=True)
    start_date = Column(Date, nullable=True)
    stake_count = Column(Integer, nullable=True)
    stake_type = Column(String(50), nullable=True)
    is_overdue_flag = Column(Boolean, nullable=False, default=False)


class TaskSubmission(Base):
    __tablename__ = "task_submissions"
    id = Column(String, primary_key=True, default=lambda: f"sub_{uuid.uuid4().hex[:12]}")
    task_id = Column(String, ForeignKey("projects_tasks.id"), nullable=False)
    submitted_by = Column(String(100), nullable=True)
    submission_date = Column(Date, nullable=False, default=datetime.date.today)
    is_first_submission = Column(Boolean, nullable=False, default=False)
    result = Column(String(100), nullable=True)
    expected_return_date = Column(Date, nullable=True)
    receipt_photo_url = Column(Text, nullable=True)
    received_by = Column(String(100), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)


class TaskPayRecord(Base):
    __tablename__ = "task_pay_records"
    id = Column(String, primary_key=True, default=lambda: f"tpr_{uuid.uuid4().hex[:10]}")
    task_id = Column(String, ForeignKey("projects_tasks.id"), nullable=False)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    role = Column(String(10), nullable=False)
    payroll_month = Column(Date, nullable=False)
    base_rate = Column(Numeric(15, 2), nullable=False, default=0)
    stake_allowance = Column(Numeric(15, 2), nullable=False, default=0)
    cancellation_allowance = Column(Numeric(15, 2), nullable=False, default=0)
    priority_bonus = Column(Numeric(15, 2), nullable=False, default=0)
    penalty = Column(Numeric(15, 2), nullable=False, default=0)
    payment_status = Column(String(20), nullable=False, default="Chưa thanh toán")
    paid_at = Column(DateTime(timezone=True), nullable=True)
    note = Column(Text, nullable=True)


# ----------------- D. Finance & Accounting -----------------

class CashflowTransaction(Base):
    __tablename__ = "cashflow_transactions"
    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects_tasks.id"), nullable=True)
    contract_id = Column(String, ForeignKey("contracts.id"), nullable=True)
    loai = Column(String, nullable=True) # Thu / Chi
    so_tien = Column(Numeric, nullable=True)
    hang_muc = Column(String, nullable=True)
    nguoi_nhan_nop = Column(String, nullable=True)
    hinh_thuc = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)
    ngay = Column(Date, nullable=True)
    so_chung_tu = Column(String, nullable=True)
    dien_giai = Column(Text, nullable=True)
    du_an_phong_ban = Column(String, nullable=True)
    so_du_sau_gd = Column(Numeric, nullable=True)
    so_du_tien_mat = Column(Numeric, nullable=True)
    so_du_ck = Column(Numeric, nullable=True)
    chung_tu = Column(Text, nullable=True)
    ghi_chu = Column(Text, nullable=True)
    nguoi_lap = Column(String, nullable=True)
    nguoi_duyet = Column(String, nullable=True)
    trang_thai = Column(String, nullable=True)
    scope = Column(String, default="Công ty")
    voided_reason = Column(String, nullable=True)
    voided_at = Column(DateTime(timezone=True), nullable=True)

class Receivable(Base):
    __tablename__ = "receivables"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    contract_id = Column(String, ForeignKey("contracts.id"))
    paid_amount = Column(Numeric, default=0)
    remaining_amount = Column(Numeric, nullable=True)
    due_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

class WikiDocument(Base):
    __tablename__ = "wiki_documents"
    id = Column(String, primary_key=True) # e.g. ISO-001
    title = Column(String, nullable=False)
    category = Column(String, nullable=False)
    link = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    version = Column(String(20), nullable=True)
    effective_date = Column(Date, nullable=True)
    author_id = Column(String, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)


# ----------------- E. HR & Payroll -----------------

class Department(Base):
    __tablename__ = "departments"
    id = Column(String, primary_key=True, default=lambda: f"dept_{uuid.uuid4().hex[:10]}")
    name = Column(String(100), unique=True, nullable=False)
    code = Column(String(30), unique=True, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    display_order = Column(Integer, nullable=False, default=100)

class Employee(Base):
    __tablename__ = "employees"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True, unique=True)
    full_name = Column(String, nullable=True)
    department = Column(String, nullable=True)
    base_salary = Column(Numeric, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)
    department_id = Column(String, ForeignKey("departments.id"), nullable=True)
    job_title = Column(String(100), nullable=True)
    contract_status = Column(String(30), nullable=False, default="Probation")
    join_date = Column(Date, nullable=True, default=datetime.date.today)
    probation_end_date = Column(Date, nullable=True)

class KpiPayroll(Base):
    __tablename__ = "kpi_payroll"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String, ForeignKey("employees.id"))
    month = Column(Date, nullable=True)
    tasks_completed = Column(Integer, default=0)
    kpi_score = Column(Numeric, default=0)
    bonus = Column(Numeric, default=0)
    total_salary = Column(Numeric, default=0)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)
    base_salary_computed = Column(Numeric(15, 2), nullable=False, default=0)
    piece_rate_main = Column(Numeric(15, 2), nullable=False, default=0)
    piece_rate_support = Column(Numeric(15, 2), nullable=False, default=0)
    allowance = Column(Numeric(15, 2), nullable=False, default=0)
    penalty = Column(Numeric(15, 2), nullable=False, default=0)
    referral_commission = Column(Numeric(15, 2), nullable=False, default=0)
    holiday_bonus = Column(Numeric(15, 2), nullable=False, default=0)
    department_id = Column(String, ForeignKey("departments.id"), nullable=True)


class PayrollPeriod(Base):
    __tablename__ = "payroll_periods"
    id = Column(String, primary_key=True, default=lambda: f"pp_{uuid.uuid4().hex[:10]}")
    period_month = Column(Date, nullable=False, unique=True)
    status = Column(String(20), nullable=False, default="Open")
    locked_at = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)


class PayrollAdjustment(Base):
    __tablename__ = "payroll_adjustments"
    id = Column(String, primary_key=True, default=lambda: f"pa_{uuid.uuid4().hex[:12]}")
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    payroll_month = Column(Date, nullable=False)
    adjustment_type = Column(String(30), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False, default=0)
    reason = Column(Text, nullable=False)
    task_id = Column(String, ForeignKey("projects_tasks.id"), nullable=True)
    status = Column(String(20), nullable=False, default="Approved")
    approved_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

class SystemSetting(Base):
    __tablename__ = "system_settings"
    key = Column(String, primary_key=True)
    value = Column(String, nullable=True)
    description = Column(String, nullable=True)

class FinanceSetting(Base):
    __tablename__ = "finance_settings"
    key = Column(String, primary_key=True)
    value = Column(Numeric, default=0.0)


class FundOpeningBalance(Base):
    __tablename__ = "fund_opening_balances"
    
    id = Column(Integer, primary_key=True, index=True)
    hinh_thuc = Column(String(50), nullable=False) # 'Tiền mặt' hoặc 'Chuyển khoản'
    so_tien_dau_ky = Column(Numeric(15, 2), nullable=False)
    ngay_ap_dung = Column(DateTime(timezone=True), nullable=False)
    nguoi_chot = Column(String(100), nullable=True)
    ghi_chu = Column(Text, nullable=True)
