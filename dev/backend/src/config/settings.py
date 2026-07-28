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

settings = Settings()

