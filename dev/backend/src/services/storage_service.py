import boto3
import json
import os
import re
from dataclasses import dataclass
from botocore.config import Config
from botocore.exceptions import ClientError


@dataclass(frozen=True)
class ObjectStorageConfig:
    endpoint: str
    access_key: str
    secret_key: str
    region: str
    public_url: str
    create_buckets: bool
    allow_public_buckets: bool
    managed: bool


_TRUE_VALUES = {"1", "true", "yes", "on"}


def get_object_storage_config(environ: dict[str, str] | None = None) -> ObjectStorageConfig:
    """Load provider-neutral S3 settings with a local MinIO compatibility fallback."""
    values = os.environ if environ is None else environ
    using_managed_settings = bool(values.get("OBJECT_STORAGE_ENDPOINT", "").strip())
    create_buckets = (
        not using_managed_settings
        and values.get("OBJECT_STORAGE_CREATE_BUCKETS", "true").strip().lower() in _TRUE_VALUES
    )
    # Both managed storage and local MinIO are private. The frontend must use an
    # authenticated backend endpoint instead of receiving an object URL.
    allow_public_buckets = (
        not using_managed_settings
        and values.get("OBJECT_STORAGE_ALLOW_PUBLIC_BUCKETS", "false").strip().lower() in _TRUE_VALUES
    )
    return ObjectStorageConfig(
        endpoint=values.get("OBJECT_STORAGE_ENDPOINT") or values.get("MINIO_ENDPOINT", "http://localhost:9000"),
        access_key=values.get("OBJECT_STORAGE_ACCESS_KEY") or values.get("MINIO_ACCESS_KEY", "minioadmin"),
        secret_key=values.get("OBJECT_STORAGE_SECRET_KEY") or values.get("MINIO_SECRET_KEY", "minioadmin"),
        region=values.get("OBJECT_STORAGE_REGION") or "us-east-1",
        public_url=values.get("OBJECT_STORAGE_PUBLIC_URL") or values.get("MINIO_PUBLIC_URL", "http://localhost:9000"),
        create_buckets=create_buckets,
        allow_public_buckets=allow_public_buckets,
        managed=using_managed_settings,
    )


_storage_config = get_object_storage_config()
ENDPOINT = _storage_config.endpoint
ACCESS_KEY = _storage_config.access_key
SECRET_KEY = _storage_config.secret_key
REGION = _storage_config.region
BUCKET = (
    os.getenv("OBJECT_STORAGE_BUCKET", "bachkhoa-erp-files")
    if _storage_config.managed
    else os.getenv("MINIO_BUCKET", "wiki-files")
)
# Every object store uses one private bucket. Isolation is by validated key prefix:
# wiki/, finance/, contract-templates/, contracts/{hd}/..., and avatars/.
FINANCE_BUCKET = BUCKET
CONTRACT_TEMPLATE_BUCKET = BUCKET
PUBLIC_URL = _storage_config.public_url
# Generated contract DOCX files are dossier documents. The full key is validated
# below so a caller cannot smuggle the legacy contracts/generated/ layout back in.
CONTRACT_DOCUMENT_PREFIX = "contracts/"
CONTRACT_DOCUMENT_BUCKET = BUCKET
WIKI_PREFIX = "wiki/"
FINANCE_PREFIX = "finance/"
CONTRACT_TEMPLATE_PREFIX = "contract-templates/"
WORKFLOW_EVIDENCE_PREFIX = "contracts/"
AVATAR_PREFIX = "avatars/"
GENERIC_OBJECT_PREFIXES = (WIKI_PREFIX, WORKFLOW_EVIDENCE_PREFIX, AVATAR_PREFIX)
FINANCE_OBJECT_PREFIXES = (FINANCE_PREFIX,)
CONTRACT_TEMPLATE_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_SAFE_KEY_SEGMENT = r"[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?"
CONTRACT_OBJECT_KEY_PATTERN = re.compile(
    rf"^contracts/(?:"
    rf"{_SAFE_KEY_SEGMENT}/source-documents/{_SAFE_KEY_SEGMENT}/{_SAFE_KEY_SEGMENT}|"
    rf"{_SAFE_KEY_SEGMENT}/dossier-documents/{_SAFE_KEY_SEGMENT}/{_SAFE_KEY_SEGMENT}|"
    rf"{_SAFE_KEY_SEGMENT}/service-lines/{_SAFE_KEY_SEGMENT}/nodes/"
    rf"{_SAFE_KEY_SEGMENT}/{_SAFE_KEY_SEGMENT})$"
)
CONTRACT_DOSSIER_KEY_PATTERN = re.compile(
    rf"^contracts/{_SAFE_KEY_SEGMENT}/dossier-documents/"
    rf"{_SAFE_KEY_SEGMENT}/{_SAFE_KEY_SEGMENT}$"
)


