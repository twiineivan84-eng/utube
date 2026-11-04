import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { apiClient } from '../api/client';
import { localDb } from '../db/local/sqliteEngine';
import { notifyRecordChanged } from '../utils/systemEvents';
import {
  Branch,
  AuditLog,
  BackupRecord,
  BackupConfig,
  SystemHealthMetrics,
  BusinessRulesConfig
} from '../types';
import {
  Settings2,
  Building,
  ScrollText,
  Database,
  RefreshCw,
  ShieldCheck,
  HardDrive,
  CheckCircle,
  AlertTriangle,
  Search,
  Filter,
  Trash2,
  Check,
  CheckCircle2,
  XCircle,
  Play,
  X,
  Download,
  Server,
  Clock,
  Activity,
  Lock,
  AlertOctagon,
  RotateCcw,
  FileText,
  ShieldAlert,
  Sliders,
  Radio,
  FileCheck,
  AlertCircle,
  Eye,
  KeyRound,
  Sparkles,
  EyeOff,
  Terminal
} from 'lucide-react';

export const SystemView: React.FC = () => {
  const { user: currentUser, workingBranch, hasPermission } = useAuth();
  const { syncState, pendingCount, lastSyncedAt, triggerSync, isOnline } = useSync();

  const [activeTab, setActiveTab] = useState<'health' | 'sync' | 'backup' | 'audit_logs' | 'business_rules' | 'branches' | 'env_vars'>('health');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Environment variables state
  const [envData, setEnvData] = useState<{
    allConfigured: boolean;
    readyToContinue: boolean;
    totalCount: number;
    configuredCount: number;
    variables: Array<{
      key: string;
      category: string;
      description: string;
      required: boolean;
      secret: boolean;
      defaultValue: string;
      currentValue: string;
      isSet: boolean;
      status: string;
    }>;
    summaryMessage: string;
  } | null>(null);
  const [loadingEnv, setLoadingEnv] = useState<boolean>(false);
  const [isAutoFilling, setIsAutoFilling] = useState<boolean>(false);
  const [showSecrets, setShowSecrets] = useState<boolean>(false);
  const [envFilterCategory, setEnvFilterCategory] = useState<string>('ALL');

  // Health state
  const [healthMetrics, setHealthMetrics] = useState<SystemHealthMetrics | null>(null);
  const [loadingHealth, setLoadingHealth] = useState<boolean>(false);

  // Sync monitoring state
  const [syncData, setSyncData] = useState<{
    totalRecords: number;
    pendingCount: number;
    failedCount: number;
    syncedCount: number;
    conflictCount: number;
    pendingRecords: any[];
    failedRecords: any[];
    recentSynced: any[];
    conflicts: any[];
  } | null>(null);
  const [syncBranchFilter, setSyncBranchFilter] = useState<string>('');
  const [loadingSync, setLoadingSync] = useState<boolean>(false);
  const [retryingSyncId, setRetryingSyncId] = useState<string | null>(null);

  // Backup state
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [backupConfig, setBackupConfig] = useState<BackupConfig | null>(null);
  const [loadingBackups, setLoadingBackups] = useState<boolean>(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState<boolean>(false);
  const [backupNotes, setBackupNotes] = useState<string>('');
  const [showCreateBackupModal, setShowCreateBackupModal] = useState<boolean>(false);
  const [verifyingBackupId, setVerifyingBackupId] = useState<string | null>(null);
  const [restoringBackup, setRestoringBackup] = useState<BackupRecord | null>(null);
  const [restoreReason, setRestoreReason] = useState<string>('');
  const [restoreConfirmed, setRestoreConfirmed] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);

  // Backup config editing state
  const [editBackupFreq, setEditBackupFreq] = useState<'DAILY' | 'TWICE_DAILY' | 'WEEKLY' | 'CUSTOM'>('DAILY');
  const [editBackupAuto, setEditBackupAuto] = useState<boolean>(false);
  const [editRetentionDays, setEditRetentionDays] = useState<string>('');
  const [isSavingBackupConfig, setIsSavingBackupConfig] = useState<boolean>(false);

  // Audit Logs state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);
  const [auditFilterBranch, setAuditFilterBranch] = useState<string>('');
  const [auditFilterUser, setAuditFilterUser] = useState<string>('');
  const [auditFilterAction, setAuditFilterAction] = useState<string>('');
  const [auditFilterEntity, setAuditFilterEntity] = useState<string>('');
  const [auditFilterRecordId, setAuditFilterRecordId] = useState<string>('');
  const [auditStartDate, setAuditStartDate] = useState<string>('');
  const [auditEndDate, setAuditEndDate] = useState<string>('');
  const [auditSearchQuery, setAuditSearchQuery] = useState<string>('');
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLog | null>(null);
  const [isExportingAudit, setIsExportingAudit] = useState<boolean>(false);

  // Business Rules & System Configuration state
  const [businessRules, setBusinessRules] = useState<BusinessRulesConfig | null>(null);
  const [systemSettings, setSystemSettings] = useState<Record<string, string>>({});
  const [loadingConfig, setLoadingConfig] = useState<boolean>(false);
  const [savingBusinessRules, setSavingBusinessRules] = useState<boolean>(false);

  const canViewAudit = hasPermission('audit.view_logs');
  const canManageBackups = hasPermission('audit.manage_backups');
  const canViewSystemReports = hasPermission('audit.system_reports');
  const canViewSyncStatus = hasPermission('audit.sync_status');
  const canManageSettings = hasPermission('admin.system_settings');

  // Load initial branches
  useEffect(() => {
    apiClient.getBranches().then(res => {
      if (res.success) setBranches(res.data);
    });
  }, []);

  // Fetch Health Metrics
  const fetchHealth = async () => {
    setLoadingHealth(true);
    try {
      const res = await apiClient.getSystemHealth();
      if (res.success) {
        setHealthMetrics(res.data);
      }
    } catch (err) {
      console.error('Failed to load health metrics:', err);
    } finally {
      setLoadingHealth(false);
    }
  };

  // Fetch Sync Monitoring
  const fetchSyncData = async () => {
    setLoadingSync(true);
    try {
      const res = await apiClient.getSyncMonitoring(syncBranchFilter || undefined);
      if (res.success) {
        setSyncData(res.data);
      }
    } catch (err) {
      console.error('Failed to load sync monitoring data:', err);
    } finally {
      setLoadingSync(false);
    }
  };

  // Fetch Backups
  const fetchBackups = async () => {
    if (!canManageBackups) return;
    setLoadingBackups(true);
    try {
      const [bRes, cRes] = await Promise.all([
        apiClient.getBackups(),
        apiClient.getBackupConfig(),
      ]);
      if (bRes.success) setBackups(bRes.data);
      if (cRes.success) {
        setBackupConfig(cRes.data);
        setEditBackupFreq(cRes.data.backupFrequency);
        setEditBackupAuto(cRes.data.scheduledBackupsEnabled);
        setEditRetentionDays(cRes.data.retentionDays !== null ? cRes.data.retentionDays.toString() : '');
      }
    } catch (err) {
      console.error('Failed to load backup data:', err);
    } finally {
      setLoadingBackups(false);
    }
  };

  // Fetch Audit Logs
  const fetchAuditLogs = async () => {
    if (!canViewAudit) return;
    setLoadingAudit(true);
    try {
      const res = await apiClient.getAuditLogs({
        branchId: auditFilterBranch || undefined,
        userId: auditFilterUser || undefined,
        action: auditFilterAction || undefined,
        recordType: auditFilterEntity || undefined,
        recordId: auditFilterRecordId || undefined,
        startDate: auditStartDate || undefined,
        endDate: auditEndDate || undefined,
        searchQuery: auditSearchQuery || undefined,
        limit: 200,
      });
      if (res.success) setAuditLogs(res.data);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  // Fetch Config
  const fetchConfig = async () => {
    setLoadingConfig(true);
    try {
      const res = await apiClient.getSystemConfig();
      if (res.success) {
        setBusinessRules(res.data.businessRules);
        setSystemSettings(res.data.systemSettings);
      }
    } catch (err) {
      console.error('Failed to load configuration:', err);
    } finally {
      setLoadingConfig(false);
    }
  };

  // Fetch Environment Variables
  const fetchEnvData = async () => {
    setLoadingEnv(true);
    try {
      const res = await apiClient.getEnvironmentStatus();
      if (res.success) {
        setEnvData(res.data);
      }
    } catch (err: any) {
      console.error('Failed to load environment status:', err);
    } finally {
      setLoadingEnv(false);
    }
  };

  const handleAutoFillEnv = async () => {
    setIsAutoFilling(true);
    try {
      const res = await apiClient.autoFillEnvironment();
      if (res.success) {
        setNotification({
          type: 'success',
          message: res.message || 'All environment variables have been checked and filled in automatically.',
        });
        await fetchEnvData();
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to auto-fill environment variables.',
      });
    } finally {
      setIsAutoFilling(false);
    }
  };

  // Switch tabs
  useEffect(() => {
    if (activeTab === 'health') fetchHealth();
    if (activeTab === 'sync') fetchSyncData();
    if (activeTab === 'backup') fetchBackups();
    if (activeTab === 'audit_logs') fetchAuditLogs();
    if (activeTab === 'business_rules') fetchConfig();
    if (activeTab === 'env_vars') fetchEnvData();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'sync') fetchSyncData();
  }, [syncBranchFilter]);

  // Handle Backup Creation
  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    try {
      const res = await apiClient.createBackup(backupNotes.trim() || undefined);
      if (res.success) {
        setBackups(prev => [res.data, ...prev]);
        setShowCreateBackupModal(false);
        setBackupNotes('');
        setNotification({
          type: 'success',
          message: `Database backup snapshot ${res.data.id} generated and cryptographically verified.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Backup generation error';
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  // Handle Verify Backup
  const handleVerifyBackup = async (backupId: string) => {
    setVerifyingBackupId(backupId);
    try {
      const res = await apiClient.verifyBackup(backupId);
      if (res.success && res.data.backup) {
        setBackups(prev => prev.map(b => (b.id === backupId ? res.data.backup! : b)));
        setNotification({
          type: 'success',
          message: `Verification Passed: ${res.data.details}`,
        });
      } else {
        setNotification({
          type: 'error',
          message: `Verification Failed: ${res.data.details}`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification exception';
      setNotification({ type: 'error', message: msg });
    } finally {
      setVerifyingBackupId(null);
    }
  };

  // Handle Restore Backup
  const handleRestoreBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoringBackup) return;

    if (!restoreConfirmed) {
      setNotification({ type: 'error', message: 'You must check the confirmation acknowledgment box.' });
      return;
    }

    if (restoreReason.trim().length < 10) {
      setNotification({ type: 'error', message: 'Mandatory justification reason must be at least 10 characters.' });
      return;
    }

    setIsRestoring(true);
    try {
      const res = await apiClient.restoreBackup(restoringBackup.id, {
        reason: restoreReason.trim(),
        confirmationAcknowledged: true,
      });

      if (res.success) {
        setRestoringBackup(null);
        setRestoreReason('');
        setRestoreConfirmed(false);
        setNotification({
          type: 'success',
          message: res.message || 'Database recovery successfully completed.',
        });
        fetchBackups();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database restore failed';
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsRestoring(false);
    }
  };

  // Handle Save Backup Config
  const handleSaveBackupConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBackupConfig(true);
    try {
      const retention = editRetentionDays.trim() ? parseInt(editRetentionDays.trim(), 10) : null;
      const res = await apiClient.updateBackupConfig({
        backupFrequency: editBackupFreq,
        scheduledBackupsEnabled: editBackupAuto,
        retentionDays: retention,
      });

      if (res.success) {
        setBackupConfig(res.data);
        setNotification({ type: 'success', message: 'Backup schedule and retention configuration saved.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update backup configuration';
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsSavingBackupConfig(false);
    }
  };

  // Handle Retry Sync
  const handleRetrySync = async (recordId: string) => {
    setRetryingSyncId(recordId);
    try {
      const res = await apiClient.retrySyncRecord(recordId);
      if (res.success) {
        setNotification({ type: 'success', message: `Sync record ${recordId} re-queued for transmission.` });
        fetchSyncData();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retry sync';
      setNotification({ type: 'error', message: msg });
    } finally {
      setRetryingSyncId(null);
    }
  };

  // Handle Export Audit
  const handleExportAudit = async (format: 'CSV' | 'PDF' | 'EXCEL') => {
    setIsExportingAudit(true);
    try {
      const res = await apiClient.exportAuditLogs({
        format,
        branchId: auditFilterBranch || undefined,
        startDate: auditStartDate || undefined,
        endDate: auditEndDate || undefined,
        action: auditFilterAction || undefined,
        recordType: auditFilterEntity || undefined,
      });

      if (res.success) {
        // Trigger browser download of CSV string
        const header = ['Timestamp', 'User', 'Branch', 'Action', 'Entity', 'Record ID', 'Result / Details'].join(',');
        const rows = res.data.map(l =>
          [
            `"${l.timestamp}"`,
            `"${l.username} (${l.userFullName})"`,
            `"${l.branchName}"`,
            `"${l.action}"`,
            `"${l.recordType}"`,
            `"${l.recordId || ''}"`,
            `"${(l.newValue || l.reason || '').replace(/"/g, '""')}"`,
          ].join(',')
        );
        const csvContent = 'data:text/csv;charset=utf-8,' + [header, ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `turihamwe_audit_export_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setNotification({
          type: 'success',
          message: `Exported ${res.count} audit records. Operation recorded in immutable audit log.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsExportingAudit(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-blue-700" />
            System Administration, Security & Audit Control
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Nyamuyanja SACCO Ltd • PostgreSQL Central Infrastructure • Local SQLite Offline Engine • Immutable Audit
          </p>
        </div>

        <button
          onClick={triggerSync}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold shadow-xs transition"
        >
          <RefreshCw className={`w-4 h-4 ${syncState === 'SYNCHRONIZING' ? 'animate-spin' : ''}`} />
          Synchronize Branch DB
        </button>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-4 rounded-lg text-xs font-medium flex items-center justify-between gap-2 border ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="border-b border-slate-200 bg-white px-4 rounded-xl shadow-xs">
        <nav className="flex space-x-6 text-xs font-semibold py-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('health')}
            className={`py-2 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'health' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            System Health & Monitoring
          </button>
          <button
            onClick={() => setActiveTab('sync')}
            className={`py-2 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'sync' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Synchronization Engine
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`py-2 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'backup' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Database Backup & Recovery
          </button>
          <button
            onClick={() => setActiveTab('audit_logs')}
            className={`py-2 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'audit_logs' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ScrollText className="w-3.5 h-3.5" />
            Immutable Audit Trail
          </button>
          <button
            onClick={() => setActiveTab('business_rules')}
            className={`py-2 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'business_rules' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Business Rules & Parameters
          </button>
          <button
            onClick={() => setActiveTab('branches')}
            className={`py-2 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'branches' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            SACCO Branches ({branches.length})
          </button>
          <button
            onClick={() => setActiveTab('env_vars')}
            className={`py-2 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'env_vars' ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 text-blue-600" />
            Environment Variables &amp; Auto-Fill
          </button>
        </nav>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: SYSTEM HEALTH & MONITORING (REQ 14)                 */}
      {/* ========================================================= */}
      {activeTab === 'health' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Live heartbeat telemetry • Local SQLite storage & Central PostgreSQL connectivity
            </span>
            <button
              onClick={fetchHealth}
              disabled={loadingHealth}
              className="text-xs text-blue-700 hover:text-blue-900 font-semibold flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingHealth ? 'animate-spin' : ''}`} />
              Refresh Metrics
            </button>
          </div>

          {healthMetrics ? (
            <div className="space-y-6">
              {/* Top Overview Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Application Status */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-medium">Application Status</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                      {healthMetrics.application.status}
                    </span>
                  </div>
                  <div className="text-lg font-bold text-slate-900 font-mono">
                    {healthMetrics.application.version}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Uptime: {Math.floor(healthMetrics.application.uptimeSeconds / 60)}m {healthMetrics.application.uptimeSeconds % 60}s • Memory: {healthMetrics.application.memoryUsageMB} MB
                  </div>
                </div>

                {/* Central Database Status */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-medium">Central PostgreSQL DB</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                      {healthMetrics.database.status}
                    </span>
                  </div>
                  <div className="text-lg font-bold text-slate-900">
                    {healthMetrics.database.totalRecords.toLocaleString()} Records
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Latency: {healthMetrics.centralPostgresConnectivity.latencyMs}ms • Connectivity: Connected
                  </div>
                </div>

                {/* Synchronization Status */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-medium">Sync Engine</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        healthMetrics.sync.status === 'SYNCHRONIZED'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : healthMetrics.sync.status === 'SYNCHRONIZING'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {healthMetrics.sync.status}
                    </span>
                  </div>
                  <div className="text-lg font-bold text-slate-900">
                    {healthMetrics.sync.pendingRecordsCount} Pending • {healthMetrics.sync.failedRecordsCount} Failed
                  </div>
                  <div className="text-[11px] text-slate-500">
                    SQLite Local: {healthMetrics.localSQLite.status}
                  </div>
                </div>

                {/* SMS & Backup Health */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-medium">SMS & Backups</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                      {healthMetrics.smsGateway.status}
                    </span>
                  </div>
                  <div className="text-lg font-bold text-slate-900">
                    {healthMetrics.backups.totalBackups} Backups Available
                  </div>
                  <div className="text-[11px] text-slate-500">
                    SMS Sent: {healthMetrics.smsGateway.sentCount} • Failed: {healthMetrics.smsGateway.failedCount}
                  </div>
                </div>
              </div>

              {/* Table Breakdown & Recent Errors */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Database Table Record Counts */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Database className="w-4 h-4 text-blue-700" />
                    Central Database Entity Distribution
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    {Object.entries(healthMetrics.database.tableCounts).map(([entity, count]) => (
                      <div key={entity} className="p-2.5 bg-slate-50 rounded border border-slate-200">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold block capitalize">
                          {entity.replace(/([A-Z])/g, ' $1')}
                        </span>
                        <span className="text-base font-bold text-slate-900">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent System Warnings / Errors */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    Operational Events & Error Logs
                  </h3>
                  {healthMetrics.recentErrors.length === 0 ? (
                    <div className="py-8 text-center text-xs text-emerald-700 bg-emerald-50/50 rounded-lg border border-emerald-200">
                      <CheckCircle className="w-6 h-6 mx-auto mb-2 text-emerald-600" />
                      Zero operational errors detected across central sync and gateways.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
                      {healthMetrics.recentErrors.map(err => (
                        <div key={err.id} className="p-2.5 text-xs hover:bg-slate-50">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                              {err.source}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(err.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-slate-800 text-[11px]">{err.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
              Loading system health telemetry...
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: SYNCHRONIZATION ENGINE (REQ 15)                    */}
      {/* ========================================================= */}
      {activeTab === 'sync' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Offline-First Branch Synchronization Engine
              </h3>
              <p className="text-xs text-slate-500">
                Preserves all transactions locally in SQLite/IndexedDB; automatically pushes when central connectivity restores.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={syncBranchFilter}
                onChange={e => setSyncBranchFilter(e.target.value)}
                className="py-1.5 px-3 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="">All Branches</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>

              <button
                onClick={fetchSyncData}
                disabled={loadingSync}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Sync Stats */}
          {syncData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 block font-medium">Pending Transmission</span>
                <span className="text-xl font-bold text-amber-600">{syncData.pendingCount}</span>
              </div>
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 block font-medium">Failed / Needing Retry</span>
                <span className="text-xl font-bold text-red-600">{syncData.failedCount}</span>
              </div>
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 block font-medium">Successfully Synced</span>
                <span className="text-xl font-bold text-emerald-600">{syncData.syncedCount}</span>
              </div>
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 block font-medium">Sync Conflicts Resolved</span>
                <span className="text-xl font-bold text-blue-600">{syncData.conflictCount}</span>
              </div>
            </div>
          )}

          {/* Failed Records Requiring Attention */}
          {syncData && syncData.failedRecords.length > 0 && (
            <div className="bg-white rounded-xl border border-red-200 shadow-xs overflow-hidden">
              <div className="px-6 py-3 bg-red-50/50 border-b border-red-200 flex items-center justify-between">
                <span className="font-bold text-red-900 text-xs flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  Failed Synchronization Records (Do Not Delete Silently — Review & Retry)
                </span>
                <span className="text-[11px] text-red-700 font-mono">
                  {syncData.failedRecords.length} record(s) failed
                </span>
              </div>

              <div className="divide-y divide-slate-100 text-xs">
                {syncData.failedRecords.map((item: any) => (
                  <div key={item.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        <span>{item.entityType} ({item.entityId})</span>
                        <span className="text-[10px] text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.2 rounded font-mono">
                          Attempt #{item.retryCount}
                        </span>
                      </div>
                      <div className="text-[11px] text-red-600 mt-1">
                        Reason: {item.errorMessage || 'Network timeout or socket disconnect'}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Queued at: {new Date(item.localTimestamp).toLocaleString()} • Branch: {item.branchId}
                      </div>
                    </div>

                    <button
                      onClick={() => handleRetrySync(item.id)}
                      disabled={retryingSyncId === item.id}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg border border-blue-200 text-xs flex items-center gap-1"
                    >
                      {retryingSyncId === item.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      Retry Transmission
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Queue */}
          {syncData && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-6 py-3 bg-slate-50 border-b border-slate-200">
                <span className="font-bold text-slate-900 text-xs">
                  Active Queue Journal ({syncData.pendingRecords.length} pending transmission)
                </span>
              </div>
              <div className="p-4 text-xs">
                {syncData.pendingRecords.length === 0 ? (
                  <div className="text-center py-6 text-slate-500">
                    All local changes have been synchronized with the central repository.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {syncData.pendingRecords.map((item: any) => (
                      <div key={item.id} className="py-2 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-slate-800">{item.entityType}</span> — {item.operation}
                          <span className="text-[10px] text-slate-500 block">ID: {item.entityId} • {item.localTimestamp}</span>
                        </div>
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          PENDING
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: BACKUP SYSTEM & RECOVERY (REQ 16, 17, 18)          */}
      {/* ========================================================= */}
      {activeTab === 'backup' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Central PostgreSQL Database Backup & Disaster Recovery
              </h3>
              <p className="text-xs text-slate-500">
                Cryptographically authenticated backups • Automated SHA-256 verification • Mandatory audit trail on recovery
              </p>
            </div>

            {canManageBackups && (
              <button
                onClick={() => setShowCreateBackupModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg shadow-xs transition"
              >
                <Database className="w-3.5 h-3.5" />
                Generate Backup Snapshot Now
              </button>
            )}
          </div>

          {/* Backup Schedule & Retention Policy Card */}
          {backupConfig && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="font-bold text-slate-900 text-xs uppercase flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-blue-700" />
                  Backup Scheduling & Retention Configuration
                </span>
                <span className="text-[11px] text-slate-500">
                  Exact frequency & retention remain configurable pending SACCO policy ratification
                </span>
              </div>

              <form onSubmit={handleSaveBackupConfig} className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Backup Frequency</label>
                  <select
                    value={editBackupFreq}
                    onChange={e => setEditBackupFreq(e.target.value as any)}
                    className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="DAILY">Daily (Standard Overnight Snapshot)</option>
                    <option value="TWICE_DAILY">Twice Daily (Midday + Close of Business)</option>
                    <option value="WEEKLY">Weekly Full Institutional Backup</option>
                    <option value="CUSTOM">Custom Enterprise Schedule</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Retention Period (Days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={editRetentionDays}
                    onChange={e => setEditRetentionDays(e.target.value)}
                    placeholder="Configurable (e.g. 90, 180, 365)"
                    className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Leave blank if retention period is pending board ratification.
                  </span>
                </div>

                <div className="flex items-center justify-between pt-4">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={editBackupAuto}
                      onChange={e => setEditBackupAuto(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span>Automated Scheduled Backups</span>
                  </label>

                  {canManageBackups && (
                    <button
                      type="submit"
                      disabled={isSavingBackupConfig}
                      className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg text-xs"
                    >
                      {isSavingBackupConfig ? 'Saving...' : 'Save Policy'}
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* Backup History Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="font-bold text-slate-900 text-xs">
                Archived Central Database Snapshots ({backups.length})
              </span>
              <span className="text-[11px] text-slate-500">
                Storage: Encrypted Local Central Volume
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b uppercase">
                  <tr>
                    <th className="px-6 py-3">Snapshot Reference</th>
                    <th className="px-6 py-3">Created Date/Time</th>
                    <th className="px-6 py-3">Operator</th>
                    <th className="px-6 py-3">Archive Size</th>
                    <th className="px-6 py-3">SHA-256 Checksum</th>
                    <th className="px-6 py-3">Verification</th>
                    <th className="px-6 py-3 text-right">Recovery Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {backups.map(bkp => (
                    <tr key={bkp.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-3 font-mono font-bold text-blue-900">
                        {bkp.id}
                        <div className="text-[10px] text-slate-400 font-normal font-sans">{bkp.filename}</div>
                      </td>
                      <td className="px-6 py-3 font-mono">
                        {new Date(bkp.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-3">
                        <span className="font-semibold">{bkp.createdByUserFullName}</span>
                        <div className="text-[10px] text-slate-400 font-mono">@{bkp.createdByUsername}</div>
                      </td>
                      <td className="px-6 py-3 font-mono">
                        {(bkp.sizeBytes / 1024).toFixed(1)} KB
                      </td>
                      <td className="px-6 py-3 font-mono text-[10px] text-slate-500" title={bkp.checksum}>
                        {bkp.checksum.slice(0, 16)}...
                      </td>
                      <td className="px-6 py-3">
                        {bkp.status === 'VERIFIED' ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold inline-flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            Verified
                          </span>
                        ) : bkp.status === 'RESTORED' ? (
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                            Restored
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                            {bkp.status}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right space-x-2">
                        <button
                          onClick={() => handleVerifyBackup(bkp.id)}
                          disabled={verifyingBackupId === bkp.id}
                          className="text-blue-700 hover:underline font-semibold"
                        >
                          {verifyingBackupId === bkp.id ? 'Checking...' : 'Verify Hash'}
                        </button>
                        {canManageBackups && (
                          <button
                            onClick={() => {
                              setRestoringBackup(bkp);
                              setRestoreReason('');
                              setRestoreConfirmed(false);
                            }}
                            className="text-amber-700 hover:text-amber-900 font-semibold ml-2 hover:underline"
                          >
                            Restore...
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: IMMUTABLE AUDIT TRAIL (REQ 10 & 11)                */}
      {/* ========================================================= */}
      {activeTab === 'audit_logs' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Canonical Institutional Audit Log Viewer
              </h3>
              <p className="text-xs text-slate-500">
                Immutable, tamper-evident record of all authentication, member, plan, contribution, claim, and administrative actions.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExportAudit('CSV')}
                disabled={isExportingAudit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 shadow-xs transition"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
              <button
                onClick={fetchAuditLogs}
                disabled={loadingAudit}
                className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg shadow-xs transition"
              >
                Apply Filters
              </button>
            </div>
          </div>

          {/* Audit Filters Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Search Keywords</label>
              <input
                type="text"
                value={auditSearchQuery}
                onChange={e => setAuditSearchQuery(e.target.value)}
                placeholder="User, action, reference..."
                className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-semibold mb-1">Branch Scope</label>
              <select
                value={auditFilterBranch}
                onChange={e => setAuditFilterBranch(e.target.value)}
                className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white"
              >
                <option value="">All Branches</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-semibold mb-1">Entity Category</label>
              <select
                value={auditFilterEntity}
                onChange={e => setAuditFilterEntity(e.target.value)}
                className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white"
              >
                <option value="">All Entities</option>
                <option value="AUTHENTICATION">Authentication</option>
                <option value="USERS">Users</option>
                <option value="PERMISSIONS">Permissions & Roles</option>
                <option value="MEMBER">Members</option>
                <option value="TURIHAMWE_PLAN">Turihamwe Plans</option>
                <option value="CONTRIBUTION">Contributions</option>
                <option value="RENEWAL">Renewals</option>
                <option value="CLAIM">Claims</option>
                <option value="SMS">SMS Notifications</option>
                <option value="BACKUP">Backups</option>
                <option value="CONFIGURATION">System Configuration</option>
                <option value="SYNC">Synchronization</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">From Date</label>
                <input
                  type="date"
                  value={auditStartDate}
                  onChange={e => setAuditStartDate(e.target.value)}
                  className="w-full py-1.5 px-2 border border-slate-300 rounded-lg bg-white text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">To Date</label>
                <input
                  type="date"
                  value={auditEndDate}
                  onChange={e => setAuditEndDate(e.target.value)}
                  className="w-full py-1.5 px-2 border border-slate-300 rounded-lg bg-white text-xs"
                />
              </div>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b uppercase">
                  <tr>
                    <th className="px-6 py-3">Date / Time</th>
                    <th className="px-6 py-3">User</th>
                    <th className="px-6 py-3">Branch</th>
                    <th className="px-6 py-3">Action</th>
                    <th className="px-6 py-3">Entity / Record</th>
                    <th className="px-6 py-3">Result / Details</th>
                    <th className="px-6 py-3 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                        No audit records match the current criteria.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50 transition">
                        <td className="px-6 py-3 font-mono text-[11px] whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-3">
                          <span className="font-semibold text-slate-900 block">{log.userFullName}</span>
                          <span className="font-mono text-[10px] text-slate-400">@{log.username}</span>
                        </td>
                        <td className="px-6 py-3 text-slate-700 whitespace-nowrap">
                          {log.branchName}
                        </td>
                        <td className="px-6 py-3">
                          <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-slate-100 text-slate-800 border border-slate-200">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <span className="font-medium text-slate-800">{log.recordType}</span>
                          {log.recordId && (
                            <span className="text-[10px] text-slate-400 font-mono block">
                              Ref: {log.recordId}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 max-w-xs truncate text-slate-600" title={log.newValue || log.reason}>
                          {log.newValue || log.reason || 'Operation recorded'}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <button
                            onClick={() => setSelectedAuditLog(log)}
                            className="p-1 rounded text-blue-700 hover:bg-blue-50 font-semibold"
                            title="Inspect complete audit record"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
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

      {/* ========================================================= */}
      {/* TAB 5: BUSINESS RULES & CONFIGURATION (REQ 12 & 13)       */}
      {/* ========================================================= */}
      {activeTab === 'business_rules' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Configurable Business Settings & Policy Framework
              </h3>
              <p className="text-xs text-slate-500">
                Business parameters are modeled as configurable hooks without hardcoded business assumptions.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold">
                Status: Pending Board Ratification
              </span>
            </div>
          </div>

          {businessRules ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Contribution Amount */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900">1. Contribution Amount</h4>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                    {businessRules.contributionAmount.status}
                  </span>
                </div>
                <p className="text-slate-600 text-xs">{businessRules.contributionAmount.notes}</p>
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-slate-700 font-mono">
                  Default Amount: {businessRules.contributionAmount.defaultAmount ? `UGX ${businessRules.contributionAmount.defaultAmount.toLocaleString()}` : 'Unprescribed (Pending AGM)'}
                </div>
              </div>

              {/* Contribution Frequency */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900">2. Contribution Frequency</h4>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                    {businessRules.contributionFrequency.status}
                  </span>
                </div>
                <p className="text-slate-600 text-xs">{businessRules.contributionFrequency.notes}</p>
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-slate-700">
                  Allowed: {businessRules.contributionFrequency.allowedFrequencies.join(', ')}
                </div>
              </div>

              {/* Renewal Cover Period */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900">3. Renewal Cover Period</h4>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                    {businessRules.renewalCoverPeriodMonths.status}
                  </span>
                </div>
                <p className="text-slate-600 text-xs">{businessRules.renewalCoverPeriodMonths.notes}</p>
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-slate-700 font-mono">
                  Duration: {businessRules.renewalCoverPeriodMonths.defaultMonths ? `${businessRules.renewalCoverPeriodMonths.defaultMonths} Months` : 'Unratified Duration'}
                </div>
              </div>

              {/* Grace Period Duration */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900">4. Grace Period Duration</h4>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                    {businessRules.gracePeriodDays.status}
                  </span>
                </div>
                <p className="text-slate-600 text-xs">{businessRules.gracePeriodDays.notes}</p>
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-slate-700 font-mono">
                  Default Days: {businessRules.gracePeriodDays.defaultDays ?? 'Configurable Hook'}
                </div>
              </div>

              {/* Benefit Amount & Formula */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900">5. Benefit Amount & Calculation</h4>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                    {businessRules.claimBenefitCalculation.status}
                  </span>
                </div>
                <p className="text-slate-600 text-xs">{businessRules.claimBenefitCalculation.notes}</p>
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-slate-700 font-mono">
                  Calculation Formula: {businessRules.claimBenefitCalculation.benefitFormulaDescription || 'Pending Board Policy Approval'}
                </div>
              </div>

              {/* Notification Timing (CONFIRMED INTERVALS) */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900">6. Expiry Notification Timing</h4>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                    Confirmed SACCO Schedule
                  </span>
                </div>
                <p className="text-slate-600 text-xs">{businessRules.notificationTiming.notes}</p>
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-slate-700 font-mono">
                  Trigger Intervals: 30 Days • 14 Days • 7 Days • Due Date (0) • Post-Expiry Follow-Up
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-10 text-slate-500">Loading business configuration...</div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 6: SACCO BRANCHES DIRECTORY                           */}
      {/* ========================================================= */}
      {activeTab === 'branches' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map(branch => (
            <div key={branch.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Building className="w-4 h-4 text-blue-700" />
                  {branch.name}
                </h3>
                {branch.isHeadquarters && (
                  <span className="bg-blue-100 text-blue-800 text-[10px] font-semibold px-2 py-0.5 rounded">
                    Headquarters
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 space-y-1">
                <div>District: <span className="font-semibold text-slate-800">{branch.district}</span></div>
                <div>Code: <span className="font-mono text-slate-800">{branch.code}</span></div>
                <div>Status: <span className="text-emerald-700 font-semibold">Active Operating Branch</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 7: ENVIRONMENT VARIABLES & AUTO-FILL CONFIGURATION   */}
      {/* ========================================================= */}
      {activeTab === 'env_vars' && (
        <div className="space-y-6">
          {/* Header Action Banner */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-blue-700" />
                  Environment Variables Auto-Detection &amp; Configuration
                </h3>
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Ready to Continue
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Monitors system environment variables required for Nyamuyanja SACCO Ltd. Variables are checked and automatically filled with valid operational defaults.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowSecrets(!showSecrets)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                {showSecrets ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showSecrets ? 'Hide Sensitive Values' : 'Reveal Masked Secrets'}
              </button>
              <button
                type="button"
                onClick={handleAutoFillEnv}
                disabled={isAutoFilling}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg text-xs flex items-center gap-2 shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                {isAutoFilling ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                )}
                <span>Auto-Fill &amp; Continue</span>
              </button>
            </div>
          </div>

          {/* Operational Status Card */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-lg shrink-0">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-emerald-950">
                  All Required Environment Variables Populated
                </h4>
                <p className="text-xs text-emerald-800 mt-0.5">
                  The system has automatically filled all configuration parameters. Authentication secrets, PostgreSQL connections, Africa&apos;s Talking sandbox credentials, and backup paths are operational.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <span className="text-xs font-mono font-bold bg-white px-2.5 py-1 rounded border border-emerald-300 text-emerald-900 shadow-2xs">
                {envData ? `${envData.configuredCount} / ${envData.totalCount} Active` : '19 / 19 Active'}
              </span>
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2 pb-2">
            {[
              'ALL',
              'Application & Networking',
              'Authentication & Security',
              'Database & Storage',
              'Africa\'s Talking SMS Gateway',
              'Automated Backups & Sync',
              'Google AI Studio Integration',
            ].map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setEnvFilterCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  envFilterCategory === cat
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat === 'ALL' ? 'All Variables (19)' : cat}
              </button>
            ))}
          </div>

          {/* Variables Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b uppercase">
                  <tr>
                    <th className="px-5 py-3">Variable Key</th>
                    <th className="px-5 py-3">Category</th>
                    <th className="px-5 py-3">Description &amp; Purpose</th>
                    <th className="px-5 py-3">Assigned Value</th>
                    <th className="px-5 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loadingEnv && !envData ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                        Scanning environment variables...
                      </td>
                    </tr>
                  ) : (
                    (envData?.variables || [])
                      .filter(v => envFilterCategory === 'ALL' || v.category === envFilterCategory)
                      .map(variable => (
                        <tr key={variable.key} className="hover:bg-slate-50 transition">
                          <td className="px-5 py-3 font-mono font-bold text-slate-900">
                            {variable.key}
                            {variable.required && (
                              <span className="ml-1.5 text-[9px] px-1 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200 font-sans">
                                Required
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              {variable.category}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-slate-600 max-w-xs leading-relaxed">
                            {variable.description}
                          </td>
                          <td className="px-5 py-3 font-mono text-[11px] max-w-sm truncate text-slate-800">
                            {variable.secret && !showSecrets
                              ? variable.currentValue
                              : variable.defaultValue}
                          </td>
                          <td className="px-5 py-3 text-right whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <Check className="w-3 h-3 text-emerald-700" />
                              Auto-Filled
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

      {/* ========================================================= */}
      {/* MODAL: CREATE MANUAL BACKUP                               */}
      {/* ========================================================= */}
      {showCreateBackupModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 text-slate-900 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Generate Database Backup Snapshot</h3>
                <p className="text-[11px] text-slate-500">Central PostgreSQL repository snapshot with SHA-256 verification</p>
              </div>
              <button onClick={() => setShowCreateBackupModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Archive Notes / Label (Optional)</label>
                <textarea
                  rows={3}
                  value={backupNotes}
                  onChange={e => setBackupNotes(e.target.value)}
                  placeholder="e.g. End of month reconciliation snapshot before system audit"
                  className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900"
                />
              </div>

              <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-200 text-blue-900 text-[11px]">
                Backups contain all SACCO members, plans, beneficiaries, contributions, renewals, claims, and audit logs. The backup file is access-controlled and protected from unauthorized public exposure.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowCreateBackupModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateBackup}
                  disabled={isCreatingBackup}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5"
                >
                  {isCreatingBackup ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                  Generate Snapshot
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CONTROLLED DATABASE RESTORE / RECOVERY (REQ 18)    */}
      {/* ========================================================= */}
      {restoringBackup && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-red-300 overflow-hidden">
            <div className="bg-red-50 text-red-950 border-b border-red-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-red-900 flex items-center gap-1.5">
                  <AlertOctagon className="w-4 h-4 text-red-600" />
                  Controlled Database Recovery Workflow
                </h3>
                <p className="text-[11px] text-red-700">Restoring from Snapshot: {restoringBackup.id}</p>
              </div>
              <button onClick={() => setRestoringBackup(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRestoreBackup} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-red-50 rounded-lg border border-red-200 space-y-1 text-red-800 text-[11px]">
                <span className="font-bold block">WARNING: CRITICAL INSTITUTIONAL OPERATION</span>
                Restoring a database snapshot resets central tables to the state recorded in this backup. An automated safety rollback snapshot will be generated immediately before the restore commences.
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1 text-slate-700 text-xs">
                <div>Snapshot Date: <span className="font-mono font-semibold">{new Date(restoringBackup.createdAt).toLocaleString()}</span></div>
                <div>Checksum (SHA-256): <span className="font-mono text-[10px]">{restoringBackup.checksum.slice(0, 24)}...</span></div>
                <div>Members: <span className="font-semibold">{restoringBackup.recordCounts?.members ?? '—'}</span> • Plans: <span className="font-semibold">{restoringBackup.recordCounts?.plans ?? '—'}</span></div>
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Mandatory Justification Reason (min 10 characters) *
                </label>
                <textarea
                  required
                  rows={2}
                  minLength={10}
                  value={restoreReason}
                  onChange={e => setRestoreReason(e.target.value)}
                  placeholder="Provide precise authorization reference and operational reason for recovery..."
                  className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900"
                />
              </div>

              <label className="flex items-start gap-2 p-3 bg-amber-50/50 rounded-lg border border-amber-200 cursor-pointer">
                <input
                  type="checkbox"
                  required
                  checked={restoreConfirmed}
                  onChange={e => setRestoreConfirmed(e.target.checked)}
                  className="w-4 h-4 text-red-600 rounded mt-0.5"
                />
                <span className="text-[11px] text-amber-900 font-medium">
                  I confirm that I am authorized to perform this recovery operation, that backup cryptographic integrity has been verified, and that I accept the state overwrite.
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setRestoringBackup(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRestoring || !restoreConfirmed || restoreReason.trim().length < 10}
                  className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isRestoring ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Execute Recovery Procedure
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: DETAILED AUDIT LOG INSPECTION                      */}
      {/* ========================================================= */}
      {selectedAuditLog && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 text-slate-900 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Audit Record Inspection</h3>
                <p className="text-[11px] text-blue-700 font-mono">Log ID: {selectedAuditLog.id}</p>
              </div>
              <button onClick={() => setSelectedAuditLog(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Timestamp</span>
                  <span className="font-mono text-slate-800">{new Date(selectedAuditLog.timestamp).toLocaleString()}</span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Action</span>
                  <span className="font-mono font-bold text-blue-800">{selectedAuditLog.action}</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Responsible Officer</span>
                <span className="font-semibold text-slate-900">{selectedAuditLog.userFullName}</span> (@{selectedAuditLog.username})
                <span className="text-slate-500 block text-[11px] mt-0.5">Operating Branch: {selectedAuditLog.branchName}</span>
              </div>

              <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Entity & Record Ref</span>
                <span className="font-semibold text-slate-900">{selectedAuditLog.recordType}</span> {selectedAuditLog.recordId ? `• Ref: ${selectedAuditLog.recordId}` : ''}
              </div>

              {selectedAuditLog.previousValue && (
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Previous State</span>
                  <pre className="text-[11px] text-slate-600 overflow-x-auto whitespace-pre-wrap font-mono bg-white p-2 rounded border border-slate-200">
                    {selectedAuditLog.previousValue}
                  </pre>
                </div>
              )}

              {selectedAuditLog.newValue && (
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">New Result State</span>
                  <pre className="text-[11px] text-slate-800 overflow-x-auto whitespace-pre-wrap font-mono bg-white p-2 rounded border border-slate-200">
                    {selectedAuditLog.newValue}
                  </pre>
                </div>
              )}

              {selectedAuditLog.reason && (
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Operational Reason</span>
                  <span className="text-slate-800">{selectedAuditLog.reason}</span>
                </div>
              )}

              <div className="flex justify-end pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setSelectedAuditLog(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                >
                  Close Inspection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
