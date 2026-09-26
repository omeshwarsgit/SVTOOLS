import sys
import os
import io
import csv
import shutil
import subprocess
from datetime import date, datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
import openpyxl
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc

from app.core.config import settings
from app.core.database import get_db
from app.models.schemas import (
    PropertyMaster,
    PropertyRepresentative,
    ReconciliationBatch,
    Discrepancy,
    Reservation,
    BatchOverview,
    BatchListItem,
    DiscrepancyListResponse,
    DiscrepancyItem,
    ReconciliationMatrix,
    MatrixRow,
    AlertSummary,
    MISDashboardData,
)
from app.services.parser import (
    read_tabular_file, 
    extract_reconciliation_dfs, 
    detect_dataset_type,
    clean_date,
    clean_int,
    normalize_channel,
)
from app.services.reconciler import (
    reconcile_datasets, 
    reconcile_mis_workbook, 
    reconcile_uploaded_files,
    CHANNELS,
)
from app.services.exporter import generate_claude_export
from app.services.seeder import seed_master_registry

router = APIRouter()

# In-memory cache of latest MIS state
_LATEST_MIS_DATA: Optional[MISDashboardData] = None


def get_user_downloads_dir() -> Path:
    """Safely resolve user Downloads directory across any macOS/Linux environment."""
    d = Path.home() / "Downloads"
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.get("/health")
def health_check(db: Session = Depends(get_db)):
    prop_count = db.query(PropertyMaster).count()
    rep_count = db.query(PropertyRepresentative).count()
    batch_count = db.query(ReconciliationBatch).count()
    return {
        "status": "healthy",
        "properties_count": prop_count,
        "representatives_count": rep_count,
        "historical_batches_count": batch_count,
    }


@router.get("/files/workspace")
def list_workspace_files():
    """List available local workbook and export files that the user can navigate, open, or select."""
    files_list = []
    seen_paths = set()

    # 1. Project Data dir
    if os.path.exists(settings.DATA_DIR):
        for f in sorted(os.listdir(settings.DATA_DIR)):
            if f.endswith((".xlsx", ".xls", ".csv")) and not f.startswith("~$"):
                fp = settings.DATA_DIR / f
                if str(fp) in seen_paths:
                    continue
                seen_paths.add(str(fp))
                stat = fp.stat()
                ext = fp.suffix.lower()
                sheets = []
                try:
                    dfs = read_tabular_file(fp, filename=f)
                    sheets = list(dfs.keys())
                except Exception:
                    pass

                files_list.append({
                    "name": f,
                    "path": str(fp),
                    "size_kb": round(stat.st_size / 1024, 1),
                    "extension": ext,
                    "source": "Project Data",
                    "sheets": sheets,
                    "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
                })

    # 2. Archives / Exports dir
    if os.path.exists(settings.ARCHIVES_DIR):
        for f in sorted(os.listdir(settings.ARCHIVES_DIR), reverse=True):
            if f.endswith((".xlsx", ".xls", ".csv")) and not f.startswith("~$"):
                fp = settings.ARCHIVES_DIR / f
                if str(fp) in seen_paths:
                    continue
                seen_paths.add(str(fp))
                stat = fp.stat()
                files_list.append({
                    "name": f,
                    "path": str(fp),
                    "size_kb": round(stat.st_size / 1024, 1),
                    "extension": fp.suffix.lower(),
                    "source": "Export Archive",
                    "sheets": [],
                    "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
                })

    # 3. Downloads dir
    downloads = get_user_downloads_dir()
    if downloads.exists():
        for f in downloads.glob("*.xlsx"):
            if not f.name.startswith("~$") and ("su" in f.name.lower() or "stayvista" in f.name.lower() or "ota" in f.name.lower()):
                if str(f) in seen_paths:
                    continue
                seen_paths.add(str(f))
                stat = f.stat()
                files_list.append({
                    "name": f.name,
                    "path": str(f),
                    "size_kb": round(stat.st_size / 1024, 1),
                    "extension": f.suffix.lower(),
                    "source": "Downloads",
                    "sheets": [],
                    "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
                })

    return files_list


