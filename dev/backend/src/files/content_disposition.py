"""HTTP Content-Disposition and filename sanitation utilities according to RFC 6266 / RFC 5987."""

from __future__ import annotations

import re
import unicodedata
from urllib.parse import quote


def to_ascii_filename(filename: str, fallback: str = "download") -> str:
    """Convert Vietnamese or Unicode filename to a clean ASCII-safe fallback filename."""
    if not filename:
        return fallback
    # Replace Vietnamese D with stroke before NFKD decomposition
    text = str(filename).replace("đ", "d").replace("Đ", "D")
    normalized = unicodedata.normalize("NFKD", text)
    ascii_only = normalized.encode("ASCII", "ignore").decode("ASCII")
    safe_name = re.sub(r"[^A-Za-z0-9_.-]", "_", ascii_only)
    safe_name = re.sub(r"_+", "_", safe_name).strip("._")
    return safe_name or fallback


def sanitize_filename(filename: str | None, fallback: str = "file") -> str:
    """Clean filename for safe HTTP transmission and header display."""
    if not filename:
        return fallback
    clean = str(filename).replace("\\", "/").rsplit("/", 1)[-1]
    clean = re.sub(r"[\x00-\x1f\x7f]", "", clean).strip()
    return clean or fallback


def build_content_disposition_header(
    filename: str,
    *,
    disposition: str = "inline",
    fallback: str = "download",
) -> str:
    """Build standard RFC 6266 / RFC 5987 Content-Disposition header with ASCII fallback and UTF-8 filename*."""
    clean_name = sanitize_filename(filename, fallback)
    ascii_name = to_ascii_filename(clean_name, fallback)
    encoded_utf8 = quote(clean_name)
    return f'{disposition}; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded_utf8}'
