# StayVista PMS & OTA Automated Reconciliation Engine, MIS Portal & LLM Handoff Pipeline

Production-grade automated reconciliation engine and enterprise operational MIS dashboard designed to ingest daily transactional booking dumps from Source Systems (SU) and Property Management Systems (PMS), reconcile discrepancies, cross-reference operational flags and master property registries, and export Claude-optimized Slack tagging datasets.

---

## Key Features

1. **Enterprise MIS Dashboard Layout**:
   - Clean, light-themed executive dashboard matching enterprise operational standards.
   - Primary Metrics: Total Bookings, Matched, Mismatched, Missing, Cancellation Pending.
   - Secondary Metrics: PMS Base Dump rows, PMS Query Dump rows, PMS Tentative/No-show, PMS not found in SU, Base vs Query mismatch, Query records missing in Base, SU status unclear.
   - 8 Operational Tabs with live discrepancy badge counts.

2. **Resilient Data Ingestion**:
   - Handles modern `.xlsx` workbooks via `openpyxl`.
   - Legacy BIFF8 stream ingestion for corrupted `.xls` reports using `xlrd` (`ignore_workbook_corruption=True`).
   - Leading zero identifier trap protection (`00170536542` -> `170536542`).
   - Duplicate timestamp crash guard and fuzzy fallback matching (Property + Check-in date).

3. **Workspace File Navigator & In-App Spreadsheet Viewer**:
   - Browse files across project data (`data/`), export archives (`archives/exports/`), and user downloads (`~/Downloads`).
   - In-app spreadsheet viewer with interactive sheet tabs (`Sheet1`, `query dump`, `Base`) to preview data directly in the browser without third-party software.
   - Instant macOS desktop integration: One-click `Open in Excel (Mac)` and `Reveal in Finder`.

4. **Multi-Format Export Pipeline**:
   - **Native Excel (.xlsx)**: Formatted workbooks generated via `openpyxl`.
   - **UTF-8 with BOM (.csv)**: Guarantees seamless opening in Microsoft Excel and Apple Numbers without character corruption or warnings.
   - **Claude Slack Tagged Alerts**: Flattened, LLM-optimized dataset tagging assigned relationship managers (`@Representative`) with sanitized OTA direct hotel URLs.

---

## Tech Stack

* **Backend**: Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy, Uvicorn, Pandas, OpenPyXL, XLRD.
* **Frontend**: React 19, Vite, Tailwind CSS, Lucide React.
* **Database**: SQLite with foreign key enforcement (`PRAGMA foreign_keys=ON;`).

---

## Getting Started

### 1. Backend Setup
```bash
cd backend
# Create and activate virtual environment
python3 -m venv ../venv
source ../venv/bin/activate

# Install dependencies
pip install fastapi uvicorn pydantic sqlalchemy pandas openpyxl xlrd python-multipart

# Start FastAPI server
PYTHONPATH=. uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Frontend Setup
```bash
cd frontend
# Install dependencies
npm install

# Start Vite development server
npm run dev -- --host 0.0.0.0 --port 5173
```

Access the portal in your browser at `http://localhost:5173`.
Access API Swagger documentation at `http://localhost:8000/docs`.

---

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes.py         # REST endpoints for MIS, files, exports, and OS integration
│   │   ├── core/
│   │   │   ├── config.py         # Project settings and paths
│   │   │   └── database.py       # SQLAlchemy engine and session factory
│   │   ├── models/
│   │   │   └── schemas.py        # Relational models and Pydantic schemas
│   │   ├── services/
│   │   │   ├── parser.py         # Defensive ETL parser for xlsx and corrupted xls
│   │   │   ├── reconciler.py     # Deterministic matching & discrepancy resolution engine
│   │   │   ├── seeder.py         # Master property & representative registry seeder
│   │   │   └── exporter.py       # Multi-format exporter with immutable archival
│   │   └── main.py               # FastAPI application entrypoint
│   └── reconciliation.db         # SQLite database
├── frontend/
│   ├── src/
│   │   ├── services/
│   │   │   └── api.js            # Frontend API client
│   │   ├── App.jsx               # MIS Reconciliation Dashboard, File Navigator, Previewer
│   │   ├── main.jsx              # React entry point
│   │   └── index.css             # Tailwind and base styling
│   └── package.json
├── data/                         # Sample datasets and master links
└── archives/                     # Immutable audit exports directory
```
