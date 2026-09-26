#!/usr/bin/env python3
"""
StayVista Slack Alert Dispatcher.
Ingests reconciliation datasets, builds Slack Block Kit cards with @RM tagging,
and transmits alerts directly into your Slack channel.
"""

import sys
import os
import argparse
from pathlib import Path

# Ensure workspace root and backend are in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = BASE_DIR / "backend"
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from slack_automation.config import config
from slack_automation.client import SlackClient
from slack_automation.templates.alert_blocks import build_mis_alert_blocks

from app.core.database import SessionLocal
from app.services.reconciler import reconcile_uploaded_files, reconcile_mis_workbook
from app.models.schemas import MISDashboardData


def dispatch_slack_from_mis_data(mis_data: MISDashboardData, webhook_url: str = None) -> dict:
    """Extract metrics from MISDashboardData and transmit Slack Block Kit alert."""
    client = SlackClient(webhook_url=webhook_url)

    pending_items = [
        it.model_dump() for it in mis_data.tabs_data.get("cancellation_pending", [])
    ]

    blocks = build_mis_alert_blocks(
        primary_metrics=mis_data.primary_metrics.model_dump(),
        secondary_metrics=mis_data.secondary_metrics.model_dump(),
        tab_counts=mis_data.tab_counts,
        pending_items=pending_items,
        batch_id=mis_data.batch_id,
        max_items=config.MAX_ACTION_ITEMS_PER_ALERT,
        mention_channel=config.MENTION_CHANNEL_ON_CRITICAL
    )

    fallback_text = (
        f"StayVista Reconciliation MIS: {mis_data.primary_metrics.total_bookings} bookings, "
        f"{mis_data.primary_metrics.cancellation_pending} pending cancellations."
    )

    res = client.send_blocks(blocks, fallback_text=fallback_text, batch_id=mis_data.batch_id)
    return res


def dispatch_from_file(file_path: Path, webhook_url: str = None) -> dict:
    """Run reconciliation on a given file and dispatch alert."""
    print(f"Reconciling '{file_path.name}'...")
    db = SessionLocal()
    try:
        mis_data = reconcile_mis_workbook(file_path, db=db, filename=file_path.name)
        print(f"  Batch ID: {mis_data.batch_id}")
        print(f"  Total SU: {mis_data.primary_metrics.total_bookings} | Matched: {mis_data.primary_metrics.matched}")
        print(f"  Cancellation Pending: {mis_data.primary_metrics.cancellation_pending}")

        res = dispatch_slack_from_mis_data(mis_data, webhook_url=webhook_url)
        return res
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Dispatch StayVista Reconciliation Alerts to Slack")
    parser.add_argument("--file", type=str, help="Path to SU / PMS sheet to reconcile and broadcast")
    parser.add_argument("--webhook", type=str, help="Override SLACK_WEBHOOK_URL")
    parser.add_argument("--latest", action="store_true", help="Reconcile default daily dataset and broadcast")

    args = parser.parse_args()

    target_file = None
    if args.file:
        target_file = Path(args.file)
    elif args.latest or len(sys.argv) == 1:
        target_file = config.DATA_DIR / "SU__Cancelled_Bookings.xlsx"

    if not target_file or not target_file.exists():
        print(f"Error: File not found at {target_file}")
        sys.exit(1)

    res = dispatch_from_file(target_file, webhook_url=args.webhook)
    print("\nSlack Dispatch Result:", res)
    if res.get("status") == "success":
        print(f"✔ Alert posted successfully to {res.get('channel')}!")
    elif res.get("status") == "dry_run_saved":
        print(f"ℹ Dry run saved to {res.get('saved_path')}")
    else:
        print(f"✖ Failed: {res.get('message')}")
        sys.exit(1)


if __name__ == "__main__":
    main()
