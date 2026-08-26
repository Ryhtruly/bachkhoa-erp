"""Đề xuất thêm loại tài liệu phát sinh.

Luật bất biến: chưa duyệt hoặc bị từ chối thì tệp KHÔNG vào hồ sơ chính thức —
không ô giấy, không link, không tính vào min_count.
"""

import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from src.dossiers import slot_requests


def _rows(value):
    result = MagicMock()
    result.mappings.return_value.all.return_value = value
    return result


def _row(value):
    result = MagicMock()
    result.mappings.return_value.first.return_value = value
    return result


def _scalar(value):
    result = MagicMock()
    result.scalar.return_value = value
    return result


def _fetchall(value):
    result = MagicMock()
    result.fetchall.return_value = value
    return result


NGU_CANH = {
    "checklist_result_id": "CR-K02", "checklist_name": "Đo hiện trường",
    "task_node_id": "TN-K02", "node_code": "K02",
    "service_line_id": "SL-A", "contract_id": "003/BK-2026",
}


def _request(**patch_):
    base = {
        "id": "REQ-1", "contract_id": "003/BK-2026", "service_line_id": "SL-A",
        "task_node_id": "TN-K02", "checklist_result_id": "CR-K02",
        "proposed_name": "Ảnh mốc ranh phát sinh", "approved_name": None,
        "quantity": 3, "approved_quantity": None, "source": "CONG_TY",
        "status": "pending", "created_slot_id": None, "requested_by": "nv1",
        "kind": "OUTPUT",
        "required_before_submit": False, "needs_director_approval": False,
    }
    base.update(patch_)
    return base


class TaoDeXuatTests(unittest.TestCase):
    def test_tao_o_trang_thai_draft(self):
        db = MagicMock()
        db.execute.side_effect = [_row(NGU_CANH), _scalar("REQ-1")]
        ket_qua = slot_requests.create_request(
            db, checklist_result_id="CR-K02", proposed_name="Ảnh mốc ranh",
            reason="Chủ đất yêu cầu chụp thêm", source="CONG_TY",
            description=None, quantity=3, kind="INPUT", actor_id="nv1",
        )
        self.assertEqual(ket_qua["status"], "draft")
        insert_params = db.execute.call_args_list[1].args[1]
        self.assertEqual(insert_params["kind"], "INPUT")

    def test_ten_qua_ngan_thi_tu_choi(self):
        with self.assertRaises(HTTPException) as caught:
            slot_requests.create_request(
                db=MagicMock(), checklist_result_id="CR-K02", proposed_name="ab",
                reason="ly do dai hon 5", source="CONG_TY",
                description=None, quantity=1, kind="INPUT", actor_id="nv1",
            )
        self.assertEqual(caught.exception.status_code, 422)

    def test_thieu_ly_do_thi_tu_choi(self):
        with self.assertRaises(HTTPException):
            slot_requests.create_request(
                db=MagicMock(), checklist_result_id="CR-K02", proposed_name="Ảnh mốc",
                reason="", source="CONG_TY", description=None, quantity=1,
                kind="INPUT", actor_id="nv1",
            )

    def test_contract_id_suy_tu_may_chu_khong_nhan_tu_client(self):
        """Không có tham số contract_id nào trong chữ ký — client không bơm được."""
        import inspect

        tham_so = inspect.signature(slot_requests.create_request).parameters
        self.assertNotIn("contract_id", tham_so)
        self.assertNotIn("service_line_id", tham_so)


