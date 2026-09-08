import io
import openpyxl
import pytest
from src.finance.excel_exporter import (
    generate_monthly_dashboard_excel,
    generate_employee_payroll_excel,
    generate_department_payroll_summary_excel
)
from src.routes.routes_finance_export import _safe_filename


def test_safe_filename_edge_cases():
    assert _safe_filename("Phòng Đo vẽ & Bản đồ") == "Phong_Do_ve_Ban_do.xlsx"
    assert _safe_filename("Đoàn Thị Điểm - Kỳ 08/2026") == "Doan_Thi_Diem_-_Ky_08_2026.xlsx"
    assert _safe_filename("Nguyễn Đức Đạt (Đo Đạc)") == "Nguyen_Duc_Dat_Do_Dac.xlsx"
    assert _safe_filename("") == "export.xlsx"


def test_excel_export_empty_datasets():
    # 1. Empty monthly dashboard
    empty_dashboard = {
        "month": 8,
        "year": 2026,
        "total_income": 0,
        "total_expenditure": 0,
        "net_difference": 0,
        "categories": [],
        "departments": []
    }
    stream1 = generate_monthly_dashboard_excel(empty_dashboard, "2026-08")
    wb1 = openpyxl.load_workbook(stream1)
    assert "Bao_Cao_Thang" in wb1.sheetnames
    ws1 = wb1["Bao_Cao_Thang"]
    assert ws1 is not None

    # 2. Empty employee ledger
    empty_ledger = {
        "employee": {
            "full_name": "Đặng Thị Đoan Trang",
            "job_title": "Kỹ sư Trắc địa",
            "department": "Phòng Đo đạc"
        },
        "period_range": "26/07/2026 – 25/08/2026",
        "period_status": "Open",
        "summary": {
            "approved_salary": 0,
            "pending_record_total": 0,
            "total_allowance": 0,
            "total_bonus": 0,
            "total_deduction": 0,
            "net_salary": 0
        },
        "details": [],
        "adjustments": []
    }
    stream2 = generate_employee_payroll_excel(empty_ledger, "08/2026")
    wb2 = openpyxl.load_workbook(stream2)
    assert "Phieu_Luong_Ca_Nhan" in wb2.sheetnames

    # 3. Empty department summary
    stream3 = generate_department_payroll_summary_excel("Phòng Đo đạc & Khảo sát", "Kỳ 08/2026", [])
    wb3 = openpyxl.load_workbook(stream3)
    assert "Bang_Tong_Hop_Luong" in wb3.sheetnames


def test_excel_export_large_and_negative_datasets():
    # Negative net difference (deficit)
    deficit_dashboard = {
        "month": 8,
        "year": 2026,
        "total_income": 5000000,
        "total_expenditure": 25000000,
        "net_difference": -20000000,
        "categories": [
            {"name": "Đo vẽ hiện trạng", "income": 5000000, "expenditure": 15000000},
            {"name": "Chi phí thiết bị", "income": 0, "expenditure": 10000000}
        ],
        "departments": [
            {"name": "Phòng Đo đạc", "income": 5000000, "expenditure": 25000000}
        ]
    }
    stream = generate_monthly_dashboard_excel(deficit_dashboard, "2026-08")
    wb = openpyxl.load_workbook(stream)
    ws = wb["Bao_Cao_Thang"]
    assert ws is not None

    # Full employee ledger with bonuses, penalties, allowances
    full_ledger = {
        "employee": {
            "full_name": "Nguyễn Hoan Khai",
            "job_title": "Trưởng nhóm đo đạc",
            "department": "Phòng Đo đạc"
        },
        "period_range": "26/07/2026 – 25/08/2026",
        "period_status": "Locked",
        "summary": {
            "approved_salary": 12500000,
            "pending_record_total": 3500000,
            "total_allowance": 800000,
            "total_bonus": 1500000,
            "total_deduction": 500000,
            "net_salary": 17800000
        },
        "details": [
            {
                "contract_id": "HD-2026-088",
                "customer_name": "Công ty Bách Khoa Land",
                "task_name": "Đo đạc hiện trạng 5000m2",
                "role": "main",
                "event_date": "10/08/2026",
                "base_rate": 8000000,
                "stake_allowance": 500000,
                "cancellation_allowance": 0,
                "priority_bonus": 1000000,
                "penalty": 0,
                "net_amount": 9500000,
                "payment_status": "Đã duyệt"
            },
            {
                "contract_id": "HD-2026-092",
                "customer_name": "UBND Huyện Củ Chi",
                "task_name": "Cắm mốc ranh giới",
                "role": "support",
                "event_date": "15/08/2026",
                "base_rate": 4500000,
                "stake_allowance": 300000,
                "cancellation_allowance": 0,
                "priority_bonus": 500000,
                "penalty": 500000,
                "net_amount": 4800000,
                "payment_status": "Chờ ghi nhận"
            }
        ],
        "adjustments": [
            {
                "event_date": "20/08/2026",
                "type": "bonus",
                "reason": "Thưởng tiến độ dự án xuất sắc",
                "amount": 1500000
            },
            {
                "event_date": "22/08/2026",
                "type": "penalty",
                "reason": "Trừ đồng phục định kỳ",
                "amount": 500000
            }
        ]
    }
    stream_ledger = generate_employee_payroll_excel(full_ledger, "08/2026")
    wb_ledger = openpyxl.load_workbook(stream_ledger)
    ws_ledger = wb_ledger["Phieu_Luong_Ca_Nhan"]
    assert ws_ledger is not None
