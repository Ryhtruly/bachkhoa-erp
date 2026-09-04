"""Kho giấy tờ hồ sơ pháp lý: đúng ngăn, đúng bước, đúng chỗ lưu."""

import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from src.dossiers import documents
from src.files.references import DossierFileReference


def _row(value):
    result = MagicMock()
    result.mappings.return_value.first.return_value = value
    return result


def _nap_cache_schema():
    """Nạp sẵn kết quả dò schema.

    k01_blockers dò một lần xem CSDL đã có cột mới chưa. Với phiên giả, lần dò đó
    ăn mất một phần tử side_effect và làm mọi mock lệch nhịp — tệ hơn là lệch
    theo THỨ TỰ chạy test, vì kết quả dò được nhớ lại giữa các test.
    """
    from src.dossiers import register

    register._SCHEMA_CO_VERSION.update({"value": True, "waiver": True})


def _scalar(value):
    """Truy vấn trả một giá trị đơn — k01_blockers hỏi document_register_version."""
    result = MagicMock()
    result.scalar.return_value = value
    return result


class DuongDanLuuTruTests(unittest.TestCase):
    """Cấu trúc thư mục phải rõ ràng dù có 10 hay 10.000 hợp đồng."""

    def test_moi_hang_muc_mot_thu_muc_chia_theo_giai_doan(self):
        key = DossierFileReference.build(
            contract_id="001/BK-2026",
            document_id="7f3a9c21",
            filename="don-09dk.pdf",
        ).object_key
        self.assertEqual(
            key, "contracts/001_BK-2026/dossier-documents/7f3a9c21/document-7f3a9c21.pdf"
        )

    def test_van_nam_duoi_prefix_contracts_de_chay_duoc_tren_r2(self):
        """Production gộp mọi thứ vào MỘT bucket private, chỉ tách bằng prefix."""
        from src.services.storage_service import GENERIC_OBJECT_PREFIXES, _require_prefix

        key = DossierFileReference.build(
            contract_id="002/BK-2026", document_id="sl-2",
            filename="bien-nhan.jpg",
        ).object_key
        self.assertEqual(_require_prefix(key, GENERIC_OBJECT_PREFIXES), key)

    def test_accepts_generic_browser_mime_for_supported_extension(self):
        documents._validate_upload('tai-lieu.docx', 'application/octet-stream', b'PK-office')

    def test_ten_tep_co_dau_va_ky_tu_la_bi_chuan_hoa(self):
        key = DossierFileReference.build(
            contract_id="003/BK-2026", document_id="sl-3",
            filename="../../etc/passwd biên bản.pdf",
        ).object_key
        self.assertNotIn("..", key)
        self.assertTrue(key.startswith("contracts/003_BK-2026/dossier-documents/sl-3/"))

    def test_thieu_document_id_thi_tu_choi(self):
        """Khoá phải gắn với document_id; thiếu nó là không đặt được chỗ ổn định."""
        with self.assertRaises(ValueError):
            DossierFileReference.build(contract_id="x", document_id="", filename="a.pdf")


class DieuKienKichHoatTheoBuocTests(unittest.TestCase):
    """K04 chỉ mở trường có sau khi soạn; K05 mới mở trường của lúc đi nộp."""

    def test_moi_buoc_mo_dung_bo_truong_cua_no(self):
        soan = documents.STAGE_FIELDS["soan-ho-so"]
        nop = documents.STAGE_FIELDS["nop-co-quan"]
        # Chưa đi nộp thì không thể có số biên nhận hay ngày hẹn trả.
        self.assertNotIn("receipt_code", soan)
        self.assertNotIn("expected_return_date", soan)
        self.assertIn("receipt_code", nop)
        self.assertIn("expected_return_date", nop)
        # Ngược lại, tệp bộ hồ sơ đã soạn thuộc về bước soạn.
        self.assertIn("dossier_file_url", soan)

    def test_anh_xa_buoc_sang_ngan_luu_tru(self):
        self.assertEqual(documents.stage_for_node_code("K04"), "soan-ho-so")
        self.assertEqual(documents.stage_for_node_code("K05b"), "nop-co-quan")
        self.assertEqual(documents.stage_for_node_code("K06"), "ket-qua")
        self.assertEqual(documents.stage_for_node_code("K03"), "chuan-hoa-ky-thuat")
        # K02 sinh tài liệu THÔ tại hiện trường, K03 sinh bản ĐÃ XỬ LÝ — hai giai
        # đoạn khác nhau để tài liệu hai bước không lẫn vào nhau.
        self.assertEqual(documents.stage_for_node_code("K02"), "do-hien-truong")

    def test_khong_co_buoc_phap_ly_nao_chay_thi_khoa_het(self):
        db = MagicMock()
        db.execute.side_effect = [_row(None)]
        result = documents.active_stage(db, "sl-1")
        self.assertIsNone(result["stage"])
        self.assertEqual(result["editable_fields"], [])

    def test_dang_o_k04_thi_chi_mo_ngan_soan_ho_so(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row({"id": "TN-K04", "node_code": "K04", "status": "in_progress"})
        ]
        result = documents.active_stage(db, "sl-1")
        self.assertEqual(result["stage"], "soan-ho-so")
        self.assertIn("dossier_file_url", result["editable_fields"])
        self.assertNotIn("receipt_code", result["editable_fields"])


class VongDoiObjectAppendOnlyTests(unittest.TestCase):
    def test_go_tai_lieu_chi_doi_trang_thai_va_giu_dong_tai_lieu(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row({
                "id": "DOC-1", "dossier_id": "DOS-1", "object_key": "contracts/HD-1/dossier-documents/DOC-1/a.pdf",
                "file_name": "a.pdf", "stage": "soan-ho-so", "doc_status": "DANG_DUNG",
            }),
            MagicMock(),
            MagicMock(),
            MagicMock(),
        ]

        result = documents.delete_document(db, "DOC-1", actor_id="USER-1")

        self.assertEqual(result["doc_status"], "DA_GO")
        sql = " ".join(str(call.args[0]).lower() for call in db.execute.call_args_list)
        self.assertIn("update public.dossier_documents", sql)
        self.assertIn("update public.dossier_document_links", sql)
        self.assertNotIn("delete from public.dossier_documents", sql)


class ChanNopSaiNganTests(unittest.TestCase):
    """Chặn ở máy chủ, không chỉ ẩn nút trên giao diện."""

    def test_nop_bien_nhan_khi_dang_o_buoc_soan_thi_bi_tu_choi(self):
        db = MagicMock()
        with patch.object(documents, "_dossier_or_404", return_value={
            "id": "D-1", "service_line_id": "sl-1", "contract_id": "001/BK-2026",
            "dossier_name": "Hồ sơ", "status": "PROCESSING",
        }), patch.object(documents, "active_stage", return_value={
            "stage": "soan-ho-so", "task_node_id": "TN-K04",
            "node_code": "K04", "editable_fields": [],
        }):
            with self.assertRaises(HTTPException) as caught:
                documents.create_document(
                    db, "D-1", stage="nop-co-quan", file_name="bien-nhan.pdf",
                    content_type="application/pdf", data=b"%PDF-1.4 ...",
                    actor_id="USER-1",
                )
        self.assertEqual(caught.exception.status_code, 409)
        self.assertIn("K04", str(caught.exception.detail))

    def test_tep_qua_lon_bi_chan_truoc_khi_cham_toi_storage(self):
        with self.assertRaises(HTTPException) as caught:
            documents._validate_upload(
                "scan.pdf", "application/pdf",
                b"x" * (documents.MAX_DOCUMENT_BYTES + 1),
            )
        self.assertEqual(caught.exception.status_code, 400)

    def test_dinh_dang_la_bi_chan(self):
        with self.assertRaises(HTTPException):
            documents._validate_upload("virus.exe", None, b"MZ")

    def test_pdf_va_anh_deu_nhan(self):
        documents._validate_upload("don.pdf", "application/pdf", b"%PDF")
        documents._validate_upload("bien-nhan.JPG", "image/jpeg", b"\xff\xd8\xff")