@router.get("/files/preview")
def preview_file(
    file_path: str = Query(..., description="Path to file to preview"),
    sheet_name: Optional[str] = Query(None, description="Sheet name for Excel workbooks"),
):
    """
    Open and inspect any workspace file directly in the browser.
    Returns sheet list, columns, and first 100 rows.
    Supports XLSX, corrupted XLS (via xlrd), and CSV.
    """
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

    try:
        sheets_dict = read_tabular_file(file_path, filename=Path(file_path).name)
        sheet_names = list(sheets_dict.keys())
        active_sheet = sheet_name if sheet_name and sheet_name in sheets_dict else sheet_names[0]
        df = sheets_dict[active_sheet].head(100)

        # Clean NaN values for JSON serialization
        df = df.fillna("")
        columns = [str(c) for c in df.columns]
        rows = df.to_dict(orient="records")

        return {
            "file_name": os.path.basename(file_path),
            "file_path": file_path,
            "sheets": sheet_names,
            "active_sheet": active_sheet,
            "columns": columns,
            "rows": rows,
            "preview_count": len(rows),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open file: {str(e)}")


@router.post("/files/open-system")
def open_file_in_system(
    file_path: str = Query(..., description="Path to file"),
    action: str = Query("open", description="'open' to launch in Excel/Numbers, 'reveal' to show in Finder"),
):
    """
    Open file in macOS default application (e.g. Microsoft Excel or Numbers)
    or reveal in macOS Finder.
    """
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

    try:
        if action == "reveal":
            subprocess.run(["open", "-R", file_path], check=True)
            return {"status": "success", "message": f"Revealed in Finder: {os.path.basename(file_path)}"}
        else:
            subprocess.run(["open", file_path], check=True)
            return {"status": "success", "message": f"Opened in system app: {os.path.basename(file_path)}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open file in system: {str(e)}")


@router.get("/files/download")
def download_workspace_file(file_path: str = Query(...)):
    """Directly download any workspace file with proper streaming headers."""
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

    filename = os.path.basename(file_path)
    ext = Path(file_path).suffix.lower()
    media_type = "application/octet-stream"
    if ext == ".xlsx":
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif ext == ".xls":
        media_type = "application/vnd.ms-excel"
    elif ext == ".csv":
        media_type = "text/csv; charset=utf-8"

    with open(file_path, "rb") as f:
        content = f.read()

    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": media_type,
            "Access-Control-Expose-Headers": "Content-Disposition",
        }
    )


@router.get("/mis/latest", response_model=MISDashboardData)
def get_latest_mis(refresh: bool = Query(False), db: Session = Depends(get_db)):
    """Fetch the latest SU – PMS Booking Reconciliation MIS dataset."""
    global _LATEST_MIS_DATA
    if _LATEST_MIS_DATA is None or refresh:
        su_path = settings.DEFAULT_SU_PATH
        if not os.path.exists(su_path):
            downloads_file = get_user_downloads_dir() / "SU__Cancelled_Bookings.xlsx"
            if os.path.exists(downloads_file):
                su_path = downloads_file

        if os.path.exists(su_path):
            with open(su_path, "rb") as f:
                content = f.read()
            _LATEST_MIS_DATA = reconcile_mis_workbook(content, db=db, filename=Path(su_path).name)
        else:
            raise HTTPException(status_code=404, detail="Default workbook not found on server")

    return _LATEST_MIS_DATA


