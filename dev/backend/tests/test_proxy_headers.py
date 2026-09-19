from fastapi.testclient import TestClient
from fastapi import Request
from src.index import app


def test_proxy_headers_middleware_extracts_client_ip():
    client = TestClient(app)

    @app.get("/api/test-ip-probe")
    def ip_probe(request: Request):
        return {"client_ip": request.client.host if request.client else None}

    # Pass spoofed / proxy forwarded header
    res = client.get("/api/test-ip-probe", headers={"X-Forwarded-For": "203.0.113.195"})
    assert res.status_code == 200
    assert res.json()["client_ip"] == "203.0.113.195"