if __name__ == "__main__":
    unittest.main()


class BuocK01RaSoatGiayToTests(unittest.TestCase):
    """K01 là bước rà soát và phân loại giấy khách đưa — ai cũng nhận được."""

    def test_k01_mo_cho_ca_ba_phong(self):
        from src.contracts.workflow_runtime import task_pool_departments

        mo_cho = task_pool_departments("K01")
        self.assertIn("SALES", mo_cho)
        self.assertIn("LEGAL", mo_cho)
        self.assertIn("SURVEY", mo_cho)

    def test_buoc_do_ve_van_chi_cua_phong_do_ve(self):
        from src.contracts.workflow_runtime import task_pool_departments

        self.assertEqual(task_pool_departments("K02"), ("SURVEY",))
        self.assertEqual(task_pool_departments("K04"), ("LEGAL",))

    def test_giam_doc_cau_hinh_nhieu_phong_thi_uu_tien_cau_hinh(self):
        from src.contracts.workflow_runtime import task_pool_departments

        self.assertEqual(
            task_pool_departments("K02", {"pool_department_codes": ["legal", "survey"]}),
            ("LEGAL", "SURVEY"),
        )

    def test_phong_ban_chinh_van_tra_ve_mot_gia_tri(self):
        """Các chỗ gọi cũ chỉ cần một mã phòng thì không được vỡ."""
        from src.contracts.workflow_runtime import task_pool_department_code

        self.assertEqual(task_pool_department_code("K01"), "SALES")
        self.assertEqual(task_pool_department_code("K04"), "LEGAL")


class KhoNguonHopDongTests(unittest.TestCase):
    """Khoá lưu trữ gắn với document_id, KHÔNG gắn với loại giấy."""

    def test_khoa_theo_document_id_khong_theo_ten_giay(self):
        """Phân loại có thể đổi; đường dẫn thì không được đổi theo."""
        from src.files.references import ContractFileReference

        key = ContractFileReference.build(
            contract_id="001/BK-2026",
            document_id="7f3a9c21b4d54e0f",
            filename="scan.pdf",
        ).object_key
        self.assertEqual(
            key,
            "contracts/001_BK-2026/source-documents/7f3a9c21b4d54e0f/document-7f3a9c21b4d54e0f.pdf",
        )

    def test_moi_tep_mot_thu_muc_rieng_du_cung_ten(self):
        from src.files.references import ContractFileReference

        mot = ContractFileReference.build(
            contract_id="001/BK-2026", document_id="aaa", filename="CCCD.pdf"
        ).object_key
        hai = ContractFileReference.build(
            contract_id="001/BK-2026", document_id="bbb", filename="CCCD.pdf"
        ).object_key
        self.assertNotEqual(mot, hai)

    def test_khoa_khong_chua_ten_khach_hay_loai_giay(self):
        """Master Plan §9: không đưa PII vào object key."""
        from src.files.references import ContractFileReference

        key = ContractFileReference.build(
            contract_id="001/BK-2026", document_id="abc123", filename="scan.pdf"
        ).object_key
        self.assertNotIn("giay-chung-nhan", key)
        self.assertNotIn("cccd", key.rsplit("/", 1)[0].lower())

    def test_van_nam_duoi_prefix_contracts_cho_r2(self):
        from src.files.references import ContractFileReference
        from src.services.storage_service import GENERIC_OBJECT_PREFIXES, _require_prefix

        key = ContractFileReference.build(
            contract_id="002/BK-2026", document_id="d1", filename="b.jpg",
        ).object_key
        self.assertEqual(_require_prefix(key, GENERIC_OBJECT_PREFIXES), key)

    def test_ten_tep_la_ky_tu_van_ra_duong_dan_an_toan(self):
        from src.files.references import ContractFileReference

        key = ContractFileReference.build(
            contract_id="003/BK-2026", document_id="d2", filename="../../etc///passwd.pdf",
        ).object_key
        self.assertNotIn("..", key)
        self.assertTrue(key.startswith("contracts/003_BK-2026/source-documents/d2/"))

    def test_thieu_document_id_thi_tu_choi(self):
        from src.files.references import ContractFileReference

        with self.assertRaises(ValueError):
            ContractFileReference.build(
                contract_id="001/BK-2026", document_id=None, filename="a.pdf"
            )


class MotHamDocTepTests(unittest.TestCase):
    """storage_service chỉ được có MỘT get_file."""

    def test_khong_con_dinh_nghia_trung(self):
        import inspect

        from src.services import storage_service

        ma_nguon = inspect.getsource(storage_service)
        self.assertEqual(ma_nguon.count("\ndef get_file("), 1)

    def test_ban_con_lai_la_ban_co_kiem_prefix(self):
        import inspect

        from src.services import storage_service

        ma_nguon = inspect.getsource(storage_service.get_file)
        self.assertIn("_require_prefix", ma_nguon)


