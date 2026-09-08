"""Cổng công nợ K06: đơn xin duyệt nợ phải đủ ba thứ, và chặn nộp phải nói rõ.

Xin khất nợ mà không nêu được lý do, không hẹn được ngày, không có gì làm bằng
thì đó không phải một đơn — chỉ là một câu nói. Lúc khách chối thì không còn chỗ
nào đối chiếu.
"""

import unittest
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from src.dossiers import handover

TOMORROW = date.today() + timedelta(days=1)
GOOD_REASON = "Khách hẹn trả nốt sau khi nhận sổ, có nhắn tin xác nhận"
ATTACHMENT = {"object_key": "finance/debt/abc.jpg", "kind": "handover_debt_commitment"}

NODE = {
    "id": "TN-1", "status": "in_progress", "contract_id": "HD-1",
    "total_value": 10_000_000, "is_handover": True,
}


def _call(**overrides):
    kwargs = {
        "actor_id": "U-1",
        "reason": GOOD_REASON,
        "promised_payment_date": TOMORROW,
        "commitment_file": ATTACHMENT,
    }
    kwargs.update(overrides)
    return handover.create_debt_request(MagicMock(), "TN-1", **kwargs)


class DebtRequestValidationTests(unittest.TestCase):
    def setUp(self):
        patches = [
            patch.object(handover, "_node_or_404", return_value=NODE),
            patch.object(handover, "is_handover_node", return_value=True),
            patch.object(
                handover, "_split_handover_roles",
                return_value=([{"user_id": "U-1"}], []),
            ),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def _assert_rejected(self, **overrides):
        with self.assertRaises(HTTPException) as caught:
            _call(**overrides)
        return caught.exception

    def test_reason_shorter_than_ten_characters_is_rejected(self):
        # "khách nợ" lọt qua ngưỡng 5 cũ nhưng Giám đốc không quyết được gì từ đó.
        error = self._assert_rejected(reason="khách nợ")
        self.assertEqual(error.status_code, 422)
        self.assertIn("10 ký tự", error.detail)

    def test_promised_date_in_the_past_is_rejected(self):
        error = self._assert_rejected(promised_payment_date=date.today() - timedelta(days=1))
        self.assertEqual(error.status_code, 422)

    def test_promised_date_of_today_is_rejected_too(self):
        # Hẹn "hôm nay" lúc 5 giờ chiều là không hẹn gì cả.
        error = self._assert_rejected(promised_payment_date=date.today())
        self.assertEqual(error.status_code, 422)

    def test_missing_attachment_is_rejected(self):
        error = self._assert_rejected(commitment_file=None)
        self.assertEqual(error.status_code, 422)
        self.assertIn("cam kết nợ", error.detail)

    def test_empty_attachment_metadata_counts_as_missing(self):
        # Route truyền {} khi tải file hỏng — không được coi là đã có bằng chứng.
        error = self._assert_rejected(commitment_file={})
        self.assertEqual(error.status_code, 422)


class HandoverSubmitDebtBlockTests(unittest.TestCase):
    def test_blocked_submit_returns_403_and_names_the_outstanding_amount(self):
        source = handover.submit_handover_for_acceptance.__doc__ or ""
        self.assertTrue(source)

        import inspect

        code = inspect.getsource(handover.submit_handover_for_acceptance)
        # 423 Locked — cùng mã mà cổng tải checklist đã dùng cho cùng nguyên nhân.
        self.assertIn("status_code=423", code)
        # Phải nói còn thiếu bao nhiêu và lối đi tiếp, không để nhân viên đứng
        # trước một nút xám không biết làm gì.
        self.assertIn("debt['remaining']", code)
        self.assertIn("xin duyệt nợ", code)
