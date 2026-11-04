import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { SystemAlert, AlertStatus, AlertCategory, AlertSeverity } from '../../types';
import {
  Bell,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Clock,
  ExternalLink,
  Check,
  RefreshCw,
  ShieldAlert,
  Send,
  FileCheck2,
  ShieldCheck
} from 'lucide-react';
import { NavigationTab } from '../layout/Sidebar';

interface AlertCenterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab?: (tab: NavigationTab) => void;
  onAlertsChanged?: () => void;
}

export const AlertCenterDrawer: React.FC<AlertCenterDrawerProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
  onAlertsChanged,
}) => {
  const { user, workingBranch, hasPermission } = useAuth();
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const canManageAlerts = hasPermission('alerts.manage');

  const fetchAlerts = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.getAlerts({
        branchId: user?.hasMultiBranchAccess ? undefined : workingBranch?.id,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      });
      if (res.success) {
        setAlerts(res.data);
        setUnreadCount(res.unreadCount);
        if (onAlertsChanged) onAlertsChanged();
      }
    } catch (err) {
      console.error('Failed to load system alerts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAlerts();
    }
  }, [isOpen, statusFilter, workingBranch?.id]);

  const handleMarkRead = async (alertId: string) => {
    setActionLoadingId(alertId);
    try {
      const res = await apiClient.markAlertRead(alertId);
      if (res.success) {
        setAlerts(prev =>
          prev.map(a => (a.id === alertId ? { ...a, status: 'READ' as AlertStatus } : a))
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
        if (onAlertsChanged) onAlertsChanged();
      }
    } catch (err) {
      console.error('Failed to mark alert as read:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResolve = async (alertId: string) => {
    setActionLoadingId(alertId);
    try {
      const res = await apiClient.resolveAlert(alertId);
      if (res.success) {
        setAlerts(prev =>
          prev.map(a => (a.id === alertId ? { ...a, status: 'RESOLVED' as AlertStatus } : a))
        );
        if (onAlertsChanged) onAlertsChanged();
      }
    } catch (err) {
      console.error('Failed to resolve alert:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleActionClick = (alert: SystemAlert) => {
    if (alert.status === 'UNREAD') {
      handleMarkRead(alert.id);
    }
    if (alert.linkTab && onNavigateTab) {
      onNavigateTab(alert.linkTab as NavigationTab);
      onClose();
    }
  };

  if (!isOpen) return null;

  const getSeverityBadge = (sev: AlertSeverity) => {
    switch (sev) {
      case 'CRITICAL':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-rose-600" />
            CRITICAL
          </span>
        );
      case 'WARNING':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            WARNING
          </span>
        );
      case 'INFO':
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
            <Info className="w-3 h-3 text-blue-600" />
            INFO
          </span>
        );
    }
  };

  const getCategoryIcon = (cat: AlertCategory) => {
    switch (cat) {
      case 'UPCOMING_EXPIRY':
      case 'EXPIRED_PLAN':
      case 'PENDING_RENEWAL':
        return <ShieldCheck className="w-4 h-4 text-amber-600" />;
      case 'CLAIM_AWAITING_REVIEW':
      case 'CLAIM_AWAITING_DOCS':
        return <FileCheck2 className="w-4 h-4 text-purple-600" />;
      case 'SMS_FAILURE':
        return <Send className="w-4 h-4 text-rose-600" />;
      case 'SYNC_ERROR':
        return <RefreshCw className="w-4 h-4 text-amber-600" />;
      default:
        return <ShieldAlert className="w-4 h-4 text-blue-600" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-xs flex justify-end transition-opacity">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                Alert Center
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-xs font-semibold">
                    {unreadCount} new
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-500">
                Institutional Notifications & Operational Triggers
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchAlerts}
              title="Refresh alerts"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="px-5 py-2.5 bg-white border-b border-slate-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
            {(['ALL', 'UNREAD', 'RESOLVED'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                  statusFilter === f
                    ? 'bg-white text-blue-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {f === 'ALL' ? 'All Alerts' : f === 'UNREAD' ? 'Unread Only' : 'Resolved'}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-slate-400">
            {alerts.length} record{alerts.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Alerts List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
          {isLoading && alerts.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center">
              <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mb-2" />
              Loading institutional alerts...
            </div>
          ) : alerts.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
              <p className="font-semibold text-slate-700">No alerts in this view</p>
              <p className="text-[11px] text-slate-400 mt-1">All branch operational signals are nominal.</p>
            </div>
          ) : (
            alerts.map(alert => {
              const isUnread = alert.status === 'UNREAD';
              const isResolved = alert.status === 'RESOLVED';

              return (
                <div
                  key={alert.id}
                  className={`p-3.5 rounded-xl mb-2 transition border ${
                    isUnread
                      ? 'bg-blue-50/50 border-blue-200'
                      : isResolved
                      ? 'bg-slate-50/60 border-slate-200 opacity-75'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-slate-100">
                        {getCategoryIcon(alert.category)}
                      </div>
                      <h3
                        className={`text-xs font-bold ${
                          isUnread ? 'text-blue-950' : 'text-slate-800'
                        }`}
                      >
                        {alert.title}
                      </h3>
                    </div>
                    {getSeverityBadge(alert.severity)}
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed pl-7 mb-2">
                    {alert.message}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pl-7 pt-1 border-t border-slate-100">
                    <span className="flex items-center gap-1 font-mono text-[10px]">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {new Date(alert.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' • '}
                      {alert.branchName || 'Consolidated'}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {isUnread && (
                        <button
                          onClick={() => handleMarkRead(alert.id)}
                          disabled={actionLoadingId === alert.id}
                          className="px-2 py-0.5 text-[10px] font-medium rounded text-slate-600 hover:text-blue-700 hover:bg-blue-50 transition border border-slate-200"
                        >
                          Mark Read
                        </button>
                      )}

                      {canManageAlerts && !isResolved && (
                        <button
                          onClick={() => handleResolve(alert.id)}
                          disabled={actionLoadingId === alert.id}
                          className="px-2 py-0.5 text-[10px] font-medium rounded text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition border border-emerald-200 flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          Resolve
                        </button>
                      )}

                      {alert.linkTab && (
                        <button
                          onClick={() => handleActionClick(alert)}
                          className="px-2 py-0.5 text-[10px] font-semibold rounded text-blue-700 bg-blue-100/70 hover:bg-blue-200 transition flex items-center gap-1"
                        >
                          <span>Open</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-500 text-center">
          Alerts reflect authorized branch & permission visibility. Historical logs are preserved.
        </div>
      </div>
    </div>
  );
};
