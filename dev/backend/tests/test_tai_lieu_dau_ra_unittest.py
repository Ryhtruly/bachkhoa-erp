from pathlib import Path
ROOT_SRC = Path(__file__).resolve().parents[1] / 'src'
from pathlib import Path
"""Tài liệu đầu ra theo Checklist.

Hai luật xuyên suốt bộ test này:

1. Tệp chỉ lưu MỘT lần. Checklist, ô giấy và Hạng mục chỉ tạo quan hệ trỏ tới nó.
2. Checklist KHÔNG khai ``output_documents`` phải đi qua đúng đường cũ — không
   sinh field mới trong graph, không sinh dossier_documents, không thêm cổng chặn.
"""

import unittest
from unittest.mock import MagicMock, patch

from src.contracts.workflow_runtime import (
    WorkflowValidationError,
    _normalize_output_documents,
)


def _rows(value):
    result = MagicMock()
    result.mappings.return_value.all.return_value = value
    return result


def _first(value):
    result = MagicMock()
    result.first.return_value = value
    return result


def _scalar(value):
    result = MagicMock()
    result.scalar.return_value = value
    return result


def _row(value):
    result = MagicMock()
    result.mappings.return_value.first.return_value = value
    return result


def _scalar_one(value):
    result = MagicMock()
    result.scalar_one.return_value = value
    return result


ACTIVE_TEMPLATES = {"TPL_BAN_KY_THUAT_GOC", "TPL_ANH_HIEN_TRANG", "TPL_BAN_VE_CHUAN_HOA"}


def _chuan_hoa(raw, templates=ACTIVE_TEMPLATES, approver_role="admin"):
    return _normalize_output_documents(
        raw, node_key="k02", checklist_name="Bản kỹ thuật gốc",
        approver_role=approver_role,
        active_templates_loader=lambda: templates,
    )


class KhongKhaiThiKhongDoiGiTests(unittest.TestCase):
    """Quy trình cũ phải chạy y hệt hôm nay — đây là điều kiện chặn của HIGH risk."""

    def test_khong_co_khoa_output_documents_thi_tra_none(self):
        self.assertIsNone(_chuan_hoa({"key": "a", "name": "A"}))

    def test_khai_danh_sach_rong_cung_tra_none(self):
        """Rỗng nghĩa là không đòi gì — không được biến thành cấu hình rỗng lơ lửng."""
        self.assertIsNone(_chuan_hoa({"key": "a", "name": "A", "output_documents": []}))

    def test_khai_null_cung_tra_none(self):
        self.assertIsNone(_chuan_hoa({"key": "a", "name": "A", "output_documents": None}))


class ChuanHoaCauHinhTests(unittest.TestCase):
    def test_dien_du_mac_dinh(self):
        ket_qua = _chuan_hoa({"output_documents": [{"template_id": "TPL_BAN_KY_THUAT_GOC"}]})
        self.assertEqual(ket_qua, [{
            "template_id": "TPL_BAN_KY_THUAT_GOC",
            "min_count": 1,
            "required_before_submit": True,
            "needs_director_approval": False,
        }])

    def test_giu_nguyen_gia_tri_da_khai(self):
        ket_qua = _chuan_hoa({"output_documents": [{
            "template_id": "TPL_ANH_HIEN_TRANG", "min_count": 4,
            "required_before_submit": False, "needs_director_approval": True,
        }]})
        self.assertEqual(ket_qua[0]["min_count"], 4)
        self.assertFalse(ket_qua[0]["required_before_submit"])
        self.assertTrue(ket_qua[0]["needs_director_approval"])

    def test_nhieu_loai_tai_lieu_trong_mot_checklist(self):
        ket_qua = _chuan_hoa({"output_documents": [
            {"template_id": "TPL_ANH_HIEN_TRANG", "min_count": 4},
            {"template_id": "TPL_BAN_KY_THUAT_GOC"},
        ]})
        self.assertEqual([r["template_id"] for r in ket_qua],
                         ["TPL_ANH_HIEN_TRANG", "TPL_BAN_KY_THUAT_GOC"])


class TuChoiCauHinhSaiTests(unittest.TestCase):
    """Sai thì báo 422 rõ ràng, không âm thầm bỏ qua."""

    def _phai_loi(self, raw, chua_chuoi):
        with self.assertRaises(WorkflowValidationError) as caught:
            _chuan_hoa(raw)
        self.assertIn(chua_chuoi, str(caught.exception))

    def test_template_khong_ton_tai(self):
        self._phai_loi({"output_documents": [{"template_id": "TPL_KHONG_CO"}]},
                       "không tồn tại")

    def test_thieu_template_id(self):
        self._phai_loi({"output_documents": [{"min_count": 1}]}, "chưa chọn loại tài liệu")

    def test_min_count_bang_khong(self):
        self._phai_loi({"output_documents": [
            {"template_id": "TPL_BAN_KY_THUAT_GOC", "min_count": 0}]}, "từ 1 trở lên")

    def test_min_count_la_boolean_thi_khong_tinh_la_so(self):
        """True == 1 trong Python. Không chặn thì cấu hình rác lọt vào graph."""
        self._phai_loi({"output_documents": [
            {"template_id": "TPL_BAN_KY_THUAT_GOC", "min_count": True}]}, "từ 1 trở lên")

    def test_boolean_sai_kieu(self):
        self._phai_loi({"output_documents": [
            {"template_id": "TPL_BAN_KY_THUAT_GOC", "required_before_submit": "co"}]},
            "phải là true hoặc false")

    def test_trung_template_id_trong_cung_checklist(self):
        self._phai_loi({"output_documents": [
            {"template_id": "TPL_BAN_KY_THUAT_GOC"},
            {"template_id": "TPL_BAN_KY_THUAT_GOC", "min_count": 2}]}, "chỉ được khai một lần")

    def test_field_la_bi_tu_choi_chu_khong_bi_bo_qua(self):
        self._phai_loi({"output_documents": [
            {"template_id": "TPL_BAN_KY_THUAT_GOC", "auto_approve": True}]},
            "auto_approve")

    def test_khong_phai_danh_sach(self):
        self._phai_loi({"output_documents": {"template_id": "TPL_BAN_KY_THUAT_GOC"}},
                       "phải là danh sách")


