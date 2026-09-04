"""Cổng K01 với phiếu miễn giấy.

Chạy trên schema THẬT trong một transaction rồi rollback — mock không bắt được
lỗi SQL, mà chính SQL mới là chỗ dễ sai nhất ở đây: điều kiện "đang được miễn"
nằm trong truy vấn, và nó phải giống hệt nhau giữa cổng chặn và màn hiển thị.

Hai chiều đều phải đúng:
  - không thủng cổng: thiếu giấy thật thì vẫn chặn
  - không chặn oan  : miễn hợp lệ thì cho qua
"""
import unittest

from sqlalchemy import text

# Bộ bảng sổ giấy tờ được tạo bằng SQL thuần trong supabase/migrations, không
# nằm trong metadata của model — nên DB test dựng từ model KHÔNG có chúng. Dò
# thẳng schema thay vì đoán qua biến môi trường: nói đúng lý do bỏ qua, và tự
# chạy trở lại ngay khi được trỏ vào một DB có schema thật.
BANG_CAN_CO = ("dossier_document_slots", "document_slot_change_requests",
               "dossier_document_links", "dossier_documents",
               "document_template_applicabilities")


class MienGiayToTests(unittest.TestCase):
    def setUp(self):
        from src.db.database import SessionLocal

        from tests.fixtures_so_giay_to import (
            build_test_context, create_test_user, insert_document_slot, get_missing_documents,
        )

        self.db = SessionLocal()
        thieu = get_missing_documents(self.db)
        if thieu:
            self.db.close()
            self.skipTest(
                "DB đang dùng thiếu bảng: " + ", ".join(thieu)
                + ". Chạy dev/backend/scripts/dung_schema_test.py trước."
            )

        # Tự dựng bối cảnh thay vì đi tìm dữ liệu có sẵn: mượn dữ liệu môi
        # trường thì test phụ thuộc vào việc ai đó đã bấm gì, chạy hôm nay xanh
        # mai đỏ mà không ai hiểu vì sao.
        boi_canh = build_test_context(self.db)
        self.hd_id = boi_canh["contract_id"]
        self.sl_id = boi_canh["hang_muc"][0]["id"]
        self.nv = create_test_user(self.db)
        self.gd = self.nv
        self.o = insert_document_slot(
            self.db, contract_id=self.hd_id, service_line_id=self.sl_id,
            name="THU-NGHIEM giấy hôn nhân", required=True,
        )

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    def _con_doi(self):
        from src.dossiers.register import k01_blockers

        return 'THU-NGHIEM giấy hôn nhân' in k01_blockers(self.db, self.sl_id)["required_missing"]

    def _xin(self, ly_do="Chủ đất độc thân, không có giấy kết hôn"):
        from src.dossiers.register import request_slot_waiver

        return request_slot_waiver(
            self.db, self.o, service_line_id=self.sl_id, reason=ly_do,
            requester_id=self.nv, is_admin=True)

    def test_chua_xin_mien_thi_van_doi_giay(self):
        self.assertTrue(self._con_doi())

    def test_xin_roi_thi_thong_cong_nhung_phai_hien_ra_cho_sep(self):
        """ĐÃ ĐỔI CHỦ ĐÍCH sang mô hình MỘT CỔNG.

        Bản trước chốt rằng phiếu chưa duyệt thì vẫn chặn nộp, kèm lo ngại
        "xin xong thông ngay thì cổng thành hình thức". Lo ngại đó đúng, nhưng
        cách chặn cũ tạo ra một cái tệ hơn: bước treo cứng chờ Giám đốc vào một
        màn khác bấm duyệt, trong khi chính người đó sẽ duyệt nghiệm thu ngay
        sau đấy. Nhân viên gặp giấy khách không có thật thì đứng im vô thời hạn.

        Mô hình mới: phiếu chờ THÔI chặn nộp, nhưng bắt buộc phải nổi lên trong
        waiver_pending để Giám đốc nhìn thấy trước khi bấm duyệt nghiệm thu —
        và chính quyết định nghiệm thu chốt số phận phiếu đó. Cổng không mất,
        nó dời sang chỗ người có thẩm quyền thật sự đang đứng.

        Vì vậy điều PHẢI giữ ở đây là: không bao giờ được im lặng biến mất.
        """
        from src.dossiers.register import k01_blockers

        self._xin()
        trang_thai = k01_blockers(self.db, self.sl_id)

        self.assertFalse(self._con_doi(), "phiếu chờ duyệt vẫn còn chặn nộp")
        self.assertIn(
            'THU-NGHIEM giấy hôn nhân', trang_thai["waiver_pending"],
            "phiếu chờ duyệt bị nuốt mất — Giám đốc sẽ duyệt nghiệm thu mà không "
            "biết hồ sơ đang bỏ giấy nào")
        # Chưa duyệt thì chưa được tính là đã miễn.
        self.assertNotIn('THU-NGHIEM giấy hôn nhân', trang_thai["waived"])

    def test_sep_tu_choi_thi_van_doi(self):
        from src.dossiers.register import review_slot_change

        phieu = self._xin()
        review_slot_change(self.db, phieu["id"], decision="rejected",
                           review_note="Phải có, đi lấy", actor_id=self.gd)
        self.assertTrue(self._con_doi())

    def test_sep_duyet_thi_thoi_doi_nhung_van_ghi_nhan(self):
        from src.dossiers.register import k01_blockers, review_slot_change

        phieu = self._xin()
        review_slot_change(self.db, phieu["id"], decision="approved",
                           review_note="Cắm mốc không cần giấy hôn nhân", actor_id=self.gd)
        trang_thai = k01_blockers(self.db, self.sl_id)
        self.assertNotIn('THU-NGHIEM giấy hôn nhân', trang_thai["required_missing"])
        # Thôi đòi KHÔNG có nghĩa là biến mất: hồ sơ này lẽ ra cần tờ đó, phải
        # còn chỗ đọc lại được điều ấy.
        self.assertIn('THU-NGHIEM giấy hôn nhân', trang_thai["waived"])

    def test_rut_mien_thi_doi_lai(self):
        from src.dossiers.register import review_slot_change, revoke_slot_waiver

        phieu = self._xin()
        review_slot_change(self.db, phieu["id"], decision="approved",
                           review_note="ok", actor_id=self.gd)
        self.assertFalse(self._con_doi())
        revoke_slot_waiver(self.db, self.o, service_line_id=self.sl_id, actor_id=self.gd)
        self.assertTrue(self._con_doi())

    def test_man_hien_thi_noi_cung_mot_dieu_voi_cong_chan(self):
        """Nút sáng mà máy chủ từ chối (hoặc ngược lại) là lỗi tệ nhất ở đây."""
        from src.dossiers.register import get_register, review_slot_change

        phieu = self._xin()
        review_slot_change(self.db, phieu["id"], decision="approved",
                           review_note="Cắm mốc không cần", actor_id=self.gd)
        so = get_register(self.db, self.hd_id, service_line_id=self.sl_id)
        o_hien = [x for nhom in so["groups"] for x in nhom["slots"] if x["id"] == self.o][0]

        self.assertTrue(o_hien["is_waived"])
        self.assertFalse(self._con_doi())
        self.assertEqual(o_hien["waiver"]["reason"], "Chủ đất độc thân, không có giấy kết hôn")
        self.assertEqual(o_hien["waiver"]["director_note"], "Cắm mốc không cần")

    def test_khong_xin_mien_hai_lan_cho_cung_mot_o(self):
        from fastapi import HTTPException
        from src.dossiers.register import review_slot_change

        phieu = self._xin()
        with self.assertRaises(HTTPException) as treo:
            self._xin()
        self.assertEqual(treo.exception.status_code, 409)

        review_slot_change(self.db, phieu["id"], decision="approved",
                           review_note="ok", actor_id=self.gd)
        with self.assertRaises(HTTPException) as treo2:
            self._xin()
        self.assertIn("đã được miễn", treo2.exception.detail)

    def test_ly_do_qua_so_sai_thi_khong_nhan(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as treo:
            self._xin(ly_do="ko")
        self.assertEqual(treo.exception.status_code, 422)