class TaiTepTruocKhiDuyetTests(unittest.TestCase):
    """Tệp có mặt ngay, nhưng KHÔNG phải tài liệu chính thức."""

    def _chay(self, status="draft"):
        db = MagicMock()
        db.execute.side_effect = [
            _row(_request(status=status)),
            _scalar("K02"),
            MagicMock(), MagicMock(),
        ]
        with patch.object(slot_requests, "upload_file") as upload, \
             patch.object(slot_requests, "ensure_bucket"), \
             patch("src.dossiers.documents._validate_upload"):
            ket_qua = slot_requests.add_file(
                db, request_id="REQ-1", file_name="anh1.jpg",
                content_type="image/jpeg", data=b"x", actor_id="nv1",
            )
        return ket_qua, upload, db

    def test_chi_upload_mot_lan(self):
        _, upload, _ = self._chay()
        self.assertEqual(upload.call_count, 1)

    def test_khong_dat_slot_id_khong_dat_dossier_id_khong_tao_link(self):
        """Ba thứ này mới làm tệp thành tài liệu chính thức — chưa duyệt thì chưa có."""
        _, _, db = self._chay()
        cau_insert = next(
            str(c.args[0]) for c in db.execute.call_args_list
            if "insert into public.dossier_documents" in str(c.args[0])
        )
        self.assertNotIn("slot_id", cau_insert)
        self.assertNotIn("dossier_id", cau_insert)
        moi_lenh = " ".join(str(c.args[0]).lower() for c in db.execute.call_args_list)
        self.assertNotIn("insert into public.dossier_document_links", moi_lenh)

    def test_dang_cho_duyet_thi_khong_them_tep_duoc(self):
        db = MagicMock()
        db.execute.side_effect = [_row(_request(status="pending"))]
        with patch("src.dossiers.documents._validate_upload"):
            with self.assertRaises(HTTPException) as caught:
                slot_requests.add_file(
                    db, request_id="REQ-1", file_name="a.jpg",
                    content_type="image/jpeg", data=b"x", actor_id="nv1",
                )
        self.assertEqual(caught.exception.status_code, 409)

    def test_bi_tu_choi_thi_them_tep_lai_duoc(self):
        """Sửa rồi gửi lại — không bắt tải lại từ đầu."""
        ket_qua, upload, _ = self._chay(status="rejected")
        self.assertEqual(upload.call_count, 1)
        self.assertIn("document_id", ket_qua)

    def test_can_bo_sung_thi_them_tep_lai_duoc(self):
        ket_qua, upload, _ = self._chay(status="needs_more")
        self.assertEqual(upload.call_count, 1)
        self.assertIn("document_id", ket_qua)


class SuaDeXuatTests(unittest.TestCase):
    def test_needs_more_sua_tren_chinh_phieu_cu(self):
        db = MagicMock()
        db.execute.side_effect = [_row(_request(status="needs_more", kind="INPUT")), MagicMock()]
        ket_qua = slot_requests.update_request(
            db, "REQ-1", proposed_name="Bản kỹ thuật đo hiện trường",
            description="Bản đo gốc", reason="Bổ sung theo yêu cầu của Giám đốc",
            source="CONG_TY", quantity=2, actor_id="nv1",
        )
        self.assertEqual(ket_qua["id"], "REQ-1")
        self.assertEqual(ket_qua["status"], "needs_more")
        lenh = str(db.execute.call_args_list[1].args[0]).lower()
        self.assertIn("update public.document_slot_creation_requests", lenh)
        self.assertNotIn("insert into public.document_slot_creation_requests", lenh)

    def test_pending_va_approved_khong_sua_metadata_duoc(self):
        for status in ("pending", "approved"):
            db = MagicMock()
            db.execute.side_effect = [_row(_request(status=status))]
            with self.assertRaises(HTTPException) as caught:
                slot_requests.update_request(
                    db, "REQ-1", proposed_name="Tên mới", description=None,
                    reason="Lý do đủ dài", source="CONG_TY", quantity=1,
                    actor_id="nv1",
                )
            self.assertEqual(caught.exception.status_code, 409)


class GuiDuyetTests(unittest.TestCase):
    def test_khong_co_tep_thi_khong_gui_duoc(self):
        db = MagicMock()
        db.execute.side_effect = [_row(_request(status="draft")), _scalar(0)]
        with self.assertRaises(HTTPException) as caught:
            slot_requests.submit_request(db, "REQ-1", actor_id="nv1")
        self.assertEqual(caught.exception.status_code, 422)

    def test_co_tep_thi_chuyen_sang_cho_duyet(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row(_request(status="draft")), _scalar(3), MagicMock(), MagicMock(),
        ]
        ket_qua = slot_requests.submit_request(db, "REQ-1", actor_id="nv1")
        self.assertEqual(ket_qua["status"], "pending")
        self.assertEqual(ket_qua["file_count"], 3)


