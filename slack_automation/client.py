import os
import json
import urllib.request
import urllib.error
from datetime import datetime, date
from pathlib import Path
from typing import Dict, Any, List, Optional

from slack_automation.config import config
from slack_automation.templates.alert_blocks import build_test_blocks


class SlackClient:
    """
    Production Slack client for sending alerts via Slack Incoming Webhook.
    Built entirely on standard Python urllib (no external dependencies required).
    """

    def __init__(self, webhook_url: Optional[str] = None):
        self.webhook_url = (webhook_url or config.WEBHOOK_URL or "").strip()

    def is_configured(self) -> bool:
        return bool(self.webhook_url and self.webhook_url.startswith("https://hooks.slack.com"))

    def send_blocks(
        self,
        blocks: List[Dict[str, Any]],
        fallback_text: str = "StayVista Reconciliation Alert",
        batch_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Send formatted Slack Block Kit payload to the configured webhook."""
        payload = {
            "text": fallback_text,
            "blocks": blocks,
            "username": config.BOT_NAME,
            "icon_emoji": config.BOT_ICON_EMOJI,
        }

        # If not configured, archive locally in dry-run mode
        if not self.is_configured():
            return self._archive_dry_run(payload, batch_id=batch_id, reason="SLACK_WEBHOOK_URL not configured")

        try:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                self.webhook_url,
                data=data,
                headers={"Content-Type": "application/json; charset=utf-8"}
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read().decode("utf-8")
                if resp.status == 200 and body.strip().lower() == "ok":
                    self._archive_dry_run(payload, batch_id=batch_id, reason="Dispatched to live Slack channel")
                    return {
                        "status": "success",
                        "message": "Slack notification successfully posted to channel.",
                        "channel": config.CHANNEL,
                        "batch_id": batch_id,
                        "timestamp": datetime.now().isoformat()
                    }
                else:
                    return {
                        "status": "error",
                        "message": f"Slack responded with unexpected body: {body}"
                    }
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8") if e.fp else str(e)
            return {
                "status": "error",
                "message": f"Slack webhook HTTP error {e.code}: {err_msg}"
            }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Slack transmission failed: {str(e)}"
            }

    def send_test_message(self) -> Dict[str, Any]:
        """Send a test verification card to the Slack channel."""
        blocks = build_test_blocks()
        return self.send_blocks(blocks, fallback_text="StayVista Slack Connection Test", batch_id="test_ping")

    def _archive_dry_run(self, payload: Dict[str, Any], batch_id: Optional[str], reason: str) -> Dict[str, Any]:
        """Save a copy of the payload to archives/slack/."""
        today_str = date.today().strftime("%Y-%m-%d")
        b_id = (batch_id or "adhoc")[:8]
        out_file = config.ARCHIVE_DIR / f"slack_payload_{today_str}_{b_id}.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        return {
            "status": "dry_run_saved",
            "message": f"Slack payload saved locally ({reason}).",
            "saved_path": str(out_file)
        }
