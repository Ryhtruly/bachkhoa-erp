import boto3
import json
import os
from botocore.config import Config
from urllib.parse import urljoin

ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://localhost:9000")
ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
BUCKET = os.getenv("MINIO_BUCKET", "wiki-files")
PUBLIC_URL = os.getenv("MINIO_PUBLIC_URL", "http://localhost:9000")

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
            region_name="us-east-1",
        )
    return _s3

def ensure_bucket():
    client = _get_client()
    try:
        client.head_bucket(Bucket=BUCKET)
    except Exception:
        client.create_bucket(Bucket=BUCKET)

def set_bucket_public():
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
    client = _get_client()
    client.upload_fileobj(file_obj, BUCKET, object_name)
    return f"{PUBLIC_URL}/{BUCKET}/{object_name}"

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
    client = _get_client()
    client.delete_object(Bucket=BUCKET, Key=object_name)

def get_file_url(object_name: str) -> str:
    return f"{PUBLIC_URL}/{BUCKET}/{object_name}"