class DuyetTests(unittest.TestCase):
    def _duyet(self, **kwargs):
        db = MagicMock()
        db.execute.side_effect = [
            _row(_request()),
            _scalar("K02"),          # nguồn mặc định suy từ mã bước
            _scalar("SLOT-MOI"),
            _fetchall([("L1",), ("L2",), ("L3",)]),
            MagicMock(),             # nối checklist
            MagicMock(),             # cập nhật đề xuất
            MagicMock(),             # audit
        ]
        return slot_requests.review_request(
            db, "REQ-1", decision="approved", review_note=None, actor_id="gd1", **kwargs
        ), db

    def test_sinh_dung_mot_o_va_noi_het_tep(self):
        ket_qua, _ = self._duyet()
        self.assertEqual(ket_qua["slot_id"], "SLOT-MOI")
        self.assertEqual(ket_qua["linked"], 3)
        self.assertFalse(ket_qua["idempotent"])

    def test_khong_upload_lai_object_nao(self):
        _, db = self._duyet()
        moi_lenh = " ".join(str(c.args[0]).lower() for c in db.execute.call_args_list)
        self.assertNotIn("insert into public.dossier_documents ", moi_lenh)

    def test_noi_ca_vao_o_giay_lan_checklist(self):
        _, db = self._duyet()
        moi_lenh = " ".join(str(c.args[0]).lower() for c in db.execute.call_args_list)
        self.assertIn("insert into public.dossier_document_links", moi_lenh)
        self.assertIn("insert into public.checklist_result_document_links", moi_lenh)

    def test_khong_bao_gio_ghi_de_dossier_id(self):
        """dossier_id chỉ chứa MỘT giá trị.

        Gán nó lúc duyệt là lần duyệt sau đá tài liệu ra khỏi hồ sơ pháp lý
        trước — im lặng, không ai thấy. Quan hệ nhiều-nhiều phải đi qua bảng nối.
        """
        _, db = self._duyet()
        moi_lenh = " ".join(str(c.args[0]).lower() for c in db.execute.call_args_list)
        self.assertNotIn("set dossier_id", moi_lenh)
        self.assertNotIn("dossier_id =", moi_lenh)

    def test_duyet_lai_tra_ket_qua_cu_khong_tao_o_thu_hai(self):
        db = MagicMock()
        db.execute.side_effect = [_row(_request(status="approved", created_slot_id="SLOT-MOI"))]
        ket_qua = slot_requests.review_request(
            db, "REQ-1", decision="approved", review_note=None, actor_id="gd1",
        )
        self.assertTrue(ket_qua["idempotent"])
        self.assertEqual(ket_qua["slot_id"], "SLOT-MOI")
        # Chỉ đọc, không ghi gì thêm.
        self.assertEqual(db.execute.call_count, 1)

    def test_giam_doc_sua_ten_va_so_luong_truoc_khi_duyet(self):
        _, db = self._duyet(approved_name="Ảnh mốc ranh (đã duyệt)", approved_quantity=5)
        tham_so = [c.args[1] for c in db.execute.call_args_list
                   if len(c.args) > 1 and isinstance(c.args[1], dict) and "name" in c.args[1]]
        self.assertTrue(any(p.get("name") == "Ảnh mốc ranh (đã duyệt)" for p in tham_so))
        self.assertTrue(any(p.get("quantity") == 5 for p in tham_so))

    def test_o_sinh_ra_khong_gan_template_id(self):
        """Không tự đẩy loại phát sinh vào mẫu chung của công ty."""
        _, db = self._duyet()
        cau_slot = next(
            str(c.args[0]) for c in db.execute.call_args_list
            if "insert into public.dossier_document_slots" in str(c.args[0])
        )
        self.assertIn("template_id", cau_slot)
        self.assertIn("null", cau_slot)


class TuChoiTests(unittest.TestCase):
    def test_tu_choi_phai_ghi_ly_do(self):
        db = MagicMock()
        db.execute.side_effect = [_row(_request())]
        with self.assertRaises(HTTPException) as caught:
            slot_requests.review_request(
                db, "REQ-1", decision="rejected", review_note="  ", actor_id="gd1",
            )
        self.assertEqual(caught.exception.status_code, 422)

    def test_tu_choi_khong_tao_o_khong_tao_link(self):
        db = MagicMock()
        db.execute.side_effect = [_row(_request()), MagicMock(), MagicMock()]
        ket_qua = slot_requests.review_request(
            db, "REQ-1", decision="rejected", review_note="Tên chưa đúng thủ tục",
            actor_id="gd1",
        )
        self.assertIsNone(ket_qua["slot_id"])
        moi_lenh = " ".join(str(c.args[0]).lower() for c in db.execute.call_args_list)
        self.assertNotIn("insert into public.dossier_document_slots", moi_lenh)
        self.assertNotIn("insert into public.dossier_document_links", moi_lenh)

    def test_tu_choi_co_ghi_audit(self):
        db = MagicMock()
        db.execute.side_effect = [_row(_request()), MagicMock(), MagicMock()]
        slot_requests.review_request(
            db, "REQ-1", decision="rejected", review_note="Sai tên", actor_id="gd1",
        )
        moi_lenh = " ".join(str(c.args[0]).lower() for c in db.execute.call_args_list)
        self.assertIn("insert into public.audit_log", moi_lenh)

    def test_chua_gui_duyet_thi_khong_duyet_duoc(self):
        db = MagicMock()
        db.execute.side_effect = [_row(_request(status="draft"))]
        with self.assertRaises(HTTPException) as caught:
            slot_requests.review_request(
                db, "REQ-1", decision="approved", review_note=None, actor_id="gd1",
            )
        self.assertEqual(caught.exception.status_code, 409)


