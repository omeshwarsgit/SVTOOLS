import os
import io
import csv
import shutil
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
from app.services.reconciler import reconcile_datasets, reconcile_mis_workbook, CHANNELS
from app.services.exporter import generate_claude_export
from app.services.seeder import seed_master_registry

router = APIRouter()

# In-memory cache of latest MIS state
_LATEST_MIS_DATA: Optional[MISDashboardData] = None


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


import subprocess

@router.get("/files/workspace")
def list_workspace_files():
    """List available local workbook and export files that the user can navigate, open, or select."""
    files_list = []
    
    # 1. Project Data dir
    if os.path.exists(settings.DATA_DIR):
        for f in sorted(os.listdir(settings.DATA_DIR)):
            if f.endswith((".xlsx", ".xls", ".csv")) and not f.startswith("~$"):
                fp = settings.DATA_DIR / f
                stat = fp.stat()
                ext = fp.suffix.lower()
                sheets = []
                try:
                    if ext == ".xlsx":
                        wb = openpyxl.load_workbook(fp, read_only=True)
                        sheets = wb.sheetnames
                    elif ext == ".xls":
                        import xlrd
                        wb = xlrd.open_workbook(fp, on_demand=True, ignore_workbook_corruption=True)
                        sheets = wb.sheet_names()
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
    downloads = Path("/Users/omeshwarshukla/Downloads")
    if downloads.exists():
        for f in downloads.glob("*.xlsx"):
            if not f.name.startswith("~$") and ("su" in f.name.lower() or "stayvista" in f.name.lower() or "ota" in f.name.lower()):
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
    """
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

    ext = Path(file_path).suffix.lower()
    sheets = []
    active_sheet = sheet_name

    try:
        if ext == ".xlsx":
            wb = openpyxl.load_workbook(file_path, read_only=True)
            sheets = wb.sheetnames
            if not active_sheet or active_sheet not in sheets:
                active_sheet = sheets[0]
            df = pd.read_excel(file_path, sheet_name=active_sheet, nrows=100)
        elif ext == ".xls":
            import xlrd
            wb = xlrd.open_workbook(file_path, on_demand=True, ignore_workbook_corruption=True)
            sheets = wb.sheet_names()
            if not active_sheet or active_sheet not in sheets:
                active_sheet = sheets[0]
            sheet = wb.sheet_by_name(active_sheet)
            data = [sheet.row_values(r) for r in range(min(sheet.nrows, 101))]
            if data:
                headers = [str(c).strip() for c in data[0]]
                df = pd.DataFrame(data[1:], columns=headers)
            else:
                df = pd.DataFrame()
        elif ext == ".csv":
            df = pd.read_csv(file_path, nrows=100, encoding="utf-8-sig")
            active_sheet = "CSV Data"
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}")

        # Clean NaN values for JSON serialization
        df = df.fillna("")
        columns = [str(c) for c in df.columns]
        rows = df.to_dict(orient="records")

        return {
            "file_name": os.path.basename(file_path),
            "file_path": file_path,
            "sheets": sheets,
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
    """Directly download any workspace file with proper headers."""
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

    filename = os.path.basename(file_path)
    ext = Path(file_path).suffix.lower()
    media_type = "application/octet-stream"
    if ext == ".xlsx":
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif ext == ".csv":
        media_type = "text/csv; charset=utf-8"

    with open(file_path, "rb") as f:
        content = f.read()

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.get("/mis/latest", response_model=MISDashboardData)
def get_latest_mis(db: Session = Depends(get_db)):
    """Fetch the latest SU – PMS Booking Reconciliation MIS dataset."""
    global _LATEST_MIS_DATA
    if _LATEST_MIS_DATA is None:
        su_path = settings.DEFAULT_SU_PATH
        if not os.path.exists(su_path):
            downloads_file = "/Users/omeshwarshukla/Downloads/SU__Cancelled_Bookings.xlsx"
            if os.path.exists(downloads_file):
                su_path = downloads_file

        if os.path.exists(su_path):
            with open(su_path, "rb") as f:
                content = f.read()
            _LATEST_MIS_DATA = reconcile_mis_workbook(content, db=db)
        else:
            raise HTTPException(status_code=404, detail="Default workbook not found on server")

    return _LATEST_MIS_DATA


@router.post("/mis/process", response_model=MISDashboardData)
async def process_mis_files(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload one workbook with SU / Query Dump / Base Dump sheets, or separate CSV/XLSX files.
    """
    global _LATEST_MIS_DATA

    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    for f in files:
        if f.filename.endswith((".xlsx", ".xls", ".csv")):
            content = await f.read()
            try:
                res = reconcile_mis_workbook(content, db=db)
                _LATEST_MIS_DATA = res
                return res
            except Exception as e:
                continue

    raise HTTPException(status_code=400, detail="Could not process uploaded files. Please ensure workbook contains valid sheets.")


