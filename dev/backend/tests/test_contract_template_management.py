"""Fault-driven service tests for contract template reservation/recovery.

Runs against isolated migrated PostgreSQL schemas via ``catalog_sessions``.
Storage is faked with a dictionary that enforces immutability; no fake
helpers are invoked in production code.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import OperationalError

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


def _good(text="v1"):
    return validate_template_file(make_docx(text), f"{text}.docx", None)


def _row(factory, template_id):
    with factory() as db:
        row = db.get(ContractTemplate, template_id)
        assert row is not None
        return {
            "id": row.id,
            "code": row.code,
            "version": row.version,
            "name": row.name,
            "description": row.description,
            "filename": row.template_file_name,
            "key": row.template_storage_key,
            "status": row.status,
            "upload_state": row.upload_state,
            "sha": row.content_sha256,
            "size": row.content_size,
            "intent": row.publish_requested,
        }


def test_new_attempt_after_failed_v2_uses_v3(catalog_sessions, immutable_store):
    good = _good("v1")
    with catalog_sessions() as db:
        parent_id = service.upload_new_template(
            db, good, "v1.docx", "TEST_CODE", "Test"
        ).template.id
    immutable_store.fail_next_put = True
    with catalog_sessions() as db, pytest.raises(HTTPException) as error:
        service.upgrade_version(db, parent_id, good, "v2.docx")
    assert error.value.status_code == 503
    with catalog_sessions() as db:
        failed = db.query(ContractTemplate).filter_by(code="TEST_CODE", version=2).one()
        assert failed.status == "draft"
        assert failed.upload_state in ("pending", "failed")
        v3 = service.upgrade_version(db, parent_id, good, "v3.docx").template
        assert v3.version == 3 and v3.status == "published"


def test_failed_reservation_survives_and_same_file_retry_completes(
    catalog_sessions, immutable_store
):
    good = _good("retry-same")
    with catalog_sessions() as db:
        parent_id = service.upload_new_template(
            db, good, "v1.docx", "RETRY_SAME", "Retry"
        ).template.id
    immutable_store.fail_next_put = True
    with catalog_sessions() as db, pytest.raises(HTTPException) as error:
        service.upgrade_version(db, parent_id, good, "v2.docx")
    assert error.value.status_code == 503
    detail = error.value.detail
    assert detail["template_id"] is not None and detail["version"] == 2
    with catalog_sessions() as db:
        pending = (
            db.query(ContractTemplate).filter_by(code="RETRY_SAME", version=2).one()
        )
        pending_id = pending.id
        assert pending.upload_state in ("pending", "failed")
    with catalog_sessions() as db:
        result = service.retry_upload(db, pending_id, good)
        assert result.template.version == 2
        assert result.template.upload_state == "ready"
        assert result.template.status == "published"
    assert immutable_store.objects[
        "contract-templates/RETRY_SAME/v2.docx"
    ] == good.content


def test_finalize_commit_failure_retry_verifies_bytes_without_overwrite(
    catalog_sessions, immutable_store, monkeypatch
):
    good = _good("finalize-fail")
    other = _good("finalize-other")
    with catalog_sessions() as db:
        parent_id = service.upload_new_template(
            db, good, "v1.docx", "FINALIZE_FAIL", "Fin"
        ).template.id
    from sqlalchemy.orm import Session as _Session

    orig_commit = _Session.commit
    calls = {"n": 0}

    def _flaky(self):
        calls["n"] += 1
        if calls["n"] == 2:
            raise OperationalError("SELECT", {}, Exception("injected finalize failure"))
        return orig_commit(self)

    monkeypatch.setattr(_Session, "commit", _flaky)
    with catalog_sessions() as db, pytest.raises(HTTPException) as error:
        service.upgrade_version(db, parent_id, good, "v2.docx")
    assert error.value.status_code == 503
    key = "contract-templates/FINALIZE_FAIL/v2.docx"
    assert immutable_store.objects[key] == good.content
    first_puts = list(immutable_store.put_calls)
    # Same-file retry converges on the same version without overwrite.
    with catalog_sessions() as db:
        result = service.retry_upload(db, error.value.detail["template_id"], good)
        assert result.template.version == 2
        assert result.template.upload_state == "ready"
    assert immutable_store.objects[key] == good.content
    # Different bytes are rejected, never adopted.
    with catalog_sessions() as db, pytest.raises(HTTPException) as conflict:
        service.retry_upload(db, result.template.id, other)
    assert conflict.value.status_code == 409
    assert immutable_store.objects[key] == good.content
    assert immutable_store.put_calls.count(key) >= first_puts.count(key)


def test_timeout_after_put_same_file_retry_converges(
    catalog_sessions, immutable_store
):
    good = _good("timeout")
    with catalog_sessions() as db:
        created = service.upload_new_template(
            db, good, "v1.docx", "TIMEOUT_PUT", "Timeout"
        ).template
        parent_id = created.id
    # Simulate provider stored bytes but client saw a timeout before finalize:
    # reserve v2 pending, store the object, leave DB pending.
    import src.contracts.template_service as _svc

    with catalog_sessions() as db:
        snapshot = _svc._reserve_upgrade(
            db,
            parent_id=parent_id,
            validated=good,
            filename="v2.docx",
            name=None,
            description=None,
            publish_immediately=True,
            actor_id=None,
        )
    immutable_store.objects[snapshot.storage_key] = good.content
    with catalog_sessions() as db:
        result = service.retry_upload(
            db,
            snapshot.id,
            good,
        )
        assert result.template.version == 2
        assert result.template.upload_state == "ready"
        assert result.template.status == "published"


def test_reserve_commit_failure_does_not_upload(
    catalog_sessions, immutable_store, monkeypatch
):
    good = _good("reserve-fail")
    from sqlalchemy.orm import Session as _Session

    orig_commit = _Session.commit
    calls = {"n": 0}

    def _flaky(self):
        calls["n"] += 1
        if calls["n"] == 1:
            raise OperationalError("SELECT", {}, Exception("injected reserve failure"))
        return orig_commit(self)

    monkeypatch.setattr(_Session, "commit", _flaky)
    with catalog_sessions() as db, pytest.raises(HTTPException) as error:
        service.upload_new_template(db, good, "v1.docx", "RESERVE_FAIL", "R")
    assert error.value.status_code == 503
    assert immutable_store.put_calls == []
    assert immutable_store.objects == {}


def test_failure_marker_after_finalize_keeps_ready(catalog_sessions, immutable_store):
    good = _good("mark-ready")
    with catalog_sessions() as db:
        created = service.upload_new_template(
            db, good, "v1.docx", "MARK_READY", "M"
        ).template
        template_id = created.id
    import src.contracts.template_service as _svc

    with catalog_sessions() as db:
        row = db.get(ContractTemplate, template_id)
        from src.contracts.template_service import _Reservation

        snapshot = _Reservation(
            id=row.id,
            code=row.code,
            version=row.version,
            storage_key=row.template_storage_key,
            sha256=row.content_sha256,
            size=row.content_size,
            publish_requested=bool(row.publish_requested),
        )
        _svc._mark_failed(db, snapshot)
    info = _row(catalog_sessions, template_id)
    assert info["upload_state"] == "ready"


def test_retry_ready_and_archived_preserves_lifecycle(
    catalog_sessions, immutable_store
):
    good = _good("lifecycle")
    with catalog_sessions() as db:
        created = service.upload_new_template(
            db, good, "v1.docx", "LIFECYCLE", "Life"
        ).template
        template_id = created.id
        original_filename = created.template_file_name
        original_name = created.name
    with catalog_sessions() as db:
        replay = service.retry_upload(db, template_id, good)
        assert replay.template.id == template_id
        assert replay.template.status == "published"
        assert replay.template.upload_state == "ready"
        assert replay.template.template_file_name == original_filename
        assert replay.template.name == original_name
        assert replay.publication_skipped is False
    with catalog_sessions() as db:
        service.upload_new_template(db, good, "v1.docx", "LIFECYCLE2", "Life2")
    with catalog_sessions() as db:
        archived = service.update_status(db, template_id, "archived")
        assert archived.template.status == "archived"
        assert archived.template.upload_state == "ready"
        assert archived.template.template_file_name == original_filename
    with catalog_sessions() as db:
        replay2 = service.retry_upload(db, template_id, good)
        assert replay2.template.status == "archived"
        assert replay2.template.upload_state == "ready"
        assert replay2.template.template_file_name == original_filename
        assert replay2.publication_skipped is False


def test_retry_mismatched_bytes_and_legacy_null_digest_409(
    catalog_sessions, immutable_store
):
    good = _good("match-a")
    other = _good("match-b")
    with catalog_sessions() as db:
        created = service.upload_new_template(
            db, good, "v1.docx", "MISMATCH", "Mis"
        ).template
        parent_id = created.id
    immutable_store.fail_next_put = True
    with catalog_sessions() as db, pytest.raises(HTTPException):
        service.upgrade_version(db, parent_id, good, "v2.docx")
    with catalog_sessions() as db:
        pending_id = (
            db.query(ContractTemplate).filter_by(code="MISMATCH", version=2).one().id
        )
    with catalog_sessions() as db, pytest.raises(HTTPException) as error:
        service.retry_upload(db, pending_id, other)
    assert error.value.status_code == 409
    # Legacy row without digest can never retry in place.
    with catalog_sessions() as db:
        legacy = ContractTemplate(
            id="legacy-nodigest",
            code="LEGACY_NODIGEST",
            version=1,
            name="Legacy",
            status="draft",
            upload_state="failed",
            template_storage_key="contract-templates/LEGACY_NODIGEST/v1.docx",
            content_sha256=None,
            content_size=None,
        )
        db.add(legacy)
        db.commit()
    with catalog_sessions() as db, pytest.raises(HTTPException) as legacy_error:
        service.retry_upload(db, "legacy-nodigest", good)
    assert legacy_error.value.status_code == 409


def test_stale_finalize_stays_draft_with_skipped(catalog_sessions, immutable_store):
    import src.contracts.template_service as _svc

    good_v2 = _good("stale-v2")
    good_v3 = _good("stale-v3")
    with catalog_sessions() as db:
        parent_id = service.upload_new_template(
            db, good_v2, "v1.docx", "STALE_FIN", "Stale"
        ).template.id
    with catalog_sessions() as db:
        slow = _svc._reserve_upgrade(
            db,
            parent_id=parent_id,
            validated=good_v2,
            filename="v2.docx",
            name=None,
            description=None,
            publish_immediately=True,
            actor_id=None,
        )
    with catalog_sessions() as db:
        fast = service.upgrade_version(db, parent_id, good_v3, "v3.docx").template
        assert fast.version == 3 and fast.status == "published"
    # Complete the slow upload through a fresh session (no ORM expired access).
    with catalog_sessions() as db:
        _svc._complete_upload(slow, good_v2.content, db)
    with catalog_sessions() as db:
        template, skipped = _svc._finalize(db, slow)
        assert template.version == 2
        assert template.upload_state == "ready"
        assert template.status == "draft"
        assert skipped is True
    with catalog_sessions() as db:
        published = (
            db.query(ContractTemplate)
            .filter_by(code="STALE_FIN", status="published")
            .all()
        )
        assert len(published) == 1 and published[0].version == 3


def test_archive_last_published_400_and_invalid_target_rejected(
    catalog_sessions, immutable_store
):
    good = _good("archive-last")
    with catalog_sessions() as db:
        created = service.upload_new_template(
            db, good, "v1.docx", "ARCH_LAST", "Arch"
        ).template
        template_id = created.id
    with catalog_sessions() as db, pytest.raises(HTTPException) as error:
        service.update_status(db, template_id, "archived")
    assert error.value.status_code == 400
    with catalog_sessions() as db, pytest.raises(HTTPException) as invalid:
        service.update_status(db, template_id, "draft")
    assert invalid.value.status_code == 400
    info = _row(catalog_sessions, template_id)
    assert info["status"] == "published"


def test_update_status_requires_ready(catalog_sessions, immutable_store):
    good = _good("not-ready")
    with catalog_sessions() as db:
        parent_id = service.upload_new_template(
            db, good, "v1.docx", "NOT_READY", "NR"
        ).template.id
    immutable_store.fail_next_put = True
    with catalog_sessions() as db, pytest.raises(HTTPException):
        service.upgrade_version(db, parent_id, good, "v2.docx")
    with catalog_sessions() as db:
        pending_id = (
            db.query(ContractTemplate).filter_by(code="NOT_READY", version=2).one().id
        )
    with catalog_sessions() as db, pytest.raises(HTTPException) as error:
        service.update_status(db, pending_id, "published")
    assert error.value.status_code == 409


def test_publish_archives_previous_same_code(catalog_sessions, immutable_store):
    good = _good("pub-arch")
    with catalog_sessions() as db:
        v1_id = service.upload_new_template(
            db, good, "v1.docx", "PUB_ARCH", "PA", publish_immediately=True
        ).template.id
    with catalog_sessions() as db:
        v2 = service.upgrade_version(
            db, v1_id, good, "v2.docx", publish_immediately=False
        ).template
        assert v2.status == "draft"
        v2_id = v2.id
    with catalog_sessions() as db:
        published = service.update_status(db, v2_id, "published").template
        assert published.status == "published"
    with catalog_sessions() as db:
        v1 = db.get(ContractTemplate, v1_id)
        assert v1.status == "archived"
        only = (
            db.query(ContractTemplate)
            .filter_by(code="PUB_ARCH", status="published")
            .all()
        )
        assert len(only) == 1 and only[0].id == v2_id


def test_get_template_bytes_roundtrip_and_guards(catalog_sessions, immutable_store):
    good = _good("bytes-rt")
    with catalog_sessions() as db:
        created = service.upload_new_template(
            db, good, "Mẫu tên.docx", "BYTES_RT", "Bytes"
        ).template
        template_id = created.id
    with catalog_sessions() as db:
        content, filename = service.get_template_bytes(db, template_id)
        assert content == good.content
        assert filename == "Mẫu tên.docx"
    with catalog_sessions() as db, pytest.raises(HTTPException) as missing:
        service.get_template_bytes(db, "no-such-id")
    assert missing.value.status_code == 404


def test_placeholder_catalog_has_supported_keys(catalog_sessions, immutable_store):
    catalog = service.get_placeholder_catalog()
    keys = {item["placeholder"] for group in catalog for item in group["items"]}
    expected = {
        "{{customer_name}}",
        "{{phone}}",
        "{{customer_phone}}",
        "{{address}}",
        "{{customer_address}}",
        "{{customer_email}}",
        "{{contract_id}}",
        "{{service_type}}",
        "{{date_signed}}",
        "{{due_date}}",
        "{{sales_source}}",
        "{{contract_value}}",
        "{{total_amount}}",
    }
    assert expected.issubset(keys)


def test_list_templates_groups_and_filters(catalog_sessions, immutable_store):
    good = _good("list-groups")
    with catalog_sessions() as db:
        service.upload_new_template(db, good, "v1.docx", "LIST_A", "List A")
        service.upload_new_template(
            db, good, "v1.docx", "LIST_B", "List B", publish_immediately=False
        )
    with catalog_sessions() as db:
        groups = service.list_templates(db, status="all")
        codes = {g["code"] for g in groups}
        assert {"LIST_A", "LIST_B"}.issubset(codes)
        published_only = service.list_templates(db, status="published")
        assert {g["code"] for g in published_only} == {"LIST_A"}
