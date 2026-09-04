"""Tủ hồ sơ của một Hạng mục xếp theo BƯỚC, và chỉ chứa giấy của chính nó.

Lỗi đã thấy trên hợp đồng thật: tủ bày badge 33 / 14 / 11 cho một hạng mục mà
tab Mẫu giấy tờ chỉ khai 18 loại giấy. Tủ lúc đó đọc thẳng ``dossier_document_slots``
— bảng vốn chỉ trả lời "đã có tờ đó chưa" — nên 31 ô sinh thừa bởi luật dựng sổ
cũ lọt hết vào, và không dòng nào nói mình thuộc bước nào.

``cabinet_by_node`` tách hai vai: CẤU TRÚC ("hạng mục này cần tờ gì, ở bước nào")
lấy từ master data, TRẠNG THÁI ("đã có chưa") lấy từ ô giấy. Ô thừa tự không xuất
hiện, không cần đụng tới dữ liệu đang có.
"""

import unittest
import uuid

from sqlalchemy import text

from tests.fixtures_so_giay_to import get_missing_documents


def _id(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


class CabinetByNodeTests(unittest.TestCase):
    def setUp(self):
        from src.db.database import SessionLocal

        self.db = SessionLocal()
        missing = get_missing_documents(self.db)
        if missing:
            self.db.close()
            self.skipTest("DB thiếu bảng: " + ", ".join(missing))

        from src.dossiers import register

        self.register = register
        self._dung_boi_canh()

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    # ── bối cảnh ──

    def _dung_boi_canh(self):
        self.db.execute(
            text("insert into public.workflow_nodes (code, name) values"
                 " ('K01', 'Tiếp nhận'), ('K03', 'Chuẩn hoá')"
                 " on conflict (code) do nothing")
        )
        self.goi = _id("P")
        self.db.execute(
            text("insert into public.service_packages (id, name) values (:id, 'Gói Đo vẽ')"),
            {"id": self.goi},
        )
        self.thu_tuc = _id("TT")
        self.db.execute(
            text("insert into public.task_types (id, name, service_package_id)"
                 " values (:id, 'Tách thửa', :p)"),
            {"id": self.thu_tuc, "p": self.goi},
        )
        self.hop_dong = _id("HD")
        self.db.execute(text("insert into public.contracts (id) values (:id)"),
                        {"id": self.hop_dong})
        self.hang_muc = _id("SL")
        self.db.execute(
            text("insert into public.service_lines (id, contract_id, task_type_id,"
                 " service_package_id) values (:id, :c, :tt, :p)"),
            {"id": self.hang_muc, "c": self.hop_dong, "tt": self.thu_tuc, "p": self.goi},
        )

    def _mau(self, ten, source, node, *, bat_buoc=False):
        """Một loại giấy đã khai cho đúng Gói này, ở đúng bước ``node``."""
        ma = _id("TPL")
        self.db.execute(
            text("""
                insert into public.document_checklist_templates
                    (id, name, source, is_required, needs_original, default_quantity,
                     sort_order, is_active)
                values (:id, :n, :s, :bb, false, 1, 0, true)
            """),
            {"id": ma, "n": ten, "s": source, "bb": bat_buoc},
        )
        self.db.execute(
            text("""
                insert into public.document_template_applicabilities
                    (template_id, applicability_type, service_package_id, node_code, is_default)
                values (:t, 'PACKAGE', :p, :n, true)
            """),
            {"t": ma, "p": self.goi, "n": node},
        )
        return ma

    def _o_giay(self, ten, source, *, template_id=None, scope="SERVICE_LINE"):
        ma = _id("SLOT")
        self.db.execute(
            text("""
                insert into public.dossier_document_slots
                    (id, scope, contract_id, service_line_id, name, source, template_id, status)
                values (:id, :scope, :c, :sl, :n, :s, :t, 'CHUA_CO')
            """),
            {
                "id": ma, "scope": scope, "c": self.hop_dong,
                "sl": None if scope == "CONTRACT" else self.hang_muc,
                "n": ten, "s": source, "t": template_id,
            },
        )
        return ma

    def _tep(self, ten_tep, *, slot_id=None):
        ma = _id("DOC")
        self.db.execute(
            text("""
                insert into public.dossier_documents
                    (id, contract_id, stage, object_key, file_name, slot_id, doc_status)
                values (:id, :c, 'ho-so-goc', :k, :n, :s, 'DANG_DUNG')
            """),
            {"id": ma, "c": self.hop_dong, "k": f"test/{ma}", "n": ten_tep, "s": slot_id},
        )
        return ma

    def _noi_tep(self, slot_id, document_id):
        self.db.execute(
            text("""
                insert into public.dossier_document_links
                    (contract_id, slot_id, document_id, link_status)
                values (:c, :s, :d, 'DANG_DUNG')
            """),
            {"c": self.hop_dong, "s": slot_id, "d": document_id},
        )

    def _tu(self):
        return self.register.cabinet_by_node(self.db, self.hang_muc)

    # ── test ──

    def test_the_cabinet_is_grouped_by_node_not_by_source(self):
        self._mau("CCCD", "KHACH_HANG", "K01")
        self._mau("Sổ đỏ", "KHACH_HANG", "K01")
        self._mau("Bản vẽ hiện trạng", "CONG_TY", "K03")

        tu = self._tu()

        self.assertEqual([g["node_code"] for g in tu], ["K01", "K03"])
        self.assertEqual([g["total"] for g in tu], [2, 1])
        # Cùng một bước gom được giấy của nhiều nguồn khác nhau — đó chính là
        # điều bốn ngăn theo nguồn không nói được.
        self.assertEqual(
            sorted(d["name"] for d in tu[0]["documents"]), ["CCCD", "Sổ đỏ"],
        )

    def test_a_slot_outside_the_master_data_never_reaches_the_cabinet(self):
        """Chốt chặn cho đúng lỗi đã gặp: 31 ô thừa không được lọt vào tủ."""
        self._mau("CCCD", "KHACH_HANG", "K01")
        for i in range(30):
            self._o_giay(f"Giấy công ty không thuộc gói này {i}", "CONG_TY",
                         template_id=self._mau_khong_khai(f"Rác {i}"))

        tu = self._tu()

        self.assertEqual(sum(g["total"] for g in tu), 1)
        self.assertEqual([d["name"] for d in tu[0]["documents"]], ["CCCD"])

    def _mau_khong_khai(self, ten):
        """Mẫu có trong danh mục nhưng KHÔNG khai cho gói/hạng mục nào."""
        ma = _id("TPL")
        self.db.execute(
            text("""
                insert into public.document_checklist_templates
                    (id, name, source, is_required, needs_original, default_quantity,
                     sort_order, is_active)
                values (:id, :n, 'CONG_TY', false, false, 1, 0, true)
            """),
            {"id": ma, "n": ten},
        )
        return ma

    def test_documents_no_node_claims_go_last_and_stay_visible(self):
        self._mau("Bản vẽ", "CONG_TY", "K03")
        self._mau("Giấy chưa ai xếp bước", "CONG_TY", None)

        tu = self._tu()

        # Xuống CUỐI, nhưng KHÔNG bị bỏ đi: giấy không bước nào nhận thì không ai
        # thu, và đây là chỗ duy nhất nói cho Giám đốc biết điều đó.
        self.assertEqual([g["node_code"] for g in tu], ["K03", None])
        self.assertEqual([d["name"] for d in tu[1]["documents"]], ["Giấy chưa ai xếp bước"])

    def test_a_declared_document_with_no_slot_yet_shows_as_missing(self):
        self._mau("CCCD", "KHACH_HANG", "K01")

        muc = self._tu()[0]["documents"][0]

        self.assertIsNone(muc["slot_id"])
        self.assertEqual(muc["status"], "CHUA_CO")
        self.assertEqual(muc["file_count"], 0)

    def test_a_file_linked_through_the_link_table_counts(self):
        mau = self._mau("CCCD", "KHACH_HANG", "K01")
        o = self._o_giay("CCCD", "KHACH_HANG", template_id=mau)
        self._noi_tep(o, self._tep("cccd.pdf"))

        nhom = self._tu()[0]

        self.assertEqual(nhom["done"], 1)
        self.assertEqual(nhom["documents"][0]["file_count"], 1)
        self.assertEqual(nhom["documents"][0]["slot_id"], o)

    def test_a_file_attached_straight_to_the_slot_also_counts(self):
        """Tệp vào ô bằng HAI đường; đếm một đường là báo "chưa có" cho tờ đã có.

        Sổ giấy tờ (``_SLOTS_QUERY_TMPL``) hợp cả hai: gán qua bảng nối, và nộp
        thẳng với ``dossier_documents.slot_id``. Tủ phải đếm y hệt, nếu không hai
        màn cùng đọc một hồ sơ lại nói hai con số khác nhau.
        """
        mau = self._mau("Bản vẽ", "CONG_TY", "K03")
        o = self._o_giay("Bản vẽ", "CONG_TY", template_id=mau)
        self._tep("ban-ve.pdf", slot_id=o)

        nhom = self._tu()[0]

        self.assertEqual(nhom["done"], 1)
        self.assertEqual(nhom["documents"][0]["file_count"], 1)

    def test_a_removed_file_stops_counting(self):
        mau = self._mau("CCCD", "KHACH_HANG", "K01")
        o = self._o_giay("CCCD", "KHACH_HANG", template_id=mau)
        tep = self._tep("cccd.pdf", slot_id=o)
        self.db.execute(
            text("update public.dossier_documents set doc_status = 'DA_GO' where id = :i"),
            {"i": tep},
        )

        self.assertEqual(self._tu()[0]["done"], 0)

    def test_the_same_file_reached_both_ways_is_counted_once(self):
        mau = self._mau("CCCD", "KHACH_HANG", "K01")
        o = self._o_giay("CCCD", "KHACH_HANG", template_id=mau)
        tep = self._tep("cccd.pdf", slot_id=o)
        self._noi_tep(o, tep)

        # Hợp hai đường bằng ``union`` chứ không ``union all``: cùng một tờ đi cả
        # hai đường thì tủ vẫn phải nói 1 tệp, không phải 2.
        self.assertEqual(self._tu()[0]["documents"][0]["file_count"], 1)

    def test_a_contract_wide_slot_still_supplies_state(self):
        """Giấy khách đưa nằm ở ô phạm vi HỢP ĐỒNG, không phải ô hạng mục.

        Chỉ quét ô của hạng mục là mọi tờ khách gửi đều hiện "chưa có", dù đã thu
        đủ — đúng loại sai khiến người ta đi thu lại giấy đã có.
        """
        mau = self._mau("Sổ đỏ", "KHACH_HANG", "K01")
        o = self._o_giay("Sổ đỏ", "KHACH_HANG", template_id=mau, scope="CONTRACT")
        self._noi_tep(o, self._tep("so-do.pdf"))

        self.assertEqual(self._tu()[0]["done"], 1)

    def test_the_cabinet_carries_the_file_so_the_screen_can_open_it(self):
        mau = self._mau("CCCD", "KHACH_HANG", "K01")
        o = self._o_giay("CCCD", "KHACH_HANG", template_id=mau)
        tep = self._tep("cccd.pdf", slot_id=o)

        muc = self._tu()[0]["documents"][0]

        # Không mang theo id tệp thì màn hình chỉ đếm được, không mở được — người
        # ta phải sang màn khác tìm đúng tờ vừa thấy.
        self.assertEqual([f["id"] for f in muc["files"]], [tep])
        self.assertEqual(muc["files"][0]["file_name"], "cccd.pdf")

    def test_nothing_declared_means_an_empty_cabinet_not_the_whole_catalogue(self):
        self._mau_khong_khai("Giấy chưa ai khai")

        self.assertEqual(self._tu(), [])