def _require_contract_object_key(object_name: str) -> str:
    if not CONTRACT_OBJECT_KEY_PATTERN.fullmatch(object_name):
        raise ValueError("Contract object key has an invalid prefix or path shape")
    return object_name


def _require_prefix(object_name: str, prefixes: tuple[str, ...]) -> str:
    normalized = object_name.lstrip("/")
    if not any(normalized.startswith(prefix) for prefix in prefixes):
        expected = ", ".join(prefixes)
        raise ValueError(f"Object key must use an allowed prefix: {expected}")
    return normalized

_s3 = None

def _get_client():
    global _s3
    if _s3 is None:
        _s3 = boto3.client(
            "s3",
            endpoint_url=ENDPOINT,
            aws_access_key_id=ACCESS_KEY,
            aws_secret_access_key=SECRET_KEY,
            config=Config(s3={"addressing_style": "path"}),
            region_name=_storage_config.region,
        )
    return _s3

def ensure_bucket():
    if not _storage_config.create_buckets:
        return
    client = _get_client()
    try:
        client.head_bucket(Bucket=BUCKET)
    except Exception:
        client.create_bucket(Bucket=BUCKET)

def ensure_finance_bucket():
    """Create the private finance bucket without granting a public policy."""
    ensure_bucket()


def ensure_contract_template_bucket():
    """Create the private contract-template bucket only for local development."""
    ensure_bucket()

def ensure_contract_document_bucket():
    '''Create the private bucket for immutable generated contract DOCX files.'''
    ensure_bucket()


def set_bucket_public():
    if not _storage_config.allow_public_buckets:
        return
    client = _get_client()
    policy = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": "*",
            "Action": ["s3:GetObject"],
            "Resource": f"arn:aws:s3:::{BUCKET}/*",
        }]
    }
    try:
        client.put_bucket_policy(Bucket=BUCKET, Policy=json.dumps(policy))
    except Exception:
        pass

def upload_file(file_obj, object_name: str) -> str:
    object_name = _require_prefix(object_name, GENERIC_OBJECT_PREFIXES)
    if object_name.startswith(WORKFLOW_EVIDENCE_PREFIX):
        _require_contract_object_key(object_name)
    client = _get_client()
    client.upload_fileobj(file_obj, BUCKET, object_name)
    return object_name

def upload_finance_file(
    file_obj,
    object_name: str,
    *,
    content_type: str,
    metadata: dict[str, str] | None = None,
) -> str:
    """Upload an immutable receipt object to the private finance bucket."""
    object_name = _require_prefix(object_name, FINANCE_OBJECT_PREFIXES)
    client = _get_client()
    extra_args = {"ContentType": content_type}
    if metadata:
        extra_args["Metadata"] = {str(key): str(value) for key, value in metadata.items()}
    client.upload_fileobj(file_obj, FINANCE_BUCKET, object_name, ExtraArgs=extra_args)
    return object_name

def get_finance_file(object_name: str) -> dict:
    object_name = _require_prefix(object_name, FINANCE_OBJECT_PREFIXES)
    return _get_client().get_object(Bucket=FINANCE_BUCKET, Key=object_name)


def get_file(object_name: str, *, legacy_wiki_document_id: str | None = None) -> dict:
    """Đọc một object riêng tư từ bucket đang cấu hình.

    Trả về response của S3 (dict) — người gọi lấy nội dung bằng ["Body"].read().
    Trước đây module có HAI hàm cùng tên: một bản trả bytes và không kiểm prefix,
    một bản trả dict và có kiểm. Python lấy bản sau, nên bản trả bytes là code
    chết — và mọi chỗ gọi tưởng mình nhận bytes đều đang nhận dict.
    """
    if legacy_wiki_document_id is None:
        object_name = _require_prefix(object_name, GENERIC_OBJECT_PREFIXES)
        if object_name.startswith(WORKFLOW_EVIDENCE_PREFIX):
            _require_contract_object_key(object_name)
    else:
        object_name = object_name.lstrip("/")
        legacy_prefix = f"{legacy_wiki_document_id}_"
        if (
            "/" in object_name
            or not object_name.startswith(legacy_prefix)
            or object_name == legacy_prefix
        ):
            raise ValueError("Object key is not a matching legacy Wiki document key")
    return _get_client().get_object(Bucket=BUCKET, Key=object_name)


