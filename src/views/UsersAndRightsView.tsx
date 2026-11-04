import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { User, Role, PermissionDefinition, Branch, UserAuditHistory, PermissionCode } from '../types';
import { formatUgandaDateTime } from '../utils/timezone';
import {
  UserCog,
  Shield,
  KeyRound,
  UserCheck,
  CheckCircle,
  AlertCircle,
  Plus,
  RefreshCw,
  Building,
  Check,
  Search,
  X,
  Edit2,
  Lock,
  History,
  Trash2,
  Eye,
  EyeOff,
  Sparkles,
  ShieldAlert,
  ChevronRight,
  Filter,
  CheckSquare,
  Square
} from 'lucide-react';

export const UsersAndRightsView: React.FC = () => {
  const { user: currentUser, workingBranch, hasPermission } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'rights_matrix'>('users');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterRole, setFilterRole] = useState<string>('');
  const [filterBranch, setFilterBranch] = useState<string>('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals state
  const [showNewUserModal, setShowNewUserModal] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [managingRightsUser, setManagingRightsUser] = useState<User | null>(null);
  const [resettingPasswordUser, setResettingPasswordUser] = useState<User | null>(null);
  const [viewingActivityUser, setViewingActivityUser] = useState<User | null>(null);
  const [userActivityData, setUserActivityData] = useState<UserAuditHistory | null>(null);
  const [loadingActivity, setLoadingActivity] = useState<boolean>(false);
  const [showChangeOwnPasswordModal, setShowChangeOwnPasswordModal] = useState<boolean>(false);

  // Role management state
  const [showNewRoleModal, setShowNewRoleModal] = useState<boolean>(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  // Effective permissions inspector state
  const [inspectedUserId, setInspectedUserId] = useState<string>('');
  const [inspectedUserBreakdown, setInspectedUserBreakdown] = useState<{
    user: Partial<User>;
    rolePermissions: string[];
    directPermissions: string[];
    revokedPermissions: string[];
    effectivePermissions: string[];
  } | null>(null);

  // New user form state
  const [newUsername, setNewUsername] = useState<string>('');
  const [newFullName, setNewFullName] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');
  const [newPhone, setNewPhone] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [newRoleId, setNewRoleId] = useState<string>('');
  const [newPrimaryBranchId, setNewPrimaryBranchId] = useState<string>('');
  const [newHasMultiBranch, setNewHasMultiBranch] = useState<boolean>(false);
  const [newAllowedBranchIds, setNewAllowedBranchIds] = useState<string[]>([]);
  const [isSubmittingUser, setIsSubmittingUser] = useState<boolean>(false);
  const [newUserError, setNewUserError] = useState<string>('');

  // Rights management form state
  const [rightsRoleId, setRightsRoleId] = useState<string>('');
  const [rightsHasMultiBranch, setRightsHasMultiBranch] = useState<boolean>(false);
  const [rightsAllowedBranchIds, setRightsAllowedBranchIds] = useState<string[]>([]);
  const [rightsDirectPermissions, setRightsDirectPermissions] = useState<string[]>([]);
  const [rightsRevokedPermissions, setRightsRevokedPermissions] = useState<string[]>([]);
  const [rightsPermissionSearch, setRightsPermissionSearch] = useState<string>('');
  const [rightsSelectedCategory, setRightsSelectedCategory] = useState<string>('ALL');
  const [isSavingRights, setIsSavingRights] = useState<boolean>(false);

  // Edit user profile state
  const [editFullName, setEditFullName] = useState<string>('');
  const [editUsername, setEditUsername] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editPrimaryBranchId, setEditPrimaryBranchId] = useState<string>('');
  const [editPassword, setEditPassword] = useState<string>('');
  const [showEditPassword, setShowEditPassword] = useState<boolean>(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);
  const [editUserError, setEditUserError] = useState<string>('');

  // Password reset state
  const [adminResetNewPassword, setAdminResetNewPassword] = useState<string>('');
  const [showAdminResetPassword, setShowAdminResetPassword] = useState<boolean>(false);
  const [isResettingPassword, setIsResettingPassword] = useState<boolean>(false);

  // Delete user state
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>('');
  const [isDeletingUser, setIsDeletingUser] = useState<boolean>(false);

  // Self password change state
  const [ownCurrentPassword, setOwnCurrentPassword] = useState<string>('');
  const [ownNewPassword, setOwnNewPassword] = useState<string>('');
  const [ownConfirmPassword, setOwnConfirmPassword] = useState<string>('');
  const [isChangingOwnPassword, setIsChangingOwnPassword] = useState<boolean>(false);
  const [ownPasswordError, setOwnPasswordError] = useState<string>('');

  // Role form state
  const [roleFormName, setRoleFormName] = useState<string>('');
  const [roleFormCode, setRoleFormCode] = useState<string>('');
  const [roleFormDescription, setRoleFormDescription] = useState<string>('');
  const [roleFormPermissions, setRoleFormPermissions] = useState<string[]>([]);
  const [isSubmittingRole, setIsSubmittingRole] = useState<boolean>(false);
  const [roleFormError, setRoleFormError] = useState<string>('');

  const canManageUsers = hasPermission('admin.manage_users');
  const canAssignRights = hasPermission('admin.assign_rights');
  const canModifyRights = hasPermission('admin.modify_rights');
  const canCreateGroups = hasPermission('admin.create_groups');
  const canGrantMultiBranch = hasPermission('admin.multi_branch_access');
  const canViewAudit = hasPermission('audit.view_logs');
  const canAccessModule = canManageUsers || canAssignRights || canModifyRights || canCreateGroups || canViewAudit;

  const loadData = async () => {
    if (!canAccessModule) return;
    try {
      const [uRes, rRes, pRes, bRes] = await Promise.allSettled([
        apiClient.getUsers(),
        apiClient.getRoles(),
        apiClient.getPermissions(),
        apiClient.getBranches(),
      ]);

      if (uRes.status === 'fulfilled' && uRes.value.success) {
        setUsers(uRes.value.data);
      }
      if (rRes.status === 'fulfilled' && rRes.value.success) {
        setRoles(rRes.value.data);
      }
      if (pRes.status === 'fulfilled' && pRes.value.success) {
        setPermissions(pRes.value.data);
      }
      if (bRes.status === 'fulfilled' && bRes.value.success) {
        setBranches(bRes.value.data);
      }
    } catch (err) {
      console.error('Failed to load user administration data:', err);
    }
  };

  useEffect(() => {
    if (canAccessModule) {
      loadData();
    }
  }, [canAccessModule]);

  if (!canAccessModule) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-lg mx-auto shadow-xs mt-10">
        <Shield className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-1">
          Your account does not possess institutional permission to access User Administration & Rights Management.
        </p>
      </div>
    );
  }

  // Toggle user active status
  const handleToggleUserStatus = async (targetUser: User) => {
    if (!canManageUsers) return;
    if (targetUser.id === currentUser?.id) {
      setNotification({ type: 'error', message: 'You cannot deactivate your own user account.' });
      return;
    }
    try {
      const newStatus = !targetUser.isActive;
      const res = await apiClient.toggleUserStatus(targetUser.id, newStatus, `User ${newStatus ? 'activated' : 'deactivated'} by administrator`);
      if (res.success) {
        setUsers(prev => prev.map(u => (u.id === targetUser.id ? { ...u, isActive: newStatus } : u)));
        setNotification({
          type: 'success',
          message: `User @${targetUser.username} has been ${newStatus ? 'activated' : 'deactivated'}.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating user status';
      setNotification({ type: 'error', message: msg });
    }
  };

  // Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewUserError('');

    if (newUsername.trim().length < 4 || newUsername.trim().length > 10) {
      setNewUserError('Username rule: strictly between 4 and 10 characters.');
      return;
    }

    if (!newFullName.trim() || !newPassword || !newRoleId || !newPrimaryBranchId) {
      setNewUserError('Full name, password, role, and primary branch are mandatory.');
      return;
    }

    if (newPassword.length < 8) {
      setNewUserError('Password must be at least 8 characters long.');
      return;
    }

    setIsSubmittingUser(true);
    try {
      const res = await apiClient.createUser({
        username: newUsername.trim().toLowerCase(),
        fullName: newFullName.trim(),
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
        password: newPassword,
        roleId: newRoleId,
        primaryBranchId: newPrimaryBranchId,
        hasMultiBranchAccess: newHasMultiBranch,
        allowedBranchIds: newHasMultiBranch ? [newPrimaryBranchId, ...newAllowedBranchIds] : [newPrimaryBranchId],
      });

      if (res.success) {
        setUsers(prev => [res.data, ...prev]);
        setShowNewUserModal(false);
        setNewUsername('');
        setNewFullName('');
        setNewEmail('');
        setNewPhone('');
        setNewPassword('');
        setNewRoleId('');
        setNewPrimaryBranchId('');
        setNewHasMultiBranch(false);
        setNewAllowedBranchIds([]);
        setNotification({
          type: 'success',
          message: `Staff user @${res.data.username} successfully provisioned.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error provisioning user';
      setNewUserError(msg);
    } finally {
      setIsSubmittingUser(false);
    }
  };

  // Open Edit User Modal
  const openEditUser = (user: User) => {
    setEditingUser(user);
    setEditFullName(user.fullName);
    setEditUsername(user.username);
    setEditEmail(user.email || '');
    setEditPhone(user.phone || '');
    setEditPrimaryBranchId(user.primaryBranchId);
    setEditPassword('');
    setShowEditPassword(false);
    setEditUserError('');
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditUserError('');

    const cleanUsername = editUsername.trim().toLowerCase();
    if (cleanUsername.length < 4 || cleanUsername.length > 10) {
      setEditUserError('Username must be strictly between 4 and 10 characters.');
      return;
    }
    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      setEditUserError('Username may only contain lowercase letters, numbers, and underscores.');
      return;
    }

    if (editPassword && editPassword.length < 8) {
      setEditUserError('If changing password, it must be at least 8 characters long.');
      return;
    }

    setIsSubmittingEdit(true);
    try {
      const payload: {
        fullName: string;
        username: string;
        email: string;
        phone: string;
        primaryBranchId: string;
        password?: string;
      } = {
        fullName: editFullName.trim(),
        username: cleanUsername,
        email: editEmail.trim(),
        phone: editPhone.trim(),
        primaryBranchId: editPrimaryBranchId,
      };

      if (editPassword && editPassword.trim().length > 0) {
        payload.password = editPassword.trim();
      }

      const res = await apiClient.editUser(editingUser.id, payload);

      if (res.success) {
        setUsers(prev => prev.map(u => (u.id === editingUser.id ? res.data : u)));
        setEditingUser(null);
        setNotification({
          type: 'success',
          message: `Profile details for @${res.data.username} updated successfully.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating profile';
      setEditUserError(msg);
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Delete User Handler
  const handleDeleteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingUser) return;
    setIsDeletingUser(true);
    try {
      const res = await apiClient.deleteUser(deletingUser.id, deleteReason.trim());
      if (res.success) {
        setUsers(prev => prev.filter(u => u.id !== deletingUser.id));
        setNotification({
          type: 'success',
          message: res.message || `Staff account @${deletingUser.username} successfully deleted.`,
        });
        setDeletingUser(null);
        setDeleteReason('');
        await loadData();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete staff account';
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsDeletingUser(false);
    }
  };

  // Open Rights Management Modal
  const openRightsModal = (user: User) => {
    setManagingRightsUser(user);
    setRightsRoleId(user.roleId);
    setRightsHasMultiBranch(user.hasMultiBranchAccess || false);
    setRightsAllowedBranchIds(user.allowedBranchIds || [user.primaryBranchId]);
    setRightsDirectPermissions(user.directPermissions || []);
    setRightsRevokedPermissions(user.revokedPermissions || []);
    setRightsPermissionSearch('');
    setRightsSelectedCategory('ALL');
  };

  const handleSaveRights = async () => {
    if (!managingRightsUser) return;
    if (managingRightsUser.id === currentUser?.id) {
      setNotification({
        type: 'error',
        message: 'Security policy: users are strictly prohibited from modifying their own rights or permissions.',
      });
      return;
    }

    setIsSavingRights(true);
    try {
      const res = await apiClient.modifyUserRights(managingRightsUser.id, {
        roleId: rightsRoleId,
        hasMultiBranchAccess: rightsHasMultiBranch,
        allowedBranchIds: rightsHasMultiBranch ? rightsAllowedBranchIds : [managingRightsUser.primaryBranchId],
        directPermissions: rightsDirectPermissions,
        revokedPermissions: rightsRevokedPermissions,
        reason: 'Administrative rights adjustment',
      });

      if (res.success) {
        setUsers(prev => prev.map(u => (u.id === managingRightsUser.id ? res.data : u)));
        setManagingRightsUser(null);
        setNotification({
          type: 'success',
          message: `Security rights and branch access updated for @${managingRightsUser.username}.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving rights';
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsSavingRights(false);
    }
  };

  // Admin Reset Password
  const handleAdminResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingPasswordUser) return;
    if (adminResetNewPassword.length < 8) {
      setNotification({ type: 'error', message: 'Password must be at least 8 characters long.' });
      return;
    }

    setIsResettingPassword(true);
    try {
      const res = await apiClient.resetUserPassword(resettingPasswordUser.id, adminResetNewPassword);
      if (res.success) {
        setResettingPasswordUser(null);
        setAdminResetNewPassword('');
        setNotification({
          type: 'success',
          message: res.message || `Password reset for @${resettingPasswordUser.username}. User will be prompted to reset upon next login.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset password';
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsResettingPassword(false);
    }
  };

  // Self change password
  const handleOwnPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setOwnPasswordError('');

    if (!ownCurrentPassword || !ownNewPassword) {
      setOwnPasswordError('Please enter both current and new password.');
      return;
    }

    if (ownNewPassword.length < 8) {
      setOwnPasswordError('New password must be at least 8 characters long.');
      return;
    }

    if (ownNewPassword !== ownConfirmPassword) {
      setOwnPasswordError('New password and confirmation do not match.');
      return;
    }

    setIsChangingOwnPassword(true);
    try {
      const res = await apiClient.changePassword(ownCurrentPassword, ownNewPassword);
      if (res.success) {
        setShowChangeOwnPasswordModal(false);
        setOwnCurrentPassword('');
        setOwnNewPassword('');
        setOwnConfirmPassword('');
        setNotification({ type: 'success', message: 'Your password has been changed securely.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to change password';
      setOwnPasswordError(msg);
    } finally {
      setIsChangingOwnPassword(false);
    }
  };

  // View User Activity Drawer
  const openUserActivity = async (user: User) => {
    setViewingActivityUser(user);
    setLoadingActivity(true);
    try {
      const res = await apiClient.getUserActivity(user.id);
      if (res.success) {
        setUserActivityData(res.data);
      }
    } catch (err) {
      console.error('Failed to load user activity:', err);
    } finally {
      setLoadingActivity(false);
    }
  };

  // Inspect effective permissions
  const handleInspectUser = async (userId: string) => {
    setInspectedUserId(userId);
    if (!userId) {
      setInspectedUserBreakdown(null);
      return;
    }
    try {
      const res = await apiClient.getUserEffectivePermissions(userId);
      if (res.success) {
        setInspectedUserBreakdown(res.data);
      }
    } catch (err) {
      console.error('Failed to inspect effective permissions:', err);
    }
  };

  // Role creation
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoleFormError('');

    if (!roleFormName.trim() || !roleFormCode.trim()) {
      setRoleFormError('Role name and code are mandatory.');
      return;
    }

    setIsSubmittingRole(true);
    try {
      const res = await apiClient.createRole({
        name: roleFormName.trim(),
        code: roleFormCode.trim().toUpperCase(),
        description: roleFormDescription.trim(),
        permissions: roleFormPermissions,
      });

      if (res.success) {
        setRoles(prev => [...prev, res.data]);
        setShowNewRoleModal(false);
        setRoleFormName('');
        setRoleFormCode('');
        setRoleFormDescription('');
        setRoleFormPermissions([]);
        setNotification({ type: 'success', message: `Role '${res.data.name}' created successfully.` });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error creating role';
      setRoleFormError(msg);
    } finally {
      setIsSubmittingRole(false);
    }
  };

  // Open Edit Role
  const openEditRole = (role: Role) => {
    setEditingRole(role);
    setRoleFormName(role.name);
    setRoleFormCode(role.code);
    setRoleFormDescription(role.description);
    setRoleFormPermissions([...role.permissions]);
    setRoleFormError('');
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) return;

    setIsSubmittingRole(true);
    try {
      const res = await apiClient.updateRole(editingRole.id, {
        name: roleFormName.trim(),
        description: roleFormDescription.trim(),
        permissions: roleFormPermissions,
      });

      if (res.success) {
        setRoles(prev => prev.map(r => (r.id === editingRole.id ? res.data : r)));
        setEditingRole(null);
        setNotification({ type: 'success', message: `Role '${res.data.name}' updated successfully.` });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating role';
      setRoleFormError(msg);
    } finally {
      setIsSubmittingRole(false);
    }
  };

  // Delete Role
  const handleDeleteRole = async (roleId: string, roleName: string) => {
    if (!confirm(`Are you sure you want to permanently delete custom role '${roleName}'?`)) return;
    try {
      const res = await apiClient.deleteRole(roleId);
      if (res.success) {
        setRoles(prev => prev.filter(r => r.id !== roleId));
        setNotification({ type: 'success', message: `Role '${roleName}' has been deleted.` });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error deleting role';
      setNotification({ type: 'error', message: msg });
    }
  };

  // Filter users
  const filteredUsers = users.filter(u => {
    const matchesSearch =
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesRole = !filterRole || u.roleId === filterRole;
    const matchesBranch = !filterBranch || u.primaryBranchId === filterBranch;

    return matchesSearch && matchesRole && matchesBranch;
  });

  const categories = Array.from(new Set(permissions.map(p => p.category)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <UserCog className="w-5 h-5 text-blue-700" />
            Users, Groups & Security Administration
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Nyamuyanja SACCO Ltd • Multi-Branch RBAC • Strict Branch Isolation • Granular Rights Engine
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowChangeOwnPasswordModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-300 shadow-xs transition"
          >
            <Lock className="w-3.5 h-3.5 text-slate-600" />
            Change My Password
          </button>

          {canManageUsers && (
            <button
              onClick={() => setShowNewUserModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold shadow-xs transition"
            >
              <Plus className="w-4 h-4" />
              Provision New User
            </button>
          )}
        </div>
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

      {/* Tabs */}
      <div className="border-b border-slate-200 bg-white px-4 rounded-xl shadow-xs">
        <nav className="flex space-x-6 text-xs font-semibold py-2">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 border-b-2 transition ${
              activeTab === 'users' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Staff User Directory ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`py-2 border-b-2 transition ${
              activeTab === 'roles' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Functional Groups & Roles ({roles.length})
          </button>
          <button
            onClick={() => setActiveTab('rights_matrix')}
            className={`py-2 border-b-2 transition ${
              activeTab === 'rights_matrix' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Effective Permissions & Rights Matrix
          </button>
        </nav>
      </div>

      {/* TAB 1: USERS DIRECTORY */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Filter Bar */}
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative min-w-[220px]">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by username, name, or email..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
                />
              </div>

              <select
                value={filterRole}
                onChange={e => setFilterRole(e.target.value)}
                className="py-1.5 px-3 text-xs border border-slate-300 rounded-lg bg-white text-slate-800"
              >
                <option value="">All Roles ({roles.length})</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>

              <select
                value={filterBranch}
                onChange={e => setFilterBranch(e.target.value)}
                className="py-1.5 px-3 text-xs border border-slate-300 rounded-lg bg-white text-slate-800"
              >
                <option value="">All Branches ({branches.length})</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <span className="text-xs text-slate-500 font-mono">
              Username Rule: Strict 4–10 characters
            </span>
          </div>

          {/* User Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b uppercase">
                <tr>
                  <th className="px-6 py-3">Username</th>
                  <th className="px-6 py-3">Full Legal Name</th>
                  <th className="px-6 py-3">Assigned Role</th>
                  <th className="px-6 py-3">Primary Branch</th>
                  <th className="px-6 py-3">Branch Scope</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                      No staff accounts match your current filter parameters.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(user => {
                    const primaryBranch = branches.find(b => b.id === user.primaryBranchId);
                    const isSelf = user.id === currentUser?.id;

                    return (
                      <tr key={user.id} className="hover:bg-slate-50 transition">
                        <td className="px-6 py-3 font-mono font-bold text-blue-900">
                          {user.username}
                          {isSelf && (
                            <span className="ml-1.5 text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-sans">
                              You
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 font-semibold text-slate-900">
                          <div>{user.fullName}</div>
                          {user.email && <div className="text-[10px] text-slate-400 font-normal">{user.email}</div>}
                        </td>
                        <td className="px-6 py-3">
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-semibold">
                            {user.roleName || 'Assigned'}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-slate-700">
                          {primaryBranch?.name || user.primaryBranchId}
                        </td>
                        <td className="px-6 py-3">
                          {user.hasMultiBranchAccess ? (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Multi-Branch ({user.allowedBranchIds?.length || 6})
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500">Single Branch</span>
                          )}
                        </td>
                        <td className="px-6 py-3">
                          {user.isActive ? (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Active
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                              Deactivated
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Rights Editor */}
                            {(canAssignRights || canModifyRights) && (
                              <button
                                onClick={() => openRightsModal(user)}
                                title={isSelf ? 'Users cannot modify their own rights' : 'Configure permissions & branch access'}
                                className={`text-[11px] font-semibold px-2 py-1 rounded transition border ${
                                  isSelf
                                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                    : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                                }`}
                                disabled={isSelf}
                              >
                                Rights
                              </button>
                            )}

                            {/* Edit Profile */}
                            {canManageUsers && (
                              <button
                                onClick={() => openEditUser(user)}
                                title="Edit staff profile details"
                                className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Reset Password */}
                            {canManageUsers && (
                              <button
                                onClick={() => setResettingPasswordUser(user)}
                                title="Admin Reset Password"
                                className="p-1 rounded text-amber-600 hover:text-amber-800 hover:bg-amber-50 transition"
                              >
                                <Lock className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Activity History */}
                            {canViewAudit && (
                              <button
                                onClick={() => openUserActivity(user)}
                                title="View User Activity & Audit History"
                                className="p-1 rounded text-slate-500 hover:text-blue-700 hover:bg-slate-100 transition"
                              >
                                <History className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Enable/Disable Toggle */}
                            {canManageUsers && !isSelf && (
                              <button
                                onClick={() => handleToggleUserStatus(user)}
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded transition ${
                                  user.isActive
                                    ? 'text-amber-700 hover:bg-amber-50 border border-amber-200'
                                    : 'text-emerald-700 hover:bg-emerald-50 border border-emerald-200'
                                }`}
                              >
                                {user.isActive ? 'Disable' : 'Enable'}
                              </button>
                            )}

                            {/* Delete Staff Account */}
                            {canManageUsers && !isSelf && (
                              <button
                                onClick={() => {
                                  setDeletingUser(user);
                                  setDeleteReason('');
                                }}
                                disabled={user.username.toLowerCase() === 'ivan'}
                                title={user.username.toLowerCase() === 'ivan' ? 'Root IT Administrator cannot be deleted' : 'Delete staff account'}
                                className={`p-1 rounded transition ${
                                  user.username.toLowerCase() === 'ivan'
                                    ? 'text-slate-300 cursor-not-allowed'
                                    : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                }`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: FUNCTIONAL GROUPS & ROLES */}
      {activeTab === 'roles' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-600">
              Functional roles encapsulate standard operational rights. Roles cannot be hardcoded to job titles.
            </p>
            {canCreateGroups && (
              <button
                onClick={() => {
                  setRoleFormName('');
                  setRoleFormCode('');
                  setRoleFormDescription('');
                  setRoleFormPermissions([]);
                  setRoleFormError('');
                  setShowNewRoleModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg shadow-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Role / Group
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roles.map(role => {
              const assignedUserCount = users.filter(u => u.roleId === role.id).length;

              return (
                <div key={role.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        {role.name}
                        {role.isSystem && (
                          <span className="text-[9px] bg-slate-100 text-slate-700 font-semibold px-1.5 py-0.5 rounded border border-slate-200 uppercase font-sans">
                            System
                          </span>
                        )}
                      </h3>
                      <span className="font-mono text-[10px] text-blue-700 font-bold">{role.code}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      {(canCreateGroups || canModifyRights) && (
                        <button
                          onClick={() => openEditRole(role)}
                          className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                          title="Edit Role"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {!role.isSystem && canCreateGroups && (
                        <button
                          onClick={() => handleDeleteRole(role.id, role.name)}
                          className="p-1 rounded text-red-500 hover:text-red-700 hover:bg-red-50 transition"
                          title="Delete Custom Role"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">{role.description}</p>

                  <div className="pt-2 border-t flex items-center justify-between text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{role.permissions.length} Standard Rights</span>
                    <span>{assignedUserCount} User(s) Assigned</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: EFFECTIVE PERMISSIONS & MATRIX */}
      {activeTab === 'rights_matrix' && (
        <div className="space-y-6">
          {/* User Specific Effective Permissions Inspector */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase">
                  Effective Permissions Calculator
                </h3>
                <p className="text-[11px] text-slate-500">
                  Inspect exact calculated permissions for any staff user: (Base Role + Direct Grants - Direct Revocations)
                </p>
              </div>

              <select
                value={inspectedUserId}
                onChange={e => handleInspectUser(e.target.value)}
                className="py-1.5 px-3 text-xs border border-slate-300 rounded-lg bg-white text-slate-800"
              >
                <option value="">Select staff user to inspect...</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    @{u.username} — {u.fullName} ({u.roleName})
                  </option>
                ))}
              </select>
            </div>

            {inspectedUserBreakdown && (
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="font-semibold text-slate-800">
                    Inspecting: <span className="text-blue-700 font-bold">{inspectedUserBreakdown.user.fullName}</span> (@{inspectedUserBreakdown.user.username})
                  </div>
                  <div className="text-slate-600">
                    Role: <span className="font-bold">{inspectedUserBreakdown.user.roleName}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-[11px]">
                  <div className="bg-white p-3 rounded border border-slate-200">
                    <span className="font-bold text-slate-700 block">Base Role Rights</span>
                    <span className="text-lg font-bold text-slate-900">{inspectedUserBreakdown.rolePermissions.length}</span>
                  </div>
                  <div className="bg-white p-3 rounded border border-emerald-200">
                    <span className="font-bold text-emerald-700 block">+ Direct User Grants</span>
                    <span className="text-lg font-bold text-emerald-700">{inspectedUserBreakdown.directPermissions.length}</span>
                  </div>
                  <div className="bg-white p-3 rounded border border-red-200">
                    <span className="font-bold text-red-700 block">- Direct Revocations</span>
                    <span className="text-lg font-bold text-red-700">{inspectedUserBreakdown.revokedPermissions.length}</span>
                  </div>
                  <div className="bg-white p-3 rounded border border-blue-200 bg-blue-50/30">
                    <span className="font-bold text-blue-800 block">= Effective Rights</span>
                    <span className="text-lg font-bold text-blue-900">{inspectedUserBreakdown.effectivePermissions.length}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="font-semibold text-slate-700 block mb-1">Effective Permission Codes:</span>
                  <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto p-2 bg-white rounded border border-slate-200">
                    {inspectedUserBreakdown.effectivePermissions.map(code => (
                      <span key={code} className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 text-[10px] font-mono font-medium border border-blue-200">
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Canonical Permissions Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 uppercase">
                Canonical Institutional Rights Catalog ({permissions.length} Granular Permissions)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b uppercase">
                  <tr>
                    <th className="px-6 py-3">Permission Code</th>
                    <th className="px-6 py-3">Category</th>
                    <th className="px-6 py-3">Display Name</th>
                    <th className="px-6 py-3">Functional Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {permissions.map(perm => (
                    <tr key={perm.code} className="hover:bg-slate-50">
                      <td className="px-6 py-3 font-mono font-semibold text-blue-900">{perm.code}</td>
                      <td className="px-6 py-3 font-semibold text-slate-800">{perm.category}</td>
                      <td className="px-6 py-3 font-medium text-slate-900">{perm.name}</td>
                      <td className="px-6 py-3 text-slate-600">{perm.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: RIGHTS & ACCESS MANAGEMENT                         */}
      {/* ========================================================= */}
      {managingRightsUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-slate-50 text-slate-900 border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Manage Rights & Branch Authorization: {managingRightsUser.fullName}
                </h3>
                <p className="text-[11px] text-blue-700 font-mono">
                  @{managingRightsUser.username} • Primary Branch: {branches.find(b => b.id === managingRightsUser.primaryBranchId)?.name}
                </p>
              </div>
              <button
                onClick={() => setManagingRightsUser(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto text-xs flex-1">
              {/* Role selection */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Assigned Functional Role / Group *
                </label>
                <select
                  value={rightsRoleId}
                  onChange={e => setRightsRoleId(e.target.value)}
                  className="w-full py-2 px-3 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
                >
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code}) — {r.permissions.length} standard rights
                    </option>
                  ))}
                </select>
              </div>

              {/* Multi-Branch Configuration */}
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-900 block">Multi-Branch Access Authorization</span>
                    <span className="text-[11px] text-slate-500">
                      Permits user to work across multiple designated SACCO branches.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={rightsHasMultiBranch}
                    disabled={!canGrantMultiBranch}
                    onChange={e => setRightsHasMultiBranch(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                </div>

                {rightsHasMultiBranch && (
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <span className="font-medium text-slate-700 block text-[11px]">
                      Select Authorized Operating Branches:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {branches.map(b => {
                        const isPrimary = b.id === managingRightsUser.primaryBranchId;
                        const isChecked = isPrimary || rightsAllowedBranchIds.includes(b.id);

                        return (
                          <label key={b.id} className="flex items-center gap-2 p-2 bg-white rounded border border-slate-200 text-xs">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isPrimary}
                              onChange={e => {
                                if (e.target.checked) {
                                  setRightsAllowedBranchIds(prev => [...prev, b.id]);
                                } else {
                                  setRightsAllowedBranchIds(prev => prev.filter(id => id !== b.id));
                                }
                              }}
                              className="w-3.5 h-3.5 text-blue-600 rounded"
                            />
                            <span className="text-slate-800">
                              {b.name} {isPrimary && '(Primary)'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Granular Direct Overrides */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 uppercase">
                    Granular User Rights Overrides
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Explicit direct grants take precedence over role defaults.
                  </span>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={rightsPermissionSearch}
                    onChange={e => setRightsPermissionSearch(e.target.value)}
                    placeholder="Search permissions..."
                    className="flex-1 py-1.5 px-3 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                  <select
                    value={rightsSelectedCategory}
                    onChange={e => setRightsSelectedCategory(e.target.value)}
                    className="py-1.5 px-3 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="ALL">All Categories</option>
                    {categories.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Permissions List */}
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {permissions
                    .filter(p => {
                      const matchSearch =
                        p.code.toLowerCase().includes(rightsPermissionSearch.toLowerCase()) ||
                        p.name.toLowerCase().includes(rightsPermissionSearch.toLowerCase());
                      const matchCat = rightsSelectedCategory === 'ALL' || p.category === rightsSelectedCategory;
                      return matchSearch && matchCat;
                    })
                    .map(perm => {
                      const currentRole = roles.find(r => r.id === rightsRoleId);
                      const isInheritedFromRole = currentRole?.permissions.includes(perm.code as PermissionCode);
                      const isDirectGranted = rightsDirectPermissions.includes(perm.code);
                      const isRevoked = rightsRevokedPermissions.includes(perm.code);

                      return (
                        <div key={perm.code} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                          <div>
                            <div className="font-medium text-slate-900 flex items-center gap-1.5">
                              <span>{perm.name}</span>
                              <span className="text-[10px] text-blue-700 font-mono">({perm.code})</span>
                            </div>
                            <div className="text-[11px] text-slate-500">{perm.description}</div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isInheritedFromRole ? (
                              isRevoked ? (
                                <button
                                  onClick={() => setRightsRevokedPermissions(prev => prev.filter(c => c !== perm.code))}
                                  className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-semibold"
                                  title="Currently Revoked. Click to restore role default."
                                >
                                  Revoked (Click to unrevoke)
                                </button>
                              ) : (
                                <button
                                  onClick={() => setRightsRevokedPermissions(prev => [...prev, perm.code])}
                                  className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-700 text-[10px] font-semibold border border-slate-200"
                                  title="Inherited from role. Click to explicitly revoke."
                                >
                                  Inherited (Click to revoke)
                                </button>
                              )
                            ) : isDirectGranted ? (
                              <button
                                onClick={() => setRightsDirectPermissions(prev => prev.filter(c => c !== perm.code))}
                                className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold"
                                title="Explicitly granted. Click to remove grant."
                              >
                                Granted (Click to remove)
                              </button>
                            ) : (
                              <button
                                onClick={() => setRightsDirectPermissions(prev => [...prev, perm.code])}
                                className="px-2 py-0.5 rounded bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 text-[10px] font-semibold border border-slate-200"
                                title="Click to grant this permission explicitly"
                              >
                                + Grant
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500">
                Audit entry will record all permission differences and context.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setManagingRightsUser(null)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg border border-slate-300 transition text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRights}
                  disabled={isSavingRights}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg shadow-xs transition text-xs flex items-center gap-1.5"
                >
                  {isSavingRights ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save Security Rights
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: PROVISION NEW USER                                 */}
      {/* ========================================================= */}
      {showNewUserModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 text-slate-900 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Provision New Staff User</h3>
                <p className="text-[11px] text-slate-500">Strict 4–10 character username • Hashed password</p>
              </div>
              <button
                onClick={() => setShowNewUserModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4 text-xs">
              {newUserError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{newUserError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Username (4–10 chars) *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={4}
                    maxLength={10}
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    placeholder="e.g. bmkag"
                    className="w-full py-1.5 px-3 border border-slate-300 rounded-lg font-mono uppercase bg-white text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Initial Password (min 8 chars) *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Full Legal Staff Name *
                </label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={e => setNewFullName(e.target.value)}
                  placeholder="e.g. Tumusiime Ronald"
                  className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="name@nyamuyanja.sacco"
                    className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Telephone Number</label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="+2567..."
                    className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Functional Role *</label>
                  <select
                    required
                    value={newRoleId}
                    onChange={e => setNewRoleId(e.target.value)}
                    className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900"
                  >
                    <option value="">Select Role...</option>
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Primary Operating Branch *</label>
                  <select
                    required
                    value={newPrimaryBranchId}
                    onChange={e => setNewPrimaryBranchId(e.target.value)}
                    className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900"
                  >
                    <option value="">Select Branch...</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={newHasMultiBranch}
                    disabled={!canGrantMultiBranch}
                    onChange={e => setNewHasMultiBranch(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span>Authorize Multi-Branch Operations</span>
                </label>
                <p className="text-[11px] text-slate-500">
                  Allows user to switch and operate across multiple assigned SACCO branches.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowNewUserModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUser}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5"
                >
                  {isSubmittingUser && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Provision Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: EDIT USER PROFILE                                  */}
      {/* ========================================================= */}
      {editingUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 text-slate-900 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Edit Staff Account: @{editingUser.username}</h3>
                <p className="text-[11px] text-slate-500">Update username, staff credentials, contact details, and branch</p>
              </div>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="p-6 space-y-4 text-xs">
              {editUserError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{editUserError}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Username * <span className="text-slate-400 font-normal">(4–10 chars, lowercase alphanumeric)</span>
                </label>
                <input
                  type="text"
                  required
                  minLength={4}
                  maxLength={10}
                  value={editUsername}
                  onChange={e => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900 font-mono"
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">Used for staff login. Strictly 4 to 10 characters.</span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Legal Name *</label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={e => setEditFullName(e.target.value)}
                  className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Telephone Number</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Primary Branch</label>
                <select
                  value={editPrimaryBranchId}
                  onChange={e => setEditPrimaryBranchId(e.target.value)}
                  className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900"
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="block font-semibold text-slate-700 mb-1">
                  Change Password <span className="text-slate-400 font-normal">(Optional, min 8 characters)</span>
                </label>
                <div className="relative">
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    value={editPassword}
                    onChange={e => setEditPassword(e.target.value)}
                    placeholder="Leave blank to keep existing password"
                    className="w-full py-1.5 pl-3 pr-9 border border-slate-300 rounded-lg bg-white text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showEditPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5"
                >
                  {isSubmittingEdit && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADMIN RESET PASSWORD                               */}
      {/* ========================================================= */}
      {resettingPasswordUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 text-slate-900 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Reset Password</h3>
                <p className="text-[11px] text-slate-500">For @{resettingPasswordUser.username} ({resettingPasswordUser.fullName})</p>
              </div>
              <button onClick={() => setResettingPasswordUser(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdminResetPassword} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">New Temporary Password *</label>
                <div className="relative">
                  <input
                    type={showAdminResetPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={adminResetNewPassword}
                    onChange={e => setAdminResetNewPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full py-1.5 pl-3 pr-9 border border-slate-300 rounded-lg bg-white text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminResetPassword(!showAdminResetPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showAdminResetPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-slate-500">Min 8 characters. Marked for reset.</span>
                  <button
                    type="button"
                    onClick={() => {
                      const randArray = new Uint32Array(1);
                      if (typeof window !== 'undefined' && window.crypto) {
                        window.crypto.getRandomValues(randArray);
                      } else {
                        randArray[0] = Math.floor(Math.random() * 1000000);
                      }
                      const randDigits = 1000 + (randArray[0] % 9000);
                      setAdminResetNewPassword(`Staff@${randDigits}!`);
                      setShowAdminResetPassword(true);
                    }}
                    className="text-[11px] text-blue-700 hover:text-blue-900 font-medium flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3 text-blue-600" />
                    Auto-generate
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setResettingPasswordUser(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResettingPassword}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5"
                >
                  {isResettingPassword && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Confirm Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: DELETE STAFF ACCOUNT                               */}
      {/* ========================================================= */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-red-200 overflow-hidden">
            <div className="bg-red-50 text-red-900 border-b border-red-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-100 border border-red-200 flex items-center justify-center text-red-700">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-red-900">Delete Staff Account</h3>
                  <p className="text-[11px] text-red-600">Irreversible user account de-provisioning</p>
                </div>
              </div>
              <button onClick={() => setDeletingUser(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDeleteUser} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Staff Member:</span>
                  <span className="font-semibold text-slate-900">{deletingUser.fullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Username:</span>
                  <span className="font-mono text-slate-800 font-semibold">@{deletingUser.username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Role:</span>
                  <span className="text-slate-800">{deletingUser.roleName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Branch:</span>
                  <span className="text-slate-800">
                    {branches.find(b => b.id === deletingUser.primaryBranchId)?.name || deletingUser.primaryBranchId}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] leading-relaxed">
                <span className="font-bold block mb-0.5">Notice on Statutory Audit Preservation:</span>
                Deleting this staff account permanently revokes application access. However, all immutable historical audit trail logs, transactions, and documents authored by this staff member will remain preserved in accordance with SACCO regulatory policy.
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Reason for Account Deletion <span className="text-slate-400 font-normal">(Recorded in central audit trail)</span>
                </label>
                <textarea
                  rows={2}
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                  placeholder="e.g., Staff departure from organization, user role retired"
                  className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setDeletingUser(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeletingUser}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5"
                >
                  {isDeletingUser && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Confirm Permanent Deletion
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: SELF PASSWORD CHANGE                               */}
      {/* ========================================================= */}
      {showChangeOwnPasswordModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 text-slate-900 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Change Your Password</h3>
                <p className="text-[11px] text-slate-500">Security requirement: minimum 8 characters</p>
              </div>
              <button onClick={() => setShowChangeOwnPasswordModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOwnPasswordChange} className="p-6 space-y-4 text-xs">
              {ownPasswordError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-800 text-xs">
                  {ownPasswordError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Current Password *</label>
                <input
                  type="password"
                  required
                  value={ownCurrentPassword}
                  onChange={e => setOwnCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">New Password *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={ownNewPassword}
                  onChange={e => setOwnNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Confirm New Password *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={ownConfirmPassword}
                  onChange={e => setOwnConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowChangeOwnPasswordModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isChangingOwnPassword}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5"
                >
                  {isChangingOwnPassword && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DRAWER: USER ACTIVITY & AUDIT HISTORY                     */}
      {/* ========================================================= */}
      {viewingActivityUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-end">
          <div className="bg-white max-w-xl w-full h-full shadow-2xl border-l border-slate-200 flex flex-col">
            <div className="bg-slate-50 text-slate-900 border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  User Audit Trail: {viewingActivityUser.fullName}
                </h3>
                <p className="text-[11px] text-blue-700 font-mono">
                  @{viewingActivityUser.username} • Role: {viewingActivityUser.roleName}
                </p>
              </div>
              <button
                onClick={() => {
                  setViewingActivityUser(null);
                  setUserActivityData(null);
                }}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              {loadingActivity ? (
                <div className="text-center py-10 text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                  Loading activity trail...
                </div>
              ) : userActivityData ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50 rounded border border-slate-200">
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Total Actions Logged</span>
                      <span className="text-lg font-bold text-slate-900">{userActivityData.activityLogs.length}</span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded border border-slate-200">
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Permission Changes</span>
                      <span className="text-lg font-bold text-blue-800">{userActivityData.permissionChangeHistory.length}</span>
                    </div>
                  </div>

                  <h4 className="font-bold text-slate-900 uppercase text-xs pt-2">Recent Operations & Events</h4>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                    {userActivityData.activityLogs.length === 0 ? (
                      <div className="p-4 text-center text-slate-400">No recorded audit actions for this user.</div>
                    ) : (
                      userActivityData.activityLogs.map(log => (
                        <div key={log.id} className="p-3 hover:bg-slate-50 text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-[10px] font-bold text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                              {log.action}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {formatUgandaDateTime(log.timestamp)}
                            </span>
                          </div>
                          <div className="font-medium text-slate-800">{log.newValue || log.reason || 'Operational action'}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Branch: {log.branchName} • Type: {log.recordType} {log.recordId ? `• Ref: ${log.recordId}` : ''}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center text-slate-500 py-6">Could not load activity records.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CREATE / EDIT ROLE                                 */}
      {/* ========================================================= */}
      {(showNewRoleModal || editingRole) && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-slate-50 text-slate-900 border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {editingRole ? `Edit Role: ${editingRole.name}` : 'Create Functional Group / Role'}
                </h3>
                <p className="text-[11px] text-slate-500">Configure permission bundle for this institutional role</p>
              </div>
              <button
                onClick={() => {
                  setShowNewRoleModal(false);
                  setEditingRole(null);
                }}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={editingRole ? handleUpdateRole : handleCreateRole} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
              {roleFormError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800 text-xs">
                  {roleFormError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Role Name *</label>
                  <input
                    type="text"
                    required
                    value={roleFormName}
                    disabled={editingRole?.isSystem}
                    onChange={e => setRoleFormName(e.target.value)}
                    placeholder="e.g. Accounts Supervisor"
                    className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Role Code *</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingRole}
                    value={roleFormCode}
                    onChange={e => setRoleFormCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                    placeholder="e.g. ACCOUNTS_SUP"
                    className="w-full py-1.5 px-3 border border-slate-300 rounded-lg font-mono bg-white text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Role Description</label>
                <textarea
                  rows={2}
                  value={roleFormDescription}
                  onChange={e => setRoleFormDescription(e.target.value)}
                  placeholder="Outline the operational responsibilities of this group..."
                  className="w-full py-1.5 px-3 border border-slate-300 rounded-lg bg-white text-slate-900"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900 block">
                    Assigned Rights ({roleFormPermissions.length} selected)
                  </span>
                  <div className="space-x-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setRoleFormPermissions(permissions.map(p => p.code))}
                      className="text-blue-700 hover:underline"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoleFormPermissions([])}
                      className="text-slate-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {permissions.map(perm => {
                    const isChecked = roleFormPermissions.includes(perm.code);

                    return (
                      <label key={perm.code} className="p-2.5 flex items-center justify-between hover:bg-slate-50 cursor-pointer">
                        <div>
                          <div className="font-medium text-slate-900 flex items-center gap-1.5">
                            <span>{perm.name}</span>
                            <span className="text-[10px] text-blue-700 font-mono">({perm.code})</span>
                          </div>
                          <div className="text-[11px] text-slate-500">{perm.description}</div>
                        </div>

                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              setRoleFormPermissions(prev => [...prev, perm.code]);
                            } else {
                              setRoleFormPermissions(prev => prev.filter(c => c !== perm.code));
                            }
                          }}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewRoleModal(false);
                    setEditingRole(null);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRole}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5"
                >
                  {isSubmittingRole && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {editingRole ? 'Update Role' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
