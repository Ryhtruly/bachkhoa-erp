"""Reservation, recovery and serialized lifecycle service for contract templates.

Implements the reserve -> upload -> finalize protocol from the revised design:
- Reservation commits a draft/pending row before any storage I/O.
- Storage uses immutable ``IfNoneMatch="*"`` PUT with primary-bucket identity
  reconciliation on conflict.
- Finalize and status transitions run under a global catalog advisory lock.

The service owns commit/rollback at each phase; routes must not commit.
"""

from __future__ import annotations

import io
import re
import uuid
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import func, text
from sqlalchemy.exc import DBAPIError, IntegrityError, OperationalError

from src.db.models import ContractTemplate, Employee, User
from src.services.storage_service import (
    get_contract_template,
    inspect_contract_template_upload,
    upload_contract_template,
)

_ADVISORY_CLASS = 240925
_ADVISORY_KEY = 1
_CODE_PATTERN = re.compile(r"^[A-Z0-9_]{3,50}$")


@dataclass(frozen=True)
class MutationResult:
    template: ContractTemplate
    publication_skipped: bool = False


@dataclass(frozen=True)
class _Reservation:
    id: str
    code: str
    version: int
    storage_key: str
    sha256: str
    size: int
    publish_requested: bool


def _lock_catalog(db) -> None:
    if db.get_bind().dialect.name != "postgresql":
        raise RuntimeError("Template management requires PostgreSQL")
    db.execute(text("SELECT pg_advisory_xact_lock(240925, 1)"))
    db.expire_all()


def _normalize_code(raw_code: str) -> str:
    code = (raw_code or "").strip().upper()
    if not _CODE_PATTERN.fullmatch(code):
        raise HTTPException(status_code=400, detail="Mã mẫu không hợp lệ")
    return code


def _normalize_name(raw_name: str | None, *, allow_blank: bool = False) -> str | None:
    if raw_name is None:
        return None if allow_blank else ""
    name = raw_name.strip()
    if not name and not allow_blank:
        raise HTTPException(status_code=400, detail="Tên mẫu không được để trống")
    return name


def _storage_key_for(code: str, version: int) -> str:
    return f"contract-templates/{code}/v{version}.docx"


def _detail(message: str, reservation: _Reservation | None = None) -> dict:
    detail: dict = {"message": message}
    if reservation is not None:
        detail["template_id"] = reservation.id
        detail["version"] = reservation.version
    return detail


def _mark_failed(db, reservation: _Reservation) -> None:
    """Best-effort failure marker; never masks the original error."""
    try:
        try:
            db.rollback()
        except Exception:
            pass
        _lock_catalog(db)
        row = db.get(ContractTemplate, reservation.id)
        if row is None:
            try:
                db.rollback()
            except Exception:
                pass
            return
        if row.upload_state == "ready":
            try:
                db.rollback()
            except Exception:
                pass
            return
        row.upload_state = "failed"
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass


