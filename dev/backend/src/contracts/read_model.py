import json
import logging
import os
import re
from datetime import date, datetime, timezone

import redis
from redis.exceptions import RedisError
from sqlalchemy.orm import Session

from src.db.database import SessionLocal
from src.db.models import Contract, Customer, LeadPipeline, ProjectTask, Receivable

logger = logging.getLogger(__name__)

CONTRACT_READ_KEY = "bachkhoa:read:contracts:v1"
CONTRACT_CACHE_TTL_SECONDS = int(os.getenv("CONTRACT_CACHE_TTL_SECONDS", "900"))
CONTRACT_CACHE_REFRESH_SECONDS = int(os.getenv("CONTRACT_CACHE_REFRESH_SECONDS", "300"))
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")

_CHILD_CONTRACT_PATTERN = re.compile(
    r"^(?P<base>.+)-(?P<child_number>\d+)/(?P<series>BK-\d{4})$",
    re.IGNORECASE,
)
_redis_client = None


def get_contract_hierarchy(contract_id: str):
    match = _CHILD_CONTRACT_PATTERN.match((contract_id or "").strip())
    if not match:
        return contract_id, None

    group_id = f"{match.group('base')}/{match.group('series')}"
    return group_id, int(match.group("child_number"))


def _get_redis_client():
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=0.5,
            socket_timeout=1.0,
            health_check_interval=30,
        )
    return _redis_client


def build_contract_read_model(db: Session):
    """Tạo read model đầy đủ từ Supabase/Postgres."""
    contracts = db.query(Contract).order_by(
        Contract.date_signed.desc().nullslast(),
        Contract.created_at.desc(),
    ).all()
    contract_ids = [contract.id for contract in contracts]

    customer_ids = {contract.customer_id for contract in contracts if contract.customer_id}
    customers = (
        db.query(Customer).filter(Customer.id.in_(customer_ids)).all()
        if customer_ids else []
    )
    customer_by_id = {customer.id: customer for customer in customers}

    lead_ids = {contract.lead_id for contract in contracts if contract.lead_id}
    leads = (
        db.query(LeadPipeline).filter(LeadPipeline.id.in_(lead_ids)).all()
        if lead_ids else []
    )
    lead_by_id = {lead.id: lead for lead in leads}

    receivables = (
        db.query(Receivable).filter(Receivable.contract_id.in_(contract_ids)).all()
        if contract_ids else []
    )
    receivable_by_contract = {
        receivable.contract_id: receivable for receivable in receivables
    }

    tasks = (
        db.query(ProjectTask).filter(ProjectTask.contract_id.in_(contract_ids)).all()
        if contract_ids else []
    )
    task_by_contract = {task.contract_id: task for task in tasks}

    result = []
    for contract in contracts:
        customer = customer_by_id.get(contract.customer_id)
        lead = lead_by_id.get(contract.lead_id)
        receivable = receivable_by_contract.get(contract.id)
        task = task_by_contract.get(contract.id)

        total = float(contract.total_value or 0)
        paid = float((receivable.paid_amount or 0) if receivable else 0)
        debt = max(total - paid, 0)
        due_date = receivable.due_date if receivable else None

        if debt <= 0:
            status = "Đã tất toán"
        elif due_date and due_date < date.today():
            status = "Quá hạn"
        else:
            status = "Còn nợ"

        group_id, child_number = get_contract_hierarchy(contract.id)
        result.append({
            "Mã hợp đồng": contract.id,
            "Mã hợp đồng nhóm": group_id,
            "Số thứ tự hợp đồng con": child_number,
            "Là hợp đồng con": child_number is not None,
            "Mã hồ sơ": task.id if task else "",
            "Tên khách hàng": customer.full_name if customer else "N/A",
            "Phòng ban": task.department if task and task.department else "",
            "Dịch vụ": contract.service_type or (task.task_name if task else "") or "",
            "Ngày ký": contract.date_signed.strftime("%Y-%m-%d") if contract.date_signed else "",
            "Giá trị hợp đồng": total,
            "Đã thu": paid,
            "Còn nợ": debt,
            "Sale / nguồn": lead.source if lead and lead.source else "",
            "Ngày đến hạn": due_date.strftime("%Y-%m-%d") if due_date else "",
            "Tình trạng": status,
            "Ghi chú": "",
            "File Hợp đồng": contract.file_link or "",
        })
    return result


