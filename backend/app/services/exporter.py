import csv
import io
import os
from datetime import date
from pathlib import Path
from typing import Tuple, Union
import pandas as pd
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.schemas import Discrepancy, ReconciliationBatch


def generate_claude_export(batch_id: str, db: Session, format: str = "csv") -> Tuple[Union[bytes, str], str, Path]:
    """
    Generate Claude-optimized flat discrepancy export.
    Supports 'csv' (with UTF-8-SIG BOM for seamless opening in Excel/Numbers) and 'xlsx'.
    
    Expected Schema:
    Discrepancy_ID,Reservation_ID,Channel,Status_Category,Discrepancy_Type,Property_ID,Property_Name,Assigned_Representative,Target_Portal_URL,Guest_Name,Check_In_Date,Check_Out_Date

    Requirement 8.C (Immutable Archival Record):
    Saves a physical copy of the file to /archives/exports/ with the naming convention:
    claude_payload_YYYY-MM-DD_{batch_id}.csv
    """
    batch = db.query(ReconciliationBatch).filter(ReconciliationBatch.batch_id == batch_id).first()
    if not batch:
        raise ValueError(f"Batch not found: {batch_id}")

    discrepancies = db.query(Discrepancy).filter(Discrepancy.batch_id == batch_id).order_by(Discrepancy.id).all()

    rows = []
    for idx, d in enumerate(discrepancies, start=1):
            t_url = d.target_portal_url or "not available"
            if t_url.count("http") > 1:
                parts = t_url.split("http")
                t_url = "http" + parts[1]
            rows.append({
                "Discrepancy_ID": idx,
                "Reservation_ID": d.reservation_id,
                "Channel": d.channel,
                "Status_Category": d.status_category,
                "Discrepancy_Type": d.discrepancy_type,
                "Property_ID": d.property_id if d.property_id is not None else "",
                "Property_Name": d.property_name or "Unknown Property",
                "Assigned_Representative": d.assigned_representative or "Unassigned",
                "Target_Portal_URL": t_url,
            "Guest_Name": d.guest_name or "Unknown Guest",
            "Check_In_Date": d.check_in.strftime("%Y-%m-%d") if d.check_in else "",
            "Check_Out_Date": d.check_out.strftime("%Y-%m-%d") if d.check_out else "",
        })

    df = pd.DataFrame(rows)

    # 1. Save immutable physical CSV copy with UTF-8 BOM to /archives/exports/
    os.makedirs(settings.ARCHIVES_DIR, exist_ok=True)
    today_str = date.today().strftime("%Y-%m-%d")
    archive_filename = f"claude_payload_{today_str}_{batch_id}.csv"
    archive_path = settings.ARCHIVES_DIR / archive_filename

    # UTF-8 with BOM (utf-8-sig) ensures Excel on Mac and Windows opens the file without error
    df.to_csv(archive_path, index=False, encoding="utf-8-sig")

    if format.lower() == "xlsx":
        out_excel = io.BytesIO()
        df.to_excel(out_excel, index=False, engine="openpyxl")
        excel_bytes = out_excel.getvalue()
        excel_filename = f"claude_payload_{today_str}_{batch_id}.xlsx"
        return excel_bytes, excel_filename, archive_path
    else:
        with open(archive_path, "r", encoding="utf-8-sig") as f:
            csv_content = f.read()
        return csv_content, archive_filename, archive_path
