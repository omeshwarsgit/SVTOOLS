import io
import os
import re
from datetime import datetime, date
from pathlib import Path
from typing import Union, BinaryIO, Dict, List, Tuple, Optional
import pandas as pd
import openpyxl
import xlrd

from app.core.config import settings


def normalize_channel(raw_source: any) -> str:
    """
    Deterministic Channel Normalization:
    - Case-insensitive match containing 'goibibo' OR 'makemytrip' -> 'Gommt'
    - Case-insensitive match containing 'booking.com' -> 'B.com'
    - Case-insensitive match containing 'airbnb' -> 'Airbnb'
    - Case-insensitive match containing 'agoda' -> 'Agoda'
    - All other sources ('cleartrip', 'easemytrip', nulls, etc.) -> 'Others'
    """
    if raw_source is None or pd.isna(raw_source):
        return "Others"
    s = str(raw_source).strip().lower()
    if "goibibo" in s or "makemytrip" in s or "gommt" in s:
        return "Gommt"
    if "booking.com" in s or "b.com" in s:
        return "B.com"
    if "airbnb" in s:
        return "Airbnb"
    if "agoda" in s:
        return "Agoda"
    return "Others"


def clean_date(val: any) -> Union[date, None]:
    """Parse various date formats into python date object."""
    if val is None or pd.isna(val) or val == "" or str(val).strip() in ("", "-", "nan", "none", "nat"):
        return None
    if isinstance(val, (datetime, pd.Timestamp)):
        return val.date()
    if isinstance(val, date):
        return val
    s = str(val).strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M:%S"):
        try:
            return datetime.strptime(s.split(" ")[0], fmt.split(" ")[0]).date()
        except (ValueError, TypeError):
            continue
    return None


def clean_int(val: any) -> Union[int, None]:
    """Parse string/float/int safely into int or None."""
    if val is None or pd.isna(val) or val == "":
        return None
    try:
        return int(float(str(val).strip()))
    except (ValueError, TypeError):
        return None


def read_tabular_file(file_source: Union[str, bytes, BinaryIO, Path], filename: str = "") -> Dict[str, pd.DataFrame]:
    """
    Safely read any CSV, modern XLSX, or legacy corrupted XLS file.
    Returns a dictionary of {sheet_name: DataFrame}.
    For CSV files, returns {"CSV Data": DataFrame}.
    """
    ext = os.path.splitext(filename)[1].lower() if filename else ""
    raw_bytes: bytes

    if isinstance(file_source, (str, Path)):
        if not ext:
            ext = Path(file_source).suffix.lower()
        with open(file_source, "rb") as f:
            raw_bytes = f.read()
    elif isinstance(file_source, bytes):
        raw_bytes = file_source
    elif hasattr(file_source, "read"):
        raw_bytes = file_source.read()
    else:
        raise ValueError(f"Unsupported file source type: {type(file_source)}")

    dfs: Dict[str, pd.DataFrame] = {}

    # 1. Try CSV if extension indicates or if looks like text
    if ext == ".csv":
        for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
            try:
                df = pd.read_csv(io.BytesIO(raw_bytes), encoding=enc)
                df.columns = [str(c).strip() for c in df.columns]
                dfs["CSV Data"] = df
                return dfs
            except Exception:
                continue

    # 2. Try XLSX via openpyxl
    if ext == ".xlsx" or not ext:
        try:
            wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), read_only=True, data_only=True)
            for sheet in wb.sheetnames:
                df = pd.read_excel(io.BytesIO(raw_bytes), sheet_name=sheet, engine="openpyxl")
                df.columns = [str(c).strip() for c in df.columns]
                dfs[sheet] = df
            if dfs:
                return dfs
        except Exception:
            pass

    # 3. Try XLS via xlrd with corrupted workbook tolerance
    if ext == ".xls" or not ext or not dfs:
        try:
            wb = xlrd.open_workbook(file_contents=raw_bytes, ignore_workbook_corruption=True)
            for sname in wb.sheet_names():
                sheet = wb.sheet_by_name(sname)
                data = [sheet.row_values(r) for r in range(sheet.nrows)]
                if data:
                    headers = [str(c).strip() for c in data[0]]
                    df = pd.DataFrame(data[1:], columns=headers)
                else:
                    df = pd.DataFrame()
                dfs[sname] = df
            if dfs:
                return dfs
        except Exception:
            pass

    # 4. Fallback: try parsing as CSV anyway
    if not dfs:
        for enc in ("utf-8-sig", "utf-8", "latin-1"):
            try:
                df = pd.read_csv(io.BytesIO(raw_bytes), encoding=enc)
                df.columns = [str(c).strip() for c in df.columns]
                dfs["CSV Data"] = df
                return dfs
            except Exception:
                continue

    if not dfs:
        raise ValueError("Could not parse file content as Excel (.xlsx/.xls) or CSV.")
    return dfs


