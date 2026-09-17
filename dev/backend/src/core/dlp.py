import re

# Comprehensive DLP / Data Redaction for AI outbound payloads
# Neutralizes credentials, API keys, CCCD, bank cards, phone numbers, and database connection strings.

_CARD_REGEX = re.compile(r'\b(?:\d[ -]*?){13,19}\b')
_KEY_VALUE_SECRET_REGEX = re.compile(
    r'(?i)(password|passwd|mat_khau|mật khẩu|token|secret|api[_-]?key|private[_-]?key)\s*[:=]\s*[^\s,;]+'
)
_API_KEY_PATTERNS = re.compile(
    r'\b(?:sk-[a-zA-Z0-9_-]{20,}|AIza[0-9A-Za-z-_]{35}|ghp_[a-zA-Z0-9]{36}|xox[baprs]-[a-zA-Z0-9-]+)\b'
)
_BEARER_TOKEN_REGEX = re.compile(r'(?i)\bBearer\s+[a-zA-Z0-9_\-\.]{20,}\b')
_DB_URL_CREDS_REGEX = re.compile(r'(?i)(postgres(?:ql)?|mysql|redis)://([^:]+):([^@]+)@')
_CCCD_REGEX = re.compile(r'(?i)\b(?:cccd|cmnd|căn cước|định danh)?\s*(?:[:=]\s*)?(\d{12})\b')
_PHONE_REGEX = re.compile(r'\b(?:0|\+84)(?:3[2-9]|5[689]|7[06-9]|8[1-9]|9[0-9])\d{7}\b')


def redact_sensitive_content(text: str) -> str:
    """Sanitize sensitive data (PII, credentials, keys, financial data) before external LLM calls."""
    if not text or not isinstance(text, str):
        return text or ""

    # 1. Mask connection string credentials
    result = _DB_URL_CREDS_REGEX.sub(r'\1://[REDACTED]:[REDACTED]@', text)

    # 2. Mask known provider API keys
    result = _API_KEY_PATTERNS.sub('[REDACTED_API_KEY]', result)
    result = _BEARER_TOKEN_REGEX.sub('Bearer [REDACTED_TOKEN]', result)

    # 3. Mask key-value secrets
    result = _KEY_VALUE_SECRET_REGEX.sub(r'\1: [REDACTED]', result)

    # 4. Mask credit / debit cards
    result = _CARD_REGEX.sub('[REDACTED_CARD]', result)

    # 5. Mask Vietnamese CCCD (12 digits) when prefixed or matching 12-digit pattern
    def _mask_cccd(match):
        full = match.group(0)
        digits = match.group(1)
        return full.replace(digits, f"{digits[:3]}******{digits[-3:]}")

    result = _CCCD_REGEX.sub(_mask_cccd, result)

    # 6. Mask phone numbers
    result = _PHONE_REGEX.sub(lambda m: f"{m.group(0)[:4]}***{m.group(0)[-3:]}", result)

    return result
