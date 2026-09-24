import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  ExternalLink, 
  User, 
  Copy, 
  Check, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw,
  Eye,
  Info
} from 'lucide-react';

const CHANNELS = ['All', 'Gommt', 'B.com', 'Agoda', 'Airbnb', 'Others'];

const STATUS_CATEGORIES = ['All', 'Confirmed', 'Cancelled', 'In-Transit'];

const DISCREPANCY_TYPES = [
  { value: 'All', label: 'All Discrepancies' },
  { value: 'IN_TRANSIT_CANCELLATION', label: 'In-Transit Cancellation' },
  { value: 'CUSTOMER_CONCERN', label: 'Review Hold (Check=1.0)' },
  { value: 'EDGE_STATUS', label: 'Edge Status (Modified/R)' },
  { value: 'MISSING_IN_PMS', label: 'Missing in PMS' },
  { value: 'MISSING_IN_SU', label: 'Missing in SU' },
  { value: 'STATUS_MISMATCH', label: 'Status Mismatch' },
];

function formatDiscrepancyTypeBadge(type) {
  switch (type) {
    case 'IN_TRANSIT_CANCELLATION':
      return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">In-Transit Cancellation</span>;
    case 'CUSTOMER_CONCERN':
      return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">Review Hold</span>;
    case 'EDGE_STATUS':
      return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">Exceptions Ledger</span>;
    case 'MISSING_IN_PMS':
      return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-600/25 text-red-300 border border-red-500/40">Missing in PMS</span>;
    case 'MISSING_IN_SU':
      return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-orange-500/20 text-orange-300 border border-orange-500/30">Missing in SU</span>;
    case 'STATUS_MISMATCH':
      return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">Status Mismatch</span>;
    default:
      return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">{type}</span>;
  }
}