def detect_dataset_type(df: pd.DataFrame, sheet_name: str = "") -> str:
    """
    Identify whether a DataFrame represents:
    - 'su': Source System Daily Bookings
    - 'base': PMS Base Dump
    - 'query': PMS Query Dump
    - 'pms_report': PMS 180-Day Reservation Report
    - 'unknown': Unrecognized schema
    """
    s_name = str(sheet_name).lower().strip()
    if "query" in s_name:
        return "query"
    if "base" in s_name:
        return "base"
    if "ota" in s_name or "pms" in s_name or "180" in s_name:
        return "pms_report"
    if "su" in s_name or s_name == "sheet1":
        return "su"

    cols = [str(c).lower().strip() for c in df.columns]

    if "booking_id" in cols and ("uid" in cols or "booking_status" in cols):
        return "base"
    if "status" in cols and "primary_source" in cols and "booking_id" not in cols:
        return "query"
    if any("admin" in c for c in cols) or any(c == "check" for c in cols):
        return "su"
    if "reservation id" in cols and ("booking status" in cols or "vendor booking id" in cols):
        return "pms_report"
    if "source of booking" in cols and "reservation id" in cols:
        return "su"

    return "unknown"


def convert_pms_report_to_base(df_pms: pd.DataFrame) -> pd.DataFrame:
    """
    Convert a PMS 180-day reservation report DataFrame into PMS Base Dump schema.
    """
    cols = {str(c).strip().lower(): str(c).strip() for c in df_pms.columns}

    res_col = cols.get("reservation id", cols.get("reservation_id", cols.get("booking_id", "")))
    vendor_col = cols.get("vendor booking id", cols.get("vendor_booking_id", cols.get("uid", "")))
    prop_col = cols.get("su property id", cols.get("property id", cols.get("property_id", "")))
    status_col = cols.get("booking status", cols.get("booking_status", cols.get("status", "")))
    source_col = cols.get("source of booking", cols.get("source", cols.get("primary_source", "")))
    checkin_col = cols.get("check in date", cols.get("checkin", cols.get("check_in", "")))
    checkout_col = cols.get("check out date", cols.get("checkout", cols.get("check_out", "")))
    created_col = cols.get("date and time of booking creation", cols.get("created_at_ist", ""))

    res_series = df_pms[res_col].astype(str).str.strip().str.lstrip("0") if res_col else pd.Series(range(len(df_pms))).astype(str)
    vendor_series = df_pms[vendor_col].astype(str).str.strip().str.lstrip("0") if vendor_col else pd.Series([""] * len(df_pms))

    # UID: vendor id if present and valid, else reservation id
    uid_series = vendor_series.where((vendor_series != "") & (vendor_series != "nan"), res_series)

    base_df = pd.DataFrame({
        "booking_id": res_series,
        "property_id": df_pms[prop_col].apply(clean_int) if prop_col else None,
        "uid": uid_series,
        "primary_source": df_pms[source_col].astype(str) if source_col else "Others",
        "booking_status": df_pms[status_col].astype(str).str.strip() if status_col else "Confirmed",
        "created_at_ist": df_pms[created_col].astype(str) if created_col else "",
        "checkin": df_pms[checkin_col] if checkin_col else None,
        "checkout": df_pms[checkout_col] if checkout_col else None,
    })
    return base_df


def load_su_file(file_source: Union[str, bytes, BinaryIO, Path]) -> pd.DataFrame:
    """
    Ingest SU Daily Report ('SU__Cancelled_Bookings.xlsx' or CSV).
    - Strips leading zeros from 'Reservation ID'.
    - Deduplicates on ('Reservation ID', 'Booking Status') keeping last.
    - Normalizes channel.
    """
    sheets = read_tabular_file(file_source, filename="SU_Report.xlsx" if isinstance(file_source, bytes) else str(file_source))
    # Pick the SU sheet
    df = None
    for name, sheet_df in sheets.items():
        if detect_dataset_type(sheet_df, name) == "su":
            df = sheet_df.copy()
            break
    if df is None:
        # Fall back to first sheet
        df = list(sheets.values())[0].copy()

    df.columns = [str(c).strip() for c in df.columns]

    essential_cols = [
        "Reservation ID",
        "Vendor Booking Id",
        "Guest Name",
        "Su Property ID",
        "Booking Status",
        "Date and Time of Booking creation",
        "Source of Booking",
        "Check In Date",
        "Check Out Date",
        "Current admin booking status",
        "Check",
    ]
    for col in essential_cols:
        if col not in df.columns:
            df[col] = None

    # Patch A: The Leading Zero Identifier Trap
    df["Reservation ID"] = df["Reservation ID"].astype(str).str.strip().str.lstrip("0")
    df.loc[df["Reservation ID"] == "", "Reservation ID"] = "0"

    # Patch B: The Duplicate Timestamp Crash Guard
    df.drop_duplicates(subset=["Reservation ID", "Booking Status"], keep="last", inplace=True)

    df["channel"] = df["Source of Booking"].apply(normalize_channel)
    df["clean_check_in"] = df["Check In Date"].apply(clean_date)
    df["clean_check_out"] = df["Check Out Date"].apply(clean_date)
    df["clean_property_id"] = df["Su Property ID"].apply(clean_int)
    df["clean_check_flag"] = pd.to_numeric(df["Check"], errors="coerce")

    return df


