from io import BytesIO

import pytest
from docx import Document

from scripts import bootstrap_contract_template


def test_bootstrap_uploads_docx_and_returns_only_object_key(tmp_path, monkeypatch):
    template = Document()
    template.add_paragraph("{{contract_id}}")
    template_path = tmp_path / "contract.docx"
    template.save(template_path)
    uploaded = {}

    def fake_upload(file_obj, object_key):
        uploaded["bytes"] = file_obj.read()
        uploaded["key"] = object_key
        return object_key

    monkeypatch.setattr(bootstrap_contract_template, "contract_template_exists", lambda _key: False, raising=False)
    monkeypatch.setattr(bootstrap_contract_template, "upload_contract_template", fake_upload)

    result = bootstrap_contract_template.bootstrap_contract_template(
        template_path,
        "HOP_DONG_DICH_VU_KHUNG_BACH_KHOA/v1.docx",
    )

    assert result == "contract-templates/HOP_DONG_DICH_VU_KHUNG_BACH_KHOA/v1.docx"
    assert uploaded["key"] == result
    assert uploaded["bytes"].startswith(b"PK")


def test_bootstrap_refuses_to_overwrite_an_existing_versioned_template(tmp_path, monkeypatch):
    template = Document()
    template.add_paragraph("{{contract_id}}")
    template_path = tmp_path / "contract.docx"
    template.save(template_path)
    checked_keys = []
    uploaded = []

    def fake_exists(object_key):
        checked_keys.append(object_key)
        return True

    monkeypatch.setattr(
        bootstrap_contract_template,
        "contract_template_exists",
        fake_exists,
        raising=False,
    )
    monkeypatch.setattr(
        bootstrap_contract_template,
        "upload_contract_template",
        lambda *_args: uploaded.append(True),
    )

    with pytest.raises(FileExistsError, match="contract-templates/HOP_DONG_DICH_VU_KHUNG_BACH_KHOA/v1.docx"):
        bootstrap_contract_template.bootstrap_contract_template(
            template_path,
            "HOP_DONG_DICH_VU_KHUNG_BACH_KHOA/v1.docx",
        )

    assert checked_keys == ["contract-templates/HOP_DONG_DICH_VU_KHUNG_BACH_KHOA/v1.docx"]
    assert uploaded == []