export default function DiscrepancyTable({
  discrepanciesData,
  filterChannel,
  setFilterChannel,
  filterStatus,
  setFilterStatus,
  filterType,
  setFilterType,
  searchQuery,
  setSearchQuery,
  page,
  setPage,
  pageSize,
  setPageSize,
  isLoading,
  onInspectItem,
  onResetFilters,
}) {
  const [copiedId, setCopiedId] = useState(null);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const items = discrepanciesData?.items || [];
  const total = discrepanciesData?.total || 0;
  const totalPages = discrepanciesData?.pages || 1;

  const isFiltered = filterChannel !== 'All' || filterStatus !== 'All' || filterType !== 'All' || searchQuery.trim() !== '';

  return (
    <div className="glass-panel-elevated rounded-2xl p-5 border border-slate-800 shadow-xl">
      {/* Header & Filter Controls */}
      <div className="flex flex-col gap-4 pb-4 border-b border-slate-800/80 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>Granular Discrepancies Drill-Down</span>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-indigo-400">
                {total.toLocaleString()} records
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Interactive ledger with dynamic OTA portal links and representative assignments
            </p>
          </div>

          {/* Reset Filters Button */}
          {isFiltered && (
            <button
              onClick={onResetFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700"
            >
              <RotateCcw className="h-3 w-3 text-slate-400" />
              Reset Filters
            </button>
          )}
        </div>

        {/* Filter Pills & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Channel Filters */}
          <div className="flex items-center flex-wrap gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 px-2">Channel:</span>
            {CHANNELS.map((ch) => (
              <button
                key={ch}
                onClick={() => {
                  setFilterChannel(ch);
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  filterChannel === ch
                    ? 'bg-indigo-600 text-white shadow-glow-blue'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {ch}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[260px] flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search ID, guest, property, rep..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Secondary Filter Line: Status Category & Discrepancy Type */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {/* Status Category Dropdown / Pills */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Status:</span>
            <div className="flex items-center gap-1">
              {STATUS_CATEGORIES.map((st) => (
                <button
                  key={st}
                  onClick={() => {
                    setFilterStatus(st);
                    setPage(1);
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                    filterStatus === st
                      ? 'bg-slate-700 text-white font-semibold'
                      : 'text-slate-400 hover:bg-slate-800/60'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Discrepancy Type Selector */}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[11px] text-slate-400">Conflict Type:</span>
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setPage(1);
              }}
              className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              {DISCREPANCY_TYPES.map((dt) => (
                <option key={dt.value} value={dt.value} className="bg-slate-900 text-slate-200">
                  {dt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Discrepancies Table */}
      <div className="overflow-x-auto min-h-[300px]">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <div className="h-7 w-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs">Loading discrepancy ledger...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Info className="h-8 w-8 mx-auto mb-2 text-slate-500" />
            <p className="text-sm font-medium text-slate-300">No discrepancies match the active filters.</p>
            <p className="text-xs text-slate-500 mt-1">Try resetting the channel, conflict type, or search term.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px] bg-slate-900/40">
                <th className="py-3 pl-3">Reservation ID</th>
                <th className="py-3">Guest Name</th>
                <th className="py-3">Channel</th>
                <th className="py-3">Status</th>
                <th className="py-3">Discrepancy Type</th>
                <th className="py-3">Representative</th>
                <th className="py-3">Property Name (OTA Portal)</th>
                <th className="py-3 text-right pr-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {items.map((item) => {
                const isUrlAvailable =
                  item.target_portal_url &&
                  item.target_portal_url !== 'not available' &&
                  item.target_portal_url.startsWith('http');

                return (
                  <tr key={item.id} className="hover:bg-slate-850/60 transition-colors">
                    {/* Reservation ID */}
                    <td className="py-3 pl-3 font-mono font-medium text-slate-200">
                      <div className="flex items-center gap-1.5">
                        <span>{item.reservation_id}</span>
                        <button
                          onClick={() => copyToClipboard(item.reservation_id, item.id)}
                          className="text-slate-500 hover:text-slate-300 transition-colors p-0.5 rounded"
                          title="Copy Reservation ID"
                        >
                          {copiedId === item.id ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Guest Name */}
                    <td className="py-3 text-slate-300 max-w-[170px] truncate" title={item.guest_name}>
                      {item.guest_name || '—'}
                    </td>

                    {/* Channel */}
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800/90 text-slate-200 border border-slate-700">
                        {item.channel}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        item.status_category === 'Confirmed'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : item.status_category === 'Cancelled'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                      }`}>
                        {item.status_category}
                      </span>
                    </td>

                    {/* Discrepancy Type */}
                    <td className="py-3">
                      {formatDiscrepancyTypeBadge(item.discrepancy_type)}
                    </td>

                    {/* Assigned Representative */}
                    <td className="py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                        item.assigned_representative === 'Unassigned'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-slate-800 text-slate-200'
                      }`}>
                        <User className="h-3 w-3 opacity-60" />
                        {item.assigned_representative || 'Unassigned'}
                      </span>
                    </td>

                    {/* Property Name with Hyperlink Contract */}
                    <td className="py-3 max-w-[240px]">
                      {isUrlAvailable ? (
                        <a
                          href={item.target_portal_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-indigo-400 hover:text-indigo-300 hover:underline truncate group"
                          title={`Open in OTA portal: ${item.target_portal_url}`}
                        >
                          <span className="truncate">{item.property_name || 'View Property'}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-70 group-hover:opacity-100" />
                        </a>
                      ) : (
                        <span className="text-slate-400 truncate block" title="Portal URL not available">
                          {item.property_name || 'Unknown Property'}
                        </span>
                      )}
                    </td>

                    {/* Action Button */}
                    <td className="py-3 text-right pr-3">
                      <button
                        onClick={() => onInspectItem(item)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-300 text-[11px] font-medium transition-all"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800/80 mt-2 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-xs text-slate-300 focus:outline-none"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="hidden sm:inline">
            Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs">
            Page <strong className="text-white font-mono">{page}</strong> of <strong className="text-white font-mono">{totalPages}</strong>
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
