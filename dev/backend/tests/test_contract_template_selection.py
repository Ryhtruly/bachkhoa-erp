from types import SimpleNamespace

from unittest.mock import patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from src.contracts.schemas import ContractCreateSchema, ContractGenerateSchema
from src.contracts.services import ContractService
from src.db.models import Contract, ContractGeneratedDocument, ContractTemplate


class _Query:
    def __init__(self, records, selected_attribute=None):
        self.records = records
        self.selected_attribute = selected_attribute

    def filter(self, *criteria):
        for criterion in criteria:
            left = getattr(criterion, "left", None)
            right = getattr(criterion, "right", None)
            key = getattr(left, "key", None)
            value = getattr(right, "value", None)
            if key is not None:
                self.records = [record for record in self.records if getattr(record, key) == value]
        return self

    def first(self):
        return self.records[0] if self.records else None

    def all(self):
        if self.selected_attribute is not None:
            return [(getattr(record, self.selected_attribute),) for record in self.records]
        return list(self.records)


# Tạo Hạng mục giờ dựng luôn sổ giấy tờ trong cùng transaction. Bài test này chỉ
# soi việc CHỌN MẪU HỢP ĐỒNG — dựng sổ là mối quan tâm khác, có bộ test riêng.
# Tắt hẳn ở đây thay vì nặn phiên giả trả lời được mọi truy vấn của nó.
@pytest.fixture(autouse=True)
def _bo_qua_dung_so_giay_to():
    from src.dossiers import register

    # Phiên giả không trả lời được truy vấn dò schema, mà cổng V2 lại chặn trước
    # khi tạo Hạng mục. Nạp sẵn "đã có cột" để bài test này chạy đúng phần nó
    # quan tâm — cổng V2 có bộ test riêng ở test_schema_gate_v2.py.
    register.reset_schema_cache()
    register._SCHEMA_CO_VERSION.update({"value": True, "waiver": True})
    try:
        with patch("src.contracts.services._materialize_so_giay_to", return_value=0):
            yield
    finally:
        register.reset_schema_cache()


class _FakeResult:
    """Kết quả rỗng cho mọi truy vấn của phiên giả."""

    def mappings(self):
        return self

    def all(self):
        return []

    def first(self):
        return None

    def fetchall(self):
        return []

    def scalar(self):
        return None

    def __iter__(self):
        return iter(())


class _FakeSession:
    def __init__(self, template):
        self.bind = None
        self.records = {ContractTemplate: [template]}
        self.added = []
        self.committed = False

    def query(self, entity):
        model = getattr(entity, "class_", entity)
        selected_attribute = getattr(entity, "key", None) if model is not entity else None
        return _Query(list(self.records.get(model, [])), selected_attribute)

    def add(self, record):
        self.added.append(record)
        self.records.setdefault(type(record), []).append(record)

    def flush(self):
        pass

    def execute(self, *args, **kwargs):
        """Tạo Hạng mục giờ dựng luôn sổ giấy tờ trong cùng transaction, nên
        phiên giả phải trả lời được truy vấn. Bài test này chỉ soi việc chọn mẫu
        hợp đồng — trả rỗng là đủ, sổ ra 0 ô và đó vẫn là kết quả hợp lệ."""
        self.executed = getattr(self, "executed", [])
        self.executed.append(args[0] if args else None)
        return _FakeResult()

    def commit(self):
        self.committed = True

    def rollback(self):
        pass


@pytest.fixture
def generate_payload():
    def build(**overrides):
        values = {
            "contract_id": "",
            "task_id": None,
            "customer_name": "Nguyen Van A",
            "phone": "0900000000",
            "customer_email": "a@example.com",
            "service_type": "Do dac",
            "address": "1 Bach Khoa",
            "contract_value": 1_500_000,
            "date_signed": "2026-08-19",
            "due_date": "2026-08-31",
            "sales_source": "website",
            # Chế độ chọn giấy là trường BẮT BUỘC của luồng tạo Hạng mục V2.
            # Thiếu nó máy chủ trả 422 chứ không tự suy thành "dùng bộ mặc định".
            "document_selection_mode": "DEFAULT",
            "document_template_ids": None,
        }
        values.update(overrides)
        return SimpleNamespace(**values)

    return build


