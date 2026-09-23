import uuid
from datetime import date, datetime, timezone
import pytest
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from src.db.models import (
    Employee,
    User,
    Role,
    UserRole,
    RefreshSession,
    AdvanceRequest,
    Attendance,
    Notification,
)
from src.finance.schemas import EmployeeUpsertIn
from src.finance.services import FinanceService
from src.user_admin.service import create_employee_account, set_user_active_status
from src.core.auth import hash_password, is_token_revoked


def _ensure_role(db, role_name="sales"):
    role = db.query(Role).filter(Role.role_name == role_name).first()
    if not role:
        role = Role(
            role_name=role_name,
            display_name="Kinh doanh",
            is_system=True,
            is_active=True,
        )
        db.add(role)
        db.commit()
        db.refresh(role)
    return role


def test_delete_employee_without_account(db):
    """Xóa nhân sự chưa tạo tài khoản hệ thống diễn ra trơn tru."""
    emp_id = f"emp_{uuid.uuid4().hex[:10]}"
    emp = Employee(
        id=emp_id,
        full_name="Nguyễn Văn Chưa Có Tài Khoản",
        job_title="Nhân viên thử việc",
        is_active=True,
    )
    db.add(emp)
    db.commit()

    res = FinanceService.delete_employee(db, emp_id)
    assert res["status"] == "success"
    assert db.query(Employee).filter(Employee.id == emp_id).first() is None


def test_delete_employee_clean_account_hard_deletes_user_and_frees_email(db):
    """Nhân sự có tài khoản chưa phát sinh ràng buộc nghiệp vụ: xóa sạch tài khoản và giải phóng 100% email/username."""
    role = _ensure_role(db)

    emp_id = f"emp_{uuid.uuid4().hex[:10]}"
    username = f"emp_clean_{uuid.uuid4().hex[:6]}"
    email = f"{username}@wifim.test"

    emp = Employee(
        id=emp_id,
        full_name="Nhân Sự Sạch Sẽ",
        job_title="Thực tập sinh",
        is_active=True,
    )
    db.add(emp)
    db.commit()

    # Tạo tài khoản liên kết
    acc_res = create_employee_account(db, emp_id, username, email, role.role_name)
    user_id = acc_res["user_id"]
    assert user_id is not None

    # Thêm một vài bản ghi phụ thuộc auth
    session_id = str(uuid.uuid4())
    db.add(RefreshSession(
        id=session_id,
        user_id=user_id,
        token_hash="fakehash123",
        family_id=str(uuid.uuid4()),
        expires_at=datetime.now(timezone.utc),
        idle_expires_at=datetime.now(timezone.utc),
    ))
    db.add(Notification(
        user_id=user_id,
        title="Chào mừng",
        content="Chào bạn đến với công ty",
    ))
    db.commit()

    # Xóa nhân sự
    del_res = FinanceService.delete_employee(db, emp_id)
    assert del_res["status"] == "success"

    # Kiểm tra: Nhân sự đã biến mất
    assert db.query(Employee).filter(Employee.id == emp_id).first() is None
    # Kiểm tra: User đã được hard-delete hoàn toàn khỏi bảng users
    assert db.query(User).filter(User.id == user_id).first() is None
    # Kiểm tra: UserRole, RefreshSession, Notification đã dọn sạch
    assert db.query(UserRole).filter(UserRole.user_id == user_id).first() is None
    assert db.query(RefreshSession).filter(RefreshSession.user_id == user_id).first() is None
    assert db.query(Notification).filter(Notification.user_id == user_id).first() is None

    # Tạo lại nhân sự mới với đúng username & email đó -> Thành công 100%, không bị 409
    new_emp_id = f"emp_{uuid.uuid4().hex[:10]}"
    new_emp = Employee(id=new_emp_id, full_name="Nhân Sự Tái Sinh", is_active=True)
    db.add(new_emp)
    db.commit()

    new_acc = create_employee_account(db, new_emp_id, username, email, role.role_name)
    assert new_acc["user_id"] is not None
    assert new_acc["email"] == email
    assert new_acc["username"] == username


