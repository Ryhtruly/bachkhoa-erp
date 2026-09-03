"""Domain service for drafting and activating service-line workflows.

The graph remains the immutable definition of a revision.  Activation
materializes queryable runtime rows for nodes, checklist results and employee
assignments in the same database transaction.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import text
from sqlalchemy.exc import NoResultFound
from sqlalchemy.orm import Session


ROLE_CODE_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")
APPROVER_ROLE_RE = re.compile(r"^[a-z][a-z0-9_]*$")
OUTCOME_CODE_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")
PAY_SCOPES = {"ONCE_PER_WORKFLOW", "PER_OCCURRENCE", "MANUAL"}
CANCELLATION_CODES = {
    "CUSTOMER_REQUEST",
    "DUPLICATE_OR_ERROR",
    "CONTRACT_TERMINATED",
    "SCOPE_CHANGED",
    "OTHER",
}

# Hạn mức tải dở dang: một người chỉ được GIỮ tối đa 3 Hạng mục chưa xong.
# Đếm theo HẠNG MỤC chứ không theo bước: nhận trọn chuỗi nghĩa là ôm cả hạng mục,
# và đó cũng là thứ nhân viên nhìn thấy trên bàn làm việc ("2/3 hạng mục").
WIP_ITEM_LIMIT = 3
CAD_WIP_LIMIT = WIP_ITEM_LIMIT  # tên cũ, giữ cho chỗ gọi sẵn có

# Nhờ hỗ trợ mà 4 giờ không ai nhận thì việc quay về người gửi.
#
# Trách nhiệm KHÔNG chuyển đi cùng lời nhờ: chừng nào chưa có người nhận, phân
# công vẫn của người gửi và SLA vẫn chạy cho họ. Bỏ mốc này là lời nhờ nằm treo
# vô hạn, và người gửi tưởng đã đẩy được việc đi.
SUPPORT_TIMEOUT_HOURS = 4
SAME_CONTRACT_PREFERENCE_MINUTES = 30
# Một bước có thể mở cho NHIỀU phòng. K01 là rà soát và phân loại giấy khách đưa
# — việc đó ai rảnh cũng làm được, chờ đúng một phòng thì hồ sơ nằm không.
TASK_POOL_DEPARTMENTS_BY_NODE_CODE: dict[str, tuple[str, ...]] = {
    "K01": ("SALES", "LEGAL", "SURVEY"),
    "K02": ("SURVEY",),
    "K03": ("SURVEY",),
    "K04": ("LEGAL",),
    # K05 đã tách: K05a là nộp nội nghiệp do chính phòng Đo vẽ làm, K05b là nộp
    # cơ quan một cửa do Pháp lý làm.
    "K05a": ("SURVEY",),
    "K05b": ("LEGAL",),
    "K06": ("LEGAL",),
    "K07": ("LEGAL",),
}
TASK_POOL_DEPARTMENT_BY_NODE_CODE = {
    code: departments[0]
    for code, departments in TASK_POOL_DEPARTMENTS_BY_NODE_CODE.items()
}
TASK_POOL_ROLES_BY_NODE_CODE = {
    "K01": ("MAIN",),
    "K02": ("MAIN", "ASSISTANT"),
    "K03": ("MAIN",),
    "K04": ("MAIN",),
    "K05a": ("SUBMITTER",),
    "K05b": ("SUBMITTER",),
    "K06": ("MAIN",),
    "K07": ("MAIN",),
}

# Vai trò được phép NỘP cả gói nghiệm thu.
#
# Phải có SUBMITTER, không chỉ MAIN: K05a và K05b khai đúng một vai trò là
# SUBMITTER (xem bảng ngay trên, không có MAIN nào), nên chặn theo mỗi MAIN là
# hai bước đó KHÔNG AI nộp nghiệm thu được — hồ sơ nộp cơ quan xong nằm chết ở
# in_progress.
#
# ASSISTANT vẫn đứng ngoài: thợ phụ hoàn thiện phần mình rồi thôi. Ai cũng nộp
# được thì một người bấm sớm là khoá luôn phần người khác đang làm dở.
SUBMIT_CAPABLE_ROLES = ("MAIN", "SUBMITTER")


# Bước để lại hồ sơ SỐNG ở cơ quan — huỷ hợp đồng lúc này phải chốt phương án
# rút hoặc bàn giao hồ sơ đang nằm bên đó.
#
# K05a cũng nộp ra cơ quan và cũng nhận biên nhận, nhưng biên nhận đó chỉ để LƯU
# làm bằng chứng đã nộp: không mã theo dõi, không phải chờ kết quả. Không có hồ
# sơ sống nào để rút về nên K05a đứng ngoài nhóm này.
# K05b thì khác: biên nhận mang mã số hồ sơ, phải tra trạng thái tới khi xong.
NODES_SUBMITTED_TO_AGENCY = frozenset({"K05b", "K06"})

# Mã bước trong DB có chữ thường: "K05a", "K05b". Tra bằng `.upper()` trên mã rồi
# đối chiếu khoá gốc sẽ thành "K05A" — trượt khỏi mọi khoá và IM LẶNG rơi về mặc
# định: bước không có phòng ban, không có vai trò, nên không hiện trong Bể việc
# của ai. Hồ sơ nằm im tới khi có người tình cờ để ý.
# Dựng sẵn chỉ mục viết hoa để hai bên luôn cùng dạng.
_DEPARTMENTS_BY_UPPER_NODE_CODE = {
    ma.upper(): phong for ma, phong in TASK_POOL_DEPARTMENTS_BY_NODE_CODE.items()
}
_ROLES_BY_UPPER_NODE_CODE = {
    ma.upper(): vai_tro for ma, vai_tro in TASK_POOL_ROLES_BY_NODE_CODE.items()
}

# ── Cấu hình bước đọc từ danh mục workflow_nodes ─────────────────────────────
#
# Hai bảng hằng số ngay trên là cấu hình DỰ PHÒNG, không phải nguồn sự thật. Đổi
# một phòng ban lẽ ra chỉ là sửa dữ liệu danh mục, nhưng khi nó nằm trong mã thì
# thành build lại ảnh và deploy lại backend.
#
# Thứ tự ưu tiên, từ hẹp tới rộng:
#
#   1. Khung quy trình của TỪNG hạng mục  (node_definition trong graph)
#   2. Danh mục bước trong DB             (bộ nhớ dưới đây)
#   3. Hằng số trong mã                   (dự phòng cuối)
#
# Bộ nhớ này RỖNG cho tới khi ai đó gọi ``refresh_node_config``. Rỗng thì mọi
# hàm bên dưới rơi thẳng về hằng số, tức hành vi y hệt lúc chưa có lớp này —
# nhờ vậy mã mới lên trước migration cũng không gãy, và ngược lại.
NODE_CONFIG_CACHE_KEY = "bachkhoa:catalog:workflow_node_config"
NODE_CONFIG_TTL_SECONDS = 3600

_node_config_by_upper_code: dict[str, dict[str, Any]] = {}


def _upper_code(node_code: str | None) -> str:
    return str(node_code or "").strip().upper()


def _clean_code_tuple(value: Any) -> tuple[str, ...]:
    """Chuẩn hoá một cột text[] thành tuple mã viết hoa, bỏ phần tử rỗng.

    Trả về tuple RỖNG khi cột là null hoặc chỉ chứa rác — chỗ gọi coi tuple rỗng
    là "chưa khai" và đi tiếp xuống hằng số dự phòng. Ràng buộc cardinality > 0
    ở DB đã chặn mảng rỗng, nhưng dữ liệu vẫn có thể tới từ Redis cache cũ.
    """
    if not isinstance(value, (list, tuple)):
        return ()
    return tuple(
        code for code in (str(item or "").strip().upper() for item in value) if code
    )


def set_node_config(rows: Any) -> dict[str, dict[str, Any]]:
    """Nạp cấu hình bước vào bộ nhớ tiến trình. Trả về bộ nhớ sau khi nạp."""
    config: dict[str, dict[str, Any]] = {}
    for row in rows or ():
        entry = dict(row)
        code = _upper_code(entry.get("code"))
        if not code:
            continue
        sla_hours = entry.get("sla_hours")
        config[code] = {
            "allowed_departments": _clean_code_tuple(entry.get("allowed_departments")),
            "default_roles": _clean_code_tuple(entry.get("default_roles")),
            "sla_hours": int(sla_hours) if sla_hours else None,
            "allow_pause": bool(entry.get("allow_pause")),
            "allow_gov_tracking": bool(entry.get("allow_gov_tracking")),
            "cluster_code": (str(entry.get("cluster_code") or "").strip() or None),
        }
    _node_config_by_upper_code.clear()
    _node_config_by_upper_code.update(config)
    return _node_config_by_upper_code


def clear_node_config() -> None:
    """Quên cấu hình đã nạp — lượt đọc sau rơi về hằng số dự phòng."""
    _node_config_by_upper_code.clear()


def refresh_node_config(db: Session, *, force: bool = False) -> dict[str, dict[str, Any]]:
    """Đọc danh mục bước vào bộ nhớ, ưu tiên Redis rồi mới xuống DB.

    Gọi ở đầu các luồng cần cấu hình bước (bể việc, nhận việc, workspace hợp
    đồng). Hỏng Redis hay hỏng truy vấn đều KHÔNG được làm gãy luồng chính: cấu
    hình là thứ tinh chỉnh, còn hằng số dự phòng vẫn cho ra hành vi đúng.
    """
    from src.core.redis_utils import get_cached_json, set_cached_json

    cached = None if force else get_cached_json(NODE_CONFIG_CACHE_KEY)
    if cached is None:
        try:
            cached = [dict(row) for row in db.execute(text("""
                select code, allowed_departments, default_roles, sla_hours,
                       allow_pause, allow_gov_tracking, cluster_code
                from public.workflow_nodes
                where coalesce(is_active, true)
                order by code
            """)).mappings().all()]
        except Exception:
            # Migration A chưa lên thì các cột này chưa tồn tại. Im lặng dùng
            # hằng số là đúng: đây chính là đường lùi đã thiết kế sẵn.
            return _node_config_by_upper_code
        set_cached_json(NODE_CONFIG_CACHE_KEY, cached, ttl_seconds=NODE_CONFIG_TTL_SECONDS)
    return set_node_config(cached)


def node_config(node_code: str | None) -> dict[str, Any]:
    """Cấu hình DB của một bước; dict rỗng nghĩa là chưa nạp hoặc không có bước."""
    return _node_config_by_upper_code.get(_upper_code(node_code), {})


def node_allows_pause(node_code: str | None) -> bool:
    """Bước có được tạm dừng không. Chưa khai thì KHÔNG — mở nhầm nguy hơn khoá nhầm."""
    return bool(node_config(node_code).get("allow_pause"))


def node_allows_gov_tracking(node_code: str | None) -> bool:
    """Bước có nhật ký theo dõi tiến độ cơ quan không (chỉ K05b)."""
    return bool(node_config(node_code).get("allow_gov_tracking"))


def node_cluster_code(node_code: str | None) -> str | None:
    """Cụm nhận việc của bước; None khi bước đứng riêng."""
    return node_config(node_code).get("cluster_code")


def node_sla_hours(node_code: str | None) -> int | None:
    """Thời lượng chuẩn theo danh mục, giờ; None khi chưa khai."""
    return node_config(node_code).get("sla_hours")

# Bước nào kế thừa minh chứng của bước nào khi quay ngược quy trình.
# K05a nộp nội nghiệp nên kế thừa bản kỹ thuật từ K03; K05b nộp một cửa nên kế
# thừa bộ hồ sơ đã soạn ở K04. Đảo hai vế là nhân viên mở ra thấy tệp của bước
# khác và tưởng mình nộp nhầm.
# Khoá viết hoa sẵn vì mã bước trong DB có chữ thường ("K05a").
EVIDENCE_INHERITED_FROM_NODE = {
    "K03": "K02", "K04": "K03", "K05A": "K03", "K05B": "K04",
}


class WorkflowValidationError(ValueError):
    """A business validation error that is safe to return to the client."""


class TaskClaimConflict(WorkflowValidationError):
    """The requested pool slot was claimed by another employee first."""


class WorkflowActivationReadinessError(WorkflowValidationError):
    """Activation cannot continue until readiness blockers/warnings are resolved."""

    def __init__(self, readiness: dict[str, Any]):
        self.readiness = readiness
        super().__init__(str(readiness.get("message") or "Workflow chưa sẵn sàng kích hoạt"))


def task_pool_departments(
    node_code: str | None,
    node_definition: dict[str, Any] | None = None,
) -> tuple[str, ...]:
    """Các phòng ban được phép nhận bước này từ Bể việc.

    Ba nấc, hẹp trước rộng sau: khung quy trình của hạng mục → danh mục bước
    trong DB → hằng số dự phòng. Danh mục chưa nạp hoặc chưa khai cột thì nấc
    giữa vô hiệu, và kết quả đúng bằng hành vi cũ.
    """
    if isinstance(node_definition, dict):
        if "pool_department_codes" in node_definition:
            configured = node_definition.get("pool_department_codes")
            if isinstance(configured, list):
                return tuple(
                    code for code in
                    (str(item or "").strip().upper() for item in configured)
                    if code
                )
        if "pool_department_code" in node_definition:
            single = str(node_definition.get("pool_department_code") or "").strip().upper()
            return (single,) if single else ()
    from_catalog = node_config(node_code).get("allowed_departments") or ()
    if from_catalog:
        return from_catalog
    return _DEPARTMENTS_BY_UPPER_NODE_CODE.get(_upper_code(node_code), ())


def task_pool_department_code(
    node_code: str | None,
    node_definition: dict[str, Any] | None = None,
) -> str | None:
    """Phòng ban CHÍNH của bước — giữ cho các chỗ gọi chỉ cần một giá trị."""
    departments = task_pool_departments(node_code, node_definition)
    return departments[0] if departments else None


def task_pool_roles(
    node_code: str | None,
    node_definition: dict[str, Any] | None = None,
) -> tuple[str, ...]:
    """Vai trò được nhận bước này. Cùng ba nấc như ``task_pool_departments``."""
    has_explicit_roles = isinstance(node_definition, dict) and "claim_roles" in node_definition
    configured = (node_definition or {}).get("claim_roles")
    if has_explicit_roles and isinstance(configured, list):
        roles: list[str] = []
        for raw_role in configured:
            role = str(raw_role or "").strip().upper()
            if role and ROLE_CODE_RE.fullmatch(role) and role not in roles:
                roles.append(role)
        return tuple(roles)
    from_catalog = node_config(node_code).get("default_roles") or ()
    if from_catalog:
        return from_catalog
    return _ROLES_BY_UPPER_NODE_CODE.get(_upper_code(node_code), ())


def handover_completion_gate_satisfied(debt: dict[str, Any] | None) -> bool:
    """Operational K06 completion accepts paid debt or an approved exception.

    ``is_settled`` remains the accounting truth and must not be mutated when an
    exception opens the workflow gate.
    """
    summary = debt or {}
    return bool(summary.get("is_settled") or summary.get("gate_open"))


def blocking_in_progress_node(
    db: Session, *, employee_id: str, task_node_id: str | None = None
) -> dict[str, Any] | None:
    """Bước KHÁC mà nhân viên đang làm dở. ``None`` nghĩa là rảnh tay.

    Quy tắc đơn nhiệm: giữ tối đa 3 Hạng mục thì được, nhưng chỉ được BẮT ĐẦU
    một bước tại một thời điểm. Nhận việc và bắt đầu là hai chuyện khác nhau —
    nhận cả cụm 5 bước vẫn hợp lệ vì chúng nằm ở 'assigned'.

    Trả về cả mã bước và mã hợp đồng để thông báo nói được ĐANG VƯỚNG CÁI GÌ,
    thay vì chỉ "bạn đang bận" rồi để người ta tự đi tìm.
    """
    return db.execute(
        text("""
            -- contracts.id CHÍNH LÀ mã hợp đồng ("001/BK-2026"), không có cột
            -- contract_code riêng — nên không cần join tới bảng contracts.
            select n.id as task_node_id, n.node_code, sl.contract_id as contract_code
            from public.task_node_assignments a
            join public.task_nodes n on n.id = a.task_node_id
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            join public.service_lines sl on sl.id = wi.service_line_id
            where a.employee_id = :employee_id
              and a.assignment_status in ('assigned', 'accepted')
              and n.status = 'in_progress'
              -- Bước đang NẰM CHỜ không chiếm suất đơn nhiệm. K05b tạm dừng ba
              -- tuần chờ cơ quan mà vẫn chặn thì nhân viên ngồi không ba tuần —
              -- luật này sinh ra để chặn người làm hai việc cùng lúc, không phải
              -- người đang chờ cơ quan.
              and n.pause_reason_type is null
              -- So theo ID bước, KHÔNG theo mã bước: một người ôm K05b ở hai hợp
              -- đồng thì so theo mã là hai cái tự miễn trừ lẫn nhau.
              and (:task_node_id is null or n.id <> :task_node_id)
            limit 1
        """),
        {"employee_id": employee_id, "task_node_id": task_node_id},
    ).mappings().first()


def single_task_error(busy: dict[str, Any]) -> str:
    """Câu báo khi vướng luật đơn nhiệm — nói rõ đang vướng bước nào."""
    return (
        f"Bạn đang thực hiện bước {busy['node_code']} của hợp đồng "
        f"{busy['contract_code']}. Nộp nghiệm thu bước đó trước khi bắt đầu bước mới."
    )


def wip_limit_reached(held_count: int) -> bool:
    return int(held_count or 0) >= WIP_ITEM_LIMIT


# Tên cũ — vẫn dùng ở vài chỗ gọi, ý nghĩa nay là "số Hạng mục đang giữ".
cad_wip_limit_reached = wip_limit_reached


_HELD_ITEM_COUNT_QUERY = text("""
    select count(distinct n.workflow_instance_id)
    from public.task_node_assignments a
    join public.task_nodes n on n.id = a.task_node_id
    where a.employee_id = :employee_id
      and a.assignment_status in ('assigned', 'accepted')
      and a.role_code <> 'ASSISTANT'
      and n.status not in ('accepted', 'cancelled', 'skipped')
