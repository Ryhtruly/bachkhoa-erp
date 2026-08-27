import io

from src.db.models import Contract, ContractGeneratedDocument, ContractTemplate
from src.services import storage_service


def test_contract_template_persists_provider_neutral_private_object_key():
    assert ContractTemplate.template_storage_key.nullable is True
    assert ContractTemplate.storage_provider.default.arg == "s3-compatible"


def test_contract_has_nullable_selected_template_foreign_key():
    column = Contract.contract_template_id
    assert column.nullable is True
    assert next(iter(column.foreign_keys)).target_fullname == "contract_templates.id"
    assert ContractTemplate.template_storage_key.nullable is True


def test_generated_document_has_private_storage_key_and_contract_storage_helpers_are_scoped():
    assert ContractGeneratedDocument.output_storage_key.nullable is True
    assert storage_service.CONTRACT_DOCUMENT_PREFIX == 'contracts/'

    calls = []

    class Client:
        def head_bucket(self, Bucket):
            return None

        def upload_fileobj(self, file_obj, bucket, key, ExtraArgs):
            calls.append((file_obj.read(), bucket, key, ExtraArgs))

    original_client = storage_service._get_client
    storage_service._get_client = lambda: Client()
    try:
        key = storage_service.upload_contract_document(
            io.BytesIO(b'PK-docx'),
            'contracts/2004_BK-2026/dossier-documents/document-1/document.docx',
        )
    finally:
        storage_service._get_client = original_client

    assert key == 'contracts/2004_BK-2026/dossier-documents/document-1/document.docx'
    assert calls[0][0] == b'PK-docx'
    assert calls[0][3]['ContentType'] == storage_service.CONTRACT_TEMPLATE_CONTENT_TYPE


def test_generated_contract_helpers_reject_legacy_or_traversal_keys():
    for object_key in (
        'contracts/generated/2004_BK-2026/document.docx',
        'contracts/2004_BK-2026/dossier-documents/../document.docx',
    ):
        try:
            storage_service.upload_contract_document(io.BytesIO(b'PK-docx'), object_key)
        except ValueError:
            pass
        else:
            raise AssertionError(f'key was accepted: {object_key}')
