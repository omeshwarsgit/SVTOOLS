import os
from pathlib import Path
from typing import Optional

BASE_DIR = Path(__file__).resolve().parent.parent

# Attempt to load .env manually if python-dotenv is not installed
def load_env_file(filepath: Path):
    if not filepath.exists():
        return
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip().strip("'").strip('"')
            if key and key not in os.environ:
                os.environ[key] = val

load_env_file(BASE_DIR / ".env")
load_env_file(BASE_DIR / ".env.local")

class SlackConfig:
    # Slack Webhook configuration
    WEBHOOK_URL: str = os.environ.get("SLACK_WEBHOOK_URL", "").strip()
    CHANNEL: str = os.environ.get("SLACK_CHANNEL", "#reconciliation-alerts").strip()
    BOT_NAME: str = os.environ.get("SLACK_BOT_NAME", "StayVista Reconciliation Engine").strip()
    BOT_ICON_EMOJI: str = os.environ.get("SLACK_BOT_ICON_EMOJI", ":stayvista:").strip()
    
    # Alert urgency settings
    NOTIFY_ON_ZERO_DISCREPANCIES: bool = os.environ.get("SLACK_NOTIFY_ON_ZERO", "true").lower() == "true"
    MENTION_CHANNEL_ON_CRITICAL: bool = os.environ.get("SLACK_MENTION_CHANNEL", "false").lower() == "true"
    MAX_ACTION_ITEMS_PER_ALERT: int = int(os.environ.get("SLACK_MAX_ITEMS", "8"))
    
    # Paths
    BASE_DIR: Path = BASE_DIR
    DATA_DIR: Path = BASE_DIR / "data"
    WATCH_FOLDER: Path = BASE_DIR / "data" / "incoming"
    ARCHIVE_DIR: Path = BASE_DIR / "archives" / "slack"

config = SlackConfig()
os.makedirs(config.ARCHIVE_DIR, exist_ok=True)