class DemMinCountTests(unittest.TestCase):
    """Nguồn đếm phải là dossier_document_links, không phải cột slot_id."""

    def test_truy_van_di_qua_bang_noi(self):
        from src.dossiers.documents import _CHECKLIST_OUTPUT_COUNT_QUERY

        sql = str(_CHECKLIST_OUTPUT_COUNT_QUERY).lower()
        self.assertIn("dossier_document_links", sql)
        self.assertIn("link_status = 'dang_dung'", sql)

    def test_khu_dem_trung_theo_document_id(self):
        from src.dossiers.documents import _CHECKLIST_OUTPUT_COUNT_QUERY

        self.assertIn("count(distinct t.document_id)", str(_CHECKLIST_OUTPUT_COUNT_QUERY).lower())

    def test_chi_dem_tai_lieu_dang_dung(self):
        from src.dossiers.documents import _CHECKLIST_OUTPUT_COUNT_QUERY

        self.assertIn("d.doc_status = 'dang_dung'", str(_CHECKLIST_OUTPUT_COUNT_QUERY).lower())

    def test_van_giu_duong_cu_cho_du_lieu_truoc_nhom_a(self):
        from src.dossiers.documents import _CHECKLIST_OUTPUT_COUNT_QUERY

        sql = str(_CHECKLIST_OUTPUT_COUNT_QUERY).lower()
        self.assertIn("d.slot_id is not null", sql)
        # UNION (không ALL) mới khử trùng được cặp trùng giữa hai đường.
        self.assertNotIn("union all", sql)


if __name__ == "__main__":
    unittest.main()


class HoSoPhapLyDocQuaLienKetTests(unittest.TestCase):
    """Tab Hồ sơ Pháp lý phải đọc theo Hạng mục qua ô giấy, không theo dossier_id."""

    def test_truy_van_di_qua_o_giay_cua_dung_hang_muc(self):
        import re

        src = open("/app/src/dossiers/documents.py", encoding="utf-8").read()
        than = re.search(r"def list_documents\(.*?\n    current = active_stage", src, re.S).group(0)
        self.assertIn("dossier_document_slots", than)
        self.assertIn("dossier_document_links", than)
        self.assertIn("s.service_line_id = h.service_line_id", than)
        self.assertIn("link_status = 'DANG_DUNG'", than)

    def test_van_giu_duong_cu_cho_du_lieu_legacy(self):
        import re

        src = open("/app/src/dossiers/documents.py", encoding="utf-8").read()
        than = re.search(r"def list_documents\(.*?\n    current = active_stage", src, re.S).group(0)
        self.assertIn("d.dossier_id = h.id", than)
        # UNION (không ALL) để một tệp nối nhiều ô vẫn chỉ ra một dòng.
        self.assertNotIn("union all", than.lower())

    def test_chi_tra_tai_lieu_dang_dung(self):
        import re

        src = open("/app/src/dossiers/documents.py", encoding="utf-8").read()
        than = re.search(r"def list_documents\(.*?\n    current = active_stage", src, re.S).group(0)
        self.assertIn("d.doc_status = 'DANG_DUNG'", than)


class DemTheoDungHangMucTests(unittest.TestCase):
    """min_count phải giới hạn theo service_line, không theo hợp đồng."""

    def test_truy_van_suy_hang_muc_tu_checklist(self):
        from src.dossiers.documents import _CHECKLIST_OUTPUT_COUNT_QUERY

        sql = str(_CHECKLIST_OUTPUT_COUNT_QUERY).lower()
        self.assertIn("workflow_instances", sql)
        self.assertIn("s.service_line_id = hm.service_line_id", sql)

    def test_chi_dem_o_giay_thuoc_hang_muc(self):
        from src.dossiers.documents import _CHECKLIST_OUTPUT_COUNT_QUERY

        sql = str(_CHECKLIST_OUTPUT_COUNT_QUERY).lower()
        # Cả hai nhánh UNION đều phải kiểm Hạng mục, kể cả đường tương thích cũ.
        self.assertEqual(sql.count("s.service_line_id = hm.service_line_id"), 2)
        self.assertEqual(sql.count("s.scope = 'service_line'"), 2)