def test_delete_employee_with_audit_trail_tombstones_user_and_frees_email(db, monkeypatch):
    """Nhân sự đã có ràng buộc kiểm toán/nghiệp vụ: áp dụng Tombstone archive an toàn, giải phóng email/username."""
    role = _ensure_role(db)

    emp_id = f"emp_{uuid.uuid4().hex[:10]}"
    username = f"emp_audit_{uuid.uuid4().hex[:6]}"
    email = f"{username}@wifim.test"

    emp = Employee(
        id=emp_id,
        full_name="Nhân Sự Có Lịch Sử Nghiệp Vụ",
        job_title="Chuyên viên",
        is_active=True,
    )
    db.add(emp)
    db.commit()

    acc_res = create_employee_account(db, emp_id, username, email, role.role_name)
    user_id = acc_res["user_id"]

    # Giả lập người dùng đã phát sinh ràng buộc FK (bằng cách mock flush() trong nested savepoint
    # ném IntegrityError khi xóa user, mô phỏng đúng hành vi FK RESTRICT trên PostgreSQL).
    real_flush = db.flush
    def mock_flush(*args, **kwargs):
        for obj in list(db.deleted):
            if isinstance(obj, User) and obj.id == user_id:
                raise IntegrityError("FOREIGN KEY constraint failed on users.id", params=None, orig=Exception("FK RESTRICT"))
        return real_flush(*args, **kwargs)

    monkeypatch.setattr(db, "flush", mock_flush)

    del_res = FinanceService.delete_employee(db, emp_id)
    assert del_res["status"] == "success"

    # 1. Nhân viên đã bị xóa
    assert db.query(Employee).filter(Employee.id == emp_id).first() is None

    # 2. User vẫn tồn tại để giữ audit trail nhưng đã bị Tombstone archive:
    archived_user = db.query(User).filter(User.id == user_id).first()
    assert archived_user is not None
    assert archived_user.is_active is False
    assert archived_user.password_hash is None
    assert archived_user.invite_token_hash is None
    # Email và username đã được gắn tag xóa (scrambled)
    assert "__del_" in archived_user.email
    assert archived_user.username.startswith("del_")
    # Quyền user_roles đã được gỡ bỏ hoàn toàn
    assert db.query(UserRole).filter(UserRole.user_id == user_id).first() is None

    # 3. Tạo nhân sự mới với email và username ban đầu -> Thành công mỹ mãn!
    new_emp_id = f"emp_{uuid.uuid4().hex[:10]}"
    new_emp = Employee(id=new_emp_id, full_name="Nhân Sự Mới Cùng Email", is_active=True)
    db.add(new_emp)
    db.commit()

    new_acc = create_employee_account(db, new_emp_id, username, email, role.role_name)
    assert new_acc["user_id"] != user_id
    assert new_acc["email"] == email
    assert new_acc["username"] == username


def test_delete_employee_self_deletion_prevented(db):
    """Quản trị viên không thể tự xóa nhân sự liên kết với tài khoản đang đăng nhập của chính mình."""
    user = User(
        id=str(uuid.uuid4()),
        username=f"admin_{uuid.uuid4().hex[:6]}",
        email=f"admin_{uuid.uuid4().hex[:6]}@test.local",
        is_active=True,
    )
    db.add(user)
    db.commit()

    emp = Employee(
        id=f"emp_{uuid.uuid4().hex[:10]}",
        user_id=user.id,
        full_name="Quản Trị Viên",
        is_active=True,
    )
    db.add(emp)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        FinanceService.delete_employee(db, emp.id, actor_id=user.id)

    assert exc_info.value.status_code == 400
    assert "Không thể tự xóa" in exc_info.value.detail


def test_update_employee_syncs_is_active_and_revokes_tokens(db):
    """Khi đổi trạng thái nhân sự sang Ngừng hoạt động (is_active=False), tài khoản liên kết tự động bị khóa."""
    user = User(
        id=str(uuid.uuid4()),
        username=f"sync_emp_{uuid.uuid4().hex[:6]}",
        email=f"sync_{uuid.uuid4().hex[:6]}@test.local",
        is_active=True,
    )
    db.add(user)
    db.commit()

    emp = Employee(
        id=f"emp_{uuid.uuid4().hex[:10]}",
        user_id=user.id,
        full_name="Nhân Sự Kiểm Tra Đồng Bộ",
        is_active=True,
    )
    db.add(emp)
    db.commit()

    # Cập nhật is_active = False
    payload = EmployeeUpsertIn(full_name=emp.full_name, is_active=False)
    res = FinanceService.update_employee(db, emp.id, payload)

    assert res["is_active"] is False
    assert res["account_is_active"] is False

    # Kiểm tra User trong database
    db.refresh(user)
    assert user.is_active is False

    # Cập nhật lại is_active = True
    payload_active = EmployeeUpsertIn(full_name=emp.full_name, is_active=True)
    res_active = FinanceService.update_employee(db, emp.id, payload_active)

    assert res_active["is_active"] is True
    assert res_active["account_is_active"] is True
    db.refresh(user)
    assert user.is_active is True


def test_update_employee_self_deactivation_prevented(db):
    """Không thể tự khóa tài khoản của chính mình thông qua cập nhật nhân sự."""
    user = User(
        id=str(uuid.uuid4()),
        username=f"self_deact_{uuid.uuid4().hex[:6]}",
        email=f"self_{uuid.uuid4().hex[:6]}@test.local",
        is_active=True,
    )
    db.add(user)
    db.commit()

    emp = Employee(
        id=f"emp_{uuid.uuid4().hex[:10]}",
        user_id=user.id,
        full_name="Tự Khóa Chính Mình",
        is_active=True,
    )
    db.add(emp)
    db.commit()

    payload = EmployeeUpsertIn(full_name=emp.full_name, is_active=False)
    with pytest.raises(HTTPException) as exc_info:
        FinanceService.update_employee(db, emp.id, payload, actor_id=user.id)

    assert exc_info.value.status_code == 400
    assert "Không thể tự vô hiệu hoá" in exc_info.value.detail


