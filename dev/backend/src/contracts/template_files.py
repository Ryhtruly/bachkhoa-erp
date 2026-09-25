import hashlib
import io
from dataclasses import dataclass
from zipfile import BadZipFile, ZipFile

from docx import Document
from fastapi import HTTPException, UploadFile
from lxml.etree import XMLSyntaxError

from src.core.doc_generator import render_contract_document


MAX_TEMPLATE_BYTES = 20 * 1024 * 1024
MAX_EXPANDED_TEMPLATE_BYTES = 100 * 1024 * 1024
MAX_TEMPLATE_MEMBERS = 2048
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_ALLOWED_UPLOAD_TYPES = (None, "", DOCX_MIME, "application/octet-stream")


@dataclass(frozen=True)
class ValidatedTemplateFile:
    content: bytes
    sha256: str
    size: int


def validate_template_file(
    content: bytes,
    filename: str,
    content_type: str | None,
) -> ValidatedTemplateFile:
    if not filename.lower().endswith(".docx") or content_type not in _ALLOWED_UPLOAD_TYPES:
        raise HTTPException(415, "Chỉ hỗ trợ tệp DOCX")
    if len(content) > MAX_TEMPLATE_BYTES:
        raise HTTPException(413, "Tệp DOCX vượt quá 20 MiB")

    try:
        if not content.startswith(b"PK\x03\x04"):
            raise ValueError("Invalid ZIP signature")
        with ZipFile(io.BytesIO(content)) as archive:
            members = archive.infolist()
            required = {"[Content_Types].xml", "_rels/.rels", "word/document.xml"}
            if not required.issubset(archive.namelist()):
                raise ValueError("Incomplete DOCX package")
            if len(members) > MAX_TEMPLATE_MEMBERS:
                raise ValueError("DOCX package has too many members")
            if sum(item.file_size for item in members) > MAX_EXPANDED_TEMPLATE_BYTES:
                raise ValueError("Expanded DOCX exceeds limits")
            if any(item.flag_bits & 1 for item in members):
                raise ValueError("Encrypted package")
        Document(io.BytesIO(content))
        render_contract_document({}, "mau_hop_dong_v1", template_bytes=content)
    except (
        BadZipFile,
        OSError,
        ValueError,
        TypeError,
        RuntimeError,
        KeyError,
        AttributeError,
        XMLSyntaxError,
    ) as error:
        raise HTTPException(400, "Tệp Word DOCX không hợp lệ") from error

    return ValidatedTemplateFile(
        content=content,
        sha256=hashlib.sha256(content).hexdigest(),
        size=len(content),
    )


def read_template_upload(upload: UploadFile) -> ValidatedTemplateFile:
    try:
        content = upload.file.read(MAX_TEMPLATE_BYTES + 1)
        return validate_template_file(content, upload.filename or "", upload.content_type)
    finally:
        upload.file.close()
