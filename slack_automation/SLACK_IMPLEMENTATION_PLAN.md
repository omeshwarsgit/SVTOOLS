# StayVista Slack Operations Integration Plan & Workflow Architecture

## 1. Executive Summary

This implementation plan outlines the architecture, deployment workflows, alert SLAs, and ownership guidelines for the **StayVista Slack Discrepancy & Reconciliation Operations System**. 

The goal of this integration is to automatically notify operations teams and relationship managers the moment daily Source System (SU) and Property Management System (PMS) dumps arrive, enabling immediate resolution of in-transit cancellations and commission mismatches.

---

## 2. End-to-End Workflow Architecture

```
┌─────────────────────────────────┐
│ Daily Booking Reports Dropped   │
│ (data/incoming/*.xlsx, .xls)    │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ StayVista Reconciliation Engine │
│ • 1,193 Master Properties       │
│ • 2,251 Representative Maps     │
│ • Fuzzy & UID Cross-Reference   │
└────────────────┬────────────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
┌──────────────┐   ┌──────────────────────────────────────────────┐
│ Email Engine │   │ Slack Operations Dispatcher                  │
│ Full .xlsx   │   │ (slack_automation/dispatcher.py)             │
│ Workbook     │   │ • Computes KPI Metrics Card                  │
│ Attachment   │   │ • Filters Critical Cancellation Pending      │
│              │   │ • Maps & Tags Assigned Relationship Managers │
│              │   │ • Sanitizes Direct OTA Extranet URLs         │
└──────────────┘   └──────────────────────┬───────────────────────┘
                                          │
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │ Slack Channel: #reconciliation-alerts        │
                   │ • Instant Team Visibility                    │
                   │ • Actionable @RM Tagging                     │
                   │ • Direct Link to Extranet Portals            │
                   └──────────────────────────────────────────────┘
```

---

## 3. Team Roles & Action SLAs

| Role | Notification Trigger | Action Required | SLA Target |
| :--- | :--- | :--- | :--- |
| **Relationship Manager (RM)** | Tagged via `@Representative` on Cancellation Pending item | Log into OTA Extranet (via provided link) and execute cancellation | **< 30 minutes** |
| **Operations Team** | Status Mismatch (Confirmed in SU / Cancelled in PMS) | Audit commission and guest check-in status | **< 2 hours** |
| **PMS Admin** | Missing in PMS alert | Inject valid booking or trigger PMS OTA channel sync | **< 4 hours** |
| **Ops Lead** | Daily Executive Summary Card | Review Matched vs Mismatched ratios and batch health | **Daily** |

---

## 4. Two Integration Options (Both 100% Free)

### Option A: Slack Incoming Webhook (Interactive Block Kit Cards)
- **Best For**: Real-time visual alerts with bold KPI counters, urgency flags, and `@Representative` mentions.
- **Setup Time**: ~2 minutes.
- **Mechanism**: HTTP POST to Slack API with JSON Block Kit payload.

### Option B: Slack Channel Email (Direct Report & Excel File)
- **Best For**: Dropping the full multi-sheet Excel report directly into the Slack channel for download.
- **Setup Time**: ~30 seconds.
- **Mechanism**: Every Slack channel has an email address (`Channel Details → Integrations → Send emails to this channel`). Add that email to `RECIPIENT_EMAILS` in `.env`.

---

## 5. Webhook Setup Walkthrough (Click-by-Click)

1. Open **[https://api.slack.com/apps](https://api.slack.com/apps)** in your browser.
2. Click **Create New App** → select **"Blank app"** (under *Or start your own way*).
3. Name it: `StayVista Reconciliation Bot` and select your workspace.
4. In the left navigation, click **Incoming Webhooks**.
5. Turn the toggle **"Activate Incoming Webhooks"** to **ON**.
6. Click **"Add New Webhook to Workspace"**.
7. Choose your dedicated channel (e.g. `#reconciliation-alerts`) and click **Allow**.
8. Copy the Webhook URL and paste into `.env`:
   ```env
   SLACK_WEBHOOK_URL=YOUR_SLACK_WEBHOOK_URL_HERE
   SLACK_CHANNEL=#reconciliation-alerts
   ```

---

## 6. How the Team Runs & Manages This Package

All code is isolated inside the `slack_automation/` folder:

### 1. Verification
```bash
./venv/bin/python slack_automation/test_connection.py
```
*Expected: Sends a green confirmation card to your Slack channel.*

### 2. Manual Run on Specific Data Sheet
```bash
./venv/bin/python slack_automation/dispatcher.py --file data/SU__Cancelled_Bookings.xlsx
```

### 3. Continuous Background Watcher (Production Mode)
```bash
./venv/bin/python slack_automation/run_slack_watcher.py
```
*The daemon monitors `data/incoming/`. Whenever operations drops sheets into this folder, it automatically reconciles, posts to Slack, and archives the files.*

### 4. Background Daemon (nohup / systemd)
To keep the watcher running 24/7 in the background:
```bash
nohup ./venv/bin/python slack_automation/run_slack_watcher.py > slack_watcher.log 2>&1 &
```

---

## 7. Security, Privacy & Compliance

- **No Personal Credentials**: Uses dedicated Incoming Webhook URLs; zero personal Slack logins or personal emails are stored.
- **Sanitized Links**: URLs are pre-cleaned to remove duplicate parameters or malformed prefixes.
- **Local Audit Logs**: Every outgoing Slack message payload is preserved as formatted JSON in `archives/slack/` for auditing and compliance.