""")


def held_item_count(db: Session, *, employee_id: str, exclude_instance_id: str | None = None) -> int:
    """Số Hạng mục nhân viên đang giữ và chưa làm xong.

    Suất thợ phụ KHÔNG tính vào tải: đi phụ một buổi thực địa không phải là ôm
    trách nhiệm cả hạng mục, chặn nó chỉ làm bể việc đứng vô cớ.
    """
    total = int(db.execute(
        _HELD_ITEM_COUNT_QUERY, {"employee_id": employee_id}
    ).scalar() or 0)
    if not exclude_instance_id:
        return total
    already_holding = db.execute(
        text("""
            select 1
            from public.task_node_assignments a
            join public.task_nodes n on n.id = a.task_node_id
            where a.employee_id = :employee_id
              and a.assignment_status in ('assigned', 'accepted')
              and a.role_code <> 'ASSISTANT'
              and n.status not in ('accepted', 'cancelled', 'skipped')
              and n.workflow_instance_id = :instance_id
            limit 1
        """),
        {"employee_id": employee_id, "instance_id": exclude_instance_id},
    ).first()
    # Nhận thêm một bước trong hạng mục ĐANG giữ thì không chiếm thêm slot.
    return total - 1 if already_holding else total


def within_same_contract_preference_window(
    accepted_at: datetime | None, *, now: datetime | None = None
) -> bool:
    if not accepted_at:
        return False
    current = now or datetime.now(timezone.utc)
    if accepted_at.tzinfo is None:
        accepted_at = accepted_at.replace(tzinfo=timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    elapsed = current - accepted_at
    return timedelta(0) <= elapsed < timedelta(minutes=SAME_CONTRACT_PREFERENCE_MINUTES)


def _parse_datetime(value: Any, field_name: str) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as exc:
        raise WorkflowValidationError(f"{field_name} không đúng định dạng ngày giờ") from exc


def _normalize_assignment(raw: dict[str, Any], node_key: str) -> dict[str, Any]:
    employee_id = str(raw.get("employee_id") or "").strip()
    role_code = str(raw.get("role_code") or "MAIN").strip().upper()
    if not employee_id:
        raise WorkflowValidationError(f"Node {node_key}: phân công chưa chọn nhân viên")
    if not ROLE_CODE_RE.fullmatch(role_code):
        raise WorkflowValidationError(f"Node {node_key}: mã vai trò {role_code!r} không hợp lệ")

    return {
        "employee_id": employee_id,
        "role_code": role_code,
        "is_primary": bool(raw.get("is_primary")),
        "notes": str(raw.get("notes") or "").strip() or None,
    }


def _current_work_item_rates(db: Session) -> dict[str, dict[str, dict[str, Any]]]:
    """Return active, published rates effective today grouped by work item and role."""
    rows = db.execute(text("""
        select wi.id as work_item_id, wi.code, wi.name, wr.id as rate_id,
               wr.role_code, wr.amount
        from public.work_items wi
        join public.work_item_rates wr on wr.work_item_id = wi.id
        where wi.is_active
          and wr.status = 'published'
          and current_date <@ wr.effective_period
        order by wi.code, wr.role_code
    """)).mappings().all()
    result: dict[str, dict[str, dict[str, Any]]] = {}
    for row in rows:
        result.setdefault(row["work_item_id"], {})[row["role_code"]] = dict(row)
    return result


def _checklist_evidence_data(item: dict[str, Any], *, include_files: bool) -> dict[str, Any]:
    data = {
        "required": bool(item.get("require_evidence")),
        "description": item.get("evidence_description") or "",
        "drive_folder_url": item.get("drive_folder_url"),
    }
    if include_files:
        data["files"] = []
    return data


def _ensure_manual_checklist_assignment(
    db: Session,
    *,
    checklist_result_id: str,
    checklist_item: dict[str, Any],
    node_assignments: list[dict[str, Any]],
    actor_id: str,
    reason: str,
) -> None:
    """Persist the manually selected checklist owner without duplicating pay rows."""
    employee_id = checklist_item.get("assignee_employee_id")
    if not employee_id:
        return
    node_assignment = next(
        (item for item in node_assignments if item.get("employee_id") == employee_id),
        None,
    )
    if not node_assignment:
        return
    exists = db.execute(
        text("""
            select 1 from public.task_node_checklist_assignments
            where checklist_result_id = :checklist_result_id
              and employee_id = :employee_id
              and pay_slot = 'WORK'
              and status not in ('replaced', 'cancelled')
            limit 1
        """),
        {"checklist_result_id": checklist_result_id, "employee_id": employee_id},
    ).first()
    if exists:
        return
    db.execute(
        text("""
            insert into public.task_node_checklist_assignments
                (checklist_result_id, employee_id, role_code, pay_slot,
                 share_percent, status, assigned_by, reason)
            values
                (:checklist_result_id, :employee_id, :role_code, 'WORK',
                 100, 'assigned', :actor_id, :reason)
        """),
        {
            "checklist_result_id": checklist_result_id,
            "employee_id": employee_id,
            "role_code": node_assignment.get("role_code") or "MAIN",
            "actor_id": actor_id,
            "reason": reason,
        },
    )


_OUTPUT_DOCUMENT_FIELDS = frozenset(
    {"template_id", "min_count", "required_before_submit", "needs_director_approval"}
)


DIRECTOR_APPROVER_ROLE = "admin"


def _normalize_output_documents(
    raw_item: dict[str, Any],
    *,
    node_key: str,
    checklist_name: str,
    approver_role: str,
    active_templates_loader,
) -> list[dict[str, Any]] | None:
    """Chuẩn hoá cấu hình TÀI LIỆU ĐẦU RA của một checklist.

    Trả ``None`` khi checklist không khai gì — và người gọi phải hiểu ``None`` là
    "đừng thêm khoá nào vào graph". Quy trình cũ không được tự mọc thêm field:
    một graph đã publish mà lần lưu sau khác đi ở chỗ không ai sửa là thứ rất khó
    truy khi có tranh chấp.

    ``template_id`` chứ không phải ``slot_id``: graph là của MẪU quy trình, dùng
    chung cho mọi Hạng mục, còn slot là bản thể hiện riêng của một Hạng mục.
    """
    if "output_documents" not in raw_item:
        return None
    raw_list = raw_item.get("output_documents")
    if raw_list is None or raw_list == []:
        return None
    if not isinstance(raw_list, list):
        raise WorkflowValidationError(
            f"Node {node_key}: tài liệu đầu ra của checklist {checklist_name!r} phải là danh sách"
        )

    normalized: list[dict[str, Any]] = []
    seen_templates: set[str] = set()
    for raw in raw_list:
        if not isinstance(raw, dict):
            raise WorkflowValidationError(
                f"Node {node_key}: tài liệu đầu ra của checklist {checklist_name!r} phải là danh sách"
            )

        # Field lạ phải BÁO, không được lặng lẽ bỏ: người cấu hình gõ nhầm tên
        # trường mà hệ thống im lặng thì họ tin là đã bật, còn thực tế thì không.
        la = sorted(set(raw) - _OUTPUT_DOCUMENT_FIELDS)
        if la:
            raise WorkflowValidationError(
                f"Node {node_key}: checklist {checklist_name!r} có cấu hình tài liệu đầu ra "
                f"không nhận ra: {', '.join(la)}"
            )

        template_id = str(raw.get("template_id") or "").strip()
        if not template_id:
            raise WorkflowValidationError(
                f"Node {node_key}: checklist {checklist_name!r} chưa chọn loại tài liệu đầu ra"
            )
        if template_id not in active_templates_loader():
            raise WorkflowValidationError(
                f"Node {node_key}: checklist {checklist_name!r} trỏ tới loại tài liệu "
                f"không tồn tại hoặc đã tắt ({template_id})"
            )
        if template_id in seen_templates:
            raise WorkflowValidationError(
                f"Node {node_key}: checklist {checklist_name!r} khai trùng loại tài liệu "
                f"{template_id} — một loại chỉ được khai một lần"
            )
        seen_templates.add(template_id)

        # bool là lớp con của int trong Python: True vượt qua mọi phép kiểm số.
        # Không chặn riêng thì min_count=True lọt vào graph thành 1 một cách vô tình.
        raw_min = raw.get("min_count", 1)
        if isinstance(raw_min, bool) or not isinstance(raw_min, int) or raw_min < 1:
            raise WorkflowValidationError(
                f"Node {node_key}: checklist {checklist_name!r} có số lượng tối thiểu "
                "phải là số nguyên từ 1 trở lên"
            )

        flags: dict[str, bool] = {}
        for field, default in (("required_before_submit", True), ("needs_director_approval", False)):
            value = raw.get(field, default)
            if not isinstance(value, bool):
                raise WorkflowValidationError(
                    f"Node {node_key}: checklist {checklist_name!r} — {field} phải là true hoặc false"
                )
            flags[field] = value

        # "Cần Giám đốc duyệt" phải có răng. Việc duyệt tài liệu đi CHUNG với việc
        # duyệt checklist chứa nó — hệ thống không có vòng duyệt riêng cho từng
        # tệp. Nên nếu checklist lại để người khác duyệt thì cờ này chỉ là chữ
        # trang trí: tài liệu được thông qua bởi một người không phải Giám đốc.
        # Chặn ngay lúc cấu hình, thay vì để phát hiện lúc hồ sơ đã đi xa.
        if flags["needs_director_approval"] and approver_role != DIRECTOR_APPROVER_ROLE:
            raise WorkflowValidationError(
                f"Node {node_key}: checklist {checklist_name!r} yêu cầu Giám đốc duyệt tài "
                f"liệu nhưng lại đặt người duyệt là {approver_role!r}. Đổi người duyệt "
                f"thành {DIRECTOR_APPROVER_ROLE!r} hoặc bỏ yêu cầu này."
            )

        normalized.append({"template_id": template_id, "min_count": raw_min, **flags})

    return normalized


def _insert_checklist_result(db: Session, statement, params: dict[str, Any], *, checklist_name: str) -> str:
    """Chạy INSERT ... SELECT ... JOIN của checklist result, fail-closed.

    Câu insert đi qua chuỗi task_node → workflow_instance → service_line để tự lấy
    contract_id phía máy chủ. Chuỗi đứt ở bất kỳ mắt nào thì SELECT trả 0 dòng và
    insert lặng lẽ không tạo gì — bước sẽ có ít checklist hơn định nghĩa mà không
    ai biết. ``scalar_one()`` đã nổ sẵn trong tình huống đó; ở đây chỉ đổi nó
    thành một câu người đọc hiểu được thay vì NoResultFound trần trụi.

    Tuyệt đối không nhận contract_id từ payload: nó luôn được suy từ task_node.
    """
    try:
        return db.execute(statement, params).scalar_one()
    except NoResultFound as exc:
        raise WorkflowValidationError(
            f"Không tạo được checklist {checklist_name!r}: bước "
            f"{params.get('task_node_id')!r} không truy ra được Hợp đồng "
            "(thiếu workflow instance hoặc Hạng mục)."
        ) from exc


def _validate_drive_url(value: Any, *, node_key: str, checklist_name: str) -> str | None:
    """Normalize an optional legacy evidence link.

    New checklist evidence is uploaded to MinIO at execution time.  Older graph
    revisions can still contain a Drive URL (or a MinIO/public object URL), so
    keep the field readable without making a Google hostname an activation
    requirement.
    """
    url = str(value or "").strip()
    if not url:
        return None
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise WorkflowValidationError(
            f"Node {node_key}: link minh chứng của checklist {checklist_name!r} "
            "phải là URL HTTP/HTTPS hợp lệ"
        )
    return url


def validate_workflow_graph(
    db: Session,
    graph: dict[str, Any],
    *,
    minimum_start_date: date | None = None,
    require_connected: bool = False,
    require_assignments: bool = False,
) -> dict[str, Any]:
    """Validate and normalize the JSON graph against live catalog/employee rows."""
    if not isinstance(graph, dict):
        raise WorkflowValidationError("Cấu trúc workflow phải là một object JSON")
    raw_nodes = graph.get("nodes")
    if not isinstance(raw_nodes, dict) or not raw_nodes:
        raise WorkflowValidationError("Workflow phải có ít nhất một Node")

    start_node = str(graph.get("start_node") or "").strip()
    if not start_node or start_node not in raw_nodes:
        raise WorkflowValidationError("Node bắt đầu không tồn tại trong workflow")

    active_codes = {
        row[0]
        for row in db.execute(text(
            "select code from public.workflow_nodes where coalesce(is_active, true)"
        )).all()
    }
    active_department_codes = {
        str(row[0]).upper()
        for row in db.execute(text(
            "select code from public.departments where coalesce(is_active, true)"
        )).all()
    }
    normalized = dict(graph)
    normalized_nodes: dict[str, Any] = {}
    employee_ids: set[str] = set()
    work_item_rates = _current_work_item_rates(db)

    # Danh mục loại giấy CHỈ đọc khi trong graph thật sự có checklist khai tài
    # liệu đầu ra. Quy trình cũ không được phát sinh thêm một truy vấn nào — đó là
    # điều kiện để nói "hành vi cũ không đổi", chứ không chỉ là kết quả giống nhau.
    _templates_cache: dict[str, set[str]] = {}

    def _active_document_templates() -> set[str]:
        if "value" not in _templates_cache:
            _templates_cache["value"] = {
                str(row[0])
                for row in db.execute(text(
                    "select id from public.document_checklist_templates "
                    "where coalesce(is_active, true)"
                )).all()
            }
        return _templates_cache["value"]

    for raw_key, raw_node in raw_nodes.items():
        node_key = str(raw_key).strip()
        if not node_key or not isinstance(raw_node, dict):
            raise WorkflowValidationError("Mỗi Node phải có key và dữ liệu hợp lệ")
        node_code = str(raw_node.get("task_code") or "").strip().upper()
        if node_code not in active_codes:
            raise WorkflowValidationError(f"Node {node_key}: cụm công việc {node_code!r} không tồn tại hoặc đã tắt")

        transitions = raw_node.get("transitions") or {}
        if not isinstance(transitions, dict):
            raise WorkflowValidationError(f"Node {node_key}: transitions phải là object")
        normalized_transitions: dict[str, str] = {}
        for raw_outcome, raw_target in transitions.items():
            outcome = str(raw_outcome).strip().upper()
            target = str(raw_target).strip()
            if not OUTCOME_CODE_RE.fullmatch(outcome):
                raise WorkflowValidationError(f"Node {node_key}: mã kết quả {outcome!r} không hợp lệ")
            if target not in raw_nodes:
                raise WorkflowValidationError(f"Node {node_key}: nhánh {outcome} trỏ tới Node không tồn tại")
            normalized_transitions[outcome] = target

        checklist = raw_node.get("checklist") or []
        if not isinstance(checklist, list):
            raise WorkflowValidationError(f"Node {node_key}: checklist phải là danh sách")
        checklist_keys: set[str] = set()
        payable_work_items: set[str] = set()
        normalized_checklist: list[dict[str, Any]] = []
        for index, raw_item in enumerate(checklist, start=1):
            if not isinstance(raw_item, dict):
                raise WorkflowValidationError(f"Node {node_key}: checklist số {index} không hợp lệ")
            checklist_key = str(raw_item.get("key") or f"item_{index}").strip()
            checklist_name = str(raw_item.get("name") or "").strip()
            if not checklist_name:
                raise WorkflowValidationError(f"Node {node_key}: checklist số {index} chưa có tên")
            if checklist_key in checklist_keys:
                raise WorkflowValidationError(f"Node {node_key}: trùng key checklist {checklist_key}")
            checklist_keys.add(checklist_key)
            raw_compensation = raw_item.get("compensation") or {}
            if not isinstance(raw_compensation, dict):
                raise WorkflowValidationError(
                    f"Node {node_key}: cấu hình khoán của checklist {checklist_name!r} không hợp lệ"
                )
            is_payable = bool(
                raw_compensation.get("is_payable", raw_item.get("is_payable", False))
            )
            compensation: dict[str, Any] = {"is_payable": False}
            if is_payable:
                work_item_id = str(raw_compensation.get("work_item_id") or "").strip()
                if work_item_id not in work_item_rates:
                    raise WorkflowValidationError(
                        f"Node {node_key}: checklist {checklist_name!r} chưa chọn công việc khoán đang hiệu lực"
                    )
                if work_item_id in payable_work_items:
                    raise WorkflowValidationError(
                        f"Node {node_key}: một công việc khoán chỉ được gắn một lần trong cùng Node"
                    )
                payable_work_items.add(work_item_id)
                pay_scope = str(raw_compensation.get("pay_scope") or "ONCE_PER_WORKFLOW").upper()
                if pay_scope not in PAY_SCOPES:
                    raise WorkflowValidationError(
                        f"Node {node_key}: phạm vi tính khoán {pay_scope!r} không hợp lệ"
                    )
                compensation = {
                    "is_payable": True,
                    "work_item_id": work_item_id,
                    "pay_scope": pay_scope,
                    # Cùng pay_key sẽ chống tính trùng khi công việc xuất hiện ở nhiều Node.
                    "pay_key": str(raw_compensation.get("pay_key") or work_item_id).strip(),
                    "pay_group_key": str(raw_compensation.get("pay_group_key") or work_item_id).strip(),
                }

            require_evidence = bool(
                raw_item.get("require_evidence", raw_item.get("evidence_required", False))
            )
            approver_role = str(raw_item.get("approver_role") or "admin").strip().lower()
            if not APPROVER_ROLE_RE.fullmatch(approver_role):
                raise WorkflowValidationError(
                    f"Node {node_key}: vai trò duyệt của checklist {checklist_name!r} không hợp lệ"
                )
            assignee_employee_id = str(raw_item.get("assignee_employee_id") or "").strip() or None
            if assignee_employee_id:
                employee_ids.add(assignee_employee_id)

            normalized_item = {
                **raw_item,
                "key": checklist_key,
                "name": checklist_name,
                "required": raw_item.get("required") is not False,
                "require_evidence": require_evidence,
                "approver_role": approver_role,
                "assignee_employee_id": assignee_employee_id,
                "evidence_description": str(raw_item.get("evidence_description") or "").strip(),
                "drive_folder_url": _validate_drive_url(
                    raw_item.get("drive_folder_url"),
                    node_key=node_key,
                    checklist_name=checklist_name,
                ),
                "compensation": compensation,
            }
            normalized_item.pop("evidence_required", None)

            # Chỉ ghi khoá khi checklist THẬT SỰ khai tài liệu đầu ra. Khai rỗng
            # cũng gỡ luôn, để graph của quy trình cũ không mọc thêm field nào.
            output_documents = _normalize_output_documents(
                raw_item,
                node_key=node_key,
                checklist_name=checklist_name,
                approver_role=approver_role,
                active_templates_loader=_active_document_templates,
            )
            if output_documents:
                normalized_item["output_documents"] = output_documents
            else:
                normalized_item.pop("output_documents", None)

            normalized_checklist.append(normalized_item)

        raw_assignments = raw_node.get("assignments") or []
        if not isinstance(raw_assignments, list):
            raise WorkflowValidationError(f"Node {node_key}: assignments phải là danh sách")
        assignments = [_normalize_assignment(item, node_key) for item in raw_assignments]
        assignment_keys: set[tuple[str, str]] = set()
        primary_count = 0
        json_assignments: list[dict[str, Any]] = []
        for assignment in assignments:
            key = (assignment["employee_id"], assignment["role_code"])
            if key in assignment_keys:
                raise WorkflowValidationError(f"Node {node_key}: một nhân viên bị giao trùng cùng vai trò")
            assignment_keys.add(key)
            employee_ids.add(assignment["employee_id"])
            primary_count += int(assignment["is_primary"])
            json_assignments.append(assignment)
        if primary_count > 1:
            raise WorkflowValidationError(f"Node {node_key}: chỉ được có một người phụ trách chính")

        pool_department = task_pool_department_code(node_code, raw_node)
        if pool_department and pool_department not in active_department_codes:
            raise WorkflowValidationError(
                f"Node {node_key}: phòng ban Bể việc {pool_department!r} không tồn tại hoặc đã tắt"
            )
        claim_roles = list(task_pool_roles(node_code, raw_node))
        raw_claim_roles = raw_node.get("claim_roles")
        if raw_claim_roles is not None and not isinstance(raw_claim_roles, list):
            raise WorkflowValidationError(f"Node {node_key}: claim_roles phải là danh sách")
        if isinstance(raw_claim_roles, list):
            invalid_roles = [
                str(role or "").strip().upper()
                for role in raw_claim_roles
                if not ROLE_CODE_RE.fullmatch(str(role or "").strip().upper())
            ]
            if invalid_roles:
                raise WorkflowValidationError(
                    f"Node {node_key}: vai trò Bể việc không hợp lệ: {', '.join(invalid_roles)}"
                )

        assigned_employee_ids = {item["employee_id"] for item in json_assignments}
        for checklist_item in normalized_checklist:
            assignee_employee_id = checklist_item.get("assignee_employee_id")
            if assignee_employee_id and assignee_employee_id not in assigned_employee_ids:
                raise WorkflowValidationError(
                    f"Node {node_key}: người phụ trách checklist {checklist_item['name']!r} "
                    "phải nằm trong danh sách người thực hiện của Node"
                )

        for checklist_item in normalized_checklist:
            compensation = checklist_item["compensation"]
            if not compensation["is_payable"]:
                continue
            rates = work_item_rates[compensation["work_item_id"]]
            positive_roles = {
                role for role, rate in rates.items() if float(rate["amount"] or 0) > 0
            }
            assigned_by_role: dict[str, int] = {}
            for assignment in json_assignments:
                role = assignment["role_code"]
                assigned_by_role[role] = assigned_by_role.get(role, 0) + 1
            required_role = "MAIN" if "MAIN" in positive_roles else (
                "SUBMITTER" if "SUBMITTER" in positive_roles else None
            )
            if (
                required_role
                and assigned_by_role.get(required_role, 0) == 0
                and required_role not in claim_roles
            ):
                raise WorkflowValidationError(
                    f"Node {node_key}: công việc khoán của checklist {checklist_item['name']!r} "
                    f"cần cấu hình vai trò {required_role} trong Bể việc hoặc chỉ định thủ công"
                )
            duplicated_roles = sorted(
                role for role in positive_roles if assigned_by_role.get(role, 0) > 1
            )
            if duplicated_roles:
                raise WorkflowValidationError(
                    f"Node {node_key}: chưa hỗ trợ chia khoán cho nhiều người cùng vai trò "
                    f"{', '.join(duplicated_roles)}; hãy chọn một người cho mỗi vai trò"
                )

        normalized_node = {
            **raw_node,
            "task_code": node_code,
            "name": str(raw_node.get("name") or node_code).strip(),
            "description": str(raw_node.get("description") or "").strip(),
            "checklist": normalized_checklist,
            "assignments": json_assignments,
            "pool_department_code": pool_department,
            "claim_roles": claim_roles,
            "transitions": normalized_transitions,
        }
        normalized_node.pop("evidence_required", None)
        normalized_nodes[node_key] = normalized_node

    if employee_ids:
        active_employee_ids = {
            row[0]
            for row in db.execute(
                text("select id from public.employees where id = any(:employee_ids) and coalesce(is_active, true)"),
                {"employee_ids": list(employee_ids)},
            ).all()
        }
        missing = sorted(employee_ids - active_employee_ids)
        if missing:
            raise WorkflowValidationError(f"Nhân viên không tồn tại hoặc đã ngừng hoạt động: {', '.join(missing)}")

    # Mọi bước phải đi tới được từ bước bắt đầu — nhưng CHỈ khi kích hoạt.
    #
    # Bản nháp là bản đang vẽ dở: thêm một bước rồi mới nối là chuyện thường.
    # Bắt liên thông ngay từ lúc lưu nháp thì quy trình nào lỡ kích hoạt với bước
    # rời sẽ kẹt vĩnh viễn — bấm "Sửa" cũng bị chặn, tức là không còn đường nào
    # sửa cho nó liền mạch lại.
    if not require_connected and not require_assignments:
        normalized["start_node"] = start_node
        normalized["nodes"] = normalized_nodes
        normalized["ui"] = graph.get("ui") if isinstance(graph.get("ui"), dict) else {}
        return normalized

    den_duoc: set[str] = set()
    hang_doi = [start_node]
    while hang_doi:
        key = hang_doi.pop()
        if key in den_duoc:
            continue
        den_duoc.add(key)
        for dich in (normalized_nodes.get(key, {}).get("transitions") or {}).values():
            if dich in normalized_nodes and dich not in den_duoc:
                hang_doi.append(dich)

    mo_coi = sorted(set(normalized_nodes) - den_duoc) if require_connected else []
    if mo_coi:
        ten = ", ".join(
            f"{normalized_nodes[k].get('name') or k} ({normalized_nodes[k].get('task_code') or '?'})"
            for k in mo_coi
        )
        raise WorkflowValidationError(
            f"Có {len(mo_coi)} bước chưa nối vào quy trình: {ten}. "
            "Nối chúng vào luồng hoặc xoá đi rồi kích hoạt lại."
        )

    # Mỗi bước vận hành phải có một trong hai cơ chế nhận việc: Bể việc theo
    # phòng ban/vai trò hoặc chỉ định thủ công cho trường hợp đặc biệt.
    chua_giao = sorted(
        k for k, node in normalized_nodes.items()
        if not (node.get("assignments") or [])
        and not (
            node.get("pool_department_code")
            and node.get("claim_roles")
        )
    ) if require_assignments else []
    if chua_giao:
        ten = ", ".join(
            f"{normalized_nodes[k].get('name') or k} ({normalized_nodes[k].get('task_code') or '?'})"
            for k in chua_giao
        )
        raise WorkflowValidationError(
            f"Có {len(chua_giao)} bước chưa có cơ chế nhận việc: {ten}. "
            "Chọn phòng ban/vai trò Bể việc hoặc chỉ định người phụ trách rồi kích hoạt lại."
        )

    normalized["start_node"] = start_node
    normalized["nodes"] = normalized_nodes
    normalized["ui"] = graph.get("ui") if isinstance(graph.get("ui"), dict) else {}
    return normalized


def _validate_template(db: Session, template_id: str | None) -> None:
    if not template_id:
        return
    exists = db.execute(
        text("select 1 from public.workflow_templates where id = :id and status = 'published'"),
        {"id": template_id},
    ).first()
    if not exists:
        raise WorkflowValidationError("Mẫu workflow không tồn tại hoặc chưa được ban hành")


def save_workflow_draft(
    db: Session,
    *,
    service_line_id: str,
    graph: dict[str, Any],
    source_workflow_version_id: str | None,
    change_reason: str | None,
    actor_id: str,
    require_connected: bool = False,
    require_assignments: bool = False,
) -> dict[str, Any]:
    """Upsert the sole draft revision for a service line without committing.

    `require_connected` chỉ bật khi kích hoạt. Lưu nháp phải cho phép sơ đồ đang
    vẽ dở, nếu không thì không ai thêm được bước mới trước khi kịp nối dây.
    """
    service_context = db.execute(
        text("""
            select sl.id, c.date_signed
            from public.service_lines sl
            join public.contracts c on c.id = sl.contract_id
            where sl.id = :id
        """),
        {"id": service_line_id},
    ).mappings().first()
    if not service_context:
        raise WorkflowValidationError("Hạng mục hợp đồng không tồn tại")
    normalized_graph = validate_workflow_graph(
        db,
        graph,
        require_connected=require_connected,
        require_assignments=require_assignments,
        minimum_start_date=service_context["date_signed"],
    )
    _validate_template(db, source_workflow_version_id)

    instance = db.execute(
        text("""
            select id, status, active_revision_id
            from public.workflow_instances
            where service_line_id = :service_line_id
            for update
        """),
        {"service_line_id": service_line_id},
    ).mappings().first()
    if not instance:
        instance = db.execute(
            text("""
                insert into public.workflow_instances
                    (service_line_id, source_workflow_version_id, status, created_by)
                values (:service_line_id, :template_id, 'not_started', :actor_id)
                returning id, status, active_revision_id
            """),
            {
                "service_line_id": service_line_id,
                "template_id": source_workflow_version_id,
                "actor_id": actor_id,
            },
        ).mappings().one()
    elif instance["status"] == "cancelled":
        raise WorkflowValidationError("Workflow đã hủy; không thể tạo thêm bản sửa đổi")
    elif instance["status"] == "completed":
        raise WorkflowValidationError("Workflow đã hoàn thành; không thể tạo thêm bản sửa đổi")

    draft = db.execute(
        text("""
            select id, revision_no
            from public.workflow_instance_revisions
            where workflow_instance_id = :instance_id and status = 'draft'
            for update
        """),
        {"instance_id": instance["id"]},
    ).mappings().first()
    params = {
        "instance_id": instance["id"],
        "template_id": source_workflow_version_id,
        "graph": json.dumps(normalized_graph, ensure_ascii=False),
        "change_reason": (change_reason or "").strip() or None,
        "actor_id": actor_id,
    }
    if draft:
        revision = db.execute(
            text("""
                update public.workflow_instance_revisions
                set source_workflow_version_id = :template_id,
                    graph = cast(:graph as jsonb),
                    change_reason = :change_reason,
                    created_by = :actor_id
                where id = :revision_id
                returning id, workflow_instance_id, revision_no, status
            """),
            {**params, "revision_id": draft["id"]},
        ).mappings().one()
    else:
        next_revision = db.execute(
            text("""
                select coalesce(max(revision_no), 0) + 1
                from public.workflow_instance_revisions
                where workflow_instance_id = :instance_id
            """),
            {"instance_id": instance["id"]},
        ).scalar_one()
        revision = db.execute(
            text("""
                insert into public.workflow_instance_revisions
                    (workflow_instance_id, revision_no, source_workflow_version_id,
                     parent_revision_id, graph, status, change_reason, created_by)
                values
                    (:instance_id, :revision_no, :template_id, :parent_revision_id,
                     cast(:graph as jsonb), 'draft', :change_reason, :actor_id)
                returning id, workflow_instance_id, revision_no, status
            """),
            {
                **params,
                "revision_no": next_revision,
                "parent_revision_id": instance["active_revision_id"],
            },
        ).mappings().one()

    db.execute(
        text("""
            update public.workflow_instances
            set source_workflow_version_id = :template_id, updated_at = now()
            where id = :instance_id
        """),
        params,
    )
    return {**dict(revision), "graph": normalized_graph}


def _prevent_modifying_active_node(db: Session, *, runtime_node: dict, desired_node: dict) -> None:
    """Chặn đổi checklist / thời lượng của bước đã bắt đầu."""
    step_name = desired_node.get("name") or runtime_node["node_code"]

    checklist_rows = db.execute(
        text("""
            select checklist_key, checklist_name, is_required, require_evidence
            from public.task_node_checklist_results
            where task_node_id = :i
            order by checklist_key
        """),
        {"i": runtime_node["id"]},
    ).mappings().all()
    old_checklist_fingerprint = sorted(
        (r["checklist_key"], r["checklist_name"], bool(r["is_required"]), bool(r["require_evidence"]))
        for r in checklist_rows
    )
    new_checklist_fingerprint = sorted(
        (
            str(item.get("key") or ""),
            str(item.get("name") or ""),
            item.get("required") is not False,
            bool(item.get("require_evidence")),
        )
        for item in (desired_node.get("checklist") or [])
    )
    if old_checklist_fingerprint != new_checklist_fingerprint:
        raise WorkflowValidationError(
            f"Bước “{step_name}” đã bắt đầu nên không đổi được checklist. "
            "Nhân viên có thể đã nộp minh chứng theo danh sách cũ. "
            "Cần đổi thì huỷ quy trình làm lại, hoặc thêm một bước mới."
        )

    old_node_def = db.execute(
        text("""
            select r.graph->'nodes'->n.node_key as node_def
            from public.task_nodes n
            join public.workflow_instance_revisions r on r.id = n.defined_by_revision_id
            where n.id = :i
        """),
        {"i": runtime_node["id"]},
    ).scalar()
    if isinstance(old_node_def, dict):
        def _to_int(val):
            try:
                return int(val or 0)
            except (TypeError, ValueError):
                return 0
        if (
            _to_int(old_node_def.get("duration_days")),
            _to_int(old_node_def.get("duration_hours")),
            _to_int(old_node_def.get("duration_minutes")),
        ) != (
            _to_int(desired_node.get("duration_days")),
            _to_int(desired_node.get("duration_hours")),
            _to_int(desired_node.get("duration_minutes")),
        ):
            raise WorkflowValidationError(
                f"Bước “{step_name}” đã bắt đầu nên không đổi được thời hạn. "
                "Hạn của các bước sau đã tính theo mốc cũ."
            )


def _apply_workflow_amendment(
    db: Session,
    *,
    instance: dict[str, Any],
    revision: dict[str, Any],
    source_workflow_version_id: str | None,
    actor_id: str,
) -> dict[str, Any]:
    """Activate a new revision while preserving Node executions from older revisions."""
    graph_nodes = revision["graph"]["nodes"]
    runtime_rows = db.execute(
        text("""
            select id, node_key, node_code, status, occurrence_no,
                   defined_by_revision_id, started_at
            from public.task_nodes
            where workflow_instance_id = :instance_id
              and status <> 'cancelled'
            order by occurrence_no desc, created_at desc
            for update
        """),
        {"instance_id": instance["id"]},
    ).mappings().all()
    runtime_by_key: dict[str, Any] = {}
    for row in runtime_rows:
        runtime_by_key.setdefault(row["node_key"], row)

    removed_keys = sorted(set(runtime_by_key) - set(graph_nodes))
    for node_key in removed_keys:
        row = runtime_by_key[node_key]
        if row["status"] not in {"pending", "ready"} or row["started_at"] is not None:
            raise WorkflowValidationError(
                f"Không thể xóa Node {node_key!r} vì công việc đã bắt đầu hoặc đã có kết quả"
            )

    for node_key in set(runtime_by_key) & set(graph_nodes):
        if runtime_by_key[node_key]["node_code"] != graph_nodes[node_key]["task_code"]:
            raise WorkflowValidationError(
                f"Node {node_key!r} đã chạy nên không thể đổi mã cụm công việc; "
                "hãy thêm Node mới và nối lại điều kiện"
            )

    db.execute(
        text("""
            update public.workflow_instance_revisions
            set status = 'superseded'
            where id = :active_revision_id and status = 'active'
        """),
        {"active_revision_id": instance["active_revision_id"]},
    )
    db.execute(
        text("""
            update public.workflow_instance_revisions
            set status = 'active', activated_by = :actor_id, activated_at = now()
            where id = :revision_id and status = 'draft'
        """),
        {"revision_id": revision["id"], "actor_id": actor_id},
    )
    db.execute(
        text("""
            update public.workflow_instances
            set active_revision_id = :revision_id,
                source_workflow_version_id = :template_id,
                updated_at = now()
            where id = :instance_id
        """),
        {
            "revision_id": revision["id"],
            "template_id": source_workflow_version_id,
            "instance_id": instance["id"],
        },
    )

    for node_key in removed_keys:
        row = runtime_by_key[node_key]
        db.execute(
            text("""
                update public.task_nodes
                set status = 'cancelled', updated_at = now(),
                    notes = concat_ws(E'\n', notes, :note)
                where id = :task_node_id
            """),
            {
                "task_node_id": row["id"],
                "note": f"Đã loại khỏi workflow tại Revision {revision['revision_no']}",
            },
        )
        db.execute(
            text("""
                insert into public.task_node_events
                    (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
                values (:task_node_id, 'REMOVED_BY_REVISION', :from_status, 'cancelled',
                        :actor_id, cast(:payload as jsonb))
            """),
            {
                "task_node_id": row["id"],
                "from_status": row["status"],
                "actor_id": actor_id,
                "payload": json.dumps({"revision_id": revision["id"]}),
            },
        )
    added_keys = [key for key in graph_nodes if key not in runtime_by_key]
    has_live_node = any(
        row["status"] in {"ready", "in_progress", "submitted", "rework_required", "blocked"}
        for row in runtime_rows
        if row["node_key"] not in removed_keys
    )
    work_item_rates = _current_work_item_rates(db)
    checklist_count = 0
    assignment_count = 0
    rebased_node_count = 0
    compensation_assignment_count = 0
    projected_compensation_amount = 0.0
    provisioned_records: dict[str, str] = {}

    # Pending/ready Nodes may receive revised checklist definitions. Started Nodes keep
    # their original execution snapshot so evidence and acceptance history never move.
    for node_key in sorted(set(runtime_by_key) & set(graph_nodes)):
        runtime_node = runtime_by_key[node_key]
        desired_node = graph_nodes[node_key]
        desired_assignments = desired_node.get("assignments") or []

        # Bước đã có người bấm Bắt đầu thì cấu trúc phải đứng yên: nhân viên đã
        # nộp minh chứng theo checklist cũ, hạn đã tính từ mốc khởi động cũ. Đổi
        # ngầm dưới chân người đang làm là cách chắc chắn nhất để mất dấu vết.
        #
        # Vẫn cho đổi tên, mô tả, phân công và vị trí trên sơ đồ — những thứ đó
        # không đụng tới việc đang chạy.
        if runtime_node["started_at"] is not None:
            _chan_sua_buoc_dang_chay(db, runtime_node=runtime_node, desired_node=desired_node)
        active_assignments = db.execute(
            text("""
                select employee_id, role_code, is_primary, notes
                from public.task_node_assignments
                where task_node_id = :task_node_id
                  and assignment_status in ('proposed', 'assigned', 'accepted')
            """),
            {"task_node_id": runtime_node["id"]},
        ).mappings().all()
        active_assignment_payload = [dict(item) for item in active_assignments]
        # Revision graph là cấu trúc quy trình, không phải nguồn sự thật của
        # người đang làm. Với mô hình Bể việc, nhân viên nhận việc ở runtime;
        # nếu bản sửa quy trình không khai báo người cụ thể thì phải giữ người
        # đã nhận trước đó. Nếu không, mỗi lần Giám đốc bấm "Áp dụng" từ một
        # revision rỗng assignment sẽ vô tình chuyển người đang làm thành
        # replaced và UI hiện "0 người" dù Node vẫn in_progress.
        effective_desired_assignments = desired_assignments or active_assignment_payload
        current_assignment_signature = sorted(
            (
                str(item["employee_id"]),
                str(item["role_code"]),
                bool(item["is_primary"]),
                str(item["notes"] or "").strip(),
            )
            for item in active_assignments
        )
        desired_assignment_signature = sorted(
            (
                str(item["employee_id"]),
                str(item["role_code"]),
                bool(item.get("is_primary")),
                str(item.get("notes") or "").strip(),
            )
            for item in effective_desired_assignments
        )
        assignments_changed = current_assignment_signature != desired_assignment_signature

        is_unstarted = (
            runtime_node["status"] in {"pending", "ready"}
            and runtime_node["started_at"] is None
        )
        if not is_unstarted:
            existing_keys = {
                row[0] for row in db.execute(
                    text("""
                        select checklist_key from public.task_node_checklist_results
                        where task_node_id = :task_node_id
                    """),
                    {"task_node_id": runtime_node["id"]},
                ).all()
            }
            desired_keys = {
                item["key"] for item in (desired_node.get("checklist") or [])
            }
            if existing_keys != desired_keys:
                raise WorkflowValidationError(
                    f"Không thể thêm/xóa checklist của Node {node_key!r} vì công việc đã bắt đầu"
                )
            if assignments_changed:
                assignment_result = replace_node_assignments(
                    db,
                    task_node_id=str(runtime_node["id"]),
                    assignments=effective_desired_assignments,
                    replacement_reason=f"Áp dụng Revision {revision['revision_no']}",
                    actor_id=actor_id,
                )
                assignment_count += assignment_result["assignment_count"]
                compensation_assignment_count += assignment_result[
                    "compensation_assignment_count"
                ]
                projected_compensation_amount += assignment_result[
                    "projected_compensation_amount"
                ]
            continue
        existing_rows = db.execute(
            text("""
                select id, checklist_key, status
                from public.task_node_checklist_results
                where task_node_id = :task_node_id
                for update
            """),
            {"task_node_id": runtime_node["id"]},
        ).mappings().all()
        existing_by_key = {row["checklist_key"]: row for row in existing_rows}
        desired_by_key = {
            item["key"]: item for item in (desired_node.get("checklist") or [])
        }

        for checklist_key in set(existing_by_key) - set(desired_by_key):
            current = existing_by_key[checklist_key]
            if current["status"] in {"approved", "late_approved", "failed"}:
                raise WorkflowValidationError(
                    f"Không thể xóa checklist {checklist_key!r} vì đã có kết quả"
                )
            db.execute(
                text("""
                    update public.task_node_checklist_results
                    set status = 'not_applicable', is_required = false, updated_at = now(),
                        note = concat_ws(E'\n', note, :note)
                    where id = :checklist_id
                """),
                {
                    "checklist_id": current["id"],
                    "note": f"Đã loại khỏi Revision {revision['revision_no']}",
                },
            )
            db.execute(
                text("""
                    update public.task_node_checklist_assignments
                    set status = 'cancelled', ended_at = now(), updated_at = now(), reason = :reason
                    where checklist_result_id = :checklist_id
                      and status not in ('replaced', 'cancelled')
                """),
                {
                    "checklist_id": current["id"],
                    "reason": f"Checklist bị loại khỏi Revision {revision['revision_no']}",
                },
            )

        assignments = effective_desired_assignments
        for item in desired_by_key.values():
            current = existing_by_key.get(item["key"])
            if current and current["status"] in {"approved", "late_approved", "failed"}:
                continue
            if current and current["status"] in {"pending_approval", "late_pending_approval"}:
                raise WorkflowValidationError(
                    f"Không thể sửa checklist {item['key']!r} khi đang chờ duyệt"
                )
            compensation = item.get("compensation") or {"is_payable": False}
            is_payable = bool(compensation.get("is_payable"))
            evidence_definition = json.dumps(
                _checklist_evidence_data(item, include_files=False),
                ensure_ascii=False,
            )
            if current:
                checklist_result_id = current["id"]
                # Close the old pay assignment while the old checklist/rate pair still matches.
                db.execute(
                    text("""
                        update public.task_node_checklist_assignments
                        set status = 'replaced', ended_at = now(), updated_at = now(), reason = :reason
                        where checklist_result_id = :checklist_id
                          and status not in ('replaced', 'cancelled')
                    """),
                    {
                        "checklist_id": checklist_result_id,
                        "reason": f"Cập nhật theo Revision {revision['revision_no']}",
                    },
                )
                db.execute(
                    text("""
                        update public.task_node_checklist_results
                        set checklist_name = :checklist_name,
                            is_required = :is_required,
                            status = 'pending',
                            require_evidence = :require_evidence,
                            approver_role = :approver_role,
                            is_overdue = false,
                            late_reason = null,
                            evidence_data = coalesce(evidence_data, '{}'::jsonb)
                              || cast(:evidence_definition as jsonb),
                            work_item_id = :work_item_id,
                            is_payable = :is_payable,
                            pay_group_key = :pay_group_key,
                            pay_scope = :pay_scope,
                            pay_key = :pay_key,
                            updated_at = now()
                        where id = :checklist_id
                    """),
                    {
                        "checklist_id": checklist_result_id,
                        "checklist_name": item["name"],
                        "is_required": item.get("required") is not False,
                        "require_evidence": bool(item.get("require_evidence")),
                        "approver_role": item.get("approver_role") or "admin",
                        "evidence_definition": evidence_definition,
                        "work_item_id": compensation.get("work_item_id") if is_payable else None,
                        "is_payable": is_payable,
                        "pay_group_key": compensation.get("pay_group_key") if is_payable else None,
                        "pay_scope": compensation.get("pay_scope") if is_payable else None,
                        "pay_key": compensation.get("pay_key") if is_payable else None,
                    },
                )
            else:
                checklist_result_id = _insert_checklist_result(
                    db,
                    text("""
                        insert into public.task_node_checklist_results
                            (task_node_id, contract_id, checklist_key, checklist_name, is_required,
                             status, require_evidence, approver_role, evidence_data,
                             work_item_id, is_payable,
                             pay_group_key, pay_scope, pay_key, condition_result)
                        select n.id, sl.contract_id, :checklist_key, :checklist_name, :is_required,
                               'pending', :require_evidence, :approver_role,
                               cast(:evidence_data as jsonb), :work_item_id, :is_payable,
                               :pay_group_key, :pay_scope, :pay_key, '{}'::jsonb
                        from public.task_nodes n
                        join public.workflow_instances wi on wi.id = n.workflow_instance_id
                        join public.service_lines sl on sl.id = wi.service_line_id
                        where n.id = :task_node_id
                        returning id
                    """),
                    {
                        "task_node_id": runtime_node["id"],
                        "checklist_key": item["key"],
                        "checklist_name": item["name"],
                        "is_required": item.get("required") is not False,
                        "require_evidence": bool(item.get("require_evidence")),
                        "approver_role": item.get("approver_role") or "admin",
                        "evidence_data": json.dumps(
                            _checklist_evidence_data(item, include_files=True),
                            ensure_ascii=False,
                        ),
                        "work_item_id": compensation.get("work_item_id") if is_payable else None,
                        "is_payable": is_payable,
                        "pay_group_key": compensation.get("pay_group_key") if is_payable else None,
                        "pay_scope": compensation.get("pay_scope") if is_payable else None,
                        "pay_key": compensation.get("pay_key") if is_payable else None,
                    },
                checklist_name=item["name"],
                )
            checklist_count += 1

            if is_payable:
                rates = work_item_rates[compensation["work_item_id"]]
                for assignment in assignments:
                    rate = rates.get(assignment["role_code"])
                    if not rate or float(rate["amount"] or 0) <= 0:
                        continue
                    db.execute(
                        text("""
                            insert into public.task_node_checklist_assignments
                                (checklist_result_id, employee_id, role_code, pay_slot,
                                 share_percent, work_item_rate_id, status, assigned_by,
                                 approved_by, approved_at, reason)
                            values (:checklist_result_id, :employee_id, :role_code, 'PRIMARY',
                                    100, :rate_id, 'assigned', :actor_id,
                                    :actor_id, now(), :reason)
                        """),
                        {
                            "checklist_result_id": checklist_result_id,
                            "employee_id": assignment["employee_id"],
                            "role_code": assignment["role_code"],
                            "rate_id": rate["rate_id"],
                            "actor_id": actor_id,
                            "reason": f"Giám đốc duyệt Revision {revision['revision_no']}",
                        },
                    )
                    compensation_assignment_count += 1
                    projected_compensation_amount += float(rate["amount"] or 0)

            _ensure_manual_checklist_assignment(
                db,
                checklist_result_id=checklist_result_id,
                checklist_item=item,
                node_assignments=assignments,
                actor_id=actor_id,
                reason=f"Phân công checklist theo Revision {revision['revision_no']}",
            )

        # Node chưa bắt đầu phải theo đúng Revision vừa được áp dụng. Nếu giữ
        # defined_by_revision_id cũ, lúc nhân viên bấm Bắt đầu hệ thống sẽ đọc
        # duration/checklist của bản cũ và tính deadline sai.
        if runtime_node["defined_by_revision_id"] != revision["id"]:
            db.execute(
                text("""
                    update public.task_nodes
                    set defined_by_revision_id = :revision_id,
                        notes = :notes,
                        updated_at = now()
                    where id = :task_node_id
                      and status in ('pending', 'ready')
                      and started_at is null
                """),
                {
                    "task_node_id": runtime_node["id"],
                    "revision_id": revision["id"],
                    "notes": desired_node.get("description") or None,
                },
            )
            db.execute(
                text("""
                    insert into public.task_node_events
                        (task_node_id, event_type, from_status, to_status,
                         actor_user_id, payload)
                    values
                        (:task_node_id, 'REBASED_BY_REVISION', :status, :status,
                         :actor_id, cast(:payload as jsonb))
                """),
                {
                    "task_node_id": runtime_node["id"],
                    "status": runtime_node["status"],
                    "actor_id": actor_id,
                    "payload": json.dumps({
                        "from_revision_id": runtime_node["defined_by_revision_id"],
                        "to_revision_id": revision["id"],
                        "revision_no": revision["revision_no"],
                    }),
                },
            )
            rebased_node_count += 1

        if assignments_changed:
            # Checklist runtime rows above already use the assignment set from this
            # Revision. Replace only Node-level records here so the unified apply
            # action does not create a second set of active pay assignments.
            assignment_result = replace_node_assignments(
                db,
                task_node_id=str(runtime_node["id"]),
                assignments=effective_desired_assignments,
                replacement_reason=f"Áp dụng Revision {revision['revision_no']}",
                actor_id=actor_id,
                sync_checklist_assignments=False,
            )
            assignment_count += assignment_result["assignment_count"]

    for node_key in added_keys:
        node = graph_nodes[node_key]
        occurrence_no = db.execute(
            text("""
                select coalesce(max(occurrence_no), 0) + 1
                from public.task_nodes
                where workflow_instance_id = :instance_id and node_key = :node_key
            """),
            {"instance_id": instance["id"], "node_key": node_key},
        ).scalar_one()
        assignments = node.get("assignments") or []
        status = (
            "ready"
            if node_key == revision["graph"]["start_node"] and not has_live_node
            else "pending"
        )
        task_node_id = db.execute(
            text("""
                insert into public.task_nodes
                    (workflow_instance_id, defined_by_revision_id, node_key, node_code,
                     occurrence_no, status, execution_data, notes)
                values (:instance_id, :revision_id, :node_key, :node_code, :occurrence_no, :status,
                        '{}'::jsonb, :notes)
                returning id
            """),
            {
                "instance_id": instance["id"],
                "revision_id": revision["id"],
                "node_key": node_key,
                "node_code": node["task_code"],
                "occurrence_no": occurrence_no,
                "status": status,
                "notes": node.get("description") or None,
            },
        ).scalar_one()

        for item in node.get("checklist") or []:
            compensation = item.get("compensation") or {"is_payable": False}
            is_payable = bool(compensation.get("is_payable"))
            checklist_result_id = _insert_checklist_result(
                db,
                text("""
                    insert into public.task_node_checklist_results
                        (task_node_id, contract_id, checklist_key, checklist_name, is_required,
                         status, require_evidence, approver_role, evidence_data,
                         work_item_id, is_payable,
                         pay_group_key, pay_scope, pay_key, condition_result)
                    select n.id, sl.contract_id, :checklist_key, :checklist_name, :is_required,
                           'pending', :require_evidence, :approver_role,
                           cast(:evidence_data as jsonb), :work_item_id, :is_payable,
                           :pay_group_key, :pay_scope, :pay_key, '{}'::jsonb
                    from public.task_nodes n
                    join public.workflow_instances wi on wi.id = n.workflow_instance_id
                    join public.service_lines sl on sl.id = wi.service_line_id
                    where n.id = :task_node_id
                    returning id
                """),
                {
                    "task_node_id": task_node_id,
                    "checklist_key": item["key"],
                    "checklist_name": item["name"],
                    "is_required": item.get("required") is not False,
                    "require_evidence": bool(item.get("require_evidence")),
                    "approver_role": item.get("approver_role") or "admin",
                    "evidence_data": json.dumps(
                        _checklist_evidence_data(item, include_files=True),
                        ensure_ascii=False,
                    ),
                    "work_item_id": compensation.get("work_item_id") if is_payable else None,
                    "is_payable": is_payable,
                    "pay_group_key": compensation.get("pay_group_key") if is_payable else None,
                    "pay_scope": compensation.get("pay_scope") if is_payable else None,
                    "pay_key": compensation.get("pay_key") if is_payable else None,
                },
            checklist_name=item["name"],
            )
            checklist_count += 1
            if is_payable:
                rates = work_item_rates[compensation["work_item_id"]]
                for assignment in assignments:
                    rate = rates.get(assignment["role_code"])
                    if not rate or float(rate["amount"] or 0) <= 0:
                        continue
                    db.execute(
                        text("""
                            insert into public.task_node_checklist_assignments
                                (checklist_result_id, employee_id, role_code, pay_slot,
                                 share_percent, work_item_rate_id, status, assigned_by,
                                 approved_by, approved_at, reason)
                            values (:checklist_result_id, :employee_id, :role_code, 'PRIMARY',
                                    100, :rate_id, 'assigned', :actor_id,
                                    :actor_id, now(), :reason)
                        """),
                        {
                            "checklist_result_id": checklist_result_id,
                            "employee_id": assignment["employee_id"],
                            "role_code": assignment["role_code"],
                            "rate_id": rate["rate_id"],
                            "actor_id": actor_id,
                            "reason": "Giám đốc duyệt Node mới trong bản sửa đổi workflow",
                        },
                    )
                    compensation_assignment_count += 1
                    projected_compensation_amount += float(rate["amount"] or 0)

            _ensure_manual_checklist_assignment(
                db,
                checklist_result_id=checklist_result_id,
                checklist_item=item,
                node_assignments=assignments,
                actor_id=actor_id,
                reason="Phân công checklist cho Node mới trong bản sửa đổi workflow",
            )

        for assignment in assignments:
            db.execute(
                text("""
                insert into public.task_node_assignments
                    (task_node_id, employee_id, role_code, is_primary,
                     assignment_status, assigned_by, notes)
                values (:task_node_id, :employee_id, :role_code, :is_primary,
                        'assigned', :actor_id, :notes)
                """),
                {
                    "task_node_id": task_node_id,
                    "employee_id": assignment["employee_id"],
                    "role_code": assignment["role_code"],
                    "is_primary": assignment.get("is_primary", False),
                    "actor_id": actor_id,
                    "notes": assignment.get("notes"),
                },
            )
            assignment_count += 1
        db.execute(
            text("""
                insert into public.task_node_events
                    (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
                values (:task_node_id, 'ADDED_BY_REVISION', null, :status, :actor_id,
                        cast(:payload as jsonb))
            """),
            {
                "task_node_id": task_node_id,
                "status": status,
                "actor_id": actor_id,
                "payload": json.dumps({"revision_id": revision["id"]}),
            },
        )
        if status == "ready":
            provisioned_records.update(_ensure_node_module_records(
                db, task_node_id=task_node_id, actor_id=actor_id
            ))

    # Sửa thời lượng một node là dời hạn của cả dây phía sau — tính lại toàn bộ.
    planned_schedule = recompute_planned_deadlines(db, workflow_instance_id=instance["id"])

    return {
        "planned_end": planned_schedule.get("planned_end"),
        "instance_id": instance["id"],
        "revision_id": revision["id"],
        "revision_no": revision["revision_no"],
        "status": instance["status"],
        "amended": True,
        "node_count": len(added_keys),
        "removed_node_count": len(removed_keys),
        "checklist_count": checklist_count,
        "assignment_count": assignment_count,
        "rebased_node_count": rebased_node_count,
        "compensation_assignment_count": compensation_assignment_count,
        "projected_compensation_amount": projected_compensation_amount,
        **provisioned_records,
    }


def _collect_activation_readiness(
    db: Session,
    *,
    service_line_id: str,
    graph: dict[str, Any],
) -> dict[str, Any]:
    """Collect structured readiness blockers/warnings before any activation write."""
    from src.dossiers.register import applicable_templates

    nodes = (graph or {}).get("nodes") if isinstance(graph, dict) else {}
    nodes = nodes if isinstance(nodes, dict) else {}
    allocated_template_ids: set[str] = set()
    warnings: list[dict[str, Any]] = []
    for node_key, node in nodes.items():
        node_data = node if isinstance(node, dict) else {}
        checklist = node_data.get("checklist") if isinstance(node_data.get("checklist"), list) else []
        has_piece_rate_mapping = False
        for item in checklist:
            if not isinstance(item, dict):
                continue
            compensation = item.get("compensation")
            if isinstance(compensation, dict) and compensation.get("is_payable") and compensation.get("work_item_id"):
                has_piece_rate_mapping = True
            output_documents = item.get("output_documents")
            if not isinstance(output_documents, list):
                continue
            for doc in output_documents:
                if not isinstance(doc, dict):
                    continue
                template_id = str(doc.get("template_id") or "").strip()
                if template_id:
                    allocated_template_ids.add(template_id)

        departments = task_pool_departments(node_data.get("task_code"), node_data)
        is_survey_node = ("SURVEY" in departments) or (str(node_data.get("pool_department_code") or "").upper() == "SURVEY")
        if is_survey_node and not has_piece_rate_mapping:
            warnings.append({
                "code": "MISSING_PIECE_RATE_MAPPING",
                "node_key": str(node_key),
                "node_name": str(node_data.get("name") or node_data.get("task_code") or node_key),
            })

    required_templates = [
        template
        for template in applicable_templates(db, service_line_id)
        if bool(template.get("is_required"))
    ]
    # ── Giấy tờ chưa gán vào bước nào: CẢNH BÁO, không chặn ─────────────────
    #
    # Danh mục giấy của Master Data là bộ CHUẨN cho cả Gói, tức một gợi ý đầy đủ.
    # Nhưng một hợp đồng cụ thể có quyền chạy ít bước hơn: khách chỉ thuê đo vẽ
    # rồi nhận bản vẽ, không làm pháp lý. Ép quy trình đó phải dùng hết mọi loại
    # giấy của gói là bắt Giám đốc dựng thêm bước chỉ để thoả một danh sách.
    #
    # Vẫn phải NÓI RA: thiếu một tờ vì quy trình không cần là chuyện khác hẳn
    # thiếu vì quên. Chỉ người dựng quy trình phân biệt được hai cái đó, nên đưa
    # danh sách cho họ xem rồi tự quyết.
    for template in required_templates:
        template_id = str(template.get("id") or "").strip()
        if not template_id or template_id in allocated_template_ids:
            continue
        warnings.append({
            "code": "MANDATORY_OUTPUT_UNALLOCATED",
            "template_id": template_id,
            "template_name": str(template.get("name") or template_id),
        })

    if warnings:
        thieu_giay = [w for w in warnings if w["code"] == "MANDATORY_OUTPUT_UNALLOCATED"]
        thieu_khoan = [w for w in warnings if w["code"] == "MISSING_PIECE_RATE_MAPPING"]
        phan = []
        if thieu_giay:
            phan.append(
                f"{len(thieu_giay)} loại giấy trong bộ chuẩn của gói chưa gán vào bước nào. "
                "Quy trình này không cần tới chúng thì bỏ qua được."
            )
        if thieu_khoan:
            phan.append(
                f"{len(thieu_khoan)} bước chưa gắn khoán — nhân viên làm các bước đó "
                "sẽ không có tiền khoán."
            )
        return {
            "code": "ACTIVATION_CONFIRMATION_REQUIRED",
            "message": " ".join(phan),
            "blockers": [],
            "warnings": warnings,
            "requires_confirmation": True,
        }
    return {
        "code": "ACTIVATION_READY",
        "message": "",
        "blockers": [],
        "warnings": [],
        "requires_confirmation": False,
    }


def activate_workflow(
    db: Session,
    *,
    service_line_id: str,
    graph: dict[str, Any],
    source_workflow_version_id: str | None,
    change_reason: str | None,
    actor_id: str,
    confirm_warnings: bool = False,
) -> dict[str, Any]:
    """Lock a revision and materialize all runtime rows without committing."""
    readiness = _collect_activation_readiness(
        db,
        service_line_id=service_line_id,
        graph=graph,
    )
    if readiness["blockers"]:
        raise WorkflowActivationReadinessError(readiness)
    if readiness["requires_confirmation"] and not confirm_warnings:
        raise WorkflowActivationReadinessError(readiness)

    revision = save_workflow_draft(
        db,
        service_line_id=service_line_id,
        graph=graph,
        source_workflow_version_id=source_workflow_version_id,
        change_reason=change_reason,
        actor_id=actor_id,
        require_connected=True,
        # Node không có phân công sẽ đi vào Bể việc khi tới trạng thái ready.
        # Giám đốc vẫn có thể phân công trước; hai cơ chế cùng tồn tại.
        require_assignments=True,
    )
    instance = db.execute(
        text("""
            select id, status, active_revision_id
            from public.workflow_instances
            where id = :instance_id
            for update
        """),
        {"instance_id": revision["workflow_instance_id"]},
    ).mappings().one()
    if instance["active_revision_id"]:
        result = _apply_workflow_amendment(
            db,
            instance=dict(instance),
            revision=revision,
            source_workflow_version_id=source_workflow_version_id,
            actor_id=actor_id,
        )
        result["warnings"] = readiness["warnings"]
        return result

    db.execute(
        text("""
            update public.workflow_instance_revisions
            set status = 'active', activated_by = :actor_id, activated_at = now()
            where id = :revision_id and status = 'draft'
        """),
        {"revision_id": revision["id"], "actor_id": actor_id},
    )
    db.execute(
        text("""
            update public.workflow_instances
            set active_revision_id = :revision_id,
                source_workflow_version_id = :template_id,
                status = 'running', started_at = coalesce(started_at, now()), updated_at = now()
            where id = :instance_id
        """),
        {
            "revision_id": revision["id"],
            "template_id": source_workflow_version_id,
            "instance_id": instance["id"],
        },
    )

    graph_nodes = revision["graph"]["nodes"]
    start_node = revision["graph"]["start_node"]
    work_item_rates = _current_work_item_rates(db)
    created_node_ids: dict[str, str] = {}
    assignment_count = 0
    checklist_count = 0
    compensation_assignment_count = 0
    projected_compensation_amount = 0.0
    for node_key, node in graph_nodes.items():
        assignments = node.get("assignments") or []
        status = "ready" if node_key == start_node else "pending"
        task_node_id = db.execute(
            text("""
                insert into public.task_nodes
                    (workflow_instance_id, defined_by_revision_id, node_key, node_code,
                     occurrence_no, status, execution_data, notes)
                values
                    (:instance_id, :revision_id, :node_key, :node_code,
                     1, :status, '{}'::jsonb, :notes)
                returning id
            """),
            {
                "instance_id": instance["id"],
                "revision_id": revision["id"],
                "node_key": node_key,
                "node_code": node["task_code"],
                "status": status,
                "notes": node.get("description") or None,
            },
        ).scalar_one()
        created_node_ids[node_key] = task_node_id

        for item in node.get("checklist") or []:
            compensation = item.get("compensation") or {"is_payable": False}
            is_payable = bool(compensation.get("is_payable"))
            checklist_result_id = _insert_checklist_result(
                db,
                text("""
                    insert into public.task_node_checklist_results
                        (task_node_id, contract_id, checklist_key, checklist_name, is_required,
                         status, require_evidence, approver_role, evidence_data,
                         work_item_id, is_payable,
                         pay_group_key, pay_scope, pay_key, condition_result)
                    select n.id, sl.contract_id, :checklist_key, :checklist_name, :is_required,
                           'pending', :require_evidence, :approver_role,
                           cast(:evidence_data as jsonb), :work_item_id, :is_payable,
                           :pay_group_key, :pay_scope, :pay_key, '{}'::jsonb
                    from public.task_nodes n
                    join public.workflow_instances wi on wi.id = n.workflow_instance_id
                    join public.service_lines sl on sl.id = wi.service_line_id
                    where n.id = :task_node_id
                    returning id
                """),
                {
                    "task_node_id": task_node_id,
                    "checklist_key": item["key"],
                    "checklist_name": item["name"],
                    "is_required": item.get("required") is not False,
                    "require_evidence": bool(item.get("require_evidence")),
                    "approver_role": item.get("approver_role") or "admin",
                    "evidence_data": json.dumps(
                        _checklist_evidence_data(item, include_files=True),
                        ensure_ascii=False,
                    ),
                    "work_item_id": compensation.get("work_item_id") if is_payable else None,
                    "is_payable": is_payable,
                    "pay_group_key": compensation.get("pay_group_key") if is_payable else None,
                    "pay_scope": compensation.get("pay_scope") if is_payable else None,
                    "pay_key": compensation.get("pay_key") if is_payable else None,
                },
            checklist_name=item["name"],
            )
            checklist_count += 1

            if is_payable:
                rates = work_item_rates[compensation["work_item_id"]]
                for assignment in assignments:
                    rate = rates.get(assignment["role_code"])
                    if not rate or float(rate["amount"] or 0) <= 0:
                        continue
                    db.execute(
                        text("""
                            insert into public.task_node_checklist_assignments
                                (checklist_result_id, employee_id, role_code, pay_slot,
                                 share_percent, work_item_rate_id, status, assigned_by,
                                 approved_by, approved_at, reason)
                            values
                                (:checklist_result_id, :employee_id, :role_code, 'PRIMARY',
                                 100, :rate_id, 'assigned', :actor_id,
                                 :actor_id, now(), :reason)
                        """),
                        {
                            "checklist_result_id": checklist_result_id,
                            "employee_id": assignment["employee_id"],
                            "role_code": assignment["role_code"],
                            "rate_id": rate["rate_id"],
                            "actor_id": actor_id,
                            "reason": "Giám đốc duyệt cấu hình khoán khi kích hoạt workflow",
                        },
                    )
                    compensation_assignment_count += 1
                    projected_compensation_amount += float(rate["amount"] or 0)

            _ensure_manual_checklist_assignment(
                db,
                checklist_result_id=checklist_result_id,
                checklist_item=item,
                node_assignments=assignments,
                actor_id=actor_id,
                reason="Phân công checklist khi kích hoạt workflow",
            )

        for assignment in assignments:
            db.execute(
                text("""
                    insert into public.task_node_assignments
                        (task_node_id, employee_id, role_code, is_primary,
                         assignment_status, assigned_by, notes)
                    values
                        (:task_node_id, :employee_id, :role_code, :is_primary,
                         'assigned', :actor_id, :notes)
                """),
                {
                    "task_node_id": task_node_id,
                    "employee_id": assignment["employee_id"],
                    "role_code": assignment["role_code"],
                    "is_primary": assignment.get("is_primary", False),
                    "actor_id": actor_id,
                    "notes": assignment.get("notes"),
                },
            )
            assignment_count += 1

        db.execute(
            text("""
                insert into public.task_node_events
                    (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
                values
                    (:task_node_id, 'NODE_MATERIALIZED', null, :to_status, :actor_id,
                     cast(:payload as jsonb))
            """),
            {
                "task_node_id": task_node_id,
                "to_status": status,
                "actor_id": actor_id,
                "payload": json.dumps({
                    "revision_id": revision["id"],
                    "revision_no": revision["revision_no"],
                    "is_start_node": node_key == start_node,
                }),
            },
        )

    provisioned_records = _ensure_node_module_records(
        db, task_node_id=created_node_ids[start_node], actor_id=actor_id
    )

    # Dựng ngay lịch dự kiến cho TOÀN BỘ quy trình, không đợi từng node bắt đầu.
    # Giám đốc phải thấy ngày giao khách ngay lúc áp dụng quy trình.
    planned_schedule = recompute_planned_deadlines(db, workflow_instance_id=instance["id"])

    # Mở sẵn sổ giấy tờ của Hạng mục theo đúng Dạng hồ sơ, để nhân viên nhận
    # việc là thấy ngay phải thu những tờ gì — thay vì tự nhớ rồi sót.
    # Cả sổ gốc của Hợp đồng cũng mở luôn nếu chưa có (hợp đồng cũ chưa qua
    # luồng tạo mới thì đây là lần đầu tiên sổ được dựng).
    from src.dossiers.register import open_contract_register, open_service_line_register

    document_slots_created = open_service_line_register(
        db, service_line_id, actor_id=actor_id
    )
    contract_row = db.execute(
        text("select contract_id from public.service_lines where id = :id"),
        {"id": service_line_id},
    ).mappings().first()
    if contract_row:
        document_slots_created += open_contract_register(
            db, contract_row["contract_id"], actor_id=actor_id
        )

    return {
        "document_slots_created": document_slots_created,
        "planned_end": planned_schedule.get("planned_end"),
        "instance_id": instance["id"],
        "revision_id": revision["id"],
        "revision_no": revision["revision_no"],
        "status": "running",
        "node_count": len(created_node_ids),
        "checklist_count": checklist_count,
        "assignment_count": assignment_count,
        "compensation_assignment_count": compensation_assignment_count,
        "projected_compensation_amount": projected_compensation_amount,
        "warnings": readiness["warnings"],
        **provisioned_records,
    }


def replace_node_assignments(
    db: Session,
    *,
    task_node_id: str,
    assignments: list[dict[str, Any]],
    replacement_reason: str | None,
    actor_id: str,
    sync_checklist_assignments: bool = True,
) -> dict[str, Any]:
    """Replace active node assignments and append an immutable audit event."""
    node = db.execute(
        text("""
            select tn.id, tn.status, tn.workflow_instance_id, c.date_signed
            from public.task_nodes tn
            join public.workflow_instances wi on wi.id = tn.workflow_instance_id
            join public.service_lines sl on sl.id = wi.service_line_id
            join public.contracts c on c.id = sl.contract_id
            where tn.id = :task_node_id and wi.status in ('running', 'paused')
            for update of tn
        """),
        {"task_node_id": task_node_id},
    ).mappings().first()
    if not node:
        raise WorkflowValidationError("Node không tồn tại hoặc workflow không còn hoạt động")
    if node["status"] in ("submitted", "accepted", "skipped", "cancelled"):
        raise WorkflowValidationError("Không thể đổi phân công khi Node đã gửi duyệt hoặc đã kết thúc")

    normalized = [_normalize_assignment(item, str(task_node_id)) for item in assignments]
    if node["status"] in {"in_progress", "rework_required", "blocked"} and not normalized:
        raise WorkflowValidationError(
            "Node đang có người thực hiện; nếu muốn đổi người phải chọn người nhận mới."
        )
    duplicate_keys = [(item["employee_id"], item["role_code"]) for item in normalized]
    if len(duplicate_keys) != len(set(duplicate_keys)):
        raise WorkflowValidationError("Một nhân viên không được giao trùng cùng vai trò")
    if sum(int(item["is_primary"]) for item in normalized) > 1:
        raise WorkflowValidationError("Chỉ được có một người phụ trách chính")
    employee_ids = {item["employee_id"] for item in normalized}
    if employee_ids:
        active_ids = {
            row[0]
            for row in db.execute(
                text("select id from public.employees where id = any(:employee_ids) and coalesce(is_active, true)"),
                {"employee_ids": list(employee_ids)},
            ).all()
        }
        if active_ids != employee_ids:
            raise WorkflowValidationError("Danh sách phân công có nhân viên không còn hoạt động")

    payable_checklists = db.execute(
        text("""
            select id, checklist_name, work_item_id
            from public.task_node_checklist_results
            where task_node_id = :task_node_id
              and is_payable
              and status <> 'not_applicable'
            for update
        """),
        {"task_node_id": task_node_id},
    ).mappings().all()
    if payable_checklists and db.execute(
        text("select 1 from public.work_pay_entitlements where task_node_id = :task_node_id limit 1"),
        {"task_node_id": task_node_id},
    ).first():
        raise WorkflowValidationError("Node đã phát sinh lương khoán; không thể thay người nhận khoán")

    work_item_rates = _current_work_item_rates(db)
    for checklist in payable_checklists:
        rates = work_item_rates.get(checklist["work_item_id"], {})
        positive_roles = {
            role for role, rate in rates.items() if float(rate["amount"] or 0) > 0
        }
        assigned_by_role: dict[str, int] = {}
        for assignment in normalized:
            role = assignment["role_code"]
            assigned_by_role[role] = assigned_by_role.get(role, 0) + 1
        required_role = "MAIN" if "MAIN" in positive_roles else (
            "SUBMITTER" if "SUBMITTER" in positive_roles else None
        )
        if required_role and assigned_by_role.get(required_role, 0) == 0:
            raise WorkflowValidationError(
                f"Checklist {checklist['checklist_name']!r} cần phân công vai trò {required_role} để tính khoán"
            )
        duplicated_roles = sorted(
            role for role in positive_roles if assigned_by_role.get(role, 0) > 1
        )
        if duplicated_roles:
            raise WorkflowValidationError(
                f"Chưa hỗ trợ chia khoán cho nhiều người cùng vai trò {', '.join(duplicated_roles)}"
            )

    old_ids = [row[0] for row in db.execute(
        text("""
            select id from public.task_node_assignments
            where task_node_id = :task_node_id
              and assignment_status in ('proposed', 'assigned', 'accepted')
            for update
        """),
        {"task_node_id": task_node_id},
    ).all()]
    db.execute(
        text("""
            update public.task_node_assignments
            set assignment_status = 'replaced', ended_at = now(),
                replacement_reason = :reason, updated_at = now()
            where task_node_id = :task_node_id
              and assignment_status in ('proposed', 'assigned', 'accepted')
        """),
        {"task_node_id": task_node_id, "reason": (replacement_reason or "").strip() or None},
    )

    created_ids: list[str] = []
    for assignment in normalized:
        created_ids.append(db.execute(
            text("""
                insert into public.task_node_assignments
                    (task_node_id, employee_id, role_code, is_primary,
                     assignment_status, assigned_by, notes)
                values
                    (:task_node_id, :employee_id, :role_code, :is_primary,
                     'assigned', :actor_id, :notes)
                returning id
            """),
            {**assignment, "task_node_id": task_node_id, "actor_id": actor_id},
        ).scalar_one())

    # legal_submissions is provisioned when the Node becomes ready, which can
    # happen before a director assigns/reassigns the submitter. Keep that
    # operational contact in sync until the authority has issued a receipt;
    # after that point it is historical data and must not be rewritten.
    primary_assignment = next(
        (item for item in normalized if item["is_primary"]),
        normalized[0] if normalized else None,
    )
    legal_assignee_id = primary_assignment["employee_id"] if primary_assignment else None
    legal_contact_phone = None
    if legal_assignee_id:
        legal_contact_phone = db.execute(
            text("select phone from public.employees where id = :employee_id"),
            {"employee_id": legal_assignee_id},
        ).scalar()
    db.execute(
        text("""
            update public.legal_submissions
            set assigned_employee_id = :employee_id,
                contact_phone = :contact_phone,
                updated_at = now()
            where task_node_id = :task_node_id
              and receipt_code is null
        """),
        {
            "task_node_id": task_node_id,
            "employee_id": legal_assignee_id,
            "contact_phone": legal_contact_phone,
        },
    )

    compensation_assignment_count = 0
    projected_compensation_amount = 0.0
    if payable_checklists and sync_checklist_assignments:
        checklist_ids = [item["id"] for item in payable_checklists]
        db.execute(
            text("""
                update public.task_node_checklist_assignments
                set status = 'replaced', ended_at = now(), updated_at = now(), reason = :reason
                where checklist_result_id = any(:checklist_ids)
                  and status not in ('replaced', 'cancelled')
            """),
            {
                "checklist_ids": checklist_ids,
                "reason": (replacement_reason or "Điều chỉnh người nhận khoán").strip(),
            },
        )
        for checklist in payable_checklists:
            rates = work_item_rates.get(checklist["work_item_id"], {})
            for assignment in normalized:
                rate = rates.get(assignment["role_code"])
                if not rate or float(rate["amount"] or 0) <= 0:
                    continue
                db.execute(
                    text("""
                        insert into public.task_node_checklist_assignments
                            (checklist_result_id, employee_id, role_code, pay_slot,
                             share_percent, work_item_rate_id, status, assigned_by,
                             approved_by, approved_at, reason)
                        values
                            (:checklist_result_id, :employee_id, :role_code, 'PRIMARY',
                             100, :rate_id, 'assigned', :actor_id,
                             :actor_id, now(), :reason)
                    """),
                    {
                        "checklist_result_id": checklist["id"],
                        "employee_id": assignment["employee_id"],
                        "role_code": assignment["role_code"],
                        "rate_id": rate["rate_id"],
                        "actor_id": actor_id,
                        "reason": (replacement_reason or "Giám đốc điều chỉnh phân công khoán").strip(),
                    },
                )
                compensation_assignment_count += 1
                projected_compensation_amount += float(rate["amount"] or 0)

    db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            values
                (:task_node_id, 'ASSIGNMENTS_UPDATED', :status, :status, :actor_id,
                 cast(:payload as jsonb))
        """),
        {
            "task_node_id": task_node_id,
            "status": node["status"],
            "actor_id": actor_id,
            "payload": json.dumps({
                "replaced_assignment_ids": old_ids,
                "new_assignment_ids": created_ids,
                "compensation_assignment_count": compensation_assignment_count,
                "projected_compensation_amount": projected_compensation_amount,
                "reason": (replacement_reason or "").strip() or None,
            }),
        },
    )
    return {
        "task_node_id": task_node_id,
        "assignment_count": len(created_ids),
        "compensation_assignment_count": compensation_assignment_count,
        "projected_compensation_amount": projected_compensation_amount,
    }


def _require_node_assignment(db: Session, *, task_node_id: str, employee_id: str) -> None:
    assigned = db.execute(
        text("""
            select 1 from public.task_node_assignments
            where task_node_id = :task_node_id and employee_id = :employee_id
              and assignment_status not in ('replaced', 'declined')
        """),
        {"task_node_id": task_node_id, "employee_id": employee_id},
    ).first()
    if not assigned:
        raise WorkflowValidationError("Bạn không được phân công cho công việc này")


def is_workflow_instance_member(
    db: Session, *, workflow_instance_id: str, employee_id: str | None
) -> bool:
    """Nhân viên này có nằm trong nhóm thực hiện Hạng mục đó không.

    Repo vốn chỉ có ``_require_node_assignment`` — kiểm theo MỘT bước. Nhưng tủ hồ
    sơ là của cả Hạng mục: người làm K04 phải xem được giấy K01–K03 do người khác
    làm, nếu không họ không có gì để làm việc.

    Người NHẬN HỖ TRỢ cũng lọt vào đây mà không cần đường tra riêng:
    ``claim_node_help`` chèn một dòng phân công thật cho họ. Thêm một đường tra
    thứ hai vào cùng câu hỏi này là dựng hai nguồn sự thật.
    """
    if not employee_id:
        return False
    return bool(db.execute(
        text("""
            select 1
            from public.task_node_assignments a
            join public.task_nodes n on n.id = a.task_node_id
            where n.workflow_instance_id = :instance_id
              and a.employee_id = :employee_id
              and a.assignment_status not in ('replaced', 'declined')
            limit 1
        """),
        {"instance_id": workflow_instance_id, "employee_id": employee_id},
    ).first())


def prior_step_documents(db: Session, *, task_node_id: str) -> list[dict[str, Any]]:
    """Giấy CHÍNH THỨC của các bước đã hoàn thành trước bước này, gom theo bước.

    ── Ba lớp lọc, thiếu lớp nào tủ hồ sơ cũng thành bãi rác ────────────────────
    * bước chưa nghiệm thu  → chưa phải giấy chính thức
    * tệp bị Giám đốc trả   → bản hỏng của vòng sửa trước
    * bản đã bị thay        → ``doc_status <> 'DANG_DUNG'``, và lấy bản mới nhất
                              mỗi ô giấy

    ── Không ký sẵn link mở tệp ────────────────────────────────────────────────
    Chỉ trả TÊN. Một hồ sơ đi hết bảy bước có vài chục tờ; ký sẵn từng đấy link là
    vài chục lượt gọi storage cho một thao tác mà người ta thường chỉ mở một tờ.

    Thứ tự bước theo ``node_code`` rồi ``occurrence_no`` — cùng quy tắc
    ``_rollback_affected_nodes`` dùng, vì sau khi đánh số lại thì mã bước CHÍNH LÀ
    thứ tự chạy.
    """
    rows = db.execute(
        text("""
            with moc as (
                select workflow_instance_id, node_code, occurrence_no
                from public.task_nodes where id = :task_node_id
            )
            select distinct on (n.node_code, n.occurrence_no, coalesce(d.slot_id, d.id))
                   n.node_code, n.occurrence_no, n.status,
                   coalesce(
                     nullif(wn.name, ''), n.node_code
                   ) as node_name,
                   d.id as document_id,
                   coalesce(s.name, d.file_name) as name,
                   d.uploaded_at
            from moc
            join public.task_nodes n
              on n.workflow_instance_id = moc.workflow_instance_id
             and (n.node_code, n.occurrence_no) < (moc.node_code, moc.occurrence_no)
            join public.workflow_nodes wn on wn.code = n.node_code
            join public.task_node_checklist_results r on r.task_node_id = n.id
            join public.checklist_result_document_links l on l.checklist_result_id = r.id
            join public.dossier_documents d on d.id = l.document_id
            left join public.dossier_document_slots s on s.id = d.slot_id
            where n.status in ('accepted', 'completed')
              and l.review_status <> 'rejected'
              and d.doc_status = 'DANG_DUNG'
            order by n.node_code, n.occurrence_no, coalesce(d.slot_id, d.id),
                     d.uploaded_at desc, d.id desc
        """),
        {"task_node_id": task_node_id},
    ).mappings().all()

    by_node: dict[tuple[str, int], dict[str, Any]] = {}
    for row in rows:
        key = (row["node_code"], row["occurrence_no"])
        group = by_node.setdefault(key, {
            "node_code": row["node_code"],
            "node_name": row["node_name"],
            "status": row["status"],
            "documents": [],
        })
        group["documents"].append({
            "document_id": row["document_id"],
            "name": row["name"],
            "uploaded_at": row["uploaded_at"].isoformat() if row["uploaded_at"] else None,
        })
    return [by_node[key] for key in sorted(by_node)]


LEGAL_PACKAGE_ID = "sp_002"

# Hai bước NỘP CƠ QUAN theo đúng định nghĩa của mã bước. So sánh chữ thường vì
# dữ liệu cũ từng có cả "K05a" lẫn "K05A" — đúng cái bẫy đã làm K05a/K05b mất
# sạch phòng ban và vai trò trước đây.
_AGENCY_NODE_CODES_LOWER = frozenset({"k05a", "k05b"})


def is_agency_submission_node(*, node_code: str | None, requires_gov_submission: bool) -> bool:
    """Bước này có phải bước nộp cơ quan không.

    Nhận ra bằng HAI đường: cờ khai tay, hoặc mã bước. K05a/K05b theo định nghĩa
    là bước nộp cơ quan — bắt Giám đốc tick lại cái đã nằm trong mã bước là thừa,
    và quên tick thì hồ sơ im lặng không được tạo, tới lúc cần tra biên nhận mới
    biết.
    """
    if requires_gov_submission:
        return True
    return (node_code or "").strip().lower() in _AGENCY_NODE_CODES_LOWER

_NODE_START_CONTEXT_QUERY = text("""
    select sl.id as service_line_id, sl.contract_id,
           sl.survey_drive_folder_url, sl.task_type_id,
           tt.service_package_id,
           cu.full_name as customer_name, cu.phone as customer_phone
    from public.workflow_instances wi
    join public.service_lines sl on sl.id = wi.service_line_id
    join public.contracts c on c.id = sl.contract_id
    left join public.task_types tt on tt.id = sl.task_type_id
    left join public.customers cu on cu.id = c.customer_id
    where wi.id = :workflow_instance_id
""")

_NODE_PRIMARY_ASSIGNEE_QUERY = text("""
    select e.id as employee_id, e.phone
    from public.task_node_assignments a
    join public.employees e on e.id = a.employee_id
    where a.task_node_id = :task_node_id
      and a.assignment_status not in ('replaced', 'declined')
    order by a.is_primary desc, a.created_at asc
    limit 1
""")


def _node_definition(db: Session, task_node: dict) -> dict | None:
    """Định nghĩa của Node trong graph của Revision đang áp dụng."""
    graph_row = db.execute(
        text("""
            select graph from public.workflow_instance_revisions
            where workflow_instance_id = :instance_id and id = :revision_id
        """),
        {
            "instance_id": task_node["workflow_instance_id"],
            "revision_id": task_node["defined_by_revision_id"],
        },
    ).mappings().first()
    return (graph_row["graph"]["nodes"] or {}).get(task_node["node_key"]) if graph_row else None


def workflow_node_duration(node_definition: dict[str, Any] | None) -> timedelta:
    """Return a non-negative Node SLA duration stored in the workflow graph."""
    definition = node_definition or {}

    def _part(name: str) -> int:
        try:
            return max(0, int(definition.get(name) or 0))
        except (TypeError, ValueError):
            return 0

    return timedelta(
        days=_part("duration_days"),
        hours=_part("duration_hours"),
        minutes=_part("duration_minutes"),
    )


def recompute_planned_deadlines(db: Session, *, workflow_instance_id: str) -> dict[str, Any]:
    """Tính lại hạn của TOÀN BỘ node trong quy trình theo kế hoạch CỘNG DỒN.

    Trước đây mỗi node tính riêng: `hạn = lúc bấm bắt đầu + thời lượng của chính nó`.
    Cách đó sai ở hai chỗ:

    1. **Hạn đi giật lùi.** Node sau có thời lượng ngắn hơn node trước thì hạn của
       nó lại sớm hơn — K02 hạn 15/08 mà K03 (chạy sau) hạn 14/08.
    2. **Không biết ngày giao khách.** Quy trình 18 ngày mà hạn xa nhất chỉ 5 ngày,
       vì không có node nào cộng dồn thời lượng của các bước trước.

    Cách đúng: chạy dọc sơ đồ từ node bắt đầu, cộng dồn thời lượng.

        hạn(node) = hạn(node liền trước) + thời lượng(node)
        hạn(node đầu) = mốc khởi động + thời lượng(node đầu)

    Node có nhiều nhánh vào thì lấy mốc MUỘN NHẤT — phải chờ xong hết mới làm được.

    Đây là **kế hoạch cứng**: bắt đầu trễ thì hạn không dời, node báo trễ ngay.
    Đó là chủ ý — ngày giao khách phải cố định, và chậm thì phải thấy chậm.
    """
    rev = db.execute(
        text("""
            select r.graph, r.activated_at
            from public.workflow_instance_revisions r
            join public.workflow_instances wi on wi.active_revision_id = r.id
            where wi.id = :i
        """),
        {"i": workflow_instance_id},
    ).mappings().first()
    if not rev:
        return {"updated": 0}

    graph = rev["graph"] or {}
    graph_nodes = graph.get("nodes") or {}
    if not graph_nodes:
        return {"updated": 0}

    runtime = db.execute(
        text("""
            select node_key, id, started_at
            from public.task_nodes
            where workflow_instance_id = :i
        """),
        {"i": workflow_instance_id},
    ).mappings().all()
    if not runtime:
        return {"updated": 0}
    by_key = {r["node_key"]: r for r in runtime}

    # Mốc khởi động: lúc node đầu tiên thật sự bắt đầu. Chưa ai bắt đầu thì lấy
    # lúc giám đốc áp dụng quy trình, để sếp thấy ngay lịch dự kiến.
    started_timestamps = [r["started_at"] for r in runtime if r["started_at"]]
    anchor = min(started_timestamps) if started_timestamps else (rev["activated_at"] or datetime.now(timezone.utc))

    def get_node_duration(key: str) -> timedelta:
        return workflow_node_duration(graph_nodes.get(key))

    # Bậc vào để duyệt tô-pô. Bỏ cạnh tự trỏ và cạnh quay lui (quy trình cũ có
    # nhánh "cần bổ sung" quay ngược) — nếu không sẽ kẹt vòng lặp vô hạn.
    adj_list = {k: [] for k in graph_nodes}
    in_degrees = {k: 0 for k in graph_nodes}
    for key, d in graph_nodes.items():
        for dest in (d.get("transitions") or {}).values():
            if dest in graph_nodes and dest != key:
                adj_list[key].append(dest)
                in_degrees[dest] += 1

    deadlines: dict[str, datetime] = {}
    node_queue = [k for k, n in in_degrees.items() if n == 0] or [graph.get("start_node")]
    node_queue = [k for k in node_queue if k in graph_nodes]
    visited_nodes: set[str] = set()

    while node_queue:
        key = node_queue.pop(0)
        if key in visited_nodes:
            continue
        visited_nodes.add(key)
        incoming_anchor = deadlines.get(key, anchor)
        deadlines[key] = incoming_anchor + get_node_duration(key)
        for dest in adj_list[key]:
            # Node có nhiều nhánh vào phải chờ nhánh muộn nhất
            deadlines[dest] = max(deadlines.get(dest, deadlines[key]), deadlines[key])
            in_degrees[dest] -= 1
            if in_degrees[dest] <= 0 and dest not in visited_nodes:
                node_queue.append(dest)

    # Node còn kẹt do nhánh quay lui: vẫn phải có hạn, nối tiếp mốc muộn nhất
    for key in graph_nodes:
        if key not in deadlines:
            deadlines[key] = (max(deadlines.values()) if deadlines else anchor) + get_node_duration(key)

    # Quy trình chưa khai thời lượng ở bất kỳ bước nào là quy trình chưa có kế
    # hoạch — dựng hạn cho nó chỉ tạo ra một loạt việc "trễ" ngay từ lúc sinh ra.
    if sum((get_node_duration(k) for k in graph_nodes), timedelta(0)) == timedelta(0):
        return {"updated": 0, "anchor": anchor.isoformat() if anchor else None, "planned_end": None}

    updated_nodes_count = 0
    for key, deadline_dt in deadlines.items():
        node = by_key.get(key)
        # Bước khai 0 ngày vẫn phải có hạn: nó bằng hạn của bước liền trước, tức
        # phải xong trong cùng mốc đó. Bỏ qua thì nhân viên thấy "Không đặt hạn"
        # và không bao giờ bị nhắc trễ — đúng cái đang xảy ra ở node lưu trữ.
        if not node:
            continue
        db.execute(
            text("update public.task_nodes set deadline_at = :deadline_at, updated_at = now() where id = :i"),
            {"deadline_at": deadline_dt, "i": node["id"]},
        )
        updated_nodes_count += 1

    return {
        "updated": updated_nodes_count,
        "anchor": anchor.isoformat() if anchor else None,
        "planned_end": max(deadlines.values()).isoformat() if deadlines else None,
    }


def _maybe_create_legal_submission(
    db: Session, *, task_node: dict, node_def: dict, context: dict, actor_id: str
) -> str | None:
    """Bước nộp cơ quan -> tự sinh 1 dòng legal_submissions.

    "Bước nộp cơ quan" nhận ra bằng HAI đường: cờ ``requires_gov_submission`` khai
    tay, HOẶC mã bước nằm trong :data:`AGENCY_NODE_CODES`. K05a và K05b theo định
    nghĩa là bước nộp cơ quan — bắt Giám đốc tick lại cái đã nằm trong mã bước là
    thừa, và quên tick thì hồ sơ im lặng không được tạo.

    Ràng buộc giữ nguyên: chỉ Hạng mục thuộc gói Pháp Lý mới sinh hồ sơ. Gói Đo Vẽ
    dù có kèm 'hỗ trợ nộp' (trả 350k cho nhân viên) cũng KHÔNG theo dõi vòng đời hồ
    sơ — chặn ở đây để tick nhầm cờ cũng không tạo ra hồ sơ rác."""
    if not is_agency_submission_node(
        node_code=task_node.get("node_code"),
        requires_gov_submission=bool(node_def.get("requires_gov_submission")),
    ):
        return None
    if context.get("service_package_id") != LEGAL_PACKAGE_ID:
        return None

    # Cùng lý do như hồ sơ đo vẽ: một hạng mục một hồ sơ nộp, không phải một
    # hồ sơ cho mỗi bước có cờ.
    existing_id = db.execute(
        text("""
            select id from public.legal_submissions
            where service_line_id = :service_line_id
            order by created_at, id
            limit 1
        """),
        {"service_line_id": context["service_line_id"]},
    ).scalar()
    if existing_id:
        return existing_id

    assignee = db.execute(
        _NODE_PRIMARY_ASSIGNEE_QUERY, {"task_node_id": task_node["id"]}
    ).mappings().first()

    # HỒ SƠ (1 dòng / Hạng mục) giữ trạng thái vòng đời. Mỗi LẦN NỘP là một dòng
    # legal_submissions riêng treo dưới nó — nộp lại lần 3 không tạo hồ sơ mới.
    dossier_id = db.execute(
        text("""
            insert into public.legal_dossiers
                (service_line_id, contract_id, task_node_id, dossier_name,
                 assigned_employee_id, status, created_by)
            values (:service_line_id, :contract_id, :task_node_id, :dossier_name,
                    :assigned_employee_id, 'ASSIGNED', :created_by)
            on conflict (service_line_id) do update set task_node_id = excluded.task_node_id
            returning id
        """),
        {
            "service_line_id": context["service_line_id"],
            "contract_id": context["contract_id"],
            "task_node_id": task_node["id"],
            "dossier_name": context["customer_name"],
            "assigned_employee_id": assignee["employee_id"] if assignee else None,
            "created_by": actor_id,
        },
    ).scalar()

    db.execute(
        text("""
            insert into public.legal_dossier_events (dossier_id, from_status, to_status, note, actor_user_id)
            values (:d, null, 'ASSIGNED', :n, :a)
        """),
        {"d": dossier_id, "n": "Bộ phận đo vẽ đã bàn giao, hồ sơ chờ tiếp nhận", "a": actor_id},
    )

    return db.execute(
        text("""
            insert into public.legal_submissions
                (task_node_id, dossier_id, submit_seq, service_line_id, contract_id,
                 dossier_name, case_description, assigned_employee_id, contact_phone,
                 linked_survey_folder_url, created_by)
            values
                (:task_node_id, :dossier_id, 1, :service_line_id, :contract_id,
                 :dossier_name, :case_description, :assigned_employee_id, :contact_phone,
                 :linked_survey_folder_url, :created_by)
            returning id
        """),
        {
            "task_node_id": task_node["id"],
            "dossier_id": dossier_id,
            "service_line_id": context["service_line_id"],
            "contract_id": context["contract_id"],
            "dossier_name": context["customer_name"],
            "case_description": node_def.get("name"),
            "assigned_employee_id": assignee["employee_id"] if assignee else None,
            # SĐT bên Pháp lý là của NHÂN VIÊN đi nộp (in trên biên nhận để cơ quan liên hệ),
            # khác với tab Đo vẽ dùng SĐT khách hàng.
            "contact_phone": assignee["phone"] if assignee else None,
            "linked_survey_folder_url": context["survey_drive_folder_url"],
            "created_by": actor_id,
        },
    ).scalar()


def _maybe_create_survey_record(
    db: Session, *, task_node: dict, node_def: dict, context: dict, actor_id: str
) -> str | None:
    """Node có cờ creates_survey_record -> tự sinh 1 dòng hồ sơ Đo vẽ.

    Chỉ lưu phần dữ liệu KHÔNG có sẵn ở nơi khác (tên hồ sơ, phường, độ ưu tiên).
    Khách hàng, SĐT, người phụ trách, các mốc ngày… đọc thẳng lúc hiển thị để
    không bao giờ lệch với dữ liệu gốc."""
    if not node_def.get("creates_survey_record"):
        return None

    # Một HẠNG MỤC chỉ có MỘT hồ sơ đo vẽ, dù bao nhiêu bước trong quy trình
    # mang cờ này. Trước đây chỉ chặn trùng theo task_node_id, nên một quy trình
    # lỡ bật cờ ở ba bước là sinh ra ba hồ sơ đo vẽ cho cùng một hạng mục —
    # người dùng thấy ba dòng y hệt nhau trong danh sách và không biết bỏ cái nào.
    existing_id = db.execute(
        text("""
            select id from public.survey_records
            where service_line_id = :service_line_id
            order by created_at, id
            limit 1
        """),
        {"service_line_id": context["service_line_id"]},
    ).scalar()
    if existing_id:
        return existing_id

    return db.execute(
        text("""
            insert into public.survey_records
                (task_node_id, service_line_id, contract_id, dossier_name, created_by)
            values
                (:task_node_id, :service_line_id, :contract_id, :dossier_name, :created_by)
            on conflict (task_node_id) do nothing
            returning id
        """),
        {
            "task_node_id": task_node["id"],
            "service_line_id": context["service_line_id"],
            "contract_id": context["contract_id"],
            "dossier_name": context["customer_name"],
            "created_by": actor_id,
        },
    ).scalar()


def _ensure_node_module_records(
    db: Session, *, task_node_id: str, actor_id: str
) -> dict[str, str]:
    """Ensure module rows as soon as a Node enters the ready state.

    The task-node row is locked so transition, retry and employee-start calls
    cannot create duplicate records concurrently.  Calling this again is safe
    and returns the existing record IDs.
    """
    node = db.execute(
        text("""
            select id, status, workflow_instance_id, defined_by_revision_id, node_key
            from public.task_nodes
            where id = :task_node_id
            for update
        """),
        {"task_node_id": task_node_id},
    ).mappings().first()
    if not node:
        return {}

    node = dict(node)
    node_def = _node_definition(db, node)
    if not node_def:
        return {}
    context = db.execute(
        _NODE_START_CONTEXT_QUERY,
        {"workflow_instance_id": node["workflow_instance_id"]},
    ).mappings().first()
    if not context:
        return {}

    context = dict(context)
    result: dict[str, str] = {}
    legal_submission_id = _maybe_create_legal_submission(
        db, task_node=node, node_def=node_def, context=context, actor_id=actor_id
    )
    if legal_submission_id:
        result["legal_submission_id"] = legal_submission_id
    survey_record_id = _maybe_create_survey_record(
        db, task_node=node, node_def=node_def, context=context, actor_id=actor_id
    )
    if survey_record_id:
        result["survey_record_id"] = survey_record_id
    return result


def _inherit_predecessor_evidence(
    db: Session,
    *,
    workflow_instance_id: str,
    target_task_node_id: str,
) -> int:
    """Attach references to predecessor evidence without copying MinIO/R2 objects."""
    target_code = db.execute(
        text("select node_code from public.task_nodes where id = :node_id"),
        {"node_id": target_task_node_id},
    ).scalar()
    source_code = EVIDENCE_INHERITED_FROM_NODE.get(str(target_code or "").strip().upper())
    inherit_full_dossier = target_code == "K06"
    if not source_code and not inherit_full_dossier:
        return 0
    rows = db.execute(
        text("""
            select source.node_code, r.evidence_data
            from public.task_nodes source
            join public.task_node_checklist_results r on r.task_node_id = source.id
            where source.workflow_instance_id = :instance_id
              and source.id <> :target_node_id
              and (:inherit_full_dossier or source.node_code = :source_code)
              and source.status = 'accepted'
            order by source.accepted_at desc nulls last, r.created_at
        """),
        {
            "instance_id": workflow_instance_id,
            "target_node_id": target_task_node_id,
            "source_code": source_code,
            "inherit_full_dossier": inherit_full_dossier,
        },
    ).mappings().all()
    files: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        for file_ref in (row["evidence_data"] or {}).get("files", []):
            identity = str(
                file_ref.get("object_key")
                or file_ref.get("url")
                or file_ref.get("file_url")
                or file_ref.get("name")
                or ""
            )
            if not identity or identity in seen:
                continue
            seen.add(identity)
            files.append({**file_ref, "inherited_from_node_code": row["node_code"]})
    if not files:
        return 0
    db.execute(
        text("""
            update public.task_nodes
            set execution_data = jsonb_set(
                    coalesce(execution_data, '{}'::jsonb),
                    '{inherited_files}', cast(:files as jsonb), true
                ),
                updated_at = now()
            where id = :node_id
        """),
        {
            "node_id": target_task_node_id,
            "files": json.dumps(files, ensure_ascii=False),
        },
    )
    return len(files)


def _bind_claimed_employee_to_payable_checklists(
    db: Session,
    *,
    task_node_id: str,
    employee_id: str,
    role_code: str,
    actor_id: str,
) -> dict[str, float | int]:
    """Bind the claim holder to configured payable checklist work, by reference.

    The configured work item and published rate remain authoritative.  Claiming
    never creates a new rate and never copies money into the Node JSON.
    """
    rates = _current_work_item_rates(db)
    rows = db.execute(
        text("""
            select id, work_item_id
            from public.task_node_checklist_results
            where task_node_id = :task_node_id and coalesce(is_payable, false)
        """),
        {"task_node_id": task_node_id},
    ).mappings().all()
    count = 0
    amount = 0.0
    for row in rows:
        rate = (rates.get(row["work_item_id"]) or {}).get(role_code)
        if not rate or float(rate["amount"] or 0) <= 0:
            continue
        created = db.execute(
            text("""
                insert into public.task_node_checklist_assignments
                    (checklist_result_id, employee_id, role_code, pay_slot,
                     share_percent, work_item_rate_id, status, assigned_by,
                     approved_by, approved_at, reason)
                select :checklist_result_id, :employee_id, :role_code, 'PRIMARY',
                       100, :rate_id, 'assigned', :actor_id,
                       :actor_id, now(), :reason
                where not exists (
                    select 1 from public.task_node_checklist_assignments
                    where checklist_result_id = :checklist_result_id
                      and employee_id = :employee_id
                      and role_code = :role_code
                      and status not in ('replaced', 'cancelled')
                )
                returning id
            """),
            {
                "checklist_result_id": row["id"],
                "employee_id": employee_id,
                "role_code": role_code,
                "rate_id": rate["rate_id"],
                "actor_id": actor_id,
                "reason": "Nhân viên nhận việc từ Bể việc",
            },
        ).scalar()
        if created:
            count += 1
            amount += float(rate["amount"] or 0)
    return {"compensation_assignment_count": count, "projected_compensation_amount": amount}


def _reserve_main_workflow_chain(
    db: Session,
    *,
    workflow_instance_id: str,
    claimed_task_node_id: str,
    department_code: str,
    employee_id: str,
    actor_id: str,
) -> dict[str, Any]:
    """Giữ quyền MAIN cho các Node cùng phòng khi nhân viên nhận trọn chuỗi.

    Node tương lai chỉ được gán người phụ trách, tuyệt đối không bị khởi động sớm:
    trạng thái ``pending``/``ready`` và luật chuyển bước vẫn giữ nguyên. Suất
    ``ASSISTANT`` cũng không bị chiếm để nhân viên khác còn có thể nhận hỗ trợ
    trước khi thợ chính bắt đầu phần việc cần người phụ.
    """
    normalized_department = str(department_code or "").strip().upper()
    if not normalized_department:
        return {"reserved_task_node_ids": [], "_reserved_by_code": {}}

    candidates = db.execute(
        text("""
            select n.id, n.node_code, n.status,
                   coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key as node_definition
            from public.task_nodes n
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            left join public.workflow_instance_revisions r_act
              on r_act.id = wi.active_revision_id
            left join public.workflow_instance_revisions r_def
              on r_def.id = n.defined_by_revision_id
            where n.workflow_instance_id = :instance_id
              and n.id <> :claimed_task_node_id
              and n.status not in ('accepted', 'cancelled', 'skipped')
            order by n.created_at, n.occurrence_no
            for update of n
        """),
        {
            "instance_id": workflow_instance_id,
            "claimed_task_node_id": claimed_task_node_id,
        },
    ).mappings().all()

    reserved_ids: list[str] = []
    reserved_by_code: dict[str, str] = {}
    for candidate in candidates:
        definition = candidate["node_definition"] or {}
        if normalized_department not in task_pool_departments(
            candidate["node_code"], definition
        ):
            continue
        if "MAIN" not in task_pool_roles(candidate["node_code"], definition):
            continue

        assignment_id = db.execute(
            text("""
                insert into public.task_node_assignments
                    (task_node_id, employee_id, role_code, is_primary,
                     assignment_status, assigned_by, notes)
                select :task_node_id, :employee_id, 'MAIN', true,
                       'assigned', :actor_id, :notes
                where not exists (
                    select 1 from public.task_node_assignments
                    where task_node_id = :task_node_id
                      and role_code = 'MAIN'
                      and assignment_status in ('proposed', 'assigned', 'accepted')
                )
                returning id
            """),
            {
                "task_node_id": candidate["id"],
                "employee_id": employee_id,
                "actor_id": actor_id,
                "notes": "Giữ phụ trách chính khi nhận trọn chuỗi từ Bể việc",
            },
        ).scalar()
        if not assignment_id:
            # Tôn trọng người MAIN đã được phân công trước; không cướp hoặc ghi đè.
            continue

        db.execute(
            text("""
                insert into public.task_node_events
                    (task_node_id, event_type, from_status, to_status,
                     actor_user_id, payload)
                values (:task_node_id, 'TASK_CHAIN_RESERVED', :status, :status,
                        :actor_id, cast(:payload as jsonb))
            """),
            {
                "task_node_id": candidate["id"],
                "status": candidate["status"],
                "actor_id": actor_id,
                "payload": json.dumps({
                    "assignment_id": assignment_id,
                    "employee_id": employee_id,
                    "role_code": "MAIN",
                    "reserved_with_task_node_id": claimed_task_node_id,
                }),
            },
        )
        _bind_claimed_employee_to_payable_checklists(
            db,
            task_node_id=candidate["id"],
            employee_id=employee_id,
            role_code="MAIN",
            actor_id=actor_id,
        )
        reserved_ids.append(candidate["id"])
        reserved_by_code.setdefault(candidate["node_code"], candidate["id"])

    return {
        "reserved_task_node_ids": reserved_ids,
        "_reserved_by_code": reserved_by_code,
    }


def _bundle_claim_cad_followup(
    db: Session,
    *,
    workflow_instance_id: str,
    employee_id: str,
    actor_id: str,
) -> dict[str, Any]:
    """Nhận ca đo K02 là nhận trọn chuỗi đo vẽ: gán luôn thợ chính cho K03.

    Đo một người, vẽ một người là gốc rễ của mọi cuộc đổ lỗi khi bản vẽ lệch số
    liệu thực địa — không ai chịu trách nhiệm cuối. Ai cắm mốc thì người đó xuất
    bản vẽ.

    K03 chỉ được GÁN chứ không mở sang in_progress: nó vẫn phải chờ K02 nghiệm
    thu xong mới tới lượt. Gán sớm để bước vẽ không rơi lại ra Bể việc công cộng
    và để hàng rào WIP nhìn thấy đúng tải người này đang giữ.

    Hàng khoá: câu select dưới đây khoá đúng dòng K03 (``for update``) — cùng
    dòng mà luồng nhận trực tiếp từ Bể việc cũng khoá — nên hai đường không thể
    chèn trùng. Nếu bước vẽ đã có người giữ, ta bỏ qua việc gộp chứ KHÔNG chặn
    ca đo: chặn cả chuỗi vì một bước đã có chủ là làm đứng Bể việc vô cớ.
    """
    cad = db.execute(
        text("""
            select n.id, n.status
            from public.task_nodes n
            where n.workflow_instance_id = :instance_id
              and n.node_code = 'K03'
              and n.status not in ('cancelled', 'skipped', 'accepted')
            order by n.occurrence_no, n.created_at
            limit 1
            for update of n
        """),
        {"instance_id": workflow_instance_id},
    ).mappings().first()
    if not cad:
        return {"bundled_cad_task_node_id": None}

    assignment_id = db.execute(
        text("""
            insert into public.task_node_assignments
                (task_node_id, employee_id, role_code, is_primary,
                 assignment_status, assigned_by, notes)
            select :task_node_id, :employee_id, 'MAIN', true,
                   'assigned', :actor_id, :notes
            where not exists (
                select 1 from public.task_node_assignments
                where task_node_id = :task_node_id
                  and role_code = 'MAIN'
                  and assignment_status in ('proposed', 'assigned', 'accepted')
            )
            returning id
        """),
        {
            "task_node_id": cad["id"],
            "employee_id": employee_id,
            "actor_id": actor_id,
            "notes": "Nhận trọn chuỗi đo vẽ K02 ➔ K03 từ Bể việc",
        },
    ).scalar()
    if not assignment_id:
        return {"bundled_cad_task_node_id": None}

    db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            values (:task_node_id, 'TASK_CLAIMED', :status, :status, :actor_id,
                    cast(:payload as jsonb))
        """),
        {
            "task_node_id": cad["id"],
            "status": cad["status"],
            "actor_id": actor_id,
            "payload": json.dumps({
                "assignment_id": assignment_id,
                "employee_id": employee_id,
                "role_code": "MAIN",
                "bundled_with_node_code": "K02",
            }),
        },
    )
    _bind_claimed_employee_to_payable_checklists(
        db,
        task_node_id=cad["id"],
        employee_id=employee_id,
        role_code="MAIN",
        actor_id=actor_id,
    )
    return {"bundled_cad_task_node_id": cad["id"]}


def _workflow_handover_gate_open(
    db: Session,
    *,
    workflow_instance_id: str,
    contract_id: str,
    total_value: Any,
) -> bool:
    """Check the final K06 gate without confusing approved debt with paid debt."""
    from src.dossiers.handover import debt_summary

    has_handover = db.execute(
        text("""
            select 1
            from public.task_nodes node
            join public.workflow_instances instance on instance.id = node.workflow_instance_id
            left join public.workflow_instance_revisions active_revision
              on active_revision.id = instance.active_revision_id
            left join public.workflow_instance_revisions defined_revision
              on defined_revision.id = node.defined_by_revision_id
            where node.workflow_instance_id = :workflow_instance_id
              and coalesce((coalesce(active_revision.graph, defined_revision.graph)
                    ->'nodes'->node.node_key->>'is_handover')::boolean, false)
            limit 1
        """),
        {"workflow_instance_id": workflow_instance_id},
    ).first()
    if not has_handover:
        return True

    debt = debt_summary(db, contract_id, total_value)
    if handover_completion_gate_satisfied(debt):
        return True
    approved_override = db.execute(
        text("""
            select 1
            from public.handover_debt_requests request
            join public.task_nodes node on node.id = request.task_node_id
            where node.workflow_instance_id = :workflow_instance_id
              and request.contract_id = :contract_id
              and request.status = 'approved'
            limit 1
        """),
        {
            "workflow_instance_id": workflow_instance_id,
            "contract_id": contract_id,
        },
    ).first()
    return bool(approved_override)


def claim_and_start_task(
    db: Session,
    *,
    task_node_id: str,
    employee_id: str,
    role_code: str,
    actor_id: str,
    start_now: bool = True,
) -> dict[str, Any]:
    """Atomically claim a pool role and begin the Node.

    Redis absorbs simultaneous clicks across workers; the locked Node row and
    partial unique index remain the final authority when Redis is unavailable.

    ``start_now=False`` chỉ NHẬN chứ không bắt đầu: bước ở lại 'ready', nhân viên
    bấm Bắt đầu sau. Đường nhận cả cụm cần cái này — gán 5 bước một lúc mà bước
    nào cũng tự chạy thì vỡ luật đơn nhiệm ngay lúc gán.

    Mặc định ``True`` để đường nhận lẻ đang chạy giữ nguyên hành vi.
    """
    from src.core.redis_utils import redis_distributed_lock

    normalized_role = str(role_code or "MAIN").strip().upper()
    with redis_distributed_lock(
        f"claim_node:{task_node_id}:{normalized_role}",
        timeout_seconds=5,
        blocking_timeout=0,
        custom_error_msg="Công việc vừa được người khác nhận. Bể việc đang được cập nhật.",
    ):
        employee = db.execute(
            text("""
                select e.id, d.code as department_code
                from public.employees e
                left join public.departments d on d.id = e.department_id
                where e.id = :employee_id and coalesce(e.is_active, true)
            """),
            {"employee_id": employee_id},
        ).mappings().first()
        if not employee:
            raise WorkflowValidationError("Nhân viên không tồn tại hoặc đã ngừng hoạt động")

        node = db.execute(
            text("""
                select n.id, n.node_code, n.status, n.workflow_instance_id,
                       n.defined_by_revision_id, n.node_key,
                       coalesce(n.execution_data, '{}'::jsonb) as execution_data,
                       coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key as node_definition
                from public.task_nodes n
                join public.workflow_instances wi on wi.id = n.workflow_instance_id
                left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
                left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
                where n.id = :task_node_id and wi.status = 'running'
                for update of n
            """),
            {"task_node_id": task_node_id},
        ).mappings().first()
        if not node:
            raise WorkflowValidationError("Node không tồn tại hoặc quy trình không còn vận hành")
        if node["status"] not in ("ready", "in_progress"):
            raise WorkflowValidationError("Công việc này chưa sẵn sàng để nhận")

        node_definition = node["node_definition"] or {}
        allowed_departments = task_pool_departments(node["node_code"], node_definition)
        if not allowed_departments:
            raise WorkflowValidationError("Bước này do Giám đốc phân công, không thuộc Bể việc")
        if str(employee["department_code"] or "").upper() not in allowed_departments:
            raise WorkflowValidationError("Bạn không thuộc phòng ban phụ trách bước này")
        if normalized_role not in task_pool_roles(node["node_code"], node_definition):
            raise WorkflowValidationError("Vai trò nhận việc không hợp lệ cho bước này")
        if (
            node["node_code"] == "K02"
            and normalized_role == "ASSISTANT"
            and (node["execution_data"] or {}).get("field_started_at")
        ):
            raise TaskClaimConflict(
                "Thợ chính đã bắt đầu đo hiện trường — suất thợ phụ của ca này đã đóng."
            )

        existing_role = db.execute(
            text("""
                select e.full_name
                from public.task_node_assignments a
                join public.employees e on e.id = a.employee_id
                where a.task_node_id = :task_node_id
                  and a.role_code = :role_code
                  and a.assignment_status in ('proposed', 'assigned', 'accepted')
                limit 1
            """),
            {"task_node_id": task_node_id, "role_code": normalized_role},
        ).mappings().first()
        if existing_role:
            raise TaskClaimConflict(
                f"Công việc vừa được {existing_role['full_name']} nhận trước bạn."
            )

        # Chỉ chặn khi lần nhận này SẼ bắt đầu luôn. Nhận mà không bắt đầu —
        # đường nhận cả cụm — thì không vướng đơn nhiệm, vì mọi bước nằm ở
        # 'assigned' chứ chưa chạy.
        if start_now:
            busy = blocking_in_progress_node(
                db, employee_id=employee_id, task_node_id=task_node_id
            )
            if busy:
                raise WorkflowValidationError(single_task_error(busy))

        # Hàng rào tải áp cho MỌI lần nhận chuỗi, không riêng bước đo. Trước đây
        # chỉ chặn ở K02 nên nhận thẳng bước khác là lách được hạn mức.
        # Nhận thêm bước trong hạng mục đang giữ thì không tính thêm slot.
        if normalized_role != "ASSISTANT":
            dang_giu = held_item_count(
                db,
                employee_id=employee_id,
                exclude_instance_id=node["workflow_instance_id"],
            )
            if wip_limit_reached(dang_giu):
                raise WorkflowValidationError(
                    f"Bạn đang giữ tối đa {WIP_ITEM_LIMIT} hạng mục dở dang. "
                    "Hãy hoàn thành nghiệm thu một hạng mục để nhận thêm việc mới."
                )

        if node["node_code"] == "K03":
            preferred = db.execute(
                text("""
                    select a.employee_id, e.full_name, k02.accepted_at
                    from public.task_nodes k02
                    join public.task_node_assignments a on a.task_node_id = k02.id
                    join public.employees e on e.id = a.employee_id
                    where k02.workflow_instance_id = :instance_id
                      and k02.node_code = 'K02'
                      and k02.status = 'accepted'
                      and a.role_code = 'MAIN'
                      and a.assignment_status in ('assigned', 'accepted', 'completed')
                    order by k02.accepted_at desc nulls last
                    limit 1
                """),
                {"instance_id": node["workflow_instance_id"]},
            ).mappings().first()
            if (
                preferred
                and preferred["employee_id"] != employee_id
                and within_same_contract_preference_window(preferred["accepted_at"])
            ):
                raise TaskClaimConflict(
                    f"Bước CAD đang được ưu tiên 30 phút cho {preferred['full_name']}, người đã đo K02."
                )

        assignment_id = db.execute(
            text("""
                insert into public.task_node_assignments
                    (task_node_id, employee_id, role_code, is_primary,
                     assignment_status, assigned_by, notes)
                select :task_node_id, :employee_id, :role_code, :is_primary,
                       'assigned', :actor_id, :notes
                where not exists (
                    select 1 from public.task_node_assignments
                    where task_node_id = :task_node_id
                      and role_code = :role_code
                      and assignment_status in ('proposed', 'assigned', 'accepted')
                )
                returning id
            """),
            {
                "task_node_id": task_node_id,
                "employee_id": employee_id,
                "role_code": normalized_role,
                "is_primary": normalized_role == "MAIN",
                "actor_id": actor_id,
                "notes": "Nhận việc từ Bể việc",
            },
        ).scalar()
        if not assignment_id:
            raise TaskClaimConflict("Công việc vừa được người khác nhận trước bạn.")

        previous_status = node["status"]
        if start_now and previous_status == "ready":
            db.execute(
                text("""
                    update public.task_nodes
                    set status = 'in_progress', started_at = coalesce(started_at, now()), updated_at = now()
                    where id = :task_node_id and status = 'ready'
                """),
                {"task_node_id": task_node_id},
            )
        # Trạng thái SAU khi nhận, không phải trạng thái mong muốn. Nhận mà không
        # bắt đầu thì bước ở lại chỗ cũ — ghi 'in_progress' vào nhật ký là dựng
        # một mốc chưa từng xảy ra, và mọi thứ đọc nhật ký về sau đều lệch.
        resulting_status = "in_progress" if start_now else previous_status
        db.execute(
            text("""
                insert into public.task_node_events
                    (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
                values (:task_node_id, 'TASK_CLAIMED', :from_status, :to_status, :actor_id,
                        cast(:payload as jsonb))
            """),
            {
                "task_node_id": task_node_id,
                "from_status": previous_status,
                "to_status": resulting_status,
                "actor_id": actor_id,
                "payload": json.dumps({
                    "assignment_id": assignment_id,
                    "employee_id": employee_id,
                    "role_code": normalized_role,
                }),
            },
        )
        compensation = _bind_claimed_employee_to_payable_checklists(
            db,
            task_node_id=task_node_id,
            employee_id=employee_id,
            role_code=normalized_role,
            actor_id=actor_id,
        )
        chain_reservation: dict[str, Any] = {"reserved_task_node_ids": []}
        if normalized_role == "MAIN":
            chain_reservation = _reserve_main_workflow_chain(
                db,
                workflow_instance_id=node["workflow_instance_id"],
                claimed_task_node_id=task_node_id,
                department_code=str(employee["department_code"] or "").upper(),
                employee_id=employee_id,
                actor_id=actor_id,
            )
        reserved_by_code = chain_reservation.pop("_reserved_by_code", {})
        bundled: dict[str, Any] = {
            # Giữ tương thích response cũ của luồng nhận K02 -> K03.
            "bundled_cad_task_node_id": reserved_by_code.get("K03"),
        }
        recompute_planned_deadlines(db, workflow_instance_id=node["workflow_instance_id"])
        provisioned = _ensure_node_module_records(db, task_node_id=task_node_id, actor_id=actor_id)
        return {
            "task_node_id": task_node_id,
            "assignment_id": assignment_id,
            "role_code": normalized_role,
            "status": resulting_status,
            **compensation,
            **bundled,
            **chain_reservation,
            **provisioned,
        }


def cluster_nodes_for_claim(
    db: Session, *, workflow_instance_id: str, cluster_code: str
) -> list[dict[str, Any]]:
    """Các bước thuộc một cụm trong một hạng mục, xếp theo mã bước.

    Thứ tự CỐ ĐỊNH theo ``node_code`` là thứ chống deadlock: hai người nhận hai
    cụm có bước giao nhau mà mỗi người khoá theo một thứ tự khác là hai giao dịch
    ôm chéo nhau rồi cùng đứng. Xếp cùng một thứ tự thì người tới sau chỉ việc
    chờ, không ai chết.
    """
    return [dict(row) for row in db.execute(
        text("""
            select n.id, n.node_code, n.status, n.node_key,
                   coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key as node_definition
            from public.task_nodes n
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            join public.workflow_nodes wn on wn.code = n.node_code
            left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
            left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
            where n.workflow_instance_id = :instance_id
              and wn.cluster_code = :cluster_code
              and wi.status = 'running'
              and n.status not in ('cancelled', 'completed', 'accepted')
            order by n.node_code
            for update of n
        """),
        {"instance_id": workflow_instance_id, "cluster_code": cluster_code},
    ).mappings().all()]


def claim_cluster(
    db: Session,
    *,
    workflow_instance_id: str,
    cluster_code: str,
    employee_id: str,
    actor_id: str,
) -> dict[str, Any]:
    """Nhận trọn một cụm bước của một hạng mục.

    ── Vì sao nhận cả cụm ───────────────────────────────────────────────────────
    Đo vẽ đi [K02 → K03 → K05a], Pháp lý đi [K01 → K04 → K05b → K06 → K07]. Bắt
    nhân viên quay lại bể việc giành từng bước là mời người khác chen vào giữa
    chuỗi của họ, và hồ sơ đổi tay ba lần giữa đường.

    ── Nhận KHÔNG phải là bắt đầu ───────────────────────────────────────────────
    Mọi bước chỉ được GÁN, không bước nào chuyển ``in_progress``. Đây là chỗ luật
    nhận-cụm và luật đơn nhiệm thôi đá nhau: gán 5 bước vẫn hợp lệ vì cả 5 đều
    nằm yên, đúng một bước được chạy tại một thời điểm.

    ── Nguyên tử tuyệt đối ──────────────────────────────────────────────────────
    Một khoá Redis cho CẢ CỤM, không khoá từng bước — khoá từng bước là hai người
    nhận được hai nửa cụm. Bước nào vướng thì ném lỗi, và vì cả hàm chạy trong
    một giao dịch nên không ai ôm nửa cụm.
    """
    from src.core.redis_utils import redis_distributed_lock

    normalized_cluster = str(cluster_code or "").strip().upper()
    if not normalized_cluster:
        raise WorkflowValidationError("Chưa chọn cụm công việc")

    with redis_distributed_lock(
        f"claim_cluster:{workflow_instance_id}:{normalized_cluster}",
        timeout_seconds=10,
        blocking_timeout=0,
        custom_error_msg="Cụm này vừa được người khác nhận. Bể việc đang được cập nhật.",
    ):
        employee = db.execute(
            text("""
                select e.id, d.code as department_code
                from public.employees e
                left join public.departments d on d.id = e.department_id
                where e.id = :employee_id and coalesce(e.is_active, true)
            """),
            {"employee_id": employee_id},
        ).mappings().first()
        if not employee:
            raise WorkflowValidationError("Nhân viên không tồn tại hoặc đã ngừng hoạt động")
        department_code = str(employee["department_code"] or "").upper()

        nodes = cluster_nodes_for_claim(
            db,
            workflow_instance_id=workflow_instance_id,
            cluster_code=normalized_cluster,
        )
        if not nodes:
            raise WorkflowValidationError(
                "Cụm này không còn bước nào để nhận trong hạng mục đã chọn"
            )

        # Hàng rào tải kiểm MỘT LẦN cho cả cụm, không kiểm từng bước: held_item_count
        # đếm theo HẠNG MỤC, mà cả cụm nằm trong đúng một hạng mục — kiểm từng
        # bước chỉ là hỏi lại cùng một câu năm lần.
        held_items = held_item_count(
            db, employee_id=employee_id, exclude_instance_id=workflow_instance_id
        )
        if wip_limit_reached(held_items):
            raise WorkflowValidationError(
                f"Bạn đang giữ tối đa {WIP_ITEM_LIMIT} hạng mục dở dang. "
                "Hãy hoàn thành nghiệm thu một hạng mục để nhận thêm việc mới."
            )

        claimed: list[dict[str, Any]] = []
        skipped: list[dict[str, Any]] = []
        for node in nodes:
            node_definition = node["node_definition"] or {}
            allowed_departments = task_pool_departments(node["node_code"], node_definition)
            if allowed_departments and department_code not in allowed_departments:
                raise WorkflowValidationError(
                    f"Bước {node['node_code']} thuộc phòng khác — bạn không nhận trọn cụm này được"
                )

            roles = task_pool_roles(node["node_code"], node_definition)
            # Vai trò chính của bước. ASSISTANT là suất phụ, người nhận cả cụm
            # đang đứng vai chính nên không lấy suất đó của người khác.
            role_code = next((role for role in roles if role != "ASSISTANT"), None)
            if not role_code:
                raise WorkflowValidationError(
                    f"Bước {node['node_code']} không khai vai trò nào nhận được"
                )

            taken = db.execute(
                text("""
                    select a.employee_id, e.full_name
                    from public.task_node_assignments a
                    join public.employees e on e.id = a.employee_id
                    where a.task_node_id = :task_node_id
                      and a.role_code = :role_code
                      and a.assignment_status in ('proposed', 'assigned', 'accepted')
                    limit 1
                """),
                {"task_node_id": node["id"], "role_code": role_code},
            ).mappings().first()
            if taken:
                if taken["employee_id"] == employee_id:
                    # Đã là của mình từ lượt trước — nhận lại cụm không được đẻ
                    # thêm dòng phân công thứ hai cho cùng một suất.
                    skipped.append({"task_node_id": node["id"], "node_code": node["node_code"],
                                    "reason": "đã nhận từ trước"})
                    continue
                raise TaskClaimConflict(
                    f"Bước {node['node_code']} đã có {taken['full_name']} nhận — "
                    "không nhận trọn cụm được."
                )

            assignment_id = db.execute(
                text("""
                    insert into public.task_node_assignments
                        (task_node_id, employee_id, role_code, is_primary,
                         assignment_status, assigned_by, notes)
                    select :task_node_id, :employee_id, :role_code, :is_primary,
                           'assigned', :actor_id, :notes
                    where not exists (
                        select 1 from public.task_node_assignments
                        where task_node_id = :task_node_id
                          and role_code = :role_code
                          and assignment_status in ('proposed', 'assigned', 'accepted')
                    )
                    returning id
                """),
                {
                    "task_node_id": node["id"],
                    "employee_id": employee_id,
                    "role_code": role_code,
                    "is_primary": role_code == "MAIN",
                    "actor_id": actor_id,
                    "notes": f"Nhận trọn cụm {normalized_cluster}",
                },
            ).scalar()
            if not assignment_id:
                # Khoá duy nhất từng phần vừa chặn — ai đó chen vào giữa hai câu
                # lệnh. Ném lỗi để cả cụm cùng lùi, không để lại nửa cụm.
                raise TaskClaimConflict(
                    f"Bước {node['node_code']} vừa được người khác nhận trước bạn."
                )

            db.execute(
                text("""
                    insert into public.task_node_events
                        (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
                    values (:task_node_id, 'TASK_CLAIMED', :status, :status, :actor_id,
                            cast(:payload as jsonb))
                """),
                # from = to: nhận không làm bước đổi trạng thái. Bước đang 'pending'
                # thì vẫn 'pending' — nó chưa tới lượt, chỉ là đã có chủ.
                {
                    "task_node_id": node["id"],
                    "status": node["status"],
                    "actor_id": actor_id,
                    "payload": json.dumps({
                        "assignment_id": assignment_id,
                        "employee_id": employee_id,
                        "role_code": role_code,
                        "cluster_code": normalized_cluster,
                    }),
                },
            )
            _bind_claimed_employee_to_payable_checklists(
                db,
                task_node_id=node["id"],
                employee_id=employee_id,
                role_code=role_code,
                actor_id=actor_id,
            )
            claimed.append({
                "task_node_id": node["id"],
                "node_code": node["node_code"],
                "role_code": role_code,
                "status": node["status"],
                "assignment_id": assignment_id,
            })

        if not claimed:
            raise TaskClaimConflict("Cụm này bạn đã nhận rồi, không còn bước nào để nhận thêm.")

        recompute_planned_deadlines(db, workflow_instance_id=workflow_instance_id)
        return {
            "workflow_instance_id": workflow_instance_id,
            "cluster_code": normalized_cluster,
            "claimed": claimed,
            "skipped": skipped,
            # Không bước nào chạy. Giao diện đọc cờ này để bày nút Bắt đầu thay vì
            # tưởng việc đã khởi động.
            "started_any": False,
        }


def mark_field_work_started(
    db: Session, *, task_node_id: str, employee_id: str, actor_id: str
) -> dict[str, Any]:
    """Thợ chính có mặt tại hiện trường bấm 'Bắt đầu đo' — chốt cửa slot thợ phụ.

    Suất thợ phụ 100.000đ chỉ có nghĩa khi người phụ còn kịp ra hiện trường cùng
    thợ chính (cầm gương, kéo thước, phát quang cắm cọc). Thợ chính đã bắt đầu đo
    mà chưa ai nhận thì công ty không phải trả thêm cho người tới lúc việc đã xong.

    Ai kịp nhận TRƯỚC thời điểm này thì giữ nguyên — họ có thể đang trên đường
    tới hiện trường. Hàm này chỉ đóng suất còn trống, không đụng người đã nhận.
    Nhờ vậy sóng 4G chập chờn ngoài thực địa không cướp mất việc của ai: mốc
    quyết định là lúc yêu cầu tới server, và cửa chỉ đóng khi suất vẫn còn trống.
    """
    node = db.execute(
        text("""
            select id, node_code, status, workflow_instance_id,
                   coalesce(execution_data, '{}'::jsonb) as execution_data
            from public.task_nodes
            where id = :task_node_id
            for update
        """),
        {"task_node_id": task_node_id},
    ).mappings().first()
    if not node:
        raise WorkflowValidationError("Node không tồn tại")
    if node["node_code"] != "K02":
        raise WorkflowValidationError("Chỉ bước khảo sát & đo hiện trường mới có mốc bắt đầu đo")
    _require_node_assignment(db, task_node_id=task_node_id, employee_id=employee_id)
    if node["status"] != "in_progress":
        raise WorkflowValidationError("Phải nhận ca đo trước khi bấm bắt đầu đo hiện trường")

    already = (node["execution_data"] or {}).get("field_started_at")
    if already:
        return {
            "task_node_id": task_node_id,
            "field_started_at": already,
            "assistant_slot_closed": True,
            "assistant_employee_id": None,
        }

    assistant = db.execute(
        text("""
            select employee_id from public.task_node_assignments
            where task_node_id = :task_node_id and role_code = 'ASSISTANT'
              and assignment_status in ('proposed', 'assigned', 'accepted')
            limit 1
        """),
        {"task_node_id": task_node_id},
    ).scalar()

    started_at = db.execute(
        text("""
            update public.task_nodes
            set execution_data = coalesce(execution_data, '{}'::jsonb)
                || jsonb_build_object('field_started_at', to_jsonb(now())),
                updated_at = now()
            where id = :task_node_id
            returning execution_data->>'field_started_at'
        """),
        {"task_node_id": task_node_id},
    ).scalar()

    db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            values (:task_node_id, 'FIELD_WORK_STARTED', 'in_progress', 'in_progress',
                    :actor_id, cast(:payload as jsonb))
        """),
        {
            "task_node_id": task_node_id,
            "actor_id": actor_id,
            "payload": json.dumps({
                "employee_id": employee_id,
                "assistant_employee_id": assistant,
                "assistant_slot_closed": assistant is None,
            }),
        },
    )
    return {
        "task_node_id": task_node_id,
        "field_started_at": started_at,
        "assistant_slot_closed": assistant is None,
        "assistant_employee_id": assistant,
    }


NODE_PAUSE_REASONS = {
    "AGENCY": "Chờ cơ quan xử lý, thông báo thuế hoặc bổ sung giấy tờ",
    "SURVEYOR": "Bản vẽ sai ranh, chờ bộ phận đo vẽ sửa lại",
    "INTERNAL": "Chờ nội bộ, sếp ký hoặc khách đóng thuế",
}
MIN_PAUSE_NOTE_LENGTH = 5

# Hạn sửa bài khi bước bị kéo về. SLA từng bước chưa khai số thật, nên dùng mốc
# này cho mọi bước; khi workflow_nodes.sla_hours có số, công thức thành
# min(24h, 50% SLA chuẩn).
DEFAULT_REWORK_HOURS = 24


def rework_deadline_hours(node_code: str | None) -> int:
    """Số giờ cấp cho một vòng sửa bài.

    Nửa SLA chuẩn, nhưng không quá một ngày: bước có SLA 10 ngày mà cho sửa 5
    ngày là mở cửa cho việc trôi thêm một tuần vì một tờ ảnh mờ.
    """
    sla = node_sla_hours(node_code)
    if not sla:
        return DEFAULT_REWORK_HOURS
    return max(1, min(DEFAULT_REWORK_HOURS, sla // 2))


def node_elapsed_working_seconds(node: dict[str, Any], *, now: datetime | None = None) -> int:
    """Giờ làm thực của một bước = thời gian trôi TRỪ các quãng nằm chờ.

    ``now`` là tham số để test truyền mốc cố định thay vì đọc đồng hồ hệ thống.

    Đang tạm dừng dở thì cộng nốt quãng chưa chốt — không cộng thì bước nào càng
    dừng lâu càng có vẻ làm nhanh.
    """
    started_at = node.get("started_at")
    if not started_at:
        return 0
    now = now or datetime.now(timezone.utc)
    end = node.get("completed_at") or now
    total = int((end - started_at).total_seconds())

    paused = int(node.get("paused_seconds") or 0)
    if node.get("paused_at") and not node.get("completed_at"):
        paused += int((now - node["paused_at"]).total_seconds())
    return max(0, total - paused)


def pause_node(
    db: Session,
    *,
    task_node_id: str,
    employee_id: str,
    reason_type: str,
    note: str,
    actor_id: str,
) -> dict[str, Any]:
    """Dừng đồng hồ của một bước vì lý do KHÔNG do nhân viên gây ra.

    Đây là toàn bộ mục đích của tính năng: chờ cơ quan ra thông báo thuế có thể
    mất ba tuần, và trừ ba tuần đó vào KPI người nộp hồ sơ là phạt họ vì một việc
    họ không điều khiển được.

    Chỉ bước có khai ``allow_pause`` mới dừng được — cấu hình nằm ở danh mục
    bước, không viết cứng theo mã K.
    """
    normalized_reason = str(reason_type or "").strip().upper()
    if normalized_reason not in NODE_PAUSE_REASONS:
        raise WorkflowValidationError(
            f"Lý do tạm dừng phải là một trong: {', '.join(NODE_PAUSE_REASONS)}"
        )
    normalized_note = (note or "").strip()
    if len(normalized_note) < MIN_PAUSE_NOTE_LENGTH:
        raise WorkflowValidationError(
            f"Cần ghi rõ đang chờ gì (tối thiểu {MIN_PAUSE_NOTE_LENGTH} ký tự) — "
            "người tiếp nhận sau đọc đúng dòng này để biết hồ sơ đứng ở đâu."
        )

    _require_node_assignment(db, task_node_id=task_node_id, employee_id=employee_id)
    node = db.execute(
        text("""
            select id, status, node_code, pause_reason_type
            from public.task_nodes where id = :id for update
        """),
        {"id": task_node_id},
    ).mappings().first()
    if not node:
        raise WorkflowValidationError("Node không tồn tại")
    if node["status"] != "in_progress":
        raise WorkflowValidationError("Chỉ tạm dừng được bước đang thực hiện")
    if node["pause_reason_type"]:
        raise WorkflowValidationError("Bước này đang tạm dừng rồi")
    if not node_allows_pause(node["node_code"]):
        raise WorkflowValidationError(
            f"Bước {node['node_code']} không khai tạm dừng trong danh mục"
        )

    db.execute(
        text("""
            update public.task_nodes
            set pause_reason_type = :reason, paused_at = clock_timestamp(),
                paused_note = :note, updated_at = clock_timestamp()
            where id = :id
        """),
        {"id": task_node_id, "reason": normalized_reason, "note": normalized_note},
    )
    db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            values (:id, 'NODE_PAUSED', :status, :status, :actor_id, cast(:payload as jsonb))
        """),
        {"id": task_node_id, "status": node["status"], "actor_id": actor_id,
         "payload": json.dumps({"reason_type": normalized_reason, "note": normalized_note},
                               ensure_ascii=False)},
    )
    return {
        "task_node_id": task_node_id,
        "pause_reason_type": normalized_reason,
        "paused_note": normalized_note,
        # SURVEYOR không tự kéo bước trước về — nó chỉ mở đường xin quay lại, và
        # Giám đốc mới là người duyệt. Mở lại ba bước đã xong là việc nặng.
        "needs_rollback_request": normalized_reason == "SURVEYOR",
    }


def resume_node(db: Session, *, task_node_id: str, employee_id: str, actor_id: str) -> dict[str, Any]:
    """Chạy tiếp một bước đang tạm dừng, và chốt quãng vừa chờ vào ``paused_seconds``.

    Ba việc phải làm trong ĐÚNG MỘT câu update: cộng dồn quãng vừa rồi, xoá mốc,
    xoá lý do. Quên xoá mốc là lần dừng sau cộng dồn lại cả quãng đã tính — dừng
    → tiếp → dừng → tiếp vài lượt là KPI biến thành số âm vô nghĩa.

    ``clock_timestamp()`` chứ không ``now()``: ``now()`` đứng yên suốt một giao
    dịch, nên một giao dịch mở sẵn từ trước sẽ cho ra 0 giây.
    """
    _require_node_assignment(db, task_node_id=task_node_id, employee_id=employee_id)
    node = db.execute(
        text("""
            select id, status, pause_reason_type, paused_at
            from public.task_nodes where id = :id for update
        """),
        {"id": task_node_id},
    ).mappings().first()
    if not node:
        raise WorkflowValidationError("Node không tồn tại")
    if not node["pause_reason_type"]:
        raise WorkflowValidationError("Bước này không ở trạng thái tạm dừng")

    # Đơn nhiệm gác ở ĐÂY nữa, không chỉ ở lúc Bắt đầu.
    #
    # Bước tạm dừng đã thôi chiếm suất (xem blocking_in_progress_node), nên nhân
    # viên bắt đầu được việc khác trong lúc chờ. Chạy tiếp mà không kiểm lại là
    # có HAI bước cùng chạy — vỡ luật đơn nhiệm đúng bằng cửa vừa mở ra.
    #
    # Truyền task_node_id để hàm bỏ qua chính bước này theo ID, không theo mã bước.
    busy = blocking_in_progress_node(
        db, employee_id=employee_id, task_node_id=task_node_id
    )
    if busy:
        raise WorkflowValidationError(single_task_error(busy))

    paused_for = db.execute(
        text("""
            update public.task_nodes
            set paused_seconds = paused_seconds
                  + coalesce(extract(epoch from (clock_timestamp() - paused_at))::bigint, 0),
                paused_at = null,
                pause_reason_type = null,
                paused_note = null,
                updated_at = clock_timestamp()
            where id = :id
            returning paused_seconds
        """),
        {"id": task_node_id},
    ).scalar()

    db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            values (:id, 'NODE_RESUMED', :status, :status, :actor_id, cast(:payload as jsonb))
        """),
        {"id": task_node_id, "status": node["status"], "actor_id": actor_id,
         "payload": json.dumps({"was_paused_for": node["pause_reason_type"]},
                               ensure_ascii=False)},
    )
    return {
        "task_node_id": task_node_id,
        "paused_seconds": int(paused_for or 0),
    }


def node_pause_block(db: Session, *, task_node_id: str) -> str | None:
    """Câu chặn khi bước đang tạm dừng; None nghĩa là đang chạy bình thường.

    Cổng này gác đường NỘP NGHIỆM THU. Hồ sơ còn đang chờ cơ quan mà nộp nghiệm
    thu được thì bước đóng lại với kết quả chưa về.
    """
    row = db.execute(
        text("""
            select pause_reason_type, paused_note from public.task_nodes where id = :id
        """),
        {"id": task_node_id},
    ).mappings().first()
    if not row or not row["pause_reason_type"]:
        return None
    reason = NODE_PAUSE_REASONS.get(row["pause_reason_type"], row["pause_reason_type"])
    note = row["paused_note"] or reason
    return (
        f"Bước đang tạm dừng ({row['pause_reason_type']}): {note}. "
        "Bấm Tiếp tục rồi mới nộp nghiệm thu được."
    )


def start_task_node(db: Session, *, task_node_id: str, employee_id: str, actor_id: str) -> dict[str, Any]:
    """Employee begins work on a node they are assigned to: ready/rework_required -> in_progress."""
    _require_node_assignment(db, task_node_id=task_node_id, employee_id=employee_id)
    node = db.execute(
        text("""
            select id, status, workflow_instance_id, defined_by_revision_id, node_key
            from public.task_nodes
            where id = :task_node_id
            for update
        """),
        {"task_node_id": task_node_id},
    ).mappings().first()
    if not node:
        raise WorkflowValidationError("Node không tồn tại")
    if node["status"] not in ("ready", "rework_required"):
        raise WorkflowValidationError("Node phải ở trạng thái 'Sẵn sàng thực hiện' hoặc 'Cần làm lại' để bắt đầu")

    # Đơn nhiệm chặn ở ĐÂY, không phải lúc nhận việc: nhận cả cụm 5 bước vẫn
    # hợp lệ, nhưng chỉ một bước được chạy tại một thời điểm.
    busy = blocking_in_progress_node(
        db, employee_id=employee_id, task_node_id=task_node_id
    )
    if busy:
        raise WorkflowValidationError(single_task_error(busy))

    db.execute(
        text("""
            update public.task_nodes
            set status = 'in_progress', started_at = coalesce(started_at, now()), updated_at = now()
            where id = :task_node_id
        """),
        {"task_node_id": task_node_id},
    )
    db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            values
                (:task_node_id, 'NODE_STARTED', :from_status, 'in_progress', :actor_id, '{}'::jsonb)
        """),
        {"task_node_id": task_node_id, "from_status": node["status"], "actor_id": actor_id},
    )
    result = {"task_node_id": task_node_id, "status": "in_progress"}
    node_def = _node_definition(db, node)
    if not node_def:
        return result

    # Tính lại hạn cho TOÀN BỘ quy trình, không riêng node vừa bắt đầu — hạn là
    # chuỗi cộng dồn nên đụng một node là ảnh hưởng cả dây phía sau.
    recompute_planned_deadlines(db, workflow_instance_id=node["workflow_instance_id"])

    # Fallback cho các workflow được kích hoạt trước khi cơ chế provision-at-ready
    # được triển khai. Hàm ensure idempotent nên retry/rework không sinh bản ghi mới.
    result.update(_ensure_node_module_records(
        db, task_node_id=task_node_id, actor_id=actor_id
    ))
    return result


def submit_task_node_for_acceptance(
    db: Session, *, task_node_id: str, employee_id: str, actor_id: str, note: str | None
) -> dict[str, Any]:
    """Employee submits a node for manager review: in_progress -> submitted.

    Requires every required checklist item to already be approved/late-approved or not_applicable
    (evidence is reviewed independently via the checklist endpoints)."""
    _require_node_assignment(db, task_node_id=task_node_id, employee_id=employee_id)
    # Chỉ người GIỮ VIỆC được nộp cả gói — xem SUBMIT_CAPABLE_ROLES. Thợ phụ
    # hoàn thiện phần mình rồi thôi: để ai cũng nộp được thì một người bấm sớm
    # là khoá luôn phần người khác đang làm dở, và Giám đốc nhận một gói chưa xong.
    can_submit = db.execute(
        text("""
            select 1 from public.task_node_assignments
            where task_node_id = :n and employee_id = :e
              and role_code = any(:roles)
              and assignment_status not in ('replaced', 'declined')
        """),
        {"n": task_node_id, "e": employee_id, "roles": list(SUBMIT_CAPABLE_ROLES)},
    ).first()
    if not can_submit:
        raise WorkflowValidationError(
            "Chỉ người phụ trách chính của bước mới nộp nghiệm thu được. "
            "Bạn hoàn thiện phần việc của mình, người phụ trách chính sẽ nộp cả gói."
        )

    # Đang tạm dừng thì chưa nộp được. Chặn ở đây chứ không chỉ ẩn nút: gọi thẳng
    # API là qua mặt được giao diện, và bước sẽ đóng lại với kết quả chưa về.
    paused = node_pause_block(db, task_node_id=task_node_id)
    if paused:
        raise WorkflowValidationError(paused)

    node = db.execute(
        text("""
            select n.id, n.status,
                   coalesce((coalesce(r_act.graph, r_def.graph)
                             ->'nodes'->n.node_key->>'is_handover')::boolean, false)
                     as is_handover
            from public.task_nodes n
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
            left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
            where n.id = :task_node_id
            for update of n
        """),
        {"task_node_id": task_node_id},
    ).mappings().first()
    if not node:
        raise WorkflowValidationError("Node không tồn tại")
    # Nhận CẢ 'rework_required': bị trả bài thì nhân viên tải tệp sửa lên rồi bấm
    # Nộp lại một nhát, không phải bấm [Làm lại] rồi mới hiện nút Nộp. Bắt hai
    # nhịp là người ta sửa xong, quên nhịp sau, và hồ sơ treo vô hạn — dưới góc
    # nhìn hệ thống họ vẫn "đang sửa" nên chẳng ai báo.
    #
    # Đường này KHÔNG gác đơn nhiệm: nó kết thúc ở 'submitted', không để lại bước
    # nào đang chạy. Chặn ở đây là bắt người ta đóng việc khác chỉ để bấm nút gửi.
    if node["status"] not in ("in_progress", "rework_required"):
        # Bấm hai lần thì lần sau KHÔNG phải lỗi của người dùng: việc họ muốn —
        # nộp bước này — đã xong rồi. Trả về đúng bản ghi đang chờ duyệt thay vì
        # ném lỗi đỏ vào mặt người vừa bấm hai nhát vì mạng chậm.
        #
        # Không sinh bản ghi trùng: khoá dòng `for update of n` ở truy vấn trên
        # cộng với chốt trạng thái này đã bảo đảm chỉ một request đi qua được.
        # Ở đây chỉ sửa cách BÁO LẠI, không đụng tới tính đúng đắn của dữ liệu.
        if node["status"] == "submitted":
            pending = db.execute(
                text("""
                    select id from public.task_node_acceptances
                    where task_node_id = :n and status = 'pending'
                    order by attempt_no desc
                    limit 1
                """),
                {"n": task_node_id},
            ).scalar()
            if pending:
                return {
                    "task_node_id": task_node_id,
                    "acceptance_id": pending,
                    "status": "submitted",
                    "already_submitted": True,
                }
        raise WorkflowValidationError(
            "Node phải ở trạng thái 'Đang thực hiện' hoặc 'Cần sửa lại' để nộp nghiệm thu"
        )
    if node["is_handover"]:
        raise WorkflowValidationError(
            "Bước bàn giao phải nộp qua luồng bàn giao K06 để kiểm tra công nợ, "
            "checklist và minh chứng."
        )

    # MỘT LẦN NỘP: checklist chỉ cần ĐÃ ĐIỀN, không cần đã được duyệt.
    #
    # Trước đây nút này đòi mọi mục đã 'approved', nghĩa là nhân viên phải nộp
    # từng mục rồi chờ Giám đốc duyệt từng mục, xong mới nộp được bước — Giám đốc
    # làm hai vòng cho cùng một việc, và sổ giấy tờ thì chẳng bao giờ nằm trong
    # tầm mắt lúc duyệt. Giờ nhân viên điền đủ rồi nộp một lần; quyết định nghiệm
    # thu duyệt trọn gói cả checklist lẫn phiếu xin miễn giấy.
    #
    # Chỉ còn chặn những mục THỰC SỰ chưa làm: chưa điền, đang làm dở, hoặc đã bị
    # trả về mà chưa sửa.
    unresolved = db.execute(
        text("""
            select checklist_name from public.task_node_checklist_results
            where task_node_id = :task_node_id
              and status not in ('pending_approval', 'late_pending_approval',
                                 'approved', 'late_approved', 'not_applicable')
            order by checklist_name
        """),
        {"task_node_id": task_node_id},
    ).mappings().all()
    if unresolved:
        names = ", ".join(row["checklist_name"] for row in unresolved)
        raise WorkflowValidationError(f"Còn nhiệm vụ chưa điền xong: {names}")


    # THIẾU TÀI LIỆU KHÔNG CHẶN NỘP.
    #
    # Bản trước chặn cứng ở đây. Nhưng giấy khách không có thật thì bước đứng
    # vĩnh viễn, và đường thoát duy nhất còn lại là nhét đại một tệp cho qua
    # cổng — đúng cái bệnh cả đợt này sinh ra để chữa. Đổi lại: chụp lại đúng
    # lúc bấm nộp là đang thiếu những gì, để Giám đốc quyết trên dữ kiện thật
    # chứ không phải trên trí nhớ, và để sau này còn truy được.
    #
    # Chụp NGAY LÚC NỘP, không tính lại lúc duyệt: giữa hai thời điểm nhân viên
    # còn nạp thêm tệp, tính lại thì mất dấu tình trạng lúc quyết định.
    # THIẾU TÀI LIỆU KHÔNG CHẶN NỘP.
    #
    # Chặn cứng thì giấy khách không có thật sẽ treo bước vĩnh viễn, và đường
    # thoát duy nhất còn lại là nhét đại một tệp cho qua cổng — đúng cái bệnh
    # cả đợt này sinh ra để chữa. Đổi lại: chụp lại ĐÚNG LÚC BẤM NỘP đang thiếu
    # những gì, để Giám đốc quyết trên dữ kiện thật và sau này còn truy được.
    #
    # Chụp lúc nộp chứ không tính lại lúc duyệt: giữa hai thời điểm nhân viên
    # còn nạp thêm tệp, tính lại là mất dấu tình trạng lúc ra quyết định.
    from src.dossiers.documents import node_shortage_report

    ban_thieu = node_shortage_report(db, task_node_id)

    attempt_no = (db.execute(
        text("select coalesce(max(attempt_no), 0) + 1 from public.task_node_acceptances where task_node_id = :task_node_id"),
        {"task_node_id": task_node_id},
    ).scalar_one())

    acceptance_id = db.execute(
        text("""
            insert into public.task_node_acceptances
                (task_node_id, attempt_no, status, submitted_by, submission_payload)
            values
                (:task_node_id, :attempt_no, 'pending', :actor_id, cast(:payload as jsonb))
            returning id
        """),
        {
            "task_node_id": task_node_id,
            "attempt_no": attempt_no,
            "actor_id": actor_id,
            # submission_payload là chỗ có sẵn cho dữ kiện của LẦN NỘP này —
            # không cần thêm cột. Ghi cả khi rỗng để phân biệt "đã kiểm, không
            # thiếu gì" với "phiên bản cũ chưa từng kiểm".
            "payload": json.dumps(
                {"note": note, "missing": ban_thieu}, ensure_ascii=False
            ),
        },
    ).scalar_one()

    db.execute(
        text("""
            update public.task_nodes
            set status = 'submitted', submitted_at = now(),
                execution_data = jsonb_set(
                    coalesce(execution_data, '{}'::jsonb),
                    '{actual_duration_seconds}',
                    to_jsonb(greatest(0, extract(epoch from (now() - coalesce(started_at, now())))::bigint)),
                    true
                ),
                updated_at = now()
            where id = :task_node_id
        """),
        {"task_node_id": task_node_id},
    )
    db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            values
                (:task_node_id, 'NODE_SUBMITTED', 'in_progress', 'submitted', :actor_id,
                 cast(:payload as jsonb))
        """),
        {
            "task_node_id": task_node_id,
            "actor_id": actor_id,
            "payload": json.dumps({"acceptance_id": acceptance_id, "attempt_no": attempt_no}),
        },
    )
    return {"task_node_id": task_node_id, "acceptance_id": acceptance_id, "status": "submitted"}



