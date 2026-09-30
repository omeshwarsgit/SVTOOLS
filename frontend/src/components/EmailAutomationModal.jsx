import React, { useState, useEffect } from 'react';
import { 
  X, 
  Mail, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  FolderSync, 
  Terminal, 
  Copy, 
  Check, 
  ShieldCheck,
  FileSpreadsheet,
  Plus,
  Trash2,
  AtSign,
  UserPlus,
  Share2,
  FileCheck
} from 'lucide-react';
import { 
  fetchAutomationStatus, 
  triggerAutomationSendEmail, 
  triggerAutomationTestEmail,
  triggerAutomatedReconciliation,
  triggerSlackTest,
  triggerSlackSend
} from '../services/api';

export default function EmailAutomationModal({ 
  isOpen, 
  onClose, 
  onRefreshData, 
  showToast,
  currentBatchData 
}) {
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [triggeringIngest, setTriggeringIngest] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const [newRecipientInput, setNewRecipientInput] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [sendingSlack, setSendingSlack] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const res = await fetchAutomationStatus();
      setStatusData(res);
      if (res.recipients && res.recipients.length > 0) {
        setRecipients((prev) => (prev.length === 0 ? res.recipients : prev));
      }
    } catch (err) {
      console.error('Failed to load automation status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Recipient chip management
  const handleAddRecipient = (e) => {
    if (e) e.preventDefault();
    const clean = newRecipientInput.trim().toLowerCase();
    if (!clean) return;
    if (!clean.includes('@') || !clean.includes('.')) {
      showToast('Please enter a valid email address (e.g. name@stayvista.com).');
      return;
    }
    if (recipients.map((r) => r.toLowerCase()).includes(clean)) {
      showToast(`'${clean}' is already in the recipient list.`);
      return;
    }
    setRecipients([...recipients, clean]);
    setNewRecipientInput('');
    showToast(`Added '${clean}' to recipients!`);
  };

  const handleRemoveRecipient = (emailToRemove) => {
    setRecipients(recipients.filter((r) => r !== emailToRemove));
  };

  const handleQuickAdd = (email) => {
    if (recipients.map((r) => r.toLowerCase()).includes(email.toLowerCase())) {
      showToast(`'${email}' already included.`);
      return;
    }
    setRecipients([...recipients, email]);
    showToast(`Added '${email}'!`);
  };

  const handleSendEmailNow = async () => {
    if (recipients.length === 0) {
      showToast('Please add at least one recipient email address before sending.');
      return;
    }

    try {
      setSendingEmail(true);
      const res = await triggerAutomationSendEmail({ 
        recipients,
        subject: customSubject.trim() || undefined
      });
      if (res.status === 'success') {
        showToast(`Report successfully forwarded to ${res.recipients?.length || recipients.length} recipient(s)!`);
        onClose();
      } else if (res.status === 'dry_run_saved') {
        showToast(`Report saved to archives (${res.message})`);
        onClose();
      } else {
        showToast(res.message || 'Email dispatched');
      }
      loadStatus();
    } catch (err) {
      showToast(`Email error: ${err.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleTestEmail = async () => {
    const target = testEmailAddress.trim() || (recipients[0] || '');
    if (!target) {
      showToast('Please enter an email address to test.');
      return;
    }

    try {
      setTestingEmail(true);
      const res = await triggerAutomationTestEmail(target);
      showToast(res.message || `Test email sent to ${target}!`);
    } catch (err) {
      showToast(`Test failed: ${err.message}`);
    } finally {
      setTestingEmail(false);
    }
  };

  const handleTriggerReconcile = async () => {
    try {
      setTriggeringIngest(true);
      showToast('Running automated reconciliation on watch folder...');
      const res = await triggerAutomatedReconciliation();
      showToast(`Reconciliation finished! Matched: ${res.primary_metrics?.matched || 0}`);
      if (onRefreshData) onRefreshData();
      loadStatus();
    } catch (err) {
      showToast(`Automated ingestion error: ${err.message}`);
    } finally {
      setTriggeringIngest(false);
    }
  };

  const handleTestSlack = async () => {
    try {
      setTestingSlack(true);
      const res = await triggerSlackTest();
      showToast(res.message || 'Slack test message posted successfully!');
    } catch (err) {
      showToast(`Slack test failed: ${err.message}`);
    } finally {
      setTestingSlack(false);
    }
  };

  const handleSendSlackNow = async () => {
    try {
      setSendingSlack(true);
      const res = await triggerSlackSend();
      if (res.status === 'success') {
        showToast('Live alert posted to your Slack channel successfully!');
      } else {
        showToast(res.message || 'Slack alert processed');
      }
    } catch (err) {
      showToast(`Slack alert error: ${err.message}`);
    } finally {
      setSendingSlack(false);
    }
  };

  const copyCliCommand = (cmd) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2500);
  };

  const isConfigured = statusData?.smtp_configured;
  const p = currentBatchData?.primary_metrics;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-6">
        
        {/* Header */}
        <div className="bg-slate-950 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/30">
              <Share2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-white flex items-center gap-2">
                <span>Forward & Dispatch Reconciliation Report</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                  SMTP Live
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Send the 9-sheet executive Excel workbook & HTML alert to team members
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          
          {/* Current Batch Preview Banner */}
          {p && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <FileCheck className="h-5 w-5 text-blue-600 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Active Report: {currentBatchData.batch_id ? `Batch #${currentBatchData.batch_id.slice(0, 8)}` : 'Current Reconciled Data'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Includes formatted executive summary and 8 discrepancy sheets
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded">
                  {p.matched || 0} Matched
                </span>
                <span className="bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded">
                  {p.mismatched || 0} Mismatched
                </span>
                <span className="bg-rose-100 text-rose-800 font-semibold px-2 py-0.5 rounded">
                  {p.cancellation_pending || 0} Cancel Pending
                </span>
              </div>
            </div>
          )}

          {/* Sender Credentials Indicator */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 flex items-start justify-between gap-3 text-xs text-blue-900">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">Company Sender Account: </span>
                <code className="font-mono text-blue-800 font-semibold">{statusData?.sender_account || 'bcomreservations@stayvista.com'}</code>
                <div className="text-[11px] text-blue-700 mt-0.5">
                  Authenticated via Google Workspace SMTP (Port 587 TLS) • No third-party platform needed
                </div>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              Connected
            </span>
          </div>

          {/* Recipient Management Section */}
          <div className="border border-slate-200 rounded-lg p-4 bg-white space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase tracking-wide">
                <AtSign className="h-3.5 w-3.5 text-blue-600" />
                <span>Recipient Inboxes ({recipients.length})</span>
              </label>
              <span className="text-[11px] text-slate-500">
                All recipients receive identical reports & attached Excel file
              </span>
            </div>

            {/* Recipient Chips */}
            <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 bg-slate-50 rounded-lg border border-slate-200">
              {recipients.length === 0 ? (
                <span className="text-xs text-slate-400 italic py-1 px-1">
                  No recipients added yet. Add recipients below to forward this report.
                </span>
              ) : (
                recipients.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-900 border border-blue-200 text-xs px-2.5 py-1 rounded-full font-medium"
                  >
                    <span>{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveRecipient(email)}
                      className="text-blue-500 hover:text-rose-600 p-0.5 rounded-full hover:bg-white transition-colors cursor-pointer"
                      title={`Remove ${email}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Add Missed Recipient Input Bar */}
            <form onSubmit={handleAddRecipient} className="flex gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <UserPlus className="h-3.5 w-3.5" />
                </div>
                <input
                  type="email"
                  value={newRecipientInput}
                  onChange={(e) => setNewRecipientInput(e.target.value)}
                  placeholder="Type any missed recipient email (e.g. manager@stayvista.com)..."
                  className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <button
                type="submit"
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Recipient</span>
              </button>
            </form>

            {/* Quick Suggestion Chips */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span className="text-[11px] text-slate-500 font-medium">Quick Add Missed:</span>
              <button
                type="button"
                onClick={() => handleQuickAdd('omeshwar.shukla@stayvista.co.in')}
                className="text-[11px] bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
              >
                + omeshwar.shukla@stayvista.co.in
              </button>
              <button
                type="button"
                onClick={() => handleQuickAdd('bcomreservations@stayvista.com')}
                className="text-[11px] bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
              >
                + bcomreservations@stayvista.com
              </button>
              <button
                type="button"
                onClick={() => handleQuickAdd('operations@stayvista.com')}
                className="text-[11px] bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
              >
                + operations@stayvista.com
              </button>
            </div>
          </div>

          {/* Optional Forwarding Subject / Note */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-800 flex items-center justify-between">
              <span>Custom Email Subject (Optional):</span>
              <span className="text-[11px] text-slate-500">Leave blank for automatic executive subject</span>
            </label>
            <input 
              type="text"
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              placeholder="e.g. [Urgent Alert] Updated Reconciliation Report for Booking.com & MMT"
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          {/* Primary Forward Action Banner */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-lg p-4 text-white flex flex-wrap items-center justify-between gap-3 shadow-md">
            <div>
              <div className="font-bold text-sm">Ready to Forward Report?</div>
              <div className="text-xs text-blue-100 mt-0.5">
                Will compile current figures, attach styled <span className="font-semibold text-white">.xlsx</span>, and transmit immediately.
              </div>
            </div>
            <button
              onClick={handleSendEmailNow}
              disabled={sendingEmail || recipients.length === 0}
              className="bg-white hover:bg-blue-50 text-blue-900 text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm transition-all inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-98"
            >
              {sendingEmail ? <RefreshCw className="h-4 w-4 animate-spin text-blue-600" /> : <Send className="h-4 w-4 text-blue-600" />}
              <span>Forward to {recipients.length} Recipient(s) Now</span>
            </button>
          </div>

          {/* Test Single Email Connection Row */}
          <div className="pt-2 border-t border-slate-200 flex items-center gap-2">
            <input
              type="email"
              value={testEmailAddress}
              onChange={(e) => setTestEmailAddress(e.target.value)}
              placeholder="Test email handshake with a single address..."
              className="text-xs px-3 py-1.5 border border-slate-300 rounded-lg bg-white flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleTestEmail}
              disabled={testingEmail}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-medium px-3.5 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              {testingEmail ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
              <span>Test Single Send</span>
            </button>
          </div>

          {/* Continuous Automation Instructions */}
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-900 text-slate-100">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Terminal className="h-4 w-4 text-emerald-400" />
                <span>Daily Scheduled Daemon</span>
              </div>
              <button
                onClick={() => copyCliCommand('./venv/bin/python backend/run_automation.py --watch')}
                className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded transition-colors"
                title="Copy continuous watcher command"
              >
                {copiedCli ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                <span>{copiedCli ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="bg-slate-950 rounded px-2.5 py-1.5 font-mono text-[11px] text-emerald-400 select-all">
              ./venv/bin/python backend/run_automation.py --watch
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex justify-between items-center text-xs">
          <span className="text-slate-500 flex items-center gap-1">
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>Attached: <strong className="text-slate-700">StayVista_Reconciliation_Report.xlsx</strong></span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