class PhanGiaiTemplateSangSlotTests(unittest.TestCase):
    """Graph chỉ giữ template_id; slot thật phân giải lúc chạy."""

    def test_uu_tien_slot_cua_dung_hang_muc(self):
        from src.dossiers.documents import resolve_output_slot

        db = MagicMock()
        db.execute.side_effect = [_rows([
            {"id": "S-SL", "scope": "SERVICE_LINE", "name": "Bản kỹ thuật gốc"},
            {"id": "S-HD", "scope": "CONTRACT", "name": "Bản kỹ thuật gốc"},
        ])]
        slot = resolve_output_slot(
            db, template_id="TPL_BAN_KY_THUAT_GOC",
            service_line_id="SL-A", contract_id="003/BK-2026",
        )
        self.assertEqual(slot["id"], "S-SL")

    def test_khong_co_slot_hang_muc_thi_dung_slot_hop_dong(self):
        from src.dossiers.documents import resolve_output_slot

        db = MagicMock()
        db.execute.side_effect = [_rows([
            {"id": "S-HD", "scope": "CONTRACT", "name": "CCCD"},
        ])]
        slot = resolve_output_slot(
            db, template_id="TPL_X", service_line_id="SL-A", contract_id="003/BK-2026",
        )
        self.assertEqual(slot["id"], "S-HD")

    def test_khong_tim_thay_thi_bao_loi_cau_hinh(self):
        from fastapi import HTTPException

        from src.dossiers.documents import resolve_output_slot

        db = MagicMock()
        db.execute.side_effect = [_rows([])]
        with self.assertRaises(HTTPException) as caught:
            resolve_output_slot(db, template_id="TPL_X",
                                service_line_id="SL-A", contract_id="003/BK-2026")
        self.assertEqual(caught.exception.status_code, 409)
        self.assertIn("chưa có ô giấy", str(caught.exception.detail))

    def test_hai_slot_cung_muc_uu_tien_thi_bao_loi_khong_chon_bua(self):
        """LIMIT 1 ở đây là chọn ngẫu nhiên một trong hai — sai âm thầm."""
        from fastapi import HTTPException

        from src.dossiers.documents import resolve_output_slot

        db = MagicMock()
        db.execute.side_effect = [_rows([
            {"id": "S-1", "scope": "SERVICE_LINE", "name": "Bản kỹ thuật gốc"},
            {"id": "S-2", "scope": "SERVICE_LINE", "name": "Bản kỹ thuật gốc"},
        ])]
        with self.assertRaises(HTTPException) as caught:
            resolve_output_slot(db, template_id="TPL_BAN_KY_THUAT_GOC",
                                service_line_id="SL-A", contract_id="003/BK-2026")
        self.assertEqual(caught.exception.status_code, 409)
        self.assertIn("2 ô giấy", str(caught.exception.detail))


