import os
import subprocess
import sys
import textwrap
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
CONFTEST_PATH = BACKEND_DIR / "tests" / "conftest.py"


def _load_conftest_in_child(environment, expected_message):
    script = textwrap.dedent(
        """
        import builtins
        import importlib.util
        import os
        import sys

        import pytest

        real_import = builtins.__import__

        def reject_database_import(name, *args, **kwargs):
            if name == "src.db.database":
                raise AssertionError("database module imported before test database guard")
            return real_import(name, *args, **kwargs)

        builtins.__import__ = reject_database_import
        spec = importlib.util.spec_from_file_location("guarded_conftest", sys.argv[1])
        module = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(module)
        except pytest.UsageError as exc:
            if sys.argv[2] in str(exc):
                sys.exit(0)
            print(f"UNSAFE: unexpected guard message: {exc}")
            sys.exit(1)
        except BaseException as exc:
            print(f"UNSAFE: {type(exc).__name__}: {exc}")
            sys.exit(1)

        print("UNSAFE: conftest completed without rejecting its database configuration")
        sys.exit(1)
        """
    )
    child_environment = os.environ | environment
    child_environment["PYTHONPATH"] = str(BACKEND_DIR)
    return subprocess.run(
        [sys.executable, "-c", script, str(CONFTEST_PATH), expected_message],
        cwd=BACKEND_DIR,
        env=child_environment,
        capture_output=True,
        text=True,
        check=False,
    )


def test_missing_test_database_url_aborts_before_database_import():
    """Removing the explicit test target must never fall back to DATABASE_URL."""
    result = _load_conftest_in_child(
        {
            "DATABASE_URL": "postgresql://live.example.invalid/erp",
            "TEST_DATABASE_URL": "",
        },
        "TEST_DATABASE_URL is required",
    )

    assert result.returncode == 0, result.stdout + result.stderr


def test_matching_test_and_application_database_urls_abort_before_database_import():
    """A reused application target is unsafe even when TEST_DATABASE_URL is set."""
    live_like_url = "postgresql://live.example.invalid/erp"
    result = _load_conftest_in_child(
        {
            "DATABASE_URL": live_like_url,
            "TEST_DATABASE_URL": live_like_url,
        },
        "resolves to DATABASE_URL",
    )

    assert result.returncode == 0, result.stdout + result.stderr


def test_distinct_supabase_test_database_url_aborts_before_database_import():
    """A distinct Supabase URL is still a shared target and must be rejected."""
    result = _load_conftest_in_child(
        {
            "DATABASE_URL": "postgresql://live.example.invalid/erp",
            "TEST_DATABASE_URL": (
                "postgresql://test_user:test_password@"
                "aws-1-ap-southeast-1.pooler.supabase.com:6543/erp_test"
            ),
        },
        "Supabase and shared databases are forbidden",
    )

    assert result.returncode == 0, result.stdout + result.stderr


def test_equivalent_database_urls_abort_before_database_import():
    """Host case, driver spelling, credentials, and default ports cannot bypass equality."""
    result = _load_conftest_in_child(
        {
            "DATABASE_URL": (
                "postgresql://application_user:application_password@"
                "LIVE.EXAMPLE.INVALID:5432/erp_test?sslmode=require"
            ),
            "TEST_DATABASE_URL": (
                "postgresql+psycopg2://test_user:test_password@"
                "live.example.invalid/erp_test?sslmode=require"
            ),
        },
        "resolves to DATABASE_URL",
    )

    assert result.returncode == 0, result.stdout + result.stderr


def test_disposable_target_rolls_back_writes_after_fixture_teardown():
    """A request dependency must bind writes to the disposable target, then roll them back."""
    script = textwrap.dedent(
        """
        import importlib.util
        import os
        import sys
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as directory:
            test_url = f"sqlite:///{Path(directory, 'isolated-test.db').as_posix()}"
            os.environ["DATABASE_URL"] = "postgresql://live.example.invalid/erp"
            os.environ["TEST_DATABASE_URL"] = test_url
            os.environ["SEED_ADMIN_ENABLED"] = "0"

            spec = importlib.util.spec_from_file_location("guarded_conftest", sys.argv[1])
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            from sqlalchemy import text

            assert str(module.engine.url) == test_url
            with module.engine.begin() as connection:
                connection.execute(text("CREATE TABLE guard_sentinel (id INTEGER PRIMARY KEY)"))

            fixture = module.db.__wrapped__()
            session = next(fixture)
            assert module.app.dependency_overrides[module.get_db]() is session
            session.execute(text("INSERT INTO guard_sentinel (id) VALUES (1)"))
            assert session.execute(text("SELECT COUNT(*) FROM guard_sentinel")).scalar() == 1

            try:
                next(fixture)
            except StopIteration:
                pass
            else:
                raise AssertionError("database fixture did not finish")

            with module.engine.connect() as connection:
                assert connection.execute(text("SELECT COUNT(*) FROM guard_sentinel")).scalar() == 0
            module.engine.dispose()
            """
    )
    result = subprocess.run(
        [sys.executable, "-c", script, str(CONFTEST_PATH)],
        cwd=BACKEND_DIR,
        env=os.environ | {"PYTHONPATH": str(BACKEND_DIR)},
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
