from dataclasses import dataclass
import re
from typing import Mapping


def _safe_segment(value: object) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", str(value)).strip("_")


@dataclass(frozen=True)
class FileReference:
    contract_id: str
    service_line_id: str
    task_node_id: str
    filename: str

    @classmethod
    def from_task_node(cls, task_node: Mapping[str, object], filename: str) -> "FileReference":
        required = ("id", "service_line_id", "contract_id")
        if any(not task_node.get(field) for field in required):
            raise ValueError("task node is missing ownership context")
        return cls(
            contract_id=_safe_segment(task_node["contract_id"]),
            service_line_id=_safe_segment(task_node["service_line_id"]),
            task_node_id=_safe_segment(task_node["id"]),
            filename=_safe_segment(filename) or "evidence",
        )

    @property
    def object_key(self) -> str:
        return (
            f"contracts/{self.contract_id}/service-lines/{self.service_line_id}/"
            f"nodes/{self.task_node_id}/{self.filename}"
        )
