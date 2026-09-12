import os

class Settings:
    # Database Config
    PG_USER = os.getenv("PG_USER", "postgres")
    PG_PASSWORD = os.getenv("PG_PASSWORD", "123")
    PG_HOST = os.getenv("PG_HOST", "localhost")
    PG_PORT = os.getenv("PG_PORT", "5432")
    PG_DATABASE = os.getenv("PG_DATABASE", "bachkhoa_erp")

    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql://{self.PG_USER}:{self.PG_PASSWORD}@{self.PG_HOST}:{self.PG_PORT}/{self.PG_DATABASE}"
    
    # Secrets & API Keys
    SECRET_KEY = os.getenv("SECRET_KEY", "super_secret_key_change_in_prod")
    ZALO_ACCESS_TOKEN = os.getenv("ZALO_ACCESS_TOKEN", "")
    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
    
    # App Settings
    ENV = os.getenv("ENV", "development")

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
            return [
                "http://localhost:3000",
                "http://localhost:5173",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:5173",
            ]
        if raw == "*":
            return ["*"]
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    @property
    def seed_admin_enabled(self) -> bool:
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