@pytest.fixture(autouse=True)
def isolate_service_side_effects(monkeypatch):
    monkeypatch.setattr(
        "src.contracts.services.sync_contract_read_model_after_write", lambda _db: None
    )
    monkeypatch.setattr(
        "src.contracts.services.telegram_service.notify_new_contract", lambda _payload: None
    )


def _draft_template():
    return ContractTemplate(
        id="draft-template", code="DRAFT", version=1, name="Nhap", status="draft"
    )


def _published_template():
    return ContractTemplate(
        id="do-dac-v1",
        code="MAU_HOP_DONG_DO_DAC_BACH_KHOA",
        version=1,
        name="Mau do dac",
        status="published",
        template_storage_key="contract-templates/MAU_HOP_DONG_DO_DAC_BACH_KHOA/v1.docx",
    )


@pytest.mark.parametrize(
    ("schema", "payload"),
    [
        (
            ContractCreateSchema,
            {
                "task_id": "task-1",
                "customer_name": "Nguyen Van A",
                "service_type": "Do dac",
                "contract_value": 1_500_000,
                "sales_source": "website",
            },
        ),
        (
            ContractGenerateSchema,
            {
                "task_id": "task-1",
                "customer_name": "Nguyen Van A",
                "phone": "0900000000",
                "service_type": "Do dac",
                "address": "1 Bach Khoa",
                "contract_value": 1_500_000,
                "date_signed": "2026-08-19",
                "due_date": "2026-08-31",
                "sales_source": "website",
            },
        ),
    ],
)
def test_contract_creation_schemas_require_template_selection(schema, payload):
    """Catches a request model allowing contract creation without a template ID."""
    with pytest.raises(ValidationError, match="contract_template_id"):
        schema(**payload)


def test_generate_contract_rejects_draft_template(generate_payload):
    """Catches removal of published-template validation before any write."""
    db = _FakeSession(_draft_template())

    with pytest.raises(HTTPException, match="Mẫu hợp đồng không tồn tại hoặc chưa được ban hành"):
        ContractService.generate_and_save_contract(
            db, generate_payload(contract_template_id="draft-template")
        )

    assert db.added == []


def test_create_contract_rejects_template_without_private_docx(generate_payload):
    """Catches removal of the required private-template-file validation."""
    template = _published_template()
    template.template_storage_key = ""
    db = _FakeSession(template)

    with pytest.raises(HTTPException, match="Mẫu hợp đồng chưa có tệp DOCX riêng tư"):
        ContractService.create_contract(
            db,
            generate_payload(
                contract_template_id=template.id,
                paid_amount=0.0,
            ),
        )

    assert db.added == []


def test_generate_contract_persists_selected_template(generate_payload):
    """Catches generated contracts or documents losing the selected template ID."""
    template = _published_template()
    db = _FakeSession(template)

    result = ContractService.generate_and_save_contract(
        db, generate_payload(contract_template_id=template.id)
    )

    contract = next(record for record in db.added if isinstance(record, Contract))
    document = next(record for record in db.added if isinstance(record, ContractGeneratedDocument))
    assert result["id"] == contract.id
    assert contract.contract_template_id == template.id
    assert document.template_id == template.id


def test_create_contract_persists_selected_template(generate_payload):
    """Catches ordinary contract creation losing the selected template ID."""
    template = _published_template()
    db = _FakeSession(template)

    result = ContractService.create_contract(
        db,
        generate_payload(
            contract_template_id=template.id,
            paid_amount=0.0,
        ),
    )

    contract = next(record for record in db.added if isinstance(record, Contract))
    assert result["id"] == contract.id
    assert contract.contract_template_id == template.id