class KhoaTrangThaiEndpointTests(unittest.TestCase):
    """pending/approved phải read-only — kể cả với Giám đốc."""

    def _goi(self, status, la_giam_doc=False):
        from src.routes import routes_slot_requests as routes

        db = MagicMock()
        db.execute.side_effect = [_row({
            "id": "REQ-1", "status": status, "requested_by": "u1",
            "contract_id": "003/BK-2026", "checklist_result_id": "CR-K02",
        })]
        with patch.object(routes, "check_user_permission", return_value=la_giam_doc):
            try:
                return routes._require_editable(db, MagicMock(id="u1"), "REQ-1"), None
            except HTTPException as exc:
                return None, exc

    def test_pending_khong_sua_duoc(self):
        _, loi = self._goi("pending")
        self.assertEqual(loi.status_code, 409)
        self.assertIn("đang chờ duyệt", str(loi.detail))

    def test_approved_khong_sua_duoc(self):
        _, loi = self._goi("approved")
        self.assertEqual(loi.status_code, 409)
        self.assertIn("đã được duyệt", str(loi.detail))

    def test_giam_doc_cung_khong_sua_duoc_de_xuat_pending(self):
        """Sửa tập tệp người ta đã gửi mà họ không biết là không được — dù là sếp."""
        _, loi = self._goi("pending", la_giam_doc=True)
        self.assertEqual(loi.status_code, 409)

    def test_draft_rejected_va_needs_more_thi_sua_duoc(self):
        for status in ("draft", "rejected", "needs_more"):
            request, loi = self._goi(status)
            self.assertIsNone(loi, status)
            self.assertEqual(request["status"], status)


class DonObjectKhiDbLoiTests(unittest.TestCase):
    """Transaction DB không dọn hộ MinIO/R2 — phải tự gọi delete_file."""

    def test_db_loi_thi_xoa_object_dung_mot_lan(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row(_request(status="draft")),
            _scalar("K02"),
            RuntimeError("DB chết giữa chừng"),
        ]
        with patch.object(slot_requests, "upload_file"), \
             patch.object(slot_requests, "ensure_bucket"), \
             patch.object(slot_requests, "delete_file") as delete, \
             patch("src.dossiers.documents._validate_upload"):
            with self.assertRaises(RuntimeError):
                slot_requests.add_file(
                    db, request_id="REQ-1", file_name="a.jpg",
                    content_type="image/jpeg", data=b"x", actor_id="nv1",
                )
        self.assertEqual(delete.call_count, 1)

    def test_db_thanh_cong_thi_khong_xoa_object(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row(_request(status="draft")), _scalar("K02"), MagicMock(), MagicMock(),
        ]
        with patch.object(slot_requests, "upload_file"), \
             patch.object(slot_requests, "ensure_bucket"), \
             patch.object(slot_requests, "delete_file") as delete, \
             patch("src.dossiers.documents._validate_upload"):
            slot_requests.add_file(
                db, request_id="REQ-1", file_name="a.jpg",
                content_type="image/jpeg", data=b"x", actor_id="nv1",
            )
        self.assertEqual(delete.call_count, 0)

    def test_go_tep_khoi_de_xuat_KHONG_xoa_object(self):
        """Gỡ quan hệ thôi. Tệp đã tải là sự việc có thật, giữ theo lịch sử."""
        db = MagicMock()
        db.execute.side_effect = [
            _row(_request(status="draft")),
            MagicMock(),                                        # xoá quan hệ
            MagicMock(**{"first.return_value": None}),          # không còn liên kết
            MagicMock(),                                        # hạ doc_status
            MagicMock(),                                        # audit
        ]
        with patch.object(slot_requests, "delete_file") as delete:
            slot_requests.remove_file(
                db, request_id="REQ-1", document_id="DOC-1", actor_id="nv1"
            )
        self.assertEqual(delete.call_count, 0)
        lenh = " ".join(str(c.args[0]).lower() for c in db.execute.call_args_list)
        self.assertIn("delete from public.document_slot_creation_request_documents", lenh)
        self.assertNotIn("delete from public.dossier_documents", lenh)


