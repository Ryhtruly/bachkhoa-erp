import asyncio
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient

from src.db.database import get_db
from src.routes import routes_wiki
from src.routes import routes_employee_portal


async def _read_stream(response):
    return b"".join([chunk async for chunk in response.body_iterator])


def test_private_storage_routes_deny_unauthenticated_requests():
    app = FastAPI()
    app.include_router(routes_wiki.router)
    app.include_router(routes_employee_portal.router)
    app.dependency_overrides[get_db] = lambda: SimpleNamespace()

    with TestClient(app) as client:
        wiki_response = client.get("/api/wiki/download/missing-document")
        employee_file_response = client.get(
            "/api/employee-portal/file",
            params={"object_key": "avatars/missing.png"},
        )

    assert wiki_response.status_code == 401
    assert employee_file_response.status_code == 401


def test_download_document_streams_private_object_key_without_public_redirect(monkeypatch):
    document = SimpleNamespace(id="BK-HS001", link="wiki/BK-HS001/so-tay.pdf")
    read_sizes = []

    class ChunkedBody(BytesIO):
        def read(self, size=-1):
            read_sizes.append(size)
            assert size > 0, "Wiki downloads must not read the complete object into memory"
            return super().read(size)

    class Query:
        def filter(self, *_args):
            return self

        def first(self):
            return document

    db = SimpleNamespace(query=lambda *_args: Query())
    monkeypatch.setattr(
        routes_wiki,
        "get_file",
        lambda object_key: {"Body": ChunkedBody(b"private wiki content"), "ContentType": "application/pdf"},
        raising=False,
    )

    response = routes_wiki.download_document("BK-HS001", db, SimpleNamespace(id="user-1"))

    assert isinstance(response, StreamingResponse)
    assert asyncio.run(_read_stream(response)) == b"private wiki content"
    assert read_sizes and all(size > 0 for size in read_sizes)
    assert response.media_type == "application/pdf"


def test_download_document_rejects_a_non_wiki_object_key(monkeypatch):
    document = SimpleNamespace(id="BK-HS001", link="avatars/emp-1/avatar.png")

    class Query:
        def filter(self, *_args):
            return self

        def first(self):
            return document

    db = SimpleNamespace(query=lambda *_args: Query())
    monkeypatch.setattr(routes_wiki, "get_file", lambda _object_key: pytest.fail("must not read another prefix"))

    with pytest.raises(HTTPException) as raised:
        routes_wiki.download_document("BK-HS001", db, SimpleNamespace(id="user-1"))

    assert raised.value.status_code == 400


def test_download_document_preserves_and_reads_legacy_wiki_bucket_key(monkeypatch):
    legacy_key = "BK-HS001_so-tay.pdf"
    document = SimpleNamespace(
        id="BK-HS001",
        link=f"http://localhost:9000/wiki-files/{legacy_key}",
    )
    read_requests = []

    class Query:
        def filter(self, *_args):
            return self

        def first(self):
            return document

    db = SimpleNamespace(query=lambda *_args: Query())
    monkeypatch.setattr(
        routes_wiki,
        "get_file",
        lambda object_key, **kwargs: read_requests.append((object_key, kwargs))
        or {"Body": BytesIO(b"legacy wiki content"), "ContentType": "application/pdf"},
    )

    response = routes_wiki.download_document("BK-HS001", db, SimpleNamespace(id="user-1"))

    assert isinstance(response, StreamingResponse)
    assert asyncio.run(_read_stream(response)) == b"legacy wiki content"
    assert read_requests == [(legacy_key, {"legacy_wiki_document_id": "BK-HS001"})]


def test_upload_document_rejects_oversized_file_before_storage(monkeypatch):
    class Query:
        def filter(self, *_args):
            return self

        def first(self):
            return None

    db = SimpleNamespace(
        query=lambda *_args: Query(),
        rollback=lambda: None,
    )
    storage_calls = []
    monkeypatch.setattr(routes_wiki, "MAX_WIKI_UPLOAD_BYTES", 4, raising=False)
    monkeypatch.setattr(routes_wiki, "ensure_bucket", lambda: storage_calls.append("ensure"))
    monkeypatch.setattr(
        routes_wiki,
        "upload_file",
        lambda *_args: storage_calls.append("upload"),
    )

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            routes_wiki.upload_document(
                id="BK-HS001",
                title="Sổ tay",
                category="Sổ tay nhân sự",
                description=None,
                version=None,
                file=UploadFile(filename="too-large.pdf", file=BytesIO(b"12345")),
                db=db,
                user=SimpleNamespace(id="user-1"),
            )
        )

    assert raised.value.status_code == 413
    assert storage_calls == []


