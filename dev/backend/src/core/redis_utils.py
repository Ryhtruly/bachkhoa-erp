import json
import logging
import os
from contextlib import contextmanager
from typing import Any, Optional

import redis
from redis.exceptions import RedisError
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")

_client: Optional[redis.Redis] = None


def get_redis_client() -> Optional[redis.Redis]:
    """Trả về Redis client singleton; trả về None nếu không kết nối được."""
    global _client
    if _client is None:
        try:
            _client = redis.Redis.from_url(
                REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=0.5,
                socket_timeout=1.0,
                health_check_interval=30,
            )
            # Ping nhẹ để kiểm tra liveness
            _client.ping()
        except Exception as exc:
            logger.warning("Không kết nối được tới Redis (%s): %s", REDIS_URL, exc)
            _client = None
    return _client


def get_cached_json(key: str) -> Optional[Any]:
    """Lấy dữ liệu JSON từ cache Redis; tự động bỏ qua nếu lỗi."""
    client = get_redis_client()
    if not client:
        return None
    try:
        raw = client.get(key)
        if raw:
            return json.loads(raw)
    except Exception as exc:
        logger.warning("Redis cache get error cho key '%s': %s", key, exc)
    return None


def set_cached_json(key: str, data: Any, ttl_seconds: int = 3600) -> bool:
    """Lưu dữ liệu JSON vào cache Redis với TTL; tự động bỏ qua nếu lỗi.

    Đi qua `jsonable_encoder` chứ không `json.dumps` trần: payload thật có
    `datetime`, `Decimal`, `UUID` — `json.dumps` ném lỗi, và vì lỗi bị nuốt vào
    log warning nên cache **im lặng không ghi được dòng nào**, tưởng là có cache
    mà thực tế mọi request vẫn xuống thẳng DB. Encoder này cũng chính là thứ
    FastAPI dùng để trả response, nên dữ liệu đọc từ cache khớp từng kiểu với
    dữ liệu trả thẳng.
    """
    client = get_redis_client()
    if not client:
        return False
    try:
        from fastapi.encoders import jsonable_encoder

        raw = json.dumps(jsonable_encoder(data), ensure_ascii=False)
        client.setex(key, ttl_seconds, raw)
        return True
    except Exception as exc:
        logger.warning("Redis cache set error cho key '%s': %s", key, exc)
    return False


def invalidate_cache(key_or_prefix: str) -> None:
    """Xóa cache theo key hoặc tiền tố."""
    client = get_redis_client()
    if not client:
        return
    try:
        if "*" in key_or_prefix:
            keys = client.keys(key_or_prefix)
            if keys:
                client.delete(*keys)
        else:
            client.delete(key_or_prefix)
    except Exception as exc:
        logger.warning("Redis cache delete error cho '%s': %s", key_or_prefix, exc)


def invalidate_money_caches() -> None:
    """Xoá mọi cache phụ thuộc con số tiền — gọi sau MỌI thao tác đổi tiền.

    Một đồng đổi chỗ là kéo theo ba màn hình: sổ quỹ / công nợ của phân hệ tài
    chính, và cả trạng thái hợp đồng ("Xong, còn nợ" ↔ "Hoàn thành"). Cache mà
    không xoá thì giám đốc bấm duyệt xong, mở màn công nợ vẫn thấy số cũ trong
    hai phút — không khác gì hệ thống nuốt mất phiếu.
    """
    invalidate_cache("bachkhoa:finance:*")
    invalidate_cache("bachkhoa:handover:*")
    invalidate_cache("bachkhoa:contract_workspace:*")
    invalidate_cache("bachkhoa:contracts:*")


@contextmanager
def redis_distributed_lock(
    lock_key: str,
    timeout_seconds: int = 5,
    blocking_timeout: float = 0.5,
    custom_error_msg: Optional[str] = None,
):
    """Khóa phân tán Redis chống race condition / bấm trùng nút.

    - Nếu Redis hoạt động: Lấy khóa lock trong timeout_seconds. Nếu đang bị giữ, báo lỗi 429.
    - Nếu Redis sập: Bỏ qua lỗi lock và cho phép đi tiếp (Graceful degradation).
    """
    client = get_redis_client()
    if not client:
        # Fallback khi Redis không khả dụng
        yield True
        return

    full_key = f"bachkhoa:lock:{lock_key}"
    lock = client.lock(full_key, timeout=timeout_seconds, blocking_timeout=blocking_timeout)
    acquired = False
    try:
        acquired = lock.acquire(blocking=bool(blocking_timeout > 0))
        if not acquired:
            msg = custom_error_msg or "Thao tác đang được xử lý bởi một yêu cầu khác, vui lòng không bấm liên tiếp."
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=msg)
        yield True
    except RedisError as exc:
        logger.warning("Redis lock error cho '%s': %s (fallback proceed)", full_key, exc)
        yield True
    finally:
        if acquired:
            try:
                lock.release()
            except RedisError:
                pass
