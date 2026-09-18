from urllib.parse import quote

from src.files.content_disposition import (
    build_content_disposition_header,
    sanitize_filename,
    to_ascii_filename,
)


def test_to_ascii_filename():
    assert to_ascii_filename("Bảng lương tháng 8.xlsx") == "Bang_luong_thang_8.xlsx"
    assert to_ascii_filename("Hóa đơn/Biên lai.pdf") == "Hoa_don_Bien_lai.pdf"
    assert to_ascii_filename("Đo vẽ bản đồ.dwg") == "Do_ve_ban_do.dwg"
    assert to_ascii_filename("") == "download"
    assert to_ascii_filename("___") == "download"


def test_sanitize_filename():
    assert sanitize_filename("path/to/file.pdf") == "file.pdf"
    assert sanitize_filename(r"C:\Windows\file.pdf") == "file.pdf"
    assert sanitize_filename("safe.png") == "safe.png"
    assert sanitize_filename("") == "file"


def test_build_content_disposition_header():
    name = "Bảng lương tháng 8.xlsx"
    header = build_content_disposition_header(name, disposition="attachment")
    assert header.startswith('attachment; filename="Bang_luong_thang_8.xlsx"; filename*=UTF-8\'\'')
    assert quote(name) in header

    header_inline = build_content_disposition_header("bill.png", disposition="inline")
    assert header_inline == 'inline; filename="bill.png"; filename*=UTF-8\'\'bill.png'


def test_employee_portal_file_content_disposition(monkeypatch):
    from io import BytesIO
    from types import SimpleNamespace
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from src.routes import routes_employee_portal
    from src.db.database import get_db

    class MockDb:
        def execute(self, *args, **kwargs):
            return self

        def first(self):
            return [1]

    app = FastAPI()
    app.include_router(routes_employee_portal.router)
    app.dependency_overrides[routes_employee_portal.get_current_user] = lambda: SimpleNamespace(
        id="user-1", is_active=True, username="user1"
    )
    app.dependency_overrides[get_db] = lambda: MockDb()
    monkeypatch.setattr(routes_employee_portal, "user_has_all_contract_read_access", lambda *_args: True)
    monkeypatch.setattr(
        routes_employee_portal,
        "get_file",
        lambda _key: {"Body": BytesIO(b"data"), "ContentType": "application/pdf"},
    )

    with TestClient(app) as client:
        # Default filename extracted from object_key (uuid stripped)
        res = client.get(
            "/api/employee-portal/file",
            params={"object_key": "avatars/a1b2c3d4e5f6_user_avatar.png"},
        )
        assert res.status_code == 200
        assert "Content-Disposition" in res.headers
        assert 'filename="user_avatar.png"' in res.headers["Content-Disposition"]

        # Explicit filename provided with download=true
        res_dl = client.get(
            "/api/employee-portal/file",
            params={
                "object_key": "contracts/HD01/service-lines/SL01/nodes/N01/uuid-raw.pdf",
                "filename": "Bản vẽ trích đo.pdf",
                "download": "true",
            },
        )
        assert res_dl.status_code == 200
        assert res_dl.headers["Content-Disposition"].startswith('attachment; filename="Ban_ve_trich_do.pdf"')
        assert quote("Bản vẽ trích đo.pdf") in res_dl.headers["Content-Disposition"]
        assert "Content-Disposition" in res_dl.headers["Access-Control-Expose-Headers"]