class NguonChinhThucTests(unittest.TestCase):
    """Nhân viên đề xuất nguồn, nhưng Giám đốc mới chốt giá trị chính thức."""

    def test_mac_dinh_suy_tu_ma_buoc(self):
        for node_code, mong_doi in (("K02", "CONG_TY"), ("K03", "CONG_TY"),
                                    ("K05", "CO_QUAN"), ("K01", "KHACH_HANG")):
            db = MagicMock()
            db.execute.side_effect = [_scalar(node_code)]
            self.assertEqual(
                slot_requests.default_source_for_node(db, "TN-1"), mong_doi, node_code
            )

    def test_buoc_la_thi_roi_ve_cong_ty(self):
        db = MagicMock()
        db.execute.side_effect = [_scalar("K99")]
        self.assertEqual(slot_requests.default_source_for_node(db, "TN-1"), "CONG_TY")

    def test_khong_lay_source_nhan_vien_de_xuat_lam_chinh_thuc(self):
        """Nhân viên khai KHACH_HANG cho bước K02 — ô giấy vẫn phải là CONG_TY."""
        db = MagicMock()
        db.execute.side_effect = [
            _row(_request(source="KHACH_HANG")),
            _scalar("K02"),          # default_source_for_node
            _scalar("SLOT-MOI"),
            _fetchall([("L1",)]),
            MagicMock(), MagicMock(), MagicMock(),
        ]
        ket_qua = slot_requests.review_request(
            db, "REQ-1", decision="approved", review_note=None, actor_id="gd1",
        )
        self.assertEqual(ket_qua["source"], "CONG_TY")

    def test_giam_doc_chot_nguon_khac_thi_dung_gia_tri_do(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row(_request()), _scalar("SLOT-MOI"), _fetchall([("L1",)]),
            MagicMock(), MagicMock(), MagicMock(),
        ]
        ket_qua = slot_requests.review_request(
            db, "REQ-1", decision="approved", review_note=None, actor_id="gd1",
            approved_source="CO_QUAN",
        )
        self.assertEqual(ket_qua["source"], "CO_QUAN")

    def test_nguon_ngoai_danh_sach_thi_tu_choi(self):
        db = MagicMock()
        db.execute.side_effect = [_row(_request())]
        with self.assertRaises(HTTPException) as caught:
            slot_requests.review_request(
                db, "REQ-1", decision="approved", review_note=None, actor_id="gd1",
                approved_source="LUNG_TUNG",
            )
        self.assertEqual(caught.exception.status_code, 422)


class GuiLaiXoaDauVetDuyetCuTests(unittest.TestCase):
    def test_rejected_gui_lai_thi_xoa_reviewed_va_ghi_audit(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row(_request(status="rejected")), _scalar(2), MagicMock(), MagicMock(),
        ]
        slot_requests.submit_request(db, "REQ-1", actor_id="nv1")
        lenh = " ".join(str(c.args[0]).lower() for c in db.execute.call_args_list)
        self.assertIn("reviewed_by = null", lenh)
        self.assertIn("reviewed_at = null", lenh)
        self.assertIn("review_note = null", lenh)
        self.assertIn("insert into public.audit_log", lenh)


class ChuaDuyetKhongLotVaoHoSoTests(unittest.TestCase):
    """Bốn đường đọc, khoá riêng từng đường — không gộp thành một test chung.

    Tệp của đề xuất chưa duyệt không có slot_id, không có dossier_id và không có
    dossier_document_links. Mỗi truy vấn dưới đây phải bắt buộc đi qua một trong
    ba thứ đó, nên tệp ấy vô hình với cả bốn.
    """

    @staticmethod
    def _than_ham(ten_ham: str, ket_thuc: str) -> str:
        import re

        src = open("/app/src/dossiers/documents.py", encoding="utf-8").read()
        return re.search(rf"def {ten_ham}\(.*?{ket_thuc}", src, re.S).group(0)

    def test_duong_1_cau_truc_tai_lieu_hop_dong(self):
        """Sổ giấy tờ đọc tệp qua ô giấy — không ô thì không hiện."""
        import re

        src = open("/app/src/dossiers/register.py", encoding="utf-8").read()
        # Truy vấn nay là template có placeholder, chọn biến thể lúc chạy theo
        # schema — tên biến đổi từ _SLOTS_QUERY sang _SLOTS_QUERY_TMPL.
        truy_van = re.search(r'_SLOTS_QUERY_TMPL = """.*?"""', src, re.S).group(0)
        self.assertIn("d.slot_id = s.id", truy_van)
        self.assertIn("dossier_document_links", truy_van)

    def test_duong_2_ho_so_do_ve(self):
        """Hồ sơ Đo vẽ dùng chung sổ giấy tờ, nên cùng một hàng rào.

        survey_records không có bảng tài liệu riêng: màn Đo vẽ render
        DocumentRegister, đọc qua /api/document-register/register.
        """
        src = open("/app/src/routes/routes_survey_records.py", encoding="utf-8").read()
        self.assertNotIn("dossier_documents", src)

    def test_duong_3_ho_so_phap_ly(self):
        than = self._than_ham("list_documents", r"\n    current = active_stage")
        # Bắt buộc qua ô giấy + link đang dùng, hoặc dossier_id (legacy).
        self.assertIn("dossier_document_links", than)
        self.assertIn("link_status = 'DANG_DUNG'", than)
        self.assertIn("d.dossier_id = h.id", than)
        # Không có nhánh nào lấy thẳng theo contract/service_line mà bỏ qua hai thứ trên.
        self.assertNotIn("where d.contract_id", than)

    def test_duong_4_min_count(self):
        from src.dossiers.documents import _CHECKLIST_OUTPUT_COUNT_QUERY

        sql = str(_CHECKLIST_OUTPUT_COUNT_QUERY).lower()
        # Cả hai nhánh UNION đều phải qua ô giấy: một qua link, một qua slot_id.
        self.assertIn("dossier_document_links", sql)
        self.assertIn("d.slot_id is not null", sql)
        # Không có đường nào đếm tệp trần chưa gắn ô.
        self.assertNotIn("from public.dossier_documents d\n      where l.checklist", sql)

    def test_tep_de_xuat_khong_co_ba_thu_lam_no_chinh_thuc(self):
        """Chốt lại ở phía ghi: add_file không đặt slot_id/dossier_id/link."""
        import re

        src = open("/app/src/dossiers/slot_requests.py", encoding="utf-8").read()
        than = re.search(r"def add_file\(.*?return \{\"request_id\"", src, re.S).group(0)
        cau_insert = re.search(
            r"insert into public\.dossier_documents.*?\"\"\"", than, re.S
        ).group(0)
        self.assertNotIn("slot_id", cau_insert)
        self.assertNotIn("dossier_id", cau_insert)
        # Chỉ soi LỆNH SQL, không soi lời chú thích.
        self.assertNotIn("insert into public.dossier_document_links", than)


