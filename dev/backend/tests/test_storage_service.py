from dataclasses import replace
import importlib
from io import BytesIO

import pytest
from botocore.exceptions import ClientError

from src.services import storage_service


def test_object_storage_config_prefers_cloudflare_r2_settings_over_legacy_minio():
    config = storage_service.get_object_storage_config({
        "OBJECT_STORAGE_ENDPOINT": "https://abc123.r2.cloudflarestorage.com",
        "OBJECT_STORAGE_ACCESS_KEY": "r2-access-key",
        "OBJECT_STORAGE_SECRET_KEY": "r2-secret-key",
        "OBJECT_STORAGE_REGION": "auto",
        "OBJECT_STORAGE_CREATE_BUCKETS": "false",
        "MINIO_ENDPOINT": "http://minio:9000",
    })

    assert config.endpoint == "https://abc123.r2.cloudflarestorage.com"
    assert config.access_key == "r2-access-key"
    assert config.secret_key == "r2-secret-key"
    assert config.region == "auto"
    assert config.create_buckets is False
    assert config.allow_public_buckets is False


def test_managed_storage_defaults_to_no_bucket_or_public_policy_mutation():
    config = storage_service.get_object_storage_config({
        "OBJECT_STORAGE_ENDPOINT": "https://abc123.r2.cloudflarestorage.com",
    })

    assert config.create_buckets is False
    assert config.allow_public_buckets is False


def test_managed_storage_forces_bucket_creation_off_even_when_env_enables_it():
    config = storage_service.get_object_storage_config({
        "OBJECT_STORAGE_ENDPOINT": "https://abc123.r2.cloudflarestorage.com",
        "OBJECT_STORAGE_CREATE_BUCKETS": "true",
    })

    assert config.create_buckets is False


def test_local_minio_defaults_to_a_private_shared_bucket():
    config = storage_service.get_object_storage_config({})

    assert config.create_buckets is True
    assert config.allow_public_buckets is False


def test_s3_client_uses_the_parsed_object_storage_region(monkeypatch):
    captured = {}
    monkeypatch.setattr(storage_service, "_s3", None)
    monkeypatch.setattr(
        storage_service,
        "_storage_config",
        replace(storage_service._storage_config, region="auto"),
    )
    monkeypatch.setattr(storage_service.boto3, "client", lambda *_args, **kwargs: captured.update(kwargs) or object())

    storage_service._get_client()

    assert captured["region_name"] == "auto"


def test_bucket_setup_does_not_mutate_managed_production_storage(monkeypatch):
    calls = []

    class FakeS3:
        def head_bucket(self, **kwargs):
            calls.append(("head", kwargs))

        def create_bucket(self, **kwargs):
            calls.append(("create", kwargs))

    monkeypatch.setattr(
        storage_service,
        "_storage_config",
        replace(storage_service._storage_config, create_buckets=False),
    )
    monkeypatch.setattr(storage_service, "_s3", FakeS3())

    storage_service.ensure_bucket()

    assert calls == []


def test_public_policy_is_disabled_for_managed_production_storage(monkeypatch):
    calls = []

    class FakeS3:
        def put_bucket_policy(self, **kwargs):
            calls.append(kwargs)

    monkeypatch.setattr(
        storage_service,
        "_storage_config",
        replace(storage_service._storage_config, allow_public_buckets=False),
    )
    monkeypatch.setattr(storage_service, "_s3", FakeS3())

    storage_service.set_bucket_public()

    assert calls == []


