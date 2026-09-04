"""Hạn nhận lời nhờ hỗ trợ — 4 giờ, kiểm lười, mốc truyền từ ngoài.

Trách nhiệm KHÔNG rời người gửi cho tới khi có người thật sự nhận. Chưa ai nhận
mà quá hạn thì việc quay về chủ cũ, và SLA vẫn tính cho họ suốt quãng đó — nhờ
người khác không phải là cách dừng đồng hồ.

Mọi test ở đây truyền mốc thời gian cố định. Đọc đồng hồ hệ thống là test chạy
lúc 23:59 ra một kết quả, chạy lúc 00:01 ra kết quả khác.
"""

import unittest
from datetime import datetime, timedelta, timezone

from src.contracts.workflow_runtime import (
    SUPPORT_TIMEOUT_HOURS,
    help_request_expired,
)

NOW = datetime(2026, 9, 2, 10, 0, 0, tzinfo=timezone.utc)


def _request(**changes):
    return {
        "id": "H-1",
        "status": "open",
        "expires_at": NOW + timedelta(hours=1),
        **changes,
    }


class HelpRequestExpiryTests(unittest.TestCase):
    def test_still_within_the_window_is_not_expired(self):
        self.assertFalse(help_request_expired(_request(), now=NOW))

    def test_past_the_deadline_is_expired(self):
        stale = _request(expires_at=NOW - timedelta(minutes=1))
        self.assertTrue(help_request_expired(stale, now=NOW))

    def test_exactly_at_the_deadline_counts_as_expired(self):
        # Biên phải nghiêng về ĐÃ hết hạn: để lơ lửng thì một lời nhờ đúng mốc
        # nằm mãi ở đó, không lượt quét nào chịu nhận là của mình.
        self.assertTrue(help_request_expired(_request(expires_at=NOW), now=NOW))

    def test_a_claimed_request_never_expires(self):
        # Đã có người nhận thì mốc kia hết nghĩa. Vẫn cho hết hạn là giật việc ra
        # khỏi tay người đang làm dở.
        claimed = _request(status="claimed", expires_at=NOW - timedelta(days=1))
        self.assertFalse(help_request_expired(claimed, now=NOW))

    def test_a_cancelled_request_never_expires(self):
        cancelled = _request(status="cancelled", expires_at=NOW - timedelta(days=1))
        self.assertFalse(help_request_expired(cancelled, now=NOW))

    def test_a_request_with_no_deadline_is_left_alone(self):
        # Dòng cũ chưa kịp có mốc. Thà để treo còn hơn tự huỷ lời nhờ của người ta
        # chỉ vì thiếu dữ liệu.
        self.assertFalse(help_request_expired(_request(expires_at=None), now=NOW))

    def test_nothing_at_all_is_not_expired(self):
        self.assertFalse(help_request_expired(None, now=NOW))

    def test_a_naive_timestamp_is_read_as_utc_not_as_local_time(self):
        # Mốc từ JSON cache có thể rụng mất múi giờ. Đọc nhầm thành giờ địa phương
        # là lệch đúng 7 tiếng — đủ để hết hạn sớm hoặc muộn cả một buổi làm việc.
        naive = _request(expires_at=datetime(2026, 9, 2, 9, 0, 0))
        self.assertTrue(help_request_expired(naive, now=NOW))

    def test_an_iso_string_deadline_is_understood(self):
        as_text = _request(expires_at="2026-09-02T09:00:00+00:00")
        self.assertTrue(help_request_expired(as_text, now=NOW))

    def test_an_unparsable_deadline_is_left_alone(self):
        self.assertFalse(help_request_expired(_request(expires_at="hôm qua"), now=NOW))

    def test_the_window_is_four_hours(self):
        # Con số này là luật nghiệp vụ, không phải hằng số tuỳ tiện — đổi nó là
        # đổi lúc trách nhiệm quay về người gửi.
        self.assertEqual(SUPPORT_TIMEOUT_HOURS, 4)

        sent_at = NOW
        deadline = sent_at + timedelta(hours=SUPPORT_TIMEOUT_HOURS)
        just_inside = _request(expires_at=deadline)
        self.assertFalse(
            help_request_expired(just_inside, now=deadline - timedelta(seconds=1))
        )
        self.assertTrue(help_request_expired(just_inside, now=deadline))
