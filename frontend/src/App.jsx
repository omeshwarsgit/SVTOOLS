import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  fetchLatestMIS, 
  processMISFiles, 
  fetchWorkspaceFiles, 
  selectWorkspaceFile, 
  previewWorkspaceFile, 
  openFileInSystem, 
  exportAndOpenInExcel, 
  getWorkspaceFileDownloadUrl, 
  getTabExportUrl, 
  getClaudeExportUrl,
  downloadFileFromUrl 
} from './services/api';
import { 
  Search, 
  ExternalLink, 
  Copy, 
  Check, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  User, 
  Calendar, 
  Download, 
  FileSpreadsheet, 
  FolderOpen, 
  ArrowLeft, 
  ArrowRight, 
  Eye, 
  FileText, 
  RefreshCw, 
  FolderKanban, 
  Layers, 
  Sparkles,
  Upload,
  FileUp,
  Trash2,
  AlertCircle,
  Mail
} from 'lucide-react';
import EmailAutomationModal from './components/EmailAutomationModal';

const TABS = [
  { key: 'cancellation_pending', label: 'Cancellation Pending', badge: 14 },
  { key: 'confirmed_su_cancelled_pms', label: 'Confirmed in SU / Cancelled in PMS', badge: 38 },
  { key: 'missing_in_pms', label: 'Missing in PMS', badge: 230 },
  { key: 'missing_in_su', label: 'Missing in SU (PMS-only)', badge: null },
  { key: 'pms_special_status', label: 'PMS Special Status', badge: null },
  { key: 'base_vs_query_mismatch', label: 'Base vs Query mismatch', badge: null },
  { key: 'query_not_in_base', label: 'Query not in Base', badge: null },
  { key: 'all_su_bookings', label: 'All SU Bookings', badge: null },
];

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [activeTab, setActiveTab] = useState('cancellation_pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [workspaceFiles, setWorkspaceFiles] = useState([]);
  const [selectedWorkspaceFile, setSelectedWorkspaceFile] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [copiedId, setCopiedId] = useState(null);
  const [inspectIndex, setInspectIndex] = useState(null);
  const [copiedSlack, setCopiedSlack] = useState(false);
  const [toast, setToast] = useState(null);

  // File Ingestion Modal States
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [modalSuFile, setModalSuFile] = useState(null);
  const [modalPmsFile, setModalPmsFile] = useState(null);

  // File Navigator & Previewer States
  const [fileNavOpen, setFileNavOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSearch, setPreviewSearch] = useState('');

  const fileInputRef = useRef(null);
  const suFileInputRef = useRef(null);
  const pmsFileInputRef = useRef(null);

  const showToast = (msg, actions = null) => {
    setToast({ text: msg, actions });
    setTimeout(() => {
      setToast((current) => (current?.text === msg ? null : current));
    }, 6000);
  };

  // Load initial data and available workspace files
  const loadData = async () => {
    try {
      setLoading(true);
      const [misRes, filesRes] = await Promise.all([
        fetchLatestMIS(),
        fetchWorkspaceFiles()
      ]);
      setData(misRes);
      setWorkspaceFiles(filesRes || []);
    } catch (err) {
      console.error('Failed to load MIS data:', err);
      showToast('Failed to load initial data. Click Process & Publish to load.');
    } finally {
      setLoading(false);
    }
  };

  const refreshWorkspaceFilesList = async () => {
    try {
      const filesRes = await fetchWorkspaceFiles();
      setWorkspaceFiles(filesRes || []);
    } catch (err) {
      console.error('Failed to refresh files list:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle native file input change with IMMEDIATE auto-load & reconcile
  const handleFileChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setSelectedFiles(files);
      setSelectedWorkspaceFile('');
      try {
        setUploading(true);
        showToast(`Ingesting and reconciling ${files.length} file(s)...`);
        const res = await processMISFiles(files);
        setData(res);
        showToast(`Ingested & reconciled ${files.length} file(s) successfully! (${res.primary_metrics?.total_bookings || 0} bookings)`);
        refreshWorkspaceFilesList();
      } catch (err) {
        showToast(`Upload error: ${err.message}`);
      } finally {
        setUploading(false);
        if (e.target) e.target.value = '';
      }
    }
  };

  // Handle modal submit with SU and/or PMS files
  const handleModalUploadSubmit = async () => {
    const filesToUpload = [];
    if (modalSuFile) filesToUpload.push(modalSuFile);
    if (modalPmsFile) filesToUpload.push(modalPmsFile);

    if (filesToUpload.length === 0) {
      showToast('Please select at least one file (SU Report or PMS Report) to ingest.');
      return;
    }

    try {
      setUploading(true);
      showToast(`Ingesting and reconciling ${filesToUpload.length} file(s)...`);
      const res = await processMISFiles(filesToUpload);
      setData(res);
      setSelectedFiles(filesToUpload);
      setSelectedWorkspaceFile('');
      setImportModalOpen(false);
      setModalSuFile(null);
      setModalPmsFile(null);
      showToast(`Successfully reconciled ${filesToUpload.length} file(s)! (${res.primary_metrics?.total_bookings || 0} bookings)`);
      refreshWorkspaceFilesList();
    } catch (err) {
      showToast(`Ingestion error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Handle selecting a file from dropdown with IMMEDIATE auto-load
  const handleSelectWorkspaceFile = async (filePath) => {
    setSelectedWorkspaceFile(filePath);
    setSelectedFiles([]);
    if (!filePath) {
      // Revert to default workbook
      try {
        setUploading(true);
        const res = await fetchLatestMIS();
        setData(res);
        showToast('Default daily workbook loaded!');
      } catch (err) {
        showToast(`Error: ${err.message}`);
      } finally {
        setUploading(false);
      }
      return;
    }

    try {
      setUploading(true);
      const res = await selectWorkspaceFile(filePath);
      setData(res);
      const fname = filePath.split('/').pop();
      showToast(`Loaded & reconciled '${fname}'!`, {
        openMac: () => handleOpenSystem(filePath, 'open'),
        revealFinder: () => handleOpenSystem(filePath, 'reveal'),
        preview: () => handleOpenFilePreview(filePath)
      });
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Re-run current selection or default workbook
  const handleProcess = async () => {
    try {
      setUploading(true);
      if (selectedFiles.length > 0) {
        const res = await processMISFiles(selectedFiles);
        setData(res);
        showToast('Workbook processed and published successfully!');
        setSelectedFiles([]);
        refreshWorkspaceFilesList();
      } else if (selectedWorkspaceFile) {
        const res = await selectWorkspaceFile(selectedWorkspaceFile);
        setData(res);
        showToast(`Workspace file '${selectedWorkspaceFile.split('/').pop()}' processed!`);
      } else {
        const res = await fetchLatestMIS(true);
        setData(res);
        showToast('Latest daily report re-processed and published!');
      }
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Direct launch into Microsoft Excel / Numbers on macOS
  const handleDirectOpenExcel = async (tabName, format = 'xlsx') => {
    try {
      const res = await exportAndOpenInExcel(tabName, format);
      showToast(`Saved to Downloads and opened in Excel! (${res.file_name})`, {
        revealFinder: () => handleOpenSystem(res.downloads_path, 'reveal'),
        preview: () => handleOpenFilePreview(res.downloads_path)
      });
      refreshWorkspaceFilesList();
    } catch (err) {
      showToast(`Error opening in Excel: ${err.message}`);
    }
  };

  // Client-side CSV generator fallback (guarantees instantaneous zero-server download)
  const exportCsvClientFallback = (tabName, filename) => {
    const items = data?.tabs_data?.[tabName] || [];
    if (!items.length) return false;
    const headers = [
      "Reservation_ID", "Vendor_Booking_ID", "Guest_Name", "Channel",
      "SU_Status", "PMS_Status", "Admin_Status", "Property_ID",
      "Property_Name", "Assigned_Representative", "Target_Portal_URL",
      "Check_In", "Check_Out", "Match_Type", "Notes"
    ];
    const escapeCsv = (val) => {
      const s = (val ?? '').toString();
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const rows = [headers.join(',')];
    items.forEach(it => {
      rows.push([
        escapeCsv(it.reservation_id),
        escapeCsv(it.vendor_booking_id),
        escapeCsv(it.guest_name),
        escapeCsv(it.channel),
        escapeCsv(it.su_status),
        escapeCsv(it.pms_status),
        escapeCsv(it.admin_status),
        escapeCsv(it.property_id),
        escapeCsv(it.property_name),
        escapeCsv(it.assigned_representative),
        escapeCsv(it.target_portal_url),
        escapeCsv(it.check_in),
        escapeCsv(it.check_out),
        escapeCsv(it.match_type),
        escapeCsv(it.notes),
      ].join(','));
    });
    const blob = new Blob(["\uFEFF" + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || `su_pms_${tabName}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }, 500);
    return true;
  };

  // Safe file download helper: streams binary data via Blob & triggers native browser file download
  const triggerDownload = async (url, defaultFilename) => {
    try {
      setDownloading(defaultFilename);
      showToast(`Downloading ${defaultFilename}...`);
      const savedFilename = await downloadFileFromUrl(url, defaultFilename);
      showToast(`Downloaded '${savedFilename}' successfully! Saved to your computer.`, {
        openMac: () => handleDirectOpenExcel(activeTab, savedFilename.endsWith('.xlsx') ? 'xlsx' : 'csv'),
        preview: () => {
          const match = workspaceFiles.find(f => f.name === savedFilename);
          if (match) handleOpenFilePreview(match.path);
        }
      });
      refreshWorkspaceFilesList();
    } catch (err) {
      console.warn('Server download endpoint failed, attempting browser client export fallback:', err);
      const csvFallbackFilename = defaultFilename.endsWith('.xlsx') ? defaultFilename.replace('.xlsx', '.csv') : defaultFilename;
      const success = exportCsvClientFallback(activeTab, csvFallbackFilename);
      if (success) {
        showToast(`Downloaded '${csvFallbackFilename}' cleanly to your device!`);
      } else {
        showToast(`Download failed: ${err.message}`);
      }
    } finally {
      setDownloading(null);
    }
  };

  // Open file in macOS system app (Excel / Numbers) or Finder
  const handleOpenSystem = async (filePath, action = 'open') => {
    try {
      const res = await openFileInSystem(filePath, action);
      showToast(res.message);
    } catch (err) {
      showToast(`Failed: ${err.message}`);
    }
  };

  // Open in-app file previewer
  const handleOpenFilePreview = async (filePath, sheetName = null) => {
    try {
      setPreviewLoading(true);
      const res = await previewWorkspaceFile(filePath, sheetName);
      setPreviewFile(res);
      setPreviewSearch('');
    } catch (err) {
      showToast(`Preview error: ${err.message}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Switch sheet in active preview
  const handleSwitchPreviewSheet = async (sheetName) => {
    if (!previewFile?.file_path) return;
    await handleOpenFilePreview(previewFile.file_path, sheetName);
  };

  // Current tab items
  const tabItems = useMemo(() => {
    if (!data || !data.tabs_data) return [];
    return data.tabs_data[activeTab] || [];
  }, [data, activeTab]);

  // Filter items by search
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return tabItems;
    const q = searchQuery.toLowerCase().trim();
    return tabItems.filter((it) => 
      (it.reservation_id && it.reservation_id.toLowerCase().includes(q)) ||
      (it.vendor_booking_id && it.vendor_booking_id.toLowerCase().includes(q)) ||
      (it.guest_name && it.guest_name.toLowerCase().includes(q)) ||
      (it.property_name && it.property_name.toLowerCase().includes(q)) ||
      (it.assigned_representative && it.assigned_representative.toLowerCase().includes(q)) ||
      (it.channel && it.channel.toLowerCase().includes(q))
    );
  }, [tabItems, searchQuery]);

  // Paginated items
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // Filtered rows inside preview modal
  const filteredPreviewRows = useMemo(() => {
    if (!previewFile?.rows) return [];
    if (!previewSearch.trim()) return previewFile.rows;
    const q = previewSearch.toLowerCase();
    return previewFile.rows.filter(row => 
      Object.values(row).some(v => String(v).toLowerCase().includes(q))
    );
  }, [previewFile, previewSearch]);

  // Currently inspected item
  const inspectItem = inspectIndex !== null && filteredItems[inspectIndex] ? filteredItems[inspectIndex] : null;

  // Secondary metrics cards mapping to tabs
  const handleCardClick = (targetTab) => {
    if (targetTab) {
      setActiveTab(targetTab);
      setPage(1);
    }
  };

  const primary = data?.primary_metrics || {
    total_bookings: 1134,
    matched: 813,
    mismatched: 91,
    missing: 230,
    cancellation_pending: 14,
  };

  const secondary = data?.secondary_metrics || {
    pms_base_rows: 2848,
    pms_query_rows: 334,
    pms_tentative_noshow: 39,
    pms_not_found_in_su: 1965,
    base_vs_query_mismatch: 37,
    query_missing_in_base: 49,
    su_status_unclear: 0,
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 antialiased p-4 md:p-6 lg:p-8">
      {/* Interactive Toast with Quick Actions */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white text-xs px-4 py-3 rounded-lg shadow-xl border border-slate-700 max-w-md animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{toast.text}</span>
            <button 
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-white p-0.5 rounded"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {toast.actions && (
            <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center gap-2 flex-wrap">
              {toast.actions.openMac && (
                <button
                  onClick={toast.actions.openMac}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
                >
                  Open in Excel (Mac)
                </button>
              )}
              {toast.actions.revealFinder && (
                <button
                  onClick={toast.actions.revealFinder}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2 py-1 rounded text-[11px] transition-colors"
                >
                  Reveal in Finder
                </button>
              )}
              {toast.actions.preview && (
                <button
                  onClick={toast.actions.preview}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-[11px] transition-colors"
                >
                  Inspect in App
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-4">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              SU – PMS Booking Reconciliation MIS
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {data?.last_run || 'Last run: 2026-09-24 07:54 UTC • 1134 SU bookings reconciled'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setFileNavOpen(true)}
              className="border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium px-3 py-1.5 rounded-md shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <FolderKanban className="h-3.5 w-3.5 text-blue-600" />
              <span>Browse Files ({workspaceFiles.length})</span>
            </button>
            <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>live</span>
            </div>
          </div>
        </div>

        {/* Action / File Ingestion Bar */}
        <div className="bg-white border border-slate-200 rounded-md p-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Dedicated Multi-Format Ingest Dialog */}
            <button
              onClick={() => setImportModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3.5 py-1.5 rounded transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-2xs active:scale-98"
              title="Open multi-format booking import wizard (Single Workbook or Separate SU + PMS files)"
            >
              <FileUp className="h-3.5 w-3.5" />
              <span>Import Bookings</span>
            </button>

            {/* Email Automation & Watcher Modal */}
            <button
              onClick={() => setEmailModalOpen(true)}
              className="border border-indigo-200 hover:border-indigo-300 bg-indigo-50/80 hover:bg-indigo-100/90 text-indigo-700 text-xs font-medium px-3 py-1.5 rounded transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-2xs active:scale-98"
              title="Automated Office Email & Folder Watcher Settings"
            >
              <Mail className="h-3.5 w-3.5 text-indigo-600" />
              <span>Automated Email & Watcher</span>
            </button>

            {/* Native OS File Picker trigger */}
            <label 
              htmlFor="native-file-input" 
              className="border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 text-xs font-normal px-3 py-1.5 rounded transition-all cursor-pointer inline-flex items-center gap-1.5 select-none"
              title="Quick select local files (.xlsx, .xls, .csv)"
            >
              <FolderOpen className="h-3.5 w-3.5 text-slate-500" />
              <span>Quick Choose</span>
              <input
                id="native-file-input"
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                multiple
                accept=".xlsx,.xls,.csv"
                className="sr-only"
              />
            </label>

            {/* Quick-select from workspace files with auto-load */}
            {workspaceFiles.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="hidden sm:inline font-medium">Navigate file:</span>
                <select
                  value={selectedWorkspaceFile}
                  onChange={(e) => handleSelectWorkspaceFile(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 max-w-[260px] truncate focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer font-medium"
                >
                  <option value="">Default Daily Workbook (data/)</option>
                  {workspaceFiles.map((wf) => (
                    <option key={wf.path} value={wf.path}>
                      {wf.source === 'Export Archive' ? '📦 ' : '📄 '}
                      {wf.name} ({wf.size_kb} KB)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quick Preview & Open System for currently active file */}
            {selectedWorkspaceFile && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleOpenFilePreview(selectedWorkspaceFile)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-2 py-1 rounded inline-flex items-center gap-1 transition-colors"
                  title="Preview sheets and data inside browser"
                >
                  <Eye className="h-3 w-3" />
                  <span>Preview</span>
                </button>
                <button
                  onClick={() => handleOpenSystem(selectedWorkspaceFile, 'open')}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs px-2 py-1 rounded inline-flex items-center gap-1 transition-colors"
                  title="Open directly in Microsoft Excel on your Mac"
                >
                  <span>Open in Excel</span>
                </button>
              </div>
            )}

            <span className="text-xs text-slate-500 truncate max-w-xs hidden md:inline">
              {selectedFiles.length > 0
                ? `${selectedFiles.map(f => f.name).join(', ')}`
                : selectedWorkspaceFile
                ? `Active: ${selectedWorkspaceFile.split('/').pop()}`
                : 'Default: SU__Cancelled_Bookings.xlsx'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFileNavOpen(true)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium px-3 py-2 rounded transition-all cursor-pointer flex items-center gap-1"
            >
              <FolderKanban className="h-3.5 w-3.5 text-slate-600" />
              <span>File Explorer</span>
            </button>

            <button
              onClick={handleProcess}
              disabled={uploading}
              className="bg-[#6366f1] hover:bg-[#4f46e5] text-white text-xs font-medium px-4 py-2 rounded shadow-xs transition-all active:scale-98 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`h-3 w-3 ${uploading ? 'animate-spin' : ''}`} />
              <span>{uploading ? 'Processing...' : 'Process & Publish'}</span>
            </button>
          </div>
        </div>

        {/* Scope Note Banner */}
        <div className="bg-[#fffbeb] border border-[#fde68a] text-[#b45309] rounded-md p-3 text-xs leading-relaxed shadow-xs">
          <strong className="font-semibold text-[#92400e]">Scope note:</strong> "Missing in SU" mostly reflects that the SU extract may be a working subset, not SU's full booking universe — treat it as a checklist, not a confirmed defect list. Matching uses Vendor/Reservation ID against PMS uid first; where that's blank, Property + Check-in date is used as a fallback ("fuzzy" match type).
        </div>

        {/* Primary Metrics (Row 1: 5 Columns) */}
        <div className="bg-white border border-slate-200 rounded-md shadow-xs grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 text-center py-4">
          <div className="py-2 sm:py-0 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => handleCardClick('all_su_bookings')}>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">{primary.total_bookings.toLocaleString()}</div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-1">TOTAL BOOKINGS</div>
          </div>
          <div className="py-2 sm:py-0 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => handleCardClick('all_su_bookings')}>
            <div className="text-2xl font-bold text-[#16a34a] tracking-tight">{primary.matched.toLocaleString()}</div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-1">MATCHED</div>
          </div>
          <div className="py-2 sm:py-0 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => handleCardClick('confirmed_su_cancelled_pms')}>
            <div className="text-2xl font-bold text-[#ea580c] tracking-tight">{primary.mismatched.toLocaleString()}</div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-1">MISMATCHED</div>
          </div>
          <div className="py-2 sm:py-0 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => handleCardClick('missing_in_pms')}>
            <div className="text-2xl font-bold text-slate-700 tracking-tight">{primary.missing.toLocaleString()}</div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-1">MISSING</div>
          </div>
          <div className="py-2 sm:py-0 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => handleCardClick('cancellation_pending')}>
            <div className="text-2xl font-bold text-[#dc2626] tracking-tight">{primary.cancellation_pending.toLocaleString()}</div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-1">CANCELLATION PENDING</div>
          </div>
        </div>

        {/* Secondary Metrics (Row 2: 7 Cards) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div 
            onClick={() => handleCardClick('missing_in_su')}
            className="bg-white border border-slate-200 rounded-md p-3 shadow-xs hover:border-slate-300 transition-all cursor-pointer"
          >
            <div className="text-lg font-bold text-slate-900">{secondary.pms_base_rows.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">PMS Base Dump rows</div>
          </div>
          <div 
            onClick={() => handleCardClick('query_not_in_base')}
            className="bg-white border border-slate-200 rounded-md p-3 shadow-xs hover:border-slate-300 transition-all cursor-pointer"
          >
            <div className="text-lg font-bold text-slate-900">{secondary.pms_query_rows.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">PMS Query Dump rows</div>
          </div>
          <div 
            onClick={() => handleCardClick('pms_special_status')}
            className="bg-white border border-slate-200 rounded-md p-3 shadow-xs hover:border-slate-300 transition-all cursor-pointer"
          >
            <div className="text-lg font-bold text-slate-900">{secondary.pms_tentative_noshow.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">PMS Tentative / No-show</div>
          </div>
          <div 
            onClick={() => handleCardClick('missing_in_su')}
            className="bg-white border border-slate-200 rounded-md p-3 shadow-xs hover:border-slate-300 transition-all cursor-pointer"
          >
            <div className="text-lg font-bold text-slate-900">{secondary.pms_not_found_in_su.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">PMS bookings not found in SU</div>
          </div>
          <div 
            onClick={() => handleCardClick('base_vs_query_mismatch')}
            className="bg-white border border-slate-200 rounded-md p-3 shadow-xs hover:border-slate-300 transition-all cursor-pointer"
          >
            <div className="text-lg font-bold text-slate-900">{secondary.base_vs_query_mismatch.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">Base vs Query mismatch</div>
          </div>
          <div 
            onClick={() => handleCardClick('query_not_in_base')}
            className="bg-white border border-slate-200 rounded-md p-3 shadow-xs hover:border-slate-300 transition-all cursor-pointer"
          >
            <div className="text-lg font-bold text-slate-900">{secondary.query_missing_in_base.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">Query records missing in Base</div>
          </div>
          <div 
            onClick={() => handleCardClick('all_su_bookings')}
            className="bg-white border border-slate-200 rounded-md p-3 shadow-xs hover:border-slate-300 transition-all cursor-pointer"
          >
            <div className="text-lg font-bold text-slate-900">{secondary.su_status_unclear.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">SU status unclear</div>
          </div>
        </div>

        {/* Navigation / Filter Tabs */}
        <div className="border-b border-slate-200 flex items-center flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-slate-600 pt-2">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const badgeCount = data?.tab_counts?.[tab.key] ?? (data?.tabs_data?.[tab.key]?.length ?? tab.badge);
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setPage(1);
                  setInspectIndex(null);
                }}
                className={`pb-2.5 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? 'text-blue-600 border-b-2 border-blue-600 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{tab.label}</span>
                {badgeCount !== null && (
                  <span className={`text-[11px] font-semibold px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {badgeCount.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sub-toolbar (Search, Row Count, Export buttons) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="relative w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search..."
              className="w-full bg-white border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500">
              {filteredItems.length} rows
            </span>

            {/* Open directly in Microsoft Excel on Mac */}
            <button
              onClick={() => handleDirectOpenExcel(activeTab, 'xlsx')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-3 py-1 rounded text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Generate real .xlsx file directly in ~/Downloads and launch Microsoft Excel immediately"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Open in Excel (Mac)</span>
            </button>

            {/* Export Excel (.xlsx) */}
            <button
              onClick={() => triggerDownload(getTabExportUrl(activeTab, 'xlsx'), `su_pms_${activeTab}.xlsx`)}
              disabled={downloading === `su_pms_${activeTab}.xlsx`}
              className="border border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-medium px-3 py-1 rounded text-xs transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
              title="Download real Excel workbook (.xlsx) directly to your computer"
            >
              <Download className={`h-3 w-3 text-emerald-600 ${downloading === `su_pms_${activeTab}.xlsx` ? 'animate-bounce' : ''}`} />
              <span>{downloading === `su_pms_${activeTab}.xlsx` ? 'Downloading...' : 'Export Excel (.xlsx)'}</span>
            </button>

            {/* Export CSV (UTF-8 with BOM for Excel) */}
            <button
              onClick={() => triggerDownload(getTabExportUrl(activeTab, 'csv'), `su_pms_${activeTab}.csv`)}
              disabled={downloading === `su_pms_${activeTab}.csv`}
              className="border border-blue-600 text-blue-600 hover:bg-blue-50 font-medium px-3 py-1 rounded text-xs transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
              title="Download UTF-8 BOM CSV that opens cleanly in Excel & Numbers"
            >
              <Download className={`h-3 w-3 ${downloading === `su_pms_${activeTab}.csv` ? 'animate-bounce' : ''}`} />
              <span>{downloading === `su_pms_${activeTab}.csv` ? 'Downloading...' : 'Export CSV'}</span>
            </button>

            {/* Download Claude Payload CSV */}
            <button
              onClick={() => triggerDownload(getClaudeExportUrl(data?.batch_id || '', 'csv'), 'claude_payload_export.csv')}
              disabled={downloading === 'claude_payload_export.csv'}
              className="bg-slate-800 hover:bg-slate-900 text-white font-medium px-3 py-1 rounded text-xs transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
              title="Download Claude-optimized flat dataset (CSV with BOM) for automated Slack representative tagging"
            >
              <Download className={`h-3 w-3 ${downloading === 'claude_payload_export.csv' ? 'animate-bounce' : ''}`} />
              <span>{downloading === 'claude_payload_export.csv' ? 'Downloading...' : 'Claude (CSV)'}</span>
            </button>

            {/* Download Claude Payload XLSX */}
            <button
              onClick={() => triggerDownload(getClaudeExportUrl(data?.batch_id || '', 'xlsx'), 'claude_payload_export.xlsx')}
              disabled={downloading === 'claude_payload_export.xlsx'}
              className="bg-slate-700 hover:bg-slate-800 text-slate-200 font-medium px-2.5 py-1 rounded text-xs transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
              title="Download Claude-optimized flat dataset in Excel format"
            >
              <Download className={`h-3 w-3 ${downloading === 'claude_payload_export.xlsx' ? 'animate-bounce' : ''}`} />
              <span>{downloading === 'claude_payload_export.xlsx' ? 'Downloading...' : 'Claude (XLSX)'}</span>
            </button>
          </div>
        </div>

        {/* Clean Light Data Table */}
        <div className="bg-white border border-slate-200 rounded-md shadow-xs overflow-x-auto min-h-[350px]">
          {loading ? (
            <div className="py-20 text-center text-xs text-slate-400">Loading records...</div>
          ) : paginatedItems.length === 0 ? (
            <div className="py-20 text-center text-xs text-slate-400">No records found matching criteria.</div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                  <th className="py-2.5 px-3">Reservation ID</th>
                  <th className="py-2.5 px-3">Vendor Booking ID</th>
                  <th className="py-2.5 px-3">Guest Name</th>
                  <th className="py-2.5 px-3">Channel</th>
                  <th className="py-2.5 px-3">SU Status</th>
                  <th className="py-2.5 px-3">PMS Status</th>
                  <th className="py-2.5 px-3">Property Name (OTA Portal)</th>
                  <th className="py-2.5 px-3">Representative</th>
                  <th className="py-2.5 px-3">Check In</th>
                  <th className="py-2.5 px-3">Match Type</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedItems.map((item, localIdx) => {
                  const isUrlAvailable =
                    item.target_portal_url &&
                    item.target_portal_url !== 'not available' &&
                    item.target_portal_url.startsWith('http');

                  const absoluteIdx = (page - 1) * pageSize + localIdx;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <span>{item.reservation_id}</span>
                          <button
                            onClick={() => copyToClipboard(item.reservation_id, item.id)}
                            className="text-slate-400 hover:text-slate-600"
                            title="Copy ID"
                          >
                            {copiedId === item.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {item.vendor_booking_id || '—'}
                      </td>

                      <td className="py-2.5 px-3 text-slate-700 max-w-[150px] truncate" title={item.guest_name}>
                        {item.guest_name || '—'}
                      </td>

                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                        {item.channel}
                      </td>

                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                          item.su_status === 'Confirmed'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : item.su_status === 'Cancelled'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {item.su_status || '—'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                          item.pms_status === 'confirmed' || item.pms_status === 'Converted'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : item.pms_status === 'cancelled'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {item.pms_status || '—'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 max-w-[200px]">
                        {isUrlAvailable ? (
                          <a
                            href={item.target_portal_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline font-medium inline-flex items-center gap-1 truncate"
                            title={item.target_portal_url}
                          >
                            <span className="truncate">{item.property_name || 'View Property'}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-slate-600 truncate block">
                            {item.property_name || 'Unknown Property'}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                          item.assigned_representative === 'Unassigned'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-800'
                        }`}>
                          <User className="h-3 w-3 opacity-60" />
                          {item.assigned_representative || 'Unassigned'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {item.check_in || '—'}
                      </td>

                      <td className="py-2.5 px-3 text-[11px] text-slate-500">
                        {item.match_type || '—'}
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => setInspectIndex(absoluteIdx)}
                          className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
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
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 pt-1">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="bg-white border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-700 focus:outline-none"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>
              Showing {filteredItems.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredItems.length)} of {filteredItems.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span>Page {page} of {totalPages}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Slide-out Inspection Drawer with Record Navigation */}
      {inspectItem && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setInspectIndex(null)}
          />
          <div className="relative z-10 w-full max-w-lg bg-white border-l border-slate-200 shadow-2xl h-full flex flex-col overflow-y-auto">
            <div className="p-5 border-b border-slate-200 flex items-start justify-between bg-slate-50">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    Res #{inspectItem.reservation_id}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    {inspectItem.channel}
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-900">
                  Reservation Discrepancy Inspection
                </h2>
              </div>
              <button
                onClick={() => setInspectIndex(null)}
                className="p-1.5 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 flex-1 text-xs text-slate-700">
              {/* Record Navigator Buttons inside Drawer */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 text-slate-500">
                <button
                  onClick={() => setInspectIndex(idx => Math.max(0, idx - 1))}
                  disabled={inspectIndex <= 0}
                  className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Previous</span>
                </button>
                <span className="font-medium text-slate-600">
                  Record {inspectIndex + 1} of {filteredItems.length}
                </span>
                <button
                  onClick={() => setInspectIndex(idx => Math.min(filteredItems.length - 1, idx + 1))}
                  disabled={inspectIndex >= filteredItems.length - 1}
                  className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  <span>Next</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Conflict Summary */}
              <div className="p-3.5 rounded-md bg-rose-50 border border-rose-200 space-y-1">
                <div className="font-semibold text-rose-800 text-xs">Status Mismatch / Alert</div>
                <p className="text-slate-700 text-xs">
                  SU Status: <strong className="text-slate-900">{inspectItem.su_status || 'N/A'}</strong> | 
                  PMS Status: <strong className="text-slate-900">{inspectItem.pms_status || 'N/A'}</strong>
                </p>
                {inspectItem.notes && (
                  <p className="text-[11px] text-slate-600 mt-1 italic">{inspectItem.notes}</p>
                )}
              </div>

              {/* Guest & Reservation Info */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Booking Details</h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Guest Name</span>
                    <span className="font-semibold text-slate-800">{inspectItem.guest_name || 'Unknown'}</span>
                  </div>
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Channel</span>
                    <span className="font-semibold text-slate-800">{inspectItem.channel}</span>
                  </div>
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Check-In</span>
                    <span className="font-mono text-slate-800">{inspectItem.check_in || '—'}</span>
                  </div>
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Check-Out</span>
                    <span className="font-mono text-slate-800">{inspectItem.check_out || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Property & OTA Contract */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Property & Portal Link</h3>
                <div className="p-3.5 rounded bg-slate-50 border border-slate-200 space-y-2">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Property Name</span>
                    <span className="font-semibold text-sm text-slate-900">{inspectItem.property_name || 'Unknown Property'}</span>
                    {inspectItem.property_id && (
                      <span className="text-[10px] text-slate-500 block font-mono">Master Property ID: #{inspectItem.property_id}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block mb-0.5">Target Portal URL</span>
                    {inspectItem.target_portal_url && inspectItem.target_portal_url.startsWith('http') ? (
                      <a
                        href={inspectItem.target_portal_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline break-all flex items-center gap-1 font-medium"
                      >
                        <span>{inspectItem.target_portal_url}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-slate-500 font-mono">not available</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Claude Slack Tag Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Claude Slack Tagged Alert</h3>
                  <button
                    onClick={() => {
                      const msg = `@${inspectItem.assigned_representative || 'Operations'} Discrepancy Alert:
Reservation #${inspectItem.reservation_id} (${inspectItem.channel}) has a conflict.
SU: ${inspectItem.su_status || 'N/A'} | PMS: ${inspectItem.pms_status || 'N/A'}
Property: ${inspectItem.property_name || 'N/A'} (ID: ${inspectItem.property_id || 'N/A'})
Guest: ${inspectItem.guest_name || 'N/A'}
Check-in: ${inspectItem.check_in || 'N/A'}
Portal Link: ${inspectItem.target_portal_url || 'not available'}
Please review in OTA portal and synchronize PMS state.`;
                      navigator.clipboard.writeText(msg);
                      setCopiedSlack(true);
                      setTimeout(() => setCopiedSlack(false), 2000);
                    }}
                    className="text-blue-600 hover:text-blue-800 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                  >
                    {copiedSlack ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        <span className="text-emerald-700">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy Slack Alert</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-3 bg-slate-100 rounded border border-slate-200 font-mono text-[11px] text-slate-800 whitespace-pre-wrap leading-relaxed">
{`@${inspectItem.assigned_representative || 'Operations'} Discrepancy Alert:
Reservation #${inspectItem.reservation_id} (${inspectItem.channel}) has a conflict.
SU: ${inspectItem.su_status || 'N/A'} | PMS: ${inspectItem.pms_status || 'N/A'}
Property: ${inspectItem.property_name || 'N/A'} (ID: ${inspectItem.property_id || 'N/A'})
Guest: ${inspectItem.guest_name || 'N/A'}
Check-in: ${inspectItem.check_in || 'N/A'}
Portal Link: ${inspectItem.target_portal_url || 'not available'}`}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="text-xs text-slate-600">
                Assigned Rep: <strong className="text-slate-900">{inspectItem.assigned_representative || 'Unassigned'}</strong>
              </div>
              <button
                onClick={() => setInspectIndex(null)}
                className="px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Navigator / Explorer Modal */}
      {fileNavOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setFileNavOpen(false)}
          />
          <div className="relative z-10 w-full max-w-4xl bg-white rounded-lg shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 px-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-md">
                  <FolderKanban className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Workspace & Data File Navigator
                  </h2>
                  <p className="text-xs text-slate-500">
                    Navigate, preview, load into MIS, or open directly in Microsoft Excel on macOS.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setFileNavOpen(false)}
                className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Content / Files List */}
            <div className="p-6 overflow-y-auto space-y-3 flex-1">
              <div className="text-xs text-slate-500 flex items-center justify-between mb-2">
                <span>Found {workspaceFiles.length} file(s) across project data, archives, and downloads:</span>
                <button
                  onClick={refreshWorkspaceFilesList}
                  className="text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Refresh List</span>
                </button>
              </div>

              {workspaceFiles.map((wf) => {
                const isSelected = selectedWorkspaceFile === wf.path;
                return (
                  <div
                    key={wf.path}
                    className={`p-3.5 rounded-lg border transition-all flex flex-wrap items-center justify-between gap-3 ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500' 
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="space-y-1 min-w-[280px]">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          wf.extension === '.xlsx'
                            ? 'bg-emerald-100 text-emerald-800'
                            : wf.extension === '.xls'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {wf.extension.replace('.', '')}
                        </span>
                        <span className="font-semibold text-xs text-slate-900">{wf.name}</span>
                        <span className="text-[10px] text-slate-400">({wf.size_kb} KB)</span>
                      </div>
                      
                      <div className="flex items-center gap-3 text-[11px] text-slate-500">
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-600 font-medium">
                          {wf.source}
                        </span>
                        {wf.modified && <span>Modified: {wf.modified}</span>}
                      </div>

                      {wf.sheets && wf.sheets.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          <span className="text-[10px] text-slate-400">Sheets:</span>
                          {wf.sheets.map((sh) => (
                            <span 
                              key={sh}
                              className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200"
                            >
                              {sh}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Load & Reconcile */}
                      <button
                        onClick={() => {
                          handleSelectWorkspaceFile(wf.path);
                          setFileNavOpen(false);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2.5 py-1.5 rounded font-medium transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
                        title="Reconcile and display this file in the dashboard"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Reconcile / Load</span>
                      </button>

                      {/* In-App Preview */}
                      <button
                        onClick={() => {
                          handleOpenFilePreview(wf.path);
                        }}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-2.5 py-1.5 rounded font-medium transition-colors cursor-pointer flex items-center gap-1"
                        title="Inspect sheets and rows inside the browser"
                      >
                        <Eye className="h-3 w-3" />
                        <span>Preview / Inspect</span>
                      </button>

                      {/* Open in macOS default application (Excel) */}
                      <button
                        onClick={() => handleOpenSystem(wf.path, 'open')}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs px-2.5 py-1.5 rounded font-medium transition-colors cursor-pointer flex items-center gap-1"
                        title="Launch directly in Microsoft Excel or Numbers on your Mac"
                      >
                        <FileSpreadsheet className="h-3 w-3 text-emerald-600" />
                        <span>Open on Mac</span>
                      </button>

                      {/* Reveal in macOS Finder */}
                      <button
                        onClick={() => handleOpenSystem(wf.path, 'reveal')}
                        className="bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 text-xs px-2 py-1.5 rounded transition-colors cursor-pointer"
                        title="Reveal in macOS Finder"
                      >
                        Finder
                      </button>

                      {/* Download */}
                      <button
                        onClick={() => triggerDownload(getWorkspaceFileDownloadUrl(wf.path), wf.name)}
                        className="bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 p-1.5 rounded transition-colors cursor-pointer inline-flex items-center"
                        title="Download to computer"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-4 px-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Tip: You can also drag and drop workbooks directly into the upload bar.
              </span>
              <button
                onClick={() => setFileNavOpen(false)}
                className="px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6">
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setPreviewFile(null)}
          />
          <div className="relative z-10 w-full max-w-6xl bg-white rounded-lg shadow-2xl border border-slate-200 h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="p-4 px-6 border-b border-slate-200 flex items-center justify-between bg-slate-50 flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  <h2 className="text-base font-bold text-slate-900">
                    {previewFile.file_name}
                  </h2>
                  <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono">
                    {previewFile.rows.length} rows loaded
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-mono mt-0.5 truncate max-w-xl">
                  {previewFile.file_path}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    handleSelectWorkspaceFile(previewFile.file_path);
                    setPreviewFile(null);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded font-medium transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Reconcile This File</span>
                </button>

                <button
                  onClick={() => handleOpenSystem(previewFile.file_path, 'open')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 rounded font-medium transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
                >
                  <FileSpreadsheet className="h-3 w-3" />
                  <span>Open in Excel (Mac)</span>
                </button>

                <button
                  onClick={() => handleOpenSystem(previewFile.file_path, 'reveal')}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs px-2.5 py-1.5 rounded font-medium transition-colors cursor-pointer"
                >
                  Finder
                </button>

                <button
                  onClick={() => triggerDownload(getWorkspaceFileDownloadUrl(previewFile.file_path), previewFile.file_name)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs px-2.5 py-1.5 rounded font-medium transition-colors inline-flex items-center gap-1 cursor-pointer"
                  title="Download file to computer"
                >
                  <Download className="h-3 w-3" />
                  <span>Download</span>
                </button>

                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-1.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors ml-2 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Sheets Bar (if multiple sheets exist) */}
            {previewFile.sheets && previewFile.sheets.length > 0 && (
              <div className="bg-slate-100 border-b border-slate-200 px-6 py-1.5 flex items-center gap-2 overflow-x-auto text-xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase mr-1">Sheets:</span>
                {previewFile.sheets.map((sheet) => {
                  const isActive = previewFile.active_sheet === sheet;
                  return (
                    <button
                      key={sheet}
                      onClick={() => handleSwitchPreviewSheet(sheet)}
                      disabled={previewLoading}
                      className={`px-3 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                        isActive
                          ? 'bg-white text-blue-700 shadow-2xs border border-slate-300 font-semibold'
                          : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                      }`}
                    >
                      {sheet}
                    </button>
                  );
                })}
              </div>
            )}

            {/* In-modal Search Bar */}
            <div className="p-3 px-6 border-b border-slate-200 bg-white flex items-center justify-between gap-4">
              <div className="relative w-72">
                <input
                  type="text"
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  placeholder={`Search ${previewFile.active_sheet || 'sheet'} rows...`}
                  className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
                {previewSearch && (
                  <button
                    onClick={() => setPreviewSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
              <span className="text-xs text-slate-500">
                Showing {filteredPreviewRows.length} of {previewFile.rows.length} rows (first 100 preview)
              </span>
            </div>

            {/* Data Grid Table */}
            <div className="flex-1 overflow-auto bg-slate-50/50 p-4">
              {filteredPreviewRows.length === 0 ? (
                <div className="py-20 text-center text-xs text-slate-400">
                  No records matching search query.
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 text-[11px] sticky top-0">
                        <th className="py-2 px-3 border-r border-slate-200 bg-slate-100 text-slate-400 w-12 text-center">#</th>
                        {previewFile.columns.map((col) => (
                          <th key={col} className="py-2 px-3 border-r border-slate-200 whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {filteredPreviewRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/40 transition-colors">
                          <td className="py-1.5 px-3 border-r border-slate-200 text-center text-slate-400 select-none">
                            {idx + 1}
                          </td>
                          {previewFile.columns.map((col) => (
                            <td key={col} className="py-1.5 px-3 border-r border-slate-100 whitespace-nowrap text-slate-700 max-w-xs truncate" title={String(row[col] ?? '')}>
                              {String(row[col] ?? '') || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 px-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
              <span>Displaying preview snapshot. To edit or view the full sheet, click "Open in Excel (Mac)".</span>
              <button
                onClick={() => setPreviewFile(null)}
                className="px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
      {/* In-App File Ingestion & Multi-Format Upload Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6">
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setImportModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-5 px-6 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                  <FileUp className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Import & Reconcile Booking Files
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Upload separate SU & PMS reports or a single combined workbook. Supports .xlsx, .xls (BIFF8 corrupt-tolerant), and .csv.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setImportModalOpen(false)}
                className="p-1.5 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Dual File Upload Slots */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Slot 1: SU Report */}
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 hover:border-blue-300 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                      Source System (SU) Report
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">.xlsx, .csv</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                    Source bookings with Reservation ID, Source of Booking, and Admin status flags.
                  </p>

                  {modalSuFile ? (
                    <div className="bg-white border border-blue-200 rounded-md p-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <FileSpreadsheet className="h-4 w-4 text-blue-600 shrink-0" />
                        <span className="text-xs font-medium text-slate-800 truncate" title={modalSuFile.name}>
                          {modalSuFile.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          ({(modalSuFile.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        onClick={() => setModalSuFile(null)}
                        className="text-slate-400 hover:text-red-600 p-1 transition-colors cursor-pointer"
                        title="Remove file"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="border border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/30 rounded-md p-4 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors text-center">
                      <Upload className="h-4 w-4 text-slate-400" />
                      <span className="text-xs font-medium text-blue-600">Select SU File</span>
                      <span className="text-[10px] text-slate-400">or drop file here</span>
                      <input
                        ref={suFileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="sr-only"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            setModalSuFile(e.target.files[0]);
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>
                  )}
                </div>

                {/* Slot 2: PMS Report */}
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 hover:border-emerald-300 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                      PMS Base / 180-Day Report
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">.xls, .xlsx, .csv</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                    PMS reservations, 180-day dumps, or Base/Query sheets with booking_id/property_id.
                  </p>

                  {modalPmsFile ? (
                    <div className="bg-white border border-emerald-200 rounded-md p-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span className="text-xs font-medium text-slate-800 truncate" title={modalPmsFile.name}>
                          {modalPmsFile.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          ({(modalPmsFile.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        onClick={() => setModalPmsFile(null)}
                        className="text-slate-400 hover:text-red-600 p-1 transition-colors cursor-pointer"
                        title="Remove file"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="border border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/30 rounded-md p-4 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors text-center">
                      <Upload className="h-4 w-4 text-slate-400" />
                      <span className="text-xs font-medium text-emerald-600">Select PMS File</span>
                      <span className="text-[10px] text-slate-400">or drop file here</span>
                      <input
                        ref={pmsFileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="sr-only"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            setModalPmsFile(e.target.files[0]);
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Quick Presets / System Workspaces */}
              <div className="border-t border-slate-200 pt-4">
                <span className="text-xs font-semibold text-slate-700 block mb-2">
                  Quick Workspace Presets:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    onClick={() => {
                      handleSelectWorkspaceFile('data/ota_reservation_180day_report_1107_2026-09-24.xls');
                      setImportModalOpen(false);
                    }}
                    className="p-2.5 text-left border border-slate-200 rounded-lg hover:border-blue-400 hover:bg-blue-50/40 transition-all cursor-pointer flex items-center justify-between"
                  >
                    <div>
                      <span className="text-xs font-medium text-slate-800 block">SU + PMS 180-Day Report</span>
                      <span className="text-[10px] text-slate-500">Auto-pairs SU bookings with 180-day PMS report</span>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  </button>

                  <button
                    onClick={() => {
                      handleSelectWorkspaceFile('data/SU__Cancelled_Bookings.xlsx');
                      setImportModalOpen(false);
                    }}
                    className="p-2.5 text-left border border-slate-200 rounded-lg hover:border-blue-400 hover:bg-blue-50/40 transition-all cursor-pointer flex items-center justify-between"
                  >
                    <div>
                      <span className="text-xs font-medium text-slate-800 block">Combined 3-Sheet Workbook</span>
                      <span className="text-[10px] text-slate-500">Sheet1 (SU), query dump, Base dump</span>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 px-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {[modalSuFile, modalPmsFile].filter(Boolean).length} file(s) ready to reconcile
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setImportModalOpen(false)}
                  className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleModalUploadSubmit}
                  disabled={uploading || (!modalSuFile && !modalPmsFile)}
                  className="px-5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer flex items-center gap-1.5 disabled:opacity-50 transition-all shadow-xs"
                >
                  <RefreshCw className={`h-3 w-3 ${uploading ? 'animate-spin' : ''}`} />
                  <span>{uploading ? 'Reconciling...' : 'Process & Reconcile'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Automated Office Email & Watcher Modal */}
      <EmailAutomationModal
        isOpen={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        onRefreshData={loadData}
        showToast={showToast}
      />
    </div>
  );
}
