"""HR & Payroll models: Department, Employee, PayrollPeriod, Attendance, LeaveRecord."""

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
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    gender = Column(Text, nullable=True)
    date_of_birth = Column(Date, nullable=True)
    place_of_birth = Column(String, nullable=True)
    avatar_url = Column(Text, nullable=True)


class PayrollPeriod(Base):
    __tablename__ = "payroll_periods"
    id = Column(String, primary_key=True, default=lambda: f"pp_{uuid.uuid4().hex[:10]}")
    period_month = Column(Date, nullable=True, unique=True)
    status = Column(String(20), nullable=True, default="Open")
    locked_at = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    locked_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)


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