class GiayToPhatSinhTests(unittest.TestCase):
    """Nhân viên tự thêm mục khi gặp giấy ngoài mẫu."""

    def _db_khong_trung(self):
        db = MagicMock()
        db.execute.side_effect = [
            _row({"id": "HD-1"}),          # _contract_or_404
            MagicMock(**{"first.return_value": None}),  # kiểm tra trùng tên
            MagicMock(**{"scalar.return_value": "SLOT-MOI"}),
        ]
        return db

    def test_them_muc_moi_thi_luon_la_khong_bat_buoc(self):
        """Tự đặt một ô bắt buộc rồi chính mình không lấp được là tự khoá đường nộp."""
        from src.dossiers import register

        db = self._db_khong_trung()
        register.add_slot(
            db, contract_id="HD-1", service_line_id=None,
            name="Giấy xác nhận tình trạng nhà", source="KHACH_HANG", actor_id="USER-1",
        )
        cau_lenh = str(db.execute.call_args_list[2].args[0])
        self.assertIn("false, :needs_original", cau_lenh)

    def test_ten_qua_ngan_bi_tu_choi(self):
        from src.dossiers import register

        with self.assertRaises(HTTPException) as caught:
            register.add_slot(
                db=MagicMock(), contract_id="HD-1", service_line_id=None,
                name="ab", source="KHACH_HANG", actor_id="USER-1",
            )
        self.assertEqual(caught.exception.status_code, 422)

    def test_trung_ten_trong_cung_so_thi_chan(self):
        from src.dossiers import register

        db = MagicMock()
        db.execute.side_effect = [
            _row({"id": "HD-1"}),
            MagicMock(**{"first.return_value": (1,)}),
        ]
        with self.assertRaises(HTTPException) as caught:
            register.add_slot(
                db, contract_id="HD-1", service_line_id=None,
                name="CCCD/CMND của chủ sử dụng đất", source="KHACH_HANG", actor_id="USER-1",
            )
        self.assertEqual(caught.exception.status_code, 409)

    def test_khong_go_duoc_muc_sinh_tu_mau(self):
        """Giấy bắt buộc theo thủ tục thì nhân viên không tự xoá khỏi sổ."""
        from src.dossiers import register

        db = MagicMock()
        db.execute.side_effect = [
            _row({
                "id": "S-1", "name": "Đơn theo mẫu", "template_id": "T-1",
                "so_tep": 0, "so_noi": 0,
            })
        ]
        with self.assertRaises(HTTPException) as caught:
            register.remove_slot(db, "S-1", actor_id="USER-1")
        self.assertEqual(caught.exception.status_code, 409)

    def test_muc_phat_sinh_con_tep_thi_phai_go_tep_truoc(self):
        from src.dossiers import register

        db = MagicMock()
        db.execute.side_effect = [
            _row({
                "id": "S-2", "name": "Giấy lạ", "template_id": None,
                "so_tep": 2, "so_noi": 0,
            })
        ]
        with self.assertRaises(HTTPException) as caught:
            register.remove_slot(db, "S-2", actor_id="USER-1")
        self.assertIn("2 bản scan", str(caught.exception.detail))

    def test_o_con_nhan_tai_lieu_tu_kho_nguon_thi_khong_go_duoc(self):
        """Ô không giữ tệp riêng nào, nhưng đang nhận tài liệu dùng chung.

        Đây là đường mà bảng nối mở ra: tệp nằm ở kho nguồn của Hợp đồng, ô chỉ
        trỏ tới. Không đếm đường này thì lệnh xoá đâm vào khoá ngoại restrict và
        vỡ thành lỗi DB thô.
        """
        from src.dossiers import register

        db = MagicMock()
        db.execute.side_effect = [
            _row({
                "id": "S-3", "name": "CCCD chủ đất", "template_id": None,
                "so_tep": 0, "so_noi": 2,
            })
        ]
        with self.assertRaises(HTTPException) as caught:
            register.remove_slot(db, "S-3", actor_id="USER-1")
        self.assertEqual(caught.exception.status_code, 409)
        self.assertIn("2 tài liệu từ kho nguồn", str(caught.exception.detail))
        # Chặn ở tầng nghiệp vụ, chưa hề chạm tới lệnh xoá.
        self.assertEqual(db.execute.call_count, 1)


class DuaMucPhatSinhVaoMauTests(unittest.TestCase):
    """Bộ mẫu tự lớn lên theo thực tế — và tên giấy thôi trôi."""

    def test_muc_o_hang_muc_vao_dung_dang_ho_so_cua_hang_muc(self):
        from src.dossiers import register

        db = MagicMock()
        db.execute.side_effect = [
            _row({
                "id": "S-1", "name": "Giấy xác nhận tình trạng nhà", "source": "KHACH_HANG",
                "scope": "SERVICE_LINE", "needs_original": False, "quantity": 1,
                "template_id": None, "task_type_id": "tt_010",
            }),
            MagicMock(**{"scalar.return_value": "T-MOI"}),
            MagicMock(),
        ]
        result = register.promote_slot_to_template(db, "S-1", actor_id="USER-GD")
        self.assertEqual(result["template_id"], "T-MOI")
        self.assertEqual(db.execute.call_args_list[1].args[1]["task_type_id"], "tt_010")

    def test_muc_o_hop_dong_vao_bo_chung(self):
        """Hợp đồng nhiều hạng mục khác thủ tục nên không quy về một Dạng hồ sơ."""
        from src.dossiers import register

        db = MagicMock()
        db.execute.side_effect = [
            _row({
                "id": "S-2", "name": "Giấy tờ nguồn gốc bổ sung", "source": "KHACH_HANG",
                "scope": "CONTRACT", "needs_original": False, "quantity": 1,
                "template_id": None, "task_type_id": None,
            }),
            MagicMock(**{"scalar.return_value": "T-CHUNG"}),
            MagicMock(),
        ]
        result = register.promote_slot_to_template(db, "S-2", actor_id="USER-GD")
        self.assertIsNone(db.execute.call_args_list[1].args[1]["task_type_id"])
        self.assertEqual(result["scope"], "Mọi thủ tục")

    def test_muc_da_la_mau_thi_khong_dua_lai(self):
        from src.dossiers import register

        db = MagicMock()
        db.execute.side_effect = [
            _row({
                "id": "S-3", "name": "Đơn theo mẫu", "source": "CONG_TY",
                "scope": "SERVICE_LINE", "needs_original": True, "quantity": 1,
                "template_id": "T-CU", "task_type_id": "tt_013",
            })
        ]
        with self.assertRaises(HTTPException) as caught:
            register.promote_slot_to_template(db, "S-3", actor_id="USER-GD")
        self.assertEqual(caught.exception.status_code, 409)

    def test_vao_mau_thi_khong_con_bat_buoc_ngay(self):
        """Thêm một giấy bắt buộc vào mẫu là mọi hồ sơ đang chạy bỗng thiếu giấy."""
        from src.dossiers import register

        db = MagicMock()
        db.execute.side_effect = [
            _row({
                "id": "S-4", "name": "Giấy lạ", "source": "CO_QUAN",
                "scope": "SERVICE_LINE", "needs_original": False, "quantity": 1,
                "template_id": None, "task_type_id": "tt_013",
            }),
            MagicMock(**{"scalar.return_value": "T-4"}),
            MagicMock(),
        ]
        register.promote_slot_to_template(db, "S-4", actor_id="USER-GD")
        cau_lenh = str(db.execute.call_args_list[1].args[0])
        self.assertIn(":source, false, :needs_original", cau_lenh)


class QuyenCapNhatSoTests(unittest.TestCase):
    """Ai đang giữ một bước của hợp đồng thì cập nhật được sổ của hợp đồng đó."""

    def test_khong_doi_quyen_quan_ly_nua(self):
        """K01 ai cũng nhận được; đòi quyền contract:update là chặn chính người làm."""
        import inspect

        from src.routes import routes_document_register as routes

        ma_nguon = inspect.getsource(routes)
        # Cổng quyền cũ chỉ còn đúng một chỗ: bên trong hàm kiểm tra mới.
        self.assertEqual(ma_nguon.count('check_user_permission(db, user, "contract", "update")'), 1)
        self.assertIn("_require_can_work", ma_nguon)

    def test_sua_o_giay_phai_qua_cong_kiem_tra(self):
        import inspect

        from src.routes import routes_document_register as routes

        ma_nguon = inspect.getsource(routes.update_slot)
        self.assertIn("_require_can_work", ma_nguon)


