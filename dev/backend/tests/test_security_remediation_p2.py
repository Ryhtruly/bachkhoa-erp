import io
import zipfile
import pytest
from types import SimpleNamespace
from fastapi import HTTPException

from src.config.settings import validate_database_credentials, WEAK_DATABASE_PASSWORDS
from src.core.dlp import redact_sensitive_content
from src.services.wiki_rag_service import validate_docx_archive
from src.db.models import CashflowTransaction, Contract, ServiceLine
from src.finance.services import FinanceService


# ─── 1. Test Database Password Validation ─────────────────────────────

def test_database_credentials_rejection_in_production():
    """Weak or short passwords must be rejected in production/staging."""
    for weak in ["123", "postgres", "admin", "password", "root", "123456", "short"]:
        url = f"postgresql://postgres:{weak}@localhost:5432/bachkhoa_erp"
        with pytest.raises(RuntimeError) as exc_info:
            validate_database_credentials(url, "production")
        assert "quá yếu" in str(exc_info.value) or "ngắn hơn" in str(exc_info.value)

    # Empty password must be rejected
    empty_url = "postgresql://postgres@localhost:5432/bachkhoa_erp"
    with pytest.raises(RuntimeError) as exc_info:
        validate_database_credentials(empty_url, "production")
    assert "không được để trống" in str(exc_info.value)

    # Strong password must pass
    strong_url = "postgresql://postgres:Str0ng_P@ssw0rd_2026@localhost:5432/bachkhoa_erp"
    validate_database_credentials(strong_url, "production")


def test_database_credentials_allowed_in_development():
    """Development environment permits local default passwords."""
    dev_url = "postgresql://postgres:123@localhost:5432/bachkhoa_erp"
    validate_database_credentials(dev_url, "development")


# ─── 2. Test DLP Outbound Redaction ───────────────────────────────────

def test_dlp_redacts_credentials_and_tokens():
    raw = "My API key is sk-1234567890abcdef1234567890 and Bearer eyJhbGciOiJIUzI1NiJ9.test"
    sanitized = redact_sensitive_content(raw)
    assert "sk-1234567890abcdef1234567890" not in sanitized
    assert "[REDACTED_API_KEY]" in sanitized
    assert "[REDACTED_TOKEN]" in sanitized


def test_dlp_redacts_passwords_and_connection_strings():
    raw = "Connect to postgresql://admin:secret123@10.0.0.1:5432/db with password: my_super_secret"
    sanitized = redact_sensitive_content(raw)
    assert "secret123" not in sanitized
    assert "my_super_secret" not in sanitized
    assert "postgresql://[REDACTED]:[REDACTED]@" in sanitized


def test_dlp_redacts_pii_and_cards():
    raw = "Khách hàng có CCCD: 079198001234, SĐT: 0912345678 và thẻ: 4111 2222 3333 4444"
    sanitized = redact_sensitive_content(raw)
    assert "079198001234" not in sanitized
    assert "079******234" in sanitized
    assert "0912345678" not in sanitized
    assert "4111 2222 3333 4444" not in sanitized
    assert "[REDACTED_CARD]" in sanitized


# ─── 3. Test DOCX Pre-Parse Archive Validation ────────────────────────

def test_validate_docx_archive_rejects_excessive_entries():
    """Zip with more than 500 entries must be rejected."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for i in range(505):
            zf.writestr(f"file_{i}.txt", "content")
    buf.seek(0)
    with pytest.raises(ValueError) as exc:
        validate_docx_archive(buf.getvalue())
    assert "chứa quá nhiều" in str(exc.value)


def test_validate_docx_archive_rejects_zip_bomb_ratio():
    """Suspicious compression ratio (> 100x) must be rejected."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # 1MB of zeroes compresses to very few bytes (> 1000x ratio)
        zf.writestr("word/document.xml", b"\x00" * (1024 * 1024))
    buf.seek(0)
    compressed_bytes = buf.getvalue()
    with pytest.raises(ValueError) as exc:
        validate_docx_archive(compressed_bytes)
    assert "Tỷ lệ nén" in str(exc.value) or "vượt quá" in str(exc.value)