@router.post("/mis/select-file", response_model=MISDashboardData)
def select_file_from_workspace(file_path: str = Query(...), db: Session = Depends(get_db)):
    """Process a selected workspace/local file directly."""
    global _LATEST_MIS_DATA
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

    with open(file_path, "rb") as f:
        content = f.read()

    try:
        res = reconcile_mis_workbook(content, db=db)
        _LATEST_MIS_DATA = res
        return res
    except ValueError as ve:
        raise HTTPException(
            status_code=400,
            detail=f"This file cannot be reconciled directly ({str(ve)}). It appears to be a master registry or report file rather than a daily SU/PMS reconciliation workbook. Use 'Preview / Inspect' to view its contents."
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Reconciliation error: {str(e)}")


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
        get_latest_mis(db)

    items = _LATEST_MIS_DATA.tabs_data.get(tab_name, [])

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
    os.makedirs(settings.ARCHIVES_DIR, exist_ok=True)
    downloads_dir = Path("/Users/omeshwarshukla/Downloads")
    downloads_dir.mkdir(parents=True, exist_ok=True)

    if format.lower() == "xlsx":
        filename = f"su_pms_{tab_name}_{today_str}.xlsx"
        archive_path = settings.ARCHIVES_DIR / filename
        downloads_path = downloads_dir / filename
        friendly_path = downloads_dir / f"su_pms_{tab_name}.xlsx"

        df.to_excel(archive_path, index=False, engine="openpyxl")
        # Save real .xlsx Excel file directly to ~/Downloads
        try:
            shutil.copy(archive_path, downloads_path)
            shutil.copy(archive_path, friendly_path)
        except Exception:
            pass

        with open(archive_path, "rb") as f:
            excel_bytes = f.read()

        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Local-Path": str(archive_path),
                "X-Downloads-Path": str(downloads_path),
                "Access-Control-Expose-Headers": "X-Local-Path, X-Downloads-Path, Content-Disposition",
            }
        )
    else:
        filename = f"su_pms_{tab_name}_{today_str}.csv"
        archive_path = settings.ARCHIVES_DIR / filename
        downloads_path = downloads_dir / filename
        friendly_path = downloads_dir / f"su_pms_{tab_name}.csv"

        # UTF-8 with BOM (utf-8-sig) ensures Excel opens without error
        csv_bytes = df.to_csv(index=False, encoding="utf-8-sig").encode("utf-8-sig")
        with open(archive_path, "wb") as f:
            f.write(csv_bytes)
        # Save real .csv spreadsheet file directly to ~/Downloads
        try:
            shutil.copy(archive_path, downloads_path)
            shutil.copy(archive_path, friendly_path)
        except Exception:
            pass

        return Response(
            content=csv_bytes,
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Local-Path": str(archive_path),
                "X-Downloads-Path": str(downloads_path),
                "Access-Control-Expose-Headers": "X-Local-Path, X-Downloads-Path, Content-Disposition",
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
        get_latest_mis(db)

    items = _LATEST_MIS_DATA.tabs_data.get(tab_name, [])
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
    downloads_dir = Path("/Users/omeshwarshukla/Downloads")
    downloads_dir.mkdir(parents=True, exist_ok=True)
    os.makedirs(settings.ARCHIVES_DIR, exist_ok=True)

    if format.lower() == "xlsx":
        filename = f"su_pms_{tab_name}_{today_str}.xlsx"
        archive_path = settings.ARCHIVES_DIR / filename
        downloads_path = downloads_dir / filename
        friendly_path = downloads_dir / f"su_pms_{tab_name}.xlsx"

        df.to_excel(archive_path, index=False, engine="openpyxl")
        shutil.copy(archive_path, downloads_path)
        shutil.copy(archive_path, friendly_path)
    else:
        filename = f"su_pms_{tab_name}_{today_str}.csv"
        archive_path = settings.ARCHIVES_DIR / filename
        downloads_path = downloads_dir / filename
        friendly_path = downloads_dir / f"su_pms_{tab_name}.csv"

        csv_bytes = df.to_csv(index=False, encoding="utf-8-sig").encode("utf-8-sig")
        with open(archive_path, "wb") as f:
            f.write(csv_bytes)
        shutil.copy(archive_path, downloads_path)
        shutil.copy(archive_path, friendly_path)

    # Launch in Excel / macOS default spreadsheet app
    try:
        subprocess.run(["open", str(downloads_path)], check=True)
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
        "message": f"Successfully created real {format.upper()} spreadsheet in ~/Downloads and opened in Excel!"
    }


