from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

from src.core.auth import check_user_permission
from src.core.permissions import PermissionDecision
from src.core.permissions import decide_normalized_permission
from src.index import app


def permission(code="contracts.update.all", *, resource="contracts", action="update", active=True):
    return SimpleNamespace(
        code=code,
        resource_code=resource,
        action_code=action,
        scope_code="all",
        is_active=active,
    )


def grant(role_id, permission_code):
    return SimpleNamespace(role_id=role_id, permission_code=permission_code)


def override(permission_code, effect, expires_at=None):
    return SimpleNamespace(
        permission_code=permission_code,
        effect=effect,
        expires_at=expires_at,
    )


def test_normalized_permission_returns_none_when_resource_is_not_configured():
    assert decide_normalized_permission(
        resource_codes=["contracts"],
        action="update",
        role_ids=[1],
        permissions=[],
        grants=[],
        overrides=[],
    ) is None


def test_denied_override_wins_over_role_grant():
    decision = decide_normalized_permission(
        resource_codes=["contracts"],
        action="update",
        role_ids=[1],
        permissions=[permission()],
        grants=[grant(1, "contracts.update.all")],
        overrides=[override("contracts.update.all", "deny")],
    )

    assert decision.allowed is False
    assert decision.reason == "user_override_deny"


def test_allowed_override_wins_without_role_grant():
    decision = decide_normalized_permission(
        resource_codes=["contracts"],
        action="update",
        role_ids=[],
        permissions=[permission()],
        grants=[],
        overrides=[override("contracts.update.all", "allow")],
    )

    assert decision.allowed is True
    assert decision.reason == "user_override_allow"


def test_active_role_grant_allows_permission_and_expired_override_is_ignored():
    decision = decide_normalized_permission(
        resource_codes=["contracts"],
        action="update",
        role_ids=[1],
        permissions=[permission()],
        grants=[grant(1, "contracts.update.all")],
        overrides=[override("contracts.update.all", "deny", datetime.now(timezone.utc) - timedelta(seconds=1))],
    )

    assert decision.allowed is True
    assert decision.reason == "role_grant"


def test_shadow_decision_never_overrides_legacy_authorization(caplog):
    class Query:
        def join(self, *args, **kwargs):
            return self

        def outerjoin(self, *args, **kwargs):
            return self

        def filter(self, *args, **kwargs):
            return self

        def exists(self):
            return self

        def scalar(self):
            return False

    class Db:
        def query(self, *args, **kwargs):
            return Query()

    with patch(
        "src.core.auth.evaluate_normalized_permission",
        return_value=PermissionDecision(True, "contracts.update.all", "all", "role_grant"),
    ):
        allowed = check_user_permission(
            Db(),
            SimpleNamespace(id="user-1", username="staff", is_active=True),
            "contracts",
            "update",
        )

    assert allowed is False
    assert "RBAC shadow mismatch" not in caplog.text


def test_quote_generation_requires_an_authenticated_user():
    quote_route = next(route for route in app.routes if getattr(route, "path", None) == "/api/quotations/calculate")

    def dependency_calls(dependant):
        for dependency in dependant.dependencies:
            yield dependency.call
            yield from dependency_calls(dependency)

    assert any(getattr(call, "__name__", None) == "get_current_user" for call in dependency_calls(quote_route.dependant))
