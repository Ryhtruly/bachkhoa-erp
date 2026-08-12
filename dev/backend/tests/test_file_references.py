import pytest

from src.files.references import FileReference
from src.routes.routes_employee_portal import evidence_file_reference


def test_evidence_key_is_scoped_to_its_contract_service_line_and_node():
    reference = FileReference.from_task_node(
        {"id": "node-7", "service_line_id": "line-4", "contract_id": "001/BK-2026"},
        "bien ban.pdf",
    )

    assert reference.object_key == (
        "contracts/001_BK-2026/service-lines/line-4/nodes/node-7/bien_ban.pdf"
    )


@pytest.mark.parametrize(
    "task_node",
    [
        {"id": "node-7", "service_line_id": "line-4"},
        {"id": "node-7", "contract_id": "001/BK-2026"},
    ],
)
def test_evidence_key_rejects_incomplete_ownership_context(task_node):
    with pytest.raises(ValueError, match="ownership context"):
        FileReference.from_task_node(task_node, "evidence.pdf")


class _Rows:
    def __init__(self, row):
        self.row = row

    def mappings(self):
        return self

    def first(self):
        return self.row


class _DbWithTaskOwnership:
    def execute(self, *_args, **_kwargs):
        return _Rows({"id": "node-7", "service_line_id": "line-4", "contract_id": "001/BK-2026"})


def test_route_resolves_contract_owned_reference_before_uploading():
    reference = evidence_file_reference(_DbWithTaskOwnership(), "node-7", "evidence.pdf")

    assert reference.object_key.startswith("contracts/001_BK-2026/service-lines/line-4/nodes/node-7/")
