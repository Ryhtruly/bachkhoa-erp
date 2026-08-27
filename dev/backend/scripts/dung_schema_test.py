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
    Base.metadata.create_all(engine)
    print("  bảng từ model: xong")

    # 2) Migration SQL thuần
    goc = pathlib.Path("/app/supabase/migrations")
    if not goc.exists():
        goc = pathlib.Path(__file__).resolve().parents[3] / "supabase" / "migrations"

    files = sorted(
        f for f in goc.glob("*.sql")
        if not f.name.endswith("_down.sql")
    )
    con_lai = list(files)
    for vong in range(1, 6):
        that_bai = []
        for duong_dan in con_lai:
            sql = duong_dan.read_text(encoding="utf-8")
            try:
                with engine.begin() as conn:
                    conn.execute(text(sql))
            except Exception as loi:
                that_bai.append((duong_dan, str(loi).splitlines()[0][:90]))
        print(f"  vòng {vong}: {len(con_lai) - len(that_bai)}/{len(con_lai)} chạy được")
        if not that_bai or len(that_bai) == len(con_lai):
            con_lai = [f for f, _ in that_bai]
            break
        con_lai = [f for f, _ in that_bai]
    for duong_dan in con_lai:
        print(f"  VẪN LỖI  {duong_dan.name}")

    # 3) Đối soát
    with engine.connect() as conn:
        for bang in ("dossier_document_slots", "dossier_documents", "dossier_document_links",
                     "document_slot_change_requests", "document_slot_creation_requests",
                     "document_template_applicabilities"):
            co = conn.execute(text("select to_regclass(:t)"), {"t": f"public.{bang}"}).scalar()
            print(f"  {'CÓ ' if co else 'THIẾU'} {bang}")
        co_ver = conn.execute(text(
            "select count(*) from information_schema.columns where table_name='service_lines'"
            " and column_name='document_register_version'")).scalar()
        print(f"  {'CÓ ' if co_ver else 'THIẾU'} service_lines.document_register_version")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
