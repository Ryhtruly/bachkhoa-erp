"""Dựng schema đầy đủ cho DB test.

Vì sao cần: bachkhoa_test được tạo từ metadata của SQLAlchemy, mà phần sổ giấy
tờ lại được tạo bằng SQL thuần trong supabase/migrations/. Kết quả là mọi kiểm
thử chạm sổ giấy tờ đều bị skip — nhìn thì "xanh" nhưng thực chất chưa chạy.

Script này chạy trên DB TEST cục bộ, không bao giờ đụng Supabase live.

    docker exec -e PYTHONPATH=/app \
      -e TEST_DATABASE_URL=postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/bachkhoa_test \
      -w /app bachkhoa-erp-dev-backend-1 python scripts/dung_schema_test.py
"""
import os
import pathlib
import sys

from sqlalchemy import create_engine, text

# Chạy TOÀN BỘ migration theo thứ tự tên file (timestamp). Danh sách chọn tay
# không dùng được: các bảng nền như legal_dossiers, task_nodes,
# document_checklist_templates cũng do migration cũ tạo, thiếu một cái là gãy dây
# chuyền.
#
# Lặp nhiều vòng: một số migration phụ thuộc nhau theo thứ tự không hoàn toàn
# khớp timestamp. Vòng sau chạy lại những cái lỡ hỏng, tới khi không tiến thêm.


def main() -> int:
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        print("Thiếu TEST_DATABASE_URL", file=sys.stderr)
        return 2
    if "bachkhoa_test" not in url:
        # Chặn cứng: script này chỉ được chạm DB test.
        print(f"TỪ CHỐI: chỉ chạy trên bachkhoa_test, không phải {url}", file=sys.stderr)
        return 2

    engine = create_engine(url)

    # 1) Bảng từ model
    from src.db.database import Base
    import src.db.models  # noqa: F401  — nạp toàn bộ model

    with engine.begin() as conn:
        conn.execute(text("create extension if not exists pgcrypto"))
        conn.execute(text("create extension if not exists vector"))
        # Supabase creates these roles in a managed project. The disposable
        # PostgreSQL container does not, but migration SQL legitimately
        # revokes/grants privileges to them. Create inert equivalents before
        # replaying migrations so the test schema matches the target platform.
        conn.execute(text("""
            do $$
            begin
              if not exists (select 1 from pg_roles where rolname = 'anon') then
                create role anon noinherit;
              end if;
              if not exists (select 1 from pg_roles where rolname = 'authenticated') then
                create role authenticated noinherit;
              end if;
              if not exists (select 1 from pg_roles where rolname = 'service_role') then
                create role service_role noinherit;
              end if;
            end
            $$;
        """))
    Base.metadata.create_all(engine)
    # Let SQLAlchemy create the model's sequence together with the table first.
    # Creating it before ``create_all`` makes PostgreSQL generate a second
    # implicit BIGSERIAL sequence (audit_log_id_seq1), which breaks teardown.
    # The fallback is only for a partially initialized disposable database.
    with engine.begin() as conn:
        conn.execute(text("create sequence if not exists public.audit_log_id_seq as bigint"))
    print("  bảng từ model: xong")

    # 2) Migration SQL thuần
    migrations_dir = pathlib.Path("/app/supabase/migrations")
    if not migrations_dir.exists():
        migrations_dir = pathlib.Path(__file__).resolve().parents[3] / "supabase" / "migrations"

    files = sorted(
        f for f in migrations_dir.glob("*.sql")
        if not f.name.endswith("_down.sql")
    )
    pending_files = list(files)
    for attempt in range(1, 6):
        failed_files = []
        for migration_file in pending_files:
            sql = migration_file.read_text(encoding="utf-8")
            try:
                with engine.begin() as conn:
                    conn.execute(text(sql))
            except Exception as error:
                failed_files.append((migration_file, str(error).splitlines()[0][:90]))
        print(f"  lần {attempt}: {len(pending_files) - len(failed_files)}/{len(pending_files)} chạy được")
        if not failed_files or len(failed_files) == len(pending_files):
            pending_files = [file for file, _ in failed_files]
            break
        pending_files = [file for file, _ in failed_files]
    for migration_file in pending_files:
        print(f"  VẪN LỖI  {migration_file.name}")

    # 3) Đối soát
    with engine.connect() as conn:
        for table_name in ("dossier_document_slots", "dossier_documents", "dossier_document_links",
                     "document_slot_change_requests", "document_slot_creation_requests",
                     "document_template_applicabilities"):
            exists = conn.execute(text("select to_regclass(:t)"), {"t": f"public.{table_name}"}).scalar()
            print(f"  {'CÓ ' if exists else 'THIẾU'} {table_name}")
        has_register_version = conn.execute(text(
            "select count(*) from information_schema.columns where table_name='service_lines'"
            " and column_name='document_register_version'")).scalar()
        print(f"  {'CÓ ' if has_register_version else 'THIẾU'} service_lines.document_register_version")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