class ChotSoTruocKhiGuiChecklistTests(unittest.TestCase):
    """Thiếu giấy KHÔNG được chặn đường gửi checklist (đổi chủ đích 27/08)."""

    def test_khong_con_chan_cung_o_duong_gui_checklist(self):
        """ĐÃ ĐỔI CHỦ ĐÍCH. Bản trước chốt rằng phải chặn ở đây.

        Chốt đó tạo ra một dây chuyền ngõ cụt có thật, đã đo trên trình duyệt:
        mục checklist không đánh dấu xong được → nút "Nộp nghiệm thu" của Node
        khoá theo → giấy khách không có thật thì bước treo vĩnh viễn, và đường
        thoát duy nhất là nhét đại một tệp cho qua cổng.

        Điều PHẢI giữ: không có gì rơi vào im lặng. Danh sách thiếu được chụp
        lại lúc nộp nghiệm thu Node và đưa tận mắt Giám đốc.
        """
        import inspect

        from src.contracts import workflow_runtime
        from src.employee_portal.service import EmployeePortalService

        ma_nguon = inspect.getsource(
            EmployeePortalService._authorized_checklist_for_submission
        )
        self.assertNotIn("k01_blockers", ma_nguon)
        self.assertNotIn("checklist_output_blockers", ma_nguon)
        self.assertNotIn("Chưa phân loại xong giấy tờ khách cung cấp", ma_nguon)

        # Nhưng vết thì phải còn: cổng dời sang lúc nộp nghiệm thu Node.
        nop = inspect.getsource(workflow_runtime.submit_task_node_for_acceptance)
        self.assertIn("node_shortage_report", nop)
        self.assertIn('"missing": ban_thieu', nop)

    def test_nop_nghiem_thu_cung_dung_k01_blockers_chu_khong_tu_viet_truy_van(self):
        """Đường "Nộp hoàn thành công việc" từng tự viết truy vấn riêng và nó sai
        ba đường: chỉ đọc scope='CONTRACT' nên Hạng mục sổ V2 không bị kiểm; đọc
        s.status thay vì đếm liên kết đang dùng; và KHÔNG biết phiếu xin miễn —
        khiến giấy đã được miễn vẫn chặn nộp vĩnh viễn.

        Bước K01 không có checklist thì nhân viên bấm ĐÚNG nút này, nên đây
        không phải hàng rào chết như từng giả định.
        """
        import inspect

        from src.contracts import workflow_runtime

        from src.dossiers import documents

        # ĐÃ ĐỔI CHỦ ĐÍCH 27/08: thiếu giấy KHÔNG còn chặn nộp. Cổng K01 không
        # nằm trong đường nộp nữa mà chảy vào node_shortage_report — nhân viên
        # nộp được, Giám đốc quyết có lưu vết. Nhưng nguồn sự thật vẫn phải là
        # MỘT: k01_blockers, không ai được viết lại truy vấn sổ giấy lần nữa.
        nop = inspect.getsource(workflow_runtime.submit_task_node_for_acceptance)
        self.assertNotIn("raise WorkflowValidationError(\n                \"Chưa phân loại", nop)
        self.assertIn("node_shortage_report", nop)
        self.assertNotIn("s.status = 'CHUA_CO'", nop)
        self.assertNotIn("dossier_document_slots", nop)

        bao_cao = inspect.getsource(documents.node_shortage_report)
        self.assertIn("k01_blockers", bao_cao)
        self.assertIn('blockers.get("required_missing"', bao_cao)
        self.assertNotIn("dossier_document_slots", bao_cao)


class PhanLoaiKhoNguonK01Tests(unittest.TestCase):
    """Một tệp nguồn có thể được phân loại cho nhiều Hạng mục mà không copy object."""

    def test_noi_vao_o_khach_hang_cua_hang_muc_thanh_cong(self):
        from src.dossiers import register

        db = MagicMock()
        db.execute.side_effect = [
            _row({
                "slot_id": "S-1", "slot_name": "Giấy phép xây dựng",
                "source": "KHACH_HANG", "slot_status": "CHUA_CO",
                "contract_id": "HD-1", "document_id": "D-1",
                "doc_status": "DANG_DUNG",
            }),
            # Chốt chặn tài liệu thuộc đề xuất chưa duyệt — không dòng nào, cho qua.
            _row(None),
            _row(None),
            MagicMock(**{"scalar.return_value": "L-1"}),
            MagicMock(),
            MagicMock(),
        ]

        result = register.link_source_document(
            db, "S-1", "D-1", actor_id="USER-1"
        )

        self.assertEqual(result["id"], "L-1")
        self.assertEqual(result["slot_status"], "DA_NHAN")
        # Tìm trong toàn bộ lệnh thay vì bám chỉ số: thêm một hàng rào ở đầu hàm
        # là chỉ số lệch, mà đó không phải điều test này muốn khoá.
        moi_lenh = " ".join(str(c.args[0]) for c in db.execute.call_args_list)
        self.assertTrue(
            "insert into dossier_document_links" in moi_lenh
            or "insert into public.dossier_document_links" in moi_lenh
        )
        self.assertIn("set status = 'DA_NHAN'", moi_lenh)

    def test_khong_noi_tep_khach_vao_o_do_cong_ty_tao(self):
        from src.dossiers import register

        db = MagicMock()
        db.execute.side_effect = [_row({
            "slot_id": "S-2", "slot_name": "Đơn theo mẫu",
            "source": "CONG_TY", "slot_status": "CHUA_CO",
            "contract_id": "HD-1", "document_id": "D-1",
            "doc_status": "DANG_DUNG",
        })]

        with self.assertRaises(HTTPException) as caught:
            register.link_source_document(db, "S-2", "D-1", actor_id="USER-1")
        self.assertEqual(caught.exception.status_code, 409)

    def test_go_noi_cuoi_cung_thi_o_quay_ve_chua_co(self):
        from src.dossiers import register

        db = MagicMock()
        db.execute.side_effect = [
            _row({
                "id": "L-1", "slot_id": "S-1", "document_id": "D-1",
                "contract_id": "HD-1", "link_status": "DANG_DUNG",
            }),
            MagicMock(),
            _row({"active_links": 0, "legacy_documents": 0}),
            MagicMock(),
            MagicMock(),
        ]

        result = register.unlink_source_document(
            db, "S-1", "D-1", actor_id="USER-1"
        )

        self.assertEqual(result["slot_status"], "CHUA_CO")
        self.assertIn("link_status = 'DA_GO'", str(db.execute.call_args_list[1].args[0]))
        self.assertIn("set status = 'CHUA_CO'", str(db.execute.call_args_list[3].args[0]))

    def test_tinh_trang_k01_neo_theo_dung_hang_muc(self):
        from src.dossiers import register

        _nap_cache_schema()
        db = MagicMock()
        db.execute.side_effect = [
            _row({"service_line_id": "SL-A", "contract_id": "HD-1"}),
            _scalar(1),
            MagicMock(**{"mappings.return_value.all.return_value": [
                {"id": "S-C", "name": "CCCD", "is_required": True,
                 "active_link_count": 1, "has_superseded": False, "is_waived": False},
                {"id": "S-A", "name": "Giấy phép xây dựng", "is_required": True,
                 "active_link_count": 0, "has_superseded": False, "is_waived": False},
                {"id": "S-O", "name": "Ảnh tham khảo", "is_required": False,
                 "active_link_count": 0, "has_superseded": False, "is_waived": False},
            ]}),
            _row({"total_source_docs": 3, "unclassified": 1,
                  "linked_docs": 2, "total_links": 2}),
        ]

        status = register.k01_blockers(db, "SL-A")

        self.assertFalse(status["can_submit"])
        self.assertEqual(status["required_missing"], ["Giấy phép xây dựng"])
        self.assertEqual(status["unclassified"], 1)
        self.assertIn("Ảnh tham khảo", status["optional_missing"])
        self.assertEqual(db.execute.call_args_list[0].args[1]["service_line_id"], "SL-A")

    def test_tep_chua_phan_loai_chi_canh_bao_khong_chan_nop(self):
        from src.dossiers import register

        _nap_cache_schema()
        db = MagicMock()
        db.execute.side_effect = [
            _row({"service_line_id": "SL-B", "contract_id": "HD-1"}),
            _scalar(1),
            MagicMock(**{"mappings.return_value.all.return_value": [
                {"id": "S-1", "name": "CCCD", "is_required": True,
                 "active_link_count": 1, "has_superseded": False, "is_waived": False},
            ]}),
            _row({"total_source_docs": 2, "unclassified": 1,
                  "linked_docs": 1, "total_links": 1}),
        ]

        status = register.k01_blockers(db, "SL-B")

        self.assertTrue(status["can_submit"])
        self.assertEqual(status["unclassified"], 1)
        self.assertEqual(status["blockers"], [])

    def test_o_bat_buoc_dang_dung_ban_da_thay_the_phai_chan(self):
        from src.dossiers import register

        _nap_cache_schema()
        db = MagicMock()
        db.execute.side_effect = [
            _row({"service_line_id": "SL-C", "contract_id": "HD-1"}),
            _scalar(1),
            MagicMock(**{"mappings.return_value.all.return_value": [
                {"id": "S-1", "name": "CCCD", "is_required": True,
                 "active_link_count": 1, "has_superseded": True, "is_waived": False},
            ]}),
            _row({"total_source_docs": 1, "unclassified": 0,
                  "linked_docs": 1, "total_links": 1}),
        ]

        status = register.k01_blockers(db, "SL-C")

        self.assertFalse(status["can_submit"])
        self.assertEqual(status["superseded_in_use"][0]["slot_name"], "CCCD")

    def test_o_duoc_mien_thi_thoi_doi_nhung_van_ghi_nhan(self):
        """Ô bắt buộc, không có tệp, nhưng đã được Giám đốc duyệt miễn.

        Trước đây ca này không có lối ra: không sửa được is_required, không gỡ
        được ô sinh từ mẫu, tắt mẫu chỉ ảnh hưởng hợp đồng mới. Nhân viên buộc
        phải tải đại một tệp vào cho nộp được — sổ ghi một thứ không có thật.
        """
        from src.dossiers import register

        _nap_cache_schema()
        db = MagicMock()
        db.execute.side_effect = [
            _row({"service_line_id": "SL-M", "contract_id": "HD-1"}),
            _scalar(1),
            MagicMock(**{"mappings.return_value.all.return_value": [
                {"id": "S-1", "name": "CCCD", "is_required": True,
                 "active_link_count": 1, "has_superseded": False, "is_waived": False},
                {"id": "S-2", "name": "Giấy tờ hôn nhân", "is_required": True,
                 "active_link_count": 0, "has_superseded": False, "is_waived": True},
            ]}),
            _row({"total_source_docs": 1, "unclassified": 0,
                  "linked_docs": 1, "total_links": 1}),
        ]

        status = register.k01_blockers(db, "SL-M")

        self.assertTrue(status["can_submit"])
        self.assertNotIn("Giấy tờ hôn nhân", status["required_missing"])
        # Thôi đòi KHÔNG phải là biến mất: hồ sơ này lẽ ra cần tờ đó, phải còn
        # chỗ đọc lại được điều ấy khi bàn giao hoặc khi cơ quan hỏi.
        self.assertIn("Giấy tờ hôn nhân", status["waived"])

    def test_o_duoc_mien_thi_ban_cu_khong_con_chan(self):
        """Đã bỏ hẳn loại giấy thì chuyện nó đang trỏ vào bản cũ là vô nghĩa."""
        from src.dossiers import register

        _nap_cache_schema()
        db = MagicMock()
        db.execute.side_effect = [
            _row({"service_line_id": "SL-N", "contract_id": "HD-1"}),
            _scalar(1),
            MagicMock(**{"mappings.return_value.all.return_value": [
                {"id": "S-1", "name": "Sổ đỏ cũ", "is_required": True,
                 "active_link_count": 1, "has_superseded": True, "is_waived": True},
            ]}),
            _row({"total_source_docs": 1, "unclassified": 0,
                  "linked_docs": 1, "total_links": 1}),
        ]

        status = register.k01_blockers(db, "SL-N")

        self.assertTrue(status["can_submit"])
        self.assertEqual(status["required_superseded"], [])


