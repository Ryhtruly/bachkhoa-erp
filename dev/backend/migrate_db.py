import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from src.db.database import engine
from sqlalchemy import text

# Danh sách các câu lệnh ALTER TABLE
alters = [
    # 1. Bảng customers
    "ALTER TABLE customers ADD COLUMN email VARCHAR",
    "ALTER TABLE customers ADD COLUMN zalo_id VARCHAR",
    "ALTER TABLE customers ADD COLUMN source VARCHAR",
    "ALTER TABLE customers ADD COLUMN notes TEXT",
    "ALTER TABLE customers ADD COLUMN birthday DATE",
    "ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL",

    # 2. Bảng projects_tasks
    "ALTER TABLE projects_tasks ADD COLUMN ten_ho_so VARCHAR",
    "ALTER TABLE projects_tasks ADD COLUMN customer_id VARCHAR",
    "ALTER TABLE projects_tasks ADD COLUMN khu_vuc VARCHAR",
    "ALTER TABLE projects_tasks ADD COLUMN gia_tri_du_kien NUMERIC",
    "ALTER TABLE projects_tasks ADD COLUMN link_file VARCHAR",
    "ALTER TABLE projects_tasks ADD COLUMN ghi_chu TEXT",
    "ALTER TABLE projects_tasks ADD COLUMN ngay_tao DATE",
    "ALTER TABLE projects_tasks ADD COLUMN assignee_name VARCHAR",
    "ALTER TABLE projects_tasks ADD COLUMN support_name VARCHAR",

    # 3. Bảng contracts
    "ALTER TABLE contracts ADD COLUMN sale_nguon VARCHAR",
    "ALTER TABLE contracts ADD COLUMN ngay_het_han DATE",
    "ALTER TABLE contracts ADD COLUMN phong_ban VARCHAR",
    "ALTER TABLE contracts ADD COLUMN trang_thai_thanh_toan VARCHAR DEFAULT 'Chờ thanh toán'",
    "ALTER TABLE contracts ADD COLUMN ghi_chu TEXT",

    # 4. Bảng cashflow_transactions
    "ALTER TABLE cashflow_transactions ADD COLUMN transaction_date DATE",
    "ALTER TABLE cashflow_transactions ADD COLUMN description TEXT",
    "ALTER TABLE cashflow_transactions ADD COLUMN department VARCHAR",

    # 5. Bảng employees
    "ALTER TABLE employees ADD COLUMN employee_code VARCHAR UNIQUE",
    "ALTER TABLE employees ADD COLUMN phone VARCHAR",
    "ALTER TABLE employees ADD COLUMN position VARCHAR",
    "ALTER TABLE employees ADD COLUMN join_date DATE",
    "ALTER TABLE employees ADD COLUMN hanet_person_id VARCHAR",
    
    # 6. Bảng leads_pipeline
    "ALTER TABLE leads_pipeline ADD COLUMN estimated_value NUMERIC",
    "ALTER TABLE leads_pipeline ADD COLUMN note TEXT"
]

with engine.begin() as conn:
    for sql in alters:
        try:
            conn.execute(text(sql))
            print(f"[OK] {sql}")
        except Exception as e:
            # Nếu cột đã tồn tại sẽ bắn lỗi, catch lại để chạy tiếp
            if 'already exists' in str(e).lower() or 'drop not null' in str(e).lower() or 'multiple primary keys' in str(e).lower() or 'constraint' in str(e).lower():
                print(f"[SKIPPED] {sql} (Already exists or constraint issue)")
            else:
                print(f"[ERROR] {sql}\n   -> {e}")

print("=====================================")
print("Migration (ALTER TABLE) completed!")
