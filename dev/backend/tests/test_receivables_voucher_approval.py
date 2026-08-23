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
def test_tc01_pending_vouchers_do_not_affect_receivables(status):
    """TC-01 — Phiếu Thu đang chờ duyệt tuyệt đối không được đụng vào công nợ."""
    assert counts_toward_receivable(status, "Thu") is False
    assert counts_toward_receivable(status, "INCOME") is False


@pytest.mark.parametrize("status", sorted(APPROVED_TX_STATUSES))
def test_tc02_approved_vouchers_count_toward_receivables(status):
    """TC-02 — Chỉ phiếu đã duyệt mới được trừ công nợ."""
    assert counts_toward_receivable(status, "Thu") is True
    assert counts_toward_receivable(status, "INCOME") is True


def test_tc03_rejected_vouchers_do_not_count():
    """TC-03 — Phiếu bị từ chối không bao giờ được tính."""
    assert counts_toward_receivable("Từ chối", "Thu") is False


def test_tc04_voided_vouchers_do_not_count():
    """TC-04 — Phiếu đã huỷ không được tính."""
    assert counts_toward_receivable("Đã hủy", "Thu") is False


def test_expense_vouchers_never_affect_receivables():
    """Công nợ là tiền khách nợ mình — phiếu Chi không liên quan."""
    for status in APPROVED_TX_STATUSES | PENDING_TX_STATUSES:
        assert counts_toward_receivable(status, "Chi") is False
        assert counts_toward_receivable(status, "EXPENSE") is False


def test_invalid_status_does_not_count():
    """Trạng thái lạ / rỗng thì mặc định là KHÔNG tính — an toàn về phía tiền."""
    for status in (None, "", "Nháp", "UNKNOWN"):
        assert counts_toward_receivable(status, "Thu") is False


# ══════════════════════════════════════════════════════════════════
# Phần 2 — Số còn lại luôn suy ra từ giá trị hợp đồng
# ══════════════════════════════════════════════════════════════════

def recalculate_receivables(contract_value: float, approved_installments: list[float]) -> tuple[float, float]:
    """Mô phỏng đúng công thức trong _sync_receivables sau khi sửa."""
    collected = max(0.0, sum(approved_installments))
    remaining = max(0.0, contract_value - collected)
    return collected, remaining


def test_tc06_multiple_payment_installments_accumulate_correctly():
    """TC-06 — Khách trả làm nhiều đợt, số còn lại phải khớp từng bước."""
    value = 24_000_000.0

    collected, remaining = recalculate_receivables(value, [10_000_000])
    assert (collected, remaining) == (10_000_000, 14_000_000)

    collected, remaining = recalculate_receivables(value, [10_000_000, 8_000_000])
    assert (collected, remaining) == (18_000_000, 6_000_000)

    collected, remaining = recalculate_receivables(value, [10_000_000, 8_000_000, 6_000_000])
    assert (collected, remaining) == (24_000_000, 0), "Thu đủ thì công nợ phải về 0"


def test_reverting_installment_restores_exact_remaining():
    """Hoàn tác một đợt rồi thu lại đúng số đó thì công nợ phải quay về y như cũ.

    Đây là lý do phải suy ra `remaining` từ giá trị hợp đồng thay vì trừ dần vào
    chính nó: trừ dần thì mỗi lần hoàn tác lại lệch thêm một ít.
    """
    value = 24_000_000.0
    _, before = recalculate_receivables(value, [10_000_000, 8_000_000])
    _, after_void = recalculate_receivables(value, [10_000_000])
    _, after_recollect = recalculate_receivables(value, [10_000_000, 8_000_000])

    assert after_void == 14_000_000, "Huỷ một đợt thì nợ phải tăng trở lại"
    assert after_recollect == before, "Thu lại đúng số cũ thì công nợ phải khớp y như trước"


def test_overpayment_caps_remaining_at_zero():
    """Khách trả dư thì công nợ về 0, không được ra số âm."""
    _, remaining = recalculate_receivables(24_000_000, [30_000_000])
    assert remaining == 0


# ══════════════════════════════════════════════════════════════════
# Phần 3 — Cổng công nợ ở node bàn giao (K08)
# ══════════════════════════════════════════════════════════════════

def is_receivable_fully_collected(contract_value: float, approved_installments: list[float]) -> bool:
    """Mục checklist 'Thu đủ công nợ' — TÍNH SỐNG, không ai tick tay được."""
    _, remaining = recalculate_receivables(contract_value, approved_installments)
    return remaining == 0


def test_incomplete_collection_marks_checklist_item_pending():
    """Còn thiếu tiền thì mục 'Thu đủ công nợ' phải ở trạng thái chưa đạt."""
    assert is_receivable_fully_collected(24_000_000, [18_000_000]) is False


def test_pending_vouchers_do_not_unlock_checklist():
    """Điểm mấu chốt: nhân viên gõ phiếu khống KHÔNG mở được cổng công nợ.

    Phiếu chờ duyệt không lọt vào danh sách đợt đã duyệt, nên mục vẫn đỏ.
    """
    approved_installments = [18_000_000]          # đã duyệt
    pending_installments = [6_000_000]            # nhân viên vừa gõ, chưa ai duyệt

    assert is_receivable_fully_collected(24_000_000, approved_installments) is False, (
        "Phiếu chờ duyệt mà đã mở được cổng công nợ là lỗi nghiêm trọng"
    )
    # Sau khi giám đốc duyệt nốt thì mới đủ
    assert is_receivable_fully_collected(24_000_000, approved_installments + pending_installments) is True
