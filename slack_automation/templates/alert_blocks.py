from datetime import datetime, date
from typing import Dict, Any, List, Optional


def build_mis_alert_blocks(
    primary_metrics: Dict[str, Any],
    secondary_metrics: Dict[str, Any],
    tab_counts: Dict[str, int],
    pending_items: List[Dict[str, Any]],
    batch_id: str,
    max_items: int = 8,
    mention_channel: bool = False
) -> List[Dict[str, Any]]:
    """
    Format production-grade Slack Block Kit cards for reconciliation runs.
    """
    today_str = date.today().strftime("%d %b %Y")
    now_str = datetime.now().strftime("%H:%M:%S UTC")

    tot = primary_metrics.get("total_bookings", 0)
    matched = primary_metrics.get("matched", 0)
    mismatched = primary_metrics.get("mismatched", 0)
    missing = primary_metrics.get("missing", 0)
    cancel_pending = primary_metrics.get("cancellation_pending", 0)

    # Format actionable priority items
    action_lines = []
    for it in pending_items[:max_items]:
        rep = it.get("assigned_representative") or "Unassigned"
        rep_tag = f"@{rep}" if rep != "Unassigned" else "@Operations"
        res_id = it.get("reservation_id", "")
        chan = it.get("channel", "OTA")
        p_name = it.get("property_name") or f"Property #{it.get('property_id')}"
        t_url = it.get("target_portal_url")
        c_in = it.get("check_in") or "N/A"

        link_str = f"<{t_url}|OTA Portal>" if t_url and t_url.startswith("http") else "No Link"
        action_lines.append(
            f"• *{rep_tag}* | Res `{res_id}` ({chan}) | _{p_name}_ → {link_str} (Check-in: `{c_in}`)"
        )

    action_text = "\n".join(action_lines) if action_lines else "• _No pending cancellations detected. All records synchronized!_"
    if len(pending_items) > max_items:
        remaining = len(pending_items) - max_items
        action_text += f"\n_...and {remaining} more pending cancellations in full report._"

    urgency_tag = "<!channel> " if (mention_channel and cancel_pending > 0) else ""

    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "🚨 StayVista PMS & OTA Reconciliation MIS Alert",
                "emoji": True
            }
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"📅 *Date:* {today_str} | ⏱ *Run Time:* {now_str} | 🆔 *Batch:* `{batch_id[:8]}`"
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
                    "text": f"*Total Ingested SU:*\n📊 `{tot:,}`"
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Successfully Matched:*\n✅ `{matched:,}`"
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Status Mismatches:*\n⚠️ `{mismatched:,}`"
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Missing in PMS:*\n🔍 `{missing:,}`"
                },
                {
                    "type": "mrkdwn",
                    "text": f"*🔴 Cancellation Pending:*\n🚨 *`{cancel_pending:,}` ACTION REQUIRED*"
                },
                {
                    "type": "mrkdwn",
                    "text": f"*PMS Base vs Query Discrepancy:*\n⚙️ `{secondary_metrics.get('base_vs_query_mismatch', 0):,}`"
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
                "text": f"{urgency_tag}*🚨 Priority In-Transit Cancellations & RM Tagging:*\n{action_text}"
            }
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": "📎 *Executive multi-sheet Excel workbook generated & dispatched.* Relationship managers please review OTA portals immediately."
                }
            ]
        }
    ]

    return blocks


def build_test_blocks() -> List[Dict[str, Any]]:
    """Format test verification message."""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "✅ StayVista Slack Integration Test Successful",
                "emoji": True
            }
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Connection Established!* The StayVista Slack operations automation client is verified and ready to dispatch alerts.\n⏱ *Timestamp:* `{now_str}`"
            }
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": "Sent from `slack_automation/client.py`"
                }
            ]
        }
    ]
