import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import {
  SmsMessage,
  SmsTemplate,
  NotificationEvent,
  SmsStatus,
  SmsTemplateCategory,
  Branch,
  SaccoMember,
  SmsProviderDiagnostics
} from '../types';
import {
  MessageSquare,
  Send,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Search,
  Plus,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Building,
  Key,
  Calendar,
  Layers,
  ChevronRight,
  Eye,
  Sliders,
  X,
  Smartphone,
  Activity,
  Wifi,
  WifiOff,
  Check,
  Play,
  Pause,
  FlaskConical,
  Server,
  Radio
} from 'lucide-react';

export const SmsNotificationsView: React.FC = () => {
  const { user, workingBranch, hasPermission } = useAuth();

  // Navigation sub-tabs
  const [activeTab, setActiveTab] = useState<'queue' | 'templates' | 'events' | 'compose'>('queue');

  // Permissions
  const canSendSms = hasPermission('sms.send');
  const canManageTemplates = hasPermission('sms.manage_templates');
  const canRetryFailed = hasPermission('sms.retry_failed');
  const canViewQueue = hasPermission('sms.view_queue');
  const canViewHistory = hasPermission('sms.view_history');
  const canConfigureEvents = hasPermission('sms.configure_events');

  // Queue State
  const [queue, setQueue] = useState<SmsMessage[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [branches, setBranches] = useState<Branch[]>([]);

  // Templates State
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState<boolean>(false);
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplate | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState<boolean>(false);

  // Notification Events State
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(false);

  // Modal / Detail States
  const [selectedMessage, setSelectedMessage] = useState<SmsMessage | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Provider Diagnostics & Test State
  const [diagnostics, setDiagnostics] = useState<SmsProviderDiagnostics | null>(null);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState<boolean>(false);
  const [isConnectionTesting, setIsConnectionTesting] = useState<boolean>(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{
    connected: boolean;
    balanceUGX?: string | null;
    message: string;
    checkedAt: string;
  } | null>(null);
  const [isTestSendModalOpen, setIsTestSendModalOpen] = useState<boolean>(false);
  const [testSendPhone, setTestSendPhone] = useState<string>('+256701234567');
  const [isTestSending, setIsTestSending] = useState<boolean>(false);

  // Active Provider State
  const [activeProvider, setActiveProvider] = useState<'PANDORA' | 'AFRICAS_TALKING'>('PANDORA');
  const [isSwitchingProvider, setIsSwitchingProvider] = useState<boolean>(false);

  // Manual Compose State
  const [membersList, setMembersList] = useState<SaccoMember[]>([]);
  const [composeMemberAccount, setComposeMemberAccount] = useState<string>('');
  const [composeRecipientName, setComposeRecipientName] = useState<string>('');
  const [composeRecipientPhone, setComposeRecipientPhone] = useState<string>('');
  const [composeTemplateId, setComposeTemplateId] = useState<string>('');
  const [composeMessageText, setComposeMessageText] = useState<string>('');
  const [composeDispatchImmediately, setComposeDispatchImmediately] = useState<boolean>(true);
  const [isSubmittingSms, setIsSubmittingSms] = useState<boolean>(false);

  const fetchActiveProvider = async () => {
    try {
      const res = await apiClient.getSmsProvider();
      if (res.success && res.provider) {
        setActiveProvider(res.provider);
      }
    } catch {
      // ignore
    }
  };

  const handleSwitchProvider = async (targetProvider: 'PANDORA' | 'AFRICAS_TALKING') => {
    setIsSwitchingProvider(true);
    setStatusFeedback(null);
    try {
      const res = await apiClient.setSmsProvider(targetProvider);
      if (res.success) {
        setActiveProvider(targetProvider);
        setStatusFeedback({ type: 'success', message: res.message });
        fetchDiagnostics();
        fetchQueue();
      }
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Failed to switch SMS provider.' });
    } finally {
      setIsSwitchingProvider(false);
    }
  };

  // Initial load
  useEffect(() => {
    apiClient.getBranches().then(res => {
      if (res.success) setBranches(res.data);
    });
    if (user?.hasMultiBranchAccess) {
      setBranchFilter('ALL');
    } else if (workingBranch) {
      setBranchFilter(workingBranch.id);
    }
    fetchActiveProvider();
    fetchDiagnostics();
  }, [user, workingBranch]);

  // Load Diagnostics
  const fetchDiagnostics = async () => {
    setIsLoadingDiagnostics(true);
    try {
      const res = await apiClient.getSmsDiagnostics();
      if (res.success) {
        setDiagnostics(res.data);
      }
    } catch (err: any) {
      if (!err?.message?.includes('Session expired') && !err?.message?.includes('401')) {
        console.warn('Failed to load SMS provider diagnostics:', err);
      }
    } finally {
      setIsLoadingDiagnostics(false);
    }
  };

  // Safe Connection Test (No SMS Sent)
  const handleTestConnection = async () => {
    setIsConnectionTesting(true);
    setConnectionTestResult(null);
    try {
      const res = await apiClient.testSmsConnection();
      setConnectionTestResult({
        connected: res.success,
        balanceUGX: res.data?.balanceUGX,
        message: res.message || (res.success ? 'Successfully verified credentials with provider' : 'Connection verification failed'),
        checkedAt: new Date().toLocaleTimeString(),
      });
      fetchDiagnostics();
    } catch (err: any) {
      setConnectionTestResult({
        connected: false,
        message: err.message || 'Connection test failed',
        checkedAt: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsConnectionTesting(false);
    }
  };

  // Explicit Admin Test Message
  const handleAdminTestSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testSendPhone) return;
    setIsTestSending(true);
    try {
      const res = await apiClient.testSmsSend({
        recipientPhone: testSendPhone,
        confirmSandboxTest: true,
      });
      if (res.success) {
        setStatusFeedback({
          type: 'success',
          message: res.message || 'Test SMS dispatched successfully via Africa\'s Talking.',
        });
        setIsTestSendModalOpen(false);
        fetchQueue();
        fetchDiagnostics();
      } else {
        setStatusFeedback({
          type: 'error',
          message: res.error || 'Test SMS dispatch rejected.',
        });
      }
    } catch (err: any) {
      setStatusFeedback({
        type: 'error',
        message: err.message || 'Test SMS dispatch failed.',
      });
    } finally {
      setIsTestSending(false);
    }
  };

  // Worker Start/Stop Toggle
  const handleToggleWorker = async () => {
    if (!diagnostics) return;
    setActionLoadingId('worker-toggle');
    try {
      if (diagnostics.workerStatus === 'RUNNING') {
        const res = await apiClient.stopSmsWorker();
        setStatusFeedback({ type: 'success', message: res.message });
      } else {
        const res = await apiClient.startSmsWorker();
        setStatusFeedback({ type: 'success', message: res.message });
      }
      fetchDiagnostics();
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Failed to toggle SMS Queue Worker' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Load Queue
  const fetchQueue = async () => {
    if (!canViewQueue && !canViewHistory) return;
    setIsLoadingQueue(true);
    try {
      const res = await apiClient.getSmsQueue({
        branchId: branchFilter === 'ALL' ? undefined : branchFilter,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        searchQuery: searchQuery || undefined,
      });
      if (res.success) {
        setQueue(res.data);
      }
    } catch (err: any) {
      if (!err?.message?.includes('Session expired') && !err?.message?.includes('401')) {
        console.error('Failed to load SMS queue:', err);
      }
    } finally {
      setIsLoadingQueue(false);
    }
  };

  // Load Templates
  const fetchTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      const res = await apiClient.getSmsTemplates();
      if (res.success) {
        setTemplates(res.data);
      }
    } catch (err: any) {
      if (!err?.message?.includes('Session expired') && !err?.message?.includes('401')) {
        console.error('Failed to load SMS templates:', err);
      }
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  // Load Events
  const fetchEvents = async () => {
    setIsLoadingEvents(true);
    try {
      const res = await apiClient.getNotificationEvents(
        branchFilter === 'ALL' ? undefined : branchFilter
      );
      if (res.success) {
        setEvents(res.data);
      }
    } catch (err: any) {
      if (!err?.message?.includes('Session expired') && !err?.message?.includes('401')) {
        console.error('Failed to load notification events:', err);
      }
    } finally {
      setIsLoadingEvents(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'queue') {
      fetchQueue();
      fetchDiagnostics();
    }
    if (activeTab === 'templates') fetchTemplates();
    if (activeTab === 'events') fetchEvents();
  }, [activeTab, branchFilter, statusFilter]);

  // Load members for composer
  useEffect(() => {
    if (activeTab === 'compose') {
      fetchTemplates();
      apiClient.getMembers('', branchFilter === 'ALL' ? undefined : branchFilter).then(res => {
        if (res.success) setMembersList(res.data);
      });
    }
  }, [activeTab, branchFilter]);

  // Search queue debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      if (activeTab === 'queue') fetchQueue();
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Handle Retry
  const handleRetry = async (msgId: string) => {
    setActionLoadingId(msgId);
    setStatusFeedback(null);
    try {
      const res = await apiClient.retrySms(msgId);
      if (res.success) {
        setStatusFeedback({ type: 'success', message: res.message || 'SMS re-dispatched successfully.' });
        fetchQueue();
      } else {
        setStatusFeedback({ type: 'error', message: res.error || 'Retry attempt failed.' });
      }
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Error executing retry.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Batch Process Queue
  const handleProcessQueue = async () => {
    setActionLoadingId('batch-process');
    setStatusFeedback(null);
    try {
      const res = await apiClient.processSmsQueue();
      if (res.success) {
        setStatusFeedback({
          type: 'success',
          message: `Processed queue: ${res.data.sent} sent, ${res.data.failed} failed out of ${res.data.processed} pending messages.`,
        });
        fetchQueue();
      }
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Error processing queue.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Evaluate Expiries
  const handleEvaluateExpiries = async () => {
    setActionLoadingId('eval-expiries');
    setStatusFeedback(null);
    try {
      const res = await apiClient.evaluateExpiries();
      if (res.success) {
        setStatusFeedback({
          type: 'success',
          message: `Policy scan complete: ${res.data.eventsCreated} notification events evaluated, ${res.data.messagesQueued} SMS queued with duplicate protection.`,
        });
        if (activeTab === 'queue') fetchQueue();
        if (activeTab === 'events') fetchEvents();
      }
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Error evaluating expiries.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Composer Member Select
  const handleSelectMember = (accountNumber: string) => {
    setComposeMemberAccount(accountNumber);
    const m = membersList.find(mem => mem.saccoAccountNumber === accountNumber);
    if (m) {
      setComposeRecipientName(m.fullName);
      setComposeRecipientPhone(m.primaryPhone);
    }
  };

  // Handle Composer Template Select
  const handleSelectTemplate = (templateId: string) => {
    setComposeTemplateId(templateId);
    const tmpl = templates.find(t => t.id === templateId);
    if (tmpl) {
      let text = tmpl.templateText;
      text = text.replace(/\[Member Name\]/g, composeRecipientName || '[Member Name]');
      text = text.replace(/\[Branch\]/g, workingBranch?.name || '[Branch]');
      text = text.replace(/\[Account Number\]/g, composeMemberAccount || '[Account Number]');
      setComposeMessageText(text);
    }
  };

  // Submit Manual SMS
  const handleSendManualSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeRecipientPhone || !composeRecipientName || !composeMessageText) {
      setStatusFeedback({ type: 'error', message: 'Please fill in recipient name, phone, and message text.' });
      return;
    }

    setIsSubmittingSms(true);
    setStatusFeedback(null);
    try {
      const res = await apiClient.sendSms({
        recipientPhone: composeRecipientPhone,
        recipientName: composeRecipientName,
        messageText: composeMessageText,
        saccoAccountNumber: composeMemberAccount || undefined,
        dispatchImmediately: composeDispatchImmediately,
      });

      if (res.success) {
        setStatusFeedback({
          type: 'success',
          message: res.message || 'SMS submitted successfully via Africa\'s Talking.',
        });
        // reset form
        setComposeMemberAccount('');
        setComposeRecipientName('');
        setComposeRecipientPhone('');
        setComposeTemplateId('');
        setComposeMessageText('');
        setActiveTab('queue');
      } else {
        setStatusFeedback({ type: 'error', message: res.error || 'Failed to submit SMS.' });
      }
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Failed to transmit message.' });
    } finally {
      setIsSubmittingSms(false);
    }
  };

  // Template Save / Edit
  const handleSaveTemplate = async (templateData: Partial<SmsTemplate>) => {
    try {
      if (editingTemplate) {
        const res = await apiClient.updateSmsTemplate(editingTemplate.id, templateData);
        if (res.success) {
          setStatusFeedback({ type: 'success', message: 'SMS template updated successfully.' });
          setIsTemplateModalOpen(false);
          setEditingTemplate(null);
          fetchTemplates();
        }
      } else {
        const res = await apiClient.createSmsTemplate({
          code: templateData.code!,
          name: templateData.name!,
          category: templateData.category!,
          templateText: templateData.templateText!,
          availableVariables: templateData.availableVariables,
        });
        if (res.success) {
          setStatusFeedback({ type: 'success', message: 'SMS template created successfully.' });
          setIsTemplateModalOpen(false);
          fetchTemplates();
        }
      }
    } catch (err: any) {
      setStatusFeedback({ type: 'error', message: err.message || 'Error saving template.' });
    }
  };

  // Render Status Badge distinguishing submission from delivery
  const renderStatusBadge = (msg: SmsMessage) => {
    switch (msg.status) {
      case 'SENT':
        if (msg.deliveryConfirmed) {
          return (
            <div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                DELIVERED
              </span>
              <span className="text-[9px] text-emerald-700 block mt-0.5 font-medium">Handset Confirmed</span>
            </div>
          );
        }
        if (diagnostics?.environment === 'SANDBOX' || msg.deliveryStatus === 'SimulatedSandbox') {
          return (
            <div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 flex items-center gap-1">
                <Radio className="w-3 h-3 text-indigo-600" />
                SIMULATED
              </span>
              <span className="text-[9px] text-indigo-700 block mt-0.5 font-medium">Sandbox Simulator</span>
            </div>
          );
        }
        return (
          <div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
              <Send className="w-3 h-3 text-blue-600" />
              SUBMITTED
            </span>
            <span className="text-[9px] text-blue-700 block mt-0.5 font-medium">Awaiting Telco DLR</span>
          </div>
        );
      case 'PENDING':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-600" />
            QUEUED
          </span>
        );
      case 'SENDING':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
            <RefreshCw className="w-3 h-3 text-blue-600 animate-spin" />
            PROCESSING
          </span>
        );
      case 'FAILED':
        return (
          <div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-rose-600" />
              FAILED
            </span>
            {msg.failureReason && (
              <span className="text-[9px] text-rose-600 block mt-0.5 max-w-[120px] truncate" title={msg.failureReason}>
                {msg.failureReason}
              </span>
            )}
          </div>
        );
    }
  };

  // Metrics counts
  const totalCount = queue.length;
  const sentCount = queue.filter(q => q.status === 'SENT').length;
  const pendingCount = queue.filter(q => q.status === 'PENDING').length;
  const failedCount = queue.filter(q => q.status === 'FAILED').length;

  return (
    <div className="space-y-6">
      {/* Top Header & Gateway Telemetry */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-700" />
            SMS Notification Gateway & Africa&apos;s Talking Engine
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Official SMS Notification Service • Direct Internet API Integration • Offline-Safe Message Queue
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {canConfigureEvents && (
            <button
              onClick={handleEvaluateExpiries}
              disabled={actionLoadingId === 'eval-expiries'}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-800 hover:bg-blue-100 text-xs font-semibold border border-blue-200 transition"
              title="Scan all policies and queue 30d, 14d, 7d and expiry alerts"
            >
              <Sparkles className={`w-3.5 h-3.5 ${actionLoadingId === 'eval-expiries' ? 'animate-spin' : ''}`} />
              Scan &amp; Queue Expiries
            </button>
          )}

          {canSendSms && (
            <button
              onClick={handleProcessQueue}
              disabled={actionLoadingId === 'batch-process' || pendingCount === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
            >
              <Send className={`w-3.5 h-3.5 ${actionLoadingId === 'batch-process' ? 'animate-spin' : ''}`} />
              Dispatch Pending Queue ({pendingCount})
            </button>
          )}

          {canSendSms && (
            <button
              onClick={() => setActiveTab('compose')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold shadow-xs transition"
            >
              <Plus className="w-4 h-4" />
              Compose SMS
            </button>
          )}
        </div>
      </div>

      {/* SMS Gateway Provider Status & Diagnostics Panel */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
        {/* Main Provider Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-start sm:items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              diagnostics?.configurationStatus === 'CONFIGURED'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-900 text-sm">
                  Gateway: {diagnostics?.provider || (activeProvider === 'PANDORA' ? 'Pandora Networks' : "Africa's Talking")}
                </span>
                
                {/* Configuration Status Badge */}
                {diagnostics?.configurationStatus === 'CONFIGURED' ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    CONFIGURED
                  </span>
                ) : diagnostics?.configurationStatus === 'DISABLED' ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                    DISABLED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 text-amber-600" />
                    PENDING BACKEND CONFIG
                  </span>
                )}

                {/* Sender ID Badge */}
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 font-mono">
                  Sender: {diagnostics?.senderId || (activeProvider === 'PANDORA' ? 'NYAMUYANJA' : 'TURIHAMWE')}
                </span>

                {/* Environment Badge */}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  diagnostics?.environment === 'PRODUCTION'
                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                }`}>
                  {diagnostics?.environment || 'SANDBOX'} MODE
                </span>

                {/* Worker Status Badge */}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 ${
                  diagnostics?.workerStatus === 'RUNNING'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    diagnostics?.workerStatus === 'RUNNING' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                  }`} />
                  Worker: {diagnostics?.workerStatus || 'STOPPED'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-500">
                <span>Dual-Provider Architecture • Durable Deduplication • Africa/Kampala UTC+3</span>
                {hasPermission('admin.system_settings') && (
                  <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-semibold text-slate-600">Active Provider:</span>
                    <button
                      type="button"
                      disabled={isSwitchingProvider}
                      onClick={() => handleSwitchProvider('PANDORA')}
                      className={`text-[10px] px-2 py-0.5 rounded font-bold transition ${
                        activeProvider === 'PANDORA'
                          ? 'bg-blue-700 text-white shadow-xs'
                          : 'bg-white text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Pandora (Primary)
                    </button>
                    <button
                      type="button"
                      disabled={isSwitchingProvider}
                      onClick={() => handleSwitchProvider('AFRICAS_TALKING')}
                      className={`text-[10px] px-2 py-0.5 rounded font-bold transition ${
                        activeProvider === 'AFRICAS_TALKING'
                          ? 'bg-blue-700 text-white shadow-xs'
                          : 'bg-white text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Africa&apos;s Talking
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Diagnostics Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleTestConnection}
              disabled={isConnectionTesting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-300 transition disabled:opacity-50"
              title="Verify credentials with Africa's Talking balance API without sending any SMS"
            >
              <Wifi className={`w-3.5 h-3.5 ${isConnectionTesting ? 'animate-spin text-blue-600' : 'text-slate-600'}`} />
              <span>{isConnectionTesting ? 'Verifying...' : 'Test Connection (Safe)'}</span>
            </button>

            {canSendSms && (
              <button
                onClick={() => setIsTestSendModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-semibold border border-blue-200 transition"
                title="Send a clearly labelled administrative test SMS to verify end-to-end delivery"
              >
                <FlaskConical className="w-3.5 h-3.5 text-blue-600" />
                <span>Admin Test SMS</span>
              </button>
            )}

            {hasPermission('admin.system_settings') && (
              <button
                onClick={handleToggleWorker}
                disabled={actionLoadingId === 'worker-toggle'}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200 transition"
                title="Start or pause background queue worker"
              >
                {diagnostics?.workerStatus === 'RUNNING' ? (
                  <>
                    <Pause className="w-3 h-3 text-amber-600" />
                    <span>Pause Worker</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 text-emerald-600" />
                    <span>Start Worker</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={fetchDiagnostics}
              disabled={isLoadingDiagnostics}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              title="Refresh provider status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDiagnostics ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Warning Banner: When Provider Submission is NOT configured */}
        {diagnostics && diagnostics.configurationStatus !== 'CONFIGURED' && (
          <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs space-y-2">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-amber-950">
                  Africa&apos;s Talking submission is not configured on this deployment, so queued messages stay in the queue and are never marked as sent. Provider credentials are held only by the secure backend service, never by this interface.
                </div>
                <p className="text-amber-800 leading-relaxed text-[11px]">
                  <strong>Current Status:</strong> {diagnostics.configurationMessage}
                </p>
                <div className="pt-1 text-[11px] text-amber-800/90 flex flex-wrap gap-x-4 gap-y-1">
                  <span>• <strong>Development environment:</strong> Operates under Africa&apos;s Talking Sandbox.</span>
                  <span>• <strong>Production environment:</strong> Requires Africa&apos;s Talking Uganda SMS API credentials.</span>
                  <span>• <strong>Required backend variables:</strong> <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">AT_USERNAME</code>, <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">AT_API_KEY</code>, <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">AT_SENDER_ID</code>.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Connection Test Result Feedback */}
        {connectionTestResult && (
          <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
            connectionTestResult.connected
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}>
            <div className="flex items-center gap-2">
              {connectionTestResult.connected ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>
                <strong>Connection Test ({connectionTestResult.checkedAt}):</strong> {connectionTestResult.message}
              </span>
            </div>
            <button
              onClick={() => setConnectionTestResult(null)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Notice Banner: Sandbox Mode Explanation */}
        {diagnostics?.environment === 'SANDBOX' && diagnostics.configurationStatus === 'CONFIGURED' && (
          <div className="p-3.5 rounded-xl bg-blue-50/90 border border-blue-200 text-blue-900 text-xs flex items-start gap-3">
            <Radio className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-blue-950 flex items-center gap-2">
                <span>Africa&apos;s Talking Sandbox Mode Active — Web Simulator Delivery Only</span>
                <span className="px-1.5 py-0.5 rounded bg-blue-200 text-blue-800 text-[10px] font-semibold">No Cellular Handset Delivery</span>
              </div>
              <p className="text-blue-800 text-[11px] leading-relaxed">
                In Sandbox mode, SMS messages are accepted by Africa&apos;s Talking and routed to the <strong>Africa&apos;s Talking Web Simulator</strong> (or simulator app). <strong>They are never delivered to physical cellular phones or mobile towers.</strong>
              </p>
              <p className="text-blue-700 text-[10px]">
                To receive live SMS on physical Ugandan mobile phones (+256), the SACCO administrator must configure production credentials (<code className="font-mono bg-blue-100 px-1 py-0.5 rounded">SMS_ENVIRONMENT=PRODUCTION</code>).
              </p>
            </div>
          </div>
        )}

        {/* Real-time Status Counters & Configuration Metadata */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Queued</span>
            <span className="text-lg font-bold text-amber-700">
              {diagnostics?.counts.pending ?? pendingCount}
            </span>
            <span className="text-[10px] text-slate-500 block">Pending dispatch</span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Processing</span>
            <span className="text-lg font-bold text-blue-700">
              {diagnostics?.counts.sending ?? 0}
            </span>
            <span className="text-[10px] text-slate-500 block">In flight</span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Submitted</span>
            <span className="text-lg font-bold text-blue-700">
              {diagnostics?.counts.sent ?? sentCount}
            </span>
            <span className="text-[10px] text-slate-500 block">Provider accepted</span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Handset Delivered</span>
            <span className="text-lg font-bold text-emerald-700">
              {diagnostics?.counts.deliveredConfirmed ?? queue.filter(q => q.deliveryConfirmed).length}
            </span>
            <span className="text-[10px] text-slate-500 block">Telco DLR verified</span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Failed</span>
            <span className="text-lg font-bold text-rose-700">
              {diagnostics?.counts.failed ?? failedCount}
            </span>
            <span className="text-[10px] text-slate-500 block">Delivery failed</span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Sender ID</span>
            <span className="text-sm font-bold font-mono text-slate-800 truncate block mt-0.5">
              {diagnostics?.senderId || 'TURIHAMWE'}
            </span>
            <span className="text-[10px] text-slate-500 block">UCC Registered</span>
          </div>
        </div>

        {/* Telemetry and Audit Sub-row */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-y-2 text-[11px] text-slate-500">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              <strong>Last Successful Send:</strong>{' '}
              {diagnostics?.lastSuccessfulSubmissionTime
                ? new Date(diagnostics.lastSuccessfulSubmissionTime).toLocaleString()
                : 'None recorded'}
            </span>
            <span>•</span>
            <span>
              <strong>Last Gateway Error:</strong>{' '}
              {diagnostics?.lastErrorSanitized ? (
                <span className="text-rose-600 font-medium">
                  {diagnostics.lastErrorSanitized.slice(0, 80)}
                  {diagnostics.lastErrorSanitized.length > 80 ? '...' : ''}
                </span>
              ) : (
                <span className="text-emerald-600">None (Healthy)</span>
              )}
            </span>
            {diagnostics?.balanceEstimateUGX && (
              <>
                <span>•</span>
                <span>
                  <strong>Balance:</strong> <span className="font-semibold text-slate-800">{diagnostics.balanceEstimateUGX}</span>
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-slate-400 text-[10px]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Credentials secured on backend only • Zero client leakage</span>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {statusFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
            statusFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusFeedback.message}</span>
          </div>
          <button
            onClick={() => setStatusFeedback(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="border-b border-slate-200 flex gap-4 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('queue')}
          className={`pb-3 border-b-2 flex items-center gap-1.5 transition ${
            activeTab === 'queue'
              ? 'border-blue-700 text-blue-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Message Queue &amp; History ({totalCount})</span>
        </button>

        <button
          onClick={() => setActiveTab('templates')}
          className={`pb-3 border-b-2 flex items-center gap-1.5 transition ${
            activeTab === 'templates'
              ? 'border-blue-700 text-blue-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>SMS Templates ({templates.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('events')}
          className={`pb-3 border-b-2 flex items-center gap-1.5 transition ${
            activeTab === 'events'
              ? 'border-blue-700 text-blue-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Notification Events Log ({events.length})</span>
        </button>

        {canSendSms && (
          <button
            onClick={() => setActiveTab('compose')}
            className={`pb-3 border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'compose'
                ? 'border-blue-700 text-blue-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Compose Outbound Message</span>
          </button>
        )}
      </div>

      {/* TAB 1: SMS QUEUE & HISTORY */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
              <span className="text-slate-500 text-[11px] font-semibold">Total Logged Messages</span>
              <div className="text-2xl font-bold text-slate-900 mt-1">{totalCount}</div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
              <span className="text-slate-500 text-[11px] font-semibold">Sent Successfully</span>
              <div className="text-2xl font-bold text-emerald-700 mt-1">{sentCount}</div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
              <span className="text-slate-500 text-[11px] font-semibold">Pending in Queue</span>
              <div className="text-2xl font-bold text-amber-700 mt-1">{pendingCount}</div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
              <span className="text-slate-500 text-[11px] font-semibold">Delivery Failures</span>
              <div className="text-2xl font-bold text-rose-700 mt-1">{failedCount}</div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="sm:col-span-2 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by recipient name, phone, SACCO account..."
                className="w-full pl-9 pr-3 py-2 border rounded-lg bg-white text-slate-900 focus:outline-blue-500"
              />
            </div>

            <div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="w-full p-2 border rounded-lg bg-white text-slate-900"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending Only</option>
                <option value="SENT">Sent Successfully</option>
                <option value="FAILED">Failed Deliveries</option>
              </select>
            </div>

            <div>
              <select
                value={branchFilter}
                onChange={e => setBranchFilter(e.target.value)}
                disabled={!user?.hasMultiBranchAccess}
                className="w-full p-2 border rounded-lg bg-white text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
              >
                {user?.hasMultiBranchAccess && <option value="ALL">All Six Branches</option>}
                {branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Recipient &amp; Phone</th>
                    <th className="px-4 py-3">Branch &amp; Account</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Message Snippet</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoadingQueue ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                        <RefreshCw className="w-5 h-5 text-blue-600 animate-spin mx-auto mb-2" />
                        Loading SMS transmission records...
                      </td>
                    </tr>
                  ) : queue.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                        No SMS messages matching current criteria.
                      </td>
                    </tr>
                  ) : (
                    queue.map(msg => (
                      <tr key={msg.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {new Date(msg.createdAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{msg.recipientName}</div>
                          <div className="font-mono text-[11px] text-blue-700">{msg.recipientPhone}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-slate-800">{msg.branchName}</div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {msg.saccoAccountNumber || 'Direct Contact'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium">
                            {msg.templateCategory || 'GENERAL'}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className="truncate text-slate-700" title={msg.messageText}>
                            {msg.messageText}
                          </p>
                          {msg.failureReason && (
                            <span className="text-[10px] text-rose-600 block mt-0.5 font-medium truncate">
                              Error: {msg.failureReason}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {renderStatusBadge(msg)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedMessage(msg)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-slate-100 transition"
                              title="View full message payload"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {msg.status === 'FAILED' && canRetryFailed && (
                              <button
                                onClick={() => handleRetry(msg.id)}
                                disabled={actionLoadingId === msg.id}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold border border-rose-200 transition"
                                title="Re-dispatch via Africa's Talking API"
                              >
                                <RotateCcw
                                  className={`w-3 h-3 ${actionLoadingId === msg.id ? 'animate-spin' : ''}`}
                                />
                                <span>Retry</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SMS TEMPLATES */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          {/* Approved Runyankore Expiry Template Highlight */}
          <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                Official Approved Expiry Template (Requirement 2)
              </span>
              <span className="text-[10px] font-mono text-amber-800 bg-white px-2 py-0.5 rounded border border-amber-200">
                133 GSM-7 Chars • 1 Segment (&le;160 Chars)
              </span>
            </div>
            <p className="font-mono text-xs text-amber-950 bg-white p-3 rounded-lg border border-amber-200 leading-relaxed font-semibold">
              &quot;NYAMUYANJA SACCO nekumanyisa ku sente zawe za Turihamwe zihwireyo noshabwa kushashura obutarenzya ebiro mushanju (7) kuriga erizooba&quot;
            </p>
            <p className="text-[11px] text-amber-800">
              Preserved exact institutional wording approved by SACCO leadership. Automatically dispatched on policy expiry date in Africa/Kampala timezone.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Approved SACCO SMS Templates • Standardized message structures and automated policy triggers
            </p>
            {canManageTemplates && (
              <button
                onClick={() => {
                  setEditingTemplate(null);
                  setIsTemplateModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold shadow-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Create New Template
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isLoadingTemplates ? (
              <div className="col-span-2 py-12 text-center text-slate-500 text-xs">
                <RefreshCw className="w-5 h-5 text-blue-600 animate-spin mx-auto mb-2" />
                Loading message templates...
              </div>
            ) : (
              templates.map(tmpl => (
                <div
                  key={tmpl.id}
                  className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {tmpl.code}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 mt-1.5">{tmpl.name}</h3>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          tmpl.isActive
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {tmpl.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 italic my-3 font-mono leading-relaxed">
                      &quot;{tmpl.templateText}&quot;
                    </div>

                    <div className="text-[11px] text-slate-500 mb-3">
                      <span className="font-semibold text-slate-700 block mb-1">Supported Dynamic Variables:</span>
                      <div className="flex flex-wrap gap-1">
                        {tmpl.availableVariables.map(v => (
                          <span
                            key={v}
                            className="bg-slate-200/80 text-slate-800 text-[10px] font-mono px-1.5 py-0.5 rounded"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span>By: {tmpl.createdByUserFullName}</span>
                    {canManageTemplates && (
                      <button
                        onClick={() => {
                          setEditingTemplate(tmpl);
                          setIsTemplateModalOpen(true);
                        }}
                        className="text-blue-700 hover:text-blue-900 font-semibold flex items-center gap-1"
                      >
                        <span>Edit Template</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: NOTIFICATION EVENTS LOG */}
      {activeTab === 'events' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs">
            <p className="text-slate-500">
              Institutional Lifecycle Events &amp; Duplicate Prevention Journal
            </p>
            <span className="text-slate-400">
              Deduplication Key protects members from redundant reminders.
            </span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Event Date</th>
                    <th className="px-4 py-3">Event Type</th>
                    <th className="px-4 py-3">Target Member</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Deduplication Key</th>
                    <th className="px-4 py-3">Processed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoadingEvents ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                        <RefreshCw className="w-5 h-5 text-blue-600 animate-spin mx-auto mb-2" />
                        Loading notification event stream...
                      </td>
                    </tr>
                  ) : events.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                        No notification events triggered yet.
                      </td>
                    </tr>
                  ) : (
                    events.map(ev => (
                      <tr key={ev.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {new Date(ev.createdAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                            {ev.eventType}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">{ev.memberName || 'N/A'}</div>
                          <div className="font-mono text-[10px] text-slate-400">{ev.saccoAccountNumber}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{ev.branchName}</td>
                        <td className="px-4 py-3 max-w-xs truncate text-slate-700">{ev.description}</td>
                        <td className="px-4 py-3 font-mono text-[10px] text-slate-400 max-w-xs truncate">
                          {ev.deduplicationKey}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              ev.processed
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {ev.processed ? 'PROCESSED' : 'PENDING'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: COMPOSE OUTBOUND MESSAGE */}
      {activeTab === 'compose' && (
        <div className="max-w-2xl bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Send className="w-4 h-4 text-blue-700" />
              Compose Outbound SMS Notification
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Transmit an authorized SMS to a SACCO member or recipient. Uses Africa&apos;s Talking Gateway.
            </p>
          </div>

          <form onSubmit={handleSendManualSms} className="space-y-4 text-xs">
            {/* Quick Member Autofill */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Autofill from Enrolled SACCO Member (Optional)
              </label>
              <select
                value={composeMemberAccount}
                onChange={e => handleSelectMember(e.target.value)}
                className="w-full p-2.5 border rounded-lg bg-white text-slate-900"
              >
                <option value="">-- Choose Member to Autofill Phone &amp; Name --</option>
                {membersList.map(m => (
                  <option key={m.saccoAccountNumber} value={m.saccoAccountNumber}>
                    {m.fullName} ({m.saccoAccountNumber}) • {m.primaryPhone}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Recipient Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={composeRecipientName}
                  onChange={e => setComposeRecipientName(e.target.value)}
                  placeholder="e.g. Emmanuel Kato"
                  className="w-full p-2.5 border rounded-lg bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Recipient Phone (Uganda +256 / 07...) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={composeRecipientPhone}
                  onChange={e => setComposeRecipientPhone(e.target.value)}
                  placeholder="+256701234567 or 0701234567"
                  className="w-full p-2.5 border rounded-lg bg-white text-slate-900"
                />
              </div>
            </div>

            {/* Template Selector */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Populate from Template (Optional)
              </label>
              <select
                value={composeTemplateId}
                onChange={e => handleSelectTemplate(e.target.value)}
                className="w-full p-2.5 border rounded-lg bg-white text-slate-900"
              >
                <option value="">-- Select a Template --</option>
                {templates.filter(t => t.isActive).map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Message Body */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-700">
                  SMS Message Body <span className="text-rose-500">*</span>
                </label>
                <span className="text-slate-400 text-[11px]">
                  {composeMessageText.length} characters • {Math.ceil((composeMessageText.length || 1) / 160)} SMS page(s)
                </span>
              </div>
              <textarea
                required
                rows={4}
                value={composeMessageText}
                onChange={e => setComposeMessageText(e.target.value)}
                placeholder="Type official notification text here..."
                className="w-full p-3 border rounded-lg bg-white text-slate-900 font-sans focus:outline-blue-500"
              />
            </div>

            {/* Transmission Mode */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-800 block">Dispatch Mode</span>
                <span className="text-slate-500 text-[11px]">
                  Send immediately via Africa&apos;s Talking or place into pending offline queue
                </span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={composeDispatchImmediately}
                  onChange={e => setComposeDispatchImmediately(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <span className="text-xs font-semibold text-slate-700">Dispatch Immediately</span>
              </label>
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('queue')}
                className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingSms}
                className="px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold flex items-center gap-2 shadow-xs disabled:opacity-50"
              >
                <Send className={`w-3.5 h-3.5 ${isSubmittingSms ? 'animate-spin' : ''}`} />
                <span>{composeDispatchImmediately ? 'Submit & Dispatch' : 'Queue into Offline Store'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DETAIL MODAL FOR SMS MESSAGE */}
      {selectedMessage && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <span className="text-[10px] font-mono text-slate-400">ID: {selectedMessage.id}</span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">SMS Transmission Record</h3>
              </div>
              <button
                onClick={() => setSelectedMessage(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border">
                <div>
                  <span className="text-slate-400 block text-[10px]">Recipient</span>
                  <span className="font-bold text-slate-800">{selectedMessage.recipientName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Phone Number</span>
                  <span className="font-mono font-bold text-blue-700">{selectedMessage.recipientPhone}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Transmission State</span>
                  <div className="mt-0.5">{renderStatusBadge(selectedMessage)}</div>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Operating Branch</span>
                  <span className="font-semibold text-slate-800">{selectedMessage.branchName}</span>
                </div>
              </div>

              <div>
                <span className="font-semibold text-slate-700 block mb-1">Message Content</span>
                <div className="p-3 bg-slate-100 rounded-lg text-slate-800 font-mono text-xs leading-relaxed">
                  {selectedMessage.messageText}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 pt-2 border-t">
                <div>
                  <span>Queued by: {selectedMessage.queuedByUserFullName}</span>
                </div>
                <div>
                  <span>Retries: {selectedMessage.retryCount} / {selectedMessage.maxRetries}</span>
                </div>
                {selectedMessage.providerMessageId && (
                  <div className="col-span-2 font-mono">
                    Provider Ref: <strong>{selectedMessage.providerMessageId}</strong>
                  </div>
                )}
                <div className="col-span-2 flex flex-wrap gap-x-4 gap-y-1 bg-slate-50 p-2 rounded border border-slate-200">
                  <span>
                    Handset Delivered: <strong>{selectedMessage.deliveryConfirmed ? 'YES (Confirmed via DLR)' : 'NO'}</strong>
                  </span>
                  {selectedMessage.deliveryReceiptNetworkCode && (
                    <span>• Telco Network: <strong>{selectedMessage.deliveryReceiptNetworkCode}</strong></span>
                  )}
                  {selectedMessage.deliveryReceiptAt && (
                    <span>• DLR Time: {new Date(selectedMessage.deliveryReceiptAt).toLocaleString()}</span>
                  )}
                </div>
                {diagnostics?.environment === 'SANDBOX' && (
                  <div className="col-span-2 bg-blue-50 p-2 rounded text-blue-800 text-[11px] border border-blue-200">
                    <strong>Sandbox Mode:</strong> Messages are accepted by Africa&apos;s Talking and routed to the virtual web simulator. They are not delivered to physical cellular phones.
                  </div>
                )}
                {selectedMessage.failureReason && (
                  <div className="col-span-2 text-rose-600 font-semibold">
                    Failure Cause: {selectedMessage.failureReason}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t flex justify-end gap-2">
              {selectedMessage.status === 'FAILED' && canRetryFailed && (
                <button
                  onClick={() => {
                    handleRetry(selectedMessage.id);
                    setSelectedMessage(null);
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg text-xs"
                >
                  Retry Message Now
                </button>
              )}
              <button
                onClick={() => setSelectedMessage(null)}
                className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-100 font-semibold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TEMPLATE CREATE / EDIT MODAL */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingTemplate ? 'Edit SMS Template' : 'Create New SMS Template'}
              </h3>
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                const form = e.currentTarget;
                const code = (form.elements.namedItem('code') as HTMLInputElement).value;
                const name = (form.elements.namedItem('name') as HTMLInputElement).value;
                const category = (form.elements.namedItem('category') as HTMLSelectElement).value as SmsTemplateCategory;
                const templateText = (form.elements.namedItem('templateText') as HTMLTextAreaElement).value;
                const isActive = (form.elements.namedItem('isActive') as HTMLInputElement).checked;

                handleSaveTemplate({
                  code,
                  name,
                  category,
                  templateText,
                  isActive,
                  availableVariables: ['[Member Name]', '[Expiry Date]', '[Branch]', '[Claim Reference]'],
                });
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Template Code</label>
                <input
                  name="code"
                  type="text"
                  required
                  defaultValue={editingTemplate?.code || ''}
                  placeholder="e.g. EXPIRY_REMINDER_7_DAYS"
                  className="w-full p-2 border rounded-lg bg-white text-slate-900 font-mono uppercase"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Template Name</label>
                <input
                  name="name"
                  type="text"
                  required
                  defaultValue={editingTemplate?.name || ''}
                  placeholder="e.g. Seven Day Expiry Alert"
                  className="w-full p-2 border rounded-lg bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Category</label>
                <select
                  name="category"
                  defaultValue={editingTemplate?.category || 'EXPIRY_REMINDER_7_DAYS'}
                  className="w-full p-2 border rounded-lg bg-white text-slate-900"
                >
                  <option value="EXPIRY_REMINDER_30_DAYS">30 Days Before Expiry</option>
                  <option value="EXPIRY_REMINDER_14_DAYS">14 Days Before Expiry</option>
                  <option value="EXPIRY_REMINDER_7_DAYS">7 Days Before Expiry</option>
                  <option value="EXPIRY_DATE_NOTICE">Expiry Date Notification</option>
                  <option value="POST_EXPIRY_FOLLOWUP">Post-Expiry Grace Follow-up</option>
                  <option value="CLAIM_SUBMITTED">Claim Submitted</option>
                  <option value="CLAIM_DOCS_REQUESTED">Claim Additional Documents Requested</option>
                  <option value="CLAIM_APPROVED">Claim Approved</option>
                  <option value="CLAIM_REJECTED">Claim Rejected</option>
                  <option value="CONTRIBUTION_RECEIVED">Contribution Receipt Notification</option>
                  <option value="CUSTOM_ANNOUNCEMENT">Custom Institutional Announcement</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Template Body</label>
                <textarea
                  name="templateText"
                  required
                  rows={4}
                  defaultValue={editingTemplate?.templateText || ''}
                  placeholder="Dear [Member Name], your Turihamwe cover with Nyamuyanja SACCO expires on [Expiry Date]..."
                  className="w-full p-2.5 border rounded-lg bg-white text-slate-900 font-mono"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Use variables: [Member Name], [Expiry Date], [Branch], [Claim Reference], [Account Number]
                </span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  name="isActive"
                  type="checkbox"
                  id="tmplActive"
                  defaultChecked={editingTemplate ? editingTemplate.isActive : true}
                  className="rounded text-blue-600 h-4 w-4"
                />
                <label htmlFor="tmplActive" className="font-semibold text-slate-700">
                  Active (Available for automatic and manual dispatches)
                </label>
              </div>

              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg shadow-xs"
                >
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN TEST SMS DISPATCH MODAL */}
      {isTestSendModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-blue-700" />
                <h3 className="text-base font-bold text-slate-900">
                  Africa&apos;s Talking Test Dispatch
                </h3>
              </div>
              <button
                onClick={() => setIsTestSendModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs space-y-1">
              <span className="font-bold block">Safe Administrative Diagnostic Verification</span>
              <p className="text-[11px] leading-relaxed text-blue-800">
                This transmits a single clearly-labelled test message to verify the live pipeline. Provider credentials remain held exclusively on the secure backend service.
              </p>
            </div>

            <form onSubmit={handleAdminTestSend} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Recipient Telephone Number (Uganda E.164 format)
                </label>
                <input
                  type="tel"
                  required
                  value={testSendPhone}
                  onChange={e => setTestSendPhone(e.target.value)}
                  placeholder="+256701234567"
                  className="w-full p-2.5 border rounded-lg bg-white text-slate-900 font-mono text-sm"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Accepts +256..., 07..., or 256... Automatically normalized to Ugandan international E.164.
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <span className="font-semibold block text-slate-700">Message Content Preview:</span>
                <p className="font-mono text-slate-800 bg-white p-2 rounded border border-slate-200">
                  [ADMIN DIAGNOSTIC TEST] Nyamuyanja SACCO Turihamwe SMS delivery test via Africa&apos;s Talking {diagnostics?.environment || 'SANDBOX'} at [Timestamp].
                </p>
              </div>

              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTestSendModalOpen(false)}
                  disabled={isTestSending}
                  className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isTestSending || !testSendPhone}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg shadow-xs transition disabled:opacity-50"
                >
                  <Send className={`w-3.5 h-3.5 ${isTestSending ? 'animate-spin' : ''}`} />
                  <span>{isTestSending ? 'Transmitting...' : 'Dispatch Test SMS'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
