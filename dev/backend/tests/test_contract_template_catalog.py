import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.core.auth import User
from src.db.database import get_db
from src.db.models import ContractTemplate
from src.routes.routes_contracts import router


class _TemplateQuery:
    def __init__(self, rows):
        self.rows = list(rows)

    def filter(self, *criteria):
        for criterion in criteria:
            key = getattr(getattr(criterion, "left", None), "key", None)
            value = getattr(getattr(criterion, "right", None), "value", None)
            if key is not None:
                self.rows = [row for row in self.rows if getattr(row, key) == value]
        return self

    def order_by(self, *_ordering):
        return self

    def all(self):
        return self.rows


class ContractTemplateCatalogRouteTests(unittest.TestCase):
    def _app(self, rows, *, allow_contract_creation):
        app = FastAPI()
        app.include_router(router, prefix="/api/contracts")
        db = SimpleNamespace(query=lambda _model: _TemplateQuery(rows))
        app.dependency_overrides[get_db] = lambda: db
        for route in app.routes:
            if getattr(route, "path", None) == "/api/contracts/templates":
                permission_dependency = next(
                    dependency.call
                    for dependency in route.dependant.dependencies
                    if getattr(dependency.call, "__name__", "") == "dependency"
                )
                if allow_contract_creation:
                    app.dependency_overrides[permission_dependency] = lambda: User(
                        id="admin", username="admin", is_active=True
                    )
                return app
        self.fail("Contract template catalog route is not registered")

    def test_template_catalog_returns_only_published_rows(self):
        """Catches the creation catalog exposing draft or archived template rows."""
        app = self._app(
            [
                ContractTemplate(id="published", code="DO_DAC", version=1, name="Đo đạc", status="published"),
                ContractTemplate(id="draft", code="NHAP", version=1, name="Nháp", status="draft"),
            ],
            allow_contract_creation=True,
        )

        with TestClient(app) as client:
            response = client.get("/api/contracts/templates")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            [{"id": "published", "code": "DO_DAC", "version": 1, "name": "Đo đạc"}],
        )

    def test_template_catalog_requires_contract_create_permission(self):
        """Catches the catalog becoming available without the contract:create guard."""
        app = self._app([], allow_contract_creation=False)

        with TestClient(app) as client:
            response = client.get("/api/contracts/templates")

        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
