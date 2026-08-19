from src.db.models import Contract, ContractTemplate


def test_contract_template_persists_provider_neutral_private_object_key():
    assert ContractTemplate.template_storage_key.nullable is True
    assert ContractTemplate.storage_provider.default.arg == "s3-compatible"


def test_contract_has_nullable_selected_template_foreign_key():
    column = Contract.contract_template_id
    assert column.nullable is True
    assert next(iter(column.foreign_keys)).target_fullname == "contract_templates.id"
    assert ContractTemplate.template_storage_key.nullable is True
