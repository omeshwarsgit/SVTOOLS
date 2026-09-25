import uuid
import io
from datetime import datetime, date
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union
import pandas as pd
from sqlalchemy.orm import Session

from app.models.schemas import (
    PropertyMaster,
    PropertyRepresentative,
    ReconciliationBatch,
    Reservation,
    Discrepancy,
    MatrixRow,
    ReconciliationMatrix,
    AlertSummary,
    MISPrimaryMetrics,
    MISSecondaryMetrics,
    MISTabItem,
    MISDashboardData,
)
from app.services.parser import (
    load_su_file, 
    load_pms_file, 
    normalize_channel, 
    clean_date, 
    clean_int,
    extract_reconciliation_dfs,
)

CHANNELS = ["Gommt", "B.com", "Agoda", "Airbnb", "Others"]


def resolve_portal_url(prop: Optional[PropertyMaster], channel: str) -> str:
    """
    Target channel URL resolution:
    - Gommt -> properties_master.mmt_url
    - B.com -> properties_master.booking_url
    - Agoda -> properties_master.agoda_url
    - Airbnb -> properties_master.airbnb_url
    - Others -> properties_master.sv_url
    - Fallback: If resolved OTA link is 'not available' or empty, fall back to properties_master.sv_url.
      If that is also missing, resolve to 'not available'.
    """
    if not prop:
        return "not available"

    raw_url = "not available"
    if channel == "Gommt":
        raw_url = prop.mmt_url
    elif channel == "B.com":
        raw_url = prop.booking_url
    elif channel == "Agoda":
        raw_url = prop.agoda_url
    elif channel == "Airbnb":
        raw_url = prop.airbnb_url
    elif channel == "Others":
        raw_url = prop.sv_url

    if not raw_url or str(raw_url).strip() in ("", "nan", "none", "not available", "-"):
        return "not available"

    s_url = str(raw_url).strip()
    if s_url.count("http") > 1:
        parts = s_url.split("http")
        s_url = "http" + parts[1]

    return s_url.strip()


def resolve_assigned_representative(
    prop_id: Optional[int],
    channel: str,
    rep_map: Dict[Tuple[int, str], str],
    prop_name_rep_map: Dict[Tuple[str, str], str],
    property_name: Optional[str] = None
) -> str:
    """
    Representative resolution: Match (property_id, channel) against RM registry.
    Fall back to 'Unassigned' if no match exists.
    """
    if prop_id is not None and (prop_id, channel) in rep_map:
        return rep_map[(prop_id, channel)]

    if property_name:
        pn_clean = property_name.strip().lower()
        if (pn_clean, channel) in prop_name_rep_map:
            return prop_name_rep_map[(pn_clean, channel)]

    if prop_id is not None and (prop_id, "Others") in rep_map:
        return rep_map[(prop_id, "Others")]

    return "Unassigned"


