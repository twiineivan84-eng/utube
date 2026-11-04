import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SyncProvider } from './context/SyncContext';
import { LoginForm } from './components/auth/LoginForm';
import { SetupAdminModal } from './components/auth/SetupAdminModal';
import { AppLayout } from './components/layout/AppLayout';
import { NavigationTab } from './components/layout/Sidebar';
import { DashboardView } from './views/DashboardView';
import { MembersView } from './views/MembersView';
import { TurihamweView } from './views/TurihamweView';
import { TransactionsView } from './views/TransactionsView';
import { ClaimsView } from './views/ClaimsView';
import { ReportsView } from './views/ReportsView';
import { SmsNotificationsView } from './views/SmsNotificationsView';
import { UsersAndRightsView } from './views/UsersAndRightsView';
import { SystemView } from './views/SystemView';
import { RefreshCw } from 'lucide-react';
import { PermissionCode } from './types';
import { UTubeWebsite } from './components/youtube/YouTubePremiumMock';

const MainApplication: React.FC = () => {
  const { isAuthenticated, isLoading, hasAnyPermission, user } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [isSetupAdminOpen, setIsSetupAdminOpen] = useState<boolean>(false);
  const [openRegisterMemberModal, setOpenRegisterMemberModal] = useState<boolean>(false);

  const handleAddNewMember = () => {
    setCurrentTab('members');
    setOpenRegisterMemberModal(true);
  };

  // Validate active tab access against user permissions, reset to dashboard if unauthorized or logged out
  useEffect(() => {
    if (!isAuthenticated) {
      setCurrentTab('dashboard');
      return;
    }

    const tabPermissions: Partial<Record<NavigationTab, PermissionCode[]>> = {
      'members': ['members.view', 'members.register', 'members.edit', 'members.delete', 'members.search', 'members.history'],
      'turihamwe': ['turihamwe.view', 'turihamwe.register_plan', 'turihamwe.view_contributions', 'turihamwe.view_renewals'],
      'transactions': ['transactions.view', 'transactions.record', 'transactions.print_receipts', 'transactions.edit'],
      'claims': ['claims.view', 'claims.create', 'claims.upload_documents', 'claims.review', 'claims.approve'],
      'reports': ['reports.view', 'reports.generate', 'reports.monthly_performance', 'reports.export', 'reports.view_financial'],
      'sms': ['sms.view_history', 'sms.view_queue', 'sms.manage_templates', 'sms.send'],
      'users-rights': ['admin.manage_users', 'admin.create_groups', 'admin.assign_rights', 'admin.modify_rights'],
      'system': ['admin.system_settings', 'admin.multi_branch_access', 'audit.view_logs', 'audit.sync_status'],
      'audit-logs': ['audit.view_logs', 'audit.system_reports'],
    };

    const required = tabPermissions[currentTab];
    if (required && !hasAnyPermission(required)) {
      setCurrentTab('dashboard');
    }
  }, [isAuthenticated, user?.id, hasAnyPermission, currentTab]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-900">
        <RefreshCw className="w-8 h-8 text-blue-700 animate-spin mb-3" />
        <p className="text-sm font-semibold tracking-wider uppercase text-slate-900">Loading Turihamwe SACCO Core...</p>
        <p className="text-xs text-slate-500 mt-1">Verifying cryptographic session & offline journal</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <LoginForm onOpenSetupAdmin={() => setIsSetupAdminOpen(true)} />
        <SetupAdminModal
          isOpen={isSetupAdminOpen}
          onClose={() => setIsSetupAdminOpen(false)}
          onSuccess={() => {
            setIsSetupAdminOpen(false);
          }}
        />
      </>
    );
  }

  const renderActiveView = () => {
    switch (currentTab) {
      case 'dashboard':
        return <DashboardView onNavigate={(tab) => setCurrentTab(tab)} onAddNewMember={handleAddNewMember} />;
      case 'members':
        return (
          <MembersView
            initialOpenRegisterModal={openRegisterMemberModal}
            onRegisterModalClosed={() => setOpenRegisterMemberModal(false)}
          />
        );
      case 'turihamwe':
        return <TurihamweView />;
      case 'transactions':
        return <TransactionsView />;
      case 'claims':
        return <ClaimsView />;
      case 'reports':
        return <ReportsView />;
      case 'sms':
        return <SmsNotificationsView />;
      case 'users-rights':
        return <UsersAndRightsView />;
      case 'system':
      case 'audit-logs':
        return <SystemView />;
      default:
        return <DashboardView onNavigate={(tab) => setCurrentTab(tab)} onAddNewMember={handleAddNewMember} />;
    }
  };

  return (
    <AppLayout currentTab={currentTab} onSelectTab={setCurrentTab} onAddNewMember={handleAddNewMember}>
      {renderActiveView()}
    </AppLayout>
  );
};

export default function App() {
  if (new URLSearchParams(window.location.search).get('app') === 'turihamwe') {
    return (
      <AuthProvider>
        <SyncProvider>
          <MainApplication />
        </SyncProvider>
      </AuthProvider>
    );
  }

  return <UTubeWebsite />;
}