class GopPhamViApDungTests(unittest.TestCase):
    """Gộp applicability theo độ ưu tiên TASK_TYPE > PACKAGE > GLOBAL.

    Sai ở đây là hỏng âm thầm: Giám đốc tắt một loại giấy cho gói Pháp Lý, hệ
    thống vẫn tự tick vì phạm vi GLOBAL đang bật — quyết định vừa đưa ra bị phủ
    quyết mà không ai thấy.
    """

    @staticmethod
    def _dong(template_id, pham_vi, is_default, ten="Giấy A", node_code=None):
        return {
            "id": template_id, "name": ten, "source": "KHACH_HANG",
            "is_required": True, "needs_original": False, "default_quantity": 1,
            "sort_order": 1, "note": None,
            "applicability_type": pham_vi, "is_default": is_default,
            # Trục thứ tư. Mặc định None = chưa gán bước nào, đúng trạng thái của
            # mọi mẫu trước khi Giám đốc cấu hình.
            "node_code": node_code,
        }

    def _chay(self, dong):
        from src.dossiers import register

        db = MagicMock()
        db.execute.return_value.mappings.return_value = dong
        return register.applicable_templates(db, "SL-1")

    def test_pham_vi_cu_the_hon_thang_ke_ca_khi_no_tat(self):
        ket_qua = self._chay([
            self._dong("T1", "GLOBAL", True),
            self._dong("T1", "PACKAGE", False),
        ])
        self.assertEqual(len(ket_qua), 1)
        self.assertFalse(ket_qua[0]["is_default"])
        self.assertEqual(ket_qua[0]["applicability_type"], "PACKAGE")

    def test_task_type_thang_global_ke_ca_khi_global_tat(self):
        ket_qua = self._chay([
            self._dong("T1", "GLOBAL", False),
            self._dong("T1", "TASK_TYPE", True),
        ])
        self.assertEqual(len(ket_qua), 1)
        self.assertTrue(ket_qua[0]["is_default"])
        self.assertEqual(ket_qua[0]["applicability_type"], "TASK_TYPE")

    def test_thuoc_ca_ba_pham_vi_van_chi_ra_mot_dong(self):
        ket_qua = self._chay([
            self._dong("T1", "GLOBAL", True),
            self._dong("T1", "PACKAGE", True),
            self._dong("T1", "TASK_TYPE", False),
        ])
        self.assertEqual(len(ket_qua), 1)
        self.assertEqual(ket_qua[0]["applicability_type"], "TASK_TYPE")
        self.assertFalse(ket_qua[0]["is_default"])

    def test_khong_co_pham_vi_nao_khop_thi_khong_goi_y(self):
        """Im lặng chứ không rơi về 'cho hết' — cho hết chính là bệnh đang chữa."""
        self.assertEqual(self._chay([]), [])

    def test_thu_tu_khong_doi_ket_qua(self):
        xuoi = self._chay([self._dong("T1", "GLOBAL", True), self._dong("T1", "TASK_TYPE", False)])
        nguoc = self._chay([self._dong("T1", "TASK_TYPE", False), self._dong("T1", "GLOBAL", True)])
        self.assertEqual(xuoi[0]["is_default"], nguoc[0]["is_default"])
        self.assertFalse(nguoc[0]["is_default"])