@router.post("/mis/process", response_model=MISDashboardData)
async def process_mis_files(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    """
    Ingest and reconcile one or more uploaded files:
    - Single combined workbook with SU / Query Dump / Base Dump sheets (.xlsx, .xls)
    - Separate SU file and PMS Base/Report files (.xlsx, .xls, .csv)
    - Standalone CSV or XLS dumps
    """
    global _LATEST_MIS_DATA

    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded. Please select one or more files.")

    file_payloads: List[tuple[str, bytes]] = []
    for f in files:
        if f.filename:
            content = await f.read()
            file_payloads.append((f.filename, content))

    if not file_payloads:
        raise HTTPException(status_code=400, detail="Uploaded files were empty.")

    try:
        res = reconcile_uploaded_files(file_payloads, db=db)
        _LATEST_MIS_DATA = res
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to reconcile uploaded files: {str(e)}")


@router.post("/mis/select-file", response_model=MISDashboardData)
def select_file_from_workspace(file_path: str = Query(...), db: Session = Depends(get_db)):
    """Process a selected workspace/local file directly (handles single workbooks, PMS reports, CSVs, etc.)."""
    global _LATEST_MIS_DATA
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

    with open(file_path, "rb") as f:
        content = f.read()

    fname = Path(file_path).name
    try:
        res = reconcile_uploaded_files([(fname, content)], db=db)
        _LATEST_MIS_DATA = res
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Reconciliation error for '{fname}': {str(e)}")


@router.get("/mis/export/{tab_name}")
def export_tab_data(
    tab_name: str,
    format: str = Query("csv", description="Format: csv or xlsx"),
    db: Session = Depends(get_db)
):
    """
    Export the records in a selected tab as clean CSV (with UTF-8-SIG BOM) or Excel (.xlsx).
    Guarantees seamless opening in Microsoft Excel and Apple Numbers without encoding errors.
    """
    global _LATEST_MIS_DATA
    if _LATEST_MIS_DATA is None:
        try:
            _LATEST_MIS_DATA = get_latest_mis(refresh=False, db=db)
        except Exception:
            pass

    items = _LATEST_MIS_DATA.tabs_data.get(tab_name, []) if _LATEST_MIS_DATA and _LATEST_MIS_DATA.tabs_data else []

    rows = []
    for it in items:
        rows.append({
            "Reservation_ID": it.reservation_id,
            "Vendor_Booking_ID": it.vendor_booking_id or "",
            "Guest_Name": it.guest_name or "",
            "Channel": it.channel,
            "SU_Status": it.su_status or "",
            "PMS_Status": it.pms_status or "",
            "Admin_Status": it.admin_status or "",
            "Property_ID": it.property_id or "",
            "Property_Name": it.property_name or "",
            "Assigned_Representative": it.assigned_representative or "Unassigned",
            "Target_Portal_URL": it.target_portal_url or "not available",
            "Check_In": it.check_in or "",
            "Check_Out": it.check_out or "",
            "Match_Type": it.match_type or "",
            "Notes": it.notes or "",
        })

    df = pd.DataFrame(rows)
    today_str = date.today().strftime("%Y%m%d")

    if format.lower() == "xlsx":
        filename = f"su_pms_{tab_name}_{today_str}.xlsx"
        out_excel = io.BytesIO()
        df.to_excel(out_excel, index=False, engine="openpyxl")
        excel_bytes = out_excel.getvalue()

        # Try optional local cache if filesystem writable
        try:
            archive_path = settings.ARCHIVES_DIR / filename
            with open(archive_path, "wb") as f:
                f.write(excel_bytes)
            downloads_path = get_user_downloads_dir() / filename
            shutil.copy(archive_path, downloads_path)
        except Exception:
            pass

        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Access-Control-Expose-Headers": "Content-Disposition",
            }
        )
    else:
        filename = f"su_pms_{tab_name}_{today_str}.csv"
        # UTF-8 with BOM (utf-8-sig) ensures Excel on Mac and Windows opens without error
        csv_bytes = df.to_csv(index=False, encoding="utf-8-sig").encode("utf-8-sig")

        try:
            archive_path = settings.ARCHIVES_DIR / filename
            with open(archive_path, "wb") as f:
                f.write(csv_bytes)
            downloads_path = get_user_downloads_dir() / filename
            shutil.copy(archive_path, downloads_path)
        except Exception:
            pass

        return Response(
            content=csv_bytes,
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Type": "text/csv; charset=utf-8",
                "Access-Control-Expose-Headers": "Content-Disposition",
            }
        )


