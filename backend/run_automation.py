#!/usr/bin/env python3
"""
StayVista Automated Reconciliation & Free Office Email Dispatcher CLI.

Usage:
  # 1. Watch incoming folder continuously (auto-reconciles & emails when sheets dropped):
  python backend/run_automation.py --watch

  # 2. Process incoming sheets once and exit:
  python backend/run_automation.py --once

  # 3. Process specific data sheet(s) right now:
  python backend/run_automation.py --files data/SU__Cancelled_Bookings.xlsx

  # 4. Test office email sending connection:
  python backend/run_automation.py --test-email ops@stayvista.com
"""

import sys
import os
import argparse
from pathlib import Path

# Ensure backend directory is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.core.config import settings
from app.core.database import SessionLocal
from app.services.email_service import send_test_email
from app.services.slack_service import send_slack_test_ping
from app.services.automation_service import (
    run_reconciliation_and_dispatch,
    watch_and_auto_reconcile
)


def main():
    parser = argparse.ArgumentParser(
        description="StayVista Automated Reconciliation, Office Email & Slack Dispatcher",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python backend/run_automation.py --watch
  python backend/run_automation.py --once
  python backend/run_automation.py --files data/SU__Cancelled_Bookings.xlsx data/ota_reservation_180day_report_1107_2026-09-24.xls
  python backend/run_automation.py --test-email ops@stayvista.com
  python backend/run_automation.py --test-slack
        """
    )
    parser.add_argument("--watch", action="store_true", help="Start continuous folder watcher daemon")
    parser.add_argument("--once", action="store_true", help="Scan watch folder once, reconcile & email/slack, then exit")
    parser.add_argument("--files", nargs="+", help="Specific data sheet path(s) to reconcile and dispatch immediately")
    parser.add_argument("--recipients", type=str, help="Comma-separated recipient emails (overrides RECIPIENT_EMAILS in .env)")
    parser.add_argument("--watch-dir", type=str, help="Directory to watch (defaults to data/incoming)")
    parser.add_argument("--test-email", type=str, help="Send a test verification email to this address to verify office SMTP")
    parser.add_argument("--test-slack", action="store_true", help="Send a test verification ping to the configured Slack channel")
    parser.add_argument("--no-email", action="store_true", help="Run reconciliation only without sending emails")

    args = parser.parse_args()

    # If --test-slack passed
    if args.test_slack:
        print(f"Testing Slack webhook connection ({settings.SLACK_CHANNEL})...")
        res = send_slack_test_ping()
        print("Result:", res)
        sys.exit(0 if res.get("status") == "success" else 1)

    # If --test-email passed
    if args.test_email:
        print(f"Testing office SMTP connection to {args.test_email}...")
        res = send_test_email(args.test_email)
        print("Result:", res)
        sys.exit(0 if res.get("status") == "success" else 1)

    db = SessionLocal()

    # Explicit files passed
    if args.files:
        print(f"Processing {len(args.files)} specified file(s)...")
        recips = [e.strip() for e in args.recipients.split(",")] if args.recipients else None
        res = run_reconciliation_and_dispatch(
            file_paths=args.files,
            recipient_emails=recips,
            send_email=not args.no_email,
            db=db
        )
        print("\n=== RECONCILIATION SUMMARY ===")
        print(f"Batch ID: {res['batch_id']}")
        print(f"Processed Files: {res['processed_files']}")
        print(f"Primary Metrics: {res['primary_metrics']}")
        print(f"Tab Counts: {res['tab_counts']}")
        if res.get("email_dispatch"):
            print(f"Email Dispatch: {res['email_dispatch']}")
        sys.exit(0)

    # Process watch folder once
    if args.once:
        w_dir = Path(args.watch_dir) if args.watch_dir else None
        recips = [e.strip() for e in args.recipients.split(",")] if args.recipients else None
        res = watch_and_auto_reconcile(
            watch_folder=w_dir,
            run_once=True,
            recipient_emails=recips,
            db=db
        )
        sys.exit(0)

    # Continuous Watch Mode (default if --watch or no other action specified)
    w_dir = Path(args.watch_dir) if args.watch_dir else None
    recips = [e.strip() for e in args.recipients.split(",")] if args.recipients else None
    watch_and_auto_reconcile(
        watch_folder=w_dir,
        run_once=False,
        recipient_emails=recips,
        db=db
    )


if __name__ == "__main__":
    main()
