import os


def _load_secret(name: str, *, development_default: str, environment: str) -> str:
    value = os.getenv(name, "").strip()
    if environment.lower() in ("production", "prod", "staging"):
        if len(value) < 32:
            raise RuntimeError(
                f"{name} phải được cấu hình và có ít nhất 32 ký tự trong môi trường {environment}."
            )
        return value
    return value or development_default


class Settings:
    # App Settings
    ENV = os.getenv("ENV", "development")

    # Database Config
    PG_USER = os.getenv("PG_USER", "postgres")
    PG_PASSWORD = os.getenv("PG_PASSWORD", "" if os.getenv("ENV", "development").lower() in ("production", "prod", "staging") else "123")
    PG_HOST = os.getenv("PG_HOST", "localhost")
    PG_PORT = os.getenv("PG_PORT", "5432")
    PG_DATABASE = os.getenv("PG_DATABASE", "bachkhoa_erp")

    @property
    def DATABASE_URL(self) -> str:
        if self.ENV.lower() in ("production", "prod", "staging"):
            if not self.PG_PASSWORD or self.PG_PASSWORD in ("123", "postgres", "admin", "password"):
                raise RuntimeError("PG_PASSWORD phải được cấu hình an toàn trong production.")
        return f"postgresql://{self.PG_USER}:{self.PG_PASSWORD}@{self.PG_HOST}:{self.PG_PORT}/{self.PG_DATABASE}"
    
    # Secrets & API Keys. Production must fail closed instead of signing JWTs
    # with a value embedded in the source tree.
    SECRET_KEY = _load_secret(
        "SECRET_KEY",
        development_default="super_secret_key_change_in_prod",
        environment=ENV,
    )
    ZALO_ACCESS_TOKEN = os.getenv("ZALO_ACCESS_TOKEN", "")
    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
    # Both provider callbacks use the same gateway-owned HMAC secret. Keep the
    # endpoint fail-closed when the deployment has not configured it.
    WEBHOOK_SHARED_SECRET = os.getenv("WEBHOOK_SHARED_SECRET", "").strip()
    ADMIN_BOOTSTRAP_PASSWORD = os.getenv("ADMIN_BOOTSTRAP_PASSWORD", "").strip()
    
    # Authentication session policy. Access tokens remain short-lived; the
    # durable session is represented by a rotated HttpOnly refresh cookie.
    ACCESS_TOKEN_EXPIRE_MINUTES = max(1, int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")))
    REFRESH_TOKEN_EXPIRE_DAYS = max(1, int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7")))
    REMEMBER_ME_REFRESH_TOKEN_EXPIRE_DAYS = max(
        REFRESH_TOKEN_EXPIRE_DAYS,
        int(os.getenv("REMEMBER_ME_REFRESH_TOKEN_EXPIRE_DAYS", "30")),
    )
    REFRESH_TOKEN_IDLE_HOURS = max(1, int(os.getenv("REFRESH_TOKEN_IDLE_HOURS", "24")))
    AUTH_REFRESH_SESSION_RETENTION_DAYS = max(
        1,
        int(os.getenv("AUTH_REFRESH_SESSION_RETENTION_DAYS", "30")),
    )
    AUTH_REFRESH_SESSION_CLEANUP_INTERVAL_HOURS = max(
        0,
        int(os.getenv("AUTH_REFRESH_SESSION_CLEANUP_INTERVAL_HOURS", "24")),
    )
    AUTH_COOKIE_NAME = os.getenv("AUTH_COOKIE_NAME", "bk_refresh_token")
    AUTH_COOKIE_DOMAIN = os.getenv("AUTH_COOKIE_DOMAIN", "").strip() or None
    AUTH_COOKIE_SAMESITE = os.getenv(
        "AUTH_COOKIE_SAMESITE",
        "none" if ENV.lower() in ("production", "prod", "staging") else "lax",
    ).strip().lower()

    @property
    def cors_origins(self) -> list[str]:
        raw = os.getenv("CORS_ORIGINS", "").strip()
        if not raw:
            if self.ENV.lower() in ("production", "prod", "staging"):
                raise RuntimeError("CORS_ORIGINS phải được cấu hình rõ ràng trong production.")
            origins = [
                "http://localhost:3000",
                "http://localhost:5173",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:5173",
            ]
        elif raw == "*":
            if self.ENV.lower() in ("production", "prod", "staging"):
                raise RuntimeError(
                    "CORS_ORIGINS không được là '*' khi credentials được bật trong production."
                )
            return ["*"]
        else:
            # Browser Origin values never contain a trailing slash. Normalize
            # the env value so a harmless formatting difference does not make
            # cookie-backed refresh requests fail with a misleading 403.
            origins = [
                origin.strip().strip("\"'").rstrip("/")
                for origin in raw.split(",")
                if origin.strip()
            ]

        # The dev compose file can be opened through either hostname. Keep
        # this convenience strictly out of production, where the allowlist
        # must remain an explicit list of deployed frontend origins.
        if self.ENV.lower() in ("development", "dev", "local"):
            origins = list(dict.fromkeys([
                *origins,
                "http://localhost:3000",
                "http://localhost:5173",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:5173",
            ]))

        return origins

    @property
    def seed_admin_enabled(self) -> bool:
        if self.ENV.lower() in ("production", "prod", "staging"):
            return False
        flag = os.getenv("SEED_ADMIN_ENABLED", "").lower()
        if flag:
            return flag in ("true", "1", "yes")
        return self.ENV.lower() in ("development", "dev", "local")

    @property
    def auth_cookie_secure(self) -> bool:
        configured = os.getenv("AUTH_COOKIE_SECURE", "").strip().lower()
        if configured:
            return configured in ("true", "1", "yes", "on")
        return self.ENV.lower() in ("production", "prod", "staging")

settings = Settings()

