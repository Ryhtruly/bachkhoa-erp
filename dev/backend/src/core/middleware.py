import time
import uuid
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request, Response
from src.core.logging_config import request_id_ctx

logger = logging.getLogger(__name__)


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        token = request_id_ctx.set(req_id)

        start_time = time.time()
        try:
            response = await call_next(request)
            duration_ms = round((time.time() - start_time) * 1000, 2)
            logger.info("%s %s -> %s (%s ms)", request.method, request.url.path, response.status_code, duration_ms)
            response.headers["X-Request-ID"] = req_id
            return response
        except Exception as exc:
            duration_ms = round((time.time() - start_time) * 1000, 2)
            logger.error("%s %s -> EXCEPTION: %s (%s ms)", request.method, request.url.path, exc, duration_ms)
            raise
        finally:
            request_id_ctx.reset(token)
