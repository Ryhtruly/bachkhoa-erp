"""Khóa hồi quy cho cơ chế cấp ``audit_log.id`` ở PostgreSQL.

ID nhật ký phải do một sequence duy nhất cấp. Ứng dụng không được tự sinh ID từ
đồng hồ vì hai tiến trình có thể tạo cùng một giá trị trong cùng micro-giây.
"""

from pathlib import Path
import inspect

from src.db.models.auth import AuditLog
from src.dossiers import register, slot_requests


def _find_project_root() -> Path:
    """Tìm project root cả khi test chạy trên host lẫn trong container."""
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "supabase").is_dir():
            return candidate
    raise RuntimeError("Không tìm thấy thư mục supabase để kiểm migration audit_log")


ROOT = _find_project_root()
# Tên file phải khớp file THẬT trong repo. Bản trước ghi mốc 20260825110000 —
# một mốc chưa từng tồn tại — nên test này im lặng không chạy suốt: thư mục
# supabase không được mount vào container, nó chết ở bước tìm ROOT và không ai
# thấy. Mốc đúng là 20260825063758.
MIGRATION = ROOT / "supabase/migrations/20260825063758_audit_log_id_sequence.sql"
ROLLBACK = ROOT / "supabase/rollback/20260825063758_audit_log_id_sequence_down.sql"
assert MIGRATION.is_file(), f"Không thấy migration: {MIGRATION}"
assert ROLLBACK.is_file(), f"Không thấy rollback: {ROLLBACK}"


def test_audit_log_model_delegates_id_to_postgres():
    column = AuditLog.__table__.c.id

    assert column.default is None
    assert column.server_default is not None
    assert "audit_log_id_seq" in str(column.server_default.arg)


def test_slot_request_audit_does_not_generate_time_based_id():
    source = inspect.getsource(slot_requests._audit).lower()

    assert "time_ns" not in source
    assert "(id, actor_id" not in source
    assert '"id"' not in source


def test_document_link_audit_does_not_generate_time_based_id():
    source = inspect.getsource(register._write_document_link_audit).lower()

    assert "time_ns" not in source
    assert "(id, actor_id" not in source
    assert '"id"' not in source


def test_migration_installs_owned_sequence_and_default():
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    assert "create sequence" in sql
    assert "audit_log_id_seq" in sql
    assert "lock table public.audit_log" in sql
    assert "setval" in sql
    assert "owned by public.audit_log.id" in sql
    assert "alter column id set default" in sql


def test_rollback_removes_default_before_sequence():
    sql = ROLLBACK.read_text(encoding="utf-8").lower()

    drop_default_at = sql.index("alter column id drop default")
    drop_sequence_at = sql.index("drop sequence")
    assert drop_default_at < drop_sequence_at