def reconcile_mis_from_dfs(
    df_su_raw: pd.DataFrame,
    df_base_raw: pd.DataFrame,
    df_query_raw: Optional[pd.DataFrame] = None,
    db: Optional[Session] = None,
    su_filename: str = "SU_Report.xlsx",
    pms_filename: str = "PMS_Dump.xlsx",
) -> MISDashboardData:
    """
    Core deterministic reconciliation engine that ingests parsed SU, Base, and Query DataFrames,
    cross-references against the Property Master registry and RM mappings, builds operational tabs,
    computes live metrics, and optionally stores the audit batch in SQLite.
    """
    df_su = df_su_raw.copy()
    df_base = df_base_raw.copy()
    df_query = df_query_raw.copy() if df_query_raw is not None else pd.DataFrame()

    # 1. Clean Base repeated headers and standardize columns
    base_col_map = {str(c).strip().lower(): str(c).strip() for c in df_base.columns}
    b_id_col = base_col_map.get("booking_id", base_col_map.get("reservation id", base_col_map.get("id", "")))
    if b_id_col and b_id_col in df_base.columns:
        df_base_clean = df_base[df_base[b_id_col].astype(str).str.lower() != b_id_col.lower()].copy()
    else:
        df_base_clean = df_base.copy()

    # Standardize Base column accessors
    if "booking_id" not in df_base_clean.columns and b_id_col:
        df_base_clean["booking_id"] = df_base_clean[b_id_col]
    if "uid" not in df_base_clean.columns:
        u_col = base_col_map.get("uid", base_col_map.get("vendor booking id", ""))
        df_base_clean["uid"] = df_base_clean[u_col] if u_col else df_base_clean.get("booking_id", "")
    if "booking_status" not in df_base_clean.columns:
        bs_col = base_col_map.get("booking_status", base_col_map.get("status", ""))
        df_base_clean["booking_status"] = df_base_clean[bs_col] if bs_col else "Confirmed"
    if "primary_source" not in df_base_clean.columns:
        ps_col = base_col_map.get("primary_source", base_col_map.get("source of booking", base_col_map.get("source", "")))
        df_base_clean["primary_source"] = df_base_clean[ps_col] if ps_col else "Others"
    if "property_id" not in df_base_clean.columns:
        pid_col = base_col_map.get("property_id", base_col_map.get("su property id", ""))
        df_base_clean["property_id"] = df_base_clean[pid_col] if pid_col else None
    if "checkin" not in df_base_clean.columns:
        ci_col = base_col_map.get("checkin", base_col_map.get("check in date", base_col_map.get("check_in", "")))
        df_base_clean["checkin"] = df_base_clean[ci_col] if ci_col else None

    # 2. Standardize SU columns
    su_col_map = {str(c).strip().lower(): str(c).strip() for c in df_su.columns}
    res_id_col = su_col_map.get("reservation id", su_col_map.get("reservation_id", su_col_map.get("booking_id", "")))
    vendor_id_col = su_col_map.get("vendor booking id", su_col_map.get("vendor_booking_id", su_col_map.get("uid", "")))
    source_col = su_col_map.get("source of booking", su_col_map.get("source", su_col_map.get("primary_source", "")))
    su_prop_col = su_col_map.get("su property id", su_col_map.get("property_id", su_col_map.get("property id", "")))
    b_status_col = su_col_map.get("booking status", su_col_map.get("status", su_col_map.get("booking_status", "")))
    admin_col = su_col_map.get("current admin booking status", su_col_map.get("admin_status", su_col_map.get("admin booking status", "")))
    checkin_col = su_col_map.get("check in date", su_col_map.get("checkin", su_col_map.get("check_in", "")))
    checkout_col = su_col_map.get("check out date", su_col_map.get("checkout", su_col_map.get("check_out", "")))
    guest_col = su_col_map.get("guest name", su_col_map.get("guest_name", ""))

    df_su["Reservation ID"] = df_su[res_id_col] if res_id_col else df_su.index.astype(str)
    df_su["Vendor Booking Id"] = df_su[vendor_id_col] if vendor_id_col else ""
    df_su["Su Property ID"] = df_su[su_prop_col] if su_prop_col else None
    df_su["Booking Status"] = df_su[b_status_col] if b_status_col else "Confirmed"
    df_su["Source of Booking"] = df_su[source_col] if source_col else "Others"
    df_su["Current admin booking status"] = df_su[admin_col] if admin_col else ""
    df_su["Check In Date"] = df_su[checkin_col] if checkin_col else None
    df_su["Check Out Date"] = df_su[checkout_col] if checkout_col else None
    df_su["Guest Name"] = df_su[guest_col] if guest_col else "Guest"

    df_su["res_id_clean"] = df_su["Reservation ID"].astype(str).str.strip().str.lstrip("0")
    df_su["vendor_id_clean"] = df_su["Vendor Booking Id"].astype(str).str.strip().str.lstrip("0")
    df_su["channel"] = df_su["Source of Booking"].apply(normalize_channel)

    # Unique SU bookings
    df_su_unique = df_su.drop_duplicates(subset=["Reservation ID"], keep="last").copy()

    # 3. Load Property Masters & Representatives from DB
    prop_map: Dict[int, PropertyMaster] = {}
    prop_name_map: Dict[str, PropertyMaster] = {}
    rep_map: Dict[Tuple[int, str], str] = {}
    prop_name_rep_map: Dict[Tuple[str, str], str] = {}

    if db is not None:
        props = db.query(PropertyMaster).all()
        for p in props:
            prop_map[p.primary_property_id] = p
            prop_name_map[p.property_name.strip().lower()] = p

        reps = db.query(PropertyRepresentative).all()
        for r in reps:
            key = (r.primary_property_id, r.ota_channel)
            if key not in rep_map or rep_map[key].lower() == "owner":
                rep_map[key] = r.agent_name
            if r.primary_property_id in prop_map:
                pn = prop_map[r.primary_property_id].property_name.strip().lower()
                pn_key = (pn, r.ota_channel)
                if pn_key not in prop_name_rep_map or prop_name_rep_map[pn_key].lower() == "owner":
                    prop_name_rep_map[pn_key] = r.agent_name

    def enrich_item(
        row_id: str,
        res_id: str,
        vendor_id: Optional[str],
        guest_name: Optional[str],
        channel: str,
        su_status: Optional[str],
        pms_status: Optional[str],
        admin_status: Optional[str],
        prop_id_raw: any,
        check_in: any,
        check_out: any,
        match_type: str = "ID Match (uid)",
        notes: str = ""
    ) -> MISTabItem:
        clean_pid = clean_int(prop_id_raw)
        prop_obj = prop_map.get(clean_pid) if clean_pid else None
        p_name = prop_obj.property_name if prop_obj else (f"Property #{clean_pid}" if clean_pid else "Unknown Property")
        portal_url = resolve_portal_url(prop_obj, channel)
        rep = resolve_assigned_representative(clean_pid, channel, rep_map, prop_name_rep_map, p_name)

        ci_str = str(check_in)[:10] if pd.notna(check_in) and str(check_in).strip() not in ("", "-", "nan", "NaT") else None
        co_str = str(check_out)[:10] if pd.notna(check_out) and str(check_out).strip() not in ("", "-", "nan", "NaT") else None

        v_id = str(vendor_id).strip() if pd.notna(vendor_id) and str(vendor_id).strip() not in ("", "nan") else None
        g_name = str(guest_name).strip() if pd.notna(guest_name) and str(guest_name).strip() not in ("", "nan") else "Unknown Guest"

        return MISTabItem(
            id=str(row_id),
            reservation_id=str(res_id),
            vendor_booking_id=v_id,
            guest_name=g_name,
            channel=channel,
            su_status=su_status,
            pms_status=pms_status,
            admin_status=admin_status,
            property_id=clean_pid,
            property_name=p_name,
            target_portal_url=portal_url,
            assigned_representative=rep,
            check_in=ci_str,
            check_out=co_str,
            match_type=match_type,
            notes=notes
        )

    # 4. Build Base lookups
    base_by_uid: Dict[str, Any] = {}
    base_by_prop_date: Dict[Tuple[str, str], Any] = {}

    for idx, r in df_base_clean.iterrows():
        u = str(r.get("uid", "")).strip()
        b_id = str(r.get("booking_id", "")).strip()
        if u and u != "nan":
            base_by_uid[u] = r
            base_by_uid[u.lstrip("0")] = r
        if b_id and b_id != "nan":
            base_by_uid[b_id] = r
            base_by_uid[b_id.lstrip("0")] = r

        p = str(clean_int(r.get("property_id"))) if clean_int(r.get("property_id")) else ""
        c = str(r.get("checkin", ""))[:10]
        if p and c and c not in ("nan", "NaT", ""):
            base_by_prop_date[(p, c)] = r

    # 5. Classify SU bookings
    all_su_items: List[MISTabItem] = []
    matched_items: List[MISTabItem] = []
    mismatched_items: List[MISTabItem] = []
    missing_in_pms_items: List[MISTabItem] = []
    canc_pending_items: List[MISTabItem] = []
    conf_su_canc_pms_items: List[MISTabItem] = []
    matched_pms_booking_ids = set()

    for idx, r in df_su_unique.iterrows():
        res_id = str(r["Reservation ID"]).strip()
        vendor_id = str(r.get("Vendor Booking Id", "")).strip()
        prop_id_val = r.get("Su Property ID")
        checkin_val = r.get("Check In Date")
        checkout_val = r.get("Check Out Date")
        guest = r.get("Guest Name")
        channel = r["channel"]
        su_status = str(r.get("Booking Status", "")).strip()
        admin_status = str(r.get("Current admin booking status", "")).strip()
        admin_lower = admin_status.lower()

        # Match against Base
        match_row = None
        match_type = "None"

        clean_v = vendor_id.lstrip("0") if vendor_id else ""
        clean_r = res_id.lstrip("0") if res_id else ""

        if clean_v and clean_v in base_by_uid:
            match_row = base_by_uid[clean_v]
            match_type = "ID Match (Vendor ID)"
        elif clean_r and clean_r in base_by_uid:
            match_row = base_by_uid[clean_r]
            match_type = "ID Match (Reservation ID)"
        else:
            p_str = str(clean_int(prop_id_val)) if clean_int(prop_id_val) else ""
            c_str = str(checkin_val)[:10] if pd.notna(checkin_val) else ""
            if (p_str, c_str) in base_by_prop_date:
                match_row = base_by_prop_date[(p_str, c_str)]
                match_type = "Fuzzy (Property + Date)"

        pms_status = None
        if match_row is not None:
            pms_status = str(match_row.get("booking_status", "")).strip()
            matched_pms_booking_ids.add(str(match_row.get("booking_id", "")).strip())

        item = enrich_item(
            row_id=f"su_{idx}",
            res_id=res_id,
            vendor_id=vendor_id,
            guest_name=guest,
            channel=channel,
            su_status=su_status,
            pms_status=pms_status,
            admin_status=admin_status,
            prop_id_raw=prop_id_val,
            check_in=checkin_val,
            check_out=checkout_val,
            match_type=match_type,
            notes=f"Admin: {admin_status}" if admin_status else ""
        )
        all_su_items.append(item)

        # Check Cancellation Pending
        if su_status == "Confirmed" and admin_lower in ("cancelled", "tentative"):
            item_cp = enrich_item(
                row_id=f"cp_{idx}",
                res_id=res_id,
                vendor_id=vendor_id,
                guest_name=guest,
                channel=channel,
                su_status=su_status,
                pms_status=pms_status or "unmatched",
                admin_status=admin_status,
                prop_id_raw=prop_id_val,
                check_in=checkin_val,
                check_out=checkout_val,
                match_type=match_type,
                notes="SU Confirmed with Admin Cancellation Pending"
            )
            canc_pending_items.append(item_cp)

        # Matched vs Mismatched vs Missing
        if match_row is not None:
            if su_status.lower() == str(pms_status).lower():
                matched_items.append(item)
            else:
                mismatched_items.append(item)
                if su_status == "Confirmed" and str(pms_status).lower() in ("cancelled", "notconverted"):
                    conf_su_canc_pms_items.append(item)
        else:
            missing_in_pms_items.append(item)

    # 6. Missing in SU & PMS Special Status
    missing_in_su_items: List[MISTabItem] = []
    pms_special_status_items: List[MISTabItem] = []
    su_clean_ids = set(df_su_unique["res_id_clean"].values).union(set(df_su_unique["vendor_id_clean"].values))

    for idx, r in df_base_clean.iterrows():
        b_id = str(r.get("booking_id", "")).strip()
        uid = str(r.get("uid", "")).strip()
        b_status = str(r.get("booking_status", "")).strip()
        ch = normalize_channel(r.get("primary_source", ""))

        if b_status.lower() in ("tentative", "no-show"):
            pms_special_status_items.append(enrich_item(
                row_id=f"spec_{idx}",
                res_id=uid or b_id,
                vendor_id=b_id,
                guest_name="PMS Guest",
                channel=ch,
                su_status="Not in SU",
                pms_status=b_status,
                admin_status=None,
                prop_id_raw=r.get("property_id"),
                check_in=r.get("checkin"),
                check_out=None,
                match_type="PMS Direct",
                notes=f"Special status: {b_status}"
            ))

        clean_bid = b_id.lstrip("0")
        clean_u = uid.lstrip("0")
        if b_id not in matched_pms_booking_ids and clean_bid not in su_clean_ids and clean_u not in su_clean_ids:
            missing_in_su_items.append(enrich_item(
                row_id=f"pms_{idx}",
                res_id=uid or b_id,
                vendor_id=b_id,
                guest_name="PMS Guest",
                channel=ch,
                su_status="Not in SU",
                pms_status=b_status,
                admin_status=None,
                prop_id_raw=r.get("property_id"),
                check_in=r.get("checkin"),
                check_out=None,
                match_type="PMS Only",
                notes="Present in PMS Base Dump, not found in SU"
            ))

    # 7. Base vs Query Mismatch & Query Not in Base
    query_not_in_base_items: List[MISTabItem] = []
    base_vs_query_mismatch_items: List[MISTabItem] = []

    if df_query is not None and not df_query.empty:
        q_cols = {str(c).strip().lower(): str(c).strip() for c in df_query.columns}
        q_id_col = q_cols.get("id", q_cols.get("booking_id", ""))
        q_prop_col = q_cols.get("property_id", q_cols.get("su property id", ""))
        q_src_col = q_cols.get("primary_source", q_cols.get("source of booking", ""))
        q_ci_col = q_cols.get("checkin", q_cols.get("check in date", ""))
        q_co_col = q_cols.get("checkout", q_cols.get("check out date", ""))
        q_st_col = q_cols.get("status", q_cols.get("booking_status", ""))

        df_query_calc = df_query.copy()
        df_query_calc["checkin_str"] = pd.to_datetime(df_query_calc[q_ci_col], errors="coerce").dt.strftime("%Y-%m-%d") if q_ci_col else ""
        df_base_clean["checkin_str"] = pd.to_datetime(df_base_clean["checkin"], errors="coerce").dt.strftime("%Y-%m-%d")
        df_query_calc["prop_str"] = df_query_calc[q_prop_col].apply(clean_int).astype(str) if q_prop_col else ""
        df_base_clean["prop_str"] = df_base_clean["property_id"].apply(clean_int).astype(str)

        b_keys = set(zip(df_base_clean["prop_str"], df_base_clean["checkin_str"]))

        for idx, qr in df_query_calc.iterrows():
            key = (qr["prop_str"], qr["checkin_str"])
            q_status = str(qr.get(q_st_col, "")).strip() if q_st_col else ""
            ch = normalize_channel(qr.get(q_src_col, "")) if q_src_col else "Others"
            qid = str(qr.get(q_id_col, "")).strip() if q_id_col else str(idx)

            if key not in b_keys:
                query_not_in_base_items.append(enrich_item(
                    row_id=f"qnb_{idx}",
                    res_id=qid,
                    vendor_id=qid,
                    guest_name="Query Guest",
                    channel=ch,
                    su_status=None,
                    pms_status=q_status,
                    admin_status=None,
                    prop_id_raw=qr.get(q_prop_col) if q_prop_col else None,
                    check_in=qr.get(q_ci_col) if q_ci_col else None,
                    check_out=qr.get(q_co_col) if q_co_col else None,
                    match_type="Query Dump",
                    notes="Query record missing from Base Dump"
                ))
            else:
                matches = df_base_clean[(df_base_clean["prop_str"] == qr["prop_str"]) & (df_base_clean["checkin_str"] == qr["checkin_str"])]
                if not matches.empty:
                    base_match = matches.iloc[0]
                    b_status = str(base_match.get("booking_status", "")).strip()

                    def norm_s(s):
                        s = str(s).lower().strip()
                        if s in ("converted", "confirmed"): return "confirmed"
                        if s in ("cancelled", "notconverted"): return "cancelled"
                        return s

                    if norm_s(q_status) != norm_s(b_status):
                        base_vs_query_mismatch_items.append(enrich_item(
                            row_id=f"bqm_{idx}",
                            res_id=qid,
                            vendor_id=str(base_match.get("booking_id", "")),
                            guest_name="Query Guest",
                            channel=ch,
                            su_status=f"Base: {b_status}",
                            pms_status=f"Query: {q_status}",
                            admin_status=None,
                            prop_id_raw=qr.get(q_prop_col) if q_prop_col else None,
                            check_in=qr.get(q_ci_col) if q_ci_col else None,
                            check_out=qr.get(q_co_col) if q_co_col else None,
                            match_type="Base vs Query Join",
                            notes=f"Base: {b_status} vs Query: {q_status}"
                        ))

    # 8. Compute Real Dynamic Metrics
    total_su_cnt = len(all_su_items)

    primary_metrics = MISPrimaryMetrics(
        total_bookings=total_su_cnt,
        matched=len(matched_items),
        mismatched=len(mismatched_items),
        missing=len(missing_in_pms_items),
        cancellation_pending=len(canc_pending_items),
    )

    secondary_metrics = MISSecondaryMetrics(
        pms_base_rows=len(df_base_clean),
        pms_query_rows=len(df_query) if df_query is not None else 0,
        pms_tentative_noshow=len(pms_special_status_items),
        pms_not_found_in_su=len(missing_in_su_items),
        base_vs_query_mismatch=len(base_vs_query_mismatch_items),
        query_missing_in_base=len(query_not_in_base_items),
        su_status_unclear=0,
    )

    tab_counts = {
        "cancellation_pending": len(canc_pending_items),
        "confirmed_su_cancelled_pms": len(conf_su_canc_pms_items),
        "missing_in_pms": len(missing_in_pms_items),
        "missing_in_su": len(missing_in_su_items),
        "pms_special_status": len(pms_special_status_items),
        "base_vs_query_mismatch": len(base_vs_query_mismatch_items),
        "query_not_in_base": len(query_not_in_base_items),
        "all_su_bookings": len(all_su_items),
    }

    tabs_data = {
        "cancellation_pending": canc_pending_items,
        "confirmed_su_cancelled_pms": conf_su_canc_pms_items,
        "missing_in_pms": missing_in_pms_items,
        "missing_in_su": missing_in_su_items,
        "pms_special_status": pms_special_status_items,
        "base_vs_query_mismatch": base_vs_query_mismatch_items,
        "query_not_in_base": query_not_in_base_items,
        "all_su_bookings": all_su_items,
    }

    batch_id = str(uuid.uuid4())
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    # 9. Persist to SQLite Database for Claude Export & Audit Log
    if db is not None:
        try:
            batch = ReconciliationBatch(
                batch_id=batch_id,
                upload_date=date.today(),
                su_filename=su_filename,
                pms_filename=pms_filename,
                total_su_records=total_su_cnt,
                total_pms_records=len(df_base_clean),
            )
            db.add(batch)
            db.flush()

            disc_records = []
            for item in canc_pending_items:
                disc_records.append(Discrepancy(
                    batch_id=batch_id,
                    reservation_id=item.reservation_id,
                    channel=item.channel,
                    status_category=item.su_status or "Confirmed",
                    discrepancy_type="IN_TRANSIT_CANCELLATION",
                    property_id=item.property_id,
                    property_name=item.property_name,
                    assigned_representative=item.assigned_representative,
                    target_portal_url=item.target_portal_url,
                    guest_name=item.guest_name,
                    check_in=clean_date(item.check_in),
                    check_out=clean_date(item.check_out),
                ))
            for item in conf_su_canc_pms_items:
                disc_records.append(Discrepancy(
                    batch_id=batch_id,
                    reservation_id=item.reservation_id,
                    channel=item.channel,
                    status_category="Confirmed",
                    discrepancy_type="STATUS_MISMATCH",
                    property_id=item.property_id,
                    property_name=item.property_name,
                    assigned_representative=item.assigned_representative,
                    target_portal_url=item.target_portal_url,
                    guest_name=item.guest_name,
                    check_in=clean_date(item.check_in),
                    check_out=clean_date(item.check_out),
                ))
            for item in missing_in_pms_items:
                disc_records.append(Discrepancy(
                    batch_id=batch_id,
                    reservation_id=item.reservation_id,
                    channel=item.channel,
                    status_category=item.su_status or "Unknown",
                    discrepancy_type="MISSING_IN_PMS",
                    property_id=item.property_id,
                    property_name=item.property_name,
                    assigned_representative=item.assigned_representative,
                    target_portal_url=item.target_portal_url,
                    guest_name=item.guest_name,
                    check_in=clean_date(item.check_in),
                    check_out=clean_date(item.check_out),
                ))
            for item in missing_in_su_items:
                disc_records.append(Discrepancy(
                    batch_id=batch_id,
                    reservation_id=item.reservation_id,
                    channel=item.channel,
                    status_category="Unknown",
                    discrepancy_type="MISSING_IN_SU",
                    property_id=item.property_id,
                    property_name=item.property_name,
                    assigned_representative=item.assigned_representative,
                    target_portal_url=item.target_portal_url,
                    guest_name=item.guest_name,
                    check_in=clean_date(item.check_in),
                    check_out=clean_date(item.check_out),
                ))

            if disc_records:
                db.bulk_save_objects(disc_records)
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"Warning: Failed to save batch to DB: {e}")

    return MISDashboardData(
        batch_id=batch_id,
        last_run=f"{now_str} • {total_su_cnt:,} SU bookings reconciled",
        primary_metrics=primary_metrics,
        secondary_metrics=secondary_metrics,
        tab_counts=tab_counts,
        tabs_data=tabs_data,
    )