def _reserve_new(
    db,
    *,
    validated,
    filename: str,
    code: str,
    name: str,
    description: str | None,
    publish_immediately: bool,
    actor_id: str | None,
) -> _Reservation:
    norm_code = _normalize_code(code)
    norm_name = (name or "").strip()
    if not norm_name:
        raise HTTPException(status_code=400, detail="Tên mẫu không được để trống")
    safe_filename = (filename or "").strip() or f"{norm_code}-v1.docx"
    try:
        _lock_catalog(db)
        existing = (
            db.query(ContractTemplate).filter(ContractTemplate.code == norm_code).first()
        )
        if existing is not None:
            db.rollback()
            raise HTTPException(status_code=409, detail="Mã mẫu đã tồn tại")
        key = _storage_key_for(norm_code, 1)
        row = ContractTemplate(
            id=str(uuid.uuid4()),
            code=norm_code,
            version=1,
            name=norm_name,
            description=description,
            template_file_name=safe_filename,
            template_storage_key=key,
            status="draft",
            upload_state="pending",
            content_sha256=validated.sha256,
            content_size=validated.size,
            publish_requested=bool(publish_immediately),
            created_by=actor_id,
        )
        db.add(row)
        db.flush()
        snapshot = _Reservation(
            id=row.id,
            code=norm_code,
            version=1,
            storage_key=key,
            sha256=validated.sha256,
            size=validated.size,
            publish_requested=bool(publish_immediately),
        )
        db.commit()
        return snapshot
    except HTTPException:
        try:
            db.rollback()
        except Exception:
            pass
        raise
    except IntegrityError as exc:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=409, detail="Mã mẫu đã tồn tại") from exc
    except RuntimeError:
        try:
            db.rollback()
        except Exception:
            pass
        raise
    except (OperationalError, DBAPIError) as exc:
        try:
            db.rollback()
        except Exception:
            pass
        # Uncertain commit: the reservation may actually have committed.
        # Refresh best-effort so the caller can retry the reserved row.
        try:
            _lock_catalog(db)
            hit = (
                db.query(ContractTemplate)
                .filter(
                    ContractTemplate.code == norm_code,
                    ContractTemplate.content_sha256 == validated.sha256,
                    ContractTemplate.content_size == validated.size,
                )
                .order_by(ContractTemplate.version.desc())
                .first()
            )
            if hit is not None:
                snapshot = _Reservation(
                    id=hit.id,
                    code=hit.code,
                    version=hit.version,
                    storage_key=hit.template_storage_key or "",
                    sha256=validated.sha256,
                    size=validated.size,
                    publish_requested=bool(hit.publish_requested),
                )
                try:
                    db.rollback()
                except Exception:
                    pass
                raise HTTPException(
                    status_code=503, detail=_detail("Lỗi kết nối CSDL tạm thời", snapshot)
                ) from exc
            try:
                db.rollback()
            except Exception:
                pass
        except HTTPException:
            raise
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass
        raise HTTPException(
            status_code=503, detail="Lỗi kết nối CSDL tạm thời"
        ) from exc
    except Exception as exc:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(
            status_code=503, detail="Lỗi kết nối CSDL tạm thời"
        ) from exc


def _reserve_upgrade(
    db,
    *,
    parent_id: str,
    validated,
    filename: str,
    name: str | None,
    description: str | None,
    publish_immediately: bool,
    actor_id: str | None,
) -> _Reservation:
    safe_filename = (filename or "").strip()
    try:
        _lock_catalog(db)
        parent = db.get(ContractTemplate, parent_id)
        if parent is None:
            db.rollback()
            raise HTTPException(status_code=404, detail="Không tìm thấy mẫu")
        code = parent.code
        max_version = (
            db.query(func.max(ContractTemplate.version))
            .filter(ContractTemplate.code == code)
            .scalar()
        )
        next_version = int(max_version or 0) + 1
        if name is not None and name.strip():
            norm_name = name.strip()
        else:
            norm_name = (parent.name or "").strip()
        if not norm_name:
            db.rollback()
            raise HTTPException(status_code=400, detail="Tên mẫu không được để trống")
        norm_description = description if description is not None else parent.description
        if not safe_filename:
            safe_filename = (
                parent.template_file_name or f"{code}-v{next_version}.docx"
            )
        key = _storage_key_for(code, next_version)
        row = ContractTemplate(
            id=str(uuid.uuid4()),
            code=code,
            version=next_version,
            name=norm_name,
            description=norm_description,
            template_file_name=safe_filename,
            template_storage_key=key,
            status="draft",
            upload_state="pending",
            content_sha256=validated.sha256,
            content_size=validated.size,
            publish_requested=bool(publish_immediately),
            created_by=actor_id,
        )
        db.add(row)
        db.flush()
        snapshot = _Reservation(
            id=row.id,
            code=code,
            version=next_version,
            storage_key=key,
            sha256=validated.sha256,
            size=validated.size,
            publish_requested=bool(publish_immediately),
        )
        db.commit()
        return snapshot
    except HTTPException:
        try:
            db.rollback()
        except Exception:
            pass
        raise
    except IntegrityError as exc:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(
            status_code=409, detail="Phiên bản đã tồn tại, thử lại"
        ) from exc
    except RuntimeError:
        try:
            db.rollback()
        except Exception:
            pass
        raise
    except (OperationalError, DBAPIError) as exc:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(
            status_code=503, detail="Lỗi kết nối CSDL tạm thời"
        ) from exc
    except Exception as exc:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(
            status_code=503, detail="Lỗi kết nối CSDL tạm thời"
        ) from exc