@router.post("/mis/export-and-open")
def export_and_open_excel(
    tab_name: str = Query("cancellation_pending", description="Tab name"),
    format: str = Query("xlsx", description="Format: xlsx or csv"),
    db: Session = Depends(get_db)
):
    """
    Generate real .xlsx Excel workbook or .csv, save directly to ~/Downloads,
    and automatically launch Microsoft Excel / Numbers on macOS.
    """
    global _LATEST_MIS_DATA
    if _LATEST_MIS_DATA is None:
        try:
            _LATEST_MIS_DATA = get_latest_mis(refresh=False, db=db)
        except Exception:
            pass

    items = _LATEST_MIS_DATA.tabs_data.get(tab_name, []) if _LATEST_MIS_DATA and _LATEST_MIS_DATA.tabs_data else []
    rows = []
    for it in items:
        rows.append({
            "Reservation_ID": it.reservation_id,
            "Vendor_Booking_ID": it.vendor_booking_id or "",
            "Guest_Name": it.guest_name or "",
            "Channel": it.channel,
            "SU_Status": it.su_status or "",
            "PMS_Status": it.pms_status or "",
            "Admin_Status": it.admin_status or "",
            "Property_ID": it.property_id or "",
            "Property_Name": it.property_name or "",
            "Assigned_Representative": it.assigned_representative or "Unassigned",
            "Target_Portal_URL": it.target_portal_url or "not available",
            "Check_In": it.check_in or "",
            "Check_Out": it.check_out or "",
            "Match_Type": it.match_type or "",
            "Notes": it.notes or "",
        })

    df = pd.DataFrame(rows)
    today_str = date.today().strftime("%Y%m%d")
    downloads_dir = get_user_downloads_dir()
    
    try:
        os.makedirs(settings.ARCHIVES_DIR, exist_ok=True)
    except Exception:
        pass

    if format.lower() == "xlsx":
        filename = f"su_pms_{tab_name}_{today_str}.xlsx"
        archive_path = settings.ARCHIVES_DIR / filename
        downloads_path = downloads_dir / filename
        friendly_path = downloads_dir / f"su_pms_{tab_name}.xlsx"

        try:
            df.to_excel(archive_path, index=False, engine="openpyxl")
            shutil.copy(archive_path, downloads_path)
            shutil.copy(archive_path, friendly_path)
        except Exception:
            pass
    else:
        filename = f"su_pms_{tab_name}_{today_str}.csv"
        archive_path = settings.ARCHIVES_DIR / filename
        downloads_path = downloads_dir / filename
        friendly_path = downloads_dir / f"su_pms_{tab_name}.csv"

        try:
            csv_bytes = df.to_csv(index=False, encoding="utf-8-sig").encode("utf-8-sig")
            with open(archive_path, "wb") as f:
                f.write(csv_bytes)
            shutil.copy(archive_path, downloads_path)
            shutil.copy(archive_path, friendly_path)
        except Exception:
            pass

    # Launch in system spreadsheet app (macOS / Windows / Linux)
    opened = False
    try:
        if sys.platform == "darwin":
            subprocess.run(["open", str(downloads_path)], check=True)
            opened = True
        elif sys.platform == "win32":
            os.startfile(str(downloads_path))
            opened = True
        else:
            subprocess.run(["xdg-open", str(downloads_path)], check=True)
            opened = True
    except Exception:
        opened = False

    return {
        "status": "success",
        "file_name": filename,
        "format": format,
        "rows_count": len(rows),
        "downloads_path": str(downloads_path),
        "friendly_path": str(friendly_path),
        "opened_in_excel": opened,
        "message": f"Successfully created {format.upper()}{' and opened in system spreadsheet app' if opened else ''}."
    }


