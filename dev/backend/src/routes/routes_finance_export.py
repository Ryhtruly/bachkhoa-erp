import io
import logging
import unicodedata
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.core.auth import require_any_permission, User
from src.db.models import Employee, Department
from src.finance.repository import FinanceRepository
from src.finance.excel_exporter import (
    generate_monthly_dashboard_excel,
    generate_employee_payroll_excel,
    generate_department_payroll_summary_excel
)
from src.routes.routes_payroll import get_employee_ledger

router = APIRouter(tags=["06. Finance & Payroll Export"])
logger = logging.getLogger(__name__)


def _safe_filename(name: str, ext: str = ".xlsx") -> str:
    """Chuyển đổi tên file có dấu tiếng Việt sang ASCII an toàn cho HTTP Header Content-Disposition."""
    replacements = {
        'Đ': 'D', 'đ': 'd',
        '–': '-', '—': '-',
        '’': '', '‘': '', '“': '', '”': ''
    }
    for k, v in replacements.items():
        name = name.replace(k, v)

    nfkd = unicodedata.normalize('NFKD', name)
    ascii_bytes = nfkd.encode('ascii', 'ignore')
    ascii_name = ascii_bytes.decode('ascii')
    clean_name = "".join([c if c.isalnum() or c in ('_', '-') else '_' for c in ascii_name]).strip('_')
    while '__' in clean_name:
        clean_name = clean_name.replace('__', '_')
    if not clean_name:
        clean_name = "export"
    return f"{clean_name}{ext}"


@router.get("/api/finance/export/monthly-dashboard-excel")
def export_monthly_dashboard_excel(
    month: str = Query(..., description="Format: YYYY-MM"),
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission(("finance", "read"), ("payroll", "read")))
):
    """Xuất Báo Cáo Dòng Tiền và Thu Chi Tháng ra file Excel (.xlsx)."""
    try:
        data = FinanceRepository.get_monthly_dashboard(db, month)
        excel_stream = generate_monthly_dashboard_excel(data, month)
        filename = _safe_filename(f"Bao_Cao_Thu_Chi_Thang_{month}")

        return StreamingResponse(
            excel_stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        logger.exception("Lỗi khi tạo file Excel báo cáo tháng:")
        raise HTTPException(status_code=500, detail=f"Không thể xuất file Excel: {str(e)}")


@router.get("/api/payroll/export/employee-ledger-excel")
def export_employee_ledger_excel(
    employee_id: str = Query(...),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission(("payroll", "read"), ("finance", "read")))
):
    """Xuất Phiếu Lương Khoán Nhiệm Vụ của cá nhân ra file Excel (.xlsx)."""
    curr_year = datetime.now().year
    curr_month = datetime.now().month
    year_val = year if isinstance(year, int) else curr_year
    month_val = month if isinstance(month, int) else curr_month

    try:
        ledger_res = get_employee_ledger(
            department_id=None,
            employee_id=employee_id,
            year=year_val,
            month=month_val,
            db=db,
            user=user
        )
        ledger_data = ledger_res.get("data") or {}
        emp_info = ledger_data.get("employee") or {}
        emp_name = emp_info.get("full_name", "NhanVien")

        month_label = f"{month_val:02d}/{year_val}"
        excel_stream = generate_employee_payroll_excel(ledger_data, month_label)
        filename = _safe_filename(f"Phieu_Luong_{emp_name}_{month_val:02d}_{year_val}")

        return StreamingResponse(
            excel_stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        logger.exception("Lỗi khi xuất phiếu lương Excel cá nhân:")
        raise HTTPException(status_code=500, detail=f"Không thể xuất phiếu lương Excel: {str(e)}")


@router.get("/api/payroll/export/department-summary-excel")
def export_department_summary_excel(
    department_id: str = Query(...),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission(("payroll", "read"), ("finance", "read")))
):
    """Xuất Bảng Lương Khoán Tổng Hợp Phòng Ban ra file Excel (.xlsx)."""
    curr_year = datetime.now().year
    curr_month = datetime.now().month
    year_val = year if isinstance(year, int) else curr_year
    month_val = month if isinstance(month, int) else curr_month

    try:
        dept_name = "Toan_Cong_Ty"
        if department_id and department_id != "dept_general":
            dept = db.query(Department).filter(Department.id == department_id).first()
            if dept:
                dept_name = dept.name
        elif department_id == "dept_general":
            dept_name = "Khoi_Van_Phong"

        # Lấy danh sách nhân viên trong phòng ban
        if department_id and department_id != "dept_general":
            employees = db.query(Employee).filter(
                Employee.department_id == department_id,
                Employee.is_active == True
            ).order_by(Employee.full_name.asc()).all()
        else:
            employees = db.query(Employee).filter(
                Employee.is_active == True
            ).order_by(Employee.full_name.asc()).all()

        period_info = FinanceRepository.get_payroll_date_range(db, year_val, month_val)
        period_label = period_info.get("label", f"Kỳ {month_val:02d}/{year_val}")

        summaries = []
        for emp in employees:
            ledger_res = get_employee_ledger(
                department_id=department_id,
                employee_id=emp.id,
                year=year_val,
                month=month_val,
                db=db,
                user=user
            )
            data = ledger_res.get("data") or {}
            sum_info = data.get("summary") or {}
            summaries.append({
                "full_name": emp.full_name,
                "job_title": emp.job_title or "Kỹ thuật viên",
                "approved": sum_info.get("approved_salary", sum_info.get("recorded_total", sum_info.get("approved", 0))),
                "pending": sum_info.get("pending_record_total", sum_info.get("pending", 0)),
                "allowance": sum_info.get("allowance", sum_info.get("total_allowance", 0)),
                "bonus": sum_info.get("bonus", sum_info.get("total_bonus", 0)),
                "penalty": sum_info.get("penalty", sum_info.get("total_deduction", sum_info.get("total_penalty", 0))),
                "net_total": sum_info.get("net_salary", sum_info.get("gross_total", sum_info.get("total_net", 0)))
            })

        excel_stream = generate_department_payroll_summary_excel(dept_name, period_label, summaries)
        filename = _safe_filename(f"Bang_Luong_Tong_Hop_{dept_name}_{month_val:02d}_{year_val}")

        return StreamingResponse(
            excel_stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        logger.exception("Lỗi khi xuất bảng tổng hợp lương:")
        raise HTTPException(status_code=500, detail=f"Không thể xuất bảng tổng hợp lương: {str(e)}")