def test_validate_docx_archive_accepts_normal_docx():
    """Normal docx zip structure must pass."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", "<Types></Types>")
        zf.writestr("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>")
    buf.seek(0)
    validate_docx_archive(buf.getvalue())


# ─── 4. Test Customer -> Contract -> Project Linkage Integrity ────────

class _MockQuery:
    def __init__(self, item):
        self.item = item

    def filter(self, *_args):
        return self

    def first(self):
        return self.item


class _MockSession:
    def __init__(self, transaction, contract_map, service_line_map):
        self.transaction = transaction
        self.contract_map = contract_map
        self.service_line_map = service_line_map
        self.events = []

    def query(self, model):
        if model is CashflowTransaction:
            return _MockQuery(self.transaction)
        if model is Contract:
            class _ContractFinder:
                def __init__(self, mapping):
                    self.mapping = mapping
                def filter(self, *conds):
                    # extract id from condition if possible or return mock query
                    return self
                def first(self):
                    # Default return first contract in mapping
                    return next(iter(self.mapping.values()), None)
            return _ContractFinder(self.contract_map)
        if model is ServiceLine:
            class _LineFinder:
                def __init__(self, mapping):
                    self.mapping = mapping
                def filter(self, *conds):
                    return self
                def first(self):
                    return next(iter(self.mapping.values()), None)
            return _LineFinder(self.service_line_map)
        return _MockQuery(None)

    def commit(self):
        self.events.append("commit")

    def rollback(self):
        self.events.append("rollback")


class _FlexibleMockSession:
    def __init__(self, tx=None, contracts=None, service_lines=None):
        self.tx = tx
        self.contracts = contracts or {}
        self.service_lines = service_lines or {}
        self.committed = False
        self.added = []

    def query(self, model):
        model_entity = getattr(model, "class_", model)
        if model_entity is CashflowTransaction or model is CashflowTransaction:
            return _MockQuery(self.tx)
        if model_entity is Contract or model is Contract:
            return self._make_finder(self.contracts)
        if model_entity is ServiceLine or model is ServiceLine:
            return self._make_finder(self.service_lines)
        return _MockQuery(None)

    def _make_finder(self, lookup_dict):
        class _Finder:
            def __init__(self, items):
                self.items = items
                self.matched = list(items.values())

            def filter(self, *conds):
                for cond in conds:
                    str_cond = str(cond)
                    found = False
                    for key, obj in self.items.items():
                        if repr(key) in str_cond or f"'{key}'" in str_cond or f'"{key}"' in str_cond:
                            self.matched = [obj]
                            found = True
                            break
                        try:
                            if cond.right.value == key:
                                self.matched = [obj]
                                found = True
                                break
                        except Exception:
                            pass
                    if not found and self.items:
                        # If condition specifies an id not in items, empty matched list
                        self.matched = []
                return self

            def first(self):
                return self.matched[0] if self.matched else None

        return _Finder(lookup_dict)

    def commit(self):
        self.committed = True

    def rollback(self):
        pass

    def add(self, obj):
        self.added.append(obj)


def _make_sample_tx(contract_id="contract-A", project_id=None, status="PENDING"):
    return SimpleNamespace(
        id="PT-2026-001",
        status=status,
        transaction_date=None,
        contract_id=contract_id,
        project_id=project_id,
        transaction_type="INCOME",
        amount=100_000,
        category_code="THU_TIEN",
        payer_payee_name="Nguyen Van A",
        payment_method="CASH",
        description="Thu tien dot 1",
        scope="COMPANY",
        created_by_user_id="user-1",
    )


def test_update_cashflow_rejects_mismatched_customer(monkeypatch):
    """Updating cashflow to a contract of a different customer must fail with HTTP 400."""
    monkeypatch.setattr("src.finance.services.check_closed_period", lambda *_args: None)

    tx = _make_sample_tx(contract_id="contract-A")
    contract_a = SimpleNamespace(id="contract-A", customer_id="cust-1")
    contract_b = SimpleNamespace(id="contract-B", customer_id="cust-2")  # Different customer

    db = _FlexibleMockSession(tx=tx, contracts={"contract-A": contract_a, "contract-B": contract_b})
    payload = SimpleNamespace(
        contract_id="contract-B",
        customer_id="cust-1",
        category="Thu tiền",
        payer_payee="Nguyen Van A",
        payment_method="CASH",
        amount=100_000,
        transaction_date=None,
        description="Thu tien",
        scope="COMPANY",
    )

    with pytest.raises(HTTPException) as exc:
        FinanceService.update_cashflow(db, tx.id, payload)
    assert exc.value.status_code == 400
    assert "không thuộc về khách hàng" in exc.value.detail


def test_update_cashflow_project_only_mismatched_contract(monkeypatch):
    """Providing only project_id which belongs to contract-B when tx is linked to contract-A must fail."""
    monkeypatch.setattr("src.finance.services.check_closed_period", lambda *_args: None)

    tx = _make_sample_tx(contract_id="contract-A")
    contract_a = SimpleNamespace(id="contract-A", customer_id="cust-1")
    contract_b = SimpleNamespace(id="contract-B", customer_id="cust-1")
    line_b = SimpleNamespace(id="line-B", contract_id="contract-B")

    db = _FlexibleMockSession(
        tx=tx,
        contracts={"contract-A": contract_a, "contract-B": contract_b},
        service_lines={"line-B": line_b},
    )

    # Payload has project_id="line-B" only (no contract_id)
    payload = SimpleNamespace(
        project_id="line-B",
        category="Thu tiền",
        payer_payee="Nguyen Van A",
        payment_method="CASH",
        amount=100_000,
        transaction_date=None,
        description="Thu tien",
        scope="COMPANY",
    )

    with pytest.raises(HTTPException) as exc:
        FinanceService.update_cashflow(db, tx.id, payload)
    assert exc.value.status_code == 400
    assert "không khớp với hợp đồng" in exc.value.detail


def test_update_cashflow_project_only_missing_contract(monkeypatch):
    """Providing only project_id when tx has no contract must fail because project belongs to a contract."""
    monkeypatch.setattr("src.finance.services.check_closed_period", lambda *_args: None)

    tx = _make_sample_tx(contract_id=None)
    line_a = SimpleNamespace(id="line-A", contract_id="contract-A")

    db = _FlexibleMockSession(
        tx=tx,
        contracts={},
        service_lines={"line-A": line_a},
    )

    payload = SimpleNamespace(
        project_id="line-A",
        category="Thu tiền",
        payer_payee="Nguyen Van A",
        payment_method="CASH",
        amount=100_000,
        transaction_date=None,
        description="Thu tien",
        scope="COMPANY",
    )

    with pytest.raises(HTTPException) as exc:
        FinanceService.update_cashflow(db, tx.id, payload)
    assert exc.value.status_code == 400
    assert "phải được liên kết với hợp đồng này" in exc.value.detail


def test_update_cashflow_unlink_contract_while_project_linked(monkeypatch):
    """Unlinking contract (setting contract_id to empty) while project is still linked must fail."""
    monkeypatch.setattr("src.finance.services.check_closed_period", lambda *_args: None)

    tx = _make_sample_tx(contract_id="contract-A", project_id="line-A")
    line_a = SimpleNamespace(id="line-A", contract_id="contract-A")

    db = _FlexibleMockSession(
        tx=tx,
        contracts={},
        service_lines={"line-A": line_a},
    )

    # Payload explicitly unlinks contract by passing empty string
    payload = SimpleNamespace(
        contract_id="",
        category="Thu tiền",
        payer_payee="Nguyen Van A",
        payment_method="CASH",
        amount=100_000,
        transaction_date=None,
        description="Thu tien",
        scope="COMPANY",
    )

    with pytest.raises(HTTPException) as exc:
        FinanceService.update_cashflow(db, tx.id, payload)
    assert exc.value.status_code == 400
    assert "phải được liên kết với hợp đồng này" in exc.value.detail


def test_update_cashflow_project_only_valid_success(monkeypatch):
    """Updating project_id that correctly matches tx contract_id must succeed."""
    monkeypatch.setattr("src.finance.services.check_closed_period", lambda *_args: None)

    tx = _make_sample_tx(contract_id="contract-A", project_id=None)
    contract_a = SimpleNamespace(id="contract-A", customer_id="cust-1")
    line_a = SimpleNamespace(id="line-A", contract_id="contract-A")

    db = _FlexibleMockSession(
        tx=tx,
        contracts={"contract-A": contract_a},
        service_lines={"line-A": line_a},
    )

    payload = SimpleNamespace(
        project_id="line-A",
        category="Thu tiền",
        payer_payee="Nguyen Van A",
        payment_method="CASH",
        amount=100_000,
        transaction_date=None,
        description="Thu tien",
        scope="COMPANY",
    )

    res = FinanceService.update_cashflow(db, tx.id, payload)
    assert res.get("status") == "success"
    assert tx.project_id == "line-A"
    assert tx.contract_id == "contract-A"


# ─── 5. Test Wiki Indexing Queue Bounds and Rate Limiting ─────────────

def test_wiki_indexing_enqueue_and_queue_bounded(monkeypatch):
    """Enqueueing must return True under capacity and False when queue is full in both fallback and Redis mode."""
    import queue
    from src.services.wiki_rag_service import enqueue_indexing_job, INDEXING_QUEUE, MAX_QUEUE_SIZE, WIKI_INDEXING_REDIS_KEY
    from src.core.redis_utils import get_redis_client

    # 1. Test In-Memory fallback mode
    monkeypatch.setattr("src.services.wiki_rag_service.get_redis_client", lambda: None)
    while not INDEXING_QUEUE.empty():
        try:
            INDEXING_QUEUE.get_nowait()
            INDEXING_QUEUE.task_done()
        except queue.Empty:
            break

    enqueued = enqueue_indexing_job(b"test content", "test.txt", "doc-normal-test")
    assert enqueued is True

    # Fill queue to maximum capacity
    while not INDEXING_QUEUE.full():
        INDEXING_QUEUE.put_nowait((b"dummy", "dummy.txt", "dummy", None))

    overflow = enqueue_indexing_job(b"overflow content", "overflow.txt", "doc-overflow")
    assert overflow is False

    while not INDEXING_QUEUE.empty():
        try:
            INDEXING_QUEUE.get_nowait()
            INDEXING_QUEUE.task_done()
        except queue.Empty:
            break

    # 2. Test Redis persistent mode if redis is present in test environment
    monkeypatch.undo()
    redis = get_redis_client()
    if redis:
        redis.delete(WIKI_INDEXING_REDIS_KEY)
        assert enqueue_indexing_job(b"content", "file.txt", "doc-redis-test") is True
        for i in range(MAX_QUEUE_SIZE):
            redis.rpush(WIKI_INDEXING_REDIS_KEY, f"item-{i}")
        assert enqueue_indexing_job(b"content", "file.txt", "doc-redis-overflow") is False
        redis.delete(WIKI_INDEXING_REDIS_KEY)


def test_wiki_upload_rate_limiting():
    """User rate limit must allow up to limit and reject beyond."""
    from src.core.redis_utils import consume_rate_limit

    key = "test_rate_limit_wiki_user_unit_test"
    # First 5 calls allowed
    for i in range(1, 6):
        allowed, count = consume_rate_limit(key, limit=5, window_seconds=60)
        assert allowed is True
        assert count == i

    # 6th call rejected
    allowed, count = consume_rate_limit(key, limit=5, window_seconds=60)
    assert allowed is False
    assert count == 6


def test_can_enqueue_indexing_job_respects_capacity(monkeypatch):
    """can_enqueue_indexing_job must accurately reflect queue availability in both fallback and Redis modes."""
    import queue
    from src.services.wiki_rag_service import can_enqueue_indexing_job, INDEXING_QUEUE, MAX_QUEUE_SIZE, WIKI_INDEXING_REDIS_KEY
    from src.core.redis_utils import get_redis_client

    # 1. Fallback mode
    monkeypatch.setattr("src.services.wiki_rag_service.get_redis_client", lambda: None)
    while not INDEXING_QUEUE.empty():
        try:
            INDEXING_QUEUE.get_nowait()
            INDEXING_QUEUE.task_done()
        except queue.Empty:
            break

    assert can_enqueue_indexing_job() is True

    while not INDEXING_QUEUE.full():
        INDEXING_QUEUE.put_nowait((b"dummy", "dummy.txt", "doc-test", None))

    assert can_enqueue_indexing_job() is False

    while not INDEXING_QUEUE.empty():
        try:
            INDEXING_QUEUE.get_nowait()
            INDEXING_QUEUE.task_done()
        except queue.Empty:
            break

    assert can_enqueue_indexing_job() is True

    # 2. Redis mode
    monkeypatch.undo()
    redis = get_redis_client()
    if redis:
        redis.delete(WIKI_INDEXING_REDIS_KEY)
        assert can_enqueue_indexing_job() is True
        for i in range(MAX_QUEUE_SIZE):
            redis.rpush(WIKI_INDEXING_REDIS_KEY, f"item-{i}")
        assert can_enqueue_indexing_job() is False
        redis.delete(WIKI_INDEXING_REDIS_KEY)


def test_embed_text_strict_deadline_budget():
    """_embed_text must immediately abort with TimeoutError if deadline has passed or is within 0.2s budget."""
    import time
    from src.services.wiki_rag_service import _embed_text

    with pytest.raises(TimeoutError) as exc:
        _embed_text("test text", api_key="dummy_key", deadline=time.time() - 1.0)
    assert "deadline" in str(exc.value) or "exceeded" in str(exc.value)

    with pytest.raises(TimeoutError) as exc2:
        _embed_text("test text", api_key="dummy_key", deadline=time.time() + 0.1)
    assert "deadline" in str(exc2.value) or "exceeded" in str(exc2.value)


def test_embed_text_retries_on_httpx_request_error(monkeypatch):
    """_embed_text retries on httpx.RequestError (e.g. ConnectError) before raising."""
    import time
    import httpx
    from src.services.wiki_rag_service import _embed_text

    call_count = 0

    class MockClient:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def post(self, *args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise httpx.ConnectError("Connection failed")
            mock_resp = SimpleNamespace(
                status_code=200,
                json=lambda: {"embedding": {"values": [0.1, 0.2, 0.3]}}
            )
            return mock_resp

    monkeypatch.setattr(httpx, "Client", MockClient)
    res = _embed_text("sample content", api_key="valid_key", deadline=time.time() + 10.0)
    assert res == [0.1, 0.2, 0.3]
    assert call_count == 2


def test_cancel_indexing_job():
    """Cancelling a job marks its status as CANCELLED."""
    from src.services.wiki_rag_service import enqueue_indexing_job, cancel_indexing_job, INDEXING_JOBS

    doc_id = "doc-cancel-test-id"
    enqueue_indexing_job(b"content", "doc.txt", doc_id)
    cancel_indexing_job(doc_id)
    assert INDEXING_JOBS.get(doc_id, {}).get("status") == "CANCELLED"


def test_redis_lua_atomic_enqueue_invocation(monkeypatch):
    """enqueue_indexing_job must invoke redis.eval with atomic Lua script and parameters."""
    from src.services.wiki_rag_service import enqueue_indexing_job, _REDIS_ENQUEUE_LUA, WIKI_INDEXING_REDIS_KEY, MAX_QUEUE_SIZE
    import json

    eval_calls = []

    class MockRedisWithEval:
        def eval(self, script, numkeys, key, max_len, payload):
            eval_calls.append({
                "script": script,
                "numkeys": numkeys,
                "key": key,
                "max_len": max_len,
                "payload": json.loads(payload)
            })
            return 1 if len(eval_calls) == 1 else 0

    monkeypatch.setattr("src.services.wiki_rag_service.get_redis_client", lambda: MockRedisWithEval())

    # First call: queue has slot -> returns True
    res1 = enqueue_indexing_job(b"bytes1", "test1.pdf", "doc-lua-1", object_name="wiki/1/test1.pdf")
    assert res1 is True
    assert len(eval_calls) == 1
    assert eval_calls[0]["script"] == _REDIS_ENQUEUE_LUA
    assert eval_calls[0]["key"] == WIKI_INDEXING_REDIS_KEY
    assert eval_calls[0]["max_len"] == MAX_QUEUE_SIZE
    assert eval_calls[0]["payload"]["document_id"] == "doc-lua-1"

    # Second call: queue full (mock returns 0) -> returns False
    res2 = enqueue_indexing_job(b"bytes2", "test2.pdf", "doc-lua-2")
    assert res2 is False
    assert len(eval_calls) == 2


def test_recovery_retries_failed_jobs_after_cooldown(db, monkeypatch):
    """_recover_unindexed_documents skips jobs within cooldown, enqueues and increments retry_count after cooldown, and aborts after 3 retries."""
    import time
    from src.db.models import WikiDocument
    from src.services.wiki_rag_service import _recover_unindexed_documents, INDEXING_JOBS

    doc_id = "doc-test-fail-retry-orm"
    doc = WikiDocument(id=doc_id, title="Test Doc", category="Quy trình", link=f"wiki/{doc_id}/test.txt", is_active=True)
    db.add(doc)
    db.commit()

    class SessionProxy:
        def __init__(self, session):
            self._session = session
        def query(self, *args, **kwargs):
            return self._session.query(*args, **kwargs)
        def close(self):
            pass
        def get_bind(self):
            return self._session.get_bind()

    monkeypatch.setattr("src.services.wiki_rag_service.SessionLocal", lambda: SessionProxy(db))

    # 1. Job failed recently (< 60s cooldown): recovery must NOT enqueue
    INDEXING_JOBS[doc_id] = {
        "status": "FAILED",
        "error": "Timeout",
        "failed_at": time.time() - 10.0,
        "retry_count": 0
    }
    _recover_unindexed_documents(batch_size=1)
    assert INDEXING_JOBS[doc_id]["status"] == "FAILED"
    assert INDEXING_JOBS[doc_id]["retry_count"] == 0

    # 2. Cooldown elapsed (> 60s) with retry_count 0: recovery enqueues and increments to 1
    INDEXING_JOBS[doc_id]["failed_at"] = time.time() - 70.0
    _recover_unindexed_documents(batch_size=1)
    assert INDEXING_JOBS[doc_id]["status"] == "QUEUED"
    assert INDEXING_JOBS[doc_id]["retry_count"] == 1

    # 3. Simulate failure again after cooldown, reaching retry limit (retry_count = 3): must NOT enqueue
    INDEXING_JOBS[doc_id] = {
        "status": "FAILED",
        "error": "Timeout",
        "failed_at": time.time() - 70.0,
        "retry_count": 3
    }
    _recover_unindexed_documents(batch_size=1)
    assert INDEXING_JOBS[doc_id]["status"] == "FAILED"
    assert INDEXING_JOBS[doc_id]["retry_count"] == 3


def test_worker_lifecycle_preserves_retry_count_and_caps_at_three(db, monkeypatch):
    """Simulate full worker error lifecycle: PROCESSING keeps retry_count, error keeps retry_count, recovery increments across 3 cycles and stops."""
    import time
    from src.db.models import WikiDocument
    from src.services.wiki_rag_service import (
        _recover_unindexed_documents,
        _update_job_status,
        INDEXING_JOBS,
        enqueue_indexing_job,
    )

    doc_id = "doc-worker-failure-lifecycle"
    doc = WikiDocument(id=doc_id, title="Lifecycle Doc", category="Quy trình", link=f"wiki/{doc_id}/test.txt", is_active=True)
    db.add(doc)
    db.commit()

    class SessionProxy:
        def __init__(self, session):
            self._session = session
        def query(self, *args, **kwargs):
            return self._session.query(*args, **kwargs)
        def close(self):
            pass
        def get_bind(self):
            return self._session.get_bind()

    monkeypatch.setattr("src.services.wiki_rag_service.SessionLocal", lambda: SessionProxy(db))

    # Initial enqueue: status QUEUED, retry_count 0
    enqueue_indexing_job(None, "test.txt", doc_id, object_name=doc.link)
    assert INDEXING_JOBS[doc_id]["status"] == "QUEUED"
    assert INDEXING_JOBS[doc_id]["retry_count"] == 0

    # Worker picks up: PROCESSING must preserve retry_count = 0
    _update_job_status(doc_id, "PROCESSING", started_at=time.time())
    assert INDEXING_JOBS[doc_id]["status"] == "PROCESSING"
    assert INDEXING_JOBS[doc_id]["retry_count"] == 0

    # Worker failure: FAILED must preserve retry_count = 0
    _update_job_status(doc_id, "FAILED", error="Gemini API timeout", failed_at=time.time() - 70.0)
    assert INDEXING_JOBS[doc_id]["status"] == "FAILED"
    assert INDEXING_JOBS[doc_id]["retry_count"] == 0

    # Cycle 1: Recovery runs after cooldown -> increments retry_count to 1 and enqueues
    _recover_unindexed_documents(batch_size=1)
    assert INDEXING_JOBS[doc_id]["status"] == "QUEUED"
    assert INDEXING_JOBS[doc_id]["retry_count"] == 1

    # Cycle 1 worker: PROCESSING retains retry_count 1
    _update_job_status(doc_id, "PROCESSING", started_at=time.time())
    assert INDEXING_JOBS[doc_id]["status"] == "PROCESSING"
    assert INDEXING_JOBS[doc_id]["retry_count"] == 1

    # Cycle 1 worker fails: FAILED retains retry_count 1
    _update_job_status(doc_id, "FAILED", error="Network error 1", failed_at=time.time() - 70.0)
    assert INDEXING_JOBS[doc_id]["status"] == "FAILED"
    assert INDEXING_JOBS[doc_id]["retry_count"] == 1

    # Cycle 2: Recovery runs after cooldown -> increments retry_count to 2 and enqueues
    _recover_unindexed_documents(batch_size=1)
    assert INDEXING_JOBS[doc_id]["status"] == "QUEUED"
    assert INDEXING_JOBS[doc_id]["retry_count"] == 2

    # Cycle 2 worker: PROCESSING retains retry_count 2, then fails
    _update_job_status(doc_id, "PROCESSING", started_at=time.time())
    assert INDEXING_JOBS[doc_id]["retry_count"] == 2
    _update_job_status(doc_id, "FAILED", error="Network error 2", failed_at=time.time() - 70.0)
    assert INDEXING_JOBS[doc_id]["retry_count"] == 2

    # Cycle 3: Recovery runs after cooldown -> increments retry_count to 3 and enqueues
    _recover_unindexed_documents(batch_size=1)
    assert INDEXING_JOBS[doc_id]["status"] == "QUEUED"
    assert INDEXING_JOBS[doc_id]["retry_count"] == 3

    # Cycle 3 worker: PROCESSING retains retry_count 3, then fails
    _update_job_status(doc_id, "PROCESSING", started_at=time.time())
    assert INDEXING_JOBS[doc_id]["retry_count"] == 3
    _update_job_status(doc_id, "FAILED", error="Network error 3", failed_at=time.time() - 70.0)
    assert INDEXING_JOBS[doc_id]["retry_count"] == 3

    # Cycle 4: Recovery runs after cooldown -> retry_count == 3 reached maximum -> MUST NOT RE-ENQUEUE!
    _recover_unindexed_documents(batch_size=1)
    assert INDEXING_JOBS[doc_id]["status"] == "FAILED"
    assert INDEXING_JOBS[doc_id]["retry_count"] == 3


def test_extract_text_respects_deadline():
    """extract_text_from_file returns empty string if deadline has expired for both txt and pdf/docx."""
    import time
    from src.services.wiki_rag_service import extract_text_from_file

    # Expired deadline on txt must immediately return empty string
    res_txt = extract_text_from_file(b"Sample file text content", "sample.txt", deadline=time.time() - 1.0)
    assert res_txt == ""

    # Expired deadline on binary/pdf must also return empty string
    res_pdf = extract_text_from_file(b"%PDF-1.4 dummy", "sample.pdf", deadline=time.time() - 1.0)
    assert res_pdf == ""


def test_update_cashflow_real_orm_integration(db):
    """Integration test validating Cashflow update customer/contract/project integrity with real ORM."""
    from datetime import date
    from src.db.models import Customer, Contract, ServiceLine, CashflowTransaction
    from src.finance.schemas import CashflowUpdateIn

    cust1 = Customer(id="cust-orm-1", full_name="Customer 1", phone="0911111111")
    cust2 = Customer(id="cust-orm-2", full_name="Customer 2", phone="0922222222")
    c1 = Contract(id="HD-ORM-1", customer_id=cust1.id, total_value=10_000_000, date_signed=date(2026, 1, 1), status="Chờ thực hiện")
    c2 = Contract(id="HD-ORM-2", customer_id=cust2.id, total_value=20_000_000, date_signed=date(2026, 1, 1), status="Chờ thực hiện")
    line1 = ServiceLine(id="SL-ORM-1", contract_id=c1.id, service_package="Thẩm định giá", price=5_000_000)
    line2 = ServiceLine(id="SL-ORM-2", contract_id=c2.id, service_package="Đo vẽ", price=8_000_000)
    tx = CashflowTransaction(
        id="PT-ORM-001",
        transaction_type="INCOME",
        amount=1_000_000,
        category_code="THU_TIEN",
        payer_payee_name="Nguyen Van A",
        payment_method="CASH",
        status="PENDING",
        contract_id=c1.id,
        project_id=None,
    )
    db.add_all([cust1, cust2, c1, c2, line1, line2, tx])
    db.commit()

    # 1. Update with matching project_id only -> succeeds
    payload1 = CashflowUpdateIn(
        category="THU_TIEN",
        payer_payee="Nguyen Van A",
        payment_method="CASH",
        amount=1_000_000,
        project_id=line1.id,
    )
    res = FinanceService.update_cashflow(db, tx.id, payload1)
    assert res.get("status") == "success"
    db.refresh(tx)
    assert tx.project_id == line1.id
    assert tx.contract_id == c1.id

    # 2. Update with mismatched project_id belonging to c2 -> fails with HTTP 400
    payload2 = CashflowUpdateIn(
        category="THU_TIEN",
        payer_payee="Nguyen Van A",
        payment_method="CASH",
        amount=1_000_000,
        project_id=line2.id,
    )
    with pytest.raises(HTTPException) as exc:
        FinanceService.update_cashflow(db, tx.id, payload2)
    assert exc.value.status_code == 400
    assert "không khớp với hợp đồng" in exc.value.detail

    # 3. Explicit unlink of contract while project is linked -> fails with HTTP 400
    payload3 = CashflowUpdateIn(
        category="THU_TIEN",
        payer_payee="Nguyen Van A",
        payment_method="CASH",
        amount=1_000_000,
        contract_id="",
    )
    with pytest.raises(HTTPException) as exc:
        FinanceService.update_cashflow(db, tx.id, payload3)
    assert exc.value.status_code == 400
    assert "phải được liên kết với hợp đồng này" in exc.value.detail
