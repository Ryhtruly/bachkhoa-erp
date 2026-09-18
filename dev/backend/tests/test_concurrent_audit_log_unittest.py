"""audit_log.id sinh đồng thời không được trùng.

Cách cũ ``time.time_ns() // 1000`` trùng được ở hai tình huống thật: hai request
rơi vào cùng một micro giây, và hai container có đồng hồ lệch nhau. Sequence của
PostgreSQL không có cửa đó — nhưng phải chèn thật mới biết, chứ đọc mã nguồn thì
không chứng minh được gì.

Chạy trên database TEST riêng, không đụng Supabase.
"""

import os
import threading
import unittest

from sqlalchemy import create_engine, text

TEST_URL = os.getenv("TEST_DATABASE_URL", "")


def _bang_tam(conn, ten):
    """Bản sao tối giản của audit_log kèm sequence, để không đụng bảng thật."""
    conn.execute(text(f"drop table if exists {ten}"))
    conn.execute(text(f"drop sequence if exists {ten}_seq"))
    conn.execute(text(f"create sequence {ten}_seq as bigint"))
    conn.execute(text(f"""
        create table {ten} (
            id bigint primary key default nextval('{ten}_seq'),
            action varchar
        )
    """))
    conn.execute(text(f"alter sequence {ten}_seq owned by {ten}.id"))


@unittest.skipUnless(TEST_URL and not TEST_URL.startswith("sqlite"), "cần PostgreSQL TEST_DATABASE_URL")
class SinhIdDongThoiTests(unittest.TestCase):
    SO_LUONG = 40
    SO_LUONG_MOI_LUONG = 25

    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(TEST_URL, pool_size=cls.SO_LUONG, max_overflow=10)

    @classmethod
    def tearDownClass(cls):
        with cls.engine.begin() as conn:
            conn.execute(text("drop table if exists audit_seq_probe"))
            conn.execute(text("drop sequence if exists audit_seq_probe_seq"))
        cls.engine.dispose()

    def test_lien_tiep_khong_trung(self):
        with self.engine.begin() as conn:
            _bang_tam(conn, "audit_seq_probe")
            for _ in range(200):
                conn.execute(text("insert into audit_seq_probe (action) values ('x')"))
            tong, khac_nhau = conn.execute(text(
                "select count(*), count(distinct id) from audit_seq_probe"
            )).first()
        self.assertEqual(tong, 200)
        self.assertEqual(khac_nhau, 200, "200 lần chèn liên tiếp phải ra 200 id khác nhau")

    def test_dong_thoi_nhieu_ket_noi_khong_trung(self):
        """Mô phỏng nhiều request/container cùng ghi nhật ký một lúc."""
        with self.engine.begin() as conn:
            _bang_tam(conn, "audit_seq_probe")

        rao = threading.Barrier(self.SO_LUONG)
        loi: list[Exception] = []

        def ghi():
            try:
                rao.wait(timeout=20)          # ép mọi luồng xuất phát cùng lúc
                with self.engine.begin() as conn:
                    for _ in range(self.SO_LUONG_MOI_LUONG):
                        conn.execute(text("insert into audit_seq_probe (action) values ('y')"))
            except Exception as exc:          # noqa: BLE001 — gom để assert ở luồng chính
                loi.append(exc)

        luong = [threading.Thread(target=ghi) for _ in range(self.SO_LUONG)]
        for t in luong:
            t.start()
        for t in luong:
            t.join(timeout=60)

        self.assertEqual(loi, [], f"có luồng lỗi: {loi[:2]}")
        with self.engine.begin() as conn:
            tong, khac_nhau = conn.execute(text(
                "select count(*), count(distinct id) from audit_seq_probe"
            )).first()
        mong_doi = self.SO_LUONG * self.SO_LUONG_MOI_LUONG
        self.assertEqual(tong, mong_doi)
        self.assertEqual(khac_nhau, mong_doi,
                         f"{self.SO_LUONG} luồng ghi {mong_doi} dòng phải ra {mong_doi} id khác nhau")

    def test_cach_cu_theo_dong_ho_thi_trung(self):
        """Chứng minh vì sao phải đổi: hai lần gọi trong cùng micro giây ra cùng id."""
        import time

        sinh = lambda: time.time_ns() // 1000
        mau = [sinh() for _ in range(2000)]
        self.assertLess(
            len(set(mau)), len(mau),
            "nếu không trùng thì máy này quá chậm để thấy vấn đề — trên máy nhanh vẫn trùng",
        )


if __name__ == "__main__":
    unittest.main()
