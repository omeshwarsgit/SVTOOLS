import os
import json
import urllib.request
import urllib.error
from datetime import datetime, date
from pathlib import Path
from typing import Dict, Any, List, Optional

from app.core.config import settings
from app.models.schemas import MISDashboardData, MISTabItem


def build_slack_blocks(mis_data: MISDashboardData) -> List[Dict[str, Any]]:
    """
    Construct high-impact Slack Block Kit message structure for executive MIS alerts.
    Includes KPI breakdown, alert status, and tagged Relationship Managers.
    """
    today_str = date.today().strftime("%d %b %Y")
    now_str = datetime.now().strftime("%H:%M:%S UTC")
    p = mis_data.primary_metrics

    # Top Cancellation Pending items
    pending_items = mis_data.tabs_data.get("cancellation_pending", [])[:6]
    action_lines = []
    for it in pending_items:
        portal_text = f"<{it.target_portal_url}|OTA Portal>" if it.target_portal_url and it.target_portal_url != "not available" else "No Extranet Link"
        rep_tag = f"@{it.assigned_representative}" if it.assigned_representative and it.assigned_representative != "Unassigned" else "@Operations"
        action_lines.append(
            f"• *{rep_tag}* | Res `{it.reservation_id}` ({it.channel}) | _{it.property_name or 'Unknown'}_ → {portal_text} (In: `{it.check_in or 'N/A'}`)"
        )

    action_text = "\n".join(action_lines) if action_lines else "• _No pending cancellations detected._"
    if len(mis_data.tabs_data.get("cancellation_pending", [])) > 6:
        remaining = len(mis_data.tabs_data.get("cancellation_pending", [])) - 6
        action_text += f"\n_...and {remaining} more pending cancellations in full report._"

    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "🚨 StayVista Automated Reconciliation Alert",
                "emoji": True
            }
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"📅 *Date:* {today_str} | ⏱ *Run Time:* {now_str} | 🆔 *Batch:* `{mis_data.batch_id[:8]}`"
                }
            ]
        },
        {
            "type": "divider"
        },
        {
            "type": "section",
            "fields": [
                {
                    "type": "mrkdwn",
                    "text": f"*Total Bookings Ingested:*\n📊 `{p.total_bookings:,}`"
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Successfully Matched:*\n✅ `{p.matched:,}`"
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Status Mismatches:*\n⚠️ `{p.mismatched:,}`"
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Missing in PMS:*\n🔍 `{p.missing:,}`"
                },
                {
                    "type": "mrkdwn",
                    "text": f"*🔴 Cancellation Pending:*\n🚨 *`{p.cancellation_pending:,}` ACTION REQUIRED*"
                },
                {
                    "type": "mrkdwn",
                    "text": f"*PMS Base vs Query Discrepancy:*\n⚙️ `{mis_data.secondary_metrics.base_vs_query_mismatch:,}`"
                }
            ]
        },
        {
            "type": "divider"
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*🚨 Priority Action Items (Cancellation Pending & RM Tagging):*\n{action_text}"
            }
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": "📎 *Executive multi-sheet Excel report & CSV audit trail generated.* Tagged team members please review and cancel bookings on OTA extranets immediately."
                }
            ]
        }
    ]

    return blocks


def save_dry_run_slack_alert(payload: Dict[str, Any], batch_id: str, reason: str) -> Dict[str, Any]:
    """Archive Slack notification payload locally when webhook is not configured or in test mode."""
    archive_dir = settings.BASE_DIR / "archives" / "slack"
    os.makedirs(archive_dir, exist_ok=True)
    today_str = date.today().strftime("%Y-%m-%d")
    out_file = archive_dir / f"slack_alert_{today_str}_{batch_id[:8]}.json"

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    return {
        "status": "dry_run_saved",
        "message": f"Slack notification payload formatted and archived locally ({reason}).",
        "saved_path": str(out_file)
    }


def send_slack_alert(
    mis_data: MISDashboardData,
    webhook_url: Optional[str] = None
) -> Dict[str, Any]:
    """
    Transmit live executive reconciliation alert into your office Slack channel.
    Uses free standard Slack Incoming Webhook (zero external dependencies).
    """
    url = (webhook_url or settings.SLACK_WEBHOOK_URL or "").strip()

    blocks = build_slack_blocks(mis_data)
    fallback_text = (
        f"StayVista Reconciliation Alert: {mis_data.primary_metrics.total_bookings} bookings reconciled, "
        f"{mis_data.primary_metrics.cancellation_pending} cancellations pending."
    )
    payload = {
        "text": fallback_text,
        "blocks": blocks,
    }

    if not url:
        return save_dry_run_slack_alert(
            payload=payload,
            batch_id=mis_data.batch_id,
            reason="SLACK_WEBHOOK_URL not configured in .env"
        )

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json; charset=utf-8"}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp_body = resp.read().decode("utf-8")
            if resp.status == 200 and resp_body.strip().lower() == "ok":
                # Save audit log
                save_dry_run_slack_alert(payload, mis_data.batch_id, reason="Posted successfully to Slack")
                return {
                    "status": "success",
                    "message": "Slack notification successfully posted to channel.",
                    "batch_id": mis_data.batch_id,
                    "cancellation_pending": mis_data.primary_metrics.cancellation_pending
                }
            else:
                return {
                    "status": "error",
                    "message": f"Slack responded with unexpected body: {resp_body}"
                }
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8") if e.fp else str(e)
        return {
            "status": "error",
            "message": f"Slack webhook HTTP error {e.code}: {err_msg}"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to send Slack webhook alert: {str(e)}"
        }


def send_slack_test_ping(webhook_url: Optional[str] = None) -> Dict[str, Any]:
    """Send a lightweight test ping to the Slack channel to verify the webhook connection."""
    url = (webhook_url or settings.SLACK_WEBHOOK_URL or "").strip()
    if not url:
        return {
            "status": "error",
            "message": "SLACK_WEBHOOK_URL is not configured in .env."
        }

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    payload = {
        "text": "StayVista Automation Test Ping",
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": "✅ StayVista Slack Integration Test",
                    "emoji": True
                }
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Connection Verified!* Your Slack channel is connected to the StayVista Reconciliation Engine.\n⏱ *Timestamp:* `{now_str}`"
                }
            }
        ]
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json; charset=utf-8"}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp_body = resp.read().decode("utf-8")
            if resp.status == 200 and resp_body.strip().lower() == "ok":
                return {
                    "status": "success",
                    "message": "Slack test ping delivered successfully to your channel!"
                }
            return {
                "status": "error",
                "message": f"Slack responded with: {resp_body}"
            }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Slack test failed: {str(e)}"
        }
