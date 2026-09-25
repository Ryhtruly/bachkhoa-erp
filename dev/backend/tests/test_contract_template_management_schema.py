"""Actual-migration and constraint tests for contract template management.

Every test runs against an isolated ``tpl_test_<uuid>`` schema on the
validated disposable PostgreSQL target (see contract_template_test_support).
Nothing here may use the read-only ``db_session`` fixture for writes or the
shared ``db`` engine — writes go through the ``catalog_sessions`` factory.
"""

import pytest
from sqlalchemy.exc import IntegrityError

from contract_template_test_support import isolated_template_catalog, make_docx
from src.db.models import ContractTemplate

VALID_SHA256 = "a" * 64
MAX_CONTENT_SIZE = 20971520


def _seed_legacy(rows):
    def _callback(conn):
        for row in rows:
            key = (
                f"'{row['key']}'"
                if row.get("key") is not None
                else "NULL"
            )
            conn.exec_driver_sql(
                "INSERT INTO contract_templates "
                "(id, code, version, name, status, template_storage_key) "
                f"VALUES ('{row['id']}', '{row['code']}', {row['version']}, "
                f"'{row['name']}', '{row['status']}', {key})"
            )

    return _callback


def _add(factory, **kwargs):
    values = {
        "id": kwargs.pop("id", "tpl-1"),
        "code": kwargs.pop("code", "TEST_CODE"),
        "version": kwargs.pop("version", 1),
        "name": kwargs.pop("name", "Test template"),
        "status": kwargs.pop("status", "draft"),
    }
    values.update(kwargs)
    with factory.begin() as db:
        db.add(ContractTemplate(**values))


def _get(factory, template_id):
    with factory.begin() as db:
        row = db.get(ContractTemplate, template_id)
        assert row is not None
        return {
            "id": row.id,
            "code": row.code,
            "version": row.version,
            "name": row.name,
            "status": row.status,
            "upload_state": row.upload_state,
            "template_storage_key": row.template_storage_key,
            "content_sha256": row.content_sha256,
            "content_size": row.content_size,
            "publish_requested": row.publish_requested,
        }


def test_make_docx_returns_real_docx_bytes():
    pytest.importorskip("docx")
    content = make_docx()
    assert isinstance(content, bytes)
    assert content[:2] == b"PK"
    assert len(content) > 1000


LEGACY_ROWS = [
    {
        "id": "legacy-pub",
        "code": "LEGACY",
        "version": 1,
        "name": "Legacy published",
        "status": "published",
        "key": "contract-templates/LEGACY/v1.docx",
    },
    {
        "id": "legacy-arch",
        "code": "LEGACY_ARCH",
        "version": 1,
        "name": "Legacy archived",
        "status": "archived",
        "key": "contract-templates/LEGACY_ARCH/v1.docx",
    },
    {
        "id": "legacy-draft-nokey",
        "code": "LEGACY_DRAFT",
        "version": 1,
        "name": "Legacy draft",
        "status": "draft",
        "key": None,
    },
    {
        "id": "legacy-draft-key",
        "code": "LEGACY_DRAFT_KEY",
        "version": 1,
        "name": "Legacy draft with key",
        "status": "draft",
        "key": "contract-templates/LEGACY_DRAFT_KEY/v1.docx",
    },
]


def test_legacy_rows_keep_ids_keys_and_status_with_backfilled_states():
    with isolated_template_catalog(
        before_migration=_seed_legacy(LEGACY_ROWS)
    ) as factory:
        row = _get(factory, "legacy-pub")
        assert row["code"] == "LEGACY"
        assert row["status"] == "published"
        assert row["template_storage_key"] == "contract-templates/LEGACY/v1.docx"
        assert row["upload_state"] == "ready"
        assert row["publish_requested"] is False

        row = _get(factory, "legacy-arch")
        assert row["status"] == "archived"
        assert row["upload_state"] == "ready"

        row = _get(factory, "legacy-draft-nokey")
        assert row["status"] == "draft"
        assert row["template_storage_key"] is None
        assert row["upload_state"] == "failed"

        row = _get(factory, "legacy-draft-key")
        assert row["upload_state"] == "ready"


def test_draft_without_key_backfills_failed():
    with isolated_template_catalog(
        before_migration=_seed_legacy(
            [
                {
                    "id": "d1",
                    "code": "D",
                    "version": 1,
                    "name": "D",
                    "status": "draft",
                    "key": None,
                }
            ]
        )
    ) as factory:
        assert _get(factory, "d1")["upload_state"] == "failed"


def test_duplicate_published_codes_reject_migration():
    with pytest.raises(Exception, match="duplicate published template codes"):
        with isolated_template_catalog(
            before_migration=_seed_legacy(
                [
                    {
                        "id": f"dup-{i}",
                        "code": "DUP",
                        "version": i,
                        "name": f"Dup {i}",
                        "status": "published",
                        "key": f"contract-templates/DUP/v{i}.docx",
                    }
                    for i in (1, 2)
                ]
            )
        ):
            pass  # pragma: no cover