def reconcile_uploaded_files(
    files: List[Tuple[str, bytes]],
    db: Optional[Session] = None,
) -> MISDashboardData:
    """
    Ingest and reconcile one or more uploaded files (.xlsx, .xls, .csv).
    Automatically extracts SU, PMS Base, and Query dumps, pairs them, and runs reconciliation.
    """
    df_su, df_base, df_query = extract_reconciliation_dfs(files)
    su_fname = files[0][0] if files else "SU_Report.xlsx"
    pms_fname = files[1][0] if len(files) > 1 else files[0][0]

    return reconcile_mis_from_dfs(
        df_su_raw=df_su,
        df_base_raw=df_base,
        df_query_raw=df_query,
        db=db,
        su_filename=su_fname,
        pms_filename=pms_fname,
    )


def reconcile_mis_workbook(
    file_bytes_or_path: Union[str, bytes, io.BytesIO, Path],
    db: Optional[Session] = None,
    filename: str = "SU__Cancelled_Bookings.xlsx",
) -> MISDashboardData:
    """
    Reconcile SU – PMS Booking Reconciliation MIS from single workbook or path.
    """
    raw_bytes: bytes
    fname = filename

    if isinstance(file_bytes_or_path, (str, Path)):
        fname = Path(file_bytes_or_path).name
        with open(file_bytes_or_path, "rb") as f:
            raw_bytes = f.read()
    elif isinstance(file_bytes_or_path, bytes):
        raw_bytes = file_bytes_or_path
    elif hasattr(file_bytes_or_path, "read"):
        raw_bytes = file_bytes_or_path.read()
    else:
        raise ValueError("Invalid file input")

    return reconcile_uploaded_files([(fname, raw_bytes)], db=db)