class CongNopChecklistTests(unittest.TestCase):
    """required_before_submit — chặn NHÂN VIÊN nộp khi thiếu tài liệu."""

    def test_checklist_thuong_khong_bi_dong_cua_nao(self):
        from src.dossiers.documents import checklist_output_blockers

        db = MagicMock()
        db.execute.side_effect = [_row({"output_documents": None})]
        self.assertEqual(checklist_output_blockers(db, "CR-1"), [])
        # Không khai thì không truy vấn thêm gì nữa.
        self.assertEqual(db.execute.call_count, 1)

    def test_thieu_tai_lieu_bat_buoc_thi_chan(self):
        from src.dossiers.documents import checklist_output_blockers

        db = MagicMock()
        db.execute.side_effect = [
            _row({"output_documents": [
                {"template_id": "TPL_BAN_KY_THUAT_GOC", "min_count": 1,
                 "required_before_submit": True, "needs_director_approval": False}],
                "service_line_id": "SL-A", "contract_id": "003/BK-2026"}),
            _rows([{"template_id": "TPL_BAN_KY_THUAT_GOC", "so_ban": 0,
                    "slot_name": "Bản kỹ thuật gốc"}]),
        ]
        thieu = checklist_output_blockers(db, "CR-1")
        self.assertEqual(len(thieu), 1)
        self.assertIn("Bản kỹ thuật gốc", thieu[0])

    def test_du_tai_lieu_thi_qua(self):
        from src.dossiers.documents import checklist_output_blockers

        db = MagicMock()
        db.execute.side_effect = [
            _row({"output_documents": [
                {"template_id": "TPL_BAN_KY_THUAT_GOC", "min_count": 1,
                 "required_before_submit": True, "needs_director_approval": False}],
                "service_line_id": "SL-A", "contract_id": "003/BK-2026"}),
            _rows([{"template_id": "TPL_BAN_KY_THUAT_GOC", "so_ban": 1,
                    "slot_name": "Bản kỹ thuật gốc"}]),
        ]
        self.assertEqual(checklist_output_blockers(db, "CR-1"), [])

    def test_can_giam_doc_duyet_KHONG_chan_nhan_vien_nop(self):
        """Đây là ranh giới dễ làm sai nhất: duyệt là việc của cổng ĐÓNG NODE."""
        from src.dossiers.documents import checklist_output_blockers

        db = MagicMock()
        db.execute.side_effect = [
            _row({"output_documents": [
                {"template_id": "TPL_BAN_KY_THUAT_GOC", "min_count": 1,
                 "required_before_submit": True, "needs_director_approval": True}],
                "service_line_id": "SL-A", "contract_id": "003/BK-2026"}),
            _rows([{"template_id": "TPL_BAN_KY_THUAT_GOC", "so_ban": 1,
                    "slot_name": "Bản kỹ thuật gốc"}]),
        ]
        self.assertEqual(checklist_output_blockers(db, "CR-1"), [])

    def test_required_before_submit_false_thi_khong_chan_du_thieu(self):
        from src.dossiers.documents import checklist_output_blockers

        db = MagicMock()
        db.execute.side_effect = [
            _row({"output_documents": [
                {"template_id": "TPL_ANH_HIEN_TRANG", "min_count": 4,
                 "required_before_submit": False, "needs_director_approval": False}],
                "service_line_id": "SL-A", "contract_id": "003/BK-2026"}),
            _rows([{"template_id": "TPL_ANH_HIEN_TRANG", "so_ban": 0,
                    "slot_name": "Ảnh hiện trạng"}]),
        ]
        self.assertEqual(checklist_output_blockers(db, "CR-1"), [])


class CongDongNodeTests(unittest.TestCase):
    """needs_director_approval và tính CÒN HỢP LỆ của tài liệu lúc đóng Node."""

    def _chan(self, output_documents, dang_co):
        from src.dossiers.documents import node_output_document_blockers

        db = MagicMock()
        db.execute.side_effect = [_rows([{
            "checklist_result_id": "CR-1", "checklist_name": "Bản kỹ thuật gốc",
            "checklist_status": "approved", "approver_role": "admin",
            "output_documents": output_documents, "dang_co": dang_co,
        }])]
        return node_output_document_blockers(db, "TN-K02")

    def test_du_va_con_hop_le_thi_dong_duoc(self):
        self.assertEqual(
            self._chan([{"template_id": "TPL_A", "min_count": 1}], {"TPL_A": 1}), [])

    def test_tai_lieu_bi_giam_doc_gat_sang_khong_hop_le_thi_chan_dong_node(self):
        """Checklist vẫn 'đã duyệt' nhưng tệp đã bị loại — bước chưa được đóng.

        Đây là ca chứng minh cổng có tác dụng THẬT: auto_finalize đã đòi mọi
        checklist approved trước khi tới đây, nên nếu chỉ soi trạng thái checklist
        thì cổng không bao giờ đóng.
        """
        chan = self._chan([{"template_id": "TPL_A", "min_count": 1}], {"TPL_A": 0})
        self.assertEqual(len(chan), 1)
        self.assertIn("còn hợp lệ 0", chan[0])

    def test_thieu_so_luong_sau_khi_go_bot_thi_chan(self):
        chan = self._chan([{"template_id": "TPL_A", "min_count": 4}], {"TPL_A": 2})
        self.assertIn("cần 4, còn hợp lệ 2", chan[0])

    def test_node_khong_khai_tai_lieu_thi_khong_chan(self):
        from src.dossiers.documents import node_output_document_blockers

        db = MagicMock()
        db.execute.side_effect = [_rows([])]
        self.assertEqual(node_output_document_blockers(db, "TN-K01"), [])


class CanGiamDocDuyetTests(unittest.TestCase):
    """Cờ needs_director_approval có răng ở tầng CẤU HÌNH, không phải query dư."""

    def test_true_ma_nguoi_duyet_khong_phai_giam_doc_thi_khong_luu_duoc(self):
        with self.assertRaises(WorkflowValidationError) as caught:
            _chuan_hoa(
                {"output_documents": [
                    {"template_id": "TPL_BAN_KY_THUAT_GOC", "needs_director_approval": True}]},
                approver_role="survey_lead",
            )
        self.assertIn("Giám đốc duyệt", str(caught.exception))

    def test_true_va_nguoi_duyet_la_giam_doc_thi_qua(self):
        ket_qua = _chuan_hoa(
            {"output_documents": [
                {"template_id": "TPL_BAN_KY_THUAT_GOC", "needs_director_approval": True}]},
            approver_role="admin",
        )
        self.assertTrue(ket_qua[0]["needs_director_approval"])

    def test_false_thi_khong_rang_buoc_nguoi_duyet(self):
        """Không khai cờ thì không được đẻ thêm ràng buộc nào cho quy trình cũ."""
        ket_qua = _chuan_hoa(
            {"output_documents": [{"template_id": "TPL_BAN_KY_THUAT_GOC"}]},
            approver_role="survey_lead",
        )
        self.assertFalse(ket_qua[0]["needs_director_approval"])


