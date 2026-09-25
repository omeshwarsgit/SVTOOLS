import os
from pathlib import Path
from pydantic_settings import BaseSettings

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
ARCHIVES_DIR = BASE_DIR / "archives" / "exports"
DATA_DIR = BASE_DIR / "data"

class Settings(BaseSettings):
    PROJECT_NAME: str = "StayVista PMS & OTA Reconciliation Engine"
    API_V1_STR: str = "/api/v1"
    
    BASE_DIR: Path = BASE_DIR
    BACKEND_DIR: Path = BACKEND_DIR
    
    # Database
    DATABASE_URL: str = f"sqlite:///{BACKEND_DIR}/reconciliation.db"
    
    # Storage paths
    ARCHIVES_DIR: Path = ARCHIVES_DIR
    DATA_DIR: Path = DATA_DIR
    
    # Default master registry file path
    MASTER_REGISTRY_PATH: Path = DATA_DIR / "Stayvista Property Links.xlsx"
    DEFAULT_SU_PATH: Path = DATA_DIR / "SU__Cancelled_Bookings.xlsx"
    DEFAULT_PMS_PATH: Path = DATA_DIR / "ota_reservation_180day_report_1107_2026-09-24.xls"
    
    class Config:
        case_sensitive = True

settings = Settings()

# Ensure directories exist
os.makedirs(settings.ARCHIVES_DIR, exist_ok=True)
os.makedirs(settings.DATA_DIR, exist_ok=True)
