import json
import logging
import os
from datetime import datetime, timezone
from typing import Iterator

import redis
from redis.exceptions import RedisError


logger = logging.getLogger(__name__)

TIMELINE_CHANNEL = "bachkhoa:events:contract-timeline:v1"
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")


def _redis_client() -> redis.Redis:
    return redis.Redis.from_url(
        REDIS_URL,
        decode_responses=True,
        socket_connect_timeout=1.0,
        socket_timeout=20.0,
        health_check_interval=15,
    )


def publish_timeline_change(source: str, *, entity_id: str | None = None) -> None:
    """Publish an invalidation only; protected Timeline data never enters Redis."""
    from src.core.redis_utils import invalidate_cache

    payload = json.dumps(
        {
            "source": source,
            "entity_id": entity_id,
            "changed_at": datetime.now(timezone.utc).isoformat(),
        },
        ensure_ascii=False,
    )
    try:
        _redis_client().publish(TIMELINE_CHANNEL, payload)
        # Xóa cache notification và dashboard để khi client nhận tín hiệu realtime sẽ lấy dữ liệu mới nhất
        invalidate_cache("bachkhoa:notifications:summary:*")
        invalidate_cache("bachkhoa:dashboard:*")
    except RedisError as exc:
        # A failed notification must not roll back the business transaction.
        logger.warning("Timeline realtime publish failed: %s", exc)


def _redis_event_stream(event_name: str) -> Iterator[str]:
    """Yield authenticated SSE invalidations backed by Redis Pub/Sub."""
    client = _redis_client()
    pubsub = client.pubsub(ignore_subscribe_messages=True)
    try:
        pubsub.subscribe(TIMELINE_CHANNEL)
        yield "event: connected\ndata: {}\n\n"
        while True:
            message = pubsub.get_message(timeout=15.0)
            if message and message.get("type") == "message":
                # Consumers re-read their authorized view from the database;
                # the Redis payload is only an invalidation signal.
                yield f"event: {event_name}\ndata: {{}}\n\n"
            else:
                yield ": keep-alive\n\n"
    except (RedisError, GeneratorExit):
        return
    finally:
        try:
            pubsub.close()
        except RedisError:
            pass


def timeline_event_stream() -> Iterator[str]:
    """Authenticated realtime invalidations for the director Timeline."""
    yield from _redis_event_stream("timeline-change")


def notification_event_stream() -> Iterator[str]:
    """Authenticated realtime invalidations for notification summaries."""
    yield from _redis_event_stream("notifications-changed")

