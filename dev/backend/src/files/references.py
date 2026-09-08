from dataclasses import dataclass
import re
from typing import Mapping
from uuid import uuid4


def _safe_segment(value: object) -> str:
    """Một đoạn đường dẫn an toàn: không dấu phân cách, không chuỗi chấm.

    Dấu "/" đã bị thay nên không thể thoát thư mục, nhưng để nguyên ".." trong
    khoá lưu trữ vẫn là mời gọi rắc rối với mọi công cụ đọc đường dẫn phía sau.
    """
    cleaned = re.sub(r"[^A-Za-z0-9_.-]", "_", str(value))
    cleaned = re.sub(r"\.{2,}", ".", cleaned)
    return cleaned.strip("._")


def _file_extension(filename: str) -> str:
    """Keep only a harmless extension; never put the uploaded basename in a key."""
    basename = str(filename or "").replace(chr(92), "/").rsplit("/", 1)[-1]
    if "." not in basename or basename.endswith("."):
        return ""
    extension = re.sub(r"[^A-Za-z0-9]", "", basename.rsplit(".", 1)[-1])
    return f".{extension.lower()}" if extension else ""


def _neutral_filename(filename: str, *, stable_id: object | None = None) -> str:
    """Create a non-PII leaf while retaining the extension for display/tooling."""
    token = _safe_segment(stable_id) if stable_id else uuid4().hex
    return f"document-{token}{_file_extension(filename)}"


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
            filename=_neutral_filename(filename).replace("document-", "evidence-", 1),
        )

    @property
    def object_key(self) -> str:
        return (
            f"contracts/{self.contract_id}/service-lines/{self.service_line_id}/"
            f"nodes/{self.task_node_id}/{self.filename}"
        )


# Giấy tờ của Hồ sơ pháp lý xếp theo GIAI ĐOẠN, không theo task_node.
#
# Hồ sơ là một-trên-một với Hạng mục, còn bước thì có thể chạy lại (rollback) hay
# nộp lại nhiều lần. Gắn file vào node id sẽ làm giấy tờ của cùng một hồ sơ nằm
# rải rác nhiều thư mục, tìm lại rất khổ. Xếp theo giai đoạn thì mỗi hạng mục
# đúng một thư mục, mở ra là thấy trọn bộ:
#
#   contracts/001_BK-2026/service-lines/{sl}/
#       nodes/{node}/...        minh chứng checklist của từng bước
#       dossier/soan-ho-so/     K04 — giấy tờ sau khi soạn
#       dossier/nop-co-quan/    K05 — biên nhận, giấy hẹn
#       dossier/ket-qua/        K06 — sổ đỏ, biên bản bàn giao
#
# Tài liệu NGUỒN của khách nằm ở tầng Hợp đồng (xem ContractFileReference), vì
# CCCD và sổ đỏ của cùng một chủ đất là MỘT: hợp đồng ba hạng mục thì scan một
# lần dùng chung, không bắt khách đưa ba lần.
#
# Prefix vẫn là "contracts/" nên chạy được nguyên vẹn trên R2 production, nơi
# mọi thứ nằm chung MỘT bucket private và chỉ phân tách bằng prefix.
DOSSIER_STAGES = (
    "ho-so-goc",
    "do-hien-truong",
    "chuan-hoa-ky-thuat",
    "soan-ho-so",
    "nop-noi-nghiep",
    "nop-co-quan",
    "ket-qua",
)

STAGE_BY_NODE_CODE = {
    # K02 sinh tài liệu THÔ tại hiện trường; K03 sinh bản ĐÃ XỬ LÝ. Để chung một
    # giai đoạn thì sáu tháng sau đọc lại hồ sơ không phân biệt được cái nào là
    # bản gốc, cái nào là bản đã chuẩn hoá.
    "K02": "do-hien-truong",
    "K03": "chuan-hoa-ky-thuat",
    "K04": "soan-ho-so",
    # K05a nộp nội nghiệp trong công ty, chưa ra cơ quan — giai đoạn riêng.
    "K05a": "nop-noi-nghiep",
    "K05b": "nop-co-quan",
    "K06": "ket-qua",
}

# Xem ghi chú ở workflow_runtime: mã bước có chữ thường nên mọi nơi tra bảng này
# phải đi qua chỉ mục viết hoa, không tra thẳng STAGE_BY_NODE_CODE.
STAGE_BY_UPPER_NODE_CODE = {
    ma.upper(): giai_doan for ma, giai_doan in STAGE_BY_NODE_CODE.items()
}


@dataclass(frozen=True)
class ContractFileReference:
    """Tài liệu NGUỒN của Hợp đồng — khoá theo document_id, không theo loại giấy.

        contracts/001_BK-2026/source-documents/{document_id}/{neutral_filename}

    Vì sao không đặt theo tên loại giấy: phân loại là việc của K01 và có thể đổi
    (nhân viên xếp nhầm, hoặc Giám đốc đổi tên mục trong mẫu). Nếu đường dẫn mang
    tên loại giấy thì mỗi lần phân loại lại là file nằm sai thư mục — hoặc phải
    copy object, đúng thứ nghiệp vụ cấm. Khoá theo document_id thì file nằm yên
    một chỗ suốt đời, phân loại chỉ là bản ghi trỏ tới nó.

    Cũng vì thế khoá không chứa tên khách, CCCD hay số điện thoại.
    """

    contract_id: str
    document_id: str
    filename: str

    @classmethod
    def build(
        cls, *, contract_id: object, document_id: object, filename: str
    ) -> "ContractFileReference":
        if not contract_id or not document_id:
            raise ValueError("contract source document is missing ownership context")
        return cls(
            contract_id=_safe_segment(contract_id),
            document_id=_safe_segment(document_id),
            filename=_neutral_filename(filename, stable_id=document_id),
        )

    @property
    def object_key(self) -> str:
        return (
            f"contracts/{self.contract_id}/source-documents/"
            f"{self.document_id}/{self.filename}"
        )


@dataclass(frozen=True)
class DossierFileReference:
    """Tài liệu hồ sơ — khoá theo document_id, không theo giai đoạn hay loại giấy.

        contracts/003_BK-2026/dossier-documents/{document_id}/{neutral_filename}

    Trước đây khoá là ``.../service-lines/{sl}/dossier/{stage}/{filename}``. Ba
    vấn đề: giai đoạn, hạng mục và loại giấy đều là metadata CÓ THỂ ĐỔI, nên nhét
    vào đường dẫn nghĩa là mỗi lần đổi phân loại lại phải di chuyển object; và hai
    tệp trùng tên trong cùng giai đoạn sẽ đụng ràng buộc unique của ``object_key``.

    Khoá theo ``document_id`` thì tệp nằm yên một chỗ suốt đời, mọi thứ khác chỉ
    là quan hệ trong cơ sở dữ liệu.
    """

    contract_id: str
    document_id: str
    filename: str

    @classmethod
    def build(
        cls, *, contract_id: object, document_id: object, filename: str
    ) -> "DossierFileReference":
        if not contract_id or not document_id:
            raise ValueError("dossier file is missing ownership context")
        return cls(
            contract_id=_safe_segment(contract_id),
            document_id=_safe_segment(document_id),
            filename=_neutral_filename(filename, stable_id=document_id),
        )

    @property
    def object_key(self) -> str:
        return (
            f"contracts/{self.contract_id}/dossier-documents/"
            f"{self.document_id}/{self.filename}"
        )
