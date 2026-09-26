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
  FileSpreadsheet
} from 'lucide-react';
import { 
  fetchAutomationStatus, 
  triggerAutomationSendEmail, 
  triggerAutomationTestEmail,
  triggerAutomatedReconciliation 
} from '../services/api';

export default function EmailAutomationModal({ isOpen, onClose, onRefreshData, showToast }) {
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [triggeringIngest, setTriggeringIngest] = useState(false);
  const [customRecipients, setCustomRecipients] = useState('');
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [sendingSlack, setSendingSlack] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);

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

  const loadStatus = async () => {
    try {
      setLoading(true);
      const res = await fetchAutomationStatus();
      setStatusData(res);
      if (res.recipients && res.recipients.length > 0 && !customRecipients) {
        setCustomRecipients(res.recipients.join(', '));
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

  const handleSendEmailNow = async () => {
    try {
      setSendingEmail(true);
      const recipientList = customRecipients
        ? customRecipients.split(',').map((e) => e.trim()).filter(Boolean)
        : null;

      const res = await triggerAutomationSendEmail({ recipients: recipientList });
      if (res.status === 'success') {
        showToast(`Report emailed successfully to ${res.recipients?.length || 0} recipient(s)!`);
      } else if (res.status === 'dry_run_saved') {
        showToast(`Report generated & saved to archives (${res.message})`);
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
    const target = testEmailAddress.trim() || (statusData?.recipients?.[0] || '');
    if (!target) {
      showToast('Please enter an email address to test.');
      return;
    }

    try {
      setTestingEmail(true);
      const res = await triggerAutomationTestEmail(target);
      showToast(res.message || 'Test email sent successfully!');
    } catch (err) {
      showToast(`Test failed: ${err.message}`);
    } finally {
      setTestingEmail(false);
    }
  };

  const handleTriggerReconcile = async () => {
    try {
      setTriggeringIngest(true);
      showToast('Running automated reconciliation on sheets...');
      const res = await triggerAutomatedReconciliation();
      showToast(`Automated reconciliation finished! Matched: ${res.primary_metrics?.matched || 0}`);
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

  const isConfigured = statusData?.smtp_configured;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-md">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-white">Automated Reconciliation & Free Office Email Dispatch</h3>
              <p className="text-xs text-slate-400">Reconcile sheets and automatically email reports to all team members</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Privacy & Enterprise Notice */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-md p-3 flex items-start gap-2.5 text-xs text-blue-900">
            <ShieldCheck className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">Office Service Protocol:</span> This tool uses standard free SMTP configured with your corporate or office notification account. Your personal email is never used. All team members receive the same executive report and multi-sheet Excel file.
            </div>
          </div>

          {/* Status Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* SMTP Status */}
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span className="font-medium">Office SMTP Service</span>
                <span className={`inline-flex items-center gap-1 font-semibold ${isConfigured ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {isConfigured ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      Active ({statusData?.smtp_host})
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                      Dry-Run / Local Archive Mode
                    </>
                  )}
                </span>
              </div>
              <div className="text-xs text-slate-700 font-mono mt-1">
                Sender: <span className="font-semibold">{statusData?.sender_account || 'Not set in .env'}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {isConfigured 
                  ? 'Transmits live emails via free office SMTP' 
                  : 'Saves full HTML emails & Excel reports to archives/emails/'}
              </div>
            </div>

            {/* Folder Watcher Status */}
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span className="font-medium">Watch Folder</span>
                <span className="font-semibold text-blue-700">
                  {statusData?.incoming_count || 0} sheet(s) ready
                </span>
              </div>
              <div className="text-xs text-slate-700 font-mono truncate mt-1" title={statusData?.watch_folder}>
                📁 {statusData?.watch_folder ? statusData.watch_folder.split('/').slice(-2).join('/') : 'data/incoming'}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Drop new SU/PMS sheets here for instant automated processing
              </div>
            </div>

            {/* Slack Channel Status Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span className="font-medium">Slack Integration</span>
                <span className={`inline-flex items-center gap-1 font-semibold ${statusData?.slack_configured ? 'text-emerald-700' : 'text-slate-600'}`}>
                  {statusData?.slack_configured ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      Active Webhook
                    </>
                  ) : (
                    'Not Configured in .env'
                  )}
                </span>
              </div>
              <div className="text-xs text-slate-700 font-mono mt-1">
                Target: <span className="font-semibold">{statusData?.slack_channel || '#reconciliation-alerts'}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Posts live cards with KPI summary, cancellation alerts, and @RM tagging
              </div>
            </div>
          </div>

          {/* Slack Quick Actions */}
          <div className="bg-purple-50/60 border border-purple-200 rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-900 flex items-center gap-1.5">
                💬 Slack Channel Dispatch:
              </span>
              <span className="text-[11px] text-purple-700">Channel: {statusData?.slack_channel || '#reconciliation-alerts'}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleSendSlackNow}
                disabled={sendingSlack}
                className="bg-purple-700 hover:bg-purple-800 text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {sendingSlack ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span>Post Discrepancies to Slack Now</span>
              </button>

              <button
                onClick={handleTestSlack}
                disabled={testingSlack}
                className="bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-300 text-xs font-medium px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {testingSlack ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                <span>Test Slack Webhook</span>
              </button>
            </div>
            <p className="text-[11px] text-purple-800 leading-relaxed pt-1 border-t border-purple-200/60">
              💡 <strong>Direct Slack Channel Email Tip:</strong> You can create a dedicated Slack channel with everyone in it, copy its unique email address (<em>Channel Details → Integrations → Send emails to this channel</em>), and add it to the <strong>Recipients</strong> field above. Slack will automatically receive the full HTML alert and the attached Excel file for the whole team!
            </p>
          </div>

          {/* Recipient Management */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-800 flex items-center justify-between">
              <span>Recipients (Everyone receives the same complete report & Excel file):</span>
              <span className="text-[11px] text-slate-500 font-normal">Comma-separated emails</span>
            </label>
            <input 
              type="text"
              value={customRecipients}
              onChange={(e) => setCustomRecipients(e.target.value)}
              placeholder="e.g. operations@stayvista.com, management@stayvista.com, team@stayvista.com"
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <p className="text-[11px] text-slate-500">
              Configured default in <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">.env</code>: {statusData?.recipients?.length > 0 ? statusData.recipients.join(', ') : 'None'}
            </p>
          </div>

          {/* Quick Actions Bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-3">
            <div className="text-xs font-semibold text-slate-800">Trigger Actions:</div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleSendEmailNow}
                disabled={sendingEmail}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3.5 py-2 rounded-md transition-colors inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {sendingEmail ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span>Email Reconciliation Report Now</span>
              </button>

              <button
                onClick={handleTriggerReconcile}
                disabled={triggeringIngest}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3.5 py-2 rounded-md transition-colors inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {triggeringIngest ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FolderSync className="h-3.5 w-3.5" />}
                <span>Process Watch Folder & Email</span>
              </button>
            </div>

            {/* Test Connection Row */}
            <div className="pt-2 border-t border-slate-200 flex items-center gap-2">
              <input
                type="email"
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                placeholder="Enter email to test connection..."
                className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleTestEmail}
                disabled={testingEmail}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-medium px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {testingEmail ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                <span>Test Connection</span>
              </button>
            </div>
          </div>

          {/* Headless CLI & Background Watcher Instructions */}
          <div className="border border-slate-200 rounded-md p-3.5 bg-slate-950 text-slate-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Terminal className="h-4 w-4 text-emerald-400" />
                <span>Headless Background Watcher (Automate 100% Free)</span>
              </div>
              <button
                onClick={() => copyCliCommand('python backend/run_automation.py --watch')}
                className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded transition-colors"
                title="Copy continuous watcher command"
              >
                {copiedCli ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedCli ? 'Copied' : 'Copy Command'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
              Run this in your terminal. It continuously watches your folder, automatically runs full reconciliation whenever new sheets are dropped, and emails everyone instantly:
            </p>
            <div className="bg-slate-900 border border-slate-800 rounded px-3 py-2 font-mono text-xs text-emerald-300 select-all">
              python backend/run_automation.py --watch
            </div>
            <div className="mt-2 text-[11px] text-slate-400">
              Or to process once on demand: <code className="text-sky-300 font-mono">python backend/run_automation.py --once</code>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex justify-between items-center text-xs">
          <span className="text-slate-500">
            Output includes styled multi-tab <span className="font-semibold text-slate-700">.xlsx</span> attachments
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
