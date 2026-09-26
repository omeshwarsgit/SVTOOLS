# StayVista Automated Reconciliation Engine & Free Office Email Dispatch Guide

## Overview

This automation system allows you to feed daily booking sheets (Source of Truth / SU dumps and PMS reports) into the engine, automatically execute full reconciliation operations, generate an executive multi-sheet Excel workbook, and immediately dispatch formatted HTML alerts and Excel attachments to everyone on your office recipient list.

**100% Free & Enterprise-Grade:**
- **Zero Paid Subscriptions**: Built entirely on Python's native `smtplib` and `openpyxl`. No paid email marketing or API tools needed.
- **Enterprise Office Account Only**: Your personal email is **never** used. Configured exclusively for official office notification accounts (Google Workspace, Microsoft 365, or corporate SMTP relay).
- **Everyone Receives the Exact Same Report**: Broadcasts the identical comprehensive reconciliation MIS report and attachments to all addresses in `RECIPIENT_EMAILS`.
- **Dry-Run Safety Mode**: If office SMTP credentials are not yet set up, the engine saves the full HTML email and multi-sheet Excel report to `archives/emails/` without failing.

---

## 1. Quick Setup: Office Sender Email (100% Free)

Open [.env](file:///Users/omeshwarshukla/STAYVISTATOOLS1KUSHAL/.env) in the project root:

### Option A: Google Workspace / Corporate Gmail (Recommended)
1. Go to your office Google Account: [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
2. Create an App name (e.g. `StayVista Reconciliation Automation`).
3. Google will generate a free 16-character App Password (e.g. `abcd efgh ijkl mnop`).
4. In your `.env` file, configure:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=reconciliation-alerts@stayvista.com
   SMTP_PASSWORD=abcdefghijklmnop
   SMTP_FROM_NAME=StayVista Reconciliation Engine
   SMTP_USE_TLS=True
   ```

### Option B: Microsoft 365 / Office 365
If your organization uses Microsoft 365:
```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=ops-notifications@stayvista.com
SMTP_PASSWORD=your_office_password
SMTP_FROM_NAME=StayVista Reconciliation Engine
SMTP_USE_TLS=True
```

### Option C: Custom Corporate SMTP / Internal Relay
```env
SMTP_HOST=mail.yourcompany.com
SMTP_PORT=587
SMTP_USER=noreply@yourcompany.com
SMTP_PASSWORD=your_smtp_password
SMTP_FROM_NAME=StayVista Operations
SMTP_USE_TLS=True
```

---

## 2. Setting Recipients

In [.env](file:///Users/omeshwarshukla/STAYVISTATOOLS1KUSHAL/.env), add all office team members, operations leads, and management emails separated by commas:

```env
RECIPIENT_EMAILS=operations@stayvista.com, management@stayvista.com, team@stayvista.com
```

Every recipient receives the exact same alert with the attached multi-sheet Excel file.

---

## 3. Slack Integration (Two 100% Free Methods)

You can broadcast reconciliation alerts into a dedicated Slack channel using either of these two methods:

### Method A: Slack Channel Email (Direct Email & Excel in Slack)
Every Slack channel can have its own private email address. When an email is sent to it, the full formatted message and the attached Excel workbook appear directly in the channel for everyone!

1. In Slack, create or open your dedicated channel (e.g. `#reconciliation-alerts`).
2. Click the channel name at the top to open **Channel Details**.
3. Go to the **Integrations** tab.
4. Under **Send emails to this channel**, click **Get email address** (or **Add an email**).
5. Copy the generated address (e.g. `reconcile-alerts-abc123xyz@stayvista.slack.com`).
6. Add it to `RECIPIENT_EMAILS` in [`.env`](file:///Users/omeshwarshukla/STAYVISTATOOLS1KUSHAL/.env):
   ```env
   RECIPIENT_EMAILS=reconcile-alerts-abc123xyz@stayvista.slack.com, operations@stayvista.com
   ```
*Result: Every time sheets are reconciled, the full executive MIS alert and downloadable multi-sheet Excel file appear instantly inside your Slack channel!*

---

### Method B: Slack Incoming Webhook (Rich Cards & @RM Mentions)
Posts live interactive Slack cards with KPI badges, bold cancellation warnings, and tagged Relationship Managers (`@Representative`):

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**.
2. Name it (e.g. `StayVista Reconciler`) and pick your office Slack workspace.
3. In the sidebar, select **Incoming Webhooks** → turn the toggle **On**.
4. Click **Add New Webhook to Workspace** → choose your channel (e.g. `#reconciliation-alerts`) → **Allow**.
5. Copy the Webhook URL and add it to [`.env`](file:///Users/omeshwarshukla/STAYVISTATOOLS1KUSHAL/.env):
   ```env
   SLACK_WEBHOOK_URL=YOUR_SLACK_WEBHOOK_URL_HERE
   SLACK_CHANNEL=#reconciliation-alerts
   ```

To test the Slack connection from the terminal:
```bash
./venv/bin/python backend/run_automation.py --test-slack
```

---

## 3. How to Run the Automation

### Method 1: Continuous Background Folder Watcher (Headless)
Run the watcher daemon in your terminal:
```bash
./venv/bin/python backend/run_automation.py --watch
```
- **How it works**:
  1. Drop or download any new SU dump or PMS report into `data/incoming/`.
  2. The watcher detects the file(s) as soon as download completes.
  3. Executes full cross-reference reconciliation across 1,193 properties and 2,251 representative assignments.
  4. Generates the executive `.xlsx` workbook.
  5. Shoots the email to everyone in `RECIPIENT_EMAILS`.
  6. Automatically moves processed sheets to `data/processed/YYYYMMDD_HHMMSS_<BATCH>/` for auditing.

### Method 2: Process Incoming Folder Once on Demand
```bash
./venv/bin/python backend/run_automation.py --once
```

### Method 3: Reconcile Specific Data Sheets Directly
```bash
./venv/bin/python backend/run_automation.py --files data/SU__Cancelled_Bookings.xlsx data/ota_reservation_180day_report_1107_2026-09-24.xls
```
You can also override recipients on the fly:
```bash
./venv/bin/python backend/run_automation.py --files data/SU__Cancelled_Bookings.xlsx --recipients "lead@stayvista.com, gm@stayvista.com"
```

### Method 4: Test Office SMTP Connection
Verify your office credentials without running reconciliation:
```bash
./venv/bin/python backend/run_automation.py --test-email operations@stayvista.com
```

### Method 5: Interactive Web UI
1. Launch the web dashboard (`npm run dev` in `frontend/` and `uvicorn app.main:app` in `backend/`).
2. Click the **Automated Email & Watcher** button in the top action bar.
3. Test your connection, review incoming sheet status, or click **Email Reconciliation Report Now**.

---

## 4. What the Generated Email & Reports Include

### Executive HTML Email Body
- **Header**: Official StayVista Operations styling and batch identifier.
- **Critical Alert Banner**: Live counter of urgent **Cancellation Pending** bookings requiring immediate extranet cancellation.
- **KPI Summary Cards**:
  - Total SU Bookings Ingested
  - Matched Bookings
  - Status Discrepancies
  - Missing in PMS
  - Cancellation Pending
- **Operational Category Table**: Breakdown of counts across all 8 reconciliation tabs.
- **Priority Action Items Table**: Top pending cancellations with Guest Name, OTA Channel badge, Property Name, Assigned Relationship Manager, Check-in date, and Direct OTA Extranet Link.

### Multi-Sheet Excel Attachment (`StayVista_Reconciliation_Report_<DATE>.xlsx`)
Contains 9 professionally formatted sheets:
1. `Executive Summary`: High-level KPI tables, PMS audit metrics, and operational recommendations.
2. `Cancellation Pending`: All in-transit cancellations with direct OTA portal URLs and assigned RMs.
3. `SU Confirmed - PMS Cancelled`: Discrepant records needing commission audit.
4. `Missing in PMS`: Valid bookings absent from PMS.
5. `Missing in SU`: PMS-only entries.
6. `PMS Special Status`: Tentative and No-show bookings.
7. `Base vs Query Mismatch`: Replica inconsistencies.
8. `Query not in Base`: Audit query gaps.
9. `All SU Bookings`: Master archive of all ingested source records.
