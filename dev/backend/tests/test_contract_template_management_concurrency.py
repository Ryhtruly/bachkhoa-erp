"""Real PostgreSQL concurrency tests for template reservation/lifecycle.

Every test uses independent sessions from the same isolated migrated factory.
Barriers sit before service invocation; storage Events force out-of-order
completion. No advisory-lock/count mocks and no SQLite fallback.
"""

import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from contract_template_test_support import ImmutableStore, make_docx
from src.contracts.template_files import validate_template_file
from src.contracts import template_service as svc_mod
from src.contracts.template_service import ContractTemplateService as service
from src.db.models import ContractTemplate


@pytest.fixture
def immutable_store(monkeypatch):
    store = ImmutableStore()
    monkeypatch.setattr(svc_mod, "upload_contract_template", store.put)
    monkeypatch.setattr(svc_mod, "inspect_contract_template_upload", store.inspect)
    monkeypatch.setattr(svc_mod, "get_contract_template", store.get)
    return store


def _good(text):
    return validate_template_file(make_docx(text), f"{text}.docx", None)


def _published_versions(factory, code):
    with factory() as db:
        return [
            (r.id, r.version)
            for r in db.query(ContractTemplate)
            .filter_by(code=code, status="published")
            .all()
        ]


def test_two_archives_on_different_codes_one_wins(catalog_sessions, immutable_store):
    good = _good("arch-race")
    with catalog_sessions() as db:
        id_a = service.upload_new_template(
            db, good, "v1.docx", "ARCH_RACE_A", "A"
        ).template.id
    with catalog_sessions() as db:
        id_b = service.upload_new_template(
            db, good, "v1.docx", "ARCH_RACE_B", "B"
        ).template.id
    barrier = threading.Barrier(2)
    outcomes = {}

    def _archive(key, template_id):
        barrier.wait(timeout=10)
        with catalog_sessions() as db:
            try:
                service.update_status(db, template_id, "archived")
                outcomes[key] = "ok"
            except HTTPException as exc:
                outcomes[key] = exc.status_code

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            fa = pool.submit(_archive, "a", id_a)
            fb = pool.submit(_archive, "b", id_b)
            fa.result(timeout=10)
            fb.result(timeout=10)
    finally:
        pass
    assert set(outcomes.values()) == {"ok", 400}
    with catalog_sessions() as db:
        remaining = (
            db.query(ContractTemplate).filter_by(status="published").all()
        )
        assert len(remaining) == 1


def test_two_publishes_same_code_serialized(catalog_sessions, immutable_store):
    good = _good("pub-race")
    with catalog_sessions() as db:
        v1_id = service.upload_new_template(
            db, good, "v1.docx", "PUB_RACE", "P", publish_immediately=False
        ).template.id
    with catalog_sessions() as db:
        v2_id = service.upgrade_version(
            db, v1_id, good, "v2.docx", publish_immediately=False
        ).template.id
    barrier = threading.Barrier(2)

    def _publish(template_id):
        barrier.wait(timeout=10)
        with catalog_sessions() as db:
            return service.update_status(db, template_id, "published").template.id

    with ThreadPoolExecutor(max_workers=2) as pool:
        fa = pool.submit(_publish, v1_id)
        fb = pool.submit(_publish, v2_id)
        fa.result(timeout=10)
        fb.result(timeout=10)
    with catalog_sessions() as db:
        published = (
            db.query(ContractTemplate)
            .filter_by(code="PUB_RACE", status="published")
            .all()
        )
        assert len(published) == 1


def test_two_upgrades_same_parent_get_distinct_versions(
    catalog_sessions, immutable_store
):
    good_a = _good("upgrade-A")
    good_b = _good("upgrade-B")
    with catalog_sessions() as db:
        parent_id = service.upload_new_template(
            db, good_a, "v1.docx", "UPGRADE_RACE", "U"
        ).template.id
    barrier = threading.Barrier(2)

    def _upgrade(validated, filename):
        barrier.wait(timeout=10)
        with catalog_sessions() as db:
            return service.upgrade_version(
                db, parent_id, validated, filename
            ).template.version

    with ThreadPoolExecutor(max_workers=2) as pool:
        fa = pool.submit(_upgrade, good_a, "va.docx")
        fb = pool.submit(_upgrade, good_b, "vb.docx")
        versions = sorted([fa.result(timeout=10), fb.result(timeout=10)])
    assert versions == [2, 3]
    assert immutable_store.objects[
        "contract-templates/UPGRADE_RACE/v2.docx"
    ] != immutable_store.objects["contract-templates/UPGRADE_RACE/v3.docx"]
    with catalog_sessions() as db:
        rows = (
            db.query(ContractTemplate)
            .filter_by(code="UPGRADE_RACE")
            .order_by(ContractTemplate.version)
            .all()
        )
        assert [r.version for r in rows] == [1, 2, 3]