@router.get("/export/claude-payload")
def export_claude_payload(
    batch_id: Optional[str] = Query(None, description="Batch ID"),
    format: str = Query("csv", description="Format: csv or xlsx"),
    db: Session = Depends(get_db)
):
    """
    Generate Claude-optimized flat discrepancy CSV or Excel export with immutable archival.
    Works either from persisted DB batch or directly from live active MIS dashboard state.
    """
    global _LATEST_MIS_DATA
    try:
        # 1. Try DB export if batch exists in DB
        db_batch = None
        if batch_id:
            db_batch = db.query(ReconciliationBatch).filter(ReconciliationBatch.batch_id == batch_id).first()
        else:
            db_batch = db.query(ReconciliationBatch).order_by(desc(ReconciliationBatch.created_at)).first()

        if db_batch:
            content, filename, archive_path = generate_claude_export(db_batch.batch_id, db, format=format)
            if format.lower() == "xlsx":
                content_bytes = content if isinstance(content, bytes) else content.encode("utf-8")
                return Response(
                    content=content_bytes,
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={
                        "Content-Disposition": f'attachment; filename="{filename}"',
                        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "Access-Control-Expose-Headers": "Content-Disposition",
                    }
                )
            else:
                csv_bytes = content.encode("utf-8-sig") if isinstance(content, str) else content
                return Response(
                    content=csv_bytes,
                    media_type="text/csv; charset=utf-8",
                    headers={
                        "Content-Disposition": f'attachment; filename="{filename}"',
                        "Content-Type": "text/csv; charset=utf-8",
                        "Access-Control-Expose-Headers": "Content-Disposition",
                    }
                )

        # 2. Fallback: Generate directly from active MIS dashboard state
        if _LATEST_MIS_DATA is None:
            try:
                _LATEST_MIS_DATA = get_latest_mis(refresh=False, db=db)
            except Exception:
                pass

        rows = []
        disc_id = 1
        tabs_to_include = [
            ("cancellation_pending", "IN_TRANSIT_CANCELLATION", "Confirmed"),
            ("confirmed_su_cancelled_pms", "STATUS_MISMATCH", "Confirmed"),
            ("missing_in_pms", "MISSING_IN_PMS", "Unknown"),
            ("missing_in_su", "MISSING_IN_SU", "Unknown"),
            ("pms_special_status", "SPECIAL_STATUS", "Tentative/No-show"),
            ("base_vs_query_mismatch", "QUERY_MISMATCH", "Mismatch"),
            ("query_not_in_base", "QUERY_NOT_IN_BASE", "Missing"),
        ]

        seen_keys = set()
        for tab_key, disc_type, default_status in tabs_to_include:
            items = _LATEST_MIS_DATA.tabs_data.get(tab_key, [])
            for it in items:
                dedup_key = (it.reservation_id, disc_type)
                if dedup_key in seen_keys:
                    continue
                seen_keys.add(dedup_key)

                t_url = it.target_portal_url or "not available"
                if t_url.count("http") > 1:
                    parts = t_url.split("http")
                    t_url = "http" + parts[1]

                rows.append({
                    "Discrepancy_ID": disc_id,
                    "Reservation_ID": it.reservation_id,
                    "Channel": it.channel,
                    "Status_Category": it.su_status or default_status,
                    "Discrepancy_Type": disc_type,
                    "Property_ID": it.property_id or "",
                    "Property_Name": it.property_name or "Unknown Property",
                    "Assigned_Representative": it.assigned_representative or "Unassigned",
                    "Target_Portal_URL": t_url,
                    "Guest_Name": it.guest_name or "Unknown Guest",
                    "Check_In_Date": it.check_in or "",
                    "Check_Out_Date": it.check_out or "",
                })
                disc_id += 1

        df = pd.DataFrame(rows)
        today_str = date.today().strftime("%Y-%m-%d")
        b_id = batch_id or _LATEST_MIS_DATA.batch_id

        if format.lower() == "xlsx":
            filename = f"claude_payload_{today_str}_{b_id}.xlsx"
            out_excel = io.BytesIO()
            df.to_excel(out_excel, index=False, engine="openpyxl")
            excel_bytes = out_excel.getvalue()

            try:
                archive_path = settings.ARCHIVES_DIR / filename
                with open(archive_path, "wb") as f:
                    f.write(excel_bytes)
            except Exception:
                pass

            return Response(
                content=excel_bytes,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"',
                    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "Access-Control-Expose-Headers": "Content-Disposition",
                }
            )
        else:
            filename = f"claude_payload_{today_str}_{b_id}.csv"
            csv_bytes = df.to_csv(index=False, encoding="utf-8-sig").encode("utf-8-sig")

            try:
                archive_path = settings.ARCHIVES_DIR / filename
                with open(archive_path, "wb") as f:
                    f.write(csv_bytes)
            except Exception:
                pass

            return Response(
                content=csv_bytes,
                media_type="text/csv; charset=utf-8",
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"',
                    "Content-Type": "text/csv; charset=utf-8",
                    "Access-Control-Expose-Headers": "Content-Disposition",
                }
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Claude export failed: {str(e)}")


@router.post("/reconcile/quick")
def quick_reconcile(db: Session = Depends(get_db)):
    global _LATEST_MIS_DATA
    su_path = settings.DEFAULT_SU_PATH
    with open(su_path, "rb") as f:
        _LATEST_MIS_DATA = reconcile_mis_workbook(f.read(), db=db, filename=Path(su_path).name)
    return _LATEST_MIS_DATA


# =====================================================================
# Automation & Office Email Dispatch Endpoints
# =====================================================================

from pydantic import BaseModel

class AutomationEmailRequest(BaseModel):
    recipients: Optional[List[str]] = None
    subject: Optional[str] = None

class AutomationTestEmailRequest(BaseModel):
    recipient_email: str