class KhoaLuuTruTests(unittest.TestCase):
    """Khoá theo document_id — không chứa stage, không chứa tên loại giấy."""

    def test_khoa_theo_document_id(self):
        from src.files.references import DossierFileReference

        key = DossierFileReference.build(
            contract_id="003/BK-2026", document_id="7f3a9c21", filename="ban-ky-thuat.pdf",
        ).object_key
        self.assertEqual(key, "contracts/003_BK-2026/dossier-documents/7f3a9c21/document-7f3a9c21.pdf")

    def test_khoa_khong_chua_stage(self):
        from src.files.references import DossierFileReference

        key = DossierFileReference.build(
            contract_id="003/BK-2026", document_id="abc", filename="x.pdf",
        ).object_key
        duong_dan = key.rsplit("/", 1)[0]
        for stage in ("do-hien-truong", "chuan-hoa-ky-thuat", "soan-ho-so", "ho-so-goc"):
            self.assertNotIn(stage, duong_dan)

    def test_van_nam_duoi_prefix_contracts_de_chay_tren_r2(self):
        from src.files.references import DossierFileReference
        from src.services.storage_service import GENERIC_OBJECT_PREFIXES, _require_prefix

        key = DossierFileReference.build(
            contract_id="004/BK-2026", document_id="def", filename="a.jpg",
        ).object_key
        self.assertEqual(_require_prefix(key, GENERIC_OBJECT_PREFIXES), key)

    def test_thieu_document_id_thi_tu_choi(self):
        from src.files.references import DossierFileReference

        with self.assertRaises(ValueError):
            DossierFileReference.build(contract_id="x", document_id="", filename="a.pdf")


if __name__ == "__main__":
    unittest.main()


def _khong_quan_tam():
    """Ô mock cho câu lệnh test không quan tâm nội dung.

    KHÔNG dùng MagicMock trần: MagicMock().scalar() trả về một MagicMock, mà
    MagicMock là truthy — cổng chặn gán đè lên tờ đã duyệt sẽ hiểu nhầm thành
    "ô giấy này đã có tờ được duyệt" rồi ném 409 giữa một test không liên quan.
    """
    result = MagicMock()
    result.scalar.return_value = None
    return result


def _mock_db_cho_validate(templates=("TPL_BAN_KY_THUAT_GOC",)):
    """db giả đủ cho validate_workflow_graph: danh mục node, phòng ban, mẫu giấy."""
    db = MagicMock()
    calls = {"n": 0}

    def _execute(stmt, *args, **kwargs):
        sql = str(stmt).lower()
        result = MagicMock()
        if "workflow_nodes" in sql:
            result.all.return_value = [("K01",), ("K02",), ("K03",)]
        elif "departments" in sql:
            result.all.return_value = [("SURVEY",), ("LEGAL",)]
        elif "document_checklist_templates" in sql:
            result.all.return_value = [(t,) for t in templates]
        else:
            result.all.return_value = []
        result.mappings.return_value.all.return_value = []
        calls["n"] += 1
        return result

    db.execute.side_effect = _execute
    return db


def _graph(checklist):
    return {
        "start_node": "k02",
        "nodes": {"k02": {"task_code": "K02", "transitions": {}, "checklist": checklist}},
    }


