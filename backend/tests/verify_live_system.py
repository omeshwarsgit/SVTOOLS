import io
import os
import zipfile
import httpx
from pathlib import Path

BASE_URL = "http://localhost:8000/api/v1"

def test_live_system():
    client = httpx.Client(timeout=30.0)

    print("=== 1. Testing Health & Root ===")
    r = client.get("http://localhost:8000/")
    assert r.status_code == 200, f"Root failed: {r.status_code}"
    print("✓ Backend is alive:", r.json())

    print("\n=== 2. Testing File List from Workspace ===")
    r = client.get(f"{BASE_URL}/files/workspace")
    assert r.status_code == 200, f"Workspace files failed: {r.status_code}"
    files = r.json()
    print(f"✓ Found {len(files)} files in workspace. Sample: {[f['name'] for f in files[:3]]}")
    assert len(files) > 0, "No workspace files found"

    print("\n=== 3. Testing File Select (Loading Workspace File) ===")
    sample_file_path = files[0]["path"]
    r = client.post(f"{BASE_URL}/mis/select-file", params={"file_path": sample_file_path})
    assert r.status_code == 200, f"Select file failed: {r.text}"
    selected_data = r.json()
    assert selected_data.get("primary_metrics") is not None
    print(f"✓ Successfully selected & processed workspace file: {Path(sample_file_path).name}")
    print(f"  Primary metrics: {selected_data['primary_metrics']}")
    print(f"  Tab counts: {selected_data['tab_counts']}")

    print("\n=== 4. Testing Multi-Format File Uploads ===")
    # 4a. Uploading standard SU bookings workbook (.xlsx)
    with open("data/SU__Cancelled_Bookings.xlsx", "rb") as f:
        r = client.post(
            f"{BASE_URL}/mis/process", 
            files=[("files", ("SU__Cancelled_Bookings.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))]
        )
    assert r.status_code == 200, f"Processing SU__Cancelled_Bookings.xlsx failed: {r.text}"
    wb_data = r.json()
    print(f"✓ Single .xlsx upload succeeded. Total bookings: {wb_data['primary_metrics']['total_bookings']}")

    # 4b. Uploading 180-day legacy .xls report
    with open("data/ota_reservation_180day_report_1107_2026-09-24.xls", "rb") as f:
        r = client.post(
            f"{BASE_URL}/mis/process", 
            files=[("files", ("ota_reservation_180day_report_1107_2026-09-24.xls", f, "application/vnd.ms-excel"))]
        )
    assert r.status_code == 200, f"Processing 180-day report failed: {r.text}"
    xls_data = r.json()
    print(f"✓ 180-day legacy PMS .xls report upload succeeded without crash. Discrepancies: {xls_data['tab_counts']}")

    # 4c. Uploading CSV format
    csv_bytes = b"booking_id,property_id,checkin,checkout,booking_status,primary_source\n12345,101,2026-10-01,2026-10-05,Confirmed,Gommt\n"
    r = client.post(
        f"{BASE_URL}/mis/process", 
        files=[("files", ("custom_bookings.csv", csv_bytes, "text/csv"))]
    )
    assert r.status_code == 200, f"Processing CSV failed: {r.text}"
    csv_data = r.json()
    print(f"✓ CSV upload succeeded seamlessly. Total bookings: {csv_data['primary_metrics']['total_bookings']}")

    # 4d. Uploading separate SU and PMS files simultaneously
    with open("data/SU__Cancelled_Bookings.xlsx", "rb") as f_wb, open("data/ota_reservation_180day_report_1107_2026-09-24.xls", "rb") as f_pms:
        r = client.post(
            f"{BASE_URL}/mis/process",
            files=[
                ("files", ("SU__Cancelled_Bookings.xlsx", f_wb, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")),
                ("files", ("ota_reservation_180day_report_1107_2026-09-24.xls", f_pms, "application/vnd.ms-excel"))
            ]
        )
    assert r.status_code == 200, f"Multi-file upload failed: {r.text}"
    dual_data = r.json()
    print(f"✓ Dual file upload (SU + PMS separate) succeeded seamlessly. Total bookings: {dual_data['primary_metrics']['total_bookings']}")

    print("\n=== 5. Testing Tab Excel (.xlsx) and CSV Downloads ===")
    tabs = [
        "cancellation_pending", 
        "confirmed_su_cancelled_pms", 
        "missing_in_pms",
        "missing_in_su",
        "all_su_bookings"
    ]
    for tab in tabs:
        # XLSX export
        r = client.get(f"{BASE_URL}/mis/export/{tab}?format=xlsx")
        assert r.status_code == 200, f"XLSX Export for tab {tab} failed: {r.status_code}"
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd, f"Missing attachment Content-Disposition: {cd}"
        assert ".xlsx" in cd, f"Filename not .xlsx in {cd}"
        assert r.content[:4] == b"PK\x03\x04", "File is not a valid zip/xlsx archive"
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        assert "[Content_Types].xml" in zf.namelist()
        print(f"✓ Tab '{tab}' XLSX verified: {len(r.content)} bytes, header: {cd.split('filename=')[-1]}")

        # CSV export
        r = client.get(f"{BASE_URL}/mis/export/{tab}?format=csv")
        assert r.status_code == 200, f"CSV Export for tab {tab} failed: {r.status_code}"
        cd = r.headers.get("content-disposition", "")
        assert ".csv" in cd, f"Filename not .csv in {cd}"
        assert r.content.startswith(b"\xef\xbb\xbf"), "Missing UTF-8 BOM in CSV"
        print(f"✓ Tab '{tab}' CSV verified: {len(r.content)} bytes, BOM present")

    print("\n=== 6. Testing Claude Payload Export (CSV with UTF-8-SIG & XLSX) ===")
    # 6a. CSV
    r = client.get(f"{BASE_URL}/export/claude-payload?format=csv")
    assert r.status_code == 200, f"Claude CSV export failed: {r.text}"
    cd = r.headers.get("content-disposition", "")
    assert ".csv" in cd, f"Filename not .csv: {cd}"
    assert r.content.startswith(b"\xef\xbb\xbf"), "CSV missing UTF-8 BOM"
    lines = r.text.strip().split("\n")
    print(f"✓ Claude CSV export verified: {len(lines)} lines, BOM present, header: {lines[0][:60]}...")

    # 6b. XLSX
    r = client.get(f"{BASE_URL}/export/claude-payload?format=xlsx")
    assert r.status_code == 200, f"Claude XLSX export failed: {r.text}"
    cd = r.headers.get("content-disposition", "")
    assert ".xlsx" in cd, f"Filename not .xlsx: {cd}"
    assert r.content[:4] == b"PK\x03\x04", "File not valid xlsx"
    print(f"✓ Claude XLSX export verified: {len(r.content)} bytes, header: {cd.split('filename=')[-1]}")

    print("\n=== 7. Testing In-App File Download Endpoint ===")
    r = client.get(f"{BASE_URL}/files/download", params={"file_path": sample_file_path})
    assert r.status_code == 200, f"File download failed: {r.status_code}"
    cd = r.headers.get("content-disposition", "")
    assert "attachment" in cd
    print(f"✓ Direct file download verified for '{Path(sample_file_path).name}': {len(r.content)} bytes")

    print("\n=== 8. Testing In-App File Preview Endpoint ===")
    r = client.get(f"{BASE_URL}/files/preview", params={"file_path": sample_file_path})
    assert r.status_code == 200
    preview = r.json()
    assert "columns" in preview and "rows" in preview
    print(f"✓ File preview verified: {len(preview['columns'])} columns, {len(preview['rows'])} preview rows")

    print("\n ALL LIVE ENDPOINTS & FILE PIPELINES VERIFIED SUCCESSFULLY!")

if __name__ == "__main__":
    test_live_system()
