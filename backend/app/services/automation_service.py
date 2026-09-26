import os
import shutil
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.services.reconciler import reconcile_uploaded_files, reconcile_mis_workbook
from app.services.email_service import send_reconciliation_email, parse_recipient_list
from app.services.slack_service import send_slack_alert
from app.models.schemas import MISDashboardData


SUPPORTED_EXTENSIONS = {".xlsx", ".xls", ".csv"}


def is_file_ready(file_path: Path, wait_seconds: float = 1.0) -> bool:
    """Check if a file has finished writing by verifying size stability."""
    try:
        initial_size = file_path.stat().st_size
        time.sleep(wait_seconds)
        current_size = file_path.stat().st_size
        return initial_size == current_size and initial_size > 0
    except Exception:
        return False


def run_reconciliation_and_dispatch(
    files: Optional[List[Tuple[str, bytes]]] = None,
    file_paths: Optional[List[Union[str, Path]]] = None,
    recipient_emails: Optional[List[str]] = None,
    send_email: bool = True,
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """
    Ingest data sheets, execute full reconciliation operations, generate
    executive multi-tab Excel reports, and shoot the email to all recipients.
    """
    owns_db = False
    if db is None:
        db = SessionLocal()
        owns_db = True

    try:
        # 1. Resolve payloads
        file_payloads: List[Tuple[str, bytes]] = []

        if files:
            file_payloads = files
        elif file_paths:
            for fp in file_paths:
                p = Path(fp)
                if p.exists() and p.suffix.lower() in SUPPORTED_EXTENSIONS:
                    with open(p, "rb") as f:
                        file_payloads.append((p.name, f.read()))

        # Fallback to default files if none supplied
        if not file_payloads:
            if settings.DEFAULT_SU_PATH.exists():
                with open(settings.DEFAULT_SU_PATH, "rb") as f:
                    file_payloads.append((settings.DEFAULT_SU_PATH.name, f.read()))
            else:
                raise FileNotFoundError("No input data sheets provided and default SU workbook not found.")

        # 2. Run Reconciliation Engine
        mis_data: MISDashboardData = reconcile_uploaded_files(file_payloads, db=db)

        # 3. Dispatch Email if requested
        email_result = None
        if send_email:
            email_result = send_reconciliation_email(
                mis_data=mis_data,
                recipient_emails=recipient_emails,
                dry_run_if_no_smtp=True
            )

        # 4. Dispatch Slack Alert
        slack_result = send_slack_alert(mis_data=mis_data)

        return {
            "status": "success",
            "batch_id": mis_data.batch_id,
            "processed_files": [fname for fname, _ in file_payloads],
            "primary_metrics": mis_data.primary_metrics.model_dump(),
            "tab_counts": mis_data.tab_counts,
            "email_dispatch": email_result,
            "slack_dispatch": slack_result,
            "timestamp": datetime.now().isoformat()
        }
    finally:
        if owns_db and db:
            db.close()


def process_incoming_batch(
    incoming_files: List[Path],
    watch_folder: Path,
    processed_folder: Path,
    recipient_emails: Optional[List[str]] = None,
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """Process a discovered batch of incoming spreadsheet files and move them to archive."""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Processing batch of {len(incoming_files)} file(s): {[f.name for f in incoming_files]}")
    
    file_payloads: List[Tuple[str, bytes]] = []
    for fp in incoming_files:
        with open(fp, "rb") as f:
            file_payloads.append((fp.name, f.read()))

    # Run reconciliation & email
    result = run_reconciliation_and_dispatch(
        files=file_payloads,
        recipient_emails=recipient_emails,
        send_email=True,
        db=db
    )

    # Move processed files to processed/timestamp_batch_id
    batch_stamp = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{result['batch_id'][:8]}"
    archive_batch_dir = processed_folder / batch_stamp
    archive_batch_dir.mkdir(parents=True, exist_ok=True)

    for fp in incoming_files:
        try:
            dest = archive_batch_dir / fp.name
            shutil.move(str(fp), str(dest))
            print(f"  -> Archived: {fp.name} to {dest.name}")
        except Exception as e:
            print(f"  -> Warning: could not move {fp.name}: {e}")

    result["archived_folder"] = str(archive_batch_dir)
    return result


def watch_and_auto_reconcile(
    watch_folder: Optional[Path] = None,
    processed_folder: Optional[Path] = None,
    poll_interval: Optional[int] = None,
    run_once: bool = False,
    recipient_emails: Optional[List[str]] = None,
    db: Optional[Session] = None
) -> Optional[Dict[str, Any]]:
    """
    Automated Folder Watcher Daemon.
    Monitors the watch folder for incoming sheets (.xlsx, .xls, .csv).
    Automatically runs operations and fires emails to everyone.
    """
    watch_dir = Path(watch_folder or settings.WATCH_FOLDER)
    proc_dir = Path(processed_folder or settings.PROCESSED_FOLDER)
    interval = poll_interval or settings.POLL_INTERVAL_SECONDS

    watch_dir.mkdir(parents=True, exist_ok=True)
    proc_dir.mkdir(parents=True, exist_ok=True)

    print(f"=======================================================")
    print(f"  StayVista Automated Reconciliation & Email Watcher")
    print(f"=======================================================")
    print(f"Watching folder : {watch_dir}")
    print(f"Processed archive: {proc_dir}")
    print(f"Poll interval   : {interval}s")
    recipients = parse_recipient_list(recipient_emails or settings.RECIPIENT_EMAILS)
    print(f"Recipients ({len(recipients)}): {', '.join(recipients) if recipients else 'None configured (will dry-run/archive)'}")
    print(f"Mode            : {'Single-run' if run_once else 'Continuous Watcher'}")
    print(f"=======================================================\n")

    last_result = None

    while True:
        try:
            # Find eligible spreadsheet files
            candidates = [
                p for p in watch_dir.iterdir()
                if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS and not p.name.startswith("~$") and not p.name.startswith(".")
            ]

            if candidates:
                # Wait until all candidates are stable (fully written)
                ready_files = []
                for p in candidates:
                    if is_file_ready(p, wait_seconds=0.5):
                        ready_files.append(p)

                if ready_files:
                    last_result = process_incoming_batch(
                        incoming_files=ready_files,
                        watch_folder=watch_dir,
                        processed_folder=proc_dir,
                        recipient_emails=recipient_emails,
                        db=db
                    )
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] Batch complete! Matched: {last_result['primary_metrics']['matched']} | Cancellation Pending: {last_result['primary_metrics']['cancellation_pending']}")
                    if last_result.get("email_dispatch"):
                        ed = last_result["email_dispatch"]
                        print(f"  Email Status: {ed.get('status')} - {ed.get('message')}")

            if run_once:
                if not candidates:
                    print("No incoming files found in watch folder.")
                break

            time.sleep(interval)

        except KeyboardInterrupt:
            print("\nStopping folder watcher.")
            break
        except Exception as e:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Error in watcher: {e}")
            if run_once:
                raise
            time.sleep(interval)

    return last_result
