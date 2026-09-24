import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.core.database import SessionLocal, engine, Base
from app.models.schemas import PropertyMaster, PropertyRepresentative, ReconciliationBatch, Discrepancy
from app.services.seeder import seed_master_registry
from app.services.reconciler import reconcile_datasets
from app.services.exporter import generate_claude_export


def test_full_pipeline():
    print("=== 1. Testing Database & Master Registry Seeding ===")
    db = SessionLocal()
    try:
        prop_count = db.query(PropertyMaster).count()
        rep_count = db.query(PropertyRepresentative).count()
        print(f"Initial: {prop_count} properties, {rep_count} representatives")
        if prop_count == 0:
            res = seed_master_registry(db=db)
            print(f"Seeded: {res}")
            prop_count = db.query(PropertyMaster).count()
            rep_count = db.query(PropertyRepresentative).count()

        assert prop_count > 0, "No properties found in master registry!"
        assert rep_count > 0, "No representatives found!"
        print(f"✓ Master Registry has {prop_count} properties and {rep_count} representatives.")

        print("\n=== 2. Testing Reconciliation Engine ===")
        su_path = settings.DEFAULT_SU_PATH
        pms_path = settings.DEFAULT_PMS_PATH
        assert os.path.exists(su_path), f"SU file missing: {su_path}"
        assert os.path.exists(pms_path), f"PMS file missing: {pms_path}"

        with open(su_path, "rb") as f_su, open(pms_path, "rb") as f_pms:
            su_bytes = f_su.read()
            pms_bytes = f_pms.read()

        recon_result = reconcile_datasets(
            su_file_source=su_bytes,
            pms_file_source=pms_bytes,
            su_filename="SU__Cancelled_Bookings.xlsx",
            pms_filename="ota_reservation_180day_report_1107_2026-09-24.xls",
            db=db,
        )

        batch_id = recon_result["batch_id"]
        print(f"✓ Reconciliation completed! Batch ID: {batch_id}")
        print(f"Total SU records: {recon_result['total_su_records']}")
        print(f"Total PMS records: {recon_result['total_pms_records']}")
        print(f"Total Discrepancies: {recon_result['discrepancies_count']}")

        print("\n--- Confirmed Bookings Matrix ---")
        for row in recon_result["matrix"].confirmed:
            print(f"  Channel: {row.channel:<10} | SU: {row.su:<6} | PMS: {row.pms:<6} | Variance: {row.variance:<4}")

        print("\n--- Cancelled Bookings Matrix ---")
        for row in recon_result["matrix"].cancelled:
            print(f"  Channel: {row.channel:<10} | SU: {row.su:<6} | PMS: {row.pms:<6} | Variance: {row.variance:<4}")

        print("\n--- Operational Alerts ---")
        alerts = recon_result["alerts"]
        print(f"  In-Transit Cancellations: {alerts.in_transit_count}")
        print(f"  Review Holds (Check=1.0): {alerts.customer_concern_count}")
        print(f"  Edge Status (Modified/R): {alerts.edge_status_count}")
        print(f"  Missing in PMS:           {alerts.missing_in_pms_count}")
        print(f"  Missing in SU:            {alerts.missing_in_su_count}")
        print(f"  Status Mismatch:          {alerts.status_mismatch_count}")

        print("\n=== 3. Testing Claude Export & Immutable Archival ===")
        csv_content, filename, archive_path = generate_claude_export(batch_id, db)
        print(f"✓ CSV Generated: {filename}")
        print(f"✓ Physical archive path: {archive_path}")
        assert os.path.exists(archive_path), f"Archived file not found at {archive_path}"
        assert os.path.getsize(archive_path) > 0, "Archived file is empty!"

        lines = csv_content.strip().split("\n")
        print(f"Export row count: {len(lines)} (including header)")
        print(f"Header: {lines[0]}")
        print(f"Sample row 1: {lines[1] if len(lines) > 1 else 'N/A'}")
        print(f"Sample row 2: {lines[2] if len(lines) > 2 else 'N/A'}")

        print("\n ALL BACKEND SYSTEM TESTS PASSED SUCCESSFULLY!")

    finally:
        db.close()


if __name__ == "__main__":
    test_full_pipeline()
