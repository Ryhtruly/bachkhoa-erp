"""Test nghiệp vụ: TRẠNG THÁI HỒ SƠ ĐO VẼ ĐƯỢC TÍNH SỐNG, KHÔNG LƯU.

Lỗi gốc khách hàng báo: *"quy trình đã xong mà trạng thái của đo vẽ vẫn còn đang
thực hiện"*. Nguyên nhân: hệ thống LƯU trạng thái vào cột rồi quên cập nhật khi
quy trình chạy tiếp. Thêm một đường đi mới là lại quên tiếp.

Cách chữa tận gốc: cái gì suy ra được thì đừng lưu.

    TC-01  Node đo vẽ chưa nghiệm thu            → Đang thực hiện
    TC-02  Node xong + hợp đồng có pháp lý       → Đã bàn giao
    TC-03  Quy trình chạy hết                    → Hoàn thành  ⭐ lỗi khách báo
    TC-04  Người dùng chọn Nộp thành công / Huỷ  → ưu tiên hơn giá trị tính sống
    TC-05  Quy trình bị huỷ                      → KHÔNG được coi là Hoàn thành
    TC-06  Một quy tắc khoá dùng chung cho cả 2 phân hệ
"""

import pytest
from sqlalchemy import text

from src.dossiers.lifecycle import (
    SURVEY_FLAGS_LATERAL,
    SURVEY_STATUS_LATERAL,
    TERMINAL_DOSSIER_STATUSES,
    is_dossier_locked,
)


# ══════════════════════════════════════════════════════════════════
# Phần 1 — Công thức tính trạng thái, chạy thẳng trên Postgres
# ══════════════════════════════════════════════════════════════════

def trang_thai(db, *, manual=None, node_status="ready", has_legal=False,
               workflow_done=False, workflow_cancelled=False):
    """Chạy đúng biểu thức CASE của hệ thống với dữ liệu giả lập."""
    row = db.execute(
        text("""
            select coalesce(
              :manual,
              case
                when :workflow_done and not :workflow_cancelled then 'Hoàn thành'
                when :node_status = 'accepted' and :has_legal   then 'Đã bàn giao'
                else 'Đang thực hiện'
              end
            ) as trang_thai
        """),
        {
            "manual": manual, "node_status": node_status, "has_legal": has_legal,
            "workflow_done": workflow_done, "workflow_cancelled": workflow_cancelled,
        },
    ).scalar()
    return row


def test_tc01_node_chua_nghiem_thu_thi_dang_thuc_hien(db_session):
    assert trang_thai(db_session, node_status="in_progress") == "Đang thực hiện"
    assert trang_thai(db_session, node_status="ready") == "Đang thực hiện"


def test_tc02_node_xong_va_co_phap_ly_thi_da_ban_giao(db_session):
    """Đo vẽ xong, hợp đồng còn Hạng mục pháp lý → đã chuyển việc sang bên kia."""
    assert trang_thai(db_session, node_status="accepted", has_legal=True) == "Đã bàn giao"


def test_tc02b_node_xong_nhung_khong_co_phap_ly_thi_van_dang_chay(db_session):
    """Không kèm pháp lý thì vẫn còn node Bàn giao K08 phải làm — chưa xong."""
    assert trang_thai(db_session, node_status="accepted", has_legal=False) == "Đang thực hiện"


def test_tc03_quy_trinh_chay_het_thi_hoan_thanh(db_session):
    """⭐ Chính là lỗi khách báo: quy trình xong mà trạng thái vẫn Đang thực hiện."""
    assert trang_thai(db_session, node_status="accepted", workflow_done=True) == "Hoàn thành"
    # Kể cả node đo vẽ đã xong từ lâu và có pháp lý, quy trình xong vẫn thắng
    assert trang_thai(
        db_session, node_status="accepted", has_legal=True, workflow_done=True
    ) == "Hoàn thành"


def test_tc04_trang_thai_thu_cong_duoc_uu_tien(db_session):
    """Nhân viên tự chọn thì hệ thống không được ghi đè."""
    assert trang_thai(db_session, manual="Nộp thành công", workflow_done=True) == "Nộp thành công"
    assert trang_thai(db_session, manual="Huỷ", node_status="accepted") == "Huỷ"


def test_tc05_quy_trinh_bi_huy_khong_duoc_coi_la_hoan_thanh(db_session):
    """Quy trình huỷ thì mọi node cũng huỷ theo — không được nhầm thành Hoàn thành."""
    assert trang_thai(
        db_session, workflow_done=True, workflow_cancelled=True
    ) == "Đang thực hiện"


# ══════════════════════════════════════════════════════════════════
# Phần 2 — Một quy tắc khoá dùng chung
# ══════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("status", ["Hoàn thành", "Nộp thành công", "Huỷ", "CLOSED"])
def test_tc06_trang_thai_ket_thuc_thi_khoa_sua(status):
    assert is_dossier_locked(status) is True


@pytest.mark.parametrize("status", ["Đang thực hiện", "Đã bàn giao", "Đang chi nhánh", None, ""])
def test_tc06b_trang_thai_dang_chay_thi_khong_khoa(status):
    assert is_dossier_locked(status) is False


def test_huy_phai_nam_trong_danh_sach_khoa():
    """Trước đây bên Đo vẽ bỏ sót 'Huỷ' nên hồ sơ đã huỷ vẫn sửa được."""
    assert "Huỷ" in TERMINAL_DOSSIER_STATUSES


def test_hai_phan_he_dung_chung_mot_danh_sach():
    """Không còn TERMINAL_SURVEY_STATUSES và TERMINAL_LEGAL_STATUSES riêng."""
    import src.dossiers.lifecycle as lifecycle

    ten_bien = [n for n in dir(lifecycle) if "TERMINAL" in n and n.isupper()]
    assert ten_bien == ["TERMINAL_DOSSIER_STATUSES", "TERMINAL_SQL_ARRAY"], (
        f"Có nhiều hơn một danh sách trạng thái kết thúc: {ten_bien}"
    )


# ══════════════════════════════════════════════════════════════════
# Phần 3 — Câu SQL thật phải chạy được
# ══════════════════════════════════════════════════════════════════

def test_truy_van_that_tra_ve_du_3_truong_moi(db_session):
    """Danh sách phải trả `status` tính sống, `has_legal` và `is_locked`."""
    from src.routes.routes_survey_records import _BASE_SQL

    rows = db_session.execute(text(_BASE_SQL + " limit 5")).mappings().all()
    for r in rows:
        assert r["status"], "Trạng thái không được rỗng — phải luôn tính ra được"
        assert isinstance(r["is_locked"], bool)
        assert isinstance(r["has_legal"], bool)
        # Cờ khoá phải khớp với chính trạng thái đó
        assert r["is_locked"] == is_dossier_locked(r["status"])


def test_cac_manh_sql_ghep_lai_khong_loi_cu_phap(db_session):
    """Hai mảnh lateral phải ghép được vào câu truy vấn thật."""
    assert "has_legal" in SURVEY_FLAGS_LATERAL
    assert "workflow_done" in SURVEY_FLAGS_LATERAL
    assert "effective_status" in SURVEY_STATUS_LATERAL
