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
            key, "contracts/001_BK-2026/dossier-documents/7f3a9c21/don-09dk.pdf"
        )

    def test_van_nam_duoi_prefix_contracts_de_chay_duoc_tren_r2(self):
        """Production gộp mọi thứ vào MỘT bucket private, chỉ tách bằng prefix."""
        from src.services.storage_service import GENERIC_OBJECT_PREFIXES, _require_prefix

        key = DossierFileReference.build(
            contract_id="002/BK-2026", document_id="sl-2",
            filename="bien-nhan.jpg",
        ).object_key
        self.assertEqual(_require_prefix(key, GENERIC_OBJECT_PREFIXES), key)

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
        self.assertEqual(documents.stage_for_node_code("K05"), "nop-co-quan")
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
            "contracts/001_BK-2026/source-documents/7f3a9c21b4d54e0f/scan.pdf",
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
        self.assertIn('chan.get("required_missing"', bao_cao)
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
        self.assertIn("insert into public.dossier_document_links", moi_lenh)
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
    def _dong(template_id, pham_vi, is_default, ten="Giấy A"):
        return {
            "id": template_id, "name": ten, "source": "KHACH_HANG",
            "is_required": True, "needs_original": False, "default_quantity": 1,
            "sort_order": 1, "note": None,
            "applicability_type": pham_vi, "is_default": is_default,
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