def _chot_phieu_mien_theo_nghiem_thu(
    db: Session, *, task_node_id: str, decision: str, actor_id: str, review_note: str | None
) -> list[str]:
    """Quyết định nghiệm thu chốt luôn số phận các phiếu xin miễn giấy đang chờ.

    Một cổng duy nhất: nhân viên bấm miễn là nộp được ngay, Giám đốc nhìn trọn
    gói lúc nghiệm thu rồi quyết một lần. Duyệt đạt = đồng ý bỏ những giấy đó;
    trả lại = bắt đi lấy bằng được, và lý do trả lại chính là câu nhân viên mang
    đi gọi khách.

    Chỉ áp cho K01 — đó là bước rà soát giấy đầu vào; các bước sau không sinh
    phiếu miễn nên không có gì để chốt.
    """
    hang_muc = db.execute(
        text("""
            select wi.service_line_id
            from public.task_nodes n
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            where n.id = :task_node_id and n.node_code = 'K01'
        """),
        {"task_node_id": task_node_id},
    ).scalar()
    if not hang_muc:
        return []

    ket_qua = "approved" if decision == "accepted" else "rejected"
    # Từ chối thì BẮT BUỘC có lý do — nhân viên cầm câu này đi gọi khách. Giám
    # đốc không ghi thì ghi hộ một câu trung tính còn hơn để trống, vì cột
    # review_note rỗng khiến màn nhân viên không hiển thị được lý do nào cả.
    ghi_chu = review_note or (
        None if ket_qua == "approved" else "Giám đốc yêu cầu lấy bằng được giấy này."
    )
    ten = db.execute(
        text("""
            update public.document_slot_change_requests r
            set status = :ket_qua, reviewed_by = :actor, reviewed_at = now(),
                review_note = :note, updated_at = now()
            from public.dossier_document_slots s
            where s.id = r.slot_id
              and r.kind = 'WAIVE' and r.status = 'pending'
              and r.service_line_id = :sl
            returning s.name
        """),
        {"ket_qua": ket_qua, "actor": actor_id, "note": ghi_chu, "sl": hang_muc},
    ).scalars().all()
    return list(ten)


