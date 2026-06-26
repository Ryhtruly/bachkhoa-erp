import os
import sys
import uuid
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.db.database import SessionLocal, engine
from src.db.models import *
from src.services import excel_adapter

def run_migration():
    db = SessionLocal()
    
    print("Reading Excel sheets...")
    hoso_data = excel_adapter.read_sheet("DATABASE_HOSO")
    hopdong_data = excel_adapter.read_sheet("DATABASE_HOP_DONG")
    thuchi_data = excel_adapter.read_sheet("DATABASE_THU_CHI")

    # Clear old data
    print("Clearing old data in PostgreSQL...")
    db.query(CashflowTransaction).delete()
    db.query(Receivable).delete()
    db.query(ProjectTask).delete()
    db.query(Contract).delete()
    db.query(LeadPipeline).delete()
    db.query(Customer).delete()
    db.query(KpiPayroll).delete()
    db.query(Employee).delete()
    db.query(UserRole).delete()
    db.query(AuthToken).delete()
    db.query(Role).delete()
    db.query(User).delete()
    db.commit()

    print("Migrating Customers...")
    customers = {}
    
    # Process customers from Contracts
    for hd in hopdong_data:
        khach = str(hd.get("Tên khách hàng") or "").strip()
        if khach and khach not in customers:
            sdt = str(hd.get("SĐT") or hd.get("Số điện thoại") or "").strip()
            c = Customer(
                id=str(uuid.uuid4()),
                full_name=khach,
                phone=sdt if sdt else None,
                address=str(hd.get("Địa chỉ") or hd.get("Khu vực") or "").strip()
            )
            customers[khach] = c
            db.add(c)
            
    # Process customers from Hoso
    for hs in hoso_data:
        khach = str(hs.get("Tên khách hàng") or hs.get("Khách") or "").strip()
        if khach and khach not in customers:
            sdt = str(hs.get("SĐT") or "").strip()
            c = Customer(
                id=str(uuid.uuid4()),
                full_name=khach,
                phone=sdt if sdt else None,
                address=str(hs.get("Khu vực/Phường") or "").strip()
            )
            customers[khach] = c
            db.add(c)
            
    db.commit()
    print(f"Created {len(customers)} Customers.")

    print("Migrating Contracts...")
    contract_map = {}
    for hd in hopdong_data:
        ma_hd = str(hd.get("Mã hợp đồng") or "").strip()
        if ma_hd and ma_hd != "None" and ma_hd not in contract_map:
            khach = str(hd.get("Tên khách hàng") or "").strip()
            customer_id = customers[khach].id if khach in customers else None
            
            try:
                date_val = hd.get("Ngày ký")
                if date_val:
                    if isinstance(date_val, datetime):
                        d_signed = date_val.date()
                    elif hasattr(date_val, "date"): # Pandas Timestamp
                        d_signed = date_val.date()
                    else:
                        d_signed = datetime.strptime(str(date_val).split()[0], "%Y-%m-%d").date()
                else:
                    d_signed = None
            except:
                d_signed = None
                
            val = hd.get("Giá trị HĐ") or hd.get("Giá trị hợp đồng") or 0
            try:
                val = float(val)
            except:
                val = 0
                
            c = Contract(
                id=ma_hd,
                customer_id=customer_id,
                service_type=str(hd.get("Loại dịch vụ") or ""),
                total_value=val,
                date_signed=d_signed
            )
            db.add(c)
            contract_map[ma_hd] = c
            
            # Create Receivables
            paid = hd.get("Đã thu") or hd.get("Đã thanh toán") or 0
            try:
                paid = float(paid)
            except:
                paid = 0
                
            r = Receivable(
                id=str(uuid.uuid4()),
                contract_id=ma_hd,
                paid_amount=paid,
                remaining_amount=val - paid
            )
            db.add(r)
            
    db.commit()
    print(f"Created {len(contract_map)} Contracts and Receivables.")

    print("Migrating Projects/Tasks...")
    hoso_map = {}
    for hs in hoso_data:
        ma_hs = str(hs.get("Mã hồ sơ") or "").strip()
        if ma_hs and ma_hs != "None":
            ma_hd = str(hs.get("Mã hợp đồng") or "").strip()
            if ma_hd not in contract_map:
                ma_hd = None
                
            try:
                deadline_str = hs.get("Deadline")
                if deadline_str:
                    d_dl = datetime.strptime(deadline_str, "%Y-%m-%d").date()
                else:
                    d_dl = None
            except:
                d_dl = None

            t = ProjectTask(
                id=ma_hs,
                contract_id=ma_hd,
                task_name=str(hs.get("Loại dịch vụ") or ""),
                deadline=d_dl,
                status=str(hs.get("Trạng thái") or "Trong hạn")
            )
            db.add(t)
            hoso_map[ma_hs] = t
    db.commit()
    print(f"Created {len(hoso_map)} ProjectTasks.")

    print("Migrating Cashflow...")
    tc_count = 0
    for tc in thuchi_data:
        ma_tc = str(tc.get("Mã phiếu") or "").strip()
        if ma_tc and ma_tc != "None":
            t_type = str(tc.get("Loại Thu/Chi") or tc.get("Loại") or "")
            amt = tc.get("Số tiền") or 0
            try:
                amt = float(amt)
            except:
                amt = 0
                
            cft = CashflowTransaction(
                id=str(uuid.uuid4()),
                type=t_type,
                amount=amt,
                category=str(tc.get("Diễn giải") or tc.get("Danh mục") or ""),
                payer_payee=str(tc.get("Người nhận/Nộp") or tc.get("Người nộp/nhận") or ""),
                payment_method=str(tc.get("Hình thức") or "")
            )
            db.add(cft)
            tc_count += 1
    db.commit()
    print(f"Created {tc_count} Cashflow Transactions.")

    db.close()
    print("Migration completed successfully!")

if __name__ == "__main__":
    run_migration()
