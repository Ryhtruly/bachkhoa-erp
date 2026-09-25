import io
from zipfile import ZipFile

import pytest
from fastapi import HTTPException, UploadFile

from contract_template_test_support import make_docx
from src.contracts.template_files import (
    DOCX_MIME,
    MAX_TEMPLATE_BYTES,
    read_template_upload,
    validate_template_file,
)


def test_accepts_real_docx():
    content = make_docx()

    result = validate_template_file(content, "Mau hop dong.docx", None)

    assert result.content == content
    assert result.size == len(content)
    assert len(result.sha256) == 64


def test_rejects_zip_without_document_body():
    stream = io.BytesIO()
    with ZipFile(stream, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")

    with pytest.raises(HTTPException) as error:
        validate_template_file(
            stream.getvalue(),
            "fake.docx",
            "application/octet-stream",
        )

    assert error.value.status_code == 400


@pytest.mark.parametrize(
    ("filename", "content_type"),
    [
        ("template.pdf", DOCX_MIME),
        ("template.docx", "application/pdf"),
    ],
)
def test_rejects_wrong_extension_or_mime(filename, content_type):
    with pytest.raises(HTTPException) as error:
        validate_template_file(make_docx(), filename, content_type)

    assert error.value.status_code == 415


def test_rejects_oversized_upload():
    with pytest.raises(HTTPException) as error:
        validate_template_file(b"x" * (MAX_TEMPLATE_BYTES + 1), "x.docx", DOCX_MIME)

    assert error.value.status_code == 413


def test_upload_is_read_once_with_a_bound_and_closed():
    content = make_docx()

    class BoundedReader(io.BytesIO):
        def __init__(self, value):
            super().__init__(value)
            self.read_sizes = []
            self.was_closed = False

        def read(self, size=-1):
            self.read_sizes.append(size)
            return super().read(size)

        def close(self):
            self.was_closed = True
            super().close()

    stream = BoundedReader(content)
    upload = UploadFile(file=stream, filename="template.docx", headers={"content-type": DOCX_MIME})

    result = read_template_upload(upload)

    assert result.content == content
    assert stream.read_sizes == [MAX_TEMPLATE_BYTES + 1]
    assert stream.was_closed is True
