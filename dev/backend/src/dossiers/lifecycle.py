from fastapi import HTTPException


TERMINAL_DOSSIER_STATUSES = frozenset({"Hoàn thành", "Nộp thành công"})


def assert_dossier_mutable(status: str | None) -> None:
    """Reject ordinary edits after a dossier reaches a terminal status."""
    if status in TERMINAL_DOSSIER_STATUSES:
        raise HTTPException(
            status_code=409,
            detail="Hồ sơ đã hoàn tất và không thể chỉnh sửa.",
        )