MIN_REJECTION_REASON_LENGTH = 5

# Duyệt vài tờ rồi bỏ đi, quá chừng này phút thì tự gom và bắn thông báo.
#
# Đường chốt lười này KHÔNG phải cho đủ bộ. Chỉ dựa vào nút [Chốt duyệt] và lúc
# đóng Drawer thì sập trình duyệt, đóng tab hay mất mạng là nhân viên KHÔNG BAO
# GIỜ biết mình bị trả bài — hồ sơ nằm chờ vô hạn.
REVIEW_BATCH_IDLE_MINUTES = 15
NODE_REVIEW_COMPLETED = "NODE_REVIEW_COMPLETED"

# ── Tệp HIỆN HÀNH của mỗi ô giấy ─────────────────────────────────────────────
#
# Nhân viên bị trả bài rồi nộp lại thì sinh MỘT DÒNG NỐI MỚI, dòng cũ vẫn nằm đó
# mang phán quyết 'rejected'. Đếm cả hai là vòng sửa bài KHÔNG BAO GIỜ đóng được:
# rejected_count vĩnh viễn ≥ 1, và bước không nghiệm thu đạt được dù tệp mới đã
# được duyệt.
#
# Quy tắc "bản mới nhất thắng" phải dùng ở CẢ BA chỗ — hiển thị, đếm, gom thông
# báo — nếu không ba chỗ nói ba kiểu.
#
# Khoá gom là ô giấy; tệp không gắn ô nào thì tự nó là một nhóm (coalesce sang
# document_id), nếu không mọi tệp lạc ô sẽ chen nhau vào cùng một nhóm null.
_CURRENT_DOCUMENT_LINKS_CTE = """
    current_links as (
        select distinct on (l.checklist_result_id, coalesce(d.slot_id, l.document_id))
               l.id as link_id, l.checklist_result_id, l.document_id,
               l.review_status, l.rejection_reason, l.reviewed_at,
               coalesce(s.name, d.file_name) as document_name
        from public.checklist_result_document_links l
        join public.task_node_checklist_results r on r.id = l.checklist_result_id
        join public.dossier_documents d on d.id = l.document_id
        left join public.dossier_document_slots s on s.id = d.slot_id
        where r.task_node_id = :task_node_id
          and d.doc_status = 'DANG_DUNG'
        order by l.checklist_result_id, coalesce(d.slot_id, l.document_id),
                 d.uploaded_at desc, d.id desc
    )
"""


