"""Nhật ký không được đánh mất dấu người thao tác.

`audit_log.actor_id` có khoá ngoại tới `users`. Trước đây, actor không tồn tại
thì code lặng lẽ ghi null — dòng nhật ký còn đó nhưng không ai biết ai làm, mà
đây lại đúng là những thao tác cần truy trách nhiệm nhất: duyệt thu chi, khoá
bảng lương, xoá nợ.

Luật: null chỉ dành cho sự kiện HỆ THỐNG thật sự (không có actor). Actor có mà
tra không ra thì phải giữ lại id trong payload để còn lần được.
"""

import json
import os
import unittest
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine, text


class LogActionGiuDauActorTests(unittest.TestCase):
    """log_action — CRITICAL, 9 caller tài chính. Đường chạy bình thường KHÔNG đổi."""

    def _chay(self, actor_id, user_ton_tai):
        from src.core import audit

        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = (
            ("u1",) if user_ton_tai else None
        )
        with patch.object(audit, "AuditLog") as AuditLog:
            audit.log_action(db, actor_id, "APPROVE_CASHFLOW", "cashflow",
                             payload={"amount": 1000})
        return AuditLog.call_args.kwargs

    def test_actor_hop_le_thi_khong_doi_gi(self):
        """Ca thường: actor giữ nguyên, payload không mọc thêm khoá nào."""
        kw = self._chay("u1", user_ton_tai=True)
        self.assertEqual(kw["actor_id"], "u1")
        self.assertEqual(kw["payload_json"], {"amount": 1000})

    def test_su_kien_he_thong_thi_null_la_hop_le(self):
        """Không có actor = hệ thống tự làm. Null đúng, không cần đánh dấu."""
        kw = self._chay(None, user_ton_tai=False)
        self.assertIsNone(kw["actor_id"])
        self.assertNotIn("actor_id_missing", kw["payload_json"])

    def test_actor_tra_khong_ra_thi_giu_lai_id_trong_payload(self):
        """Đây là ca cũ nuốt mất dấu. Nay id phải còn trong payload."""
        kw = self._chay("u-da-xoa", user_ton_tai=False)
        self.assertIsNone(kw["actor_id"], "FK buộc null, không cãi được")
        self.assertEqual(kw["payload_json"]["actor_id_missing"], "u-da-xoa")
        self.assertEqual(kw["payload_json"]["amount"], 1000, "dữ liệu cũ giữ nguyên")

    def test_khong_ghi_de_payload_goc(self):
        """Người gọi truyền dict của họ; không được sửa tại chỗ."""
        from src.core import audit

        goc = {"amount": 1000}
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        with patch.object(audit, "AuditLog"):
            audit.log_action(db, "u-la", "X", "y", payload=goc)
        self.assertEqual(goc, {"amount": 1000})


@unittest.skipUnless(os.getenv("TEST_DATABASE_URL"), "cần TEST_DATABASE_URL")
class AuditSqlTrucTiepGiuDauActorTests(unittest.TestCase):
    """Hai chỗ ghi audit bằng SQL thô — chạy thật trên database test.

    Kiểm bằng chuỗi trong mã nguồn thì chứng minh được rất ít; câu lệnh có chạy
    đúng hay không phải để PostgreSQL trả lời.
    """

    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(os.environ["TEST_DATABASE_URL"])

    @classmethod
    def tearDownClass(cls):
        cls.engine.dispose()

    def _chay(self, actor_id, actor_co_that):
        """Gọi thẳng hàm thật trong một transaction CUỘN LẠI.

        Cố ý không tạo/xoá bảng: schema của database test do conftest dựng và
        nhiều bộ test khác dùng chung. Một lệnh ``drop table users`` ở đây là kéo
        sập cả những bộ test không liên quan.
        """
        from src.dossiers import slot_requests

        conn = self.engine.connect()
        trans = conn.begin()
        try:
            if actor_co_that:
                # Mượn một user có sẵn thay vì chèn mới: bảng users có nhiều cột
                # NOT NULL, và test này không nói gì về hình dạng của users.
                actor_id = conn.execute(text("select id from users limit 1")).scalar()
                if not actor_id:
                    self.skipTest("database test chưa có user nào")
            slot_requests._audit(conn, "REQ-SMOKE", "SUBMITTED", actor_id, "ghi chu")
            return conn.execute(text("""
                select actor_id, payload_json from audit_log
                where object_id = 'REQ-SMOKE'
            """)).mappings().first()
        finally:
            trans.rollback()
            conn.close()

    @staticmethod
    def _payload(row):
        """payload_json là JSONB ở database dựng từ model nhưng TEXT trên live.

        Đây là schema drift có thật: model khai JSONB, còn Supabase đang là text.
        Test không phải chỗ sửa chuyện đó, nhưng cũng không được giả vờ nó không
        tồn tại — nên đọc được cả hai kiểu.
        """
        raw = row["payload_json"]
        return raw if isinstance(raw, dict) else json.loads(raw)

    def test_actor_hop_le_thi_ghi_dung_va_khong_danh_dau(self):
        row = self._chay(None, actor_co_that=True)
        self.assertIsNotNone(row["actor_id"], "actor có thật phải được ghi vào cột")
        payload = self._payload(row)
        self.assertNotIn("actor_id_missing", payload)
        self.assertEqual(payload["note"], "ghi chu")

    def test_actor_tra_khong_ra_thi_null_nhung_giu_id_trong_payload(self):
        row = self._chay("u-da-bi-xoa", actor_co_that=False)
        self.assertIsNone(row["actor_id"], "khoá ngoại buộc null")
        payload = self._payload(row)
        self.assertEqual(payload["actor_id_missing"], "u-da-bi-xoa",
                         "mất dấu người thao tác là điều không được phép")
        self.assertEqual(payload["note"], "ghi chu", "dữ liệu cũ vẫn còn")

    def test_khong_con_cau_case_when_nuot_actor(self):
        """Chốt ở mức mã nguồn: không nơi nào còn nuốt actor rồi im lặng."""
        for path in ("/app/src/dossiers/slot_requests.py", "/app/src/dossiers/register.py"):
            src = open(path, encoding="utf-8").read()
            self.assertNotIn("then :actor else null end", src, path)


if __name__ == "__main__":
    unittest.main()
