"""Chặn lỗi "đổi tên cột trong CSDL nhưng quên sửa truy vấn".

Bối cảnh: Đợt 1 đổi `survey_records.status` → `manual_status` và
`legal_submissions.gov_status` → `legacy_gov_status`. Migration chạy thành công,
tất cả test khác vẫn xanh, nhưng **hai trang danh sách chết ngay** vì các câu SQL
viết tay vẫn gọi tên cũ. Không có test nào bắt được.

Bộ test này đọc thẳng câu SQL thật trong route và đối chiếu với tên cột thật,
nên lần sau đổi tên cột mà quên sửa truy vấn là đỏ ngay.
"""

import re

import pytest

from src.routes.routes_legal_submissions import _LIST_BASE_SQL
from src.routes.routes_survey_records import _BASE_SQL


# ══════════════════════════════════════════════════════════════════
# Tên cột đã bị khai tử — không được xuất hiện trong bất kỳ truy vấn nào
# ══════════════════════════════════════════════════════════════════

def test_survey_query_does_not_use_deprecated_status_column():
    """`s.status` đã đổi thành `s.manual_status` từ Đợt 1."""
    assert not re.search(r"\bs\.status\b", _BASE_SQL), (
        "Truy vấn Hồ sơ Đo vẽ vẫn gọi cột `s.status` — cột này không còn tồn tại"
    )
    assert "s.manual_status" in _BASE_SQL, (
        "Truy vấn phải đọc `s.manual_status`"
    )


def test_legal_query_does_not_use_deprecated_gov_status_column():
    """`s.gov_status` đã đổi thành `s.legacy_gov_status` từ Đợt 1."""
    assert not re.search(r"\bs\.gov_status\b", _LIST_BASE_SQL), (
        "Truy vấn Hồ sơ Pháp lý vẫn gọi cột `s.gov_status` — cột này không còn tồn tại"
    )
    assert "s.legacy_gov_status" in _LIST_BASE_SQL


# ══════════════════════════════════════════════════════════════════
# Hợp đồng với frontend phải giữ nguyên: API vẫn trả `status` / `gov_status`
# ══════════════════════════════════════════════════════════════════

def test_survey_api_returns_status_field():
    """Đổi tên cột trong CSDL không được làm vỡ giao diện.

    Từ Đợt 2, `status` không còn đọc thẳng từ cột nữa mà là giá trị TÍNH SỐNG
    (`st.effective_status`). Nhưng tên trường trả về giao diện vẫn phải là `status`.
    """
    assert "st.effective_status as status" in _BASE_SQL, (
        "Phải đặt bí danh `as status` để frontend không phải sửa gì"
    )
    assert "s.manual_status" in _BASE_SQL, (
        "Vẫn phải trả kèm `manual_status` để form Sửa biết giá trị nào do người dùng đặt"
    )


def test_legal_api_returns_gov_status_field():
    assert "s.legacy_gov_status as gov_status" in _LIST_BASE_SQL


# ══════════════════════════════════════════════════════════════════
# Chạy thật trên CSDL — bắt được cả những cột khác bị đổi tên
# ══════════════════════════════════════════════════════════════════

@pytest.mark.parametrize(
    "page_name, sql",
    [("Hồ sơ Đo vẽ", _BASE_SQL), ("Hồ sơ Pháp lý", _LIST_BASE_SQL)],
)
def test_query_execution_validates_columns(page_name, sql, db_session):
    """Chạy đúng câu SQL của trang trên CSDL thật. Sai tên cột nào cũng lộ."""
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("Hand-written dossier SQL requires PostgreSQL")

    from sqlalchemy import text

    db_session.execute(text(sql + " limit 1")).mappings().all()