def test_two_retries_same_failed_id_converge(catalog_sessions, immutable_store):
    good = _good("retry-race")
    with catalog_sessions() as db:
        parent_id = service.upload_new_template(
            db, good, "v1.docx", "RETRY_RACE", "R"
        ).template.id
    immutable_store.fail_next_put = True
    with catalog_sessions() as db, pytest.raises(HTTPException):
        service.upgrade_version(db, parent_id, good, "v2.docx")
    with catalog_sessions() as db:
        failed_id = (
            db.query(ContractTemplate).filter_by(code="RETRY_RACE", version=2).one().id
        )
    barrier = threading.Barrier(2)

    def _retry():
        barrier.wait(timeout=10)
        with catalog_sessions() as db:
            return service.retry_upload(db, failed_id, good).template.id

    with ThreadPoolExecutor(max_workers=2) as pool:
        fa = pool.submit(_retry)
        fb = pool.submit(_retry)
        assert fa.result(timeout=10) == failed_id
        assert fb.result(timeout=10) == failed_id
    with catalog_sessions() as db:
        rows = (
            db.query(ContractTemplate).filter_by(code="RETRY_RACE", version=2).all()
        )
        assert len(rows) == 1 and rows[0].upload_state == "ready"
    assert len(immutable_store.objects) == 2  # v1 + v2, no duplicate


def test_old_upload_finalizes_after_new_publication(catalog_sessions, immutable_store):
    good_slow = _good("slow-v2")
    good_fast = _good("fast-v3")
    with catalog_sessions() as db:
        parent_id = service.upload_new_template(
            db, good_slow, "v1.docx", "ORDER_RACE", "O"
        ).template.id
    # Deterministic versions: reserve the slow v2 upfront so the fast path
    # always becomes v3 regardless of thread scheduling.
    with catalog_sessions() as db:
        slow_snapshot = svc_mod._reserve_upgrade(
            db,
            parent_id=parent_id,
            validated=good_slow,
            filename="v2.docx",
            name=None,
            description=None,
            publish_immediately=True,
            actor_id=None,
        )
    gate = threading.Event()
    barrier = threading.Barrier(2)
    results = {}

    def _slow():
        barrier.wait(timeout=10)
        gate.wait(timeout=10)
        with catalog_sessions() as db:
            try:
                svc_mod._complete_upload(slow_snapshot, good_slow.content, db)
                template, skipped = svc_mod._finalize(db, slow_snapshot)
                results["slow"] = (template.status, skipped)
            except Exception as exc:
                results["slow"] = exc

    def _fast():
        barrier.wait(timeout=10)
        with catalog_sessions() as db:
            try:
                result = service.upgrade_version(db, parent_id, good_fast, "v3.docx")
                results["fast"] = (result.template.status, result.publication_skipped)
            except Exception as exc:
                results["fast"] = exc
            finally:
                gate.set()

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            fs = pool.submit(_slow)
            ff = pool.submit(_fast)
            fs.result(timeout=10)
            ff.result(timeout=10)
    finally:
        gate.set()
    assert results["fast"][0] == "published"
    assert results["slow"][0] == "draft" and results["slow"][1] is True
    with catalog_sessions() as db:
        published = (
            db.query(ContractTemplate)
            .filter_by(code="ORDER_RACE", status="published")
            .all()
        )
        assert len(published) == 1 and published[0].version == 3


def test_database_rejects_second_published_row_directly(
    catalog_sessions, immutable_store
):
    good = _good("direct-sql")
    with catalog_sessions() as db:
        service.upload_new_template(db, good, "v1.docx", "DIRECT_SQL", "D")
    with catalog_sessions() as db:
        with pytest.raises(IntegrityError):
            db.execute(
                text(
                    "INSERT INTO contract_templates "
                    "(id, code, version, name, status, upload_state, template_storage_key) "
                    "VALUES ('direct-sql-2', 'DIRECT_SQL', 2, 'Direct', 'published', "
                    "'ready', 'contract-templates/DIRECT_SQL/v2.docx')"
                )
            )
            db.commit()
        db.rollback()
