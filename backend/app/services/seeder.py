import os
from pathlib import Path
from typing import Union, Dict, Any, Optional
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.config import settings
from app.core.database import SessionLocal, engine, Base
from app.models.schemas import PropertyMaster, PropertyRepresentative
from app.services.parser import normalize_channel


def sanitize_url(val: any) -> str:
    """Sanitize URL string: nulls/empty become 'not available', fix duplicated concatenated URLs."""
    if val is None or pd.isna(val):
        return "not available"
    s = str(val).strip()
    if s == "" or s.lower() in ("nan", "none", "null", "not available", "-"):
        return "not available"
    # Fix concatenated duplicate http/https URLs in MMT or other columns
    parts = s.split("http")
    if len(parts) > 2:
        s = "http" + parts[1]
    return s.strip()


def seed_master_registry(file_path: Optional[Union[str, Path]] = None, db: Optional[Session] = None) -> Dict[str, Any]:
    """
    Seed properties_master and property_representatives from 'Stayvista Property Links.xlsx'.
    
    1. Sheet 'Property Links ' (note trailing space):
       Headers stripped. Link columns (SV, Agoda, MMT, Booking, Airbnb) sanitized to 'not available'.
       Deduplicated on Primary_Property_ID.
    2. Sheet 'OTA Master':
       Relational bridge: New Vista Website ID 1 -> SVID.
    3. Sheet 'RM Data':
       (SVID, Property Name, OTA, Agent Name) joined to build (Primary_Property_ID, OTA) -> Agent_Name.
    """
    if file_path is None:
        file_path = settings.MASTER_REGISTRY_PATH
        if not os.path.exists(file_path):
            downloads_file = Path("/Users/omeshwarshukla/Downloads/Stayvista Property Links.xlsx")
            if downloads_file.exists():
                file_path = downloads_file

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Master registry file not found at: {file_path}")

    Base.metadata.create_all(bind=engine)

    owns_session = False
    if db is None:
        db = SessionLocal()
        owns_session = True

    try:
        # 1. Read 'Property Links ' sheet
        df_pl = pd.read_excel(file_path, sheet_name="Property Links ", engine="openpyxl")
        df_pl.columns = [str(c).strip() for c in df_pl.columns]

        link_cols = ["SV", "Agoda", "MMT", "Booking", "Airbnb"]
        for col in link_cols:
            if col in df_pl.columns:
                df_pl[col] = df_pl[col].apply(sanitize_url)
            else:
                df_pl[col] = "not available"

        df_pl["primary_property_id"] = pd.to_numeric(df_pl.get("Primary_Property_ID"), errors="coerce")
        df_pl = df_pl.dropna(subset=["primary_property_id"]).copy()
        df_pl["primary_property_id"] = df_pl["primary_property_id"].astype(int)
        df_pl["property_name"] = df_pl["Property_Name"].fillna("Unknown Property").astype(str).str.strip()

        # Deduplicate Primary_Property_ID
        df_props = df_pl.drop_duplicates(subset=["primary_property_id"], keep="first").copy()

        # 2. Read 'OTA Master' sheet (Bridge New Vista Website ID 1 -> SVID)
        df_ota = pd.read_excel(file_path, sheet_name="OTA Master", engine="openpyxl")
        df_ota_bridge = df_ota[["SVID", "Property Name", "New Vista Website ID 1"]].copy()
        df_ota_bridge.columns = ["svid", "property_name_ota", "primary_prop_id_raw"]
        df_ota_bridge["primary_property_id"] = pd.to_numeric(df_ota_bridge["primary_prop_id_raw"], errors="coerce")
        df_ota_valid = df_ota_bridge.dropna(subset=["primary_property_id", "svid"]).copy()
        df_ota_valid["primary_property_id"] = df_ota_valid["primary_property_id"].astype(int)
        df_ota_valid["svid"] = df_ota_valid["svid"].astype(str).str.strip()

        # Map SVID to df_props
        svid_map = dict(zip(df_ota_valid["primary_property_id"], df_ota_valid["svid"]))
        df_props["svid"] = df_props["primary_property_id"].map(svid_map)

        # 3. Read 'RM Data' sheet
        df_rm = pd.read_excel(file_path, sheet_name="RM Data", engine="openpyxl")
        df_rm = df_rm.dropna(subset=["Agent Name"]).copy()
        df_rm["Agent Name"] = df_rm["Agent Name"].astype(str).str.strip()
        df_rm = df_rm[~df_rm["Agent Name"].isin(["", "nan", "None", "-"])]

        df_rm["ota_channel"] = df_rm["OTA"].apply(normalize_channel)

        svid_to_pid = dict(zip(df_ota_valid["svid"], df_ota_valid["primary_property_id"]))
        pname_to_pid = dict(zip(df_props["property_name"].astype(str).str.strip().str.lower(), df_props["primary_property_id"]))

        for _, r in df_ota_valid.iterrows():
            pn = str(r["property_name_ota"]).strip().lower()
            if pn and pn not in pname_to_pid:
                pname_to_pid[pn] = r["primary_property_id"]

        reps_records = []
        valid_pids = set(df_props["primary_property_id"].values)

        for _, row in df_rm.iterrows():
            pid = None
            raw_svid = str(row.get("SVID", "")).strip()
            if raw_svid and raw_svid in svid_to_pid:
                pid = svid_to_pid[raw_svid]
            elif str(row.get("Property Name", "")).strip().lower() in pname_to_pid:
                pid = pname_to_pid[str(row.get("Property Name", "")).strip().lower()]

            if pid is not None and pid in valid_pids:
                reps_records.append({
                    "primary_property_id": pid,
                    "ota_channel": row["ota_channel"],
                    "agent_name": row["Agent Name"]
                })

        df_reps = pd.DataFrame(reps_records)
        if not df_reps.empty:
            df_reps.drop_duplicates(subset=["primary_property_id", "ota_channel", "agent_name"], inplace=True)

        # Clear existing master data
        db.query(PropertyRepresentative).delete()
        db.query(PropertyMaster).delete()
        db.flush()

        prop_objects = [
            PropertyMaster(
                primary_property_id=int(r["primary_property_id"]),
                svid=r["svid"] if pd.notna(r["svid"]) else None,
                property_name=str(r["property_name"]),
                sv_url=r["SV"],
                agoda_url=r["Agoda"],
                mmt_url=r["MMT"],
                booking_url=r["Booking"],
                airbnb_url=r["Airbnb"]
            )
            for _, r in df_props.iterrows()
        ]
        db.bulk_save_objects(prop_objects)
        db.flush()

        rep_objects = []
        if not df_reps.empty:
            rep_objects = [
                PropertyRepresentative(
                    primary_property_id=int(r["primary_property_id"]),
                    ota_channel=str(r["ota_channel"]),
                    agent_name=str(r["agent_name"])
                )
                for _, r in df_reps.iterrows()
            ]
            db.bulk_save_objects(rep_objects)

        db.commit()

        return {
            "status": "success",
            "properties_count": len(prop_objects),
            "representatives_count": len(rep_objects),
            "source_file": str(file_path)
        }

    except Exception as e:
        db.rollback()
        raise e
    finally:
        if owns_session:
            db.close()


if __name__ == "__main__":
    result = seed_master_registry()
    print(f"Master registry seeded successfully: {result}")
