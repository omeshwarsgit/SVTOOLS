import React, { useRef } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Download, 
  Zap, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  Database,
  History
} from 'lucide-react';
import { getClaudeExportUrl } from '../services/api';

export default function TopControlBar({
  suFile,
  setSuFile,
  pmsFile,
  setPmsFile,
  onReconcile,
  onQuickReconcile,
  isReconciling,
  batches,
  selectedBatchId,
  onSelectBatch,
  health,
  currentBatch,
}) {
  const suInputRef = useRef(null);
  const pmsInputRef = useRef(null);

  const handleSuDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSuFile(e.dataTransfer.files[0]);
    }
  };

  const handlePmsDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setPmsFile(e.dataTransfer.files[0]);
    }
  };

  const downloadPayload = () => {
    if (!selectedBatchId) return;
    const url = getClaudeExportUrl(selectedBatchId);
    window.open(url, '_blank');
  };

  return (
    <header className="glass-panel-elevated rounded-2xl p-5 mb-6 border border-slate-800/80 shadow-2xl">
      {/* Top Brand & Stats Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-tr from-amber-500 via-indigo-600 to-blue-500 flex items-center justify-center shadow-glow-blue">
            <Database className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white font-['Outfit']">
                StayVista Reconciliation Engine
              </h1>
              <span className="text-[11px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Production v1.0
              </span>
            </div>
            <p className="text-xs text-slate-400">
              PMS & OTA Automated Reconciliation, In-Transit Conflict Engine & LLM Slack Handoff
            </p>
          </div>
        </div>

        {/* Master Registry Stats & Batch Selector */}
        <div className="flex items-center flex-wrap gap-3">
          {health && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Registry:</span>
              <strong className="text-white">{health.properties_count}</strong> Props |
              <strong className="text-white">{health.representatives_count}</strong> Reps
            </div>
          )}

          {/* Historical Batch Selector */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5">
            <History className="h-4 w-4 text-slate-400" />
            <select
              value={selectedBatchId || ''}
              onChange={(e) => onSelectBatch(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer pr-4 font-medium"
            >
              {batches.length === 0 ? (
                <option value="" disabled className="bg-slate-900 text-slate-400">No batches yet</option>
              ) : (
                batches.map((b) => (
                  <option key={b.batch_id} value={b.batch_id} className="bg-slate-900 text-slate-200">
                    {b.upload_date} — {b.batch_id.slice(0, 8)}... ({b.total_discrepancies} alerts)
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Download Claude Payload Button */}
          <button
            onClick={downloadPayload}
            disabled={!selectedBatchId}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl text-xs font-semibold shadow-glow-blue disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
            title="Download Claude-optimized flat CSV dataset for automated Slack representative tagging"
          >
            <Download className="h-4 w-4" />
            <span>Download Claude Payload</span>
          </button>
        </div>
      </div>

      {/* Dual File Upload Dropzones + Execution Triggers */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-5 items-stretch">
        {/* SU File Dropzone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleSuDrop}
          onClick={() => suInputRef.current?.click()}
          className={`md:col-span-4 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all flex flex-col justify-between ${
            suFile
              ? 'border-emerald-500/50 bg-emerald-950/20 hover:bg-emerald-950/30'
              : 'border-slate-700/70 bg-slate-900/40 hover:border-indigo-500/50 hover:bg-slate-900/70'
          }`}
        >
          <input
            type="file"
            ref={suInputRef}
            onChange={(e) => e.target.files?.[0] && setSuFile(e.target.files[0])}
            accept=".xlsx,.xls"
            className="hidden"
          />
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${suFile ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-300 block">SU Daily Report</span>
                <span className="text-[11px] text-slate-400">Sheet1 (Cancelled/Status)</span>
              </div>
            </div>
            {suFile && (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Ready
              </span>
            )}
          </div>
          <div className="mt-3">
            {suFile ? (
              <div className="flex items-center justify-between text-xs text-emerald-400 font-mono">
                <span className="truncate max-w-[200px]">{suFile.name}</span>
                <span className="text-[10px] opacity-75">{(suFile.size / 1024).toFixed(0)} KB</span>
              </div>
            ) : (
              <div className="text-center py-1">
                <p className="text-xs text-slate-400 flex items-center justify-center gap-1">
                  <UploadCloud className="h-3.5 w-3.5" /> Drop SU Excel file or click
                </p>
              </div>
            )}
          </div>
        </div>

        {/* PMS File Dropzone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handlePmsDrop}
          onClick={() => pmsInputRef.current?.click()}
          className={`md:col-span-4 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all flex flex-col justify-between ${
            pmsFile
              ? 'border-emerald-500/50 bg-emerald-950/20 hover:bg-emerald-950/30'
              : 'border-slate-700/70 bg-slate-900/40 hover:border-indigo-500/50 hover:bg-slate-900/70'
          }`}
        >
          <input
            type="file"
            ref={pmsInputRef}
            onChange={(e) => e.target.files?.[0] && setPmsFile(e.target.files[0])}
            accept=".xls,.xlsx"
            className="hidden"
          />
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${pmsFile ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-300 block">PMS 180-Day Report</span>
                <span className="text-[11px] text-slate-400">BIFF8 Legacy/Corrupt Parser</span>
              </div>
            </div>
            {pmsFile && (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Ready
              </span>
            )}
          </div>
          <div className="mt-3">
            {pmsFile ? (
              <div className="flex items-center justify-between text-xs text-emerald-400 font-mono">
                <span className="truncate max-w-[200px]">{pmsFile.name}</span>
                <span className="text-[10px] opacity-75">{(pmsFile.size / 1024).toFixed(0)} KB</span>
              </div>
            ) : (
              <div className="text-center py-1">
                <p className="text-xs text-slate-400 flex items-center justify-center gap-1">
                  <UploadCloud className="h-3.5 w-3.5" /> Drop PMS .xls file or click
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Action Triggers */}
        <div className="md:col-span-4 flex flex-col justify-between gap-2.5">
          <button
            onClick={onReconcile}
            disabled={!suFile || !pmsFile || isReconciling}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-glow-emerald disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-98"
          >
            {isReconciling ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Reconciling & Relationalizing...</span>
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                <span>Reconcile Uploaded Batch</span>
              </>
            )}
          </button>

          <button
            onClick={onQuickReconcile}
            disabled={isReconciling}
            className="w-full py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-700/80 text-[11px] font-medium flex items-center justify-center gap-2 transition-all"
            title="Instantly process the pre-configured daily dump files from the workspace"
          >
            <Database className="h-3.5 w-3.5 text-amber-400" />
            <span>One-Click Reconcile (Latest Daily Dump)</span>
          </button>
        </div>
      </div>
    </header>
  );
}
