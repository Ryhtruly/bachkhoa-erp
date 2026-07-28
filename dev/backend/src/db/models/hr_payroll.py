"""HR & Payroll models: Department, Employee, KpiPayroll, PayrollPeriod, PayrollAdjustment, Attendance, LeaveRecord."""

from src.db.models._base import *


class Department(Base):
    __tablename__ = "departments"
    id = Column(String, primary_key=True, default=lambda: f"dept_{uuid.uuid4().hex[:10]}")
    name = Column(String(100), unique=True, nullable=True)
    code = Column(String(30), unique=True, nullable=True)
    is_active = Column(Boolean, nullable=True, default=True)
    display_order = Column(Integer, nullable=True, default=100)


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
    contract_status = Column(String(30), nullable=True, default="Probation")
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
    base_salary_computed = Column(Numeric(15, 2), nullable=True, default=0)
    piece_rate_main = Column(Numeric(15, 2), nullable=True, default=0)
    piece_rate_support = Column(Numeric(15, 2), nullable=True, default=0)
    allowance = Column(Numeric(15, 2), nullable=True, default=0)
    penalty = Column(Numeric(15, 2), nullable=True, default=0)
    referral_commission = Column(Numeric(15, 2), nullable=True, default=0)
    holiday_bonus = Column(Numeric(15, 2), nullable=True, default=0)
    department_id = Column(String, ForeignKey("departments.id"), nullable=True)


class PayrollPeriod(Base):
    __tablename__ = "payroll_periods"
    id = Column(String, primary_key=True, default=lambda: f"pp_{uuid.uuid4().hex[:10]}")
    period_month = Column(Date, nullable=True, unique=True)
    status = Column(String(20), nullable=True, default="Open")
    locked_at = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)


class PayrollAdjustment(Base):
    __tablename__ = "payroll_adjustments"
    id = Column(String, primary_key=True, default=lambda: f"pa_{uuid.uuid4().hex[:12]}")
    employee_id = Column(String, ForeignKey("employees.id"), nullable=True)
    payroll_month = Column(Date, nullable=True)
    adjustment_type = Column(String(30), nullable=True)
    amount = Column(Numeric(15, 2), nullable=True, default=0)
    reason = Column(Text, nullable=True)
    task_id = Column(String, ForeignKey("projects_tasks.id"), nullable=True)
    status = Column(String(20), nullable=True, default="Approved")
    approved_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)


class Attendance(Base):
    __tablename__ = "attendance"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String, ForeignKey("employees.id"), nullable=True)
    date = Column(Date, nullable=True)
    check_in = Column(DateTime(timezone=True), nullable=True)
    check_out = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, nullable=True)
    hanet_log_id = Column(String, nullable=True)


class LeaveRecord(Base):
    __tablename__ = "leave_records"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String, ForeignKey("employees.id"), nullable=True)
    leave_type = Column(String, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    status = Column(String, nullable=True)
    approved_by = Column(String, ForeignKey("users.id"), nullable=True)
    deduction_amount = Column(Numeric, nullable=True)