def test_employee_portal_private_file_streams_allowed_object_key(monkeypatch):
    monkeypatch.setattr(
        routes_employee_portal,
        "get_file",
        lambda object_key: {
            "Body": BytesIO(b"private avatar"),
            "ContentType": "image/png",
            "object_key": object_key,
        },
        raising=False,
    )

    response = routes_employee_portal.read_private_file(
        "avatars/emp-1/avatar.png",
        SimpleNamespace(id="user-1"),
    )

    assert response.body == b"private avatar"
    assert response.media_type == "image/png"


def test_employee_portal_private_file_rejects_finance_and_template_prefixes(monkeypatch):
    monkeypatch.setattr(routes_employee_portal, "get_file", lambda _key: pytest.fail("must reject before storage"), raising=False)

    for object_key in ("finance/payment-receipts/receipt.png", "contract-templates/HOP_DONG/v1.docx", "wiki/doc/file.pdf"):
        with pytest.raises(HTTPException) as raised:
            routes_employee_portal.read_private_file(object_key, SimpleNamespace(id="user-1"))
        assert raised.value.status_code == 400


def test_employee_portal_evidence_read_is_scoped_to_the_assigned_contract_task(monkeypatch):
    object_key = "contracts/HD-OWNER/service-lines/SL-1/nodes/NODE-1/evidence.pdf"
    current_user = {"value": SimpleNamespace(id="user-other", is_active=True, username="other")}

    class AssignmentResult:
        def __init__(self, allowed):
            self.allowed = allowed

        def first(self):
            return (1,) if self.allowed else None

    class AssignmentDb:
        def execute(self, _statement, params):
            return AssignmentResult(
                params == {
                    "user_id": "user-owner",
                    "contract_id": "HD-OWNER",
                    "service_line_id": "SL-1",
                    "task_node_id": "NODE-1",
                }
            )

    app = FastAPI()
    app.include_router(routes_employee_portal.router)
    app.dependency_overrides[routes_employee_portal.get_current_user] = lambda: current_user["value"]
    app.dependency_overrides[get_db] = AssignmentDb
    monkeypatch.setattr(routes_employee_portal, "check_user_permission", lambda *_args: False)
    monkeypatch.setattr(routes_employee_portal, "user_has_all_contract_read_access", lambda *_args: False)
    monkeypatch.setattr(
        routes_employee_portal,
        "get_file",
        lambda _key: {"Body": BytesIO(b"private evidence"), "ContentType": "application/pdf"},
    )

    with TestClient(app) as client:
        cross_user_response = client.get("/api/employee-portal/file", params={"object_key": object_key})
        current_user["value"] = SimpleNamespace(id="user-owner", is_active=True, username="owner")
        owner_response = client.get("/api/employee-portal/file", params={"object_key": object_key})

    assert cross_user_response.status_code == 403
    assert owner_response.status_code == 200
    assert owner_response.content == b"private evidence"


