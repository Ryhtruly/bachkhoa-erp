"""Hàng chờ Giám đốc phải phân biệt phiếu sửa tài liệu và phiếu WAIVE."""

from unittest.mock import MagicMock, patch


def _db_with_rows(rows):
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = rows
    return db


def test_hang_cho_tra_kind_va_hang_muc_cua_phieu_waive_khi_schema_v2_san_sang():
    from src.routes.routes_document_register import list_pending_change_requests

    db = _db_with_rows([{
        "id": "WV-1", "kind": "WAIVE", "service_line_id": "SL-1",
        "service_line_name": "Cắm mốc",
    }])
    with patch("src.routes.routes_document_register.register._co_cot_waiver_service_line", return_value=True):
        result = list_pending_change_requests(db=db, user=MagicMock())

    sql = str(db.execute.call_args.args[0])
    assert "r.kind" in sql
    assert "coalesce(r.service_line_id, s.service_line_id)" in sql
    assert result["data"][0]["kind"] == "WAIVE"
    assert result["data"][0]["service_line_id"] == "SL-1"


def test_hang_cho_van_doc_duoc_schema_cu_chua_co_service_line_tren_phieu():
    from src.routes.routes_document_register import list_pending_change_requests

    db = _db_with_rows([{"id": "CR-1", "kind": "EDIT", "service_line_id": None}])
    with patch("src.routes.routes_document_register.register._co_cot_waiver_service_line", return_value=False):
        result = list_pending_change_requests(db=db, user=MagicMock())

    sql = str(db.execute.call_args.args[0])
    assert "r.kind" not in sql
    assert "r.service_line_id" not in sql
    assert "'EDIT'::varchar as kind" in sql
    assert result["data"][0]["kind"] == "EDIT"