class PhienBanSoGiayToTests(unittest.TestCase):
    """Hạng mục v2 không được trộn ô cấp Hợp đồng vào bộ của mình.

    Trộn là đếm trùng CCCD/Sổ đỏ — ô cấp Hợp đồng và ô đã materialize cho Hạng
    mục cùng trỏ về một loại giấy.
    """

    def _goi(self, version):
        from src.dossiers import register
        _nap_cache_schema()

        _nap_cache_schema()
        db = MagicMock()
        db.execute.side_effect = [
            _row({"service_line_id": "SL-1", "contract_id": "HD-1"}),
            _scalar(version),
            MagicMock(**{"mappings.return_value.all.return_value": []}),
            _row({"total_source_docs": 0, "unclassified": 0, "linked_docs": 0, "total_links": 0}),
        ]
        register.k01_blockers(db, "SL-1")
        # Truy vấn ô giấy là lần execute thứ ba; tham số của nó phải mang version.
        return db.execute.call_args_list[2].args[1]

    def test_version_duoc_truyen_vao_truy_van_o_giay(self):
        self.assertEqual(self._goi(1)["register_version"], 1)
        self.assertEqual(self._goi(2)["register_version"], 2)

    def test_khong_suy_version_tu_viec_co_slot_hay_khong(self):
        """Hạng mục chọn 0 loại giấy vẫn là v2 hợp lệ — 'chưa có slot' không phải
        dấu hiệu của mô hình cũ."""
        from src.dossiers import register

        _nap_cache_schema()
        db = MagicMock()
        db.execute.side_effect = [
            _row({"service_line_id": "SL-0", "contract_id": "HD-1"}),
            _scalar(2),
            MagicMock(**{"mappings.return_value.all.return_value": []}),
            _row({"total_source_docs": 0, "unclassified": 0, "linked_docs": 0, "total_links": 0}),
        ]
        trang_thai = register.k01_blockers(db, "SL-0")
        self.assertTrue(trang_thai["can_submit"])
        self.assertEqual(db.execute.call_args_list[2].args[1]["register_version"], 2)


class TrucNodeTrongPhamViTests(unittest.TestCase):
    """Trục thứ tư: loại giấy này thuộc BƯỚC nào.

    Trước đây trục Node chỉ nằm trong graph quy trình của từng Hạng mục — cấu
    hình runtime, phải tick lại cho mỗi hợp đồng. Nay nó là Master Data, khai
    một lần dùng chung.
    """

    @staticmethod
    def _dong(template_id, pham_vi, node_code, ten="Giấy A"):
        return GopPhamViApDungTests._dong(
            template_id, pham_vi, True, ten=ten, node_code=node_code)

    def _chay(self, dong):
        from src.dossiers import register

        db = MagicMock()
        db.execute.return_value.mappings.return_value = dong
        return register.applicable_templates(db, "SL-1")

    def test_tra_ve_dung_buoc_da_khai(self):
        ket = self._chay([self._dong("T-1", "TASK_TYPE", "K01")])
        self.assertEqual(ket[0]["node_code"], "K01")

    def test_chua_gan_buoc_thi_node_code_la_None(self):
        """None phải đi tới nơi, không được biến thành chuỗi rỗng hay bịa ra K01
        — giao diện đọc chính giá trị này để dán nhãn 'chưa phân bước'."""
        ket = self._chay([self._dong("T-1", "GLOBAL", None)])
        self.assertIsNone(ket[0]["node_code"])

    def test_pham_vi_cu_the_hon_quyet_dinh_luon_ca_buoc(self):
        """Cùng một mẫu khai hai phạm vi trỏ hai bước khác nhau thì phạm vi hẹp
        hơn thắng — kể cả về bước. Lấy nhầm bước của phạm vi rộng là giấy hiện ở
        sai bước, nhân viên bước đó không hiểu vì sao mình phải thu."""
        ket = self._chay([
            self._dong("T-1", "GLOBAL", "K01"),
            self._dong("T-1", "TASK_TYPE", "K03"),
        ])
        self.assertEqual(len(ket), 1)
        self.assertEqual(ket[0]["node_code"], "K03")

    def test_gom_theo_buoc_giu_ca_nhom_chua_gan(self):
        from src.dossiers import register

        db = MagicMock()
        db.execute.return_value.mappings.return_value = [
            self._dong("T-1", "TASK_TYPE", "K01", ten="CCCD"),
            self._dong("T-2", "TASK_TYPE", "K03", ten="Bản vẽ"),
            self._dong("T-3", "GLOBAL", None, ten="Giấy lạ"),
        ]
        by_node = register.templates_by_node(db, "SL-1")

        self.assertEqual([m["name"] for m in by_node["K01"]], ["CCCD"])
        self.assertEqual([m["name"] for m in by_node["K03"]], ["Bản vẽ"])
        # Nhóm chưa gán bước PHẢI lộ ra, không được bỏ đi — đó là khối lượng
        # tồn đọng Giám đốc còn phải cấu hình.
        self.assertEqual([m["name"] for m in by_node[None]], ["Giấy lạ"])


class TachNodeK05Tests(unittest.TestCase):
    """K05 tách làm hai: K05a nộp nội nghiệp (Đo vẽ), K05b nộp một cửa (Pháp lý).

    Gộp làm một thì không khai được "phiếu nộp nội nghiệp thuộc K05a" còn "biên
    nhận một cửa thuộc K05b" — đúng thứ mô hình bốn trục cần phân biệt.

    K05 nay đã xoá hẳn khỏi danh mục: không còn dữ liệu và không còn quy trình
    mẫu nào tham chiếu tới nó.
    """

    def test_hai_buoc_ve_hai_phong_khac_nhau(self):
        from src.contracts.workflow_runtime import TASK_POOL_DEPARTMENTS_BY_NODE_CODE as PHONG

        # Nhầm vế này là việc rơi vào hàng chờ của phòng không làm nó: hồ sơ nằm
        # im tới khi có người để ý, và không ai được báo là mình thiếu việc.
        self.assertEqual(PHONG["K05a"], ("SURVEY",))
        self.assertEqual(PHONG["K05b"], ("LEGAL",))

    def test_khong_con_dau_vet_K05_trong_bat_ky_map_nao(self):
        from src.contracts.workflow_runtime import (
            TASK_POOL_DEPARTMENTS_BY_NODE_CODE as PHONG,
            TASK_POOL_ROLES_BY_NODE_CODE as VAI_TRO,
            NODES_SUBMITTED_TO_AGENCY,
        )
        from src.files.references import STAGE_BY_NODE_CODE
        from src.dossiers.slot_requests import _DEFAULT_SOURCE_BY_NODE

        # K05 đã xoá khỏi danh mục workflow_nodes, và không còn quy trình mẫu nào
        # sinh ra nó. Để sót khoá "K05" trong map là để lại nhánh không bao giờ
        # chạy — nửa năm sau đọc lại sẽ tưởng K05 vẫn dùng được.
        for ten, ban_do in (("phòng ban", PHONG), ("vai trò", VAI_TRO),
                            ("giai đoạn", STAGE_BY_NODE_CODE),
                            ("nguồn giấy", _DEFAULT_SOURCE_BY_NODE)):
            self.assertNotIn("K05", ban_do, ten)
        self.assertNotIn("K05", NODES_SUBMITTED_TO_AGENCY)

    def test_chi_K05b_la_buoc_ra_co_quan(self):
        from src.contracts.workflow_runtime import NODES_SUBMITTED_TO_AGENCY

        # K05a nộp nội nghiệp TRONG công ty. Xếp nó vào nhóm "ra cơ quan" sẽ bật
        # nhầm luồng theo dõi biên nhận / giấy hẹn cho một bước không có biên nhận.
        self.assertIn("K05b", NODES_SUBMITTED_TO_AGENCY)
        self.assertNotIn("K05a", NODES_SUBMITTED_TO_AGENCY)

    def test_giai_doan_luu_tru_tach_rieng(self):
        from src.files.references import DOSSIER_STAGES, STAGE_BY_NODE_CODE

        self.assertEqual(STAGE_BY_NODE_CODE["K05a"], "nop-noi-nghiep")
        self.assertEqual(STAGE_BY_NODE_CODE["K05b"], "nop-co-quan")
        self.assertIn("nop-noi-nghiep", DOSSIER_STAGES)

    def test_nguon_giay_mac_dinh_khac_nhau(self):
        from src.dossiers.slot_requests import _DEFAULT_SOURCE_BY_NODE

        # K05a chưa ra khỏi công ty nên giấy nó sinh là CÔNG TY soạn; K05b nộp
        # một cửa nên giấy nhận về là của CƠ QUAN. Gán nhầm là tờ giấy hiện sai
        # ngăn trong tủ hồ sơ.
        self.assertEqual(_DEFAULT_SOURCE_BY_NODE["K05a"], "CONG_TY")
        self.assertEqual(_DEFAULT_SOURCE_BY_NODE["K05b"], "CO_QUAN")

    def test_ke_thua_minh_chung_theo_dung_buoc_truoc(self):
        from src.contracts.workflow_runtime import EVIDENCE_INHERITED_FROM_NODE as KE_THUA

        # K05a nộp bản kỹ thuật nên kế thừa từ K03; K05b nộp bộ hồ sơ đã soạn nên
        # kế thừa từ K04. Đảo hai vế là nhân viên mở ra thấy tệp của bước khác và
        # tưởng mình nộp nhầm.
        self.assertEqual(KE_THUA["K05A"], "K03")
        self.assertEqual(KE_THUA["K05B"], "K04")
        self.assertNotIn("K05", KE_THUA)


