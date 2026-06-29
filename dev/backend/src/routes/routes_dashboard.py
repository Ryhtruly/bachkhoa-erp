from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from src.db.database import get_db
from src.db.models import ProjectTask, Contract, Receivable, Customer, CashflowTransaction

router = APIRouter(prefix="/api", tags=["Dashboard & Config"])

@router.get("/dashboard/summary")
def get_dashboard(db: Session = Depends(get_db)):
    try:
        total_hoso = db.query(ProjectTask).count()
        completed = db.query(ProjectTask).filter(ProjectTask.status.in_(["Hoàn thành", "Nộp thành công - Chờ kết quả"])).count()
        in_progress = db.query(ProjectTask).filter(~ProjectTask.status.in_(["Hoàn thành", "Đã hủy", "Nộp thành công - Chờ kết quả"])).count()
        
        # Simple overdue checking logic for now (could be refined with actual date comparisons)
        import datetime
        overdue = db.query(ProjectTask).filter(
            ProjectTask.deadline < datetime.datetime.now().date(),
            ~ProjectTask.status.in_(["Hoàn thành", "Đã hủy"])
        ).count()
        
        total_val = db.query(func.sum(Contract.total_value)).scalar() or 0.0
        total_collected = db.query(func.sum(Receivable.paid_amount)).scalar() or 0.0
        debt = total_val - total_collected

        recent_tasks = db.query(ProjectTask).order_by(ProjectTask.created_at.desc()).limit(10).all()
        recent_hoso = []
        for t in recent_tasks:
            contract = db.query(Contract).filter(Contract.id == t.contract_id).first() if t.contract_id else None
            customer = db.query(Customer).filter(Customer.id == contract.customer_id).first() if contract and contract.customer_id else None
            recent_hoso.append({
                "id": t.id,
                "service_type": t.task_name,
                "status": t.status,
                "customer_name": customer.full_name if customer else "",
                "area": customer.address if customer else "",
                "pic_main": t.assignee_id or "",
                "deadline": t.deadline.strftime("%Y-%m-%d") if t.deadline else "",
                "Cảnh báo": "Trong hạn"
            })

        return {
            "stats": {
                "total_hoso": total_hoso,
                "in_progress": in_progress,
                "completed": completed,
                "overdue": overdue,
                "contract_val": total_val,
                "paid_val": total_collected,
                "debt_val": debt,
                "revenue": total_collected
            },
            "recent_hoso": recent_hoso
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/config")
def get_config():
    # Keep returning static config for now as UI dropdowns depend on it
    return {
        "departments": ["Phòng Giám đốc", "Phòng Kinh doanh", "Phòng Marketing", "Phòng Đo đạc", "Phòng Pháp lý"],
        "personnel": ["Giám đốc", "Lê Văn Dựng", "Tạ Khắc Tập", "Trương Tấn Quốc", "Nguyễn Minh Thông", "Võ Thành Minh", "Võ Tứ Hợp", "Lê Tấn Đạt"],
        "services": ["Đo hiện trạng", "Cắm mốc", "Hoàn công", "Cấp đổi", "Hợp thửa", "Tách Thửa", "Cấp sổ lần đầu", "Chuyển mục đích", "Xin phép xây dựng"]
    }

@router.get("/dashboard/charts")
def get_dashboard_charts(db: Session = Depends(get_db)):
    try:
        contracts = db.query(Contract).all()
        receivables = db.query(Receivable).all()
        
        revenue_by_month = {}
        for c in contracts:
            if not c.date_signed: continue
            month = c.date_signed.strftime("%Y-%m")
            if month not in revenue_by_month:
                revenue_by_month[month] = {"month": month, "revenue": 0, "debt": 0}
            revenue_by_month[month]["revenue"] += float(c.total_value or 0)
            
        for r in receivables:
            c = next((x for x in contracts if x.id == r.contract_id), None)
            if c and c.date_signed:
                month = c.date_signed.strftime("%Y-%m")
                revenue_by_month[month]["debt"] += float(r.remaining_amount or 0)
                
        line_data = list(revenue_by_month.values())
        line_data.sort(key=lambda x: x["month"])
        
        revenue_by_service = {}
        for c in contracts:
            if not c.service_type: continue
            srv = c.service_type
            revenue_by_service[srv] = revenue_by_service.get(srv, 0) + float(c.total_value or 0)
            
        bar_data = [{"service": k, "revenue": v} for k, v in revenue_by_service.items()]
        bar_data.sort(key=lambda x: x["revenue"], reverse=True)
        
        tasks = db.query(ProjectTask).all()
        status_counts = {}
        for t in tasks:
            st = t.status or "Khác"
            status_counts[st] = status_counts.get(st, 0) + 1
        pie_status_data = [{"name": k, "value": v} for k, v in status_counts.items()]
        
        cashflow = db.query(CashflowTransaction).filter(CashflowTransaction.loai == "Chi").all()
        expense_cats = {}
        for tc in cashflow:
            cat = tc.hang_muc or "Khác"
            if not cat.strip(): cat = "Khác"
            expense_cats[cat] = expense_cats.get(cat, 0) + float(tc.so_tien or 0)
            
        pie_expense_data = [{"name": k, "value": v} for k, v in expense_cats.items() if v > 0]
        pie_expense_data.sort(key=lambda x: x["value"], reverse=True)
        if len(pie_expense_data) > 5:
            others = sum(x["value"] for x in pie_expense_data[5:])
            pie_expense_data = pie_expense_data[:5]
            pie_expense_data.append({"name": "Khác", "value": others})
            
        # Top Debtors
        debt_by_customer = {}
        for r in receivables:
            c = next((x for x in contracts if x.id == r.contract_id), None)
            if c and c.customer_id:
                debt_amt = float(r.remaining_amount or 0)
                if debt_amt > 0:
                    debt_by_customer[c.customer_id] = debt_by_customer.get(c.customer_id, 0) + debt_amt
        
        customers = db.query(Customer).filter(Customer.id.in_(list(debt_by_customer.keys()))).all()
        top_debtors = []
        for cid, amt in debt_by_customer.items():
            cust = next((x for x in customers if x.id == cid), None)
            name = cust.full_name if cust else "Khách hàng"
            # Giới hạn tên khách hàng không quá dài
            if len(name) > 25: name = name[:22] + '...'
            top_debtors.append({"name": name, "debt": amt})
        
        top_debtors.sort(key=lambda x: x["debt"], reverse=True)
            
        return {
            "lineData": line_data[-12:], # Last 12 months
            "barData": bar_data[:10], # Top 10
            "pieStatusData": pie_status_data,
            "pieExpenseData": pie_expense_data,
            "topDebtors": top_debtors[:5]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