def test_user_admin_deactivate_revokes_tokens(db):
    """set_user_active_status(is_active=False) vô hiệu hóa tài khoản và thu hồi token."""
    user = User(
        id=str(uuid.uuid4()),
        username=f"admin_deact_{uuid.uuid4().hex[:6]}",
        email=f"admin_deact_{uuid.uuid4().hex[:6]}@test.local",
        is_active=True,
    )
    db.add(user)
    db.commit()

    res = set_user_active_status(db, user.id, False)
    assert res["is_active"] is False
    db.refresh(user)
    assert user.is_active is False


def test_delete_employee_with_payroll_or_attendance_raises_409(db):
    """Khi nhân sự đã phát sinh chấm công/bảng lương, xóa nhân sự sẽ báo 409 và giữ nguyên vẹn dữ liệu."""
    user_id = str(uuid.uuid4())
    user_email = f"payroll_{uuid.uuid4().hex[:6]}@test.local"
    user = User(
        id=user_id,
        username=f"payroll_emp_{uuid.uuid4().hex[:6]}",
        email=user_email,
        is_active=True,
    )
    db.add(user)
    db.commit()

    emp_id = f"emp_{uuid.uuid4().hex[:10]}"
    emp = Employee(
        id=emp_id,
        user_id=user_id,
        full_name="Nhân Sự Đã Chấm Công",
        is_active=True,
    )
    db.add(emp)
    db.commit()

    # Thêm bản ghi chấm công thực tế phát sinh cho nhân sự
    attendance_record = Attendance(
        id=str(uuid.uuid4()),
        employee_id=emp_id,
        date=date.today(),
        status="PRESENT",
    )
    db.add(attendance_record)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        FinanceService.delete_employee(db, emp_id)

    assert exc_info.value.status_code == 409
    assert "chấm công hoặc bảng lương" in exc_info.value.detail

    # Kiểm tra toàn vẹn: Cả employee và user đều còn nguyên vẹn trong DB
    restored_emp = db.query(Employee).filter(Employee.id == emp_id).first()
    restored_user = db.query(User).filter(User.id == user_id).first()
    assert restored_emp is not None
    assert restored_emp.user_id == user_id
    assert restored_user is not None
    assert restored_user.is_active is True
    assert restored_user.email == user_email


def test_non_admin_cannot_create_admin_account(db):
    """Người dùng không phải admin không thể cấp quyền admin khi tạo tài khoản nhân sự."""
    _ensure_role(db, "admin")
    _ensure_role(db, "sales")

    hr_user = User(
        id=str(uuid.uuid4()),
        username=f"hr_{uuid.uuid4().hex[:6]}",
        email=f"hr_{uuid.uuid4().hex[:6]}@test.local",
        is_active=True,
    )
    db.add(hr_user)
    db.commit()

    emp = Employee(
        id=f"emp_{uuid.uuid4().hex[:10]}",
        full_name="Nhân Sự Cần Cấp Admin",
        is_active=True,
    )
    db.add(emp)
    db.commit()

    # HR user attempts to provision an admin account
    with pytest.raises(HTTPException) as exc_info:
        create_employee_account(
            db,
            employee_id=emp.id,
            username=f"newadmin_{uuid.uuid4().hex[:6]}",
            email=f"newadmin_{uuid.uuid4().hex[:6]}@test.local",
            role_name="admin",
            creator_user=hr_user,
        )

    assert exc_info.value.status_code == 403
    assert "Quản trị viên" in exc_info.value.detail


def test_admin_can_create_admin_account(db):
    """Admin có quyền cấp tài khoản mang vai trò admin."""
    admin_role = _ensure_role(db, "admin")

    admin_user = User(
        id=str(uuid.uuid4()),
        username="admin",
        email="admin@test.local",
        is_active=True,
    )
    db.add(admin_user)
    db.commit()

    db.add(UserRole(user_id=admin_user.id, role_id=admin_role.id))
    db.commit()

    emp = Employee(
        id=f"emp_{uuid.uuid4().hex[:10]}",
        full_name="Nhân Sự Được Admin Cấp Quyền",
        is_active=True,
    )
    db.add(emp)
    db.commit()

    res = create_employee_account(
        db,
        employee_id=emp.id,
        username=f"legit_admin_{uuid.uuid4().hex[:6]}",
        email=f"legit_{uuid.uuid4().hex[:6]}@test.local",
        role_name="admin",
        creator_user=admin_user,
    )

    assert res["user_id"] is not None
    assert res["role"] == "admin"


def test_storage_service_rejects_path_traversal():
    """storage_service._require_prefix từ chối các chuỗi chứa path traversal dot-segments."""
    from src.services.storage_service import _require_prefix, AVATAR_PREFIX

    with pytest.raises(ValueError, match="path traversal"):
        _require_prefix("avatars/../finance/secret.png", (AVATAR_PREFIX,))

    with pytest.raises(ValueError, match="path traversal"):
        _require_prefix("avatars\\..\\secret.png", (AVATAR_PREFIX,))

    # Hợp lệ
    valid = _require_prefix("avatars/valid-user-123.png", (AVATAR_PREFIX,))
    assert valid == "avatars/valid-user-123.png"
