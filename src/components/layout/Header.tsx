import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';
import { apiClient } from '../../api/client';
import { Branch } from '../../types';
import { SaccoLogo } from '../common/SaccoLogo';
import { AlertCenterDrawer } from '../alerts/AlertCenterDrawer';
import { NavigationTab } from './Sidebar';
import { UgandaClock } from './UgandaClock';
import { formatUgandaTime } from '../../utils/timezone';
import {
  Building2,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  User as UserIcon,
  Shield,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Bell
} from 'lucide-react';

interface HeaderProps {
  onNavigateTab?: (tab: NavigationTab) => void;
}

export const Header: React.FC<HeaderProps> = ({ onNavigateTab }) => {
  const { user, workingBranch, switchBranch, logout, hasPermission } = useAuth();
  const { syncState, pendingCount, triggerSync, lastSyncedAt } = useSync();
  const [allowedBranches, setAllowedBranches] = useState<Branch[]>([]);
  const [isSwitching, setIsSwitching] = useState<boolean>(false);
  const [showBranchMenu, setShowBranchMenu] = useState<boolean>(false);
  const [isAlertDrawerOpen, setIsAlertDrawerOpen] = useState<boolean>(false);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState<number>(0);

  const canViewAlerts = hasPermission('alerts.view');

  const fetchUnreadCount = async () => {
    if (!canViewAlerts) return;
    try {
      const res = await apiClient.getAlerts({
        branchId: user?.hasMultiBranchAccess ? undefined : workingBranch?.id,
        status: 'UNREAD',
      });
      if (res.success) {
        setUnreadAlertsCount(res.unreadCount);
      }
    } catch {
      // ignore in offline/initial boot
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [user, workingBranch?.id, canViewAlerts]);

  useEffect(() => {
    if (user?.hasMultiBranchAccess) {
      apiClient.getBranches().then(res => {
        if (res.success) {
          const allowedIds = new Set([user.primaryBranchId, ...(user.allowedBranchIds || [])]);
          setAllowedBranches(res.data.filter(b => allowedIds.has(b.id)));
        }
      });
    }
  }, [user]);

  const handleBranchSwitch = async (newBranchId: string) => {
    if (newBranchId === workingBranch?.id) {
      setShowBranchMenu(false);
      return;
    }

    setIsSwitching(true);
    try {
      await switchBranch(newBranchId);
      setShowBranchMenu(false);
    } finally {
      setIsSwitching(false);
    }
  };

  const renderSyncBadge = () => {
    switch (syncState) {
      case 'SYNCHRONIZED':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Synchronized</span>
            {pendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-200 text-emerald-800 text-[10px]">
                {pendingCount}
              </span>
            )}
          </div>
        );
      case 'SYNCHRONIZING':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium">
            <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
            <span>Synchronizing...</span>
          </div>
        );
      case 'OFFLINE':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-300 text-xs font-medium">
            <WifiOff className="w-3.5 h-3.5 text-slate-500" />
            <span>Offline (Local DB)</span>
            {pendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 text-[10px]">
                {pendingCount} pending
              </span>
            )}
          </div>
        );
      case 'SYNC_ERROR':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-medium">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Sync Error</span>
            {pendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 text-[10px]">
                {pendingCount}
              </span>
            )}
          </div>
        );
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left Brand Identity */}
          <SaccoLogo size="md" showText={true} />

          {/* Real-Time Official Uganda Clock (Africa/Kampala - EAT) */}
          <UgandaClock variant="header" />

          {/* Center / Right Section */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Working Branch Indicator / Switcher */}
            <div className="relative">
              {user?.hasMultiBranchAccess && allowedBranches.length > 1 ? (
                <div>
                  <button
                    onClick={() => setShowBranchMenu(!showBranchMenu)}
                    disabled={isSwitching}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-800 transition"
                  >
                    <Building2 className="w-3.5 h-3.5 text-blue-700" />
                    <span>Working Branch: <strong className="font-semibold text-slate-900">{workingBranch?.name}</strong></span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  </button>

                  {showBranchMenu && (
                    <div className="absolute right-0 mt-1 w-64 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50">
                      <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] uppercase font-semibold text-slate-500">
                        Switch Operational Branch
                      </div>
                      {allowedBranches.map(branch => (
                        <button
                          key={branch.id}
                          onClick={() => handleBranchSwitch(branch.id)}
                          className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-blue-50 transition ${
                            branch.id === workingBranch?.id ? 'bg-blue-50 font-semibold text-blue-800' : 'text-slate-700'
                          }`}
                        >
                          <span>{branch.name}</span>
                          {branch.id === workingBranch?.id && (
                            <span className="text-[10px] text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">Active</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium text-slate-800">
                  <Building2 className="w-3.5 h-3.5 text-blue-700" />
                  <span>Branch: <strong className="text-slate-900">{workingBranch?.name}</strong></span>
                </div>
              )}
            </div>

            {/* Offline-First Sync Badge & Trigger */}
            <div className="flex items-center gap-1.5">
              {renderSyncBadge()}
              <button
                onClick={triggerSync}
                title={lastSyncedAt ? `Last Synced: ${formatUgandaTime(lastSyncedAt)}` : 'Sync with central database'}
                className="p-1.5 rounded-lg text-slate-600 hover:text-blue-700 hover:bg-slate-100 border border-slate-200 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncState === 'SYNCHRONIZING' ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* In-System Alert Center Bell (Phase 6) */}
            {canViewAlerts && (
              <button
                onClick={() => setIsAlertDrawerOpen(true)}
                title="Open Institutional Alert Center"
                className="relative p-2 rounded-lg text-slate-600 hover:text-blue-700 hover:bg-slate-100 border border-slate-200 transition"
              >
                <Bell className="w-4 h-4" />
                {unreadAlertsCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center animate-pulse">
                    {unreadAlertsCount > 9 ? '9+' : unreadAlertsCount}
                  </span>
                )}
              </button>
            )}

            {/* User Profile & Logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="text-right hidden md:block">
                <div className="text-xs font-semibold text-slate-900 flex items-center justify-end gap-1">
                  <span>{user?.fullName}</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  @{user?.username} • {user?.roleName || 'Officer'}
                </div>
              </div>

              <button
                onClick={logout}
                title="Log Out of Turihamwe"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:text-red-700 hover:bg-red-50 border border-slate-200 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Slide-over Alert Center Drawer */}
      <AlertCenterDrawer
        isOpen={isAlertDrawerOpen}
        onClose={() => setIsAlertDrawerOpen(false)}
        onNavigateTab={onNavigateTab}
        onAlertsChanged={fetchUnreadCount}
      />
    </header>
  );
};