class CachLyTaiLieuChuaDuyetTests(unittest.TestCase):
    """Tệp của đề xuất chưa duyệt không được đi đường vòng vào hồ sơ chính thức."""

    def _guard(self, status):
        db = MagicMock()
        db.execute.side_effect = [
            _row({"id": "REQ-1", "status": status, "proposed_name": "Ảnh mốc ranh"})
            if status else _row(None)
        ]
        try:
            slot_requests.assert_document_not_reserved(db, "DOC-1")
            return None
        except HTTPException as exc:
            return exc

    def test_draft_thi_chan(self):
        loi = self._guard("draft")
        self.assertEqual(loi.status_code, 409)
        self.assertIn("còn là bản nháp", str(loi.detail))

    def test_pending_thi_chan(self):
        loi = self._guard("pending")
        self.assertEqual(loi.status_code, 409)
        self.assertIn("đang chờ Giám đốc duyệt", str(loi.detail))

    def test_rejected_thi_chan(self):
        loi = self._guard("rejected")
        self.assertEqual(loi.status_code, 409)
        self.assertIn("đã bị từ chối", str(loi.detail))

    def test_needs_more_thi_chan(self):
        loi = self._guard("needs_more")
        self.assertEqual(loi.status_code, 409)
        self.assertIn("cần bổ sung", str(loi.detail))

    def test_khong_thuoc_de_xuat_nao_hoac_da_duyet_thi_cho_qua(self):
        """Truy vấn chỉ tìm trạng thái chưa duyệt, nên approved không trả dòng nào."""
        self.assertIsNone(self._guard(None))

    def test_truy_van_soi_du_bon_trang_thai_chua_duyet(self):
        self.assertEqual(
            slot_requests._TRANG_THAI_CHUA_DUYET,
            ("draft", "pending", "rejected", "needs_more"),
        )


class ChotChanCamOMoiDuongTests(unittest.TestCase):
    """Chốt chặn phải có mặt ở TẤT CẢ đường tạo liên kết chính thức."""

    @staticmethod
    def _src(path):
        return open(f"/app/src/dossiers/{path}", encoding="utf-8").read()

    def test_reuse_document_for_checklist_co_chot(self):
        import re

        than = re.search(
            r"def reuse_document_for_checklist\(.*?return \{\"checklist_result_id\"",
            self._src("documents.py"), re.S,
        ).group(0)
        self.assertIn("assert_document_not_reserved(db, document_id)", than)

    def test_attach_existing_document_co_chot(self):
        import re

        than = re.search(
            r"def attach_existing_document\(.*?return reuse_document_for_checklist",
            self._src("documents.py"), re.S,
        ).group(0)
        self.assertIn("assert_document_not_reserved(db, document_id)", than)

    def test_link_source_document_K01_co_chot(self):
        import re

        than = re.search(
            r"def link_source_document\(.*?existing = db\.execute",
            self._src("register.py"), re.S,
        ).group(0)
        self.assertIn("assert_document_not_reserved(db, document_id)", than)

    def test_moi_lenh_tao_link_deu_nam_sau_mot_chot(self):
        """Đếm: 3 nơi insert dossier_document_links, 3 nơi có chốt hoặc tự sinh."""
        docs = self._src("documents.py")
        reg = self._src("register.py")
        slot = self._src("slot_requests.py")
        tong_insert = (docs + reg + slot).count("insert into public.dossier_document_links")
        self.assertEqual(tong_insert, 3)
        # slot_requests tự sinh link lúc DUYỆT nên không cần chốt; hai nơi kia phải có.
        self.assertIn("assert_document_not_reserved", docs)
        self.assertIn("assert_document_not_reserved", reg)


