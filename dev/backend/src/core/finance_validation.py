"""Shared validation for values that become accounting obligations."""

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re

from fastapi import HTTPException


_MONEY_PATTERN = re.compile(r"^\d+(?:[.,]\d+)*$")
_CURRENCY_SUFFIX_PATTERN = re.compile(r"(?:₫|đ|vnd|vnđ)$", re.IGNORECASE)


def _invalid_money(field_name: str, reason: str) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail=f"{field_name} phải là số tiền hợp lệ và lớn hơn 0 ({reason}).",
    )


def parse_issued_money(value: object, field_name: str = "Giá trị hợp đồng") -> Decimal:
    """Parse a user-entered amount before it becomes an issued contract value.

    Vietnamese thousands separators (``18.000.000``) and common international
    forms (``18,000,000`` / ``1.234,56``) are accepted.  The returned value is
    always a two-decimal ``Decimal``; invalid, zero and negative values raise a
    client error before any accounting side effect is created.
    """
    if value is None:
        raise _invalid_money(field_name, "không được để trống")

    raw = str(value).strip().replace("\u00a0", "")
    raw = _CURRENCY_SUFFIX_PATTERN.sub("", raw).strip()
    raw = raw.replace(" ", "")
    if raw.startswith("+"):
        raw = raw[1:]

    if not raw or raw.startswith("-") or not _MONEY_PATTERN.fullmatch(raw):
        raise _invalid_money(field_name, "không được âm hoặc chứa ký tự không hợp lệ")

    if "." in raw and "," in raw:
        decimal_separator = "," if raw.rfind(",") > raw.rfind(".") else "."
        thousands_separator = "." if decimal_separator == "," else ","
        integer_part, fraction_part = raw.rsplit(decimal_separator, 1)
        if len(fraction_part) > 2:
            raise _invalid_money(field_name, "phần thập phân tối đa 2 chữ số")
        integer_part = integer_part.replace(thousands_separator, "")
        normalized = f"{integer_part}.{fraction_part}"
    elif raw.count(".") > 1:
        normalized = raw.replace(".", "")
    elif raw.count(",") > 1:
        normalized = raw.replace(",", "")
    elif "." in raw or "," in raw:
        separator = "." if "." in raw else ","
        integer_part, fraction_part = raw.split(separator, 1)
        # A three-digit suffix is conventionally a thousands group for VND.
        normalized = (
            f"{integer_part}{fraction_part}"
            if len(fraction_part) == 3
            else f"{integer_part}.{fraction_part}"
        )
    else:
        normalized = raw

    try:
        amount = Decimal(normalized).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        raise _invalid_money(field_name, "không thể chuyển đổi") from None

    if amount <= 0:
        raise _invalid_money(field_name, "phải lớn hơn 0")
    return amount