class BaLuongLuuGraphTests(unittest.TestCase):
    """Ba cửa vào của validate_workflow_graph — HIGH risk nên phải khoá cả ba."""

    def _validate(self, graph, **kwargs):
        from src.contracts import workflow_runtime

        with patch.object(workflow_runtime, "_current_work_item_rates", return_value={}):
            return workflow_runtime.validate_workflow_graph(
                _mock_db_cho_validate(), graph, **kwargs
            )

    def test_luong_1_create_workflow_template(self):
        """Tạo mẫu quy trình: graph cũ không có tài liệu đầu ra."""
        out = self._validate(_graph([{"key": "a", "name": "Ảnh thực địa"}]))
        item = out["nodes"]["k02"]["checklist"][0]
        self.assertNotIn("output_documents", item,
                         "graph cũ KHÔNG được tự mọc thêm field")

    def test_luong_2_save_service_line_workflow_draft(self):
        out = self._validate(_graph([{"key": "a", "name": "Ảnh thực địa"}]),
                             require_connected=False)
        self.assertNotIn("output_documents", out["nodes"]["k02"]["checklist"][0])

    def test_luong_3_activate_service_line_workflow(self):
        """Kích hoạt đòi liên thông — vẫn phải qua với graph cũ."""
        out = self._validate(_graph([{"key": "a", "name": "Ảnh thực địa"}]),
                             require_connected=True)
        self.assertNotIn("output_documents", out["nodes"]["k02"]["checklist"][0])

    def test_graph_cu_giu_nguyen_moi_field_khac(self):
        """Regression: không được đụng gì tới phần checklist cũ."""
        out = self._validate(_graph([{
            "key": "a", "name": "Ảnh thực địa", "required": True,
            "require_evidence": True, "evidence_description": "4 góc ranh",
        }]))
        item = out["nodes"]["k02"]["checklist"][0]
        self.assertTrue(item["require_evidence"])
        self.assertEqual(item["evidence_description"], "4 góc ranh")
        self.assertEqual(item["approver_role"], "admin")

    def test_khai_tai_lieu_dau_ra_thi_ghi_vao_graph(self):
        out = self._validate(_graph([{
            "key": "a", "name": "Bản kỹ thuật gốc",
            "output_documents": [{"template_id": "TPL_BAN_KY_THUAT_GOC", "min_count": 2}],
        }]))
        item = out["nodes"]["k02"]["checklist"][0]
        self.assertEqual(item["output_documents"], [{
            "template_id": "TPL_BAN_KY_THUAT_GOC", "min_count": 2,
            "required_before_submit": True, "needs_director_approval": False,
        }])

    def test_khai_rong_thi_go_khoa_khoi_graph(self):
        out = self._validate(_graph([{"key": "a", "name": "A", "output_documents": []}]))
        self.assertNotIn("output_documents", out["nodes"]["k02"]["checklist"][0])

    def test_template_khong_ton_tai_thi_khong_luu_duoc_graph(self):
        from src.contracts.workflow_runtime import WorkflowValidationError

        with self.assertRaises(WorkflowValidationError):
            self._validate(_graph([{
                "key": "a", "name": "A",
                "output_documents": [{"template_id": "TPL_BAY_BA"}],
            }]))

    def test_field_la_thi_khong_luu_duoc_graph(self):
        from src.contracts.workflow_runtime import WorkflowValidationError

        with self.assertRaises(WorkflowValidationError) as caught:
            self._validate(_graph([{
                "key": "a", "name": "A",
                "output_documents": [
                    {"template_id": "TPL_BAN_KY_THUAT_GOC", "auto_approve": True}],
            }]))
        self.assertIn("auto_approve", str(caught.exception))


class MotFileMotObjectTests(unittest.TestCase):
    """Luật xương sống: một tệp vừa là minh chứng vừa là tài liệu hồ sơ —
    nhưng CHỈ gọi storage đúng một lần và chỉ có một object_key."""

    def _chay(self):
        from src.dossiers import documents

        db = MagicMock()
        db.execute.side_effect = [
            _row({"id": "CR-1", "task_node_id": "TN-K02", "evidence_data": {},
                  "node_code": "K02", "service_line_id": "SL-A",
                  "contract_id": "003/BK-2026"}),
            # Cấu hình của chính mục checklist — dùng để chặn template lạ.
            _row({"output_documents": [{"template_id": "TPL_BAN_KY_THUAT_GOC",
                                        "min_count": 1, "required_before_submit": True,
                                        "needs_director_approval": False}],
                  "service_line_id": "SL-A", "contract_id": "003/BK-2026"}),
            _rows([{"id": "S-BKTG", "scope": "SERVICE_LINE", "name": "Bản kỹ thuật gốc"}]),
            # Hạng mục Đo vẽ không có hồ sơ pháp lý -> dossier_id là null.
            _scalar(None),
            # Các câu ghi còn lại + cổng chặn gán đè: test này không xét nội dung,
            # nhưng scalar() phải là None để cổng đó không ném 409 nhầm.
            *[_khong_quan_tam() for _ in range(8)],
        ]
        with patch.object(documents, "upload_file") as upload, \
             patch.object(documents, "ensure_bucket"):
            ket_qua = documents.submit_output_document(
                db, checklist_result_id="CR-1", template_id="TPL_BAN_KY_THUAT_GOC",
                file_name="ban-ky-thuat.pdf", content_type="application/pdf",
                data=b"%PDF-1.4 noi dung", actor_id="u1",
            )
        return ket_qua, upload, db

    def test_chi_upload_dung_mot_lan(self):
        _, upload, _ = self._chay()
        self.assertEqual(upload.call_count, 1)

    def test_chi_mot_object_key_va_theo_document_id(self):
        ket_qua, upload, _ = self._chay()
        key = upload.call_args[0][1]
        self.assertIn(f"dossier-documents/{ket_qua['document_id']}/", key)
        self.assertTrue(key.startswith("contracts/003_BK-2026/"))

    def test_K02_vao_dung_giai_doan_do_hien_truong(self):
        ket_qua, _, _ = self._chay()
        self.assertEqual(ket_qua["stage"], "do-hien-truong")

    def test_sinh_du_ba_quan_he_va_evidence_chi_giu_document_id(self):
        ket_qua, _, db = self._chay()
        cac_lenh = " ".join(str(c.args[0]).lower() for c in db.execute.call_args_list)
        self.assertIn("insert into public.dossier_documents", cac_lenh)
        self.assertIn("insert into public.dossier_document_links", cac_lenh)
        self.assertIn("insert into public.checklist_result_document_links", cac_lenh)

        evidence = None
        for call in db.execute.call_args_list:
            if len(call.args) > 1 and isinstance(call.args[1], dict) and "evidence" in call.args[1]:
                evidence = call.args[1]["evidence"]
        self.assertIsNotNone(evidence)
        self.assertIn(ket_qua["document_id"], evidence)
        # URL tạm không được coi là nguồn dữ liệu — backend sinh lúc đọc.
        self.assertNotIn("http", evidence)

    def test_ghi_db_hong_thi_giu_object_de_audit(self):
        from src.dossiers import documents

        db = MagicMock()
        db.execute.side_effect = [
            _row({"id": "CR-1", "task_node_id": "TN-K02", "evidence_data": {},
                  "node_code": "K02", "service_line_id": "SL-A",
                  "contract_id": "003/BK-2026"}),
            _row({"output_documents": [{"template_id": "TPL_X", "min_count": 1,
                                        "required_before_submit": True,
                                        "needs_director_approval": False}],
                  "service_line_id": "SL-A", "contract_id": "003/BK-2026"}),
            _rows([{"id": "S-BKTG", "scope": "SERVICE_LINE", "name": "Bản kỹ thuật gốc"}]),
            _scalar(None),
            RuntimeError("DB chết giữa chừng"),
        ]
        with patch.object(documents, "upload_file") as upload, \
             patch.object(documents, "ensure_bucket"):
            with self.assertRaises(RuntimeError):
                documents.submit_output_document(
                    db, checklist_result_id="CR-1", template_id="TPL_X",
                    file_name="a.pdf", content_type="application/pdf",
                    data=b"%PDF", actor_id="u1",
                )
        self.assertEqual(upload.call_count, 1)


