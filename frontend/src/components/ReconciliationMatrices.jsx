import React from 'react';
import { CheckCircle, AlertTriangle, AlertOctagon, TrendingUp, TrendingDown } from 'lucide-react';

const ORDERED_CHANNELS = ['Gommt', 'B.com', 'Agoda', 'Airbnb', 'Others'];

const CHANNEL_CONFIG = {
  Gommt: { label: 'Go-MMT (MakeMyTrip)', badge: 'bg-red-500/10 text-red-400 border-red-500/20' },
  'B.com': { label: 'Booking.com', badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  Agoda: { label: 'Agoda', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  Airbnb: { label: 'Airbnb', badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  Others: { label: 'Others (Direct/Offline)', badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
};

function renderVarianceBadge(variance) {
  if (variance === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        <CheckCircle className="h-3 w-3" />
        0 (Balanced)
      </span>
    );
  }
  if (variance > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-glow-rose">
        <TrendingUp className="h-3 w-3" />
        +{variance} (Missing in PMS)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-glow-amber">
      <TrendingDown className="h-3 w-3" />
      {variance} (Missing in SU)
    </span>
  );
}

export default function ReconciliationMatrices({
  matrix,
  onFilterClick,
  activeFilter,
}) {
  if (!matrix) return null;

  // Calculate totals
  const confirmedTotal = (matrix.confirmed || []).reduce(
    (acc, row) => ({
      su: acc.su + row.su,
      pms: acc.pms + row.pms,
      variance: acc.variance + row.variance,
    }),
    { su: 0, pms: 0, variance: 0 }
  );

  const cancelledTotal = (matrix.cancelled || []).reduce(
    (acc, row) => ({
      su: acc.su + row.su,
      pms: acc.pms + row.pms,
      variance: acc.variance + row.variance,
    }),
    { su: 0, pms: 0, variance: 0 }
  );

  const isRowActive = (channel, status) => {
    return activeFilter?.channel === channel && activeFilter?.status === status;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      {/* 1. Confirmed Bookings Matrix */}
      <div className="glass-panel-elevated rounded-2xl p-5 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="h-3 w-3 rounded-full bg-emerald-500 shadow-glow-emerald"></span>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Confirmed Bookings Matrix</h2>
              <p className="text-xs text-slate-400">Strict variance = SU Confirmed − PMS Confirmed</p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-slate-900 border border-slate-700 text-slate-300">
            SU: {confirmedTotal.su} | PMS: {confirmedTotal.pms}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="pb-3 pl-2">Channel</th>
                <th className="pb-3 text-right">SU</th>
                <th className="pb-3 text-right">PMS</th>
                <th className="pb-3 text-right pr-2">Variance (SU − PMS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {ORDERED_CHANNELS.map((chName) => {
                const row = (matrix.confirmed || []).find((r) => r.channel === chName) || {
                  channel: chName,
                  su: 0,
                  pms: 0,
                  variance: 0,
                };
                const active = isRowActive(chName, 'Confirmed');

                return (
                  <tr
                    key={chName}
                    onClick={() => onFilterClick({ channel: chName, status: 'Confirmed' })}
                    className={`cursor-pointer transition-all duration-150 ${
                      active
                        ? 'bg-indigo-600/20 border-l-4 border-indigo-500'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <td className="py-3 pl-2 font-medium text-slate-200 flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${CHANNEL_CONFIG[chName]?.badge || ''}`}>
                        {chName}
                      </span>
                      <span className="hidden sm:inline text-slate-400 text-[11px]">
                        {CHANNEL_CONFIG[chName]?.label}
                      </span>
                    </td>
                    <td className="py-3 text-right font-mono text-slate-300 font-semibold">
                      {row.su.toLocaleString()}
                    </td>
                    <td className="py-3 text-right font-mono text-slate-300 font-semibold">
                      {row.pms.toLocaleString()}
                    </td>
                    <td className="py-3 text-right pr-2">
                      {renderVarianceBadge(row.variance)}
                    </td>
                  </tr>
                );
              })}
              {/* Total Row */}
              <tr className="border-t-2 border-slate-700 bg-slate-900/60 font-bold">
                <td className="py-3.5 pl-2 text-white uppercase text-[11px] tracking-wider">
                  Total Confirmed
                </td>
                <td className="py-3.5 text-right font-mono text-white text-sm">
                  {confirmedTotal.su.toLocaleString()}
                </td>
                <td className="py-3.5 text-right font-mono text-white text-sm">
                  {confirmedTotal.pms.toLocaleString()}
                </td>
                <td className="py-3.5 text-right pr-2">
                  {renderVarianceBadge(confirmedTotal.variance)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Cancelled Bookings Matrix */}
      <div className="glass-panel-elevated rounded-2xl p-5 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="h-3 w-3 rounded-full bg-rose-500 shadow-glow-rose"></span>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Cancelled Bookings Matrix</h2>
              <p className="text-xs text-slate-400">Strict variance = SU Cancelled − PMS Cancelled</p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-slate-900 border border-slate-700 text-slate-300">
            SU: {cancelledTotal.su} | PMS: {cancelledTotal.pms}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="pb-3 pl-2">Channel</th>
                <th className="pb-3 text-right">SU</th>
                <th className="pb-3 text-right">PMS</th>
                <th className="pb-3 text-right pr-2">Variance (SU − PMS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {ORDERED_CHANNELS.map((chName) => {
                const row = (matrix.cancelled || []).find((r) => r.channel === chName) || {
                  channel: chName,
                  su: 0,
                  pms: 0,
                  variance: 0,
                };
                const active = isRowActive(chName, 'Cancelled');

                return (
                  <tr
                    key={chName}
                    onClick={() => onFilterClick({ channel: chName, status: 'Cancelled' })}
                    className={`cursor-pointer transition-all duration-150 ${
                      active
                        ? 'bg-rose-600/20 border-l-4 border-rose-500'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <td className="py-3 pl-2 font-medium text-slate-200 flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${CHANNEL_CONFIG[chName]?.badge || ''}`}>
                        {chName}
                      </span>
                      <span className="hidden sm:inline text-slate-400 text-[11px]">
                        {CHANNEL_CONFIG[chName]?.label}
                      </span>
                    </td>
                    <td className="py-3 text-right font-mono text-slate-300 font-semibold">
                      {row.su.toLocaleString()}
                    </td>
                    <td className="py-3 text-right font-mono text-slate-300 font-semibold">
                      {row.pms.toLocaleString()}
                    </td>
                    <td className="py-3 text-right pr-2">
                      {renderVarianceBadge(row.variance)}
                    </td>
                  </tr>
                );
              })}
              {/* Total Row */}
              <tr className="border-t-2 border-slate-700 bg-slate-900/60 font-bold">
                <td className="py-3.5 pl-2 text-white uppercase text-[11px] tracking-wider">
                  Total Cancelled
                </td>
                <td className="py-3.5 text-right font-mono text-white text-sm">
                  {cancelledTotal.su.toLocaleString()}
                </td>
                <td className="py-3.5 text-right font-mono text-white text-sm">
                  {cancelledTotal.pms.toLocaleString()}
                </td>
                <td className="py-3.5 text-right pr-2">
                  {renderVarianceBadge(cancelledTotal.variance)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
