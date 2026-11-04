import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { apiClient } from '../api/client';
import { subscribeToRecordChanges } from '../utils/systemEvents';
import {
  Users,
  ShieldCheck,
  Clock,
  FileText,
  AlertCircle,
  Coins,
  ArrowUpRight,
  TrendingUp,
  Building,
  CheckCircle2,
  RefreshCw,
  EyeOff,
  Send,
  BarChart3,
  AlertTriangle,
  MessageSquare,
  UserPlus,
  Receipt,
  Settings2
} from 'lucide-react';
import { NavigationTab } from '../components/layout/Sidebar';
import { UgandaClock } from '../components/layout/UgandaClock';
import { getUgandaYearMonth } from '../utils/timezone';
import { SystemAlert, MonthlyBranchSummary } from '../types';

interface DashboardViewProps {
  onNavigate: (tab: NavigationTab) => void;
  onAddNewMember?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, onAddNewMember }) => {
  const { user, workingBranch, hasPermission } = useAuth();
  const { syncState, pendingCount, lastSyncedAt, triggerSync } = useSync();

  const canViewMembers = hasPermission('members.view');
  const canViewTurihamwe = hasPermission('turihamwe.view');
  const canViewClaims = hasPermission('claims.view');
  const canViewFinancial = hasPermission('reports.view_financial');
  const canViewAudit = hasPermission('audit.view_logs');
  const canViewReports = hasPermission('reports.view');
  const canViewSms = hasPermission('sms.view_queue') || hasPermission('sms.view_history');

  const [summary, setSummary] = useState<MonthlyBranchSummary | null>(null);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [failedSmsCount, setFailedSmsCount] = useState<number>(0);
  const [membersCount, setMembersCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    try {
      const branchId = user?.hasMultiBranchAccess ? undefined : workingBranch?.id;
      
      // Load summary using Uganda local calendar month/year
      const { year: currentYear, month: currentMonth } = getUgandaYearMonth();
      const summaryPromise = apiClient.getMonthlyBranchSummary({
        branchId,
        year: currentYear,
        month: currentMonth,
      }).catch(() => null);

      // Load alerts
      const alertsPromise = apiClient.getAlerts({
        branchId,
        status: 'UNREAD',
      }).catch(() => null);

      // Load SMS failures count
      const smsPromise = canViewSms
        ? apiClient.getSmsQueue({
            branchId,
            status: 'FAILED',
          }).catch(() => null)
        : Promise.resolve(null);

      // Load Members count
      const membersPromise = canViewMembers
        ? apiClient.getMembers('', branchId).catch(() => null)
        : Promise.resolve(null);

      const [sumRes, altRes, smsRes, memRes] = await Promise.all([summaryPromise, alertsPromise, smsPromise, membersPromise]);

      if (sumRes && sumRes.success) {
        setSummary(sumRes.data);
      }
      if (altRes && altRes.success) {
        setAlerts(altRes.data.slice(0, 4));
      }
      if (smsRes && smsRes.success) {
        setFailedSmsCount(smsRes.total || smsRes.data.length);
      }
      if (memRes && memRes.success) {
        setMembersCount(memRes.data.length);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user, workingBranch?.id, canViewSms, canViewMembers]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Subscribe to system-wide record changes to keep dashboard metrics up to date
  useEffect(() => {
    const unsubscribe = subscribeToRecordChanges(() => {
      loadDashboardData();
    });
    return unsubscribe;
  }, [loadDashboardData]);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">
              Welcome back, {user?.fullName}
            </h1>
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-800 border border-blue-200">
              {user?.roleName}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Institutional Session Active • Operating at <strong className="text-slate-700">{workingBranch?.name}</strong> ({workingBranch?.district} District)
          </p>
        </div>

        {/* Sync telemetry block */}
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-lg text-xs">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500">Database Engine</div>
            <div className="font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${syncState === 'SYNCHRONIZED' ? 'bg-emerald-500' : syncState === 'OFFLINE' ? 'bg-slate-400' : 'bg-blue-500'}`} />
              {syncState === 'OFFLINE' ? 'Offline (Local Dexie/IndexedDB)' : 'Central Operational Link'}
            </div>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500">Sync Status</div>
            <div className="font-medium text-slate-700 mt-0.5">
              {pendingCount > 0 ? `${pendingCount} Local Changes Queued` : 'All Systems Synchronized'}
            </div>
          </div>
          <button
            onClick={triggerSync}
            className="ml-1 p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-200 rounded transition"
            title="Force synchronization"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncState === 'SYNCHRONIZING' ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Official Uganda Real-Time Clock Display */}
      <UgandaClock variant="dashboard" />

      {/* Primary Operational Metrics (Permission Controlled) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Members */}
        {canViewMembers ? (
          <div
            onClick={() => onNavigate('members')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-blue-400 cursor-pointer transition"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total SACCO Members</span>
              <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {membersCount}
            </div>
            <div className="mt-2 flex items-center text-xs text-emerald-600 font-medium">
              <TrendingUp className="w-3.5 h-3.5 mr-1" />
              <span>Nyamuyanja &amp; 5 satellite branches</span>
            </div>
          </div>
        ) : null}

        {/* Active Turihamwe Policies */}
        {canViewTurihamwe ? (
          <div
            onClick={() => onNavigate('turihamwe')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-emerald-400 cursor-pointer transition"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Active Turihamwe Plans</span>
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {summary ? summary.activePlans : (isLoading ? '...' : 0)}
            </div>
            <div className="mt-2 flex items-center text-xs text-slate-500 font-medium">
              <span>{summary ? `${summary.newRegistrations} registered this month` : 'Active SACCO scheme plans'}</span>
            </div>
          </div>
        ) : null}

        {/* Renewals Executed / Due */}
        {canViewTurihamwe ? (
          <div
            onClick={() => onNavigate('turihamwe')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-amber-400 cursor-pointer transition"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Renewals Executed</span>
              <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {summary ? summary.renewalsCompleted : (isLoading ? '...' : 0)}
            </div>
            <div className="mt-2 flex items-center text-xs text-amber-700 font-medium">
              <span>Policy retention cycle active</span>
            </div>
          </div>
        ) : null}

        {/* Pending Claims / SMS Alert */}
        {canViewClaims ? (
          <div
            onClick={() => onNavigate('claims')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-purple-400 cursor-pointer transition"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Pending Claims</span>
              <div className="p-2 rounded-lg bg-purple-50 text-purple-700">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {summary ? Math.max(0, summary.claimsSubmitted - summary.claimsSettled) : (isLoading ? '...' : 0)}
            </div>
            <div className="mt-2 flex items-center text-xs text-purple-700 font-medium">
              <span>{summary ? `${summary.claimsApproved} approved for settlement` : 'Awaiting administrative review'}</span>
            </div>
          </div>
        ) : null}

        {/* Financial Metrics (STRICTLY PERMISSION CONTROLLED: reports.view_financial) */}
        {canViewFinancial ? (
          <div
            onClick={() => onNavigate('reports')}
            className="bg-white p-5 rounded-xl border border-blue-200 shadow-xs bg-gradient-to-br from-white to-blue-50/40 cursor-pointer hover:border-blue-400 transition"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-900">Turihamwe Contributions MTD</span>
              <div className="p-2 rounded-lg bg-blue-600 text-white">
                <Coins className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-950">
              UGX {Number(summary?.financials?.totalContributionsUGX || 0).toLocaleString()}
            </div>
            <div className="mt-2 flex items-center text-xs text-blue-800 font-medium">
              <span>Controlled financial aggregate</span>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 p-5 rounded-xl border border-dashed border-slate-200 flex flex-col justify-center items-center text-center">
            <EyeOff className="w-5 h-5 text-slate-400 mb-1" />
            <span className="text-xs font-medium text-slate-500">Financial Metrics Restricted</span>
            <span className="text-[10px] text-slate-400">Requires institutional financial clearance</span>
          </div>
        )}
      </div>

      {/* Operational Modules & Quick Member Registration Action */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <Building className="w-4 h-4 text-blue-700" />
              Institutional Operational Modules
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Access core functional workflows for Nyamuyanja SACCO Ltd.
            </p>
          </div>
          <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded">
            Branch Operations Active
          </span>
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {canViewMembers && (
            <button
              onClick={() => onNavigate('members')}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 transition flex flex-col items-center text-center gap-2 group cursor-pointer"
            >
              <div className="p-2 rounded-lg bg-blue-50 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition">
                <Users className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-slate-800">Members</span>
            </button>
          )}

          {canViewTurihamwe && (
            <button
              onClick={() => onNavigate('turihamwe')}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition flex flex-col items-center text-center gap-2 group cursor-pointer"
            >
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-slate-800">Turihamwe</span>
            </button>
          )}

          {hasPermission('transactions.view') && (
            <button
              onClick={() => onNavigate('transactions')}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50/40 transition flex flex-col items-center text-center gap-2 group cursor-pointer"
            >
              <div className="p-2 rounded-lg bg-amber-50 text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition">
                <Receipt className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-slate-800">Transactions</span>
            </button>
          )}

          {canViewClaims && (
            <button
              onClick={() => onNavigate('claims')}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-purple-500 hover:bg-purple-50/40 transition flex flex-col items-center text-center gap-2 group cursor-pointer"
            >
              <div className="p-2 rounded-lg bg-purple-50 text-purple-700 group-hover:bg-purple-600 group-hover:text-white transition">
                <FileText className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-slate-800">Claims</span>
            </button>
          )}

          {canViewReports && (
            <button
              onClick={() => onNavigate('reports')}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/40 transition flex flex-col items-center text-center gap-2 group cursor-pointer"
            >
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition">
                <BarChart3 className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-slate-800">Reports</span>
            </button>
          )}

          {canViewSms && (
            <button
              onClick={() => onNavigate('sms')}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-cyan-500 hover:bg-cyan-50/40 transition flex flex-col items-center text-center gap-2 group cursor-pointer"
            >
              <div className="p-2 rounded-lg bg-cyan-50 text-cyan-700 group-hover:bg-cyan-600 group-hover:text-white transition">
                <MessageSquare className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-slate-800">SMS Alerts</span>
            </button>
          )}

          {hasPermission('admin.system_settings') && (
            <button
              onClick={() => onNavigate('system')}
              className="p-3.5 rounded-xl border border-slate-200 hover:border-slate-500 hover:bg-slate-100/50 transition flex flex-col items-center text-center gap-2 group cursor-pointer"
            >
              <div className="p-2 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-slate-700 group-hover:text-white transition">
                <Settings2 className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-slate-800">System Admin</span>
            </button>
          )}
        </div>

        {/* Action Button: Add New Member Directly Under The Modules */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-blue-50/60 p-4 rounded-xl border border-blue-100">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-600 text-white shrink-0 shadow-xs">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-blue-950">
                Register New SACCO Member
              </h4>
              <p className="text-[11px] text-blue-700">
                Onboard a new member to Nyamuyanja SACCO, assign account number, and enroll into the Turihamwe welfare scheme.
              </p>
            </div>
          </div>
          <button
            onClick={() => (onAddNewMember ? onAddNewMember() : onNavigate('members'))}
            className="px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shadow-xs hover:shadow-sm active:scale-[0.99] transition flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add New Member</span>
            <ArrowUpRight className="w-3.5 h-3.5 ml-0.5" />
          </button>
        </div>
      </div>

      {/* Two-Column Institutional Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Expiry Alerts & Operational Notifications */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-blue-700" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Institutional Alerts &amp; Expiry Monitoring
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {alerts.length} Active Notice{alerts.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {alerts.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-bold text-slate-800">All Branch Operational Signals Nominal</p>
                <p className="text-[11px] text-slate-400 mt-1">No unread alerts requiring immediate supervisor escalation.</p>
              </div>
            ) : (
              alerts.map(a => (
                <div
                  key={a.id}
                  onClick={() => a.linkTab && onNavigate(a.linkTab as NavigationTab)}
                  className="p-4 flex items-start gap-3 hover:bg-slate-50 cursor-pointer transition"
                >
                  <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                    a.severity === 'CRITICAL'
                      ? 'bg-rose-50 text-rose-700'
                      : a.severity === 'WARNING'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-blue-50 text-blue-700'
                  }`}>
                    {a.severity === 'CRITICAL' ? (
                      <AlertCircle className="w-4 h-4" />
                    ) : a.severity === 'WARNING' ? (
                      <Clock className="w-4 h-4" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-800">
                        {a.title}
                      </h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${
                        a.severity === 'CRITICAL'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : a.severity === 'WARNING'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        {a.branchName || 'Consolidated'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      {a.message}
                    </p>
                  </div>
                </div>
              ))
            )}

            {/* Offline Sync State Card */}
            <div className="p-4 flex items-start gap-3 bg-slate-50/50">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800">
                    Offline Synchronization Engine Health
                  </h3>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold">
                    Nominal
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Local branch SQLite &amp; Dexie IndexedDB cache active. All transactions preserved across network outages.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Branch Directory & Actions */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Building className="w-4 h-4 text-blue-700" />
              Institutional Branches (6)
            </h2>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                <span className="font-semibold text-slate-800">1. Nyamuyanja Branch</span>
                <span className="text-[10px] font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">HQ</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                <span className="font-medium text-slate-700">2. Kagarama Branch</span>
                <span className="text-[10px] text-slate-500">Active</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                <span className="font-medium text-slate-700">3. Nyakigyera Branch</span>
                <span className="text-[10px] text-slate-500">Active</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                <span className="font-medium text-slate-700">4. Kamubeizi Branch</span>
                <span className="text-[10px] text-slate-500">Active</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                <span className="font-medium text-slate-700">5. Ruborogota Branch</span>
                <span className="text-[10px] text-slate-500">Active</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                <span className="font-medium text-slate-700">6. Masha Branch</span>
                <span className="text-[10px] text-slate-500">Active</span>
              </div>
            </div>
          </div>

          {/* Quick Actions (only if permitted) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
              Authorized Quick Actions
            </h2>
            <div className="space-y-2">
              {hasPermission('members.register') && (
                <button
                  onClick={() => (onAddNewMember ? onAddNewMember() : onNavigate('members'))}
                  className="w-full text-left px-3 py-2.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-xs font-semibold text-blue-900 flex items-center justify-between transition border border-blue-200 cursor-pointer shadow-xs"
                >
                  <span className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-blue-700" />
                    Add New SACCO Member
                  </span>
                  <ArrowUpRight className="w-4 h-4 text-blue-700" />
                </button>
              )}

              {canViewReports && (
                <button
                  onClick={() => onNavigate('reports')}
                  className="w-full text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-800 text-xs font-medium text-slate-700 flex items-center justify-between transition border border-slate-200"
                >
                  <span className="flex items-center gap-2">
                    <BarChart3 className="w-3.5 h-3.5 text-blue-700" />
                    Institutional Reports &amp; Analytics
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}

              {canViewSms && (
                <button
                  onClick={() => onNavigate('sms')}
                  className="w-full text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-800 text-xs font-medium text-slate-700 flex items-center justify-between transition border border-slate-200"
                >
                  <span className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-700" />
                    SMS Notifications &amp; Africa&apos;s Talking
                  </span>
                  <div className="flex items-center gap-1.5">
                    {failedSmsCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                        {failedSmsCount} failed
                      </span>
                    )}
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              )}

              {canViewMembers && (
                <button
                  onClick={() => onNavigate('members')}
                  className="w-full text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-800 text-xs font-medium text-slate-700 flex items-center justify-between transition border border-slate-200"
                >
                  <span>Member Management &amp; Search</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
              {canViewTurihamwe && (
                <button
                  onClick={() => onNavigate('turihamwe')}
                  className="w-full text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-800 text-xs font-medium text-slate-700 flex items-center justify-between transition border border-slate-200"
                >
                  <span>Turihamwe Insurance Plans</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
              {canViewClaims && (
                <button
                  onClick={() => onNavigate('claims')}
                  className="w-full text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-800 text-xs font-medium text-slate-700 flex items-center justify-between transition border border-slate-200"
                >
                  <span>Claims Processing Workflow</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
              {canViewAudit && (
                <button
                  onClick={() => onNavigate('system')}
                  className="w-full text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-800 text-xs font-medium text-slate-700 flex items-center justify-between transition border border-slate-200"
                >
                  <span>Audit Trail &amp; System Administration</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
