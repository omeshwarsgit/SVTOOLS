import os
from pathlib import Path
from pydantic_settings import BaseSettings

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
ARCHIVES_DIR = BASE_DIR / "archives" / "exports"
DATA_DIR = BASE_DIR / "data"

def resolve_database_url() -> str:
    url = (
        os.environ.get("DATABASE_URL")
        or os.environ.get("POSTGRES_URL")
        or os.environ.get("SUPABASE_DB_URL")
        or f"sqlite:///{BACKEND_DIR}/reconciliation.db"
    )
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url

class Settings(BaseSettings):
    PROJECT_NAME: str = "StayVista PMS & OTA Reconciliation Engine"
    API_V1_STR: str = "/api/v1"
    
    BASE_DIR: Path = BASE_DIR
    BACKEND_DIR: Path = BACKEND_DIR
    
    # Database
    DATABASE_URL: str = resolve_database_url()
    
    # Storage paths
    ARCHIVES_DIR: Path = ARCHIVES_DIR
    DATA_DIR: Path = DATA_DIR
    
    # Default master registry file path
    MASTER_REGISTRY_PATH: Path = DATA_DIR / "Stayvista Property Links.xlsx"
    DEFAULT_SU_PATH: Path = DATA_DIR / "SU__Cancelled_Bookings.xlsx"
    DEFAULT_PMS_PATH: Path = DATA_DIR / "ota_reservation_180day_report_1107_2026-09-24.xls"
    
    # Email & Automation Configuration (Free Gmail / Custom SMTP)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_NAME: str = "StayVista Reconciliation Engine"
    SMTP_USE_TLS: bool = True
    RECIPIENT_EMAILS: str = ""  # Comma-separated list of recipient emails: "ops@stayvista.com, team@stayvista.com"

    # Slack Integration Configuration (Free Incoming Webhook or Channel Email)
    SLACK_WEBHOOK_URL: str = ""
    SLACK_CHANNEL: str = "#reconciliation-alerts"

    # Automation & Watcher settings
    WATCH_FOLDER: Path = DATA_DIR / "incoming"
    PROCESSED_FOLDER: Path = DATA_DIR / "processed"
    POLL_INTERVAL_SECONDS: int = 5

    model_config = {
        "case_sensitive": True,
        "env_file": [str(BASE_DIR / ".env"), str(BASE_DIR / ".env.local")],
        "extra": "ignore",
    }

settings = Settings()

# Ensure directories exist if filesystem is writable
try:
    os.makedirs(settings.ARCHIVES_DIR, exist_ok=True)
    os.makedirs(settings.DATA_DIR, exist_ok=True)
    os.makedirs(settings.WATCH_FOLDER, exist_ok=True)
    os.makedirs(settings.PROCESSED_FOLDER, exist_ok=True)
except Exception:
    pass
