const API_BASE = '/api/v1';

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Failed to fetch system health');
  return res.json();
}

export async function fetchLatestMIS(refresh = false) {
  const url = refresh ? `${API_BASE}/mis/latest?refresh=true` : `${API_BASE}/mis/latest`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch MIS dashboard data');
  return res.json();
}

export async function fetchWorkspaceFiles() {
  const res = await fetch(`${API_BASE}/files/workspace`);
  if (!res.ok) return [];
  return res.json();
}

export async function selectWorkspaceFile(filePath) {
  const res = await fetch(`${API_BASE}/mis/select-file?file_path=${encodeURIComponent(filePath)}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Failed to process file' }));
    throw new Error(errorData.detail || 'Failed to process selected file');
  }
  return res.json();
}

export async function processMISFiles(files) {
  const formData = new FormData();
  if (Array.isArray(files)) {
    for (const f of files) {
      formData.append('files', f);
    }
  } else if (files) {
    formData.append('files', files);
  }

  const res = await fetch(`${API_BASE}/mis/process`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Processing failed' }));
    throw new Error(errorData.detail || 'Failed to process files');
  }
  return res.json();
}

export function getTabExportUrl(tabName, format = 'csv') {
  return `${API_BASE}/mis/export/${encodeURIComponent(tabName)}?format=${encodeURIComponent(format)}`;
}

export function getClaudeExportUrl(batchId = '', format = 'csv') {
  return `${API_BASE}/export/claude-payload?format=${encodeURIComponent(format)}${batchId ? `&batch_id=${encodeURIComponent(batchId)}` : ''}`;
}

export async function previewWorkspaceFile(filePath, sheetName = null) {
  const url = `${API_BASE}/files/preview?file_path=${encodeURIComponent(filePath)}${sheetName ? `&sheet_name=${encodeURIComponent(sheetName)}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Failed to preview file' }));
    throw new Error(errorData.detail || 'Failed to preview file');
  }
  return res.json();
}

export async function openFileInSystem(filePath, action = 'open') {
  const res = await fetch(`${API_BASE}/files/open-system?file_path=${encodeURIComponent(filePath)}&action=${encodeURIComponent(action)}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Failed to open file in system' }));
    throw new Error(errorData.detail || 'Failed to open file in system');
  }
  return res.json();
}

export function getWorkspaceFileDownloadUrl(filePath) {
  return `${API_BASE}/files/download?file_path=${encodeURIComponent(filePath)}`;
}

export async function exportAndOpenInExcel(tabName = 'cancellation_pending', format = 'xlsx') {
  const res = await fetch(`${API_BASE}/mis/export-and-open?tab_name=${encodeURIComponent(tabName)}&format=${encodeURIComponent(format)}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Failed to export and open' }));
    throw new Error(errorData.detail || 'Failed to export and open');
  }
  return res.json();
}

export async function triggerQuickReconcile() {
  const res = await fetch(`${API_BASE}/reconcile/quick`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to run quick reconciliation');
  return res.json();
}

/**
 * Universal browser file download helper using Blob and Object URLs.
 * Guarantees that files download cleanly in any browser with exact filenames
 * and proper error handling.
 */
export async function downloadFileFromUrl(url, defaultFilename) {
  const res = await fetch(url);
  if (!res.ok) {
    let errorDetail = `Download failed (${res.status} ${res.statusText})`;
    try {
      const errJson = await res.json();
      if (errJson.detail) errorDetail = errJson.detail;
    } catch (_) {}
    throw new Error(errorDetail);
  }

  let filename = defaultFilename;
  const disposition = res.headers.get('Content-Disposition') || res.headers.get('content-disposition');
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename=["']?([^"';]+)["']?/);
    if (match && match[1]) {
      filename = match[1];
    }
  }

  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(blobUrl);
  }, 500);

  return filename;
}
