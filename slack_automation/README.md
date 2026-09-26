# StayVista Slack Operations & Discrepancy Alert Automation Package

This standalone package contains the complete workflow, code, and execution scripts for managing all **Slack-related operations** for the StayVista PMS & OTA Reconciliation Engine.

It is designed to be self-contained so that your **Slack / Operations Automation team** can independently review, configure, test, and deploy Slack alerting workflows without touching the frontend or core web portal.

---

## 📁 Package Structure

```
slack_automation/
├── README.md                      # Quickstart guide & architecture for the Slack team
├── SLACK_IMPLEMENTATION_PLAN.md   # Full roadmap, SLAs, Block Kit specs & deployment guide
├── .env.slack.example             # Ready-to-use configuration template
├── config.py                      # Lightweight, independent configuration loader
├── client.py                      # Production Slack Webhook & Block Kit client
├── dispatcher.py                  # Alert dispatcher that parses reconciliation dumps & posts to Slack
├── run_slack_watcher.py           # Automated background folder watcher (headless daemon)
├── test_connection.py             # One-command Slack webhook verification tool
└── templates/
    └── alert_blocks.py            # Rich Slack UI templates, KPI cards & @RM tagging
```

---

## ⚡ Quickstart for the Slack Operations Team

### 1. Set Up Environment Variables
Copy `.env.slack.example` to `.env` (or set in your environment):
```bash
cp slack_automation/.env.slack.example .env
```
Ensure your Slack Webhook URL is set:
```env
SLACK_WEBHOOK_URL=YOUR_SLACK_WEBHOOK_URL_HERE
SLACK_CHANNEL=#reconciliation-alerts
```

### 2. Verify Slack Connection (1-Second Test)
Run the test script to verify that your Slack channel receives messages:
```bash
./venv/bin/python slack_automation/test_connection.py
```
*You will immediately see a test card appear in `#reconciliation-alerts`.*

### 3. Dispatch a Discrepancy Alert from Latest Data
To process the latest data sheet and broadcast the live executive alert:
```bash
./venv/bin/python slack_automation/dispatcher.py --file data/SU__Cancelled_Bookings.xlsx
```

### 4. Run the Continuous Headless Slack Watcher
To run the automated daemon that watches `data/incoming/` for new daily sheets and automatically fires Slack alerts:
```bash
./venv/bin/python slack_automation/run_slack_watcher.py
```

---

## 🔔 Alert Capabilities
- **Executive Metrics Grid**: Total Bookings, Matched, Discrepancies, Missing in PMS, and 🔴 *Cancellation Pending*.
- **Relationship Manager Tagging**: Automatically extracts and tags `@Representative` on their assigned properties.
- **Direct Extranet Links**: Includes sanitized OTA portal links (MakeMyTrip, Booking.com, Agoda, Airbnb).
- **Zero Cost**: Built entirely using free Slack Incoming Webhooks.
