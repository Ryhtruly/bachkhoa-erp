"""PostgreSQL regressions for runtime template identity and COMBO idempotence."""

from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import text

from src.dossiers.slot_requests import promote_template_for_combo


MIGRATION_DIR = next(
    candidate
    for parent in Path(__file__).resolve().parents
    if (candidate := parent / "supabase" / "migrations").is_dir()
)


def _migration_body(filename):
    lines = (MIGRATION_DIR / filename).read_text(encoding="utf-8").splitlines()
    return "\n".join(
        line for line in lines if line.strip().lower() not in {"begin;", "commit;"}
    )


@pytest.fixture
def template_identity_db(db_session):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("requires PostgreSQL expression indexes")

    savepoint = db_session.begin_nested()
    db_session.connection().exec_driver_sql(
        _migration_body("20260904100000_document_template_identity.sql")
    )
    suffix = uuid4().hex[:12]
    package_id = f"PKG-TPL-{suffix}"
    task_type_id = f"TYPE-TPL-{suffix}"
    db_session.execute(
        text("insert into public.service_packages (id, name) values (:id, :name)"),
        {"id": package_id, "name": f"Template identity {suffix}"},
    )
    db_session.execute(
        text("""
            insert into public.task_types (id, name, service_package_id, code)
            values (:id, :name, :package_id, :code)
        """),
        {
            "id": task_type_id,
            "name": f"Template identity {suffix}",
            "package_id": package_id,
            "code": f"TPL-{suffix}",
        },
    )
    try:
        yield db_session, package_id, task_type_id, suffix
    finally:
        savepoint.rollback()


def _insert_template(db, *, name, source, required=False):
    return db.execute(
        text("""
            insert into public.document_checklist_templates
                (id, task_type_id, name, source, is_required, needs_original,
                 default_quantity, sort_order, is_active)
            values (gen_random_uuid()::text, null, :name, :source, :required,
                    false, 1, 900, true)
            returning id
        """),
        {"name": name, "source": source, "required": required},
    ).scalar_one()


def _promote(db, package_id, task_type_id, *, name, source):
    return promote_template_for_combo(
        db,
        name=name,
        source=source,
        service_package_id=package_id,
        task_type_id=task_type_id,
        node_code="K06",
        actor_id="TEST-DIRECTOR",
    )


def test_forward_migration_preserves_historical_spacing_duplicates(db_session):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("requires PostgreSQL expression indexes")
    savepoint = db_session.begin_nested()
    try:
        db_session.connection().exec_driver_sql(
            _migration_body("20260904100000_document_template_identity_down.sql")
        )
        suffix = uuid4().hex[:12]
        first_id = _insert_template(
            db_session, name=f"Phiếu  lưu {suffix}", source="CO_QUAN"
        )
        second_id = _insert_template(
            db_session, name=f" PHIẾU LƯU   {suffix} ", source="CO_QUAN"
        )

        db_session.connection().exec_driver_sql(
            _migration_body("20260904100000_document_template_identity.sql")
        )

        rows = db_session.execute(
            text("""
                select id, is_identity_owner
                from public.document_checklist_templates
                where id in (:first_id, :second_id)
                order by id
            """),
            {"first_id": first_id, "second_id": second_id},
        ).mappings().all()
        assert len(rows) == 2
        assert sum(bool(row["is_identity_owner"]) for row in rows) == 1
    finally:
        savepoint.rollback()


def test_exact_spelling_with_different_source_creates_distinct_templates(template_identity_db):
    db, package_id, task_type_id, suffix = template_identity_db
    name = f"Biên bản bàn giao {suffix}"
    customer_template_id = _insert_template(db, name=name, source="KHACH_HANG")

    company_template_id = _promote(
        db, package_id, task_type_id, name=name, source="CONG_TY"
    )

    assert company_template_id != customer_template_id
    rows = db.execute(
        text("""
            select id, source from public.document_checklist_templates
            where lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) =
                  lower(regexp_replace(btrim(:name), '[[:space:]]+', ' ', 'g'))
            order by source
        """),
        {"name": name},
    ).mappings().all()
    assert [(row["id"], row["source"]) for row in rows] == [
        (company_template_id, "CONG_TY"),
        (customer_template_id, "KHACH_HANG"),
    ]
    index_definition = db.execute(
        text("""
            select indexdef from pg_indexes
            where schemaname = 'public'
              and indexname = 'document_checklist_templates_unique'
        """)
    ).scalar_one()
    assert "regexp_replace" in index_definition
    assert "source" in index_definition
    assert "WHERE is_identity_owner" in index_definition


def test_case_and_spacing_variants_reuse_one_template_and_one_combo(template_identity_db):
    db, package_id, task_type_id, suffix = template_identity_db
    original = f"Phiếu   giao nhận {suffix}"
    variant = f"  PHIẾU GIAO NHẬN   {suffix}  "
    existing_id = _insert_template(db, name=original, source="CONG_TY")

    first_id = _promote(
        db, package_id, task_type_id, name=variant, source="CONG_TY"
    )
    second_id = _promote(
        db, package_id, task_type_id, name=variant, source="CONG_TY"
    )

    assert first_id == existing_id
    assert second_id == existing_id
    assert db.execute(
        text("""
            select count(*) from public.document_checklist_templates
            where source = 'CONG_TY'
              and lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) =
                  lower(regexp_replace(btrim(:name), '[[:space:]]+', ' ', 'g'))
        """),
        {"name": original},
    ).scalar_one() == 1
    assert db.execute(
        text("""
            select count(*) from public.document_template_applicabilities
            where template_id = :template_id
              and applicability_type = 'COMBO'
              and service_package_id = :package_id
              and task_type_id = :task_type_id
              and node_code = 'K06'
        """),
        {
            "template_id": first_id,
            "package_id": package_id,
            "task_type_id": task_type_id,
        },
    ).scalar_one() == 1


def test_same_source_with_different_configuration_reuses_runtime_identity(template_identity_db):
    db, package_id, task_type_id, suffix = template_identity_db
    name = f"Biên bản cấu hình {suffix}"
    existing_id = _insert_template(
        db, name=name, source="CO_QUAN", required=True
    )

    promoted_id = _promote(
        db, package_id, task_type_id, name=name, source="CO_QUAN"
    )

    assert promoted_id == existing_id


def test_down_migration_preserves_distinct_sources_and_restores_legacy_index(
    template_identity_db,
):
    db, _, _, suffix = template_identity_db
    name = f"Biên bản rollback {suffix}"
    first_id = _insert_template(db, name=name, source="KHACH_HANG")
    second_id = _insert_template(db, name=name, source="CONG_TY")

    db.connection().exec_driver_sql(
        _migration_body("20260904100000_document_template_identity_down.sql")
    )

    rows = db.execute(
        text("""
            select id, name from public.document_checklist_templates
            where id in (:first_id, :second_id)
            order by id
        """),
        {"first_id": first_id, "second_id": second_id},
    ).mappings().all()
    assert len(rows) == 2
    assert len({row["name"] for row in rows}) == 2
    assert db.execute(
        text("""
            select count(*) from information_schema.columns
            where table_schema = 'public'
              and table_name = 'document_checklist_templates'
              and column_name = 'is_identity_owner'
        """)
    ).scalar_one() == 0
    index_definition = db.execute(
        text("""
            select indexdef from pg_indexes
            where schemaname = 'public'
              and indexname = 'document_checklist_templates_unique'
        """)
    ).scalar_one()
    assert "regexp_replace" not in index_definition
    assert "source" not in index_definition
