import fnmatch
import json
import logging
import os
import threading
import time
import urllib.parse
from contextlib import contextmanager
from typing import Any, Optional

import redis
from redis.exceptions import RedisError
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")

_client: Optional[redis.Redis] = None


def _redact_redis_url(url: str) -> str:
    """Mask password or credentials inside Redis URL before logging."""
    if not url:
        return ""
    try:
        parsed = urllib.parse.urlsplit(url)
        if parsed.password:
            netloc = parsed.netloc.replace(f":{parsed.password}@", ":***@")
            return urllib.parse.urlunsplit(parsed._replace(netloc=netloc))
    except Exception:
        pass
    return url


_last_connect_fail: float = 0.0
_CONNECT_RETRY_INTERVAL: float = 30.0


def get_redis_client() -> Optional[redis.Redis]:
    """Trả về Redis client singleton; trả về None nếu không kết nối được."""
    global _client, _last_connect_fail
    if _client is not None:
        return _client

    now = time.time()
    if now - _last_connect_fail < _CONNECT_RETRY_INTERVAL:
        return None

    try:
        candidate = redis.Redis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=0.5,
            socket_timeout=1.0,
            health_check_interval=30,
        )
        # Ping nhẹ để kiểm tra liveness
        candidate.ping()
        _client = candidate
        return _client
    except Exception as exc:
        _last_connect_fail = now
        redacted_url = _redact_redis_url(REDIS_URL)
        err_msg = str(exc)
        try:
            parsed = urllib.parse.urlsplit(REDIS_URL)
            if parsed.password:
                err_msg = err_msg.replace(parsed.password, "***")
        except Exception:
            pass
        logger.warning("Không kết nối được tới Redis (%s): %s", redacted_url, err_msg)
        _client = None
        return None

_fallback_store: dict[str, tuple[float, str]] = {}
_fallback_lock = threading.Lock()


def _fallback_get(key: str) -> Optional[Any]:
    with _fallback_lock:
        item = _fallback_store.get(key)
        if not item:
            return None
        expires_at, raw = item
        if time.time() > expires_at:
            _fallback_store.pop(key, None)
            return None
        try:
            return json.loads(raw)
        except Exception:
            return None


def _fallback_set(key: str, data: Any, ttl_seconds: int = 3600) -> bool:
    try:
        from fastapi.encoders import jsonable_encoder

        raw = json.dumps(jsonable_encoder(data), ensure_ascii=False)
        with _fallback_lock:
            _fallback_store[key] = (time.time() + ttl_seconds, raw)
        return True
    except Exception as exc:
        logger.warning("Fallback cache set error for key '%s': %s", key, exc)
        return False


def _fallback_invalidate(key_or_prefix: str) -> None:
    with _fallback_lock:
        if "*" in key_or_prefix:
            keys_to_delete = [k for k in _fallback_store if fnmatch.fnmatch(k, key_or_prefix)]
            for k in keys_to_delete:
                _fallback_store.pop(k, None)
        else:
            _fallback_store.pop(key_or_prefix, None)


def get_cached_json(key: str) -> Optional[Any]:
    """Lấy dữ liệu JSON từ cache Redis (hoặc in-memory fallback nếu Redis offline)."""
    client = get_redis_client()
    if not client:
        return _fallback_get(key)
    try:
        raw = client.get(key)
        if raw:
            return json.loads(raw)
    except Exception as exc:
        logger.warning("Redis cache get error cho key '%s': %s", key, exc)
        return _fallback_get(key)
    return None


def set_cached_json(key: str, data: Any, ttl_seconds: int = 3600) -> bool:
    """Lưu dữ liệu JSON vào cache Redis với TTL; fallback RAM nếu Redis offline."""
    client = get_redis_client()
    if not client:
        return _fallback_set(key, data, ttl_seconds)
    try:
        from fastapi.encoders import jsonable_encoder

        raw = json.dumps(jsonable_encoder(data), ensure_ascii=False)
        client.setex(key, ttl_seconds, raw)
        return True
    except Exception as exc:
        logger.warning("Redis cache set error cho key '%s': %s", key, exc)
        return _fallback_set(key, data, ttl_seconds)


def consume_rate_limit(key: str, *, limit: int, window_seconds: int) -> tuple[bool, int]:
    """Atomically consume one request from a short-lived Redis rate limit.

    The in-memory fallback is intentionally process-local and is used only when
    Redis is unavailable for non-financial public endpoints. Financial locks do
    not use this fallback.
    """
    client = get_redis_client()
    if client:
        try:
            count = int(client.incr(key))
            if count == 1:
                client.expire(key, window_seconds)
            return count <= limit, count
        except RedisError as exc:
            logger.warning("Redis rate-limit error cho key '%s': %s", key, exc)

    with _fallback_lock:
        now = time.time()
        item = _fallback_store.get(key)
        if item and now <= item[0]:
            expires_at, raw = item
            count = int(raw) + 1
        else:
            expires_at = now + window_seconds
            count = 1
        _fallback_store[key] = (expires_at, str(count))
    return count <= limit, count


def invalidate_cache(key_or_prefix: str) -> None:
    """Xóa cache theo key hoặc tiền tố trên cả Redis và in-memory fallback."""
    _fallback_invalidate(key_or_prefix)
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
    invalidate_cache("bachkhoa:dashboard:*")


@contextmanager
def redis_distributed_lock(
    lock_key: str,
    timeout_seconds: int = 5,
    blocking_timeout: float = 0.5,
    custom_error_msg: Optional[str] = None,
):
    """Khóa phân tán Redis chống race condition / bấm trùng nút.

    - Nếu Redis hoạt động: Lấy khóa lock trong timeout_seconds. Nếu đang bị giữ, báo lỗi 429.
    - Nếu Redis sập: Từ chối thao tác để bảo toàn tính nguyên tử của nghiệp vụ.
    """
    client = get_redis_client()
    if not client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Dịch vụ khóa giao dịch tạm thời không khả dụng. Vui lòng thử lại.",
        )

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
        logger.error("Redis lock error cho '%s': thao tác bị từ chối: %s", full_key, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Không thể xác nhận khóa giao dịch. Vui lòng thử lại.",
        ) from exc
    finally:
        if acquired:
            try:
                lock.release()
            except RedisError:
                pass