def _complete_upload(snapshot: _Reservation, content: bytes, db) -> None:
    try:
        upload_contract_template(io.BytesIO(content), snapshot.storage_key)
        return
    except FileExistsError as exc:
        try:
            verdict = inspect_contract_template_upload(
                snapshot.storage_key, snapshot.sha256, snapshot.size
            )
        except FileExistsError as inner:
            _mark_failed(db, snapshot)
            raise HTTPException(
                status_code=503, detail=_detail("Kho lưu trữ tạm thời không khả dụng", snapshot)
            ) from inner
        except Exception as inner:
            _mark_failed(db, snapshot)
            raise HTTPException(
                status_code=503, detail=_detail("Kho lưu trữ tạm thời không khả dụng", snapshot)
            ) from inner
        if verdict == "matching":
            return
        _mark_failed(db, snapshot)
        if verdict == "conflict":
            raise HTTPException(
                status_code=409, detail=_detail("Tệp tại khóa lưu trữ không khớp", snapshot)
            ) from exc
        raise HTTPException(
            status_code=503, detail=_detail("Kho lưu trữ tạm thời không khả dụng", snapshot)
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        _mark_failed(db, snapshot)
        raise HTTPException(
            status_code=503, detail=_detail("Kho lưu trữ tạm thời không khả dụng", snapshot)
        ) from exc


def _finalize(db, snapshot: _Reservation) -> tuple[ContractTemplate, bool]:
    try:
        _lock_catalog(db)
        row = db.get(ContractTemplate, snapshot.id)
        if row is None:
            db.rollback()
            raise HTTPException(status_code=404, detail="Không tìm thấy mẫu")
        if row.upload_state == "ready":
            db.rollback()
            fresh = db.get(ContractTemplate, snapshot.id)
            if fresh is None:
                raise HTTPException(status_code=404, detail="Không tìm thấy mẫu")
            return fresh, False
        row.upload_state = "ready"
        skipped = False
        if snapshot.publish_requested:
            higher = (
                db.query(ContractTemplate)
                .filter(
                    ContractTemplate.code == snapshot.code,
                    ContractTemplate.status == "published",
                    ContractTemplate.version > snapshot.version,
                )
                .first()
            )
            if higher is not None:
                skipped = True
            else:
                current = (
                    db.query(ContractTemplate)
                    .filter(
                        ContractTemplate.code == snapshot.code,
                        ContractTemplate.status == "published",
                        ContractTemplate.id != snapshot.id,
                    )
                    .first()
                )
                if current is not None:
                    current.status = "archived"
                    db.flush()
                row.status = "published"
        db.commit()
        refreshed = db.get(ContractTemplate, snapshot.id)
        if refreshed is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy mẫu")
        # Refresh for response only after storage is done.
        try:
            db.refresh(refreshed)
        except Exception:
            pass
        return refreshed, skipped
    except HTTPException:
        try:
            db.rollback()
        except Exception:
            pass
        raise
    except IntegrityError as exc:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(
            status_code=503, detail=_detail("Không thể hoàn tất phiên bản", snapshot)
        ) from exc
    except (OperationalError, DBAPIError) as exc:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(
            status_code=503, detail=_detail("Không thể hoàn tất phiên bản", snapshot)
        ) from exc
    except RuntimeError:
        try:
            db.rollback()
        except Exception:
            pass
        raise
    except Exception as exc:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(
            status_code=503, detail=_detail("Không thể hoàn tất phiên bản", snapshot)
        ) from exc


def _version_dto(row: ContractTemplate, created_by_name: str | None = None) -> dict:
    can_retry = (
        row.upload_state in ("pending", "failed")
        and row.content_sha256 is not None
        and row.content_size is not None
    )
    return {
        "id": row.id,
        "code": row.code,
        "version": row.version,
        "name": row.name,
        "description": row.description,
        "template_file_name": row.template_file_name,
        "status": row.status,
        "upload_state": row.upload_state,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "created_by_name": created_by_name,
        "can_retry": can_retry,
    }


class ContractTemplateService:
    """Serialized reservation/recovery service for contract templates."""

    @staticmethod
    def upload_new_template(
        db,
        validated,
        filename: str,
        code: str,
        name: str,
        description: str | None = None,
        publish_immediately: bool = True,
        actor_id: str | None = None,
    ) -> MutationResult:
        snapshot = _reserve_new(
            db,
            validated=validated,
            filename=filename,
            code=code,
            name=name,
            description=description,
            publish_immediately=publish_immediately,
            actor_id=actor_id,
        )
        # No DB access between reservation commit and storage.
        try:
            _complete_upload(snapshot, validated.content, db)
        except HTTPException:
            raise
        template, skipped = _finalize(db, snapshot)
        return MutationResult(template=template, publication_skipped=skipped)

    @staticmethod
    def upgrade_version(
        db,
        template_id: str,
        validated,
        filename: str,
        name: str | None = None,
        description: str | None = None,
        publish_immediately: bool = True,
        actor_id: str | None = None,
    ) -> MutationResult:
        snapshot = _reserve_upgrade(
            db,
            parent_id=template_id,
            validated=validated,
            filename=filename,
            name=name,
            description=description,
            publish_immediately=publish_immediately,
            actor_id=actor_id,
        )
        try:
            _complete_upload(snapshot, validated.content, db)
        except HTTPException:
            raise
        template, skipped = _finalize(db, snapshot)
        return MutationResult(template=template, publication_skipped=skipped)

    @staticmethod
    def retry_upload(db, template_id: str, validated) -> MutationResult:
        try:
            _lock_catalog(db)
            row = db.get(ContractTemplate, template_id)
            if row is None:
                db.rollback()
                raise HTTPException(status_code=404, detail="Không tìm thấy mẫu")
            if row.content_sha256 is None or row.content_size is None:
                db.rollback()
                raise HTTPException(
                    status_code=409,
                    detail="Phiên bản cũ không thể thử lại cùng tệp",
                )
            if (
                row.content_sha256 != validated.sha256
                or row.content_size != validated.size
            ):
                db.rollback()
                raise HTTPException(
                    status_code=409,
                    detail="Tệp không khớp phiên bản đã đặt trước",
                )
            if row.upload_state == "ready":
                db.rollback()
                fresh = db.get(ContractTemplate, template_id)
                if fresh is None:
                    raise HTTPException(status_code=404, detail="Không tìm thấy mẫu")
                return MutationResult(template=fresh, publication_skipped=False)
            snapshot = _Reservation(
                id=row.id,
                code=row.code,
                version=row.version,
                storage_key=row.template_storage_key or "",
                sha256=row.content_sha256,
                size=row.content_size,
                publish_requested=bool(row.publish_requested),
            )
            original_key = snapshot.storage_key
            if not original_key:
                db.rollback()
                raise HTTPException(status_code=409, detail="Phiên bản thiếu khóa lưu trữ")
            # End the read transaction before storage I/O.
            db.rollback()
        except HTTPException:
            try:
                db.rollback()
            except Exception:
                pass
            raise
        except RuntimeError:
            try:
                db.rollback()
            except Exception:
                pass
            raise
        except (OperationalError, DBAPIError) as exc:
            try:
                db.rollback()
            except Exception:
                pass
            raise HTTPException(
                status_code=503, detail="Lỗi kết nối CSDL tạm thời"
            ) from exc
        # Storage phase uses only the immutable snapshot.
        try:
            _complete_upload(snapshot, validated.content, db)
        except HTTPException:
            raise
        template, skipped = _finalize(db, snapshot)
        return MutationResult(template=template, publication_skipped=skipped)

    @staticmethod
    def update_status(db, template_id: str, target_status: str) -> MutationResult:
        if target_status not in ("published", "archived"):
            raise HTTPException(status_code=400, detail="Trạng thái không hợp lệ")
        try:
            _lock_catalog(db)
            row = db.get(ContractTemplate, template_id)
            if row is None:
                db.rollback()
                raise HTTPException(status_code=404, detail="Không tìm thấy mẫu")
            if row.upload_state != "ready" or not (row.template_storage_key or "").strip():
                db.rollback()
                raise HTTPException(
                    status_code=409, detail="Phiên bản chưa sẵn sàng để đổi trạng thái"
                )
            if row.status == target_status:
                db.rollback()
                fresh = db.get(ContractTemplate, template_id)
                if fresh is None:
                    raise HTTPException(status_code=404, detail="Không tìm thấy mẫu")
                return MutationResult(template=fresh, publication_skipped=False)
            if target_status == "published":
                current = (
                    db.query(ContractTemplate)
                    .filter(
                        ContractTemplate.code == row.code,
                        ContractTemplate.status == "published",
                        ContractTemplate.id != row.id,
                    )
                    .first()
                )
                if current is not None:
                    current.status = "archived"
                    db.flush()
                row.status = "published"
                db.commit()
                refreshed = db.get(ContractTemplate, template_id)
                if refreshed is None:
                    raise HTTPException(status_code=404, detail="Không tìm thấy mẫu")
                try:
                    db.refresh(refreshed)
                except Exception:
                    pass
                return MutationResult(template=refreshed, publication_skipped=False)
            # target archived
            if row.status == "published":
                total_published = (
                    db.query(func.count(ContractTemplate.id))
                    .filter(ContractTemplate.status == "published")
                    .scalar()
                )
                if int(total_published or 0) <= 1:
                    db.rollback()
                    raise HTTPException(
                        status_code=400,
                        detail="Không thể lưu trữ mẫu đã ban hành cuối cùng",
                    )
            row.status = "archived"
            db.commit()
            refreshed = db.get(ContractTemplate, template_id)
            if refreshed is None:
                raise HTTPException(status_code=404, detail="Không tìm thấy mẫu")
            try:
                db.refresh(refreshed)
            except Exception:
                pass
            return MutationResult(template=refreshed, publication_skipped=False)
        except HTTPException:
            try:
                db.rollback()
            except Exception:
                pass
            raise
        except IntegrityError as exc:
            try:
                db.rollback()
            except Exception:
                pass
            raise HTTPException(
                status_code=409, detail="Xung đột trạng thái ban hành"
            ) from exc
        except RuntimeError:
            try:
                db.rollback()
            except Exception:
                pass
            raise
        except (OperationalError, DBAPIError) as exc:
            try:
                db.rollback()
            except Exception:
                pass
            raise HTTPException(
                status_code=503, detail="Lỗi kết nối CSDL tạm thời"
            ) from exc
        except Exception as exc:
            try:
                db.rollback()
            except Exception:
                pass
            raise HTTPException(
                status_code=503, detail="Lỗi kết nối CSDL tạm thời"
            ) from exc

    @staticmethod
    def list_templates(db, status: str = "all", q: str | None = None) -> list:
        allowed = ("all", "draft", "published", "archived")
        if status not in allowed:
            raise HTTPException(status_code=400, detail="Trạng thái lọc không hợp lệ")
        query = db.query(ContractTemplate)
        if q:
            needle = f"%{q.strip()}%"
            query = query.filter(
                (ContractTemplate.code.ilike(needle)) | (ContractTemplate.name.ilike(needle))
            )
        if status != "all":
            query = query.filter(ContractTemplate.status == status)
        matched = query.all()
        codes = sorted({row.code for row in matched})
        if not codes:
            return []
        all_versions = (
            db.query(ContractTemplate)
            .filter(ContractTemplate.code.in_(codes))
            .order_by(ContractTemplate.code.asc(), ContractTemplate.version.desc())
            .all()
        )
        versions_by_code: dict[str, list[ContractTemplate]] = {}
        for version in all_versions:
            versions_by_code.setdefault(version.code, []).append(version)
        creator_names: dict[str, str | None] = {}
        try:
            ids = sorted({v.created_by for v in all_versions if v.created_by})
            if ids:
                user_rows = db.query(User.id, User.username).filter(User.id.in_(ids)).all()
                employee_rows = (
                    db.query(Employee.user_id, Employee.full_name)
                    .filter(Employee.user_id.in_(ids))
                    .all()
                )
                username_by_id = {row.id: row.username for row in user_rows}
                full_name_by_id = {row.user_id: row.full_name for row in employee_rows}
                for v in all_versions:
                    if not v.created_by:
                        creator_names[v.id] = None
                        continue
                    creator_names[v.id] = full_name_by_id.get(v.created_by) or username_by_id.get(v.created_by)
        except Exception:
            creator_names = {}
        groups: list = []
        for code in codes:
            versions = versions_by_code.get(code, [])
            if not versions:
                continue
            latest_version = max(v.version for v in versions)
            active = next((v for v in versions if v.status == "published"), None)
            display = next((v for v in versions if v.version == latest_version), versions[0])
            groups.append(
                {
                    "code": code,
                    "name": display.name,
                    "latest_version": latest_version,
                    "active_template": (
                        _version_dto(active, creator_names.get(active.id)) if active else None
                    ),
                    "display_template": _version_dto(
                        display, creator_names.get(display.id)
                    ),
                    "versions": [
                        _version_dto(v, creator_names.get(v.id)) for v in versions
                    ],
                }
            )
        return groups

    @staticmethod
    def get_template_bytes(db, template_id: str) -> tuple[bytes, str]:
        row = db.query(ContractTemplate).filter(ContractTemplate.id == template_id).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy mẫu")
        if row.upload_state != "ready" or not (row.template_storage_key or "").strip():
            raise HTTPException(status_code=409, detail="Phiên bản chưa sẵn sàng để tải")
        try:
            content = get_contract_template(row.template_storage_key)
        except Exception as exc:
            raise HTTPException(
                status_code=503, detail="Kho lưu trữ tạm thời không khả dụng"
            ) from exc
        filename = (row.template_file_name or "").strip() or f"{row.code}-v{row.version}.docx"
        return bytes(content), filename

    @staticmethod
    def get_placeholder_catalog() -> list:
        def _item(key: str, label: str, example: str) -> dict:
            return {"placeholder": "{{" + key + "}}", "label": label, "example": example}

        return [
            {
                "category": "Khách hàng",
                "items": [
                    _item("customer_name", "Tên khách hàng", "Nguyễn Văn A"),
                    _item("phone", "Số điện thoại", "0901234567"),
                    _item("customer_phone", "Điện thoại khách hàng", "0901234567"),
                    _item("address", "Địa chỉ dịch vụ", "123 Đường ABC, TP.HCM"),
                    _item("customer_address", "Địa chỉ khách hàng", "456 Đường XYZ, TP.HCM"),
                    _item("customer_email", "Email khách hàng", "khach@example.com"),
                ],
            },
            {
                "category": "Hợp đồng",
                "items": [
                    _item("contract_id", "Mã hợp đồng", "001/BK-2026"),
                    _item("service_type", "Loại dịch vụ", "Đo đạc"),
                    _item("date_signed", "Ngày ký", "14 tháng 08 năm 2026"),
                    _item("due_date", "Ngày đến hạn", "30 tháng 08 năm 2026"),
                    _item("sales_source", "Nguồn sale", "Giới thiệu"),
                ],
            },
            {
                "category": "Giá trị",
                "items": [
                    _item("contract_value", "Giá trị hợp đồng", "20.000.000"),
                    _item("total_amount", "Tổng tiền", "20.000.000"),
                ],
            },
        ]