@pytest.mark.parametrize("status", ["published", "archived"])
def test_published_or_archived_without_key_rejects_migration(status):
    with pytest.raises(Exception, match="without storage keys"):
        with isolated_template_catalog(
            before_migration=_seed_legacy(
                [
                    {
                        "id": "nokey",
                        "code": "NK",
                        "version": 1,
                        "name": "No key",
                        "status": status,
                        "key": None,
                    }
                ]
            )
        ):
            pass  # pragma: no cover


def test_migration_rerun_is_idempotent():
    from contract_template_test_support import resolve_migration_path

    migration_sql = resolve_migration_path().read_text(encoding="utf-8")
    with isolated_template_catalog(
        before_migration=_seed_legacy(LEGACY_ROWS)
    ) as factory:
        with factory.begin() as db:
            raw = db.connection().connection.driver_connection
            cursor = raw.cursor()
            try:
                cursor.execute(migration_sql)
            finally:
                cursor.close()
        assert _get(factory, "legacy-pub")["upload_state"] == "ready"
        assert _get(factory, "legacy-draft-nokey")["upload_state"] == "failed"


def test_invalid_upload_state_is_rejected(catalog_sessions):
    with pytest.raises(IntegrityError):
        _add(
            catalog_sessions,
            id="bad-state",
            status="draft",
            upload_state="bogus",
            template_storage_key="contract-templates/TEST_CODE/v1.docx",
        )


def test_pending_published_template_is_rejected(catalog_sessions):
    with pytest.raises(IntegrityError):
        _add(
            catalog_sessions,
            id="pending-pub",
            status="published",
            upload_state="pending",
            template_storage_key="contract-templates/TEST_CODE/v1.docx",
        )


def test_ready_without_storage_key_is_rejected(catalog_sessions):
    with pytest.raises(IntegrityError):
        _add(
            catalog_sessions,
            id="ready-nokey",
            status="draft",
            upload_state="ready",
            template_storage_key=None,
        )


def test_published_without_storage_key_is_rejected(catalog_sessions):
    with pytest.raises(IntegrityError):
        _add(
            catalog_sessions,
            id="pub-nokey",
            status="published",
            upload_state="failed",
            template_storage_key=None,
        )


def test_two_published_versions_are_rejected(catalog_sessions):
    with catalog_sessions.begin() as db:
        db.add(
            ContractTemplate(
                id="one",
                code="TEST_CODE",
                version=1,
                name="One",
                status="published",
                upload_state="ready",
                template_storage_key="contract-templates/TEST_CODE/v1.docx",
            )
        )
    with pytest.raises(IntegrityError):
        with catalog_sessions.begin() as db:
            db.add(
                ContractTemplate(
                    id="two",
                    code="TEST_CODE",
                    version=2,
                    name="Two",
                    status="published",
                    upload_state="ready",
                    template_storage_key="contract-templates/TEST_CODE/v2.docx",
                )
            )


def test_pair_unique_still_enforced(catalog_sessions):
    _add(
        catalog_sessions,
        id="pair-1",
        code="PAIR",
        version=1,
        status="draft",
        upload_state="failed",
    )
    with pytest.raises(IntegrityError):
        _add(
            catalog_sessions,
            id="pair-2",
            code="PAIR",
            version=1,
            status="draft",
            upload_state="failed",
        )


def test_legacy_writer_with_key_defaults_to_ready(catalog_sessions):
    with catalog_sessions.begin() as db:
        db.add(
            ContractTemplate(
                id="legacy-writer",
                code="LEGACY_WRITE",
                version=1,
                name="Legacy writer",
                status="published",
                template_storage_key="contract-templates/LEGACY_WRITE/v1.docx",
            )
        )
    assert _get(catalog_sessions, "legacy-writer")["upload_state"] == "ready"


@pytest.mark.parametrize(
    ("case", "sha256", "size"),
    [
        ("sha-without-size", "a" * 64, None),
        ("size-without-sha", None, 123),
        ("non-hex", "not-hex", 123),
        ("upper-hex", "A" * 64, 123),
        ("short-hex", "a" * 63, 123),
        ("zero-size", "a" * 64, 0),
        ("over-limit", "a" * 64, MAX_CONTENT_SIZE + 1),
    ],
)
def test_content_hash_and_size_pairs_are_rejected(catalog_sessions, case, sha256, size):
    with pytest.raises(IntegrityError):
        _add(
            catalog_sessions,
            id=f"content-{case}",
            status="draft",
            upload_state="failed",
            content_sha256=sha256,
            content_size=size,
        )


def test_valid_content_hash_and_size_are_accepted(catalog_sessions):
    _add(
        catalog_sessions,
        id="content-ok",
        status="draft",
        upload_state="failed",
        content_sha256=VALID_SHA256,
        content_size=4096,
    )
    row = _get(catalog_sessions, "content-ok")
    assert row["content_sha256"] == VALID_SHA256
    assert row["content_size"] == 4096
