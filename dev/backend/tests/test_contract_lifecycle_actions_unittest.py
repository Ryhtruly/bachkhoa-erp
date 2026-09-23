import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from src.routes.routes_contracts import (
    ContractCancelPayload,
    cancel_contract_endpoint,
    delete_contract_endpoint,
    _require_director_or_contract_admin,
)


class TestContractLifecycleActions(unittest.TestCase):
    def setUp(self):
        self.admin_user = SimpleNamespace(
            id="u-admin",
            username="admin",
            full_name="Admin User",
            is_active=True,
        )
        self.regular_user = SimpleNamespace(
            id="u-staff",
            username="staff1",
            full_name="Staff One",
            is_active=True,
        )

    def test_permission_blocks_regular_user(self):
        db = MagicMock()
        with patch("src.routes.routes_contracts.check_user_permission", return_value=False):
            db.query.return_value.join.return_value.filter.return_value.first.return_value = None
            with self.assertRaises(HTTPException) as ctx:
                _require_director_or_contract_admin(self.regular_user, db)
            self.assertEqual(ctx.exception.status_code, 403)

    def test_permission_allows_admin(self):
        db = MagicMock()
        with patch("src.routes.routes_contracts.check_user_permission", return_value=True):
            # Should not raise exception when user has permission
            _require_director_or_contract_admin(self.admin_user, db)

        with patch("src.routes.routes_contracts.check_user_permission", return_value=False):
            db.query.return_value.join.return_value.filter.return_value.first.return_value = ("role-admin-id",)
            # Should also allow when user has director/admin role in DB
            _require_director_or_contract_admin(self.admin_user, db)

    @patch("src.routes.routes_contracts.assert_contract_write_access")
    @patch("src.routes.routes_contracts.check_user_permission", return_value=True)
    def test_cancel_contract_not_found(self, mock_perm, mock_access):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        payload = ContractCancelPayload(reason="Khách hàng dừng thực hiện")
        with self.assertRaises(HTTPException) as ctx:
            cancel_contract_endpoint("HD-999", payload, db=db, user=self.admin_user)
        self.assertEqual(ctx.exception.status_code, 404)

    @patch("src.routes.routes_contracts.assert_contract_write_access")
    @patch("src.routes.routes_contracts.check_user_permission", return_value=True)
    def test_cancel_contract_already_cancelled(self, mock_perm, mock_access):
        db = MagicMock()
        mock_contract = SimpleNamespace(id="HD-1", status="cancelled", appendix_summary=None)
        db.query.return_value.filter.return_value.first.return_value = mock_contract
        payload = ContractCancelPayload(reason="Khách hàng dừng thực hiện")
        with self.assertRaises(HTTPException) as ctx:
            cancel_contract_endpoint("HD-1", payload, db=db, user=self.admin_user)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("đã ở trạng thái đã hủy", ctx.exception.detail)

    @patch("src.routes.routes_contracts.assert_contract_write_access")
    @patch("src.routes.routes_contracts.check_user_permission", return_value=True)
    @patch("src.routes.routes_contracts.invalidate_cache")
    @patch("src.routes.routes_contracts.cancel_workflow")
    def test_cancel_contract_success(self, mock_cancel_wf, mock_inv_cache, mock_perm, mock_access):
        db = MagicMock()
        mock_contract = SimpleNamespace(id="HD-1", status=None, appendix_summary=None)
        mock_sl = SimpleNamespace(id="sl-1", contract_id="HD-1")

        def mock_query(model):
            q = MagicMock()
            m_name = getattr(model, "__name__", str(model))
            if m_name == "Contract":
                q.filter.return_value.first.return_value = mock_contract
            elif m_name == "ServiceLine":
                q.filter.return_value.all.return_value = [mock_sl]
            elif m_name == "Employee":
                q.filter.return_value.first.return_value = None
            return q

        db.query.side_effect = mock_query
        payload = ContractCancelPayload(reason="Khách hàng đổi ý không làm nữa")

        res = cancel_contract_endpoint("HD-1", payload, db=db, user=self.admin_user)

        self.assertEqual(res["status"], "success")
        self.assertEqual(mock_contract.status, "cancelled")
        self.assertIn("[ĐÃ HỦY", mock_contract.appendix_summary)
        self.assertIn("Khách hàng đổi ý không làm nữa", mock_contract.appendix_summary)
        db.commit.assert_called_once()
        mock_cancel_wf.assert_called_once()

    @patch("src.routes.routes_contracts.assert_contract_write_access")
    @patch("src.routes.routes_contracts.check_user_permission", return_value=True)
    @patch("src.routes.routes_contracts.invalidate_cache")
    @patch("src.routes.routes_contracts.cancel_workflow")
    def test_cancel_contract_with_multiple_service_lines_mixed_workflows(self, mock_cancel_wf, mock_inv_cache, mock_perm, mock_access):
        from src.contracts.workflow_runtime import WorkflowValidationError

        db = MagicMock()
        mock_contract = SimpleNamespace(id="HD-2", status="running", appendix_summary="Ghi chú ban đầu")
        mock_sl1 = SimpleNamespace(id="sl-1", contract_id="HD-2")
        mock_sl2 = SimpleNamespace(id="sl-2", contract_id="HD-2")

        def mock_query(model):
            q = MagicMock()
            m_name = getattr(model, "__name__", str(model))
            if m_name == "Contract":
                q.filter.return_value.first.return_value = mock_contract
            elif m_name == "ServiceLine":
                q.filter.return_value.all.return_value = [mock_sl1, mock_sl2]
            elif m_name == "Employee":
                q.filter.return_value.first.return_value = None
            return q

        db.query.side_effect = mock_query

        # sl1 succeeds, sl2 raises WorkflowValidationError
        mock_cancel_wf.side_effect = [
            {"status": "cancelled"},
            WorkflowValidationError("Hạng mục chưa có workflow để hủy"),
        ]

        payload = ContractCancelPayload(reason="Khách hàng dừng dự án do thay đổi quy hoạch")
        res = cancel_contract_endpoint("HD-2", payload, db=db, user=self.admin_user)

        self.assertEqual(res["status"], "success")
        self.assertEqual(mock_contract.status, "cancelled")
        self.assertEqual(res["cancelled_workflows"], 1)
        self.assertIn("Ghi chú ban đầu", mock_contract.appendix_summary)
        self.assertIn("Khách hàng dừng dự án do thay đổi quy hoạch", mock_contract.appendix_summary)
        db.commit.assert_called_once()

    def test_cancel_contract_rejects_short_reason(self):
        from pydantic import ValidationError
        with self.assertRaises(ValidationError):
            ContractCancelPayload(reason="ngan")

    @patch("src.routes.routes_contracts.assert_contract_write_access")
    @patch("src.routes.routes_contracts.check_user_permission", return_value=True)
    def test_delete_contract_rejects_mismatched_confirm_code(self, mock_perm, mock_access):
        db = MagicMock()
        mock_contract = SimpleNamespace(id="015/BK-2026")
        db.query.return_value.filter.return_value.first.return_value = mock_contract

        with self.assertRaises(HTTPException) as ctx:
            delete_contract_endpoint(
                "015/BK-2026",
                confirm_code="WRONG-CODE",
                db=db,
                user=self.admin_user,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Mã hợp đồng xác nhận không khớp", ctx.exception.detail)

    @patch("src.routes.routes_contracts.assert_contract_write_access")
    @patch("src.routes.routes_contracts.check_user_permission", return_value=True)
    def test_delete_contract_rejects_paid_amount(self, mock_perm, mock_access):
        db = MagicMock()
        mock_contract = SimpleNamespace(id="015/BK-2026")
        mock_rec = SimpleNamespace(paid_amount=500000.0)

        def mock_query(model):
            q = MagicMock()
            m_name = getattr(model, "__name__", str(model))
            if m_name == "Contract":
                q.filter.return_value.first.return_value = mock_contract
            elif m_name == "Receivable":
                q.filter.return_value.first.return_value = mock_rec
            return q

        db.query.side_effect = mock_query

        with self.assertRaises(HTTPException) as ctx:
            delete_contract_endpoint(
                "015/BK-2026",
                confirm_code="015/BK-2026",
                db=db,
                user=self.admin_user,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Không thể xoá hợp đồng đã phát sinh thu tiền", ctx.exception.detail)

    @patch("src.routes.routes_contracts.assert_contract_write_access")
    @patch("src.routes.routes_contracts.check_user_permission", return_value=True)
    def test_delete_contract_rejects_existing_cashflow(self, mock_perm, mock_access):
        db = MagicMock()
        mock_contract = SimpleNamespace(id="015/BK-2026")
        mock_rec = SimpleNamespace(paid_amount=0.0)

        def mock_query(model):
            q = MagicMock()
            m_name = getattr(model, "__name__", str(model))
            if m_name == "Contract":
                q.filter.return_value.first.return_value = mock_contract
            elif m_name == "Receivable":
                q.filter.return_value.first.return_value = mock_rec
            return q

        db.query.side_effect = mock_query
        db.execute.return_value.scalar.return_value = 1  # 1 cashflow transaction exists

        with self.assertRaises(HTTPException) as ctx:
            delete_contract_endpoint(
                "015/BK-2026",
                confirm_code="015/BK-2026",
                db=db,
                user=self.admin_user,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Không thể xoá hợp đồng đã có giao dịch dòng tiền", ctx.exception.detail)

    @patch("src.routes.routes_contracts.assert_contract_write_access")
    @patch("src.routes.routes_contracts.check_user_permission", return_value=True)
    def test_delete_contract_rejects_active_workflow(self, mock_perm, mock_access):
        db = MagicMock()
        mock_contract = SimpleNamespace(id="015/BK-2026")
        mock_rec = SimpleNamespace(paid_amount=0.0)

        def mock_query(model):
            q = MagicMock()
            m_name = getattr(model, "__name__", str(model))
            if m_name == "Contract":
                q.filter.return_value.first.return_value = mock_contract
            elif m_name == "Receivable":
                q.filter.return_value.first.return_value = mock_rec
            return q

        db.query.side_effect = mock_query

        # First call: cashflow count (0), Second call: wf_count (1)
        db.execute.return_value.scalar.side_effect = [0, 1]

        with self.assertRaises(HTTPException) as ctx:
            delete_contract_endpoint(
                "015/BK-2026",
                confirm_code="015/BK-2026",
                db=db,
                user=self.admin_user,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Hợp đồng đang có quy trình thực hiện", ctx.exception.detail)

    @patch("src.routes.routes_contracts.assert_contract_write_access")
    @patch("src.routes.routes_contracts.check_user_permission", return_value=True)
    @patch("src.routes.routes_contracts.invalidate_cache")
    def test_delete_contract_success_when_clean(self, mock_inv_cache, mock_perm, mock_access):
        db = MagicMock()
        mock_contract = SimpleNamespace(id="015/BK-2026")
        mock_rec = SimpleNamespace(paid_amount=0.0)

        def mock_query(model):
            q = MagicMock()
            m_name = getattr(model, "__name__", str(model))
            if m_name == "Contract":
                q.filter.return_value.first.return_value = mock_contract
            elif m_name == "Receivable":
                q.filter.return_value.first.return_value = mock_rec
            return q

        db.query.side_effect = mock_query
        db.execute.return_value.scalar.side_effect = [0, 0]

        res = delete_contract_endpoint(
            "015/BK-2026",
            confirm_code="015/BK-2026",
            db=db,
            user=self.admin_user,
        )

        self.assertEqual(res["status"], "success")
        self.assertIn("Đã xoá vĩnh viễn hợp đồng 015/BK-2026", res["message"])
        db.delete.assert_called_once_with(mock_contract)
        db.commit.assert_called_once()
        mock_inv_cache.assert_called()

    def test_routing_with_slashed_contract_id(self):
        from fastapi import FastAPI
        from starlette.testclient import TestClient
        from src.routes.routes_contracts import router
        from src.db.database import get_db
        from src.core.auth import require_authenticated_user

        app = FastAPI()
        app.include_router(router, prefix="/api/contracts")

        mock_db = MagicMock()
        mock_contract = SimpleNamespace(id="015/BK-2026", status=None, appendix_summary=None)
        mock_rec = SimpleNamespace(paid_amount=0.0)

        def mock_query(model):
            q = MagicMock()
            m_name = getattr(model, "__name__", str(model))
            if m_name == "Contract":
                q.filter.return_value.first.return_value = mock_contract
            elif m_name == "Receivable":
                q.filter.return_value.first.return_value = mock_rec
            elif m_name == "ServiceLine":
                q.filter.return_value.all.return_value = []
            elif m_name == "Employee":
                q.filter.return_value.first.return_value = None
            return q

        mock_db.query.side_effect = mock_query
        mock_db.execute.return_value.scalar.side_effect = [0, 0]

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[require_authenticated_user] = lambda: self.admin_user

        with patch("src.routes.routes_contracts.invalidate_cache"), \
             patch("src.routes.routes_contracts.cancel_workflow"), \
             patch("src.routes.routes_contracts.check_user_permission", return_value=True), \
             patch("src.routes.routes_contracts.assert_contract_write_access"):
            client = TestClient(app)

            # Test DELETE with slash in path
            res_del = client.delete("/api/contracts/015%2FBK-2026?confirm_code=015%2FBK-2026")
            self.assertEqual(res_del.status_code, 200)
            self.assertEqual(res_del.json()["status"], "success")

            mock_contract.status = "running"
            res_cancel = client.post("/api/contracts/015%2FBK-2026/cancel", json={"reason": "Khách hàng dừng thực hiện hợp đồng"})
            self.assertEqual(res_cancel.status_code, 200)
            self.assertEqual(res_cancel.json()["status"], "success")


if __name__ == "__main__":
    unittest.main()


