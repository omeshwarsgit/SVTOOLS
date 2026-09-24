import io
import re
from datetime import datetime, date
from typing import Union, BinaryIO
import pandas as pd
import openpyxl
import xlrd


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
    if val is None or pd.isna(val) or val == "" or str(val).strip() == "-":
        return None
    if isinstance(val, (datetime, pd.Timestamp)):
        return val.date()
    if isinstance(val, date):
        return val
    s = str(val).strip()
    # Try YYYY-MM-DD
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S"):
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


def load_su_file(file_source: Union[str, bytes, BinaryIO]) -> pd.DataFrame:
    """
    Ingest SU Daily Report ('SU__Cancelled_Bookings.xlsx').
    - Target Sheet: Read strictly sheet_name='Sheet1'. Ignore auxiliary sheets.
    - Strips leading zeros from 'Reservation ID'.
    - Deduplicates on ('Reservation ID', 'Booking Status') keeping last.
    - Normalizes channel.
    """
    if isinstance(file_source, bytes):
        file_obj = io.BytesIO(file_source)
    else:
        file_obj = file_source

    df = pd.read_excel(file_obj, sheet_name="Sheet1", engine="openpyxl")

    # Column name whitespace stripping
    df.columns = [str(c).strip() for c in df.columns]

    # Required columns check
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

    # Clean types & normalize
    df["channel"] = df["Source of Booking"].apply(normalize_channel)
    df["clean_check_in"] = df["Check In Date"].apply(clean_date)
    df["clean_check_out"] = df["Check Out Date"].apply(clean_date)
    df["clean_property_id"] = df["Su Property ID"].apply(clean_int)
    df["clean_check_flag"] = pd.to_numeric(df["Check"], errors="coerce")

    return df


def load_pms_file(file_source: Union[str, bytes, BinaryIO]) -> pd.DataFrame:
    """
    Ingest PMS Daily Report ('ota_reservation_180day_report_*.xls').
    - Legacy BIFF8 stream with workbook corruption markers.
    - Resilient Parser Contract: wraps binary ingestion using xlrd with ignore_workbook_corruption=True.
    - Strips leading zeros from 'Reservation ID'.
    - Deduplicates on ('Reservation ID', 'Booking Status') keeping last.
    - Normalizes channel.
    """
    if isinstance(file_source, bytes):
        wb = xlrd.open_workbook(file_contents=file_source, ignore_workbook_corruption=True)
    elif hasattr(file_source, "read"):
        file_contents = file_source.read()
        wb = xlrd.open_workbook(file_contents=file_contents, ignore_workbook_corruption=True)
    else:
        wb = xlrd.open_workbook(str(file_source), ignore_workbook_corruption=True)

    sheet = wb.sheet_by_index(0)
    data = [sheet.row_values(r) for r in range(sheet.nrows)]
    if not data:
        return pd.DataFrame()

    headers = [str(c).strip() for c in data[0]]
    df = pd.DataFrame(data[1:], columns=headers)

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

    # Clean types & normalize
    df["channel"] = df["Source of Booking"].apply(normalize_channel)
    df["clean_check_in"] = df["Check In Date"].apply(clean_date)
    df["clean_check_out"] = df["Check Out Date"].apply(clean_date)
    df["clean_property_id"] = df["Su Property ID"].apply(clean_int)

    return df