class GhiTungBanGhiGanTests(unittest.TestCase):
    """Sửa một bản ghi gán không được chạm bản ghi nào khác.

    Cây phân cấp là Gói → Hạng mục → Nhóm → Node → Loại giấy, mỗi nhánh một bản
    ghi độc lập. "Biên nhận ở Tách thửa" và "Biên nhận ở Cấp đổi sổ" là hai dòng
    riêng; sửa bước của cái này mà xoá cái kia là mất cấu hình im lặng.
    """

    def setUp(self):
        from src.dossiers import register

        self.register = register
        self.db = MagicMock()

    def _co_dong(self, **ghi_de):
        """db.execute trả về một bản ghi gán có thật, và danh mục node đang bật."""
        dong = {
            "id": "APP-1", "applicability_type": "TASK_TYPE",
            "service_package_id": None, "task_type_id": "tt_006", "node_code": "K01",
        }
        dong.update(ghi_de)

        def dispatch(cau_lenh, tham_so=None):
            sql = str(cau_lenh)
            ket = MagicMock()
            if "from public.workflow_nodes" in sql:
                ket.all.return_value = [("K01",), ("K03",), ("K05a",), ("K05b",)]
            elif "document_template_applicabilities" in sql:
                ket.mappings.return_value.first.return_value = dong
            return ket

        self.db.execute.side_effect = dispatch
        return dong

    def test_update_chi_cham_dung_mot_dong(self):
        self._co_dong()
        self.register.update_applicability(self.db, "T-1", "APP-1", node_code="K03")

        cac_lenh = [str(g.args[0]) for g in self.db.execute.call_args_list]
        cap_nhat = [s for s in cac_lenh if s.lstrip().startswith("update")]
        self.assertEqual(len(cap_nhat), 1)
        # Điều kiện phải là id của đúng dòng đó. Thiếu vế này là cập nhật cả mẫu.
        self.assertIn("where id = :id", cap_nhat[0])
        # Và tuyệt đối không được có lệnh xoá nào — đó là cách replace_ cũ làm.
        self.assertEqual([s for s in cac_lenh if s.lstrip().startswith("delete")], [])

    def test_update_khong_doi_pham_vi(self):
        """Phạm vi không sửa qua đường này: đổi phạm vi là chuyển sang nhánh khác,
        mà nhánh đích có thể đã có bản ghi của chính loại giấy này."""
        self._co_dong()
        self.register.update_applicability(self.db, "T-1", "APP-1", node_code="K03")

        cap_nhat = next(str(g.args[0]) for g in self.db.execute.call_args_list
                        if str(g.args[0]).lstrip().startswith("update"))
        self.assertNotIn("task_type_id", cap_nhat)
        self.assertNotIn("service_package_id", cap_nhat)
        self.assertNotIn("applicability_type", cap_nhat)

    def test_update_bat_node_khong_co_trong_danh_muc(self):
        self._co_dong()
        with self.assertRaises(HTTPException) as loi:
            self.register.update_applicability(self.db, "T-1", "APP-1", node_code="K99")
        self.assertEqual(loi.exception.status_code, 422)

    def test_update_cho_phep_go_bo_buoc_ve_null(self):
        """Bỏ trống bước là hợp lệ — nghĩa là chưa gán. Chặn ở đây thì không có
        đường gỡ một bước gán nhầm."""
        self._co_dong()
        ket = self.register.update_applicability(self.db, "T-1", "APP-1", node_code="")
        self.assertIsNone(ket["node_code"])

    def test_update_ban_ghi_khong_ton_tai_thi_404(self):
        def dispatch(cau_lenh, tham_so=None):
            ket = MagicMock()
            ket.mappings.return_value.first.return_value = None
            ket.all.return_value = []
            return ket

        self.db.execute.side_effect = dispatch
        with self.assertRaises(HTTPException) as loi:
            self.register.update_applicability(self.db, "T-1", "KHONG-CO", node_code="K03")
        self.assertEqual(loi.exception.status_code, 404)

    def test_remove_gioi_han_theo_ca_template_lan_dong(self):
        """Điều kiện xoá phải có cả template_id: chỉ khớp id thì một id đoán trúng
        là gỡ được bản ghi của loại giấy bất kỳ."""
        self._co_dong()
        self.register.remove_applicability(self.db, "T-1", "APP-1")

        xoa = next(str(g.args[0]) for g in self.db.execute.call_args_list
                   if str(g.args[0]).lstrip().startswith("delete"))
        self.assertIn("where id = :id and template_id = :t", xoa)
        # Không đụng chính loại giấy — nó vẫn áp dụng ở nhánh khác.
        self.assertNotIn("document_checklist_templates", xoa)


