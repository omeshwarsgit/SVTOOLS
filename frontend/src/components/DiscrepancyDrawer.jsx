import React, { useState } from 'react';
import { 
  X, 
  ExternalLink, 
  User, 
  Calendar, 
  MapPin, 
  AlertTriangle, 
  Copy, 
  Check, 
  MessageSquare,
  Bot
} from 'lucide-react';

export default function DiscrepancyDrawer({ item, onClose }) {
  const [copiedSlack, setCopiedSlack] = useState(false);

  if (!item) return null;

  const isUrlAvailable =
    item.target_portal_url &&
    item.target_portal_url !== 'not available' &&
    item.target_portal_url.startsWith('http');

  const slackPrompt = `@${item.assigned_representative || 'Operations'} Discrepancy Alert:
Reservation #${item.reservation_id} (${item.channel}) has a status conflict [${item.discrepancy_type}].
Property: ${item.property_name || 'N/A'} (ID: ${item.property_id || 'N/A'})
Guest: ${item.guest_name || 'N/A'}
Dates: ${item.check_in || 'N/A'} to ${item.check_out || 'N/A'}
OTA Link: ${item.target_portal_url || 'not available'}
Please review in OTA portal and synchronize PMS state.`;

  const copySlackMessage = () => {
    navigator.clipboard.writeText(slackPrompt);
    setCopiedSlack(true);
    setTimeout(() => setCopiedSlack(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Slide-out Drawer */}
      <div className="relative z-10 w-full max-w-lg bg-slate-900 border-l border-slate-800 shadow-2xl h-full flex flex-col overflow-y-auto">
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-800 flex items-start justify-between bg-slate-950/40">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                Res #{item.reservation_id}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                {item.channel}
              </span>
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Discrepancy Drill-Down & LLM Preview
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="p-6 space-y-6 flex-1 text-xs">
          {/* Conflict Overview Card */}
          <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-rose-400 font-semibold text-xs">
              <AlertTriangle className="h-4 w-4" />
              <span>Conflict Classification</span>
            </div>
            <p className="text-sm font-bold text-white font-mono">{item.discrepancy_type}</p>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              This reservation was flagged during cross-system reconciliation. Status category:{' '}
              <strong className="text-slate-200">{item.status_category}</strong>.
            </p>
          </div>

          {/* Reservation & Guest Details */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Reservation Information
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block mb-0.5">Guest Name</span>
                <span className="font-semibold text-slate-200">{item.guest_name || 'Unknown'}</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block mb-0.5">OTA Channel</span>
                <span className="font-semibold text-slate-200">{item.channel}</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block mb-0.5">Check-In Date</span>
                <span className="font-mono text-slate-200 flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  {item.check_in || '—'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block mb-0.5">Check-Out Date</span>
                <span className="font-mono text-slate-200 flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  {item.check_out || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Property & OTA Link Contract */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Property & Portal Resolution
            </h3>
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Property Name</span>
                  <div className="font-semibold text-sm text-white">
                    {item.property_name || 'Unknown Property'}
                  </div>
                  {item.property_id && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      Master Property ID: #{item.property_id}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 block mb-1">Target Portal URL</span>
                {isUrlAvailable ? (
                  <a
                    href={item.target_portal_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 p-2 rounded-lg bg-indigo-950/30 border border-indigo-500/30 text-indigo-400 hover:text-indigo-300 text-xs font-medium break-all group transition-all"
                  >
                    <span className="flex-1">{item.target_portal_url}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70 group-hover:opacity-100" />
                  </a>
                ) : (
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 text-xs font-mono">
                    not available
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Assigned Representative & Claude Slack Handoff */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5 text-indigo-400" />
                <span>Claude Slack Handoff Payload</span>
              </h3>
              <button
                onClick={copySlackMessage}
                className="flex items-center gap-1 text-[11px] font-medium text-indigo-400 hover:text-indigo-300"
              >
                {copiedSlack ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied to clipboard</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy Tagged Slack Alert</span>
                  </>
                )}
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">
              {slackPrompt}
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <User className="h-3.5 w-3.5 text-indigo-400" />
            <span>Assigned Rep: <strong className="text-white">{item.assigned_representative || 'Unassigned'}</strong></span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors"
          >
            Close Drill-Down
          </button>
        </div>
      </div>
    </div>
  );
}