def upload_contract_template(file_obj, object_name: str) -> str:
    """Store a DOCX template privately; callers retain only the immutable object key."""
    object_name = object_name if object_name.startswith(CONTRACT_TEMPLATE_PREFIX) else f"{CONTRACT_TEMPLATE_PREFIX}{object_name.lstrip('/')}"
    object_name = _require_prefix(object_name, (CONTRACT_TEMPLATE_PREFIX,))
    try:
        _get_client().put_object(
            Bucket=CONTRACT_TEMPLATE_BUCKET,
            Key=object_name,
            Body=file_obj.read(),
            ContentType=CONTRACT_TEMPLATE_CONTENT_TYPE,
            IfNoneMatch="*",
        )
    except ClientError as error:
        error_code = error.response.get("Error", {}).get("Code")
        status_code = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if error_code in {"PreconditionFailed", "ConditionalRequestConflict"} or status_code in {409, 412}:
            raise FileExistsError(f"Immutable contract template already exists: {object_name}") from error
        raise
    return object_name


def get_contract_template(object_name: str) -> bytes:
    object_name = _require_prefix(object_name, (CONTRACT_TEMPLATE_PREFIX,))
    client = _get_client()
    try:
        response = client.get_object(Bucket=CONTRACT_TEMPLATE_BUCKET, Key=object_name)
    except ClientError as error:
        error_code = error.response.get("Error", {}).get("Code")
        status_code = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        legacy_bucket = os.getenv(
            "MINIO_CONTRACT_TEMPLATE_BUCKET",
            "contract-template-files",
        ).strip()
        if (
            _storage_config.managed
            or (error_code not in {"NoSuchKey", "NotFound", "404"} and status_code != 404)
            or not legacy_bucket
            or legacy_bucket == CONTRACT_TEMPLATE_BUCKET
        ):
            raise
        # Compatibility read for MinIO data created before local storage was
        # consolidated. All new writes still target the shared private bucket.
        response = client.get_object(Bucket=legacy_bucket, Key=object_name)
    return response["Body"].read()

def upload_contract_document(file_obj, object_name: str, *, metadata: dict[str, str] | None = None) -> str:
    """Store one immutable generated contract DOCX as a dossier document."""
    object_name = _require_prefix(object_name, (CONTRACT_DOCUMENT_PREFIX,))
    if not CONTRACT_DOSSIER_KEY_PATTERN.fullmatch(object_name):
        raise ValueError(
            "Generated contract key must be contracts/{hd}/dossier-documents/{document_id}/{name}"
        )
    ensure_contract_document_bucket()
    extra_args = {'ContentType': CONTRACT_TEMPLATE_CONTENT_TYPE}
    if metadata:
        extra_args['Metadata'] = {str(key): str(value) for key, value in metadata.items()}
    _get_client().upload_fileobj(file_obj, CONTRACT_DOCUMENT_BUCKET, object_name, ExtraArgs=extra_args)
    return object_name


def get_contract_document_file(object_name: str) -> dict:
    """Read a generated contract DOCX from the private dossier prefix."""
    object_name = _require_prefix(object_name, (CONTRACT_DOCUMENT_PREFIX,))
    if not CONTRACT_DOSSIER_KEY_PATTERN.fullmatch(object_name):
        raise ValueError(
            "Generated contract key must be contracts/{hd}/dossier-documents/{document_id}/{name}"
        )
    return _get_client().get_object(Bucket=CONTRACT_DOCUMENT_BUCKET, Key=object_name)


def delete_finance_file(object_name: str):
    object_name = _require_prefix(object_name, FINANCE_OBJECT_PREFIXES)
    _get_client().delete_object(Bucket=FINANCE_BUCKET, Key=object_name)

def file_exists(object_name: str) -> bool:
    client = _get_client()
    try:
        client.head_object(Bucket=BUCKET, Key=object_name)
        return True
    except Exception:
        return False

def find_file_by_prefix(prefix: str) -> str | None:
    """Find file in MinIO by prefix (e.g. 'BK-HS001_'). Returns object_name if found."""
    client = _get_client()
    try:
        response = client.list_objects_v2(Bucket=BUCKET, Prefix=prefix, MaxKeys=10)
        for obj in response.get('Contents', []):
            return obj['Key']
    except Exception:
        pass
    return None

def delete_file(object_name: str):
    object_name = _require_prefix(object_name, GENERIC_OBJECT_PREFIXES)
    if object_name.startswith(WORKFLOW_EVIDENCE_PREFIX):
        _require_contract_object_key(object_name)
    client = _get_client()
    client.delete_object(Bucket=BUCKET, Key=object_name)

def get_file_url(object_name: str) -> str:
    if _storage_config.managed or not _storage_config.allow_public_buckets:
        raise RuntimeError("Object storage is private; serve the object through an authenticated backend route.")
    object_name = _require_prefix(object_name, GENERIC_OBJECT_PREFIXES)
    if object_name.startswith(WORKFLOW_EVIDENCE_PREFIX):
        _require_contract_object_key(object_name)
    return f"{PUBLIC_URL}/{BUCKET}/{object_name}"