class MotPhamViMotBuocTests(unittest.TestCase):
    """Ba unique index của bảng khoá theo (template, phạm vi) và không tính node.

    Nghiệp vụ đã chốt đúng như vậy: một tờ giấy chỉ nộp ở bước sinh ra nó, các
    bước sau kế thừa từ Tủ hồ sơ chứ không bắt nộp lại.
    """

    def _chay(self, scopes):
        from src.dossiers import register

        db = MagicMock()

        def dispatch(cau_lenh, tham_so=None):
            sql = str(cau_lenh)
            ket = MagicMock()
            if "from public.workflow_nodes" in sql:
                ket.all.return_value = [("K01",), ("K03",)]
            else:
                ket.first.return_value = (1,)
            return ket

        db.execute.side_effect = dispatch
        return register.replace_applicabilities(db, "T-1", scopes, actor_id="U-1")

    def test_hai_buoc_cung_mot_hang_muc_bi_chan_bang_422(self):
        # Để lọt xuống DB thì unique index ném IntegrityError trần, người dùng
        # thấy 500 không hiểu vì sao.
        with self.assertRaises(HTTPException) as loi:
            self._chay([
                {"applicability_type": "TASK_TYPE", "task_type_id": "tt_006", "node_code": "K01"},
                {"applicability_type": "TASK_TYPE", "task_type_id": "tt_006", "node_code": "K03"},
            ])
        self.assertEqual(loi.exception.status_code, 422)
        self.assertIn("một bước", loi.exception.detail)

    def test_hai_hang_muc_khac_nhau_thi_qua(self):
        so_dong = self._chay([
            {"applicability_type": "TASK_TYPE", "task_type_id": "tt_006", "node_code": "K01"},
            {"applicability_type": "TASK_TYPE", "task_type_id": "tt_002", "node_code": "K03"},
        ])
        self.assertEqual(so_dong, 2)

    def test_moi_goi_va_hang_muc_song_song_duoc(self):
        """GLOBAL và TASK_TYPE là hai hình dạng khác nhau nên không đụng index nhau."""
        so_dong = self._chay([
            {"applicability_type": "GLOBAL", "node_code": None},
            {"applicability_type": "TASK_TYPE", "task_type_id": "tt_006", "node_code": "K01"},
        ])
        self.assertEqual(so_dong, 2)


class TraMaBuocCoChuThuongTests(unittest.TestCase):
    """Mã bước K05a/K05b có CHỮ THƯỜNG — mọi hàm tra phải chịu được điều đó.

    Đây là lỗ hổng đã lọt một lần: các hàm tra đều gọi `.upper()` trên mã rồi đối
    chiếu khoá gốc, nên "K05a" thành "K05A" và trượt khỏi mọi bảng. Không nổ,
    chỉ im lặng trả về mặc định — bước không có phòng ban, không có vai trò, nên
    không hiện trong Bể việc của ai và hồ sơ nằm im.

    Test cũ tra THẲNG vào dict (`PHONG["K05a"]`) nên vẫn xanh trong khi runtime
    hỏng. Nhóm test này cố ý đi qua đúng các hàm mà mã sản phẩm gọi.
    """

    def test_phong_ban_tra_duoc_cho_ca_hai_buoc_nop(self):
        from src.contracts.workflow_runtime import task_pool_department_code

        self.assertEqual(task_pool_department_code("K05a"), "SURVEY")
        self.assertEqual(task_pool_department_code("K05b"), "LEGAL")

    def test_vai_tro_tra_duoc_cho_ca_hai_buoc_nop(self):
        from src.contracts.workflow_runtime import task_pool_roles

        self.assertEqual(task_pool_roles("K05a"), ("SUBMITTER",))
        self.assertEqual(task_pool_roles("K05b"), ("SUBMITTER",))

    def test_giai_doan_luu_tru_tra_duoc(self):
        from src.dossiers.documents import stage_for_node_code

        self.assertEqual(stage_for_node_code("K05a"), "nop-noi-nghiep")
        self.assertEqual(stage_for_node_code("K05b"), "nop-co-quan")

    def test_tra_duoc_du_go_hoa_hay_thuong(self):
        """Graph do Giám đốc vẽ có thể lưu mã ở dạng nào cũng được."""
        from src.contracts.workflow_runtime import task_pool_department_code
        from src.dossiers.documents import stage_for_node_code

        for viet in ("K05A", "k05a", " K05a "):
            self.assertEqual(task_pool_department_code(viet), "SURVEY", viet)
        for viet in ("K05B", "k05b", " K05b "):
            self.assertEqual(stage_for_node_code(viet), "nop-co-quan", viet)

    def test_ma_da_xoa_va_ma_la_deu_rot_ve_mac_dinh_an_toan(self):
        from src.contracts.workflow_runtime import task_pool_department_code, task_pool_roles
        from src.dossiers.documents import stage_for_node_code

        for ma in ("K05", "K99", "", None):
            self.assertIsNone(task_pool_department_code(ma), ma)
            self.assertEqual(task_pool_roles(ma), (), ma)
            self.assertIsNone(stage_for_node_code(ma), ma)


class NhanBuocTheoMasterDataTests(unittest.TestCase):
    """Tủ hồ sơ dán nhãn bước từ MASTER DATA, không từ graph quy trình.

    `phan_bo_loai_giay_theo_buoc` đọc graph đang chạy nên trước khi Giám đốc vẽ
    xong quy trình thì mọi dòng giấy đều trống nhãn — đúng cái làm người dùng
    tưởng cấu hình bị mất. `planned_node_by_template` đọc cấu hình bốn trục nên
    có nhãn ngay từ lúc tạo hợp đồng.
    """

    @staticmethod
    def _db(rows):
        db = MagicMock()
        db.execute.return_value.mappings.return_value = rows
        return db

    @staticmethod
    def _row(template_id, node_code, scope='TASK_TYPE', name='Giấy'):
        return {
            "id": template_id, "name": name, "source": "KHACH_HANG",
            "is_required": True, "needs_original": False, "default_quantity": 1,
            "sort_order": 1, "note": None,
            "applicability_type": scope, "is_default": True, "node_code": node_code,
        }

    def test_tra_ve_ma_buoc_theo_tung_loai_giay(self):
        from src.dossiers import register

        ket = register.planned_node_by_template(
            self._db([self._row("T-1", "K01"), self._row("T-2", "K03")]), "SL-1")
        self.assertEqual(ket, {"T-1": "K01", "T-2": "K03"})

    def test_loai_giay_chua_gan_buoc_khong_co_trong_ket_qua(self):
        """Vắng mặt chính là tín hiệu 'chưa gán bước'. Trả về None sẽ khiến giao
        diện in ra chữ 'None' thay vì nhãn cảnh báo."""
        from src.dossiers import register

        ket = register.planned_node_by_template(
            self._db([self._row("T-1", "K01"), self._row("T-2", None)]), "SL-1")
        self.assertEqual(ket, {"T-1": "K01"})
        self.assertNotIn("T-2", ket)

    def test_dung_chung_phep_uu_tien_pham_vi_voi_applicable_templates(self):
        """Cùng một mẫu khai hai phạm vi thì phạm vi HẸP hơn quyết định bước.

        Nếu hàm này tự truy vấn riêng thay vì dùng lại applicable_templates, hai
        nơi sẽ trả lời khác nhau về cùng một tờ giấy.
        """
        from src.dossiers import register

        ket = register.planned_node_by_template(self._db([
            self._row("T-1", "K07", scope="GLOBAL"),
            self._row("T-1", "K01", scope="TASK_TYPE"),
        ]), "SL-1")
        self.assertEqual(ket, {"T-1": "K01"})

    def test_khong_co_mau_nao_thi_tra_dict_rong(self):
        from src.dossiers import register

        self.assertEqual(register.planned_node_by_template(self._db([]), "SL-1"), {})
