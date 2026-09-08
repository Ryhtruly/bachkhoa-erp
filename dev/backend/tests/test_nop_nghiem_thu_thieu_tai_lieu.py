"""Luồng chốt 27/08: thiếu tài liệu KHÔNG khoá nút nộp, nhưng phải để lại vết.

Điểm cốt lõi của nghiệp vụ này là: cho đi tiếp, nhưng Giám đốc phải quyết trên
dữ kiện thật và quyết định đó phải truy được. Vì vậy mọi test dưới đây đều xoay
quanh một câu hỏi: có cái gì rơi vào im lặng không.

Chạy trên DB thật, tự dựng dữ liệu rồi rollback.
"""
import unittest

from sqlalchemy import text

from tests.fixtures_so_giay_to import (
    build_test_context, assign_node, create_test_user, insert_k01_node, insert_template,
    insert_checklist_item_with_document, insert_document, insert_document_slot,
    get_missing_documents,
)


class NopNghiemThuThieuTaiLieuTests(unittest.TestCase):
    def setUp(self):
        from src.db.database import SessionLocal

        self.db = SessionLocal()
        thieu = get_missing_documents(self.db)
        if thieu:
            self.db.close()
            self.skipTest("DB thiếu bảng: " + ", ".join(thieu))

        from src.contracts import workflow_runtime
        from src.dossiers import register

        self.wr = workflow_runtime
        self.register = register
        register.reset_schema_cache()

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    def _boi_canh(self, *, min_count=2):
        """Một bước K01 có đúng một mục checklist đòi `min_count` bản của một loại."""
        bc = build_test_context(self.db)
        sl = bc["hang_muc"][0]["id"]
        mau = insert_template(self.db, name="Bản vẽ kỹ thuật thử")
        insert_document_slot(self.db, contract_id=bc["contract_id"], service_line_id=sl,
                    name="Bản vẽ kỹ thuật thử")
        node = insert_k01_node(self.db, service_line_id=sl, checklist=[{
            "key": "cl1", "name": "Chuẩn hoá bản vẽ",
            "output_documents": [{
                "template_id": mau, "min_count": min_count,
                "required_before_submit": True, "needs_director_approval": False,
            }],
        }])
        muc = insert_checklist_item_with_document(
            self.db, task_node_id=node, name="Chuẩn hoá bản vẽ", checklist_key="cl1")
        nv = create_test_user(self.db)
        emp = assign_node(self.db, task_node_id=node, user_id=nv)
        self.db.execute(
            text("update public.task_nodes set status='in_progress' where id=:i"),
            {"i": node})
        return {"node": node, "muc": muc, "nv": nv, "emp": emp, "mau": mau, "sl": sl}

    def _nop(self, bc, emp=None):
        return self.wr.submit_task_node_for_acceptance(
            self.db, task_node_id=bc["node"], employee_id=emp or bc["emp"],
            actor_id=bc["nv"], note=None)

    def _anh_chup(self, node):
        """Ảnh chụp thiếu của LẦN NỘP mới nhất — nằm trong submission_payload."""
        return self.db.execute(
            text("select submission_payload from public.task_node_acceptances"
                 " where task_node_id=:n order by attempt_no desc limit 1"),
            {"n": node}).scalar()

    def _luot(self, node):
        return self.db.execute(
            text("select id from public.task_node_acceptances where task_node_id=:n"
                 " order by attempt_no desc limit 1"), {"n": node}).scalar()

    # ── 1 ────────────────────────────────────────────────────────────────────
    def test_thieu_tai_lieu_van_nop_duoc_va_ghi_lai_dung_luc_nop(self):
        """Chặn cứng ở đây là đẩy nhân viên đi nhét đại một tệp cho qua cổng."""
        bc = self._boi_canh(min_count=2)

        ket = self._nop(bc)
        self.assertEqual(ket["status"], "submitted", "thiếu tài liệu vẫn đang chặn nộp")

        goi = self._anh_chup(bc["node"])
        self.assertIn("missing", goi, "không ghi lại được lúc nộp đang thiếu gì")
        thieu = [t for m in goi["missing"] for t in m["thieu"]
                 if t["name"] == "Bản vẽ kỹ thuật thử"]
        self.assertEqual(len(thieu), 1)
        self.assertEqual(thieu[0]["can"], 2)
        self.assertEqual(thieu[0]["da_co"], 0)
        self.assertEqual(thieu[0]["con_thieu"], 2)

    # ── 2 ────────────────────────────────────────────────────────────────────
    def test_bao_cao_thieu_dung_bang_thu_Modal_se_hien(self):
        """Modal và bản ghi vết phải cùng một nguồn, nếu không hai bên nói khác nhau."""
        from src.dossiers.documents import node_shortage_report

        bc = self._boi_canh(min_count=3)
        bao_cao = node_shortage_report(self.db, bc["node"])

        self.assertEqual(len(bao_cao), 1)
        self.assertEqual(bao_cao[0]["checklist_name"], "Chuẩn hoá bản vẽ")
        self.assertEqual(bao_cao[0]["thieu"][0]["con_thieu"], 3)

        self._nop(bc)
        self.assertEqual(self._anh_chup(bc["node"])["missing"], bao_cao,
                         "Modal và vết lưu lệch nhau")

    def test_loai_giay_runtime_thay_the_nguon_dem_cu_cua_modal(self):
        """Một loại giấy runtime có file thì modal không được báo thiếu theo graph/sổ cũ."""
        from src.dossiers.documents import node_shortage_report

        bc = self._boi_canh(min_count=2)
        type_id = self.db.execute(
            text("""
                insert into public.checklist_result_document_types
                    (checklist_result_id, template_id, name, normalized_name,
                     source, origin, status, created_by)
                values (:checklist_result_id, :template_id, :name, :normalized_name,
                        'KHACH_HANG', 'CONFIGURED', 'draft', :actor_id)
                returning id
            """),
            {
                "checklist_result_id": bc["muc"],
                "template_id": bc["mau"],
                "name": "Bản vẽ kỹ thuật thử",
                "normalized_name": "bản vẽ kỹ thuật thử",
                "actor_id": bc["nv"],
            },
        ).scalar_one()

        # Runtime không mang khái niệm "cần 2 bản" của graph cũ: mỗi loại giấy
        # chỉ cần ít nhất một file, và chính danh sách loại giấy là cấu trúc chuẩn.
        self.assertEqual(node_shortage_report(self.db, bc["node"]), [{
            "checklist_result_id": bc["muc"],
            "checklist_name": "Chuẩn hoá bản vẽ",
            "thieu": [{
                "template_id": bc["mau"],
                "name": "Bản vẽ kỹ thuật thử",
                "can": 1,
                "da_co": 0,
                "con_thieu": 1,
            }],
        }])

        document_id = insert_document(
            self.db,
            contract_id=self.db.execute(
                text("select contract_id from public.service_lines where id=:sl"),
                {"sl": bc["sl"]},
            ).scalar_one(),
            file_name="ban-ve-da-gan.pdf",
        )
        self.db.execute(
            text("""
                insert into public.checklist_result_document_type_files
                    (document_type_id, document_id, created_by)
                values (:document_type_id, :document_id, :actor_id)
            """),
            {
                "document_type_id": type_id,
                "document_id": document_id,
                "actor_id": bc["nv"],
            },
        )

        self.assertEqual(
            node_shortage_report(self.db, bc["node"]),
            [],
            "đã gán file vào loại giấy runtime nhưng modal vẫn đếm thiếu theo cấu hình cũ",
        )

    # ── 3 ────────────────────────────────────────────────────────────────────
    def test_chi_phu_trach_chinh_moi_nop_ca_goi(self):
        """Thợ phụ bấm nộp là khoá luôn phần người khác đang làm dở."""
        from src.contracts.workflow_runtime import WorkflowValidationError

        bc = self._boi_canh()
        phu = self.db.execute(
            text("insert into public.employees (id, full_name, is_active)"
                 " values (:i, 'Thợ phụ thử', true) returning id"),
            {"i": "E-phu-" + bc["node"][-8:]}).scalar()
        self.db.execute(
            text("insert into public.task_node_assignments"
                 " (task_node_id, employee_id, role_code, assignment_status)"
                 " values (:n, :e, 'ASSISTANT', 'accepted')"),
            {"n": bc["node"], "e": phu})

        with self.assertRaises(WorkflowValidationError) as treo:
            self._nop(bc, emp=phu)
        self.assertIn("phụ trách chính", str(treo.exception))

        # Phụ trách chính thì nộp được.
        self.assertEqual(self._nop(bc)["status"], "submitted")

    # ── 4 ────────────────────────────────────────────────────────────────────
    def test_duyet_chap_nhan_thieu_bat_buoc_co_ly_do(self):
        from src.contracts.workflow_runtime import WorkflowValidationError

        bc = self._boi_canh()
        self._nop(bc)
        luot = self._luot(bc["node"])

        for ly_do in (None, "", "   "):
            with self.subTest(ly_do=repr(ly_do)):
                with self.assertRaises(WorkflowValidationError) as treo:
                    self.wr.review_task_node_acceptance(
                        self.db, acceptance_id=luot, decision="accepted", outcome=None,
                        review_note="ok", actor_id=bc["nv"],
                        shortage_accepted=True, shortage_reason=ly_do)
                self.assertIn("bắt buộc ghi lý do", str(treo.exception))

    # ── 5 ────────────────────────────────────────────────────────────────────
    def test_duyet_chap_nhan_thieu_luu_du_nguoi_quyet_dinh_va_ly_do(self):
        bc = self._boi_canh()
        self._nop(bc)
        self.wr.review_task_node_acceptance(
            self.db, acceptance_id=self._luot(bc["node"]), decision="accepted",
            outcome=None, review_note="ok", actor_id=bc["nv"],
            shortage_accepted=True, shortage_reason="Khách hẹn bổ sung sau, ưu tiên nộp đúng hạn")

        luot = self.db.execute(
            text("select status, reviewer_user_id, reviewed_at, review_payload,"
                 " submission_payload from public.task_node_acceptances where id=:i"),
            {"i": self._luot(bc["node"])}).mappings().first()
        self.assertEqual(luot["status"], "accepted")
        self.assertEqual(luot["reviewer_user_id"], bc["nv"])
        self.assertIsNotNone(luot["reviewed_at"])
        self.assertTrue(luot["review_payload"]["shortage_accepted"])
        self.assertIn("Khách hẹn bổ sung", luot["review_payload"]["shortage_reason"])
        # Ảnh chụp lúc nộp KHÔNG được xoá: mất nó là mất bằng chứng đã cho qua gì.
        self.assertTrue(luot["submission_payload"]["missing"])

        self.assertEqual(
            self.db.execute(
                text("select status from public.task_node_checklist_results where id=:i"),
                {"i": bc["muc"]}).scalar(),
            "approved", "chấp nhận thiếu vẫn phải tính là đã duyệt")

    # ── 6 ────────────────────────────────────────────────────────────────────
    def test_duyet_binh_thuong_khong_tu_dong_danh_dau_chap_nhan_thieu(self):
        bc = self._boi_canh()
        self._nop(bc)
        self.wr.review_task_node_acceptance(
            self.db, acceptance_id=self._luot(bc["node"]), decision="accepted",
            outcome=None, review_note="ok", actor_id=bc["nv"])

        rp = self.db.execute(
            text("select review_payload from public.task_node_acceptances where id=:i"),
            {"i": self._luot(bc["node"])}).scalar()
        self.assertFalse(rp["shortage_accepted"],
                         "duyệt bình thường mà lại đánh dấu đã chấp nhận thiếu")
        self.assertIsNone(rp["shortage_reason"])

    # ── 7 ────────────────────────────────────────────────────────────────────
    def test_tra_lai_ghi_chu_rieng_tung_muc(self):
        """Một câu chung cho năm mục là bắt nhân viên đoán mục nào sai."""
        bc = self._boi_canh()
        muc2 = insert_checklist_item_with_document(
            self.db, task_node_id=bc["node"], name="Mục thứ hai", checklist_key="cl2")
        self._nop(bc)

        self.wr.review_task_node_acceptance(
            self.db, acceptance_id=self._luot(bc["node"]), decision="rework_required",
            outcome=None, review_note="Xem lại toàn bộ", actor_id=bc["nv"],
            checklist_notes={bc["muc"]: "Bản vẽ sai tỉ lệ, làm lại"})

        def ghi_chu(i):
            return self.db.execute(
                text("select status, note from public.task_node_checklist_results where id=:i"),
                {"i": i}).mappings().first()

        a, b = ghi_chu(bc["muc"]), ghi_chu(muc2)
        self.assertEqual(a["status"], "failed")
        self.assertEqual(a["note"], "Bản vẽ sai tỉ lệ, làm lại")
        # Mục không có ghi chú riêng vẫn phải bị trả về, kèm ghi chú chung.
        self.assertEqual(b["status"], "failed")
        self.assertEqual(b["note"], "Xem lại toàn bộ")

    # ── 8 ────────────────────────────────────────────────────────────────────
    def test_nop_lai_sinh_anh_chup_moi_khong_dinh_vet_lan_truoc(self):
        """Mỗi lần nộp là một lượt riêng. Nếu dùng chung một ô nhớ thì lần nộp
        sau khi đã bổ sung đủ vẫn hiện "còn thiếu" trên màn Giám đốc."""
        bc = self._boi_canh(min_count=1)
        self._nop(bc)
        self.assertTrue(self._anh_chup(bc["node"])["missing"])

        # Giả lập đã bổ sung đủ: hạ yêu cầu xuống không bắt buộc.
        self.db.execute(
            text("""
                update public.workflow_instance_revisions r
                set graph = jsonb_set(graph,
                      '{nodes,k01,checklist,0,output_documents,0,required_before_submit}',
                      'false'::jsonb)
                from public.task_nodes n
                where n.id = :node and r.workflow_instance_id = n.workflow_instance_id
            """), {"node": bc["node"]})
        # Ô giấy trong sổ K01 cũng thôi bắt buộc — nếu không nó vẫn là một
        # nguồn thiếu thứ hai và ảnh chụp không thể rỗng.
        self.db.execute(
            text("update public.dossier_document_slots set is_required=false"
                 " where service_line_id=:sl"), {"sl": bc["sl"]})
        self.db.execute(
            text("update public.task_nodes set status='in_progress' where id=:i"),
            {"i": bc["node"]})
        self.db.execute(
            text("update public.task_node_checklist_results"
                 " set status='pending_approval' where task_node_id=:n"),
            {"n": bc["node"]})

        self._nop(bc)
        self.assertEqual(self._anh_chup(bc["node"])["missing"], [],
                         "bổ sung đủ rồi mà lượt nộp mới vẫn báo thiếu")

        # Lượt cũ vẫn giữ nguyên vết của nó — lịch sử không được viết lại.
        cu = self.db.execute(
            text("select submission_payload from public.task_node_acceptances"
                 " where task_node_id=:n order by attempt_no asc limit 1"),
            {"n": bc["node"]}).scalar()
        self.assertTrue(cu["missing"], "lượt nộp cũ bị xoá mất vết thiếu")

    # ── 9 ────────────────────────────────────────────────────────────────────
    def test_nhan_vien_doc_duoc_ghi_chu_khi_bi_tra_lai(self):
        """Trả việc mà nhân viên không đọc được lý do thì họ ngồi đoán.

        Lỗi thật đã đo trên live: cột note có dữ liệu nhưng API nhân viên không
        trả trường đó ra, màn hình chỉ hiện "Cần bổ sung" trống trơn.
        """
        import inspect

        from src.employee_portal import service as sv

        # Truy vấn nằm ở hằng số cấp MODULE (_TASK_CHECKLIST_QUERY), không nằm
        # trong thân class — quét class là quét hụt và test xanh giả.
        ma_nguon = inspect.getsource(sv)
        self.assertIn("r.note as director_note", ma_nguon,
                      "truy vấn checklist không lấy ghi chú của Giám đốc")
        self.assertIn('"director_note": row["director_note"]', ma_nguon,
                      "lấy rồi nhưng không trả ra cho giao diện")

    # ── 10 ───────────────────────────────────────────────────────────────────
    def test_tra_lai_roi_nop_lai_khong_tao_muc_checklist_moi(self):
        """§6B: trả về ĐÚNG Checklist cũ, không sinh bản mới, không mất lịch sử."""
        bc = self._boi_canh()
        self._nop(bc)
        self.wr.review_task_node_acceptance(
            self.db, acceptance_id=self._luot(bc["node"]), decision="rework_required",
            outcome=None, review_note="Làm lại đi", actor_id=bc["nv"])

        self.db.execute(
            text("update public.task_nodes set status='in_progress' where id=:i"),
            {"i": bc["node"]})
        self.db.execute(
            text("update public.task_node_checklist_results"
                 " set status='pending_approval' where id=:i"), {"i": bc["muc"]})
        self._nop(bc)

        self.assertEqual(
            self.db.execute(
                text("select count(*) from public.task_node_checklist_results"
                     " where task_node_id=:n"), {"n": bc["node"]}).scalar(),
            1, "nộp lại đã sinh thêm mục checklist mới")
        # Nhưng lượt nghiệm thu thì phải có hai — lịch sử từng lần nộp còn nguyên.
        self.assertEqual(
            self.db.execute(
                text("select count(*) from public.task_node_acceptances"
                     " where task_node_id=:n"), {"n": bc["node"]}).scalar(),
            2, "mất lịch sử lần nộp trước")
