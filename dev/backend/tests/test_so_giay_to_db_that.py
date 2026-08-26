"""Năm kiểm thử sổ giấy tờ chạy trên DB THẬT.

Mock không bắt được lỗi ở đây: điều kiện "đang được miễn", việc materialize, và
sự cô lập giữa hai Hạng mục đều nằm trong SQL. Mock chỉ chứng minh Python gọi
đúng hàm, không chứng minh câu lệnh trả đúng dòng.

Mỗi test tự dựng dữ liệu rồi rollback — chạy được trên DB trống, không để lại
dấu vết. Xem tests/fixtures_so_giay_to.py.
"""
import unittest

from fastapi import HTTPException
from sqlalchemy import text

from tests.fixtures_so_giay_to import (
    dung_boi_canh, gan_tep_vao_o, giao_viec, nguoi_dung, them_buoc_k01, them_mau,
    them_nhiem_vu, them_o_giay, them_tep, thieu_bang,
)


class SoGiayToDbThatTests(unittest.TestCase):
    def setUp(self):
        from src.db.database import SessionLocal

        self.db = SessionLocal()
        thieu = thieu_bang(self.db)
        if thieu:
            self.db.close()
            self.skipTest(
                "DB đang dùng thiếu bảng: " + ", ".join(thieu)
                + ". Chạy dev/backend/scripts/dung_schema_test.py trước."
            )
        from src.dossiers import register

        self.register = register
        register.reset_schema_cache()

    def tearDown(self):
        self.db.rollback()
        self.db.close()
        self.register.reset_schema_cache()

    def _so_o(self, service_line_id) -> int:
        return self.db.execute(
            text("select count(*) from public.dossier_document_slots where service_line_id = :sl"),
            {"sl": service_line_id},
        ).scalar()

    # ── 1 ────────────────────────────────────────────────────────────────────
    def test_materialize_dung_danh_sach_da_chon(self):
        boi_canh = dung_boi_canh(self.db)
        sl = boi_canh["hang_muc"][0]["id"]
        a = them_mau(self.db, ten="Sổ đỏ thử")
        b = them_mau(self.db, ten="CCCD thử")
        them_mau(self.db, ten="Giấy không chọn thử")

        so = self.register.materialize_service_line_register(
            self.db, sl, template_ids=[a, b], actor_id=None)

        self.assertEqual(so, 2)
        ten = {r[0] for r in self.db.execute(
            text("select name from public.dossier_document_slots where service_line_id = :sl"),
            {"sl": sl})}
        self.assertEqual(ten, {"Sổ đỏ thử", "CCCD thử"})

    def test_danh_sach_rong_tao_0_o_va_van_la_v2(self):
        """Chọn 'không cần giấy nào' là một quyết định hợp lệ, không phải lỗi."""
        boi_canh = dung_boi_canh(self.db)
        sl = boi_canh["hang_muc"][0]["id"]
        them_mau(self.db, ten="Sổ đỏ thử")

        so = self.register.materialize_service_line_register(
            self.db, sl, template_ids=[], actor_id=None)

        self.assertEqual(so, 0)
        self.assertEqual(self._so_o(sl), 0)
        # Không có slot KHÔNG phải dấu hiệu của mô hình cũ.
        self.assertEqual(self.register.register_version(self.db, sl), 2)

    def test_sentinel_chi_lay_is_default_true(self):
        boi_canh = dung_boi_canh(self.db)
        sl = boi_canh["hang_muc"][0]["id"]
        them_mau(self.db, ten="Giấy bật thử", is_default=True)
        them_mau(self.db, ten="Giấy tắt thử", is_default=False)

        goi_y = self.register.applicable_templates(self.db, sl)
        mac_dinh = [m["name"] for m in goi_y if m["is_default"]]

        self.assertIn("Giấy bật thử", mac_dinh)
        self.assertNotIn("Giấy tắt thử", mac_dinh)
        # Vẫn nằm trong danh sách để Giám đốc tick tay được.
        self.assertIn("Giấy tắt thử", [m["name"] for m in goi_y])

    # ── 2 ────────────────────────────────────────────────────────────────────
    def test_materialize_loi_thi_khong_de_lai_o_nao(self):
        """Hạng mục V2 mà sổ dựng dở là tệ nhất: nhân viên mở ra thấy trống,
        tưởng hợp đồng không cần giấy nào rồi cho qua K01."""
        boi_canh = dung_boi_canh(self.db)
        sl = boi_canh["hang_muc"][0]["id"]
        a = them_mau(self.db, ten="Giấy có thật thử")

        diem_luu = self.db.begin_nested()
        try:
            self.register.materialize_service_line_register(
                self.db, sl, template_ids=[a], actor_id=None)
            raise RuntimeError("sự cố giữa chừng")
        except RuntimeError:
            diem_luu.rollback()

        self.assertEqual(self._so_o(sl), 0)

    # ── 3 ────────────────────────────────────────────────────────────────────
    def test_sua_mau_sau_do_khong_doi_hang_muc_da_materialize(self):
        boi_canh = dung_boi_canh(self.db)
        sl = boi_canh["hang_muc"][0]["id"]
        a = them_mau(self.db, ten="Giấy gốc thử", bat_buoc=True)
        self.register.materialize_service_line_register(
            self.db, sl, template_ids=[a], actor_id=None)

        # Giám đốc đổi mẫu SAU khi Hạng mục đã chạy.
        self.db.execute(
            text("update public.document_checklist_templates "
                 "set name = 'Giấy đã đổi tên', is_required = false where id = :id"),
            {"id": a})
        them_mau(self.db, ten="Giấy mới thêm sau thử")

        o = self.db.execute(
            text("select name, is_required from public.dossier_document_slots "
                 "where service_line_id = :sl"),
            {"sl": sl}).mappings().all()

        # Ô runtime đã đóng băng: đổi mẫu không được chạm vào hồ sơ đang chạy.
        self.assertEqual(len(o), 1)
        self.assertEqual(o[0]["name"], "Giấy gốc thử")
        self.assertTrue(o[0]["is_required"])

    # ── 4 ────────────────────────────────────────────────────────────────────
    def test_mot_object_dung_cho_nhieu_hang_muc(self):
        """CCCD scan một lần, dùng cho cả đo vẽ lẫn pháp lý — một object duy nhất."""
        boi_canh = dung_boi_canh(self.db, so_hang_muc=2)
        hd = boi_canh["contract_id"]
        sl_a, sl_b = (h["id"] for h in boi_canh["hang_muc"])
        o_a = them_o_giay(self.db, contract_id=hd, service_line_id=sl_a, ten="CCCD thử")
        o_b = them_o_giay(self.db, contract_id=hd, service_line_id=sl_b, ten="CCCD thử")

        tep = them_tep(self.db, contract_id=hd, ten_tep="cccd.pdf")
        gan_tep_vao_o(self.db, contract_id=hd, slot_id=o_a, document_id=tep)
        gan_tep_vao_o(self.db, contract_id=hd, slot_id=o_b, document_id=tep)

        so_object = self.db.execute(
            text("select count(*) from public.dossier_documents where contract_id = :hd"),
            {"hd": hd}).scalar()
        so_link = self.db.execute(
            text("select count(*) from public.dossier_document_links "
                 "where document_id = :tep and link_status = 'DANG_DUNG'"),
            {"tep": tep}).scalar()
        khoa = self.db.execute(
            text("select count(distinct object_key) from public.dossier_documents "
                 "where contract_id = :hd"), {"hd": hd}).scalar()

        self.assertEqual(so_object, 1, "không được nhân bản tài liệu")
        self.assertEqual(so_link, 2, "một object phải link được vào hai Hạng mục")
        self.assertEqual(khoa, 1, "không được upload lại object thứ hai")

    # ── 5 ────────────────────────────────────────────────────────────────────
    def test_mien_hang_muc_A_khong_anh_huong_hang_muc_B(self):
        """Ô cấp Hợp đồng dùng chung cả hai Hạng mục — đây là ca dễ rò nhất."""
        boi_canh = dung_boi_canh(self.db, so_hang_muc=2)
        hd = boi_canh["contract_id"]
        sl_a, sl_b = (h["id"] for h in boi_canh["hang_muc"])
        o_chung = them_o_giay(self.db, contract_id=hd, service_line_id=None,
                              ten="Giấy tờ hôn nhân thử")
        nv = nguoi_dung(self.db)

        phieu = self.register.request_slot_waiver(
            self.db, o_chung, service_line_id=sl_a,
            reason="Hạng mục A không cần giấy này", requester_id=nv, la_quan_tri=True)
        self.register.review_slot_change(
            self.db, phieu["id"], decision="approved", review_note="ok", actor_id=nv)

        def duoc_mien(sl):
            return self.db.execute(
                text("""
                    select exists (
                      select 1 from public.document_slot_change_requests r
                      where r.slot_id = :o and r.kind = 'WAIVE' and r.status = 'approved'
                        and r.revoked_at is null and r.service_line_id = :sl
                    )
                """), {"o": o_chung, "sl": sl}).scalar()

        self.assertTrue(duoc_mien(sl_a))
        self.assertFalse(duoc_mien(sl_b), "miễn của Hạng mục A đã rò sang Hạng mục B")

        # Và Hạng mục B vẫn xin miễn riêng được.
        phieu_b = self.register.request_slot_waiver(
            self.db, o_chung, service_line_id=sl_b,
            reason="Hạng mục B cũng không cần", requester_id=nv, la_quan_tri=True)
        self.assertEqual(phieu_b["status"], "pending")

    def test_khong_xin_mien_hai_lan_cho_cung_hang_muc(self):
        boi_canh = dung_boi_canh(self.db)
        hd, sl = boi_canh["contract_id"], boi_canh["hang_muc"][0]["id"]
        o = them_o_giay(self.db, contract_id=hd, service_line_id=sl, ten="Giấy thử trùng")
        nv = nguoi_dung(self.db)

        self.register.request_slot_waiver(
            self.db, o, service_line_id=sl, reason="lý do đủ dài", requester_id=nv,
            la_quan_tri=True)
        with self.assertRaises(HTTPException) as treo:
            self.register.request_slot_waiver(
                self.db, o, service_line_id=sl, reason="xin lần nữa", requester_id=nv,
                la_quan_tri=True)
        self.assertEqual(treo.exception.status_code, 409)

    # ── 10 ───────────────────────────────────────────────────────────────────
    def test_o_cap_hop_dong_van_xin_mien_duoc_va_khong_ro_sang_hang_muc_khac(self):
        """Hạng mục V1 phải xin miễn được, nếu không nhân viên bí đường ở K01.

        Giấy khách không có thật thì ô mãi trống, K01 không bao giờ nộp được, và
        đường thoát duy nhất còn lại là nhét đại một tệp cho qua cổng. Ô ở đây là
        ô cấp Hợp đồng (V1) — ca dễ rò nhất vì hai Hạng mục dùng chung một ô.
        """
        boi_canh = dung_boi_canh(self.db, so_hang_muc=2)
        hd = boi_canh["contract_id"]
        sl_a, sl_b = (h["id"] for h in boi_canh["hang_muc"])
        # Ép về V1: đây chính là trạng thái của mọi hợp đồng đang chạy trên live.
        self.db.execute(
            text("update public.service_lines set document_register_version = 1"
                 " where id = any(:ids)"),
            {"ids": [sl_a, sl_b]},
        )
        them_o_giay(self.db, contract_id=hd, service_line_id=None,
                    ten="Giấy tờ hôn nhân V1", bat_buoc=True)
        nv = nguoi_dung(self.db)

        def o_cua(sl):
            so = self.register.get_register(self.db, hd, service_line_id=sl)
            for nhom in so["groups"]:
                for o in nhom["slots"]:
                    if o["name"] == "Giấy tờ hôn nhân V1":
                        return o
            self.fail("không thấy ô giấy trong sổ của Hạng mục " + sl)

        # Hạng mục V1 vẫn phải đọc được ô cấp Hợp đồng.
        self.assertEqual(o_cua(sl_a)["scope"], "CONTRACT")
        self.assertEqual(
            self.register.register_version(self.db, sl_a), 1,
            "bối cảnh test phải là Hạng mục V1 thì mới đúng ca đang sửa")

        phieu = self.register.request_slot_waiver(
            self.db, o_cua(sl_a)["id"], service_line_id=sl_a,
            reason="Khách độc thân, không có giấy hôn nhân", requester_id=nv,
            la_quan_tri=True)

        # Đang chờ duyệt: chỉ Hạng mục A thấy, Hạng mục B tuyệt đối không.
        self.assertTrue(o_cua(sl_a)["waiver_pending"])
        self.assertFalse(
            o_cua(sl_b)["waiver_pending"],
            "phiếu chờ duyệt của Hạng mục A đã rò sang Hạng mục B — nút xin miễn của B biến mất")

        self.register.review_slot_change(
            self.db, phieu["id"], decision="approved", review_note="ok", actor_id=nv)

        self.assertTrue(o_cua(sl_a)["is_waived"])
        self.assertFalse(o_cua(sl_b)["is_waived"],
                         "miễn của Hạng mục A đã rò sang Hạng mục B")

        # Và cổng nộp K01 của A phải mở ra nhờ phiếu miễn đó.
        chan_a = self.register.k01_blockers(self.db, sl_a)
        self.assertNotIn("Giấy tờ hôn nhân V1", chan_a["required_missing"],
                         "phiếu miễn đã duyệt mà K01 vẫn đòi giấy")
        self.assertIn("Giấy tờ hôn nhân V1", chan_a["waived"],
                      "giấy được miễn phải hiện riêng, không được biến mất im lặng")

        chan_b = self.register.k01_blockers(self.db, sl_b)
        self.assertIn("Giấy tờ hôn nhân V1", chan_b["required_missing"],
                      "Hạng mục B phải vẫn còn đòi giấy này")
        self.assertNotIn("Giấy tờ hôn nhân V1", chan_b["waived"])

    # ── 11 ───────────────────────────────────────────────────────────────────
    def test_mot_cong_quyet_dinh_nghiem_thu_chot_luon_phieu_mien(self):
        """Duyệt đạt = đồng ý bỏ giấy. Trả lại = bắt đi lấy, kèm lý do."""
        from src.contracts import workflow_runtime

        for quyet_dinh, mong_doi in (("accepted", "approved"), ("rework_required", "rejected")):
            with self.subTest(quyet_dinh=quyet_dinh):
                boi_canh = dung_boi_canh(self.db)
                sl = boi_canh["hang_muc"][0]["id"]
                o = them_o_giay(self.db, contract_id=boi_canh["contract_id"],
                                service_line_id=sl, ten="Giấy hôn nhân " + quyet_dinh)
                nv = nguoi_dung(self.db)
                node = them_buoc_k01(self.db, service_line_id=sl)

                phieu = self.register.request_slot_waiver(
                    self.db, o, service_line_id=sl, reason="Khách độc thân",
                    requester_id=nv, la_quan_tri=True)

                # Chưa quyết thì phiếu còn treo, nhưng KHÔNG chặn nộp nữa.
                self.assertFalse(self.register.k01_blockers(self.db, sl)["required_missing"])

                ten_da_chot = workflow_runtime._chot_phieu_mien_theo_nghiem_thu(
                    self.db, task_node_id=node, decision=quyet_dinh,
                    actor_id=nv, review_note="Khách khẳng định không có" if quyet_dinh == "accepted" else None)
                self.assertEqual(ten_da_chot, ["Giấy hôn nhân " + quyet_dinh])

                dong = self.db.execute(
                    text("select status, review_note, reviewed_by from"
                         " public.document_slot_change_requests where id = :id"),
                    {"id": phieu["id"]},
                ).mappings().first()
                self.assertEqual(dong["status"], mong_doi)
                self.assertEqual(dong["reviewed_by"], nv)
                # Trả lại mà không có lý do thì phải tự điền — màn nhân viên đọc
                # cột này để biết đi gọi khách nói gì.
                self.assertTrue(dong["review_note"],
                                "trả lại phiếu miễn mà review_note rỗng thì nhân viên không biết lý do")
                self.db.rollback()

    # ── 12 ───────────────────────────────────────────────────────────────────
    def test_chi_chot_phieu_cua_dung_hang_muc_do(self):
        boi_canh = dung_boi_canh(self.db, so_hang_muc=2)
        sl_a, sl_b = (h["id"] for h in boi_canh["hang_muc"])
        o_chung = them_o_giay(self.db, contract_id=boi_canh["contract_id"],
                              service_line_id=None, ten="Giấy dùng chung")
        nv = nguoi_dung(self.db)
        node_a = them_buoc_k01(self.db, service_line_id=sl_a)

        p_a = self.register.request_slot_waiver(
            self.db, o_chung, service_line_id=sl_a, reason="A không cần",
            requester_id=nv, la_quan_tri=True)

        # GIỚI HẠN CÒN TỒN TẠI: chỉ số uq_document_slot_change_one_pending vẫn
        # khoá theo slot_id đơn thuần, nên Hạng mục B chưa gửi được phiếu cho
        # cùng ô dùng chung. Phải trả 409 có lời giải thích, tuyệt đối không
        # được để vỡ thành 500. Bản vá chỉ số nằm ở
        # supabase/pending/CHUA_DUYET_pending_waiver_theo_hang_muc.sql
        with self.assertRaises(HTTPException) as treo:
            self.register.request_slot_waiver(
                self.db, o_chung, service_line_id=sl_b, reason="B cũng không cần",
                requester_id=nv, la_quan_tri=True)
        self.assertEqual(treo.exception.status_code, 409)
        self.assertIn("dùng chung", treo.exception.detail)

        from src.contracts import workflow_runtime
        workflow_runtime._chot_phieu_mien_theo_nghiem_thu(
            self.db, task_node_id=node_a, decision="accepted", actor_id=nv, review_note="ok")

        def trang_thai(pid):
            return self.db.execute(
                text("select status from public.document_slot_change_requests where id = :id"),
                {"id": pid}).scalar()

        self.assertEqual(trang_thai(p_a["id"]), "approved")

        # Chốt xong phiếu của A thì B mới gửi được — và nghiệm thu của A không
        # được đụng tới phiếu của B.
        p_b = self.register.request_slot_waiver(
            self.db, o_chung, service_line_id=sl_b, reason="B cũng không cần",
            requester_id=nv, la_quan_tri=True)
        # Mỗi Hạng mục chỉ có một workflow_instance, nên dùng lại đúng bước đó.
        workflow_runtime._chot_phieu_mien_theo_nghiem_thu(
            self.db, task_node_id=node_a, decision="accepted", actor_id=nv, review_note="ok")
        self.assertEqual(trang_thai(p_b["id"]), "pending",
                         "nghiệm thu Hạng mục A đã chốt nhầm phiếu của Hạng mục B")

    # ── 13 ───────────────────────────────────────────────────────────────────
    def test_chuong_cua_sep_bao_so_phieu_xin_mien_dang_cho(self):
        """Chuông không báo thì Giám đốc mở lượt nghiệm thu ra mới biết — mà
        phần lớn thời gian là không mở, chỉ bấm duyệt cho xong. Con số phải nằm
        ngay trên dòng thông báo."""
        from src.routes.routes_notifications import _truy_van_nghiem_thu

        boi_canh = dung_boi_canh(self.db)
        sl = boi_canh["hang_muc"][0]["id"]
        nv = nguoi_dung(self.db)
        node = them_buoc_k01(self.db, service_line_id=sl)
        o = them_o_giay(self.db, contract_id=boi_canh["contract_id"],
                        service_line_id=sl, ten="Giấy hôn nhân chuông")
        self.db.execute(
            text("""insert into public.task_node_acceptances
                    (task_node_id, attempt_no, status, submitted_by)
                    values (:n, 1, 'pending', :u)"""),
            {"n": node, "u": nv},
        )

        def dem():
            for dong in self.db.execute(_truy_van_nghiem_thu(self.db)).mappings().all():
                if dong["task_node_id"] == node:
                    return int(dong["so_phieu_mien"] or 0)
            self.fail("lượt nghiệm thu đang chờ không hiện trên chuông của Giám đốc")

        self.assertEqual(dem(), 0)

        self.register.request_slot_waiver(
            self.db, o, service_line_id=sl, reason="Khách độc thân",
            requester_id=nv, la_quan_tri=True)

        self.assertEqual(dem(), 1, "chuông không đếm phiếu xin miễn đang chờ")

    # ── 14 ───────────────────────────────────────────────────────────────────
    def test_thieu_giay_van_nop_duoc_nhung_phai_ghi_vet_va_het_khi_xin_mien(self):
        """ĐÃ ĐỔI CHỦ ĐÍCH 27/08 sang mô hình "không khoá cứng, nhưng có lưu vết".

        Bản trước chốt rằng thiếu giấy thì máy chủ phải từ chối nộp. Chốt đó
        đẩy nhân viên vào ngõ cụt: giấy khách không có thật thì bước treo vĩnh
        viễn, và cách duy nhất đi tiếp là nhét đại một tệp cho qua cổng.

        Điều PHẢI giữ không đổi: không có gì rơi vào im lặng. Nộp khi thiếu thì
        danh sách thiếu phải nằm trong submission_payload để Giám đốc đọc.
        """
        from src.contracts import workflow_runtime

        boi_canh = dung_boi_canh(self.db)
        sl = boi_canh["hang_muc"][0]["id"]
        o = them_o_giay(self.db, contract_id=boi_canh["contract_id"],
                        service_line_id=sl, ten="Giấy hôn nhân cổng nộp")
        nv = nguoi_dung(self.db)
        node = them_buoc_k01(self.db, service_line_id=sl)
        emp = giao_viec(self.db, task_node_id=node, user_id=nv)
        self.db.execute(
            text("update public.task_nodes set status = 'in_progress' where id = :id"),
            {"id": node},
        )

        def nop():
            return workflow_runtime.submit_task_node_for_acceptance(
                self.db, task_node_id=node, employee_id=emp, actor_id=nv, note=None)

        def anh_chup():
            return self.db.execute(
                text("select submission_payload from public.task_node_acceptances"
                     " where task_node_id=:n order by attempt_no desc limit 1"),
                {"n": node}).scalar()

        # Thiếu giấy: vẫn nộp được, nhưng phải để lại vết.
        self.assertEqual(nop()["status"], "submitted", "thiếu giấy vẫn đang chặn nộp")
        ten_thieu = [t["name"] for m in anh_chup()["missing"] for t in m["thieu"]]
        self.assertIn("Giấy hôn nhân cổng nộp", ten_thieu,
                      "nộp khi thiếu mà không ghi lại thiếu gì — Giám đốc duyệt mù")

        # Xin miễn xong thì thôi tính là thiếu.
        self.db.execute(
            text("update public.task_nodes set status='in_progress' where id=:i"),
            {"i": node})
        self.register.request_slot_waiver(
            self.db, o, service_line_id=sl, reason="Khách độc thân",
            requester_id=nv, la_quan_tri=True)
        self.assertEqual(nop()["status"], "submitted")
        self.assertEqual(anh_chup()["missing"], [],
                         "đã xin miễn mà vẫn báo thiếu")

    # ── 15 ───────────────────────────────────────────────────────────────────
    def test_nop_mot_lan_nhiem_vu_chi_can_DA_DIEN_chu_khong_can_da_duoc_duyet(self):
        """Đây là thay đổi cốt lõi của "gửi một lần".

        Trước đây cổng nộp đòi mọi mục checklist đã 'approved', nghĩa là nhân
        viên nộp từng mục → Giám đốc duyệt từng mục → mới nộp được bước → Giám
        đốc duyệt lần nữa. Hai vòng cho một việc, và không lúc nào Giám đốc nhìn
        thấy trọn gói hồ sơ trước khi chốt.
        """
        from src.contracts import workflow_runtime
        from src.contracts.workflow_runtime import WorkflowValidationError

        boi_canh = dung_boi_canh(self.db)
        sl = boi_canh["hang_muc"][0]["id"]
        nv = nguoi_dung(self.db)
        node = them_buoc_k01(self.db, service_line_id=sl)
        emp = giao_viec(self.db, task_node_id=node, user_id=nv)
        self.db.execute(
            text("update public.task_nodes set status = 'in_progress' where id = :id"),
            {"id": node},
        )
        muc = them_nhiem_vu(self.db, task_node_id=node, ten="Ảnh hiện trạng",
                            trang_thai="pending")

        def nop():
            return workflow_runtime.submit_task_node_for_acceptance(
                self.db, task_node_id=node, employee_id=emp, actor_id=nv, note=None)

        # Chưa điền thì vẫn chặn.
        with self.assertRaises(WorkflowValidationError) as treo:
            nop()
        self.assertIn("Ảnh hiện trạng", str(treo.exception))

        # ĐÃ ĐIỀN nhưng CHƯA được duyệt → phải nộp được.
        self.db.execute(
            text("update public.task_node_checklist_results set status = 'pending_approval'"
                 " where id = :id"), {"id": muc})
        self.assertEqual(nop()["status"], "submitted")

    # ── 16 ───────────────────────────────────────────────────────────────────
    def test_duyet_nghiem_thu_duyet_luon_moi_minh_chung_da_nop(self):
        """Một quyết định duyệt trọn gói — không còn bắt Giám đốc bấm từng mục."""
        from src.contracts import workflow_runtime

        boi_canh = dung_boi_canh(self.db)
        sl = boi_canh["hang_muc"][0]["id"]
        nv = nguoi_dung(self.db)
        node = them_buoc_k01(self.db, service_line_id=sl)
        emp = giao_viec(self.db, task_node_id=node, user_id=nv)
        self.db.execute(
            text("update public.task_nodes set status = 'in_progress' where id = :id"),
            {"id": node},
        )
        muc = them_nhiem_vu(self.db, task_node_id=node, ten="Ảnh hiện trạng",
                            trang_thai="pending_approval")
        workflow_runtime.submit_task_node_for_acceptance(
            self.db, task_node_id=node, employee_id=emp, actor_id=nv, note=None)
        luot = self.db.execute(
            text("select id from public.task_node_acceptances where task_node_id = :n"
                 " order by attempt_no desc limit 1"), {"n": node}).scalar()

        workflow_runtime.review_task_node_acceptance(
            self.db, acceptance_id=luot, decision="accepted", outcome=None,
            review_note="ok", actor_id=nv)

        self.assertEqual(
            self.db.execute(
                text("select status from public.task_node_checklist_results where id = :id"),
                {"id": muc}).scalar(),
            "approved",
            "duyệt nghiệm thu mà minh chứng vẫn treo chờ duyệt — vẫn là gửi từng cái")

    # ── 17 ───────────────────────────────────────────────────────────────────
    def test_tra_lai_thi_moi_minh_chung_dang_cho_quay_ve_can_sua(self):
        from src.contracts import workflow_runtime

        boi_canh = dung_boi_canh(self.db)
        sl = boi_canh["hang_muc"][0]["id"]
        nv = nguoi_dung(self.db)
        node = them_buoc_k01(self.db, service_line_id=sl)
        emp = giao_viec(self.db, task_node_id=node, user_id=nv)
        self.db.execute(
            text("update public.task_nodes set status = 'in_progress' where id = :id"),
            {"id": node},
        )
        muc = them_nhiem_vu(self.db, task_node_id=node, ten="Ảnh hiện trạng",
                            trang_thai="pending_approval")
        workflow_runtime.submit_task_node_for_acceptance(
            self.db, task_node_id=node, employee_id=emp, actor_id=nv, note=None)
        luot = self.db.execute(
            text("select id from public.task_node_acceptances where task_node_id = :n"
                 " order by attempt_no desc limit 1"), {"n": node}).scalar()

        workflow_runtime.review_task_node_acceptance(
            self.db, acceptance_id=luot, decision="rework_required", outcome=None,
            review_note="Ảnh mờ, chụp lại", actor_id=nv)

        dong = self.db.execute(
            text("select status, note from public.task_node_checklist_results where id = :id"),
            {"id": muc}).mappings().first()
        self.assertEqual(dong["status"], "failed",
                         "trả lại bước mà checklist vẫn xanh — nhân viên không biết sửa gì")
        self.assertEqual(dong["note"], "Ảnh mờ, chụp lại")