def test_unauthorized_evidence_upload_neither_writes_nor_deletes_storage(monkeypatch):
    class Rows:
        def __init__(self, row):
            self.row = row

        def mappings(self):
            return self

        def first(self):
            return self.row

        def scalar(self):
            return self.row

    class UnauthorizedDb:
        def execute(self, statement, _params):
            sql = str(statement)
            if "task_node_checklist_assignments" in sql:
                return Rows(None)
            if "from public.checklist_result_document_types" in sql:
                return Rows(False)
            if "from public.task_nodes n" in sql and "join public.service_lines sl" in sql:
                return Rows({"id": "NODE-1", "service_line_id": "SL-1", "contract_id": "HD-1"})
            raise AssertionError(f"Unexpected query: {sql}")

    writes = []
    deletes = []
    app = FastAPI()
    app.include_router(routes_employee_portal.router)
    app.dependency_overrides[routes_employee_portal.get_current_user] = lambda: SimpleNamespace(id="user-1")
    app.dependency_overrides[get_db] = UnauthorizedDb
    monkeypatch.setattr(
        routes_employee_portal,
        "_active_employee_for_user",
        lambda *_args: SimpleNamespace(id="employee-1", user_id="user-1"),
    )
    monkeypatch.setattr(routes_employee_portal, "ensure_bucket", lambda: None)
    monkeypatch.setattr(
        routes_employee_portal,
        "upload_file",
        lambda _body, object_key: writes.append(object_key) or object_key,
    )
    monkeypatch.setattr(routes_employee_portal, "delete_file", lambda object_key: deletes.append(object_key))

    with TestClient(app) as client:
        response = client.post(
            "/api/employee-portal/tasks/NODE-1/checklist/CHECK-1/submit",
            files={"file": ("evidence.pdf", b"private evidence", "application/pdf")},
        )

    assert response.status_code == 403
    assert writes == []
    assert deletes == []


def test_upload_document_streams_file_without_ram_buffering(monkeypatch):
    from src.core.auth import get_current_user
    writes = []
    enqueued_jobs = []

    class MockDb:
        def query(self, *_args):
            class Q:
                def filter(self, *_a):
                    return self
                def first(self):
                    return None
                def all(self):
                    return []
            return Q()
        def add(self, *_args):
            pass
        def commit(self):
            pass
        def rollback(self):
            pass

    monkeypatch.setattr("src.core.auth.check_user_permission", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(routes_wiki, "ensure_bucket", lambda: None)
    monkeypatch.setattr(routes_wiki, "upload_file", lambda f_obj, obj_name: writes.append((f_obj, obj_name)))
    monkeypatch.setattr(routes_wiki, "enqueue_indexing_job", lambda f_bytes, fname, doc_id, object_name: enqueued_jobs.append((f_bytes, fname, doc_id, object_name)) or True)
    monkeypatch.setattr(routes_wiki, "consume_rate_limit", lambda *_args, **_kwargs: (True, 0))
    monkeypatch.setattr(routes_wiki, "can_enqueue_indexing_job", lambda: True)
    monkeypatch.setattr(routes_wiki, "invalidate_cache", lambda *_args: None)

    app = FastAPI()
    app.include_router(routes_wiki.router)
    app.dependency_overrides[get_db] = lambda: MockDb()
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id="admin-1", is_active=True, username="admin")

    with TestClient(app) as client:
        res = client.post(
            "/api/wiki/upload",
            data={"id": "W-TEST-01", "title": "Tài liệu thử nghiệm", "category": "Quy trình ISO"},
            files={"file": ("test_doc.pdf", b"%PDF-1.4 sample content", "application/pdf")},
        )

    assert res.status_code == 200
    assert len(writes) == 1
    f_obj, obj_name = writes[0]
    assert obj_name == "wiki/W-TEST-01/test_doc.pdf"
    assert hasattr(f_obj, "read")
    assert len(enqueued_jobs) == 1
    f_bytes, fname, doc_id, job_obj_name = enqueued_jobs[0]
    assert f_bytes is None
    assert doc_id == "W-TEST-01"
    assert job_obj_name == "wiki/W-TEST-01/test_doc.pdf"


def test_upload_document_rejects_oversized_file(monkeypatch):
    from src.core.auth import get_current_user

    class MockDb:
        def query(self, *_args):
            class Q:
                def filter(self, *_a):
                    return self
                def first(self):
                    return None
                def all(self):
                    return []
            return Q()

    monkeypatch.setattr("src.core.auth.check_user_permission", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(routes_wiki, "consume_rate_limit", lambda *_args, **_kwargs: (True, 0))
    monkeypatch.setattr(routes_wiki, "can_enqueue_indexing_job", lambda: True)

    app = FastAPI()
    app.include_router(routes_wiki.router)
    app.dependency_overrides[get_db] = lambda: MockDb()
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id="admin-1", is_active=True, username="admin")

    oversized_bytes = b"small_payload_simulating_large_file"
    with TestClient(app) as client:
        monkeypatch.setattr(routes_wiki, "MAX_WIKI_UPLOAD_BYTES", 10)
        res = client.post(
            "/api/wiki/upload",
            data={"id": "W-OVERSIZE", "title": "Too big", "category": "ISO"},
            files={"file": ("big.pdf", oversized_bytes, "application/pdf")},
        )

    assert res.status_code == 413
    assert "vượt quá 25MB" in res.json().get("detail", "")


