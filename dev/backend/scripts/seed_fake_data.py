import os
import sys
from faker import Faker
import random
from datetime import datetime, timedelta
import uuid

# Add src directory to Python path to import properly
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from src.db.database import SessionLocal
from src.db.models import User, Role, UserRole, Employee, Customer, LeadPipeline, KpiPayroll, ProjectTask, Contract, Receivable

fake = Faker('vi_VN')

def seed_data():
    db = SessionLocal()
    
    print("Seeding Roles...")
    roles = ["Admin", "Director", "Sales", "Technician", "Accountant"]
    role_objs = []
    for r in roles:
        role = db.query(Role).filter(Role.role_name == r).first()
        if not role:
            role = Role(role_name=r)
            db.add(role)
            db.flush()
        role_objs.append(role)
        
    print("Seeding Users & Employees...")
    departments = ["Phòng Giám đốc", "Phòng Kinh doanh", "Phòng Đo đạc", "Phòng Pháp lý", "Phòng Kế toán"]
    users = []
    employees = []
    for i in range(15):
        u_id = str(uuid.uuid4())
        user = User(
            id=u_id,
            username=fake.user_name() + str(random.randint(10, 9999)),
            password_hash="hashed_password_123",
            email=fake.user_name() + str(uuid.uuid4())[:8] + "@example.com"
        )
        db.add(user)
        db.flush()
        users.append(user)
        
        # Assign random role
        db.add(UserRole(user_id=u_id, role_id=random.choice(role_objs).id))
        
        emp = Employee(
            id=str(uuid.uuid4()),
            user_id=u_id,
            full_name=fake.name(),
            department=random.choice(departments),
            base_salary=random.randint(8000000, 25000000)
        )
        db.add(emp)
        db.flush()
        employees.append(emp)
        
    print("Seeding Customers...")
    customers = []
    for _ in range(20):
        cust = Customer(
            id=str(uuid.uuid4()),
            full_name=fake.name(),
            phone=fake.phone_number(),
            address=fake.address()
        )
        db.add(cust)
        db.flush()
        customers.append(cust)

    print("Seeding Leads Pipeline...")
    for _ in range(50):
        c_id = None
        if customers and random.random() > 0.3:
            c_id = random.choice(customers).id
            
        lead = LeadPipeline(
            id=str(uuid.uuid4()),
            customer_id=c_id,
            source=random.choice(["Zalo", "Facebook", "Hotline", "Website", "Giới thiệu"]),
            requirements=fake.text(max_nb_chars=100),
            status=random.choice(["Mới tiếp nhận", "Đang tư vấn", "Chốt Sale", "Thất bại"]),
            assigned_to=random.choice(users).id
        )
        db.add(lead)
        
    print("Seeding KPI Payroll...")
    for emp in employees:
        kpi = KpiPayroll(
            id=str(uuid.uuid4()),
            employee_id=emp.id,
            month="2026-03",
            tasks_completed=random.randint(5, 30),
            kpi_score=random.randint(80, 150),
            bonus=random.randint(500000, 5000000)
        )
        kpi.total_salary = emp.base_salary + kpi.bonus
        db.add(kpi)
        
    print("Seeding Contracts & Project Tasks...")
    for i in range(15):
        c_id = random.choice(customers).id if customers else None
        contract_id = f"{random.randint(100, 999)}/BK-{datetime.now().year}"
        val = random.randint(5000000, 50000000)
        contract = Contract(
            id=contract_id,
            customer_id=c_id,
            service_type=random.choice(["Đo hiện trạng", "Cắm mốc", "Hoàn công", "Xin phép xây dựng"]),
            total_value=val,
            date_signed=datetime.now().date() - timedelta(days=random.randint(1, 30))
        )
        db.add(contract)
        
        paid = val * random.choice([0, 0.3, 0.5, 1.0])
        receivable = Receivable(
            id=str(uuid.uuid4()),
            contract_id=contract_id,
            paid_amount=paid,
            remaining_amount=val - paid,
            due_date=datetime.now().date() + timedelta(days=30)
        )
        db.add(receivable)
        
        task = ProjectTask(
            id=f"BK-HS-{random.randint(1000, 9999)}",
            contract_id=contract_id,
            task_name=contract.service_type,
            assignee_id=random.choice(users).id if users else None,
            deadline=datetime.now().date() + timedelta(days=random.randint(-10, 20)),
            status=random.choice(["Mới", "Đang xử lý", "Hoàn thành", "Nộp thành công - Chờ kết quả", "Đã hủy"])
        )
        db.add(task)
        
    db.commit()
    print("Fake Data Seeded Successfully!")
    db.close()

if __name__ == "__main__":
    seed_data()