class K03DungLaiTaiLieuK02Tests(unittest.TestCase):
    """K03 dùng lại tài liệu K02 bằng liên kết DB — không upload lại."""

    def test_noi_them_quan_he_khong_goi_storage(self):
        from src.dossiers import documents

        db = MagicMock()
        db.execute.side_effect = [
            # Chốt chặn tài liệu thuộc đề xuất chưa duyệt: không dòng nào -> cho qua.
            _row(None),
            # Khoá hàng mục checklist, cổng chặn gán đè, rồi câu chèn quan hệ.
            # Đường DÙNG LẠI cũng phải qua cổng đó — chặn một đường mà bỏ đường
            # kia thì vẫn thay được tệp đã duyệt, chỉ là bằng lối khác.
            *[_khong_quan_tam() for _ in range(3)],
        ]
        with patch.object(documents, "upload_file") as upload:
            documents.reuse_document_for_checklist(
                db, checklist_result_id="CR-K03", document_id="DOC-K02",
                contract_id="003/BK-2026", actor_id="u1",
            )
        self.assertEqual(upload.call_count, 0, "dùng lại thì KHÔNG được upload thêm object")


class ChanTemplateLaTruocKhiUploadTests(unittest.TestCase):
    """Template không nằm trong cấu hình của chính mục checklist thì chặn —
    và phải chặn TRƯỚC khi tệp chạm tới kho lưu trữ."""

    def _chay(self, template_id, output_documents):
        from fastapi import HTTPException

        from src.dossiers import documents

        db = MagicMock()
        db.execute.side_effect = [
            _row({"id": "CR-1", "task_node_id": "TN-K02", "evidence_data": {},
                  "node_code": "K02", "service_line_id": "SL-A",
                  "contract_id": "003/BK-2026"}),
            _row({"output_documents": output_documents,
                  "service_line_id": "SL-A", "contract_id": "003/BK-2026"}),
        ]
        with patch.object(documents, "upload_file") as upload, \
             patch.object(documents, "ensure_bucket"):
            with self.assertRaises(HTTPException) as caught:
                documents.submit_output_document(
                    db, checklist_result_id="CR-1", template_id=template_id,
                    file_name="a.pdf", content_type="application/pdf",
                    data=b"%PDF", actor_id="u1",
                )
        return caught.exception, upload

    def test_template_khong_thuoc_checklist_thi_chan_va_khong_upload(self):
        loi, upload = self._chay(
            "TPL_LA_HOAC",
            [{"template_id": "TPL_BAN_KY_THUAT_GOC", "min_count": 1}],
        )
        self.assertEqual(loi.status_code, 409)
        self.assertEqual(upload.call_count, 0, "tệp sai KHÔNG được chạm tới kho lưu trữ")

    def test_checklist_khong_doi_tai_lieu_nao_thi_chan(self):
        loi, upload = self._chay("TPL_BAN_KY_THUAT_GOC", [])
        self.assertEqual(loi.status_code, 409)
        self.assertIn("không yêu cầu tài liệu đầu ra", str(loi.detail))
        self.assertEqual(upload.call_count, 0)