def node_document_review_summary(db: Session, *, task_node_id: str) -> dict[str, Any]:
    """Tình hình duyệt giấy của một bước, đủ để vừa gác cổng vừa dựng thông báo.

    Chỉ tính giấy gắn vào mục checklist BẮT BUỘC. Mục không bắt buộc có gán thêm
    tệp tham khảo thì không được phép giữ cả bước lại.

    Chỉ tính TỆP HIỆN HÀNH của mỗi ô giấy — xem ``_CURRENT_DOCUMENT_LINKS_CTE``.
    """
    rows = [dict(row) for row in db.execute(
        text(f"""
            with {_CURRENT_DOCUMENT_LINKS_CTE}
            -- Tên ô giấy là thứ nhân viên nhận ra: "Sơ đồ hiện trạng vị trí".
            -- Tên tệp là "IMG_4021.jpg" — vô nghĩa trong một thông báo nói bạn
            -- phải sửa tờ nào.
            select cl.link_id, cl.review_status, cl.rejection_reason,
                   r.checklist_name, cl.document_name
            from current_links cl
            join public.task_node_checklist_results r on r.id = cl.checklist_result_id
            where r.is_required
              and r.status <> 'cancelled'
            order by r.checklist_name
        """),
        {"task_node_id": task_node_id},
    ).mappings().all()]

    approved = [row for row in rows if row["review_status"] == "approved"]
    rejected = [row for row in rows if row["review_status"] == "rejected"]
    pending = [row for row in rows if row["review_status"] == "pending_review"]
    return {
        "total": len(rows),
        "approved_count": len(approved),
        "rejected_count": len(rejected),
        "pending_count": len(pending),
        "rejected_items": [
            {
                "document_name": row["document_name"] or row["checklist_name"],
                "checklist_name": row["checklist_name"],
                "reason": row["rejection_reason"],
            }
            for row in rejected
        ],
    }


