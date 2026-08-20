from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from src.db.database import get_db
from src.db.models import Contract, Receivable, Customer, CashflowTransaction
from src.core.auth import require_authenticated_user, User
from src.core.redis_utils import get_cached_json, set_cached_json

router = APIRouter(prefix="/api", tags=["02. Dashboard & Analytics"])

@router.get("/dashboard/summary", summary="Get Executive Dashboard Summary", description="Retrieve high-level KPIs, active tasks, revenue, and receivables summary.")
def get_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(require_authenticated_user)
):
    cache_key = "bachkhoa:dashboard:summary"
    cached = get_cached_json(cache_key)
    if cached:
        return cached

    try:
        total_tasks = db.execute(text("select count(*) from public.service_lines")).scalar_one()
        completed = db.execute(text(
            "select count(*) from public.workflow_instances where status = 'completed'"
        )).scalar_one()
        in_progress = db.execute(text(
            "select count(*) from public.workflow_instances "
            "where status in ('not_started', 'running', 'paused')"
        )).scalar_one()
        overdue = db.execute(text("""
            select count(*)
            from public.task_nodes
            where deadline_at < now()
              and status not in ('accepted', 'skipped', 'cancelled')
        """)).scalar_one()
        
        total_val = db.query(func.sum(Contract.total_value)).scalar() or 0.0
        total_collected = db.query(func.sum(Receivable.paid_amount)).scalar() or 0.0
        debt = total_val - total_collected

        recent_tasks = [dict(row) for row in db.execute(text("""
            select sl.id,
                   coalesce(tt.name, sl.service_type, '') as service_type,
                   coalesce(wi.status, 'not_started') as status,
                   coalesce(cu.full_name, '') as customer_name,
                   coalesce(sl.target_property, cu.address, '') as area,
                   '' as pic_main,
                   '' as deadline,
                   'Trong hạn' as "Cảnh báo"
            from public.service_lines sl
            join public.contracts c on c.id = sl.contract_id
            left join public.customers cu on cu.id = c.customer_id
            left join public.task_types tt on tt.id = sl.task_type_id
            left join public.workflow_instances wi on wi.service_line_id = sl.id
            order by coalesce(wi.updated_at, wi.created_at) desc nulls last, sl.id desc
            limit 10
        """)).mappings().all()]

        result = {
            "stats": {
                "total_tasks": total_tasks,
                "in_progress": in_progress,
                "completed": completed,
                "overdue": overdue,
                "contract_val": total_val,
                "paid_val": total_collected,
                "debt_val": debt,
                "revenue": total_collected
            },
            "recent_tasks": recent_tasks
        }
        set_cached_json(cache_key, result, ttl_seconds=60)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/config")
def get_config(db: Session = Depends(get_db)):
    # `services` nay đọc từ DB (task_types) thay cho mảng ghi cứng cũ — mảng đó
    # chỉ có 9 mục, sai chính tả ("Tách Thửa"), và mất cả gói Xây dựng.
    # Giữ khoá `services` là danh sách phẳng để màn cũ không gãy; ô chọn 2 tầng
    # Gói → Hạng mục lấy từ /api/catalog/service-packages.
    from src.routes.routes_catalog import catalog_tree
    services = [t["name"] for goi in catalog_tree(db) for t in goi["task_types"]]
    return {
        "departments": ["Phòng Giám đốc", "Phòng Kinh doanh", "Phòng Marketing", "Phòng Đo đạc", "Phòng Pháp lý"],
        "personnel": ["Giám đốc", "Lê Văn Dựng", "Tạ Khắc Tập", "Trương Tấn Quốc", "Nguyễn Minh Thông", "Võ Thành Minh", "Võ Tứ Hợp", "Lê Tấn Đạt"],
        "services": services,
    }

@router.get("/dashboard/charts")
def get_dashboard_charts(
    db: Session = Depends(get_db),
    user: User = Depends(require_authenticated_user)
):
    cache_key = "bachkhoa:dashboard:charts"
    cached = get_cached_json(cache_key)
    if cached:
        return cached

    try:
        contracts = db.query(Contract.id, Contract.customer_id, Contract.service_type, Contract.total_value, Contract.date_signed).all()
        receivables = db.query(Receivable.contract_id, Receivable.remaining_amount).all()
        
        contracts_by_id = {c.id: c for c in contracts}
        
        revenue_by_month = {}
        for c in contracts:
            if not c.date_signed: continue
            month = c.date_signed.strftime("%Y-%m")
            if month not in revenue_by_month:
                revenue_by_month[month] = {"month": month, "revenue": 0, "debt": 0}
            revenue_by_month[month]["revenue"] += float(c.total_value or 0)
            
        for r in receivables:
            c = contracts_by_id.get(r.contract_id)
            if c and c.date_signed:
                month = c.date_signed.strftime("%Y-%m")
                if month in revenue_by_month:
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
        
        status_rows = db.execute(text("""
            select status, count(*) as value
            from public.workflow_instances
            group by status
            order by status
        """)).mappings().all()
        pie_status_data = [
            {"name": row["status"] or "Khác", "value": row["value"]}
            for row in status_rows
        ]
        
        cashflow = db.query(CashflowTransaction.category_code, CashflowTransaction.amount).filter(CashflowTransaction.transaction_type == "Chi").all()
        expense_cats = {}
        for tc in cashflow:
            cat = tc.category_code or "Khác"
            if not cat.strip(): cat = "Khác"
            expense_cats[cat] = expense_cats.get(cat, 0) + float(tc.amount or 0)
            
        pie_expense_data = [{"name": k, "value": v} for k, v in expense_cats.items() if v > 0]
        pie_expense_data.sort(key=lambda x: x["value"], reverse=True)
        if len(pie_expense_data) > 5:
            others = sum(x["value"] for x in pie_expense_data[5:])
            pie_expense_data = pie_expense_data[:5]
            pie_expense_data.append({"name": "Khác", "value": others})
            
        # Top Debtors
        debt_by_customer = {}
        for r in receivables:
            c = contracts_by_id.get(r.contract_id)
            if c and c.customer_id:
                debt_amt = float(r.remaining_amount or 0)
                if debt_amt > 0:
                    debt_by_customer[c.customer_id] = debt_by_customer.get(c.customer_id, 0) + debt_amt
        
        customer_ids = list(debt_by_customer.keys())
        customers = db.query(Customer.id, Customer.full_name).filter(Customer.id.in_(customer_ids)).all() if customer_ids else []
        cust_map = {cust.id: cust.full_name for cust in customers}
        
        top_debtors = []
        for cid, amt in debt_by_customer.items():
            name = cust_map.get(cid, "Khách hàng")
            if len(name) > 25: name = name[:22] + '...'
            top_debtors.append({"name": name, "debt": amt})
        
        top_debtors.sort(key=lambda x: x["debt"], reverse=True)
            
        result = {
            "lineData": line_data[-12:], # Last 12 months
            "barData": bar_data[:10], # Top 10
            "pieStatusData": pie_status_data,
            "pieExpenseData": pie_expense_data,
            "topDebtors": top_debtors[:5]
        }
        set_cached_json(cache_key, result, ttl_seconds=120)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