class GraphCuKhongTruyVanDanhMucTests(unittest.TestCase):
    """Quy trình cũ không được phát sinh thêm MỘT truy vấn nào."""

    def _dem_truy_van_danh_muc(self, checklist):
        from src.contracts import workflow_runtime

        db = _mock_db_cho_validate()
        with patch.object(workflow_runtime, "_current_work_item_rates", return_value={}):
            workflow_runtime.validate_workflow_graph(db, _graph(checklist))
        return sum(
            1 for c in db.execute.call_args_list
            if "document_checklist_templates" in str(c.args[0]).lower()
        )

    def test_graph_cu_khong_doc_danh_muc_tai_lieu(self):
        self.assertEqual(
            self._dem_truy_van_danh_muc([{"key": "a", "name": "Ảnh thực địa"}]), 0)

    def test_graph_co_khai_thi_doc_dung_mot_lan_du_nhieu_checklist(self):
        so_lan = self._dem_truy_van_danh_muc([
            {"key": "a", "name": "A",
             "output_documents": [{"template_id": "TPL_BAN_KY_THUAT_GOC"}]},
            {"key": "b", "name": "B",
             "output_documents": [{"template_id": "TPL_BAN_KY_THUAT_GOC"}]},
        ])
        self.assertEqual(so_lan, 1, "danh mục phải được nhớ lại, không đọc mỗi checklist một lần")


class ChuoiQuanHeHongThiKhongTaoRecordTests(unittest.TestCase):
    """contract_id suy phía máy chủ. Chuỗi đứt thì DỪNG, không ghi dòng null."""

    def test_khong_truy_ra_hop_dong_thi_bao_loi_nghiep_vu(self):
        from sqlalchemy.exc import NoResultFound

        from src.contracts.workflow_runtime import _insert_checklist_result

        db = MagicMock()
        db.execute.return_value.scalar_one.side_effect = NoResultFound()
        with self.assertRaises(WorkflowValidationError) as caught:
            _insert_checklist_result(
                db, MagicMock(), {"task_node_id": "TN-MOCOI"},
                checklist_name="Bản kỹ thuật gốc",
            )
        self.assertIn("không truy ra được Hợp đồng", str(caught.exception))
        self.assertIn("TN-MOCOI", str(caught.exception))

    def test_chuoi_lanh_lan_thi_tra_ve_id(self):
        from src.contracts.workflow_runtime import _insert_checklist_result

        db = MagicMock()
        db.execute.return_value.scalar_one.return_value = "CR-MOI"
        self.assertEqual(
            _insert_checklist_result(db, MagicMock(), {"task_node_id": "TN-1"},
                                     checklist_name="A"),
            "CR-MOI",
        )

    def test_cau_insert_tu_suy_contract_id_khong_nhan_tu_ngoai(self):
        """Không có tham số contract_id nào để client bơm vào."""
        import re

        src = open(ROOT_SRC / "contracts/workflow_runtime.py", encoding="utf-8").read()
        khoi = re.findall(
            r"insert into public\.task_node_checklist_results.*?returning id", src, re.S)
        self.assertEqual(len(khoi), 3)
        for k in khoi:
            self.assertIn("join public.workflow_instances", k)
            self.assertIn("join public.service_lines", k)
            self.assertNotIn(":contract_id", k)


class ChanDoIdChecklistTests(unittest.TestCase):
    """IDOR: id mục checklist đoán được, nên route phải soát cả quan hệ lẫn quyền."""

    def _goi(self, thuoc_ve, co_quyen_hop_dong, duoc_giao):
        from fastapi import HTTPException

        from src.routes import routes_employee_portal as routes

        db = MagicMock()
        ket_qua = [_first(1) if thuoc_ve else _first(None)]
        if not co_quyen_hop_dong:
            ket_qua.append(_first(1) if duoc_giao else _first(None))
        db.execute.side_effect = ket_qua

        with patch.object(routes, "check_user_permission", return_value=co_quyen_hop_dong), \
             patch.object(routes, "_active_employee_for_user",
                          return_value=MagicMock(id="EMP-1")), \
             patch("src.dossiers.documents.checklist_output_status",
                   return_value={"can_submit": True, "missing": [], "documents": []}):
            try:
                return routes.get_checklist_output_status(
                    task_node_id="TN-1", checklist_result_id="CR-1",
                    db=db, user=MagicMock(id="U-1"),
                ), None
            except HTTPException as exc:
                return None, exc

    def test_doi_checklist_sang_buoc_khac_thi_404(self):
        ket_qua, loi = self._goi(thuoc_ve=False, co_quyen_hop_dong=True, duoc_giao=True)
        self.assertIsNone(ket_qua)
        self.assertEqual(loi.status_code, 404)

    def test_khong_duoc_giao_va_khong_co_quyen_hop_dong_thi_403(self):
        ket_qua, loi = self._goi(thuoc_ve=True, co_quyen_hop_dong=False, duoc_giao=False)
        self.assertIsNone(ket_qua)
        self.assertEqual(loi.status_code, 403)

    def test_nhan_vien_duoc_giao_thi_xem_duoc(self):
        ket_qua, loi = self._goi(thuoc_ve=True, co_quyen_hop_dong=False, duoc_giao=True)
        self.assertIsNone(loi)
        self.assertTrue(ket_qua["can_submit"])

    def test_giam_doc_co_quyen_hop_dong_thi_xem_duoc(self):
        ket_qua, loi = self._goi(thuoc_ve=True, co_quyen_hop_dong=True, duoc_giao=False)
        self.assertIsNone(loi)
        self.assertTrue(ket_qua["can_submit"])


