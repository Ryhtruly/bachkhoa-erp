"""Upload an initial private contract template to the configured object store."""

import argparse
from pathlib import Path
from zipfile import is_zipfile

from botocore.exceptions import ClientError

from src.services.storage_service import (
    CONTRACT_TEMPLATE_BUCKET,
    CONTRACT_TEMPLATE_PREFIX,
    _get_client,
)


DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def contract_template_key(object_key: str) -> str:
    return object_key if object_key.startswith(CONTRACT_TEMPLATE_PREFIX) else f"{CONTRACT_TEMPLATE_PREFIX}{object_key.lstrip('/')}"


def bootstrap_contract_template(template_path: Path, object_key: str) -> str:
    if template_path.suffix.lower() != ".docx" or not is_zipfile(template_path):
        raise ValueError("Template phải là tệp DOCX hợp lệ.")
    object_key = contract_template_key(object_key)
    try:
        _get_client().put_object(
            Bucket=CONTRACT_TEMPLATE_BUCKET,
            Key=object_key,
            Body=template_path.read_bytes(),
            ContentType=DOCX_CONTENT_TYPE,
            IfNoneMatch="*",
        )
    except ClientError as error:
        error_code = error.response.get("Error", {}).get("Code")
        status_code = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if error_code in {"PreconditionFailed", "ConditionalRequestConflict"} or status_code in {412, 409}:
            raise FileExistsError(f"Immutable contract template already exists: {object_key}") from error
        raise
    return object_key


def main() -> None:
    parser = argparse.ArgumentParser(description="Upload a private contract DOCX template.")
    parser.add_argument("template_path", type=Path)
    parser.add_argument("object_key")
    args = parser.parse_args()
    print(bootstrap_contract_template(args.template_path, args.object_key))


if __name__ == "__main__":
    main()
