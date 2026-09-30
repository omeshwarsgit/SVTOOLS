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
  FileCheck,
  Users,
  ChevronDown,
  ChevronUp,
  MessageSquare
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

  const DEFAULT_PRIMARY = [
    'omeshwar.shukla@stayvista.co.in',
    'bcomreservations@stayvista.com'
  ];

  const DEFAULT_CC = [
    'megha.prasad@stayvista.com',
    'kushal.pandey@stayvista.com',
    'krutika.naik@stayvista.com',
    'shubhangi.sharma@stayvista.co.in'
  ];

  // Primary "To" and Secondary "Cc"
  const [recipients, setRecipients] = useState(DEFAULT_PRIMARY);
  const [ccRecipients, setCcRecipients] = useState(DEFAULT_CC);
  const [showCcSection, setShowCcSection] = useState(true);

  const [newRecipientInput, setNewRecipientInput] = useState('');
  const [newCcInput, setNewCcInput] = useState('');
  const [customSubject, setCustomSubject] = useState('');

  // Slack state
  const [sendingSlack, setSendingSlack] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);
  const [customSlackWebhook, setCustomSlackWebhook] = useState('');
  const [showSlackConfig, setShowSlackConfig] = useState(false);

  // Test single email
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [copiedCli, setCopiedCli] = useState(false);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const res = await fetchAutomationStatus();
      setStatusData(res);
      // Pre-load the earlier provided recipients into the primary "To" list
      if (res.recipients && res.recipients.length > 0) {
        setRecipients((prev) => (prev.length === 0 ? res.recipients : prev));
      }
      // Pre-load CC recipients if returned by backend
      if (res.cc_recipients && res.cc_recipients.length > 0) {
        setCcRecipients((prev) => (prev.length === 0 ? res.cc_recipients : prev));
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

  // Primary "To" management
  const handleAddRecipient = (e) => {
    if (e) e.preventDefault();
    const clean = newRecipientInput.trim().toLowerCase();
    if (!clean) return;
    if (!clean.includes('@') || !clean.includes('.')) {
      showToast('Please enter a valid email address.');
      return;
    }
    if (recipients.map((r) => r.toLowerCase()).includes(clean)) {
      showToast(`'${clean}' is already in the recipient list.`);
      return;
    }
    setRecipients([...recipients, clean]);
    setNewRecipientInput('');
    showToast(`Added '${clean}' to primary recipients!`);
  };

  const handleRemoveRecipient = (emailToRemove) => {
    setRecipients(recipients.filter((r) => r !== emailToRemove));
  };

  // CC management
  const handleAddCc = (e) => {
    if (e) e.preventDefault();
    const clean = newCcInput.trim().toLowerCase();
    if (!clean) return;
    if (!clean.includes('@') || !clean.includes('.')) {
      showToast('Please enter a valid email address.');
      return;
    }
    if (ccRecipients.map((r) => r.toLowerCase()).includes(clean)) {
      showToast(`'${clean}' is already in CC.`);
      return;
    }
    if (recipients.map((r) => r.toLowerCase()).includes(clean)) {
      showToast(`'${clean}' is already in the primary (To) list.`);
      return;
    }
    setCcRecipients([...ccRecipients, clean]);
    setNewCcInput('');
    showToast(`Added '${clean}' to CC!`);
  };

  const handleRemoveCc = (emailToRemove) => {
    setCcRecipients(ccRecipients.filter((r) => r !== emailToRemove));
  };

  const handleQuickAdd = (email, isCc = false) => {
    const clean = email.toLowerCase();
    if (isCc) {
      if (ccRecipients.map((r) => r.toLowerCase()).includes(clean)) return;
      setCcRecipients([...ccRecipients, clean]);
      setShowCcSection(true);
      showToast(`Added '${email}' to CC!`);
    } else {
      if (recipients.map((r) => r.toLowerCase()).includes(clean)) return;
      setRecipients([...recipients, clean]);
      showToast(`Added '${email}' to recipients!`);
    }
  };

  const handleSendEmailNow = async () => {
    if (recipients.length === 0 && ccRecipients.length === 0) {
      showToast('Please specify at least one recipient email address.');
      return;
    }

    try {
      setSendingEmail(true);
      const res = await triggerAutomationSendEmail({ 
        recipients,
        cc_recipients: ccRecipients,
        subject: customSubject.trim() || undefined
      });
      if (res.status === 'success') {
        const ccPart = res.cc_recipients?.length > 0 ? ` (+${res.cc_recipients.length} CC)` : '';
        showToast(`Report emailed successfully to ${res.recipients?.length || recipients.length} recipient(s)${ccPart}!`);
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

  const handleSendSlackNow = async () => {
    try {
      setSendingSlack(true);
      const payload = customSlackWebhook.trim() ? { webhook_url: customSlackWebhook.trim() } : {};
      const res = await triggerSlackSend(payload);
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

  const copyCliCommand = (cmd) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2500);
  };

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
                <span>Dispatch Reconciliation Report</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                  SMTP Live
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Send styled 9-sheet Excel workbook & HTML alert to team and CC inboxes
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
          
          {/* Active Batch Summary Banner */}
          {p && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <FileCheck className="h-5 w-5 text-blue-600 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    {currentBatchData.batch_id ? `Batch #${currentBatchData.batch_id.slice(0, 8)}` : 'Active Reconciliation'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Includes styled Excel attachment & KPI breakdown
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

          {/* Sender Account Card */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 flex items-start justify-between gap-3 text-xs text-blue-900">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">Company Sender Account: </span>
                <code className="font-mono text-blue-800 font-semibold">{statusData?.sender_account || 'bcomreservations@stayvista.com'}</code>
                <div className="text-[11px] text-blue-700 mt-0.5">
                  Authenticated via Google Workspace SMTP (Port 587 TLS)
                </div>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              Connected
            </span>
          </div>

          {/* Primary Recipients (TO) */}
          <div className="border border-slate-200 rounded-lg p-4 bg-white space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase tracking-wide">
                <AtSign className="h-3.5 w-3.5 text-blue-600" />
                <span>Primary Inboxes (To: {recipients.length})</span>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded font-normal normal-case">
                  Provided Earlier
                </span>
              </label>
              
              {/* Add CC Toggle Button */}
              {showCcSection ? (
                <button
                  type="button"
                  onClick={() => setShowCcSection(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 font-normal cursor-pointer"
                >
                  Hide CC
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCcSection(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  <span>Add CC</span>
                </button>
              )}
            </div>

            {/* Recipient Chips */}
            <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 bg-slate-50 rounded-lg border border-slate-200">
              {recipients.length === 0 ? (
                <span className="text-xs text-slate-400 italic py-1 px-1">
                  No primary recipients. Add email below.
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

            {/* Add Primary Recipient Input */}
            <form onSubmit={handleAddRecipient} className="flex gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <UserPlus className="h-3.5 w-3.5" />
                </div>
                <input
                  type="email"
                  value={newRecipientInput}
                  onChange={(e) => setNewRecipientInput(e.target.value)}
                  placeholder="Type any additional primary recipient email..."
                  className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <button
                type="submit"
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add To</span>
              </button>
            </form>
          </div>

          {/* Dedicated CC Section */}
          {showCcSection && (
            <div className="border border-indigo-200 rounded-lg p-4 bg-indigo-50/30 space-y-3 animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-indigo-900 flex items-center gap-1.5 uppercase tracking-wide">
                  <Users className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Carbon Copy (Cc: {ccRecipients.length})</span>
                </label>
                <span className="text-[11px] text-indigo-600">
                  CC inboxes also receive the full report & Excel attachment
                </span>
              </div>

              {/* CC Chips */}
              <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 bg-white rounded-lg border border-indigo-200">
                {ccRecipients.length === 0 ? (
                  <span className="text-xs text-indigo-400 italic py-1 px-1">
                    No CC recipients added yet. Type an email below.
                  </span>
                ) : (
                  ccRecipients.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1.5 bg-indigo-100 text-indigo-900 border border-indigo-300 text-xs px-2.5 py-1 rounded-full font-medium"
                    >
                      <span>{email}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCc(email)}
                        className="text-indigo-500 hover:text-rose-600 p-0.5 rounded-full hover:bg-white transition-colors cursor-pointer"
                        title={`Remove ${email} from CC`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Add CC Input Bar */}
              <form onSubmit={handleAddCc} className="flex gap-2">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-indigo-400">
                    <UserPlus className="h-3.5 w-3.5" />
                  </div>
                  <input
                    type="email"
                    value={newCcInput}
                    onChange={(e) => setNewCcInput(e.target.value)}
                    placeholder="Enter email to add in CC (e.g. manager@stayvista.com)..."
                    className="w-full text-xs pl-9 pr-3 py-2 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add CC</span>
                </button>
              </form>

              {/* Quick suggestions for CC */}
              <div className="flex items-center gap-2 flex-wrap pt-0.5">
                <span className="text-[11px] text-indigo-700 font-medium">Quick CC:</span>
                <button
                  type="button"
                  onClick={() => handleQuickAdd('operations@stayvista.com', true)}
                  className="text-[11px] bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                >
                  + CC operations@stayvista.com
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAdd('management@stayvista.com', true)}
                  className="text-[11px] bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                >
                  + CC management@stayvista.com
                </button>
              </div>
            </div>
          )}

          {/* Optional Forwarding Subject */}
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
              <div className="font-bold text-sm">Send Email Report & Excel File</div>
              <div className="text-xs text-blue-100 mt-0.5">
                Delivers to <strong className="text-white">{recipients.length} To</strong>
                {ccRecipients.length > 0 && <span> + <strong className="text-white">{ccRecipients.length} CC</strong></span>} with attached <span className="font-semibold text-white">.xlsx</span>.
              </div>
            </div>
            <button
              onClick={handleSendEmailNow}
              disabled={sendingEmail || (recipients.length === 0 && ccRecipients.length === 0)}
              className="bg-white hover:bg-blue-50 text-blue-900 text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm transition-all inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-98"
            >
              {sendingEmail ? <RefreshCw className="h-4 w-4 animate-spin text-blue-600" /> : <Send className="h-4 w-4 text-blue-600" />}
              <span>Send to {recipients.length + ccRecipients.length} Inboxes Now</span>
            </button>
          </div>

          {/* Slack Alert Card with Option to test or paste webhook */}
          <div className="bg-purple-50/80 border border-purple-200 rounded-lg p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-950 flex items-center gap-1.5 uppercase tracking-wide">
                <MessageSquare className="h-3.5 w-3.5 text-purple-600" />
                <span>Slack Alert Broadcast</span>
              </span>
              <button
                type="button"
                onClick={() => setShowSlackConfig(!showSlackConfig)}
                className="text-[11px] text-purple-700 hover:text-purple-900 font-medium cursor-pointer"
              >
                {showSlackConfig ? 'Hide Webhook' : 'Custom Webhook URL'}
              </button>
            </div>

            {showSlackConfig && (
              <div className="space-y-1 pt-1">
                <input
                  type="url"
                  value={customSlackWebhook}
                  onChange={(e) => setCustomSlackWebhook(e.target.value)}
                  placeholder="https://hooks.slack.com/services/T.../B.../..."
                  className="w-full text-xs px-2.5 py-1.5 border border-purple-300 rounded-md bg-white font-mono"
                />
                <p className="text-[10px] text-purple-600">
                  Optional: Paste a webhook URL if not set in your server .env
                </p>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSendSlackNow}
                disabled={sendingSlack}
                className="bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer active:scale-98"
              >
                {sendingSlack ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span>Post Discrepancies to Slack Now</span>
              </button>

              <button
                type="button"
                onClick={handleTestSlack}
                disabled={testingSlack}
                className="bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-300 text-xs font-medium px-3 py-2 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {testingSlack ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                <span>Test Slack Webhook</span>
              </button>
            </div>
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
