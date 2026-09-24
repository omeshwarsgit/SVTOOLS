import React from 'react';
import { 
  AlertTriangle, 
  Clock, 
  HelpCircle, 
  Layers, 
  ShieldAlert, 
  FileWarning, 
  ArrowRight,
  Sparkles
} from 'lucide-react';

export default function OperationalAlerts({
  alerts,
  onSelectAlert,
  activeDiscrepancyType,
}) {
  if (!alerts) return null;

  const cards = [
    {
      id: 'IN_TRANSIT_CANCELLATION',
      title: 'In-Transit Cancellations',
      count: alerts.in_transit_count,
      tag: 'Critical Risk',
      tagColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      description: 'Confirmed in SU, but Admin status is Cancelled or Tentative. High risk of double booking or ghost stays.',
      icon: AlertTriangle,
      borderActive: 'border-rose-500 ring-2 ring-rose-500/30 bg-rose-950/20',
      glow: 'shadow-glow-rose',
    },
    {
      id: 'CUSTOMER_CONCERN',
      title: 'Review Holds (Check = 1.0)',
      count: alerts.customer_concern_count,
      tag: 'Attention Required',
      tagColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      description: 'Flagged with Check=1.0 in SU. Requires operational or customer care verification before release.',
      icon: ShieldAlert,
      borderActive: 'border-amber-500 ring-2 ring-amber-500/30 bg-amber-950/20',
      glow: 'shadow-glow-amber',
    },
    {
      id: 'EDGE_STATUS',
      title: 'Edge Statuses (Modified / R)',
      count: alerts.edge_status_count,
      tag: 'Exceptions Ledger',
      tagColor: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
      description: 'Non-standard booking lifecycles routed into dedicated exceptions ledger rather than dropped.',
      icon: Layers,
      borderActive: 'border-purple-500 ring-2 ring-purple-500/30 bg-purple-950/20',
      glow: 'shadow-glow-blue',
    },
  ];

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <FileWarning className="h-5 w-5 text-amber-400" />
          <h2 className="text-base font-bold text-white tracking-tight font-['Outfit']">
            Action Required: In-Transit Conflicts & Operational Concerns
          </h2>
        </div>
        <span className="text-xs text-slate-400">
          Total Flagged: <strong className="text-white font-mono">{alerts.total_discrepancies}</strong>
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const isActive = activeDiscrepancyType === card.id;

          return (
            <div
              key={card.id}
              onClick={() => onSelectAlert(card.id)}
              className={`glass-panel-interactive rounded-2xl p-5 cursor-pointer relative overflow-hidden border ${
                isActive ? card.borderActive : 'border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2.5 rounded-xl bg-slate-900 border border-slate-700/80 ${isActive ? card.glow : ''}`}>
                    <Icon className="h-5 w-5 text-slate-200" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">{card.title}</h3>
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${card.tagColor} mt-0.5`}>
                      {card.tag}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black font-mono text-white tracking-tight">
                    {card.count.toLocaleString()}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed mb-3">
                {card.description}
              </p>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                <span className="text-[11px] font-medium text-indigo-400 flex items-center gap-1 group-hover:underline">
                  {isActive ? 'Active Filter applied' : 'Drill down reservations'}
                  <ArrowRight className="h-3 w-3" />
                </span>
                <span className="text-[10px] text-slate-400">
                  {card.count > 0 ? `${card.count} items` : 'No discrepancies'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