def load_pms_file(file_source: Union[str, bytes, BinaryIO, Path]) -> pd.DataFrame:
    """
    Ingest PMS Daily Report ('ota_reservation_180day_report_*.xls' or CSV).
    - Legacy BIFF8 stream with workbook corruption markers.
    - Resilient Parser Contract: wraps binary ingestion using xlrd with ignore_workbook_corruption=True.
    - Strips leading zeros from 'Reservation ID'.
    - Deduplicates on ('Reservation ID', 'Booking Status') keeping last.
    - Normalizes channel.
    """
    sheets = read_tabular_file(file_source, filename="PMS_Report.xls" if isinstance(file_source, bytes) else str(file_source))
    df = None
    for name, sheet_df in sheets.items():
        if detect_dataset_type(sheet_df, name) in ("pms_report", "base"):
            df = sheet_df.copy()
            break
    if df is None:
        df = list(sheets.values())[0].copy()

    df.columns = [str(c).strip() for c in df.columns]

    essential_cols = [
        "Reservation ID",
        "Vendor Booking Id",
        "Guest Name",
        "Su Property ID",
        "Booking Status",
        "Date and Time of Booking creation",
        "Source of Booking",
        "Check In Date",
        "Check Out Date",
    ]
    for col in essential_cols:
        if col not in df.columns:
            df[col] = None

    # Patch A: The Leading Zero Identifier Trap
    df["Reservation ID"] = df["Reservation ID"].astype(str).str.strip().str.lstrip("0")
    df.loc[df["Reservation ID"] == "", "Reservation ID"] = "0"

    # Patch B: The Duplicate Timestamp Crash Guard
    df.drop_duplicates(subset=["Reservation ID", "Booking Status"], keep="last", inplace=True)

    df["channel"] = df["Source of Booking"].apply(normalize_channel)
    df["clean_check_in"] = df["Check In Date"].apply(clean_date)
    df["clean_check_out"] = df["Check Out Date"].apply(clean_date)
    df["clean_property_id"] = df["Su Property ID"].apply(clean_int)

    return df


def extract_reconciliation_dfs(
    files: List[Tuple[str, bytes]]
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Takes one or more uploaded file (filename, bytes) tuples.
    Intelligently extracts and pairs:
    1. df_su (SU Daily Bookings)
    2. df_base (PMS Base Dump)
    3. df_query (PMS Query Dump)

    If any component is missing, falls back to the system default dataset.
    """
    detected_su: Optional[pd.DataFrame] = None
    detected_base: Optional[pd.DataFrame] = None
    detected_query: Optional[pd.DataFrame] = None
    detected_pms_report: Optional[pd.DataFrame] = None

    for fname, content in files:
        sheets = read_tabular_file(content, filename=fname)
        for sname, df in sheets.items():
            dtype = detect_dataset_type(df, sname)
            if dtype == "su" and detected_su is None:
                detected_su = df
            elif dtype == "base" and detected_base is None:
                detected_base = df
            elif dtype == "query" and detected_query is None:
                detected_query = df
            elif dtype == "pms_report" and detected_pms_report is None:
                detected_pms_report = df

    # If PMS Report was uploaded and no Base dump was found, convert PMS Report to Base
    if detected_base is None and detected_pms_report is not None:
        detected_base = convert_pms_report_to_base(detected_pms_report)

    # Load defaults for any missing components
    default_su_path = settings.DEFAULT_SU_PATH
    if not default_su_path.exists():
        default_su_path = Path.home() / "Downloads" / "SU__Cancelled_Bookings.xlsx"

    if (detected_su is None or detected_base is None or detected_query is None) and default_su_path.exists():
        default_sheets = read_tabular_file(default_su_path, filename="SU__Cancelled_Bookings.xlsx")
        for sname, df in default_sheets.items():
            dtype = detect_dataset_type(df, sname)
            if detected_su is None and dtype == "su":
                detected_su = df
            elif detected_base is None and dtype == "base":
                detected_base = df
            elif detected_query is None and dtype == "query":
                detected_query = df

    if detected_su is None:
        raise ValueError("Could not find or extract SU Bookings dataset from the provided files.")
    if detected_base is None:
        raise ValueError("Could not find or extract PMS Base Dump or PMS Report dataset.")
    if detected_query is None:
        # Create an empty or matching query dump if not available
        detected_query = pd.DataFrame(columns=["id", "property_id", "primary_source", "checkin", "checkout", "status"])

    return detected_su, detected_base, detected_query