def _write_cache(rows):
    payload = json.dumps(
        {
            "loaded_at": datetime.now(timezone.utc).isoformat(),
            "rows": rows,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    _get_redis_client().setex(
        CONTRACT_READ_KEY,
        CONTRACT_CACHE_TTL_SECONDS,
        payload,
    )


def refresh_contract_read_model(db: Session):
    """Đọc Supabase rồi ghi đè read model Redis; lỗi Redis không làm lỗi command."""
    rows = build_contract_read_model(db)
    try:
        _write_cache(rows)
        logger.info("Contract read model refreshed: %s rows", len(rows))
    except RedisError as exc:
        logger.warning("Cannot refresh contract Redis cache: %s", exc)
    return rows


def sync_contract_read_model_after_write(db: Session):
    """Command side: bỏ cache cũ rồi cố gắng dựng read model mới."""
    try:
        _get_redis_client().delete(CONTRACT_READ_KEY)
    except RedisError as exc:
        logger.warning("Cannot invalidate contract Redis cache: %s", exc)

    try:
        return refresh_contract_read_model(db)
    except Exception as exc:
        logger.warning("Cannot rebuild contract read model after write: %s", exc)
        return None


def warm_contract_read_model():
    """Dùng lúc startup/định kỳ, tự quản lý database session."""
    db = SessionLocal()
    try:
        return refresh_contract_read_model(db)
    finally:
        db.close()


def get_contract_read_model(db: Session):
    """Query side: Redis trước, Supabase fallback khi cache miss hoặc Redis lỗi."""
    try:
        cached = _get_redis_client().get(CONTRACT_READ_KEY)
        if cached:
            payload = json.loads(cached)
            rows = payload.get("rows")
            if isinstance(rows, list):
                return rows, "redis"
    except (RedisError, json.JSONDecodeError, TypeError) as exc:
        logger.warning("Cannot read contract Redis cache: %s", exc)

    rows = refresh_contract_read_model(db)
    return rows, "supabase"


def query_contract_read_model(
    rows,
    *,
    month=None,
    year=None,
    date_signed=None,
    search=None,
    status=None,
    service=None,
    sort="desc",
    page=1,
    page_size=0,
):
    """Lọc trên toàn bộ Redis read model rồi phân trang theo nhóm hợp đồng."""
    normalized_search = (search or "").strip().casefold()
    valid_month = month if month and re.fullmatch(r"\d{4}-\d{2}", month) else None
    valid_year = year if year and re.fullmatch(r"\d{4}", year) else None
    valid_date = (
        date_signed
        if date_signed and re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_signed)
        else None
    )
    source = list(reversed(rows)) if sort == "asc" else rows

    groups = {}
    for row in source:
        group_id = row.get("Mã hợp đồng nhóm") or row.get("Mã hợp đồng")
        groups.setdefault(group_id, []).append(row)

    def matches(row):
        if valid_date and str(row.get("Ngày ký", "")) != valid_date:
            return False
        if valid_month and not str(row.get("Ngày ký", "")).startswith(valid_month):
            return False
        if valid_year and not str(row.get("Ngày ký", "")).startswith(valid_year):
            return False
        if status and status != "All" and row.get("Tình trạng") != status:
            return False
        if service and service != "All" and row.get("Dịch vụ") != service:
            return False
        if normalized_search:
            searchable = (
                row.get("Mã hợp đồng"),
                row.get("Mã hợp đồng nhóm"),
                row.get("Mã hồ sơ"),
                row.get("Tên khách hàng"),
                row.get("Phòng ban"),
                row.get("Dịch vụ"),
                row.get("Sale / nguồn"),
            )
            if not any(normalized_search in str(value or "").casefold() for value in searchable):
                return False
        return True

    matched_groups = [
        (group_id, members)
        for group_id, members in groups.items()
        if any(matches(member) for member in members)
    ]
    total_groups = len(matched_groups)
    total_contracts = sum(len(members) for _, members in matched_groups)

    if page_size > 0:
        start = (page - 1) * page_size
        selected_groups = matched_groups[start:start + page_size]
        total_pages = (total_groups + page_size - 1) // page_size
    else:
        selected_groups = matched_groups
        total_pages = 1 if total_groups else 0

    selected_rows = [
        row
        for _, members in selected_groups
        for row in members
    ]
    return {
        "data": selected_rows,
        "pagination": {
            "page": page,
            "page_size": page_size or total_groups,
            "total_groups": total_groups,
            "total_contracts": total_contracts,
            "total_pages": total_pages,
        },
    }


def get_contract_cache_status():
    try:
        client = _get_redis_client()
        raw = client.get(CONTRACT_READ_KEY)
        if not raw:
            return {"redis": "ok", "cache": "empty", "rows": 0, "ttl": -2}
        payload = json.loads(raw)
        return {
            "redis": "ok",
            "cache": "ready",
            "rows": len(payload.get("rows", [])),
            "loaded_at": payload.get("loaded_at"),
            "ttl": client.ttl(CONTRACT_READ_KEY),
        }
    except (RedisError, json.JSONDecodeError, TypeError) as exc:
        return {"redis": "unavailable", "cache": "fallback_supabase", "detail": str(exc)}