def node_documents_all_approved(summary: dict[str, Any]) -> bool:
    """Đủ điều kiện đóng bước về mặt giấy tờ chưa.

    Còn MỘT tờ ``pending_review`` là chưa: đóng lúc đó là chốt bước với giấy chưa
    ai đọc, và tiền khoán chốt theo. Đây là chỗ dễ sai nhất của cả mục này.

    Bước không gắn tờ nào (``total == 0``) thì cổng này không có ý kiến — điều
    kiện đóng của nó nằm ở cổng checklist, không phải ở đây.
    """
    return summary["pending_count"] == 0 and summary["rejected_count"] == 0


def review_node_document(
    db: Session,
    *,
    checklist_result_id: str,
    document_id: str,
    decision: str,
    actor_id: str,
    reason: str | None = None,
) -> dict[str, Any]:
    """Giám đốc quyết MỘT tờ giấy tại MỘT bước.

    ── Vì sao từng tờ, không phải cả gói ────────────────────────────────────────
    Một nút chung cho cả checklist khiến người duyệt bấm gộp mà không đọc từng
    tờ — đúng thứ mà luật "đủ 100% giấy mới chốt khoán" sinh ra để chặn.

    ── Im lặng có chủ đích ──────────────────────────────────────────────────────
    Hàm này KHÔNG bắn thông báo. Duyệt 10 tờ mà bắn 10 tin là rác; cả đợt gom
    thành một tin lúc chốt (mục 6b). Ở đây chỉ ghi DB.

    ── Tờ đã có phán quyết vẫn sửa được ─────────────────────────────────────────
    Bấm nhầm là chuyện có thật. Đổi phán quyết ghi đè người quyết và mốc quyết,
    nên vẫn truy được ai chốt lần cuối.
    """
    if decision not in ("approved", "rejected"):
        raise WorkflowValidationError("decision phải là 'approved' hoặc 'rejected'")

    normalized_reason = (reason or "").strip()
    if decision == "rejected" and len(normalized_reason) < MIN_REJECTION_REASON_LENGTH:
        raise WorkflowValidationError(
            f"Từ chối một tờ giấy thì bắt buộc ghi lý do (tối thiểu "
            f"{MIN_REJECTION_REASON_LENGTH} ký tự) — nhân viên đọc đúng dòng đó để biết sửa gì."
        )

    # Khoá HÀNG MỤC CHECKLIST trước, cùng một hàng mà đường gán tệp cũng khoá.
    #
    # Khoá dòng nối thôi là không đủ: đường gán đang CHÈN dòng mới, không có dòng
    # nào để giành. Hai bên khoá hai thứ khác nhau thì chạy song song như thường,
    # và ở READ COMMITTED, phép kiểm bên kia không thấy phán quyết chưa commit
    # bên này. Phải có một điểm hẹn chung.
    db.execute(
        text("select 1 from public.task_node_checklist_results where id = :i for update"),
        {"i": checklist_result_id},
    )
    link = db.execute(
        text("""
            select l.id, l.review_status, r.task_node_id, n.status as node_status
            from public.checklist_result_document_links l
            join public.task_node_checklist_results r on r.id = l.checklist_result_id
            join public.task_nodes n on n.id = r.task_node_id
            where l.checklist_result_id = :checklist_result_id
              and l.document_id = :document_id
            for update of l
        """),
        {"checklist_result_id": checklist_result_id, "document_id": document_id},
    ).mappings().first()
    if not link:
        raise WorkflowValidationError("Tờ giấy này chưa được gán vào mục checklist đó")
    if link["node_status"] != "submitted":
        raise WorkflowValidationError(
            "Chỉ duyệt giấy khi bước đang chờ nghiệm thu"
        )

    db.execute(
        text("""
            update public.checklist_result_document_links
            set review_status = :review_status,
                rejection_reason = :rejection_reason,
                reviewed_by = :actor_id,
                -- clock_timestamp() chứ KHÔNG now(): now() đứng yên suốt một
                -- giao dịch, nên hai tờ duyệt trong cùng giao dịch mang đúng một
                -- dấu thời gian — và tờ nào duyệt sau lần chốt sẽ có reviewed_at
                -- BẰNG mốc chốt, rồi rơi ra ngoài mọi đợt vì phép so sánh là
                -- "sau mốc". Đây chính là khe hở làm mất tờ giữa hai đợt.
                reviewed_at = clock_timestamp()
            where id = :id
        """),
        {
            "id": link["id"],
            "review_status": decision,
            "rejection_reason": normalized_reason or None,
            "actor_id": actor_id,
        },
    )

    # Đặt CỜ TỒN ĐỌNG: có phán quyết chưa gom vào thông báo nào. Chốt đợt sẽ xoá
    # cờ. Không đặt thì lượt quét chốt lười không bao giờ tìm thấy đợt này, và
    # nhân viên bị trả bài mà không ai báo.
    db.execute(
        text("""
            update public.task_nodes
            set last_reviewed_at = clock_timestamp(), updated_at = now()
            where id = :task_node_id
        """),
        {"task_node_id": link["task_node_id"]},
    )

    summary = node_document_review_summary(db, task_node_id=link["task_node_id"])
    return {
        "link_id": link["id"],
        "task_node_id": link["task_node_id"],
        "review_status": decision,
        "rejection_reason": normalized_reason or None,
        "summary": summary,
        "all_approved": node_documents_all_approved(summary),
    }