class NopThangKhiConToBiTraLaiTests(unittest.TestCase):
    """Cổng /shortage đã báo `rejected_documents` là chặn cứng (can_submit=False),
    nhưng NÚT NỘP thật (`submit_task_node_for_acceptance`) phải TỰ chặn lại — nếu
    không thì gọi thẳng POST .../submit là qua mặt được cảnh báo trên giao diện.

    Ranh giới nghiệp vụ: còn MỘT tờ đầu ra đang mang phán quyết 'rejected' của
    Giám đốc mà chưa nộp tệp sửa thì đây là "nộp lại y nguyên bài đã bị trả".
    Bước không được rời khỏi tay nhân viên cho tới khi tờ đó được thay.

    ── ĐANG ĐỎ CÓ CHỦ ĐÍCH ──────────────────────────────────────────────────────
    Đây là test chuẩn bị (red). Bản production hôm nay của
    `submit_task_node_for_acceptance` chỉ soi TRẠNG THÁI checklist và chụp ảnh
    thiếu tài liệu; nó KHÔNG hề hỏi `node_document_review_summary`, nên một tờ bị
    trả vẫn nộp lại trót lọt. Test này phải ĐỎ tới khi bất biến được cài, KHÔNG
    được sửa production trong lượt này.

    Test giả định bản vá dùng lại chính `node_document_review_summary` — đúng hàm
    mà cổng /shortage đang dùng để đếm `rejected_count`. Đó là mối nối DRY hiển
    nhiên; nếu bản vá tự viết truy vấn riêng thì chỉnh mock ở đây một nhịp.
    """

    def _side_effect_duong_nop_tron_tru(self):
        """Chín lượt db.execute của đường nộp THÀNH CÔNG hôm nay, theo đúng thứ tự.

        Bản production chạy hết chuỗi này rồi trả 'submitted'. Có bất biến thì nó
        dừng giữa chừng ở cổng tài liệu bị trả — các lượt thừa phía sau bỏ không,
        không sao.
        """
        return [
            _first(1),   # 1 _require_node_assignment — có phân công
            _first(1),   # 2 vai trò được nộp cả gói (SUBMIT_CAPABLE_ROLES)
            _row({"pause_reason_type": None, "paused_note": None}),  # 3 node_pause_block — không tạm dừng
            _row({"id": "TN-1", "status": "in_progress", "is_handover": False}),  # 4 khoá node
            _rows([]),   # 5 không còn mục checklist nào dang dở
            _scalar_one(1),            # 6 attempt_no kế tiếp
            _scalar_one("ACC-THANG-1"),  # 7 chèn lượt nghiệm thu
            MagicMock(),  # 8 update task_nodes -> submitted
            MagicMock(),  # 9 chèn task_node_events
        ]

    def test_con_to_dau_ra_bi_tra_lai_thi_nop_thang_phai_bi_chan(self):
        from src.contracts import workflow_runtime

        db = MagicMock()
        db.execute.side_effect = self._side_effect_duong_nop_tron_tru()

        # Một tờ đầu ra đã bị Giám đốc trả (rejected) và chưa được thay.
        review = {
            "total": 2, "approved_count": 1, "rejected_count": 1, "pending_count": 0,
            "rejected_items": [{
                "document_name": "Bản vẽ hiện trạng",
                "checklist_name": "Chuẩn hoá bản vẽ",
                "reason": "Ảnh mờ không đọc được",
            }],
        }
        with patch("src.dossiers.documents.node_shortage_report", return_value=[]), \
             patch.object(workflow_runtime, "node_document_review_summary", return_value=review):
            with self.assertRaises(
                workflow_runtime.WorkflowValidationError,
                msg="Nộp thẳng khi còn tờ đầu ra bị trả lại phải bị chặn, "
                    "nhưng submit_task_node_for_acceptance đã cho nộp trót lọt.",
            ):
                workflow_runtime.submit_task_node_for_acceptance(
                    db, task_node_id="TN-1", employee_id="EMP-1",
                    actor_id="U-1", note=None,
                )

    def test_moi_to_dau_ra_deu_dat_thi_nop_thang_van_qua(self):
        """Đối chứng: không có tờ nào bị trả thì đường nộp cũ vẫn phải thông —
        bất biến mới KHÔNG được vạ lây sang hồ sơ sạch."""
        from src.contracts import workflow_runtime

        db = MagicMock()
        db.execute.side_effect = self._side_effect_duong_nop_tron_tru()

        review = {
            "total": 2, "approved_count": 2, "rejected_count": 0, "pending_count": 0,
            "rejected_items": [],
        }
        with patch("src.dossiers.documents.node_shortage_report", return_value=[]), \
             patch.object(workflow_runtime, "node_document_review_summary", return_value=review):
            ket_qua = workflow_runtime.submit_task_node_for_acceptance(
                db, task_node_id="TN-1", employee_id="EMP-1",
                actor_id="U-1", note=None,
            )
        self.assertEqual(ket_qua["status"], "submitted")