# Retain reconcile_datasets for test_reconciliation.py and Claude handoff
def reconcile_datasets(
    su_file_source: Any,
    pms_file_source: Any,
    su_filename: str = "SU_Report.xlsx",
    pms_filename: str = "PMS_Report.xls",
    upload_date: Optional[date] = None,
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    if upload_date is None:
        upload_date = date.today()

    batch_id = str(uuid.uuid4())
    df_su = load_su_file(su_file_source)
    df_pms = load_pms_file(pms_file_source)

    prop_map: Dict[int, PropertyMaster] = {}
    prop_name_map: Dict[str, PropertyMaster] = {}
    rep_map: Dict[Tuple[int, str], str] = {}
    prop_name_rep_map: Dict[Tuple[str, str], str] = {}

    if db is not None:
        props = db.query(PropertyMaster).all()
        for p in props:
            prop_map[p.primary_property_id] = p
            prop_name_map[p.property_name.strip().lower()] = p

        reps = db.query(PropertyRepresentative).all()
        for r in reps:
            key = (r.primary_property_id, r.ota_channel)
            if key not in rep_map or rep_map[key].lower() == "owner":
                rep_map[key] = r.agent_name
            if r.primary_property_id in prop_map:
                pn = prop_map[r.primary_property_id].property_name.strip().lower()
                pn_key = (pn, r.ota_channel)
                if pn_key not in prop_name_rep_map or prop_name_rep_map[pn_key].lower() == "owner":
                    prop_name_rep_map[pn_key] = r.agent_name

    su_res_ids = set(df_su["Reservation ID"].dropna().unique())
    pms_res_ids = set(df_pms["Reservation ID"].dropna().unique())

    su_dict = {(row["Reservation ID"], row["Booking Status"]): row for _, row in df_su.iterrows()}
    pms_dict = {(row["Reservation ID"], row["Booking Status"]): row for _, row in df_pms.iterrows()}

    discrepancy_records: List[Dict[str, Any]] = []
    seen = set()

    def add_disc(res_id, channel, status_cat, disc_type, pid, pname, guest, ci, co):
        k = (res_id, channel, status_cat, disc_type)
        if k in seen:
            return
        seen.add(k)
        p_obj = prop_map.get(pid) if pid else None
        p_name = pname or (p_obj.property_name if p_obj else (f"Property #{pid}" if pid else "Unknown Property"))
        t_url = resolve_portal_url(p_obj, channel)
        rep = resolve_assigned_representative(pid, channel, rep_map, prop_name_rep_map, p_name)
        discrepancy_records.append({
            "batch_id": batch_id,
            "reservation_id": res_id,
            "channel": channel,
            "status_category": status_cat,
            "discrepancy_type": disc_type,
            "property_id": pid,
            "property_name": p_name,
            "assigned_representative": rep,
            "target_portal_url": t_url,
            "guest_name": guest,
            "check_in": ci,
            "check_out": co,
        })

    all_keys = set(su_dict.keys()).union(set(pms_dict.keys()))
    for res_id, b_status in all_keys:
        in_su = (res_id, b_status) in su_dict
        in_pms = (res_id, b_status) in pms_dict
        if in_su and not in_pms:
            row = su_dict[(res_id, b_status)]
            dt = "STATUS_MISMATCH" if res_id in pms_res_ids else "MISSING_IN_PMS"
            add_disc(res_id, row["channel"], b_status, dt, row["clean_property_id"], None, str(row["Guest Name"]), row["clean_check_in"], row["clean_check_out"])
        elif in_pms and not in_su:
            row = pms_dict[(res_id, b_status)]
            dt = "STATUS_MISMATCH" if res_id in su_res_ids else "MISSING_IN_SU"
            add_disc(res_id, row["channel"], b_status, dt, row["clean_property_id"], None, str(row["Guest Name"]), row["clean_check_in"], row["clean_check_out"])

    for _, row in df_su.iterrows():
        b_status = str(row["Booking Status"]).strip()
        admin_status = str(row.get("Current admin booking status", "")).strip().lower()
        if b_status == "Confirmed" and admin_status in ("cancelled", "tentative"):
            add_disc(row["Reservation ID"], row["channel"], "Confirmed", "IN_TRANSIT_CANCELLATION", row["clean_property_id"], None, str(row["Guest Name"]), row["clean_check_in"], row["clean_check_out"])
        if row.get("clean_check_flag") == 1.0:
            add_disc(row["Reservation ID"], row["channel"], b_status, "CUSTOMER_CONCERN", row["clean_property_id"], None, str(row["Guest Name"]), row["clean_check_in"], row["clean_check_out"])
        if b_status in ("Modified", "R"):
            add_disc(row["Reservation ID"], row["channel"], "In-Transit", "EDGE_STATUS", row["clean_property_id"], None, str(row["Guest Name"]), row["clean_check_in"], row["clean_check_out"])

    confirmed_matrix_rows = []
    su_conf = df_su[df_su["Booking Status"] == "Confirmed"]
    pms_conf = df_pms[df_pms["Booking Status"] == "Confirmed"]
    for ch in CHANNELS:
        s_cnt = int((su_conf["channel"] == ch).sum())
        p_cnt = int((pms_conf["channel"] == ch).sum())
        confirmed_matrix_rows.append(MatrixRow(channel=ch, su=s_cnt, pms=p_cnt, variance=s_cnt - p_cnt))

    cancelled_matrix_rows = []
    su_canc = df_su[df_su["Booking Status"] == "Cancelled"]
    pms_canc = df_pms[df_pms["Booking Status"] == "Cancelled"]
    for ch in CHANNELS:
        s_cnt = int((su_canc["channel"] == ch).sum())
        p_cnt = int((pms_canc["channel"] == ch).sum())
        cancelled_matrix_rows.append(MatrixRow(channel=ch, su=s_cnt, pms=p_cnt, variance=s_cnt - p_cnt))

    reconciliation_matrix = ReconciliationMatrix(confirmed=confirmed_matrix_rows, cancelled=cancelled_matrix_rows)
    alert_summary = AlertSummary(
        in_transit_count=sum(1 for d in discrepancy_records if d["discrepancy_type"] == "IN_TRANSIT_CANCELLATION"),
        customer_concern_count=sum(1 for d in discrepancy_records if d["discrepancy_type"] == "CUSTOMER_CONCERN"),
        edge_status_count=sum(1 for d in discrepancy_records if d["discrepancy_type"] == "EDGE_STATUS"),
        missing_in_pms_count=sum(1 for d in discrepancy_records if d["discrepancy_type"] == "MISSING_IN_PMS"),
        missing_su_count=sum(1 for d in discrepancy_records if d["discrepancy_type"] == "MISSING_IN_SU"),
        status_mismatch_count=sum(1 for d in discrepancy_records if d["discrepancy_type"] == "STATUS_MISMATCH"),
        total_discrepancies=len(discrepancy_records),
    )

    if db is not None:
        batch = ReconciliationBatch(
            batch_id=batch_id,
            upload_date=upload_date,
            su_filename=su_filename,
            pms_filename=pms_filename,
            total_su_records=len(df_su),
            total_pms_records=len(df_pms),
        )
        db.add(batch)
        db.flush()

        res_objs = [
            Reservation(
                batch_id=batch_id,
                reservation_id=str(r["Reservation ID"]),
                property_id=r["clean_property_id"],
                guest_name=str(r["Guest Name"]) if pd.notna(r["Guest Name"]) else None,
                channel=r["channel"],
                booking_status=str(r["Booking Status"]),
                check_in=r["clean_check_in"],
                check_out=r["clean_check_out"],
                source_system="SU",
                raw_source_string=str(r["Source of Booking"]) if pd.notna(r["Source of Booking"]) else None,
                admin_booking_status=str(r["Current admin booking status"]) if pd.notna(r["Current admin booking status"]) else None,
                check_flag=r["clean_check_flag"],
            ) for _, r in df_su.iterrows()
        ]
        res_objs += [
            Reservation(
                batch_id=batch_id,
                reservation_id=str(r["Reservation ID"]),
                property_id=r["clean_property_id"],
                guest_name=str(r["Guest Name"]) if pd.notna(r["Guest Name"]) else None,
                channel=r["channel"],
                booking_status=str(r["Booking Status"]),
                check_in=r["clean_check_in"],
                check_out=r["clean_check_out"],
                source_system="PMS",
                raw_source_string=str(r["Source of Booking"]) if pd.notna(r["Source of Booking"]) else None,
            ) for _, r in df_pms.iterrows()
        ]
        db.bulk_save_objects(res_objs)
        db.flush()

        disc_objects = [Discrepancy(**rec) for rec in discrepancy_records]
        db.bulk_save_objects(disc_objects)
        db.commit()

    return {
        "batch_id": batch_id,
        "upload_date": upload_date,
        "su_filename": su_filename,
        "pms_filename": pms_filename,
        "total_su_records": len(df_su),
        "total_pms_records": len(df_pms),
        "created_at": datetime.now(),
        "matrix": reconciliation_matrix,
        "alerts": alert_summary,
        "discrepancies_count": len(discrepancy_records),
    }