@router.get("/automation/status")
def get_automation_status():
    """Check configuration status of free office email and incoming folder watcher."""
    from app.services.email_service import parse_recipient_list
    
    smtp_user = settings.SMTP_USER or ""
    smtp_configured = bool(smtp_user and settings.SMTP_PASSWORD)
    recipients = parse_recipient_list(settings.RECIPIENT_EMAILS)

    # Mask sender email for UI safety
    masked_user = "Not configured"
    if smtp_user and "@" in smtp_user:
        u_parts = smtp_user.split("@")
        name_part = u_parts[0]
        masked_user = f"{name_part[:3]}***@{u_parts[1]}" if len(name_part) > 3 else f"***@{u_parts[1]}"

    # Check incoming watch folder
    watch_dir = settings.WATCH_FOLDER
    incoming_files = []
    if watch_dir.exists():
        incoming_files = [
            f.name for f in watch_dir.iterdir()
            if f.is_file() and not f.name.startswith((".", "~$"))
        ]

    # Check processed history
    proc_dir = settings.PROCESSED_FOLDER
    processed_batches = []
    if proc_dir.exists():
        processed_batches = sorted([d.name for d in proc_dir.iterdir() if d.is_dir()], reverse=True)[:5]

    slack_webhook = (settings.SLACK_WEBHOOK_URL or "").strip()
    slack_configured = bool(slack_webhook)

    return {
        "status": "active",
        "smtp_configured": smtp_configured,
        "smtp_host": settings.SMTP_HOST,
        "smtp_port": settings.SMTP_PORT,
        "sender_account": masked_user,
        "sender_name": settings.SMTP_FROM_NAME,
        "recipients": recipients,
        "recipient_count": len(recipients),
        "slack_configured": slack_configured,
        "slack_channel": settings.SLACK_CHANNEL,
        "watch_folder": str(watch_dir),
        "incoming_files": incoming_files,
        "incoming_count": len(incoming_files),
        "processed_batches": processed_batches,
    }


@router.post("/automation/test-email")
def trigger_test_email(req: AutomationTestEmailRequest):
    """Send a test email to verify office SMTP credentials without executing full reconciliation."""
    from app.services.email_service import send_test_email
    res = send_test_email(req.recipient_email)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res


@router.post("/automation/slack-test")
def trigger_slack_test():
    """Send a test ping to the configured Slack webhook channel."""
    from app.services.slack_service import send_slack_test_ping
    res = send_slack_test_ping()
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res


@router.post("/automation/slack-send")
def trigger_slack_send(db: Session = Depends(get_db)):
    """Post an executive MIS reconciliation alert to the configured Slack channel."""
    global _LATEST_MIS_DATA
    from app.services.slack_service import send_slack_alert

    if _LATEST_MIS_DATA is None:
        try:
            _LATEST_MIS_DATA = get_latest_mis(refresh=False, db=db)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"No reconciliation data to post to Slack: {str(e)}")

    res = send_slack_alert(mis_data=_LATEST_MIS_DATA)
    return res


@router.post("/automation/send-email")
def trigger_send_email(
    req: Optional[AutomationEmailRequest] = None,
    db: Session = Depends(get_db)
):
    """
    Generate the executive multi-sheet Excel workbook and dispatch email report
    for the latest active reconciliation state.
    """
    global _LATEST_MIS_DATA
    from app.services.email_service import send_reconciliation_email

    if _LATEST_MIS_DATA is None:
        try:
            _LATEST_MIS_DATA = get_latest_mis(refresh=False, db=db)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"No reconciliation data available to email: {str(e)}")

    recips = req.recipients if req and req.recipients else None
    subj = req.subject if req and req.subject else None

    result = send_reconciliation_email(
        mis_data=_LATEST_MIS_DATA,
        recipient_emails=recips,
        custom_subject=subj,
        dry_run_if_no_smtp=True
    )
    return result


@router.post("/automation/trigger")
def trigger_automated_reconciliation(
    req: Optional[AutomationEmailRequest] = None,
    db: Session = Depends(get_db)
):
    """
    Execute complete automated ingestion of incoming sheets (or default sheets)
    and dispatch emails to everyone immediately.
    """
    global _LATEST_MIS_DATA
    from app.services.automation_service import run_reconciliation_and_dispatch

    recips = req.recipients if req and req.recipients else None
    try:
        res = run_reconciliation_and_dispatch(
            recipient_emails=recips,
            send_email=True,
            db=db
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Automated reconciliation failed: {str(e)}")
