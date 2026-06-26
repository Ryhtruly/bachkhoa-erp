import os

class Settings:
    # Database Config
    PG_USER = os.getenv("PG_USER", "postgres")
    PG_PASSWORD = os.getenv("PG_PASSWORD", "123")
    PG_HOST = os.getenv("PG_HOST", "localhost")
    PG_PORT = os.getenv("PG_PORT", "5432")
    PG_DATABASE = os.getenv("PG_DATABASE", "bachkhoa_erp")
    
    # Secrets & API Keys
    SECRET_KEY = os.getenv("SECRET_KEY", "super_secret_key")
    ZALO_ACCESS_TOKEN = os.getenv("ZALO_ACCESS_TOKEN", "")
    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
    
    # App Settings
    ENV = os.getenv("ENV", "development")

settings = Settings()