class GoTepKhoiDeXuatTests(unittest.TestCase):
    def _go(self, con_lien_ket):
        db = MagicMock()
        db.execute.side_effect = [
            _row(_request(status="draft")),
            MagicMock(),                                   # delete quan hệ
            MagicMock(**{"first.return_value": (1,) if con_lien_ket else None}),
            *([] if con_lien_ket else [MagicMock()]),      # hạ doc_status
            MagicMock(),                                   # audit
        ]
        with patch.object(slot_requests, "delete_file") as delete:
            slot_requests.remove_file(
                db, request_id="REQ-1", document_id="DOC-1", actor_id="nv1"
            )
        return db, delete

    def test_khong_con_lien_ket_nao_thi_ha_xuong_DA_GO(self):
        db, delete = self._go(con_lien_ket=False)
        lenh = " ".join(str(c.args[0]).lower() for c in db.execute.call_args_list)
        self.assertIn("set doc_status = 'da_go'", lenh)
        # Object KHÔNG bị xoá — giữ để tra lại.
        self.assertEqual(delete.call_count, 0)

    def test_con_lien_ket_chinh_thuc_thi_giu_nguyen_DANG_DUNG(self):
        db, _ = self._go(con_lien_ket=True)
        lenh = " ".join(str(c.args[0]).lower() for c in db.execute.call_args_list)
        self.assertNotIn("set doc_status = 'da_go'", lenh)

    def test_luon_ghi_audit(self):
        db, _ = self._go(con_lien_ket=False)
        lenh = " ".join(str(c.args[0]).lower() for c in db.execute.call_args_list)
        self.assertIn("insert into public.audit_log", lenh)


class ThuTuCommitRoiMoiPublishTests(unittest.TestCase):
    """SSE phát SAU commit, và SSE lỗi không được cuốn nghiệp vụ đi."""

    @staticmethod
    def _than(ten_ham):
        import re

        src = open("/app/src/routes/routes_slot_requests.py", encoding="utf-8").read()
        return re.search(rf"def {ten_ham}\(.*?return \{{\"status\": \"success\"", src, re.S).group(0)

    def test_submit_commit_truoc_publish(self):
        than = self._than("submit_slot_request")
        self.assertLess(than.index("db.commit()"), than.index("publish_timeline_change"))

    def test_review_commit_truoc_publish(self):
        than = self._than("review_slot_request")
        self.assertLess(than.index("db.commit()"), than.index("publish_timeline_change"))

    def test_publish_nam_ngoai_khoi_try_rollback(self):
        """Publish trong try thì Redis lỗi sẽ kéo theo db.rollback() — sai."""
        for ten in ("submit_slot_request", "review_slot_request"):
            than = self._than(ten)
            khoi_try = than[than.index("try:"):than.index("publish_timeline_change")]
            self.assertNotIn("publish_timeline_change", khoi_try, ten)

    def test_publish_that_bai_khong_lam_hong_nghiep_vu(self):
        """publish_timeline_change tự nuốt RedisError — commit đã xong rồi."""
        import inspect

        from src.services.timeline_realtime import publish_timeline_change

        src = inspect.getsource(publish_timeline_change)
        self.assertIn("except RedisError", src)

    def test_payload_sse_khong_chua_du_lieu_nhay_cam(self):
        import inspect

        from src.services.timeline_realtime import publish_timeline_change

        src = inspect.getsource(publish_timeline_change)
        # Chỉ loại sự kiện, id và mốc thời gian.
        self.assertIn('"source"', src)
        self.assertIn('"entity_id"', src)
        self.assertIn('"changed_at"', src)
        for cam in ("file_name", "object_key", "reason", "review_note", "full_name"):
            self.assertNotIn(cam, src)