def flush_node_review_batch(
    db: Session,
    *,
    task_node_id: str,
    actor_id: str | None = None,
) -> dict[str, Any] | None:
    """Gom mọi phán quyết chưa chốt của một bước thành ĐÚNG MỘT thông báo.

    Trả ``None`` khi không có gì để gom — đóng Drawer mà không tick tờ nào thì im
    lặng, đừng gửi một tin rỗng.

    ── Ranh giới một đợt ────────────────────────────────────────────────────────
    Các tờ có ``reviewed_at`` SAU lần chốt gần nhất của bước đó. Mốc chốt chính
    là sự kiện ``NODE_REVIEW_COMPLETED`` gần nhất trong ``task_node_events``, nên
    không cần cột phiên riêng.

    Cách này tự xử được phiên duyệt bị cắt ngang: chấm 3 tờ lúc 14:00 rồi đi,
    14:15 chốt lười đóng Đợt 1, 14:20 quay lại chấm nốt 2 tờ — hai tờ đó có
    ``reviewed_at`` sau mốc 14:15 nên rơi vào Đợt 2. Không tờ nào lọt hai đợt,
    không tờ nào rơi ra ngoài.

    ── Không có khe hở ──────────────────────────────────────────────────────────
    Mốc so sánh lấy từ CHÍNH sự kiện vừa ghi, và việc ghi nằm cùng giao dịch với
    việc đọc danh sách tờ. Lấy ``now()`` riêng rồi mới ghi sự kiện là mở ra một
    khe vài mili-giây đủ để một tờ lọt giữa hai đợt.

    ── Chạy song song không bắn trùng ───────────────────────────────────────────
    ``for update skip locked``: request nào đang xử bước này thì giữ khoá, request
    khác bỏ qua NGAY thay vì xếp hàng rồi chốt lần hai. Bỏ sót một lượt quét
    không sao — lượt đọc kế tiếp gom nốt; quét trùng mới sinh hai tin cho cùng
    một việc.
    """
    node = db.execute(
        text("""
            select n.id, n.status, n.node_code, n.last_reviewed_at,
                   sl.contract_id
            from public.task_nodes n
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            join public.service_lines sl on sl.id = wi.service_line_id
            where n.id = :task_node_id
            for update of n skip locked
        """),
        {"task_node_id": task_node_id},
    ).mappings().first()
    if not node or node["last_reviewed_at"] is None:
        # Không lấy được khoá, hoặc không còn gì tồn đọng. Cả hai đều là "thôi,
        # để lượt sau" — không phải lỗi.
        return None

    last_flush_at = db.execute(
        text("""
            select created_at from public.task_node_events
            where task_node_id = :task_node_id and event_type = :event_type
            order by created_at desc limit 1
        """),
        {"task_node_id": task_node_id, "event_type": NODE_REVIEW_COMPLETED},
    ).scalar()

    batch = [dict(row) for row in db.execute(
        text(f"""
            with {_CURRENT_DOCUMENT_LINKS_CTE}
            select cl.review_status, cl.rejection_reason,
                   r.checklist_name, r.id as checklist_result_id,
                   cl.document_name
            from current_links cl
            join public.task_node_checklist_results r on r.id = cl.checklist_result_id
            -- Chỉ tệp hiện hành: tệp đã bị nhân viên nộp bản khác đè lên thì phán
            -- quyết cũ của nó không được đi vào thông báo lần nữa.
            where cl.reviewed_at is not null
              and (:last_flush_at is null or cl.reviewed_at > :last_flush_at)
            order by r.checklist_name
        """),
        {"task_node_id": task_node_id, "last_flush_at": last_flush_at},
    ).mappings().all()]
    if not batch:
        # Cờ tồn đọng còn nhưng không có tờ nào sau mốc — dọn cờ để lượt sau khỏi
        # quét lại vô ích.
        db.execute(
            text("update public.task_nodes set last_reviewed_at = null where id = :id"),
            {"id": task_node_id},
        )
        return None

    rejected = [row for row in batch if row["review_status"] == "rejected"]
    overall = node_document_review_summary(db, task_node_id=task_node_id)
    if rejected:
        overall_status = "REWORK_REQUIRED"
    elif overall["pending_count"]:
        overall_status = "PARTIALLY_REVIEWED"
    else:
        overall_status = "APPROVED"

    # Payload dựng ở MÁY CHỦ, đọc từ DB. Nhận từ client thì nó vừa giả mạo được,
    # vừa sai khi phiên duyệt bị đứt giữa chừng.
    payload = {
        "nodeId": task_node_id,
        "nodeCode": node["node_code"],
        "contractCode": node["contract_id"],
        "overallStatus": overall_status,
        "summary": {
            "total": overall["total"],
            "approvedCount": overall["approved_count"],
            "rejectedCount": overall["rejected_count"],
            "pendingCount": overall["pending_count"],
            "reviewedInBatch": len(batch),
        },
        "rejectedItems": [
            {
                "documentName": row["document_name"] or row["checklist_name"],
                "checklistName": row["checklist_name"],
                "reason": row["rejection_reason"],
            }
            for row in rejected
        ],
    }

    event_id = db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id,
                 payload, created_at)
            values (:task_node_id, :event_type, :status, :status, :actor_id,
                    cast(:payload as jsonb), clock_timestamp())
            returning id
        """),
        {
            "task_node_id": task_node_id,
            "event_type": NODE_REVIEW_COMPLETED,
            "status": node["status"],
            "actor_id": actor_id,
            "payload": json.dumps(payload, ensure_ascii=False),
        },
    ).scalar()

    db.execute(
        text("update public.task_nodes set last_reviewed_at = null, updated_at = now() where id = :id"),
        {"id": task_node_id},
    )

    # Có tờ hỏng thì trả bước về sửa NGAY, không đợi chấm hết. Nhân viên biết sớm
    # một tờ hỏng thì sửa sớm, không phải ngồi chờ Giám đốc chấm nốt bốn tờ kia.
    #
    # Uỷ cho review_task_node_acceptance thay vì tự đổi trạng thái: ở đó mới có
    # đủ việc phải làm kèm theo (hạ mục checklist, ghi chú từng mục, sự kiện,
    # xoá cache). Chỉ uỷ khi lượt nghiệm thu CÒN chờ — Giám đốc đã tự bấm [Trả
    # về] rồi thì đừng quyết lần thứ hai.
    node_status_changed = False
    if rejected and node["status"] == "submitted":
        pending_acceptance = db.execute(
            text("""
                select id from public.task_node_acceptances
                where task_node_id = :task_node_id and status = 'pending'
                order by created_at desc limit 1
            """),
            {"task_node_id": task_node_id},
        ).scalar()
        if pending_acceptance:
            review_task_node_acceptance(
                db,
                acceptance_id=pending_acceptance,
                decision="rework_required",
                outcome=None,
                review_note=(
                    f"Cần sửa {len(rejected)} tờ giấy: "
                    + "; ".join(
                        f"{row['document_name'] or row['checklist_name']} — {row['rejection_reason']}"
                        for row in rejected
                    )
                ),
                actor_id=actor_id,
            )
            node_status_changed = True

    return {
        "event_id": event_id,
        "task_node_id": task_node_id,
        "overall_status": overall_status,
        "payload": payload,
        "node_status_changed": node_status_changed,
    }


def flush_stale_review_batches(db: Session, *, employee_id: str | None = None) -> list[str]:
    """Chốt hộ những đợt duyệt bị bỏ dở quá lâu. Trả về danh sách bước đã chốt.

    Gắn ở HAI cổng đọc, không chỉ một: chi tiết bước, và **chuông thông báo**.
    Cổng chuông mới là cổng thật — nhân viên bị trả bài sẽ bấm chuông, chứ không
    tự mở lại bước mình vừa nộp. Chỉ gắn ở cổng chi tiết bước thì đúng người cần
    tin lại là người không bao giờ kích hoạt được nó.

    ``employee_id`` thu hẹp về các bước người đó đang giữ, để lượt bấm chuông của
    một người không phải quét việc của cả công ty.
    """
    try:
        candidates = [row[0] for row in db.execute(
            text("""
                select distinct n.id
                from public.task_nodes n
                left join public.task_node_assignments a
                  on a.task_node_id = n.id
                 and a.assignment_status in ('assigned', 'accepted')
                where n.status = 'submitted'
                  and n.last_reviewed_at is not null
                  and n.last_reviewed_at <= now() - make_interval(mins => :idle_minutes)
                  and (:employee_id is null or a.employee_id = :employee_id)
                limit 20
            """),
            {"idle_minutes": REVIEW_BATCH_IDLE_MINUTES, "employee_id": employee_id},
        ).all()]
    except Exception:
        # Migration C1 chưa lên thì cột chưa tồn tại — im lặng bỏ qua, đường chốt
        # tay vẫn chạy.
        return []

    flushed: list[str] = []
    for node_id in candidates:
        # actor_id để null là ĐÚNG ở đây: không ai bấm gì cả, đợt này được chốt vì
        # quá hạn. Gán người đang bấm chuông vào chỗ này là ghi lịch sử sai — hoá
        # ra nhân viên tự duyệt bài của chính mình.
        if flush_node_review_batch(db, task_node_id=node_id, actor_id=None):
            flushed.append(node_id)
    return flushed


def review_task_node_acceptance(
    db: Session,
    *,
    acceptance_id: str,
    decision: str,
    outcome: str | None,
    review_note: str | None,
    actor_id: str,
    shortage_accepted: bool = False,
    shortage_reason: str | None = None,
    checklist_notes: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Giám đốc quyết một lần cho cả gói Node.

    ``shortage_accepted``  duyệt đạt DÙ hồ sơ còn thiếu tài liệu. Bắt buộc kèm
                           ``shortage_reason`` — đây là ngoại lệ với hồ sơ pháp
                           lý, không được để nó trôi qua không dấu vết.
    ``checklist_notes``    {checklist_result_id: ghi chú} khi trả lại. Một quyết
                           định trả cả gói, nhưng nhân viên phải biết TỪNG mục
                           sai chỗ nào; một câu chung cho năm mục là bắt họ đoán.
    """
    if decision not in ("accepted", "rework_required"):
        raise WorkflowValidationError("decision phải là 'accepted' hoặc 'rework_required'")
    if shortage_accepted and not (shortage_reason or "").strip():
        raise WorkflowValidationError(
            "Duyệt chấp nhận thiếu tài liệu thì bắt buộc ghi lý do."
        )

    acceptance = db.execute(
        text("""
            select a.id, a.status, a.task_node_id, n.node_key, n.status as node_status,
                   n.workflow_instance_id, n.defined_by_revision_id
            from public.task_node_acceptances a
            join public.task_nodes n on n.id = a.task_node_id
            where a.id = :acceptance_id
            for update of a, n
        """),
        {"acceptance_id": acceptance_id},
    ).mappings().first()
    if not acceptance:
        raise WorkflowValidationError("Không tìm thấy lượt nghiệm thu")
    if acceptance["status"] != "pending":
        raise WorkflowValidationError("Lượt nghiệm thu này đã được duyệt")
    if acceptance["node_status"] != "submitted":
        raise WorkflowValidationError("Node không còn ở trạng thái chờ nghiệm thu")

    task_node_id = acceptance["task_node_id"]

    # Nhận diện bằng cờ nghiệp vụ, không dò mã K06. Cần biết trước khi kiểm
    # checklist vì K06 là luồng duyệt theo gói: nhân viên nộp checklist ở trạng
    # thái chờ, Giám đốc duyệt Node sẽ duyệt toàn bộ các mục cùng một giao dịch.
    hv = db.execute(
        text("""
            select sl.contract_id, c.total_value,
                   coalesce((coalesce(r_act.graph, r_def.graph)
                             ->'nodes'->n.node_key->>'is_handover')::boolean, false) as is_handover
            from public.task_nodes n
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            join public.service_lines sl on sl.id = wi.service_line_id
            left join public.contracts c on c.id = sl.contract_id
            left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
            left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
            where n.id = :task_node_id
        """),
        {"task_node_id": task_node_id},
    ).mappings().first()
    is_handover = bool(hv and hv["is_handover"])

    if decision == "accepted":
        # Duyệt theo GÓI cho mọi node, không còn là đặc quyền của K06. Một quyết
        # định nghiệm thu duyệt luôn mọi minh chứng đã nộp và mọi phiếu xin miễn
        # đang chờ — đó là ý nghĩa của "gửi một lần, sếp duyệt một lần".
        unresolved = db.execute(
            text("""
                select checklist_name
                from public.task_node_checklist_results
                where task_node_id = :task_node_id
                  and status not in ('pending_approval', 'late_pending_approval',
                                     'approved', 'late_approved', 'not_applicable')
                order by checklist_name
            """),
            {"task_node_id": task_node_id},
        ).mappings().all()
        if unresolved:
            names = ", ".join(row["checklist_name"] for row in unresolved)
            raise WorkflowValidationError(
                f"Không thể nghiệm thu Node vì còn checklist chưa được nộp đủ: {names}"
            )

        # Cổng GIẤY TỜ, tách khỏi cổng checklist ngay trên. Mục checklist đủ
        # không có nghĩa là từng tờ trong đó đã được đọc: nhân viên gán đủ tệp là
        # mục xanh, còn phán quyết từng tờ là việc của Giám đốc.
        #
        # Đóng bước khi còn tờ 'pending_review' là chốt hồ sơ với giấy chưa ai
        # đọc — và tiền khoán chốt theo. Đây là chỗ dễ sai nhất của cả luồng.
        document_review = node_document_review_summary(db, task_node_id=task_node_id)
        if not node_documents_all_approved(document_review):
            if document_review["rejected_count"]:
                raise WorkflowValidationError(
                    f"Còn {document_review['rejected_count']} tờ đã bị từ chối — "
                    "trả bước về sửa, không nghiệm thu đạt được."
                )
            raise WorkflowValidationError(
                f"Còn {document_review['pending_count']} tờ giấy chưa duyệt. "
                "Duyệt hết rồi mới nghiệm thu đạt được."
            )

        if is_handover and hv["contract_id"]:
            from src.dossiers.handover import debt_summary
            debt = debt_summary(
                db, hv["contract_id"], hv["total_value"], task_node_id=task_node_id
            )
            if debt["remaining"] > 0.009 and not debt["gate_open"]:
                raise WorkflowValidationError(
                    f"Chặn bàn giao: Hợp đồng {hv['contract_id']} còn nợ "
                    f"({debt['remaining']:,.0f}đ) và Node chưa được Giám đốc duyệt ngoại lệ."
                )

    if decision == "rework_required":
        # Trả lại bước thì mọi mục đang chờ duyệt phải quay về "cần sửa", nếu
        # không nhân viên mở ra thấy checklist vẫn xanh và không biết sửa gì.
        # Ghi chú RIÊNG cho từng mục trước, rồi mới quét phần còn lại bằng ghi
        # chú chung. Làm ngược thứ tự là ghi chú riêng bị đè mất.
        for muc_id, ghi_chu in (checklist_notes or {}).items():
            db.execute(
                text("""
                    update public.task_node_checklist_results
                    set status = 'failed', completed_by = :actor_id,
                        completed_at = now(), note = :note, updated_at = now()
                    where id = :id and task_node_id = :n
                      and status in ('pending_approval', 'late_pending_approval')
                """),
                {"id": muc_id, "n": task_node_id, "actor_id": actor_id,
                 "note": (ghi_chu or "").strip() or review_note},
            )
        db.execute(
            text("""
                update public.task_node_checklist_results
                set status = 'failed', completed_by = :actor_id,
                    completed_at = now(), note = :note, updated_at = now()
                where task_node_id = :task_node_id
                  and status in ('pending_approval', 'late_pending_approval')
            """),
            {"task_node_id": task_node_id, "actor_id": actor_id, "note": review_note},
        )
        db.execute(
            text("""
                update public.task_node_acceptances
                set status = 'rework_required', reviewer_user_id = :actor_id, reviewed_at = now(),
                    review_note = :note
                where id = :acceptance_id
            """),
            {"acceptance_id": acceptance_id, "actor_id": actor_id, "note": review_note},
        )
        db.execute(
            text("""
                update public.task_nodes
                set status = 'rework_required', updated_at = now()
                where id = :task_node_id
            """),
            {"task_node_id": task_node_id},
        )
        db.execute(
            text("""
                insert into public.task_node_events
                    (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
                values
                    (:task_node_id, 'NODE_REJECTED', 'submitted', 'rework_required', :actor_id,
                     cast(:payload as jsonb))
            """),
            {
                "task_node_id": task_node_id,
                "actor_id": actor_id,
                "payload": json.dumps({"acceptance_id": acceptance_id, "review_note": review_note or ""}),
            },
        )
        mien_bi_tu_choi = _chot_phieu_mien_theo_nghiem_thu(
            db, task_node_id=task_node_id, decision="rework_required",
            actor_id=actor_id, review_note=review_note,
        )
        return {
            "task_node_id": task_node_id,
            "status": "rework_required",
            "waivers_rejected": mien_bi_tu_choi,
        }

    graph_row = db.execute(
        text("""
            select graph from public.workflow_instance_revisions
            where workflow_instance_id = :instance_id and id = :revision_id
        """),
        {
            "instance_id": acceptance["workflow_instance_id"],
            "revision_id": acceptance["defined_by_revision_id"],
        },
    ).mappings().first()
    node_def = (graph_row["graph"]["nodes"] or {}).get(acceptance["node_key"]) if graph_row else None
    transitions = (node_def or {}).get("transitions") or {}
    if outcome and transitions and outcome not in transitions:
        raise WorkflowValidationError(f"Outcome '{outcome}' không hợp lệ cho node này")
    if transitions and not outcome:
        raise WorkflowValidationError("Cần chọn outcome để xác định bước tiếp theo")

    # Một quyết định nghiệm thu duyệt đồng thời mọi minh chứng đã nộp của bước.
    # Giữ đúng trạng thái trễ hạn để báo cáo, đồng thời tạo đầu vào chuẩn cho cơ
    # chế sinh khoán phía dưới. Trước đây chỉ K06 được vậy; các bước khác bắt
    # Giám đốc bấm duyệt từng mục rồi mới bấm nghiệm thu.
    db.execute(
        text("""
            update public.task_node_checklist_results
            set status = case
                    when status = 'late_pending_approval' then 'late_approved'
                    when status = 'pending_approval' then 'approved'
                    else status
                end,
                completed_by = case
                    when status in ('pending_approval', 'late_pending_approval') then :actor_id
                    else completed_by
                end,
                completed_at = case
                    when status in ('pending_approval', 'late_pending_approval') then now()
                    else completed_at
                end,
                updated_at = now()
            where task_node_id = :task_node_id
        """),
        {"task_node_id": task_node_id, "actor_id": actor_id},
    )

    db.execute(
        text("""
            update public.task_node_acceptances
            set status = 'accepted', reviewer_user_id = :actor_id, reviewed_at = now(),
                review_payload = cast(:review_payload as jsonb),
                review_note = :note
            where id = :acceptance_id
        """),
        {
            "acceptance_id": acceptance_id,
            "actor_id": actor_id,
            "note": review_note,
            # review_payload là chỗ có sẵn cho dữ kiện của LẦN DUYỆT này. Giữ
            # nguyên ảnh chụp thiếu trong submission_payload, ở đây chỉ ghi
            # quyết định — hai bên tách bạch thì sau này còn đối chiếu được
            # "lúc nộp thiếu gì" với "sếp đồng ý bỏ cái gì".
            "review_payload": json.dumps(
                {"shortage_accepted": bool(shortage_accepted),
                 "shortage_reason": (shortage_reason or "").strip() or None},
                ensure_ascii=False,
            ),
        },
    )
    db.execute(
        text("""
            update public.task_nodes
            set status = 'accepted', outcome = :outcome, accepted_at = now(), completed_at = now(),
                execution_data = case when :is_handover then
                    jsonb_set(
                      coalesce(execution_data, '{}'::jsonb),
                      '{handover}',
                      coalesce(execution_data->'handover', '{}'::jsonb)
                        || jsonb_build_object(
                             'delivered_at', now(),
                             'delivered_by', :actor_id
                           )
                    )
                  else execution_data end,
                updated_at = now()
            where id = :task_node_id
        """),
        {
            "task_node_id": task_node_id,
            "outcome": outcome,
            "is_handover": is_handover,
            "actor_id": actor_id,
        },
    )
    db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            values
                (:task_node_id, 'NODE_ACCEPTED', 'submitted', 'accepted', :actor_id, cast(:payload as jsonb))
        """),
        {
            "task_node_id": task_node_id,
            "actor_id": actor_id,
            "payload": json.dumps({"acceptance_id": acceptance_id, "outcome": outcome}),
        },
    )

    entitlement_count, entitlement_amount = _generate_work_pay_entitlements(
        db,
        task_node_id=task_node_id,
        workflow_instance_id=acceptance["workflow_instance_id"],
        acceptance_id=acceptance_id,
        actor_id=actor_id,
    )

    next_node_key = transitions.get(outcome) if outcome else None
    unlocked_node_id = None
    if next_node_key:
        next_node = db.execute(
            text("""
                select id, status from public.task_nodes
                where workflow_instance_id = :instance_id and node_key = :node_key
                for update
            """),
            {"instance_id": acceptance["workflow_instance_id"], "node_key": next_node_key},
        ).mappings().first()
        if next_node and next_node["status"] == "pending":
            db.execute(
                text("""
                    update public.task_nodes
                    set status = 'ready', updated_at = now()
                    where id = :node_id
                """),
                {"node_id": next_node["id"]},
            )
            db.execute(
                text("""
                    insert into public.task_node_events
                        (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
                    values
                        (:node_id, 'NODE_UNLOCKED', 'pending', 'ready', :actor_id,
                         cast(:payload as jsonb))
                """),
                {
                    "node_id": next_node["id"],
                    "actor_id": actor_id,
                    "payload": json.dumps({"unlocked_by_task_node_id": task_node_id}),
                },
            )
            unlocked_node_id = next_node["id"]
            _inherit_predecessor_evidence(
                db,
                workflow_instance_id=acceptance["workflow_instance_id"],
                target_task_node_id=next_node["id"],
            )
            _ensure_node_module_records(
                db, task_node_id=next_node["id"], actor_id=actor_id
            )

    # Xét đóng Hạng mục khi KHÔNG mở được bước mới nào — không phải chỉ khi bước
    # này không khai bước kế.
    #
    # Bước cuối vẫn có thể mang một transition trỏ tới bước đã xong (vòng sửa bài
    # cũ, hoặc graph chỉnh tay còn sót). Lúc đó next_node_key khác rỗng nhưng
    # không bước nào chuyển sang 'ready' — và Hạng mục treo ở 'running' vĩnh viễn
    # dù mọi bước đã nghiệm thu xong.
    if not unlocked_node_id:
        remaining = db.execute(
            text("""
                select 1 from public.task_nodes
                where workflow_instance_id = :instance_id
                  and status not in ('accepted', 'skipped', 'cancelled')
                limit 1
            """),
            {"instance_id": acceptance["workflow_instance_id"]},
        ).first()
        completion_gate_open = True
        if not remaining and hv and hv["contract_id"]:
            completion_gate_open = _workflow_handover_gate_open(
                db,
                workflow_instance_id=acceptance["workflow_instance_id"],
                contract_id=hv["contract_id"],
                total_value=hv["total_value"],
            )
        if not remaining and completion_gate_open:
            db.execute(
                text("""
                    update public.workflow_instances
                    set status = 'completed', completed_at = now(), updated_at = now()
                    where id = :instance_id and status = 'running'
                """),
                {"instance_id": acceptance["workflow_instance_id"]},
            )

    mien_duoc_duyet = _chot_phieu_mien_theo_nghiem_thu(
        db, task_node_id=task_node_id, decision="accepted",
        actor_id=actor_id, review_note=review_note,
    )
    return {
        "task_node_id": task_node_id,
        "status": "accepted",
        "unlocked_node_id": unlocked_node_id,
        "entitlement_count": entitlement_count,
        "entitlement_amount": entitlement_amount,
        "waivers_approved": mien_duoc_duyet,
    }


def auto_finalize_node_if_ready(db: Session, *, task_node_id: str, actor_id: str) -> dict[str, Any]:
    """Duyệt hết checklist là XONG bước, không cần thêm một vòng nghiệm thu Node.

    Gọi ngay sau khi một checklist được duyệt Đạt. Nếu MỌI checklist bắt buộc của
    bước đã đạt và bước đang chạy, hệ thống tự nộp + nghiệm thu bước (tái dùng
    nguyên logic gốc: sinh khoán, mở bước kế, chốt quy trình).

    Bước bàn giao K06 còn thêm cổng công nợ: chỉ tự đóng khi đã thu đủ hoặc đã
    được Giám đốc duyệt ngoại lệ cho bàn giao trước.
    """
    node = db.execute(
        text(
            """
            select n.id, n.status, n.node_key, n.execution_data,
                   n.workflow_instance_id, sl.contract_id, c.total_value,
                   coalesce(
                     (coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->>'is_handover')::boolean,
                     false
                   ) as is_handover,
                   coalesce(
                     (coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->>'requires_gov_submission')::boolean,
                     false
                   ) as requires_gov_submission,
                   (select d.status from public.legal_dossiers d where d.task_node_id = n.id limit 1) as dossier_status,
                   (select s.receipt_code from public.legal_submissions s where s.task_node_id = n.id order by s.created_at desc limit 1) as gov_receipt_code,
                   (select s.legacy_gov_status from public.legal_submissions s where s.task_node_id = n.id order by s.created_at desc limit 1) as gov_submission_status,
                   coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->'transitions' as transitions,
                   -- Bước này có checklist nào đòi tài liệu đầu ra không. Đọc ké
                   -- truy vấn sẵn có để bước thường không tốn thêm một vòng DB.
                   coalesce((
                     select bool_or((item->'output_documents') is not null)
                     from jsonb_array_elements(coalesce(
                       coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->'checklist',
                       '[]'::jsonb)) item
                   ), false) as has_output_documents
            from public.task_nodes n
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            join public.service_lines sl on sl.id = wi.service_line_id
            join public.contracts c on c.id = sl.contract_id
            left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
            left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
            where n.id = :i
            for update of n
            """
        ),
        {"i": task_node_id},
    ).mappings().first()
    if not node or node["status"] != "in_progress":
        return {"finalized": False, "reason": "skip"}

    unresolved = db.execute(
        text(
            """
            select 1 from public.task_node_checklist_results
            where task_node_id = :i
              and status not in ('approved', 'late_approved', 'not_applicable')
            limit 1
            """
        ),
        {"i": task_node_id},
    ).first()
    if unresolved:
        return {"finalized": False, "reason": "checklist chưa đạt hết"}

    # Tài liệu đầu ra cần Giám đốc duyệt mà chưa duyệt thì bước chưa xong. Đặt SAU
    # kiểm checklist và TRƯỚC cổng công nợ. Bước không khai tài liệu đầu ra thì
    # không chạm tới nhánh này — K06 và mọi bước thường đi qua y như trước.
    if node["has_output_documents"]:
        from src.dossiers.documents import node_output_document_blockers

        thieu = node_output_document_blockers(db, task_node_id)
        if thieu:
            return {"finalized": False, "reason": "tài liệu đầu ra chưa đủ: " + "; ".join(thieu)}

    if node["is_handover"] and not _workflow_handover_gate_open(
        db,
        workflow_instance_id=node["workflow_instance_id"],
        contract_id=node["contract_id"],
        total_value=node["total_value"],
    ):
        return {"finalized": False, "reason": "chờ thu đủ hoặc duyệt nợ"}

    # Bước NỘP CƠ QUAN: chưa đóng hồ sơ (chưa có kết quả từ cơ quan) thì việc chưa
    # xong — dù checklist đã đạt. Chờ nhân viên pháp lý bấm "Đóng hồ sơ" rồi mới
    # nghiệm thu. (Đóng hồ sơ sẽ tự gọi lại hàm này.)
    if node["requires_gov_submission"] and node["dossier_status"] and node["dossier_status"] != "CLOSED":
        return {"finalized": False, "reason": "chờ đóng hồ sơ nộp cơ quan"}

    # ...và phải CẦM được biên nhận + cơ quan trả kết quả "Hoàn thành". Đóng hồ sơ và
    # duyệt checklist thôi chưa đủ: chưa có số biên nhận hoặc cơ quan chưa "Hoàn thành"
    # thì bước nộp cơ quan coi như chưa xong. Chỉ áp khi node thực sự có hồ sơ nộp cơ
    # quan (có dòng legal_submissions); cập nhật biên nhận sẽ gọi lại hàm này để chốt.
    if node["requires_gov_submission"] and node["gov_submission_status"] is not None:
        receipt = (node["gov_receipt_code"] or "").strip()
        if not receipt or node["gov_submission_status"] != "Hoàn thành":
            return {"finalized": False, "reason": "chờ biên nhận & kết quả Hoàn thành từ cơ quan"}

    # Checklist đạt hết = đi đường "hoàn thành". Rẽ nhánh (nhiều outcome, không rõ
    # mặc định) thì để giám đốc chọn tay — không tự đoán sai luồng.
    transitions = node["transitions"] or {}
    outcome = None
    branching = False
    if transitions:
        if "COMPLETED" in transitions:
            outcome = "COMPLETED"
        elif len(transitions) == 1:
            outcome = next(iter(transitions))
        else:
            branching = True

    # Chỉ bước rẽ nhiều nhánh mới cần người chọn outcome. K06 đã được chặn bằng
    # checklist + công nợ ở trên nên không thêm một vòng "Chờ nghiệm thu" nữa.
    can_auto_accept = not branching

    attempt_no = db.execute(
        text("select coalesce(max(attempt_no), 0) + 1 from public.task_node_acceptances where task_node_id = :i"),
        {"i": task_node_id},
    ).scalar_one()
    acceptance_id = db.execute(
        text(
            """
            insert into public.task_node_acceptances
                (task_node_id, attempt_no, status, submitted_by, submission_payload)
            values (:i, :a, 'pending', :actor, cast(:p as jsonb))
            returning id
            """
        ),
        {"i": task_node_id, "a": attempt_no, "actor": actor_id, "p": json.dumps({"auto": True})},
    ).scalar_one()
    db.execute(
        text("update public.task_nodes set status = 'submitted', submitted_at = now(), updated_at = now() where id = :i"),
        {"i": task_node_id},
    )
    db.execute(
        text(
            """
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            values (:i, 'NODE_SUBMITTED', 'in_progress', 'submitted', :actor, cast(:p as jsonb))
            """
        ),
        {"i": task_node_id, "actor": actor_id, "p": json.dumps({"acceptance_id": acceptance_id, "auto": True})},
    )
    if not can_auto_accept:
        # Rẽ nhiều nhánh: dừng ở "đã nộp", Giám đốc chọn kết quả xử lý.
        return {
            "finalized": False,
            "submitted": True,
            "task_node_id": task_node_id,
            "reason": "branching",
        }
    result = review_task_node_acceptance(
        db,
        acceptance_id=acceptance_id,
        decision="accepted",
        outcome=outcome,
        review_note="Tự nghiệm thu khi mọi checklist đã được duyệt",
        actor_id=actor_id,
    )
    return {"finalized": True, **result}


def auto_finalize_contract_handover_nodes(
    db: Session,
    *,
    contract_id: str,
    actor_id: str,
) -> list[dict[str, Any]]:
    """Thử đóng các K06 đang mở khi cổng công nợ của Hợp đồng vừa thay đổi."""
    task_node_ids = db.execute(
        text(
            """
            select n.id
            from public.task_nodes n
            join public.workflow_instances wi on wi.id = n.workflow_instance_id
            join public.service_lines sl on sl.id = wi.service_line_id
            left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
            left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
            where sl.contract_id = :contract_id
              and n.status = 'in_progress'
              and coalesce(
                    (coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key->>'is_handover')::boolean,
                    false
                  )
            order by n.created_at, n.id
            """
        ),
        {"contract_id": contract_id},
    ).scalars().all()
    return [
        auto_finalize_node_if_ready(db, task_node_id=task_node_id, actor_id=actor_id)
        for task_node_id in task_node_ids
    ]


ROLLBACK_RESET_STATUSES = {
    "ready", "in_progress", "submitted", "accepted", "blocked", "rework_required",
}


def _rollback_affected_nodes(db: Session, *, target_task_node_id: str) -> list[dict[str, Any]]:
    """Node quay lại + mọi node phía sau nó trong cùng Hạng mục.

    Thứ tự lấy theo mã bước (K01 ➔ K07) rồi tới lần lặp: sau khi danh mục được
    đánh số liên tục, mã bước CHÍNH LÀ thứ tự chạy, nên đây cũng là thứ tự mà
    bảng cascade trong tài liệu nghiệp vụ mô tả. Node đã huỷ/bỏ qua không đụng tới.
    """
    target = db.execute(
        text("""
            select id, workflow_instance_id, node_code, occurrence_no
            from public.task_nodes where id = :id
        """),
        {"id": target_task_node_id},
    ).mappings().first()
    if not target:
        raise WorkflowValidationError("Không tìm thấy bước cần quay lại")
    rows = db.execute(
        text("""
            select id, node_code, occurrence_no, status
            from public.task_nodes
            where workflow_instance_id = :instance_id
              and status not in ('cancelled', 'skipped')
              and (node_code, occurrence_no) >= (:node_code, :occurrence_no)
            order by node_code, occurrence_no
            for update
        """),
        {
            "instance_id": target["workflow_instance_id"],
            "node_code": target["node_code"],
            "occurrence_no": target["occurrence_no"],
        },
    ).mappings().all()
    return [dict(row) for row in rows]


def cascade_rollback(
    db: Session,
    *,
    target_task_node_id: str,
    reason: str,
    actor_id: str,
) -> dict[str, Any]:
    """Trả bước đích và toàn bộ bước phía sau về 'rework_required'.

    Các bước TRƯỚC điểm quay lại đã nghiệm thu thì giữ nguyên 100% — hồ sơ sai
    bản vẽ CAD không có nghĩa là buổi đo hiện trường phải làm lại.

    Tiền khoán đã phát KHÔNG bị thu hồi: người ta đã đi đo, đã vẽ thật. Nhưng
    sửa lại phần việc của chính mình thì không được trả thêm lần nữa — chốt này
    nằm ở khoá chống trùng của ``_generate_work_pay_entitlements``.

    Minh chứng cũ cũng không bị xoá: checklist quay về 'pending' để nộp bản mới,
    còn bản đã nộp vẫn nằm nguyên trong lịch sử để đối soát về sau.
    """
    affected = _rollback_affected_nodes(db, target_task_node_id=target_task_node_id)
    resettable = [node for node in affected if node["status"] in ROLLBACK_RESET_STATUSES]
    if not resettable:
        raise WorkflowValidationError("Không có bước nào ở trạng thái có thể quay lại")

    node_ids = [node["id"] for node in resettable]
    db.execute(
        text("""
            update public.task_nodes
            set status = 'rework_required',
                outcome = null,
                submitted_at = null,
                accepted_at = null,
                completed_at = null,
                notes = concat_ws(' | ', notes, :reason),
                updated_at = now()
            where id = any(:ids)
        """),
        {"ids": node_ids, "reason": f"Quay lại quy trình: {reason}"},
    )

    # Hạn sửa bài CẤP MỚI cho từng bước bị kéo về. Không đụng deadline_at: hạn
    # ban đầu gần như chắc chắn đã trôi qua, dùng lại là bước vừa mở lại đã đỏ
    # quá hạn dù nhân viên chưa kịp làm gì — và mọi cảnh báo trễ từ đó vô nghĩa.
    for node in resettable:
        db.execute(
            text("""
                update public.task_nodes
                set rework_deadline_at = clock_timestamp() + make_interval(hours => :hours)
                where id = :id
            """),
            {"id": node["id"], "hours": rework_deadline_hours(node.get("node_code"))},
        )
    db.execute(
        text("""
            update public.task_node_checklist_results
            set status = 'pending', submitted_at = null, updated_at = now()
            where task_node_id = any(:ids) and status not in ('pending', 'cancelled')
        """),
        {"ids": node_ids},
    )
    # Phán quyết TỪNG TỜ cũng phải hạ theo, không chỉ trạng thái mục checklist.
    #
    # Bỏ qua chỗ này thì K03 bị kéo về sửa nhưng mọi tờ vẫn 'approved' từ vòng
    # trước — cổng đóng bước thấy đủ 100% giấy đã duyệt và cho đóng luôn. Bản vẽ
    # sai ranh đi thẳng qua vòng hai mà không ai đọc lại.
    #
    # KHÔNG xoá dòng nối và KHÔNG xoá tệp: nhân viên cần nhìn bản cũ mới biết
    # phải sửa gì. Chỉ bắt duyệt lại.
    db.execute(
        text("""
            update public.checklist_result_document_links l
            set review_status = 'pending_review',
                rejection_reason = null,
                reviewed_by = null,
                reviewed_at = null
            from public.task_node_checklist_results r
            where r.id = l.checklist_result_id
              and r.task_node_id = any(:ids)
              and l.review_status <> 'pending_review'
        """),
        {"ids": node_ids},
    )
    for node in resettable:
        db.execute(
            text("""
                insert into public.task_node_events
                    (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
                values (:id, 'NODE_ROLLED_BACK', :from_status, 'rework_required', :actor_id,
                        cast(:payload as jsonb))
            """),
            {
                "id": node["id"],
                "from_status": node["status"],
                "actor_id": actor_id,
                "payload": json.dumps({
                    "reason": reason,
                    "rollback_target_task_node_id": target_task_node_id,
                }, ensure_ascii=False),
            },
        )

    # Báo cho mọi người đang giữ các bước bị trả về — cascade xuyên phòng ban nên
    # người vẽ CAD và chuyên viên pháp lý phải cùng biết ngay, không đợi ai gọi.
    db.execute(
        text("""
            insert into public.notifications (id, user_id, title, content, is_read, created_at)
            select gen_random_uuid()::text, e.user_id,
                   'Hồ sơ bị trả về, cần làm lại',
                   :content, false, now()
            from public.task_node_assignments a
            join public.employees e on e.id = a.employee_id
            where a.task_node_id = any(:ids)
              and a.assignment_status in ('proposed', 'assigned', 'accepted')
              and e.user_id is not null
            group by e.user_id
        """),
        {"ids": node_ids, "content": f"Lý do: {reason}"},
    )
    workflow_instance_id = db.execute(
        text("select workflow_instance_id from public.task_nodes where id = :id"),
        {"id": target_task_node_id},
    ).scalar()
    # Hạn của cả chuỗi cộng dồn từ bước đầu, nên trả về giữa chừng là phải tính lại
    # toàn bộ — không thì các bước phía sau vẫn treo hạn của lần chạy trước.
    recompute_planned_deadlines(db, workflow_instance_id=workflow_instance_id)
    return {
        "workflow_instance_id": workflow_instance_id,
        "affected_node_ids": node_ids,
        "affected_node_codes": [node["node_code"] for node in resettable],
    }


def request_workflow_rollback(
    db: Session,
    *,
    target_task_node_id: str,
    reason: str,
    requester_user_id: str,
) -> dict[str, Any]:
    """Nhân viên lập phiếu xin quay lại một bước — chưa đụng gì tới quy trình.

    Nguyên tắc bất biến của nghiệp vụ: không ai được tự lùi bước. Phiếu chỉ nằm
    chờ; đúng một chữ ký duyệt mới kích hoạt cascade.
    """
    ly_do = (reason or "").strip()
    if len(ly_do) < 5:
        raise WorkflowValidationError("Cần ghi rõ lý do quay lại (tối thiểu 5 ký tự)")

    affected = _rollback_affected_nodes(db, target_task_node_id=target_task_node_id)
    workflow_instance_id = db.execute(
        text("select workflow_instance_id from public.task_nodes where id = :id"),
        {"id": target_task_node_id},
    ).scalar()

    existing = db.execute(
        text("""
            select id from public.workflow_rollback_requests
            where workflow_instance_id = :instance_id and status = 'pending'
            limit 1
        """),
        {"instance_id": workflow_instance_id},
    ).scalar()
    if existing:
        raise WorkflowValidationError(
            "Hạng mục này đang có một phiếu xin quay lại chờ duyệt."
        )

    request_id = db.execute(
        text("""
            insert into public.workflow_rollback_requests
                (workflow_instance_id, target_task_node_id, requested_by, reason, affected_node_ids)
            values (:instance_id, :target, :requester, :reason, cast(:affected as jsonb))
            returning id
        """),
        {
            "instance_id": workflow_instance_id,
            "target": target_task_node_id,
            "requester": requester_user_id,
            "reason": ly_do,
            "affected": json.dumps([node["id"] for node in affected]),
        },
    ).scalar()
    return {
        "id": request_id,
        "status": "pending",
        "workflow_instance_id": workflow_instance_id,
        "affected_node_codes": [node["node_code"] for node in affected],
    }


def review_workflow_rollback(
    db: Session,
    *,
    request_id: str,
    decision: str,
    review_note: str | None,
    actor_id: str,
) -> dict[str, Any]:
    """Quản lý/Giám đốc duyệt hoặc từ chối phiếu quay lại. Duyệt là chạy cascade."""
    if decision not in ("approved", "rejected"):
        raise WorkflowValidationError("Quyết định phải là 'approved' hoặc 'rejected'")
    row = db.execute(
        text("""
            select id, workflow_instance_id, target_task_node_id, requested_by, reason, status
            from public.workflow_rollback_requests
            where id = :id
            for update
        """),
        {"id": request_id},
    ).mappings().first()
    if not row:
        raise WorkflowValidationError("Không tìm thấy phiếu xin quay lại")
    if row["status"] != "pending":
        raise TaskClaimConflict("Phiếu này đã được xử lý")

    note = (review_note or "").strip() or None
    if decision == "rejected" and not note:
        raise WorkflowValidationError("Từ chối thì phải ghi rõ lý do cho nhân viên")

    result: dict[str, Any] = {"id": request_id, "status": decision}
    if decision == "approved":
        result.update(cascade_rollback(
            db,
            target_task_node_id=row["target_task_node_id"],
            reason=row["reason"],
            actor_id=actor_id,
        ))

    db.execute(
        text("""
            update public.workflow_rollback_requests
            set status = :decision, reviewed_by = :actor, reviewed_at = now(),
                review_note = :note,
                affected_node_ids = coalesce(cast(:affected as jsonb), affected_node_ids),
                updated_at = now()
            where id = :id
        """),
        {
            "decision": decision,
            "actor": actor_id,
            "note": note,
            "affected": json.dumps(result["affected_node_ids"]) if decision == "approved" else None,
            "id": request_id,
        },
    )
    db.execute(
        text("""
            insert into public.notifications (id, user_id, title, content, is_read, created_at)
            values (gen_random_uuid()::text, :u, :title, :content, false, now())
        """),
        {
            "u": row["requested_by"],
            "title": (
                "Phiếu quay lại đã được duyệt" if decision == "approved"
                else "Phiếu quay lại bị từ chối"
            ),
            "content": note or row["reason"],
        },
    )
    return result


def _generate_work_pay_entitlements(
    db: Session, *, task_node_id: str, workflow_instance_id: str, acceptance_id: str, actor_id: str
) -> tuple[int, float]:
    """Create idempotent pay entitlements for every approved payable checklist on this node."""
    payable = db.execute(
        text("""
            select r.id as checklist_result_id, r.checklist_name, r.work_item_id
            from public.task_node_checklist_results r
            where r.task_node_id = :task_node_id and r.is_payable
              and r.status in ('approved', 'late_approved')
        """),
        {"task_node_id": task_node_id},
    ).mappings().all()
    if not payable:
        return 0, 0.0

    work_item_rates = _current_work_item_rates(db)
    count = 0
    total = 0.0
    for checklist in payable:
        assignments = db.execute(
            text("""
                select id, employee_id, role_code, work_item_rate_id
                from public.task_node_checklist_assignments
                where checklist_result_id = :checklist_result_id
                  and status not in ('replaced', 'cancelled')
            """),
            {"checklist_result_id": checklist["checklist_result_id"]},
        ).mappings().all()
        for assignment in assignments:
            rate = work_item_rates.get(checklist["work_item_id"], {}).get(assignment["role_code"])
            amount = float(rate["amount"]) if rate else None
            if not amount or amount <= 0:
                continue
            # Khoá theo SUẤT KHOÁN, không theo lần nghiệm thu. Một hồ sơ bị trả về
            # rồi nghiệm thu lại sẽ sinh acceptance_id mới; nếu khoá gồm cả nó thì
            # cùng một người làm lại đúng phần việc cũ vẫn được trả tiền lần hai.
            # Người khác vào thay sẽ có dòng phân công riêng, nên vẫn được trả đủ.
            idempotency_key = assignment["id"]
            exists = db.execute(
                text("""
                    select 1 from public.work_pay_entitlements
                    where idempotency_key = :key or idempotency_key like :legacy
                """),
                # Dữ liệu cũ lưu dạng "<suất>:<lần nghiệm thu>" — vẫn phải nhận ra
                # để bản vá này không mở đường trả lại lần nữa cho khoán đã trả.
                {"key": idempotency_key, "legacy": f"{assignment['id']}:%"},
            ).first()
            if exists:
                continue
            db.execute(
                text("""
                    insert into public.work_pay_entitlements
                        (workflow_instance_id, task_node_id, checklist_result_id, checklist_assignment_id,
                         acceptance_id, work_item_rate_id, employee_id, role_code, amount, earned_at,
                         status, calculation_snapshot, idempotency_key)
                    values
                        (:workflow_instance_id, :task_node_id, :checklist_result_id, :checklist_assignment_id,
                         :acceptance_id, :work_item_rate_id, :employee_id, :role_code, :amount, now(),
                         'eligible', cast(:snapshot as jsonb), :idempotency_key)
                """),
                {
                    "workflow_instance_id": workflow_instance_id,
                    "task_node_id": task_node_id,
                    "checklist_result_id": checklist["checklist_result_id"],
                    "checklist_assignment_id": assignment["id"],
                    "acceptance_id": acceptance_id,
                    "work_item_rate_id": assignment["work_item_rate_id"],
                    "employee_id": assignment["employee_id"],
                    "role_code": assignment["role_code"],
                    "amount": amount,
                    "snapshot": json.dumps({
                        "checklist_name": checklist["checklist_name"],
                        "role_code": assignment["role_code"],
                        "rate_amount": amount,
                    }),
                    "idempotency_key": idempotency_key,
                },
            )
            count += 1
            total += amount

    # Nối dấu vết: suất đã đánh dấu bị thay lúc nhờ hỗ trợ nay mới biết mình bị
    # thay bằng dòng nào. Lúc `claim_node_help` chạy thì suất của người nhận chưa
    # tồn tại — nó vừa được sinh ở vòng lặp trên.
    #
    # Chỉ đắp cho dòng còn trống, và chỉ trỏ sang suất cùng bước, cùng vai trò,
    # chưa bị thay. Trỏ bừa sang một suất khác vai trò là dựng ra một mối quan hệ
    # thay thế không có thật.
    db.execute(
        text("""
            update public.work_pay_entitlements old
            set replaced_by = new_entry.id
            from public.work_pay_entitlements new_entry
            where old.task_node_id = :task_node_id
              and old.is_replaced
              and old.replaced_by is null
              and new_entry.task_node_id = old.task_node_id
              and new_entry.role_code = old.role_code
              and new_entry.id <> old.id
              and not new_entry.is_replaced
        """),
        {"task_node_id": task_node_id},
    )
    return count, total


def cancel_workflow(
    db: Session,
    *,
    service_line_id: str,
    cancellation_code: str,
    reason: str,
    agency_handling_confirmed: bool,
    agency_handling_note: str | None,
    actor_id: str,
) -> dict[str, Any]:
    """Terminally cancel one workflow while preserving evidence and earned pay."""
    code = str(cancellation_code or "").strip().upper()
    normalized_reason = str(reason or "").strip()
    normalized_agency_note = str(agency_handling_note or "").strip() or None
    if code not in CANCELLATION_CODES:
        raise WorkflowValidationError("Nhóm lý do hủy quy trình không hợp lệ")
    if len(normalized_reason) < 5:
        raise WorkflowValidationError("Lý do hủy quy trình phải có ít nhất 5 ký tự")

    instance = db.execute(
        text("""
            select id, status, active_revision_id
            from public.workflow_instances
            where service_line_id = :service_line_id
            for update
        """),
        {"service_line_id": service_line_id},
    ).mappings().first()
    if not instance:
        raise WorkflowValidationError("Hạng mục chưa có workflow để hủy")
    if instance["status"] == "cancelled":
        raise WorkflowValidationError("Workflow này đã được hủy trước đó")
    if instance["status"] == "completed":
        raise WorkflowValidationError("Workflow đã hoàn thành; không thể chuyển thành đã hủy")
    if instance["status"] not in {"not_started", "running", "paused"}:
        raise WorkflowValidationError("Trạng thái workflow hiện tại không cho phép hủy")

    node_rows = [dict(row) for row in db.execute(
        text("""
            select id, node_key, node_code, status, outcome,
                   started_at, submitted_at, accepted_at
            from public.task_nodes
            where workflow_instance_id = :workflow_instance_id
            order by id
            for update
        """),
        {"workflow_instance_id": instance["id"]},
    ).mappings().all()]
    agency_nodes = [
        node for node in node_rows
        if node["node_code"] in NODES_SUBMITTED_TO_AGENCY
        and (
            node["status"] in {"in_progress", "submitted", "accepted"}
            or node["started_at"] is not None
            or node["submitted_at"] is not None
            or node["accepted_at"] is not None
        )
    ]
    if agency_nodes and not agency_handling_confirmed:
        raise WorkflowValidationError(
            "Hồ sơ đã đi vào khâu cơ quan nhà nước; cần xác nhận phương án rút/bàn giao hồ sơ"
        )
    if agency_nodes and (not normalized_agency_note or len(normalized_agency_note) < 5):
        raise WorkflowValidationError(
            "Cần ghi rõ phương án xử lý hồ sơ đang ở cơ quan trước khi hủy"
        )

    cancellable_statuses = {
        "pending", "ready", "in_progress", "submitted",
        "rework_required", "blocked",
    }
    cancelled_nodes = [node for node in node_rows if node["status"] in cancellable_statuses]
    cancelled_node_ids = [node["id"] for node in cancelled_nodes]

    entitlement = db.execute(
        text("""
            select count(*)::integer as entitlement_count,
                   coalesce(sum(amount), 0) as entitlement_amount
            from public.active_work_pay_entitlements
            where workflow_instance_id = :workflow_instance_id
              and status <> 'void'
        """),
        {"workflow_instance_id": instance["id"]},
    ).mappings().one()

    if cancelled_node_ids:
        db.execute(
            text("""
                update public.task_node_acceptances
                set status = 'rejected', reviewer_user_id = :actor_id,
                    reviewed_at = now(), review_note = :reason
                where task_node_id = any(:task_node_ids)
                  and status = 'pending'
            """),
            {
                "task_node_ids": cancelled_node_ids,
                "actor_id": actor_id,
                "reason": f"Workflow bị hủy: {normalized_reason}",
            },
        )
        assignment_count = db.execute(
            text("""
                update public.task_node_assignments
                set assignment_status = 'cancelled', ended_at = now(),
                    replacement_reason = :reason, updated_at = now()
                where task_node_id = any(:task_node_ids)
                  and assignment_status in ('proposed', 'assigned', 'accepted')
                returning id
            """),
            {"task_node_ids": cancelled_node_ids, "reason": normalized_reason},
        ).rowcount
        checklist_assignment_count = db.execute(
            text("""
                update public.task_node_checklist_assignments ca
                set status = 'cancelled', ended_at = now(), reason = :reason, updated_at = now()
                from public.task_node_checklist_results cr
                where ca.checklist_result_id = cr.id
                  and cr.task_node_id = any(:task_node_ids)
                  and ca.status in ('proposed', 'assigned')
                returning ca.id
            """),
            {"task_node_ids": cancelled_node_ids, "reason": normalized_reason},
        ).rowcount
        checklist_count = db.execute(
            text("""
                update public.task_node_checklist_results
                set status = 'not_applicable',
                    note = concat_ws(E'\n', nullif(note, ''), :note),
                    updated_at = now()
                where task_node_id = any(:task_node_ids)
                  and status = 'pending'
                returning id
            """),
            {
                "task_node_ids": cancelled_node_ids,
                "note": f"Không tiếp tục do workflow bị hủy: {normalized_reason}",
            },
        ).rowcount

        for node in cancelled_nodes:
            db.execute(
                text("""
                    insert into public.task_node_events
                        (task_node_id, event_type, from_status, to_status,
                         actor_user_id, payload)
                    values
                        (:task_node_id, 'WORKFLOW_CANCELLED', :from_status, 'cancelled',
                         :actor_id, cast(:payload as jsonb))
                """),
                {
                    "task_node_id": node["id"],
                    "from_status": node["status"],
                    "actor_id": actor_id,
                    "payload": json.dumps({
                        "workflow_instance_id": instance["id"],
                        "cancellation_code": code,
                        "reason": normalized_reason,
                        "agency_handling_note": normalized_agency_note,
                    }, ensure_ascii=False),
                },
            )
        db.execute(
            text("""
                update public.task_nodes
                set status = 'cancelled',
                    blocked_reason = case
                      when status = 'blocked' then blocked_reason
                      else null
                    end,
                    notes = concat_ws(E'\n', nullif(notes, ''), :note),
                    updated_at = now()
                where id = any(:task_node_ids)
            """),
            {
                "task_node_ids": cancelled_node_ids,
                "note": f"Workflow bị hủy: {normalized_reason}",
            },
        )
    else:
        assignment_count = 0
        checklist_assignment_count = 0
        checklist_count = 0

    discarded_revision_count = db.execute(
        text("""
            update public.workflow_instance_revisions
            set status = 'discarded',
                change_reason = concat_ws(E'\n', nullif(change_reason, ''), :reason)
            where workflow_instance_id = :workflow_instance_id
              and status = 'draft'
            returning id
        """),
        {
            "workflow_instance_id": instance["id"],
            "reason": f"Bản nháp bị đóng do hủy workflow: {normalized_reason}",
        },
    ).rowcount

    cancellation_data = {
        "previous_status": instance["status"],
        "cancelled_node_count": len(cancelled_node_ids),
        "preserved_node_count": len(node_rows) - len(cancelled_node_ids),
        "cancelled_assignment_count": assignment_count,
        "cancelled_compensation_assignment_count": checklist_assignment_count,
        "cancelled_checklist_count": checklist_count,
        "discarded_draft_revision_count": discarded_revision_count,
        "preserved_entitlement_count": int(entitlement["entitlement_count"] or 0),
        "preserved_entitlement_amount": float(entitlement["entitlement_amount"] or 0),
        "agency_handling_required": bool(agency_nodes),
        "agency_handling_confirmed": bool(agency_nodes and agency_handling_confirmed),
        "agency_handling_note": normalized_agency_note,
        "agency_node_ids": [node["id"] for node in agency_nodes],
    }
    db.execute(
        text("""
            update public.workflow_instances
            set status = 'cancelled', cancellation_code = :cancellation_code,
                cancellation_reason = :cancellation_reason,
                cancellation_data = cast(:cancellation_data as jsonb),
                cancelled_by = :actor_id, cancelled_at = now(), updated_at = now()
            where id = :workflow_instance_id
        """),
        {
            "workflow_instance_id": instance["id"],
            "cancellation_code": code,
            "cancellation_reason": normalized_reason,
            "cancellation_data": json.dumps(cancellation_data, ensure_ascii=False),
            "actor_id": actor_id,
        },
    )
    return {
        "instance_id": instance["id"],
        "status": "cancelled",
        **cancellation_data,
    }


# ══════════════════════════════════════════════════════════════════════════════
# NHƯỜNG VIỆC (Cứu viện) — Ch.5.2 & Ch.6
#
# Người giữ việc gặp trở ngại bất khả kháng thì đẩy MỘT bước lên Bể việc nhờ
# đồng đội làm hộ. Ba điều bất biến, sai một cái là hỏng cả cơ chế:
#
#   1. Nhường một bước KHÔNG đổi chủ hạng mục. Các bước còn lại vẫn của người
#      nhường, tải dở dang của họ không được giải phóng.
#   2. Người nhận hộ chỉ thao tác được ĐÚNG bước đó. Họ vẫn thấy cả sơ đồ chuỗi
#      để nắm bối cảnh, nhưng bước khác là của người khác.
#   3. Khoán của bước chuyển sang người làm thật. Người nhường không nhận tiền
#      của phần việc mình không làm.
# ══════════════════════════════════════════════════════════════════════════════

def help_request_expired(
    request: dict[str, Any] | None,
    *,
    now: datetime | None = None,
) -> bool:
    """Yêu cầu nhờ hỗ trợ đã quá hạn nhận chưa.

    ``now`` là tham số chứ không đọc thẳng đồng hồ hệ thống, để test truyền được
    mốc cố định — chạy 2 giờ sáng hay giữa trưa đều ra một kết quả. Cùng lối với
    ``daysUntil(value, now)`` bên frontend.

    Chỉ yêu cầu còn MỞ mới hết hạn được: đã có người nhận hoặc đã huỷ thì mốc kia
    không còn nghĩa gì.
    """
    if not request or request.get("status") != "open":
        return False
    expires_at = request.get("expires_at")
    if not expires_at:
        # Dòng cũ chưa có mốc (migration A đắp cho status='open', nhưng dữ liệu
        # tới từ cache cũ thì vẫn có thể thiếu). Không mốc thì không hết hạn —
        # thà để treo còn hơn tự huỷ lời nhờ của người ta.
        return False
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except ValueError:
            return False
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return (now or datetime.now(timezone.utc)) >= expires_at


def expire_stale_help_requests(db: Session, *, task_node_id: str | None = None) -> int:
    """Đóng các yêu cầu nhờ hỗ trợ đã quá hạn. Trả về số dòng vừa đóng.

    Kiểm LƯỜI ngay lúc đọc: không cron, không tiến trình nền nào phải nuôi. Gọi ở
    đầu mọi cửa đọc bể việc và chi tiết bước — chỗ nào thấy yêu cầu "đang mở" thì
    chỗ đó có trách nhiệm dọn trước khi bày ra.

    ``for update skip locked``: nhiều request cùng quét một dòng thì đúng một
    request giữ khoá, các request khác bỏ qua ngay thay vì xếp hàng rồi đóng lần
    hai. Quét sót một lượt không sao — lượt đọc kế tiếp dọn nốt; quét trùng mới
    sinh hai sự kiện cho cùng một việc.

    Cột ``expires_at`` chưa tồn tại (migration A chưa lên) thì trả 0 và đi tiếp:
    hành vi lùi về đúng như trước khi có luật hết hạn.
    """
    try:
        expired_ids = [row[0] for row in db.execute(
            text("""
                with due as (
                    select id from public.task_node_help_requests
                    where status = 'open'
                      and expires_at is not null
                      and expires_at <= now()
                      and (:task_node_id is null or task_node_id = :task_node_id)
                    for update skip locked
                )
                update public.task_node_help_requests h
                set status = 'expired', updated_at = now()
                from due
                where h.id = due.id
                returning h.id
            """),
            {"task_node_id": task_node_id},
        ).all()]
    except Exception:
        return 0

    for request_id in expired_ids:
        db.execute(
            text("""
                insert into public.task_node_events
                    (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
                select h.task_node_id, 'HELP_EXPIRED', n.status, n.status, null,
                       cast(:payload as jsonb)
                from public.task_node_help_requests h
                join public.task_nodes n on n.id = h.task_node_id
                where h.id = :id
            """),
            # actor_user_id để null là ĐÚNG ở đây và chỉ ở đây: không ai bấm gì
            # cả, hết hạn là do đồng hồ. Gán bừa người đang đọc vào chỗ này là
            # ghi lịch sử sai — hoá ra họ tự huỷ lời nhờ của người khác.
            {"id": request_id, "payload": json.dumps({
                "help_request_id": request_id,
                "reason": f"Quá {SUPPORT_TIMEOUT_HOURS} giờ không có người nhận",
            }, ensure_ascii=False)},
        )
    return len(expired_ids)


def request_node_help(
    db: Session,
    *,
    task_node_id: str,
    employee_id: str,
    reason: str,
    proposed_amount: float | None = None,
) -> dict[str, Any]:
    """Đẩy một bước đang giữ lên Bể việc để nhờ người khác làm hộ."""
    ly_do = (reason or "").strip()
    if len(ly_do) < 5:
        raise WorkflowValidationError("Cần ghi rõ lý do nhờ hỗ trợ (tối thiểu 5 ký tự)")

    _require_node_assignment(db, task_node_id=task_node_id, employee_id=employee_id)
    node = db.execute(
        text("""
            select n.id, n.node_code, n.status
            from public.task_nodes n
            where n.id = :id
            for update
        """),
        {"id": task_node_id},
    ).mappings().first()
    if not node:
        raise WorkflowValidationError("Node không tồn tại")
    if node["status"] not in ("ready", "in_progress", "rework_required"):
        raise WorkflowValidationError(
            "Chỉ nhờ hỗ trợ được bước đang làm dở, chưa nộp nghiệm thu"
        )

    # Dọn lời nhờ đã quá hạn TRƯỚC khi kiểm trùng. Bỏ qua bước này thì một yêu
    # cầu chết từ hôm qua vẫn chặn người ta nhờ lại hôm nay — khoá duy nhất chỉ
    # cho một dòng 'open' trên mỗi bước.
    expire_stale_help_requests(db, task_node_id=task_node_id)

    if db.execute(
        text("""
            select 1 from public.task_node_help_requests
            where task_node_id = :id and status = 'open' limit 1
        """),
        {"id": task_node_id},
    ).first():
        raise TaskClaimConflict("Bước này đã được đẩy lên Bể việc, đang chờ người nhận.")

    # Mốc hết hạn tính bằng đồng hồ DB, không phải đồng hồ tiến trình: nhiều
    # worker lệch giờ nhau vài giây là đủ để hai lời nhờ cùng lúc có hạn khác nhau.
    request_id = db.execute(
        text("""
            insert into public.task_node_help_requests
                (task_node_id, requested_by_employee_id, reason, proposed_amount, expires_at)
            values (:task_node_id, :employee_id, :reason, :amount,
                    now() + make_interval(hours => :timeout_hours))
            returning id
        """),
        {
            "task_node_id": task_node_id,
            "employee_id": employee_id,
            "reason": ly_do,
            "amount": proposed_amount,
            "timeout_hours": SUPPORT_TIMEOUT_HOURS,
        },
    ).scalar()

    db.execute(
        text("""
            insert into public.task_node_events
                (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
            select :task_node_id, 'HELP_REQUESTED', :status, :status, e.user_id,
                   cast(:payload as jsonb)
            from public.employees e where e.id = :employee_id
        """),
        {
            "task_node_id": task_node_id,
            "status": node["status"],
            "employee_id": employee_id,
            "payload": json.dumps({
                "help_request_id": request_id,
                "reason": ly_do,
                "proposed_amount": float(proposed_amount) if proposed_amount else None,
            }, ensure_ascii=False),
        },
    )
    return {"id": request_id, "task_node_id": task_node_id, "status": "open"}


def cancel_node_help(db: Session, *, request_id: str, employee_id: str) -> dict[str, Any]:
    """Người nhường rút lại lời nhờ khi chưa ai nhận."""
    row = db.execute(
        text("""
            select id, task_node_id, requested_by_employee_id, status
            from public.task_node_help_requests where id = :id
            for update
        """),
        {"id": request_id},
    ).mappings().first()
    if not row:
        raise WorkflowValidationError("Không tìm thấy lời nhờ hỗ trợ")
    if row["requested_by_employee_id"] != employee_id:
        raise WorkflowValidationError("Chỉ người đã nhờ mới rút lại được")
    if row["status"] != "open":
        raise TaskClaimConflict("Lời nhờ này đã được xử lý")

    db.execute(
        text("""
            update public.task_node_help_requests
            set status = 'cancelled', cancelled_at = now(), updated_at = now()
            where id = :id
        """),
        {"id": request_id},
    )
    return {"id": request_id, "status": "cancelled"}


def claim_node_help(
    db: Session, *, request_id: str, employee_id: str, actor_id: str
) -> dict[str, Any]:
    """Đồng đội nhận làm hộ một bước.

    Khoán của bước chuyển sang người làm thật: suất khoán cũ của người nhường bị
    đánh dấu thay thế trước khi gán suất mới, nếu không cả hai cùng được tính
    tiền cho một phần việc chỉ một người làm.
    """
    from src.core.redis_utils import redis_distributed_lock

    with redis_distributed_lock(
        f"claim_help:{request_id}",
        timeout_seconds=5,
        blocking_timeout=0,
        custom_error_msg="Lời nhờ này vừa được người khác nhận.",
    ):
        row = db.execute(
            text("""
                select h.id, h.task_node_id, h.status, h.requested_by_employee_id,
                       h.proposed_amount, n.node_code, n.status as node_status,
                       n.workflow_instance_id
                from public.task_node_help_requests h
                join public.task_nodes n on n.id = h.task_node_id
                where h.id = :id
                for update of h
            """),
            {"id": request_id},
        ).mappings().first()
        if not row:
            raise WorkflowValidationError("Không tìm thấy lời nhờ hỗ trợ")
        if row["status"] != "open":
            raise TaskClaimConflict("Lời nhờ này vừa được người khác nhận trước bạn.")
        if row["requested_by_employee_id"] == employee_id:
            raise WorkflowValidationError("Bạn không thể nhận hộ chính bước mình nhờ")

        employee = db.execute(
            text("""
                select e.id, d.code as department_code
                from public.employees e
                left join public.departments d on d.id = e.department_id
                where e.id = :id and coalesce(e.is_active, true)
            """),
            {"id": employee_id},
        ).mappings().first()
        if not employee:
            raise WorkflowValidationError("Nhân viên không tồn tại hoặc đã ngừng hoạt động")

        node_definition = db.execute(
            text("""
                select coalesce(r_act.graph, r_def.graph)->'nodes'->n.node_key
                from public.task_nodes n
                join public.workflow_instances wi on wi.id = n.workflow_instance_id
                left join public.workflow_instance_revisions r_act on r_act.id = wi.active_revision_id
                left join public.workflow_instance_revisions r_def on r_def.id = n.defined_by_revision_id
                where n.id = :id
            """),
            {"id": row["task_node_id"]},
        ).scalar() or {}
        allowed = task_pool_departments(row["node_code"], node_definition)
        if allowed and str(employee["department_code"] or "").upper() not in allowed:
            raise WorkflowValidationError("Bạn không thuộc phòng ban làm được bước này")

        # Suất khoán cũ phải nhả trước khi gán suất mới.
        db.execute(
            text("""
                update public.task_node_checklist_assignments a
                set status = 'replaced', ended_at = now(), updated_at = now(),
                    reason = concat_ws(' | ', a.reason, 'Nhường bước cho người khác làm hộ')
                from public.task_node_checklist_results r
                where r.id = a.checklist_result_id
                  and r.task_node_id = :task_node_id
                  and a.employee_id = :old_employee_id
                  and a.status not in ('replaced', 'cancelled')
            """),
            {"task_node_id": row["task_node_id"], "old_employee_id": row["requested_by_employee_id"]},
        )
        db.execute(
            text("""
                update public.task_node_assignments
                set assignment_status = 'replaced', ended_at = now(),
                    replacement_reason = 'Nhường bước lên Bể việc', updated_at = now()
                where task_node_id = :task_node_id
                  and employee_id = :old_employee_id
                  and assignment_status in ('proposed', 'assigned', 'accepted')
            """),
            {"task_node_id": row["task_node_id"], "old_employee_id": row["requested_by_employee_id"]},
        )

        # Suất khoán ĐÃ SINH của người nhường phải ngừng được tính lương.
        #
        # Thường thì chưa có suất nào: khoán sinh lúc nghiệm thu, mà bước này còn
        # đang làm dở. Nhưng bước bị trả về sửa (rework) thì suất vòng trước vẫn
        # nằm đó — không đánh dấu là người nhường được trả tiền cho phần việc
        # người nhận làm.
        #
        # KHÔNG xoá dòng và KHÔNG hạ amount về 0: ràng buộc amount > 0 chặn số 0,
        # và quan trọng hơn, số tiền cũ là thứ duy nhất để đối chiếu khi có tranh
        # chấp. Việc loại khỏi bảng lương do view active_work_pay_entitlements làm.
        #
        # ``replaced_by`` để trống ở đây vì suất của người nhận chưa tồn tại — nó
        # được đắp vào lúc nghiệm thu, trong _generate_work_pay_entitlements.
        db.execute(
            text("""
                update public.work_pay_entitlements
                set is_replaced = true
                where task_node_id = :task_node_id
                  and employee_id = :old_employee_id
                  and not is_replaced
                  and status <> 'void'
            """),
            {"task_node_id": row["task_node_id"], "old_employee_id": row["requested_by_employee_id"]},
        )

        assignment_id = db.execute(
            text("""
                insert into public.task_node_assignments
                    (task_node_id, employee_id, role_code, is_primary,
                     assignment_status, assigned_by, notes)
                values (:task_node_id, :employee_id, 'MAIN', true,
                        'assigned', :actor_id, 'Nhận làm hộ từ Bể việc')
                returning id
            """),
            {
                "task_node_id": row["task_node_id"],
                "employee_id": employee_id,
                "actor_id": actor_id,
            },
        ).scalar()

        db.execute(
            text("""
                update public.task_node_help_requests
                set status = 'claimed', claimed_by_employee_id = :employee_id,
                    claimed_at = now(), updated_at = now()
                where id = :id
            """),
            {"id": request_id, "employee_id": employee_id},
        )

        if row["node_status"] == "ready":
            db.execute(
                text("""
                    update public.task_nodes
                    set status = 'in_progress', started_at = coalesce(started_at, now()),
                        updated_at = now()
                    where id = :id and status = 'ready'
                """),
                {"id": row["task_node_id"]},
            )

        db.execute(
            text("""
                insert into public.task_node_events
                    (task_node_id, event_type, from_status, to_status, actor_user_id, payload)
                values (:task_node_id, 'HELP_CLAIMED', :status, :status, :actor_id,
                        cast(:payload as jsonb))
            """),
            {
                "task_node_id": row["task_node_id"],
                "status": row["node_status"],
                "actor_id": actor_id,
                "payload": json.dumps({
                    "help_request_id": request_id,
                    "helper_employee_id": employee_id,
                    "yielded_by_employee_id": row["requested_by_employee_id"],
                }),
            },
        )

        compensation = _bind_claimed_employee_to_payable_checklists(
            db,
            task_node_id=row["task_node_id"],
            employee_id=employee_id,
            role_code="MAIN",
            actor_id=actor_id,
        )
        provisioned = _ensure_node_module_records(
            db, task_node_id=row["task_node_id"], actor_id=actor_id
        )
        return {
            "help_request_id": request_id,
            "task_node_id": row["task_node_id"],
            "assignment_id": assignment_id,
            **compensation,
            **provisioned,
        }