@router.get("/export/claude-payload")
def export_claude_payload(
    batch_id: Optional[str] = Query(None, description="Batch ID"),
    format: str = Query("csv", description="Format: csv or xlsx"),
    db: Session = Depends(get_db)
):
    """
    Generate Claude-optimized flat discrepancy CSV or Excel export with immutable archival.
    """
    try:
        if not batch_id:
            latest = db.query(ReconciliationBatch).order_by(desc(ReconciliationBatch.created_at)).first()
            if latest:
                batch_id = latest.batch_id
            else:
                su_path = settings.DEFAULT_SU_PATH
                pms_path = settings.DEFAULT_PMS_PATH
                with open(su_path, "rb") as f_su, open(pms_path, "rb") as f_pms:
                    r = reconcile_datasets(f_su.read(), f_pms.read(), db=db)
                    batch_id = r["batch_id"]

        content, filename, archive_path = generate_claude_export(batch_id, db, format=format)
        downloads_dir = Path("/Users/omeshwarshukla/Downloads")
        downloads_dir.mkdir(parents=True, exist_ok=True)
        downloads_path = downloads_dir / filename

        # Copy directly to ~/Downloads
        try:
            if format.lower() == "xlsx":
                with open(downloads_path, "wb") as f_out:
                    f_out.write(content)
            else:
                with open(downloads_path, "w", encoding="utf-8-sig") as f_out:
                    f_out.write(content if isinstance(content, str) else content.decode("utf-8-sig", errors="ignore"))
        except Exception:
            pass

        if format.lower() == "xlsx":
            return Response(
                content=content,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"',
                    "X-Archive-Path": str(archive_path),
                    "X-Downloads-Path": str(downloads_path),
                    "Access-Control-Expose-Headers": "X-Archive-Path, X-Downloads-Path, Content-Disposition",
                }
            )
        else:
            # UTF-8 with BOM
            csv_bytes = content.encode("utf-8-sig") if isinstance(content, str) else content
            return Response(
                content=csv_bytes,
                media_type="text/csv; charset=utf-8",
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"',
                    "X-Archive-Path": str(archive_path),
                    "X-Downloads-Path": str(downloads_path),
                    "Access-Control-Expose-Headers": "X-Archive-Path, X-Downloads-Path, Content-Disposition",
                }
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@router.post("/reconcile/quick")
def quick_reconcile(db: Session = Depends(get_db)):
    global _LATEST_MIS_DATA
    su_path = settings.DEFAULT_SU_PATH
    with open(su_path, "rb") as f:
        _LATEST_MIS_DATA = reconcile_mis_workbook(f.read(), db=db)
    return _LATEST_MIS_DATA
