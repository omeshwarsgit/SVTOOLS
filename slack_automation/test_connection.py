#!/usr/bin/env python3
"""
StayVista Slack Connection Test Script.
Sends a test verification card to the configured Slack channel.
"""

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from slack_automation.config import config
from slack_automation.client import SlackClient


def main():
    print("==================================================")
    print("  StayVista Slack Webhook Connection Test")
    print("==================================================")
    print(f"Target Channel : {config.CHANNEL}")
    
    masked_url = "Not configured"
    if config.WEBHOOK_URL:
        parts = config.WEBHOOK_URL.split("/")
        masked_url = f"{'/'.join(parts[:5])}/.../{parts[-1][:5]}***"
    print(f"Webhook URL    : {masked_url}")
    print("==================================================\n")

    if not config.WEBHOOK_URL:
        print("❌ Error: SLACK_WEBHOOK_URL is not configured in .env.")
        print("Please add your Slack Incoming Webhook URL to .env:\n")
        print("  SLACK_WEBHOOK_URL=YOUR_SLACK_WEBHOOK_URL_HERE")
        print("  SLACK_CHANNEL=#reconciliation-alerts\n")
        sys.exit(1)

    print("Transmitting verification card to Slack...")
    client = SlackClient()
    res = client.send_test_message()

    if res.get("status") == "success":
        print(f"\n🎉 SUCCESS! Test message posted to {config.CHANNEL}!")
        print("Check your Slack channel to see the confirmation card.\n")
        sys.exit(0)
    else:
        print(f"\n❌ FAILED: {res.get('message')}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
