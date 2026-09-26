#!/usr/bin/env python3
"""
StayVista Continuous Slack Watcher Daemon.
Monitors data/incoming/ for new booking dumps, automatically runs
reconciliation operations, and broadcasts real-time alerts into Slack.
"""

import sys
import time
import shutil
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = BASE_DIR / "backend"
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from slack_automation.config import config
from slack_automation.dispatcher import dispatch_from_file

SUPPORTED_EXTENSIONS = {".xlsx", ".xls", ".csv"}


def is_file_ready(file_path: Path, wait_seconds: float = 0.8) -> bool:
    try:
        s1 = file_path.stat().st_size
        time.sleep(wait_seconds)
        s2 = file_path.stat().st_size
        return s1 == s2 and s1 > 0
    except Exception:
        return False


def main():
    watch_dir = config.WATCH_FOLDER
    proc_dir = BASE_DIR / "data" / "processed"
    watch_dir.mkdir(parents=True, exist_ok=True)
    proc_dir.mkdir(parents=True, exist_ok=True)

    print("==================================================")
    print("  StayVista Autonomous Slack Watcher Daemon")
    print("==================================================")
    print(f"Monitoring folder : {watch_dir}")
    print(f"Target channel    : {config.CHANNEL}")
    print(f"Poll interval     : 5s")
    print("==================================================\n")

    run_once = "--once" in sys.argv

    while True:
        try:
            candidates = [
                p for p in watch_dir.iterdir()
                if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS and not p.name.startswith((".", "~$"))
            ]

            if candidates:
                ready_files = [p for p in candidates if is_file_ready(p)]
                if ready_files:
                    target_file = ready_files[0]
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] Detected: {target_file.name}")
                    
                    # Dispatch to Slack
                    res = dispatch_from_file(target_file)
                    print(f"  Result: {res.get('status')} - {res.get('message')}")

                    # Archive
                    dest_dir = proc_dir / f"slack_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                    dest_dir.mkdir(parents=True, exist_ok=True)
                    for f in ready_files:
                        shutil.move(str(f), str(dest_dir / f.name))
                    print(f"  Archived to: {dest_dir.name}\n")

            if run_once:
                break

            time.sleep(5)

        except KeyboardInterrupt:
            print("\nShutting down Slack watcher.")
            break
        except Exception as e:
            print(f"Error in watcher loop: {e}")
            if run_once:
                raise
            time.sleep(5)


if __name__ == "__main__":
    main()