def test_contract_template_storage_is_private_and_returns_docx_bytes(monkeypatch):
    uploaded = {}

    class FakeS3:
        def put_object(self, **kwargs):
            uploaded.update(kwargs)

        def get_object(self, **kwargs):
            uploaded["read_request"] = kwargs
            return {"Body": BytesIO(b"PK-template")}

    monkeypatch.setattr(storage_service, "_s3", FakeS3())
    object_key = "HOP_DONG_DICH_VU_KHUNG_BACH_KHOA/v2.docx"
    expected_key = "contract-templates/HOP_DONG_DICH_VU_KHUNG_BACH_KHOA/v2.docx"

    assert storage_service.upload_contract_template(BytesIO(b"PK-template"), object_key) == expected_key
    assert storage_service.get_contract_template(expected_key) == b"PK-template"
    assert uploaded["Bucket"] == storage_service.CONTRACT_TEMPLATE_BUCKET
    assert uploaded["ContentType"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert uploaded["Key"] == expected_key
    assert uploaded["Body"] == b"PK-template"
    assert uploaded["IfNoneMatch"] == "*"
    assert uploaded["read_request"] == {"Bucket": storage_service.CONTRACT_TEMPLATE_BUCKET, "Key": expected_key}


def test_contract_template_upload_reports_atomic_create_conflict(monkeypatch):
    class FakeS3:
        def put_object(self, **_kwargs):
            raise ClientError(
                {"Error": {"Code": "PreconditionFailed"}, "ResponseMetadata": {"HTTPStatusCode": 412}},
                "PutObject",
            )

    monkeypatch.setattr(storage_service, "_s3", FakeS3())

    with pytest.raises(FileExistsError, match="contract-templates/HOP_DONG/v1.docx"):
        storage_service.upload_contract_template(BytesIO(b"replacement"), "HOP_DONG/v1.docx")


def test_generic_upload_persists_an_object_key_not_a_public_url(monkeypatch):
    uploaded = {}

    class FakeS3:
        def upload_fileobj(self, file_obj, bucket, object_name):
            uploaded.update(bucket=bucket, object_name=object_name, content=file_obj.read())

    monkeypatch.setattr(storage_service, "_s3", FakeS3())

    result = storage_service.upload_file(BytesIO(b"avatar"), "avatars/emp-1/avatar.png")

    assert result == "avatars/emp-1/avatar.png"
    assert uploaded["object_name"] == result


def test_managed_storage_cannot_generate_a_permanent_public_object_url(monkeypatch):
    monkeypatch.setattr(
        storage_service,
        "_storage_config",
        replace(storage_service._storage_config, managed=True),
    )

    with pytest.raises(RuntimeError, match="private"):
        storage_service.get_file_url("avatars/emp-1/avatar.png")


def test_generic_storage_rejects_private_domain_prefix_bypass(monkeypatch):
    monkeypatch.setattr(storage_service, "_s3", object())

    with pytest.raises(ValueError, match="prefix"):
        storage_service.get_file("contract-templates/HOP_DONG/v1.docx")


def test_generic_contract_storage_rejects_legacy_and_traversal_shapes(monkeypatch):
    monkeypatch.setattr(storage_service, "_s3", object())

    for object_key in (
        "contracts/generated/HD-1/document.docx",
        "contracts/HD-1/dossier-documents/../document.pdf",
        "contracts/HD-1/unknown/document.pdf",
    ):
        with pytest.raises(ValueError, match="Contract object key"):
            storage_service.get_file(object_key)


def test_generic_reader_allows_only_an_explicit_matching_legacy_wiki_key(monkeypatch):
    reads = []

    class FakeS3:
        def get_object(self, **kwargs):
            reads.append(kwargs)
            return {"Body": BytesIO(b"legacy wiki")}

    monkeypatch.setattr(storage_service, "_s3", FakeS3())
    legacy_key = "BK-HS001_so-tay.pdf"

    stored = storage_service.get_file(legacy_key, legacy_wiki_document_id="BK-HS001")

    assert stored["Body"].read() == b"legacy wiki"
    assert reads == [{"Bucket": storage_service.BUCKET, "Key": legacy_key}]
    with pytest.raises(ValueError):
        storage_service.get_file(legacy_key)
    with pytest.raises(ValueError):
        storage_service.get_file(legacy_key, legacy_wiki_document_id="BK-HS002")


def test_contract_template_reader_enforces_its_prefix(monkeypatch):
    monkeypatch.setattr(storage_service, "_s3", object())

    with pytest.raises(ValueError, match="contract-templates/"):
        storage_service.get_contract_template("wiki/BK-HS001/so-tay.pdf")


def test_finance_helpers_reject_every_non_finance_namespace_before_storage(monkeypatch):
    calls = []

    class FakeS3:
        def upload_fileobj(self, *_args, **_kwargs):
            calls.append("upload")

        def get_object(self, **_kwargs):
            calls.append("get")
            return {"Body": BytesIO()}

        def delete_object(self, **_kwargs):
            calls.append("delete")

    monkeypatch.setattr(storage_service, "_s3", FakeS3())
    blocked_keys = (
        "wiki/BK-HS001/so-tay.pdf",
        "avatars/emp-1/avatar.png",
        "contracts/HD-1/service-lines/SL-1/nodes/N-1/evidence.pdf",
        "contract-templates/HOP_DONG/v1.docx",
    )

    for object_key in blocked_keys:
        with pytest.raises(ValueError, match="finance/"):
            storage_service.upload_finance_file(
                BytesIO(b"not finance"),
                object_key,
                content_type="application/octet-stream",
            )
        with pytest.raises(ValueError, match="finance/"):
            storage_service.get_finance_file(object_key)
        with pytest.raises(ValueError, match="finance/"):
            storage_service.delete_finance_file(object_key)

    assert calls == []


def test_generic_delete_rejects_private_domains_but_keeps_generic_cleanup(monkeypatch):
    deleted = []

    class FakeS3:
        def delete_object(self, **kwargs):
            deleted.append(kwargs)

    monkeypatch.setattr(storage_service, "_s3", FakeS3())

    for object_key in (
        "finance/payment-receipts/receipt.png",
        "contract-templates/HOP_DONG/v1.docx",
    ):
        with pytest.raises(ValueError, match="prefix"):
            storage_service.delete_file(object_key)

    storage_service.delete_file("avatars/emp-1/avatar.png")
    storage_service.delete_file("contracts/HD-1/service-lines/SL-1/nodes/N-1/evidence.pdf")

    assert deleted == [
        {"Bucket": storage_service.BUCKET, "Key": "avatars/emp-1/avatar.png"},
        {
            "Bucket": storage_service.BUCKET,
            "Key": "contracts/HD-1/service-lines/SL-1/nodes/N-1/evidence.pdf",
        },
    ]


def test_one_bucket_routes_finance_and_templates_by_prefix(monkeypatch):
    with monkeypatch.context() as environment:
        environment.setenv("OBJECT_STORAGE_ENDPOINT", "https://abc123.r2.cloudflarestorage.com")
        environment.setenv("OBJECT_STORAGE_BUCKET", "bachkhoa-erp-files")
        environment.delenv("OBJECT_STORAGE_FINANCE_BUCKET", raising=False)
        environment.delenv("OBJECT_STORAGE_CONTRACT_TEMPLATE_BUCKET", raising=False)
        configured = importlib.reload(storage_service)

        assert configured.BUCKET == "bachkhoa-erp-files"
        assert configured.FINANCE_BUCKET == "bachkhoa-erp-files"
        assert configured.CONTRACT_TEMPLATE_BUCKET == "bachkhoa-erp-files"

    importlib.reload(storage_service)


def test_local_minio_uses_one_bucket_for_all_storage_domains(monkeypatch):
    with monkeypatch.context() as environment:
        environment.delenv("OBJECT_STORAGE_ENDPOINT", raising=False)
        environment.delenv("OBJECT_STORAGE_BUCKET", raising=False)
        environment.setenv("MINIO_BUCKET", "wiki-files")
        environment.setenv("MINIO_FINANCE_BUCKET", "finance-files")
        environment.setenv("MINIO_CONTRACT_TEMPLATE_BUCKET", "contract-template-files")
        configured = importlib.reload(storage_service)

        assert configured.BUCKET == "wiki-files"
    assert configured.FINANCE_BUCKET == configured.BUCKET
    assert configured.CONTRACT_TEMPLATE_BUCKET == configured.BUCKET
    assert configured.CONTRACT_DOCUMENT_BUCKET == configured.BUCKET
    assert len({configured.BUCKET, configured.FINANCE_BUCKET, configured.CONTRACT_TEMPLATE_BUCKET, configured.CONTRACT_DOCUMENT_BUCKET}) == 1

    importlib.reload(storage_service)
