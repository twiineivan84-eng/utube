import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { PermissionCode } from '../../types';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Receipt,
  FileCheck2,
  BarChart3,
  UserCog,
  Settings2,
  Building,
  ScrollText,
  MessageSquare,
  UserPlus
} from 'lucide-react';

export type NavigationTab =
  | 'dashboard'
  | 'members'
  | 'turihamwe'
  | 'transactions'
  | 'claims'
  | 'reports'
  | 'sms'
  | 'users-rights'
  | 'system'
  | 'audit-logs';

interface NavItem {
  id: NavigationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPermissions?: PermissionCode[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    // Everyone authenticated sees dashboard shell
  },
  {
    id: 'members',
    label: 'Members',
    icon: Users,
    requiredPermissions: [
      'members.view',
      'members.register',
      'members.edit',
      'members.delete',
      'members.search',
      'members.history',
    ],
  },
  {
    id: 'turihamwe',
    label: 'Turihamwe',
    icon: ShieldCheck,
    requiredPermissions: [
      'turihamwe.view',
      'turihamwe.register_plan',
      'turihamwe.manage_beneficiaries',
      'turihamwe.view_contributions',
      'turihamwe.record_contribution',
      'turihamwe.view_renewals',
      'turihamwe.record_renewal',
      'turihamwe.view_expiry',
      'turihamwe.reactivate_plan',
      'turihamwe.view_history',
    ],
  },
  {
    id: 'transactions',
    label: 'Transactions',
    icon: Receipt,
    requiredPermissions: [
      'transactions.view',
      'transactions.record',
      'transactions.print_receipts',
      'transactions.edit',
    ],
  },
  {
    id: 'claims',
    label: 'Claims',
    icon: FileCheck2,
    requiredPermissions: [
      'claims.view',
      'claims.create',
      'claims.upload_documents',
      'claims.review',
      'claims.approve',
      'claims.reject',
      'claims.close',
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
    requiredPermissions: [
      'reports.view',
      'reports.generate',
      'reports.monthly_performance',
      'reports.edit_templates',
      'reports.export',
      'reports.view_financial',
    ],
  },
  {
    id: 'sms',
    label: 'SMS & Alerts',
    icon: MessageSquare,
    requiredPermissions: [
      'sms.view_history',
      'sms.view_queue',
      'sms.manage_templates',
      'sms.send',
    ],
  },
  {
    id: 'users-rights',
    label: 'Users & Rights',
    icon: UserCog,
    requiredPermissions: [
      'admin.manage_users',
      'admin.create_groups',
      'admin.assign_rights',
      'admin.modify_rights',
    ],
  },
  {
    id: 'system',
    label: 'System',
    icon: Settings2,
    requiredPermissions: [
      'admin.system_settings',
      'admin.multi_branch_access',
      'audit.view_logs',
      'audit.system_reports',
      'audit.sync_status',
      'audit.manage_backups',
    ],
  },
];

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  onAddNewMember?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab, onAddNewMember }) => {
  const { hasAnyPermission, hasPermission, user, workingBranch } = useAuth();

  // Filter items strictly by permission: HIDE ENTIRE SECTION IF UNAUTHORIZED
  const visibleNavItems = NAV_ITEMS.filter(item => {
    if (!item.requiredPermissions || item.requiredPermissions.length === 0) {
      return true;
    }
    return hasAnyPermission(item.requiredPermissions);
  });

  const canRegisterMember =
    hasPermission('members.register') ||
    hasPermission('members.view') ||
    hasPermission('admin.system_settings') ||
    user?.roleCode === 'IT_OFFICER' ||
    user?.roleCode === 'GM';

  return (
    <aside className="w-64 bg-white text-slate-700 flex flex-col shrink-0 border-r border-slate-200">
      {/* Branch Context Indicator */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/70">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
          <Building className="w-3.5 h-3.5 text-blue-700" />
          Active Working Branch
        </div>
        <div className="text-sm font-semibold text-slate-900 truncate">
          {workingBranch?.name || 'No Branch Selected'}
        </div>
        <div className="text-[11px] text-blue-700 font-medium mt-0.5">
          {workingBranch?.district || 'Isingiro District'}
        </div>
      </div>

      {/* Main Navigation Items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Operational Modules
        </div>

        {visibleNavItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-semibold border-l-4 border-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-700' : 'text-slate-400'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}

        {/* Action Button: Add New Member under the modules */}
        {canRegisterMember && (
          <div className="pt-3 mt-3 border-t border-slate-200/80">
            <button
              onClick={() => (onAddNewMember ? onAddNewMember() : onSelectTab('members'))}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold shadow-xs hover:shadow-sm active:scale-[0.99] transition-all cursor-pointer"
              title="Register a new member to Nyamuyanja SACCO"
            >
              <UserPlus className="w-4 h-4 shrink-0 text-white" />
              <span>Add New Member</span>
            </button>
          </div>
        )}
      </nav>

      {/* Institutional Security Notice */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-600">
        <div className="flex items-center justify-between text-slate-800 font-semibold mb-1">
          <span>Security Context</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-medium">
            {user?.roleName || 'Standard User'}
          </span>
        </div>
        <p className="text-[10px] text-slate-500 leading-tight">
          Role-Based Access Control enforced. Unauthorized modules are strictly hidden.
        </p>
      </div>
    </aside>
  );
};
