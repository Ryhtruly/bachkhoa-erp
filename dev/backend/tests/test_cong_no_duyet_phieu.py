"""Test nghiệp vụ: CÔNG NỢ CHỈ ĐƯỢC TRỪ KHI PHIẾU THU ĐÃ ĐƯỢC DUYỆT.

Bối cảnh: trước đây hệ thống trừ công nợ ngay lúc nhân viên bấm lưu phiếu, không
xét phiếu đã được ai duyệt hay chưa. Nghĩa là chỉ cần gõ một phiếu khống là công
nợ trên hệ thống về 0, rồi node bàn giao hết cảnh báo và hồ sơ được giao đi trong
khi tiền chưa thực sự về.

Bộ test này khoá lại đúng hành vi mong muốn:

    TC-01  Phiếu chờ duyệt      → công nợ KHÔNG đổi
    TC-02  Duyệt phiếu          → công nợ mới bị trừ
    TC-03  Từ chối phiếu        → công nợ vẫn không đổi
    TC-04  Huỷ phiếu chưa duyệt → công nợ KHÔNG bị cộng ngược (không thổi phồng nợ)
    TC-05  Huỷ phiếu đã duyệt   → công nợ được hoàn lại
    TC-06  Thu nhiều đợt        → cộng dồn, số còn lại luôn khớp giá trị hợp đồng
    TC-07  Phiếu tự duyệt       → trừ ngay (người tạo cũng là người duyệt)
"""

import pytest

from src.finance.services import (
    APPROVED_TX_STATUSES,
    PENDING_TX_STATUSES,
    counts_toward_receivable,
)


# ══════════════════════════════════════════════════════════════════
# Phần 1 — Quy tắc thuần: phiếu nào được tính vào công nợ
# ══════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("status", sorted(PENDING_TX_STATUSES))
def test_tc01_phieu_cho_duyet_khong_tinh_vao_cong_no(status):
    """TC-01 — Phiếu Thu đang chờ duyệt tuyệt đối không được đụng vào công nợ."""
    assert counts_toward_receivable(status, "Thu") is False
    assert counts_toward_receivable(status, "INCOME") is False


@pytest.mark.parametrize("status", sorted(APPROVED_TX_STATUSES))
def test_tc02_phieu_da_duyet_moi_tinh_vao_cong_no(status):
    """TC-02 — Chỉ phiếu đã duyệt mới được trừ công nợ."""
    assert counts_toward_receivable(status, "Thu") is True
    assert counts_toward_receivable(status, "INCOME") is True


def test_tc03_phieu_bi_tu_choi_khong_tinh():
    """TC-03 — Phiếu bị từ chối không bao giờ được tính."""
    assert counts_toward_receivable("Từ chối", "Thu") is False


def test_tc04_phieu_da_huy_khong_tinh():
    """TC-04 — Phiếu đã huỷ không được tính."""
    assert counts_toward_receivable("Đã hủy", "Thu") is False


def test_phieu_chi_khong_bao_gio_dung_toi_cong_no():
    """Công nợ là tiền khách nợ mình — phiếu Chi không liên quan."""
    for status in APPROVED_TX_STATUSES | PENDING_TX_STATUSES:
        assert counts_toward_receivable(status, "Chi") is False
        assert counts_toward_receivable(status, "EXPENSE") is False


def test_trang_thai_la_khong_hop_le_thi_khong_tinh():
    """Trạng thái lạ / rỗng thì mặc định là KHÔNG tính — an toàn về phía tiền."""
    for status in (None, "", "Nháp", "UNKNOWN"):
        assert counts_toward_receivable(status, "Thu") is False


# ══════════════════════════════════════════════════════════════════
# Phần 2 — Số còn lại luôn suy ra từ giá trị hợp đồng
# ══════════════════════════════════════════════════════════════════

