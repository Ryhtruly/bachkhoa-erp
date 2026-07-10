import boto3
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

def upload_file(file_obj, object_name: str) -> str:
    client = _get_client()
    client.upload_fileobj(file_obj, BUCKET, object_name)
    return f"{PUBLIC_URL}/{BUCKET}/{object_name}"

def delete_file(object_name: str):
    client = _get_client()
    client.delete_object(Bucket=BUCKET, Key=object_name)

def get_file_url(object_name: str) -> str:
    return f"{PUBLIC_URL}/{BUCKET}/{object_name}"