def test_update_document_success(monkeypatch):
    from src.core.auth import get_current_user

    doc = SimpleNamespace(
        id="W-EDIT-01",
        title="Old Title",
        category="Quy trình ISO",
        link="wiki/W-EDIT-01/old.pdf",
        description="Old desc",
        version="1.0",
        is_active=True,
    )

    class MockDb:
        def query(self, *_args):
            class Q:
                def filter(self, *_a):
                    return self
                def first(self):
                    return doc
            return Q()
        def add(self, *_args):
            pass
        def commit(self):
            pass
        def rollback(self):
            pass

    monkeypatch.setattr("src.core.auth.check_user_permission", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(routes_wiki, "invalidate_cache", lambda *_args: None)

    app = FastAPI()
    app.include_router(routes_wiki.router)
    app.dependency_overrides[get_db] = lambda: MockDb()
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id="admin-1", is_active=True, username="admin")

    with TestClient(app) as client:
        res = client.put(
            "/api/wiki/W-EDIT-01",
            data={
                "title": "New Title",
                "category": "Tài liệu đào tạo",
                "description": "Updated desc",
                "version": "2.0",
            },
        )

    assert res.status_code == 200
    assert res.json()["status"] == "success"
    assert doc.title == "New Title"
    assert doc.category == "Tài liệu đào tạo"
    assert doc.description == "Updated desc"


def test_delete_document_success(monkeypatch):
    from src.core.auth import get_current_user

    doc = SimpleNamespace(
        id="W-DEL-01",
        title="To be deleted",
        link="wiki/W-DEL-01/file.pdf",
        is_active=True,
    )
    deleted_storage = []
    deleted_chunks = []

    class MockDb:
        def query(self, *_args):
            class Q:
                def filter(self, *_a):
                    return self
                def first(self):
                    return doc
            return Q()
        def add(self, *_args):
            pass
        def commit(self):
            pass
        def rollback(self):
            pass

    monkeypatch.setattr("src.core.auth.check_user_permission", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(routes_wiki, "delete_file", lambda obj: deleted_storage.append(obj))
    monkeypatch.setattr(routes_wiki, "delete_document_chunks", lambda doc_id, _db: deleted_chunks.append(doc_id))
    monkeypatch.setattr(routes_wiki, "invalidate_cache", lambda *_args: None)

    app = FastAPI()
    app.include_router(routes_wiki.router)
    app.dependency_overrides[get_db] = lambda: MockDb()
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id="admin-1", is_active=True, username="admin")

    with TestClient(app) as client:
        res = client.delete("/api/wiki/W-DEL-01")

    assert res.status_code == 200
    assert res.json()["status"] == "success"
    assert doc.is_active is False
    assert deleted_storage == ["wiki/W-DEL-01/file.pdf"]
    assert deleted_chunks == ["W-DEL-01"]


def test_update_and_delete_return_404_when_document_missing(monkeypatch):
    from src.core.auth import get_current_user

    class MockDb:
        def query(self, *_args):
            class Q:
                def filter(self, *_a):
                    return self
                def first(self):
                    return None
            return Q()

    monkeypatch.setattr("src.core.auth.check_user_permission", lambda *_args, **_kwargs: True)

    app = FastAPI()
    app.include_router(routes_wiki.router)
    app.dependency_overrides[get_db] = lambda: MockDb()
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id="admin-1", is_active=True, username="admin")

    with TestClient(app) as client:
        res_put = client.put("/api/wiki/NON_EXISTENT", data={"title": "A", "category": "B"})
        res_del = client.delete("/api/wiki/NON_EXISTENT")

    assert res_put.status_code == 404
    assert res_del.status_code == 404