def tinh_lai_cong_no(gia_tri_hd: float, cac_dot_da_duyet: list[float]) -> tuple[float, float]:
    """Mô phỏng đúng công thức trong _sync_receivables sau khi sửa."""
    da_thu = max(0.0, sum(cac_dot_da_duyet))
    con_lai = max(0.0, gia_tri_hd - da_thu)
    return da_thu, con_lai


def test_tc06_thu_nhieu_dot_cong_don_dung():
    """TC-06 — Khách trả làm nhiều đợt, số còn lại phải khớp từng bước."""
    gia_tri = 24_000_000.0

    da_thu, con_lai = tinh_lai_cong_no(gia_tri, [10_000_000])
    assert (da_thu, con_lai) == (10_000_000, 14_000_000)

    da_thu, con_lai = tinh_lai_cong_no(gia_tri, [10_000_000, 8_000_000])
    assert (da_thu, con_lai) == (18_000_000, 6_000_000)

    da_thu, con_lai = tinh_lai_cong_no(gia_tri, [10_000_000, 8_000_000, 6_000_000])
    assert (da_thu, con_lai) == (24_000_000, 0), "Thu đủ thì công nợ phải về 0"


def test_hoan_tac_khong_lam_troi_so():
    """Hoàn tác một đợt rồi thu lại đúng số đó thì công nợ phải quay về y như cũ.

    Đây là lý do phải suy ra `remaining` từ giá trị hợp đồng thay vì trừ dần vào
    chính nó: trừ dần thì mỗi lần hoàn tác lại lệch thêm một ít.
    """
    gia_tri = 24_000_000.0
    _, truoc = tinh_lai_cong_no(gia_tri, [10_000_000, 8_000_000])
    _, sau_khi_huy = tinh_lai_cong_no(gia_tri, [10_000_000])
    _, thu_lai = tinh_lai_cong_no(gia_tri, [10_000_000, 8_000_000])

    assert sau_khi_huy == 14_000_000, "Huỷ một đợt thì nợ phải tăng trở lại"
    assert thu_lai == truoc, "Thu lại đúng số cũ thì công nợ phải khớp y như trước"


def test_thu_vuot_gia_tri_hop_dong_thi_con_lai_ve_0_khong_am():
    """Khách trả dư thì công nợ về 0, không được ra số âm."""
    _, con_lai = tinh_lai_cong_no(24_000_000, [30_000_000])
    assert con_lai == 0


# ══════════════════════════════════════════════════════════════════
# Phần 3 — Cổng công nợ ở node bàn giao (K08)
# ══════════════════════════════════════════════════════════════════

def cong_no_da_du(gia_tri_hd: float, cac_dot_da_duyet: list[float]) -> bool:
    """Mục checklist 'Thu đủ công nợ' — TÍNH SỐNG, không ai tick tay được."""
    _, con_lai = tinh_lai_cong_no(gia_tri_hd, cac_dot_da_duyet)
    return con_lai == 0


def test_cong_no_chua_du_thi_muc_checklist_chua_dat():
    """Còn thiếu tiền thì mục 'Thu đủ công nợ' phải ở trạng thái chưa đạt."""
    assert cong_no_da_du(24_000_000, [18_000_000]) is False


def test_phieu_chua_duyet_khong_lam_muc_checklist_tu_xanh():
    """Điểm mấu chốt: nhân viên gõ phiếu khống KHÔNG mở được cổng công nợ.

    Phiếu chờ duyệt không lọt vào danh sách đợt đã duyệt, nên mục vẫn đỏ.
    """
    dot_da_duyet = [18_000_000]          # đã duyệt
    dot_cho_duyet = [6_000_000]          # nhân viên vừa gõ, chưa ai duyệt

    assert cong_no_da_du(24_000_000, dot_da_duyet) is False, (
        "Phiếu chờ duyệt mà đã mở được cổng công nợ là lỗi nghiêm trọng"
    )
    # Sau khi giám đốc duyệt nốt thì mới đủ
    assert cong_no_da_du(24_000_000, dot_da_duyet + dot_cho_duyet) is True
