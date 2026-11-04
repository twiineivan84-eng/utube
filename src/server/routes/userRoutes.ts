import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth, requirePermission, requireAnyPermission, AuthenticatedRequest } from '../middleware/auth';
import { serverStore } from '../storage/serverStore';
import { AuthService } from '../services/authService';
import { AuditService } from '../services/auditService';
import { User, Role, PermissionCode } from '../../types';

export const userRouter = Router();

// ==========================================
// USER LIST & ROLE QUERIES
// ==========================================

// Get users list (accessible to any user authorized to manage users, assign/modify rights, configure system, or audit)
userRouter.get(
  '/',
  requireAuth,
  requireAnyPermission(
    'admin.manage_users',
    'admin.assign_rights',
    'admin.modify_rights',
    'admin.create_groups',
    'admin.system_settings',
    'audit.view_logs',
    'audit.system_reports'
  ),
  (_req: AuthenticatedRequest, res: Response) => {
    const users = serverStore.getUsers().map(u => ({
      ...u,
      passwordHash: undefined,
    }));

    res.json({ success: true, data: users });
  }
);

// Get roles
userRouter.get('/roles', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  const roles = serverStore.getRoles();
  res.json({ success: true, data: roles });
});

// Create new role / user group
userRouter.post(
  '/roles',
  requireAuth,
  requirePermission('admin.create_groups'),
  (req: AuthenticatedRequest, res: Response) => {
    const { name, code, description, permissions } = req.body;

    if (!name || !code) {
      res.status(400).json({ success: false, message: 'Role name and role code are required.' });
      return;
    }

    const cleanCode = code.trim().toUpperCase().replace(/\s+/g, '_');
    const existing = serverStore.getRoles().find(r => r.code === cleanCode);
    if (existing) {
      res.status(400).json({ success: false, message: `Role code '${cleanCode}' is already in use.` });
      return;
    }

    const newRole: Role = {
      id: `role-${Date.now()}`,
      name: name.trim(),
      code: cleanCode,
      description: description?.trim() || '',
      isSystem: false,
      permissions: Array.isArray(permissions) ? permissions : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    serverStore.addRole(newRole);

    AuditService.log({
      userId: req.user!.id,
      username: req.user!.username,
      userFullName: req.user!.fullName,
      branchId: req.workingBranch!.id,
      branchName: req.workingBranch!.name,
      action: 'ROLE_CREATED',
      recordType: 'PERMISSIONS',
      recordId: newRole.id,
      newValue: `Created functional group/role: ${newRole.name} (${newRole.code}) with ${newRole.permissions.length} permissions`,
    });

    res.json({ success: true, data: newRole });
  }
);

// Update existing role / user group
userRouter.put(
  '/roles/:id',
  requireAuth,
  requireAnyPermission('admin.create_groups', 'admin.modify_rights'),
  (req: AuthenticatedRequest, res: Response) => {
    const roleId = req.params.id;
    const targetRole = serverStore.getRoleById(roleId);
    if (!targetRole) {
      res.status(404).json({ success: false, message: 'Target role not found.' });
      return;
    }

    const { name, description, permissions } = req.body;

    const previousPermissions = [...targetRole.permissions];
    const updates: Partial<Role> = {};

    if (name && !targetRole.isSystem) updates.name = name.trim();
    if (description !== undefined) updates.description = description.trim();
    if (Array.isArray(permissions)) {
      // General Manager system role must retain full permissions
      if (targetRole.code === 'GM') {
        updates.permissions = serverStore.getPermissions().map(p => p.code);
      } else {
        updates.permissions = permissions;
      }
    }

    const updated = serverStore.updateRole(roleId, updates);

    AuditService.log({
      userId: req.user!.id,
      username: req.user!.username,
      userFullName: req.user!.fullName,
      branchId: req.workingBranch!.id,
      branchName: req.workingBranch!.name,
      action: 'ROLE_MODIFIED',
      recordType: 'PERMISSIONS',
      recordId: targetRole.id,
      previousValue: JSON.stringify({ name: targetRole.name, permissions: previousPermissions }),
      newValue: JSON.stringify({ name: updated?.name, permissions: updated?.permissions }),
      reason: req.body.reason || 'Institutional group/role definition updated',
    });

    res.json({ success: true, data: updated });
  }
);

// Delete custom role / group
userRouter.delete(
  '/roles/:id',
  requireAuth,
  requirePermission('admin.create_groups'),
  (req: AuthenticatedRequest, res: Response) => {
    const roleId = req.params.id;
    const result = serverStore.deleteRole(roleId);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    AuditService.log({
      userId: req.user!.id,
      username: req.user!.username,
      userFullName: req.user!.fullName,
      branchId: req.workingBranch!.id,
      branchName: req.workingBranch!.name,
      action: 'ROLE_DELETED',
      recordType: 'PERMISSIONS',
      recordId: roleId,
      newValue: `Custom role ID '${roleId}' permanently deleted.`,
    });

    res.json({ success: true, message: 'Role deleted successfully.' });
  }
);

// Get all system permissions definitions
userRouter.get('/permissions', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  const permissions = serverStore.getPermissions();
  res.json({ success: true, data: permissions });
});

// Self-service password change
userRouter.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, message: 'Current password and new password are required.' });
      return;
    }

    const result = await AuthService.changePassword({
      userId: req.user!.id,
      currentPassword,
      newPassword,
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
    });

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ success: false, message: 'An internal error occurred while changing password.' });
  }
});

// ==========================================
// USER PROVISIONING & MANAGEMENT
// ==========================================

// Create new user
userRouter.post('/', requireAuth, requirePermission('admin.manage_users'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      username,
      fullName,
      email,
      phone,
      password,
      roleId,
      primaryBranchId,
      hasMultiBranchAccess,
      allowedBranchIds,
    } = req.body;

    // Validate username rules (strictly 4 to 10 chars)
    if (!username || username.trim().length < 4 || username.trim().length > 10) {
      res.status(400).json({
        success: false,
        message: 'Username must be strictly between 4 and 10 characters.',
      });
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    const existing = serverStore.getUserByUsername(cleanUsername);
    if (existing) {
      res.status(400).json({
        success: false,
        message: `Username '${cleanUsername}' already exists.`,
      });
      return;
    }

    if (!roleId || !primaryBranchId || !fullName || !password) {
      res.status(400).json({
        success: false,
        message: 'Full name, password, role, and primary branch are mandatory.',
      });
      return;
    }

    // Password complexity check
    if (password.length < 8) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long.',
      });
      return;
    }

    const role = serverStore.getRoleById(roleId);
    if (!role) {
      res.status(400).json({ success: false, message: 'Specified role is invalid.' });
      return;
    }

    const branch = serverStore.getBranchById(primaryBranchId);
    if (!branch) {
      res.status(400).json({ success: false, message: 'Primary branch is invalid.' });
      return;
    }

    // Only administrators with multi_branch_access grant can assign multi_branch_access
    if (hasMultiBranchAccess && !req.effectivePermissions?.includes('admin.multi_branch_access')) {
      res.status(403).json({
        success: false,
        message: 'You lack authority to allocate multi-branch access privileges.',
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser: User = {
      id: `usr-${Date.now()}`,
      username: cleanUsername,
      fullName: fullName.trim(),
      email: email?.trim(),
      phone: phone?.trim(),
      passwordHash,
      roleId: role.id,
      roleName: role.name,
      primaryBranchId: branch.id,
      allowedBranchIds: hasMultiBranchAccess ? (allowedBranchIds || [branch.id]) : [branch.id],
      hasMultiBranchAccess: !!hasMultiBranchAccess,
      isActive: true,
      requiresPasswordReset: false,
      directPermissions: [],
      revokedPermissions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    serverStore.addUser(newUser);

    AuditService.log({
      userId: req.user!.id,
      username: req.user!.username,
      userFullName: req.user!.fullName,
      branchId: req.workingBranch!.id,
      branchName: req.workingBranch!.name,
      action: 'USER_CREATED',
      recordType: 'USERS',
      recordId: newUser.id,
      newValue: `Created user ${newUser.username} (${newUser.fullName}) with role ${role.name}, primary branch ${branch.name}`,
    });

    res.json({
      success: true,
      data: { ...newUser, passwordHash: undefined },
    });
  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).json({ success: false, message: 'Failed to create user.' });
  }
});

// Get user profile details
userRouter.get('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = serverStore.getUserById(req.params.id);
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found.' });
    return;
  }

  res.json({
    success: true,
    data: { ...user, passwordHash: undefined },
  });
});

// Edit user profile details (fullName, username, email, phone, primaryBranchId, optional password)
userRouter.put('/:id', requireAuth, requirePermission('admin.manage_users'), async (req: AuthenticatedRequest, res: Response) => {
  const targetUser = serverStore.getUserById(req.params.id);
  if (!targetUser) {
    res.status(404).json({ success: false, message: 'Target user not found.' });
    return;
  }

  const { fullName, username, email, phone, primaryBranchId, password } = req.body;
  const updates: Partial<User> = {};

  if (fullName) updates.fullName = fullName.trim();
  if (email !== undefined) updates.email = email.trim();
  if (phone !== undefined) updates.phone = phone.trim();

  // Username validation if updated
  if (username && username.trim().toLowerCase() !== targetUser.username.toLowerCase()) {
    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 4 || cleanUsername.length > 10) {
      res.status(400).json({
        success: false,
        message: 'Username must be strictly between 4 and 10 characters.',
      });
      return;
    }
    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      res.status(400).json({
        success: false,
        message: 'Username may only contain letters, numbers, and underscores.',
      });
      return;
    }

    const existing = serverStore.getUserByUsername(cleanUsername);
    if (existing && existing.id !== targetUser.id) {
      res.status(400).json({
        success: false,
        message: `Username '${cleanUsername}' is already assigned to another staff member.`,
      });
      return;
    }
    updates.username = cleanUsername;
  }

  if (primaryBranchId && primaryBranchId !== targetUser.primaryBranchId) {
    const branch = serverStore.getBranchById(primaryBranchId);
    if (!branch) {
      res.status(400).json({ success: false, message: 'Invalid primary branch selected.' });
      return;
    }
    updates.primaryBranchId = branch.id;
  }

  if (password && typeof password === 'string' && password.trim().length > 0) {
    if (password.length < 8) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long.',
      });
      return;
    }
    updates.passwordHash = await bcrypt.hash(password, 10);
    updates.requiresPasswordReset = false;
  }

  const previousSummary = JSON.stringify({
    fullName: targetUser.fullName,
    username: targetUser.username,
    email: targetUser.email,
    phone: targetUser.phone,
    primaryBranchId: targetUser.primaryBranchId,
  });

  const updated = serverStore.updateUser(targetUser.id, updates);

  const auditUpdates = { ...updates };
  if (auditUpdates.passwordHash) {
    delete auditUpdates.passwordHash;
    (auditUpdates as any).passwordUpdated = true;
  }

  AuditService.log({
    userId: req.user!.id,
    username: req.user!.username,
    userFullName: req.user!.fullName,
    branchId: req.workingBranch!.id,
    branchName: req.workingBranch!.name,
    action: 'USER_UPDATED',
    recordType: 'USERS',
    recordId: targetUser.id,
    previousValue: previousSummary,
    newValue: JSON.stringify(auditUpdates),
    reason: req.body.reason || 'Staff profile information updated',
  });

  res.json({
    success: true,
    data: { ...updated, passwordHash: undefined },
  });
});

// Delete staff user account
userRouter.delete(
  '/:id',
  requireAuth,
  requirePermission('admin.manage_users'),
  (req: AuthenticatedRequest, res: Response) => {
    const targetUserId = req.params.id;
    const targetUser = serverStore.getUserById(targetUserId);

    if (!targetUser) {
      res.status(404).json({ success: false, message: 'Staff user not found.' });
      return;
    }

    // Enforce self-deletion prevention
    if (req.user?.id === targetUser.id) {
      res.status(403).json({
        success: false,
        message: 'Institutional security policy: You cannot delete your own administrative account.',
      });
      return;
    }

    const { reason } = req.body || {};

    const result = serverStore.deleteUser(targetUserId);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    AuditService.log({
      userId: req.user!.id,
      username: req.user!.username,
      userFullName: req.user!.fullName,
      branchId: req.workingBranch!.id,
      branchName: req.workingBranch!.name,
      action: 'USER_DELETED',
      recordType: 'USERS',
      recordId: targetUser.id,
      previousValue: JSON.stringify({
        id: targetUser.id,
        username: targetUser.username,
        fullName: targetUser.fullName,
        roleName: targetUser.roleName,
        branchId: targetUser.primaryBranchId,
      }),
      newValue: 'ACCOUNT_DELETED',
      reason: reason || `Staff account for ${targetUser.fullName} (@${targetUser.username}) deleted by administrator`,
    });

    res.json(result);
  }
);

// Modify user permissions / rights / branch assignment
// CRITICAL SECURITY RULE: Ordinary users CANNOT modify their own permissions!
userRouter.put('/:id/rights', requireAuth, requireAnyPermission('admin.assign_rights', 'admin.modify_rights'), (req: AuthenticatedRequest, res: Response) => {
  const targetUser = serverStore.getUserById(req.params.id);
  if (!targetUser) {
    res.status(404).json({ success: false, message: 'Target user not found.' });
    return;
  }

  // Enforce self-modification block
  if (req.user?.id === targetUser.id) {
    res.status(403).json({
      success: false,
      message: 'Institutional security rule: Users are strictly forbidden from altering their own permissions, roles, or branch authorization.',
    });
    return;
  }

  const { directPermissions, revokedPermissions, roleId, allowedBranchIds, hasMultiBranchAccess } = req.body;

  // Multi-branch access modification requires admin.multi_branch_access
  if (
    hasMultiBranchAccess !== undefined &&
    hasMultiBranchAccess !== targetUser.hasMultiBranchAccess &&
    !req.effectivePermissions?.includes('admin.multi_branch_access')
  ) {
    res.status(403).json({
      success: false,
      message: 'You lack authority to allocate or modify multi-branch access rights.',
    });
    return;
  }

  const prevRole = serverStore.getRoleById(targetUser.roleId);
  const previousRightsSummary = JSON.stringify({
    roleId: targetUser.roleId,
    roleName: targetUser.roleName || prevRole?.name,
    directPermissions: targetUser.directPermissions,
    revokedPermissions: targetUser.revokedPermissions,
    allowedBranchIds: targetUser.allowedBranchIds,
    hasMultiBranchAccess: targetUser.hasMultiBranchAccess,
  });

  const updates: Partial<User> = {};
  if (Array.isArray(directPermissions)) updates.directPermissions = directPermissions as PermissionCode[];
  if (Array.isArray(revokedPermissions)) updates.revokedPermissions = revokedPermissions as PermissionCode[];
  if (roleId) {
    const role = serverStore.getRoleById(roleId);
    if (role) {
      updates.roleId = role.id;
      updates.roleName = role.name;
    }
  }
  if (typeof hasMultiBranchAccess === 'boolean') {
    updates.hasMultiBranchAccess = hasMultiBranchAccess;
  }
  if (Array.isArray(allowedBranchIds)) {
    updates.allowedBranchIds = allowedBranchIds;
  }

  const updatedUser = serverStore.updateUser(targetUser.id, updates);

  AuditService.log({
    userId: req.user!.id,
    username: req.user!.username,
    userFullName: req.user!.fullName,
    branchId: req.workingBranch!.id,
    branchName: req.workingBranch!.name,
    action: 'RIGHTS_MODIFIED',
    recordType: 'PERMISSIONS',
    recordId: targetUser.id,
    previousValue: previousRightsSummary,
    newValue: JSON.stringify(updates),
    reason: req.body.reason || `Administrative rights adjusted for user ${targetUser.username}`,
  });

  res.json({
    success: true,
    data: { ...updatedUser, passwordHash: undefined },
  });
});

// Toggle user active status (Enable / Disable)
userRouter.put('/:id/status', requireAuth, requirePermission('admin.manage_users'), (req: AuthenticatedRequest, res: Response) => {
  const targetUser = serverStore.getUserById(req.params.id);
  if (!targetUser) {
    res.status(404).json({ success: false, message: 'User not found.' });
    return;
  }

  // Prevent user from disabling themselves
  if (req.user?.id === targetUser.id) {
    res.status(403).json({
      success: false,
      message: 'You cannot disable or deactivate your own administrative account.',
    });
    return;
  }

  const { isActive, reason } = req.body;
  if (typeof isActive !== 'boolean') {
    res.status(400).json({ success: false, message: 'Active status boolean required.' });
    return;
  }

  const updated = serverStore.updateUser(targetUser.id, { isActive });

  AuditService.log({
    userId: req.user!.id,
    username: req.user!.username,
    userFullName: req.user!.fullName,
    branchId: req.workingBranch!.id,
    branchName: req.workingBranch!.name,
    action: isActive ? 'USER_ENABLED' : 'USER_DISABLED',
    recordType: 'USERS',
    recordId: targetUser.id,
    previousValue: `isActive: ${targetUser.isActive}`,
    newValue: `isActive: ${isActive}`,
    reason: reason || (isActive ? 'Account reactivated by administrator' : 'Account deactivated by administrator'),
  });

  res.json({
    success: true,
    data: { ...updated, passwordHash: undefined },
  });
});

// Administrative password reset for user
userRouter.post('/:id/reset-password', requireAuth, requirePermission('admin.manage_users'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) {
      res.status(400).json({ success: false, message: 'New password is required.' });
      return;
    }

    const result = await AuthService.resetUserPassword({
      adminUserId: req.user!.id,
      adminUsername: req.user!.username,
      adminFullName: req.user!.fullName,
      targetUserId: req.params.id,
      newPassword,
      branchId: req.workingBranch!.id,
      branchName: req.workingBranch!.name,
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
    });

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
});

// View user activity and audit history
userRouter.get('/:id/activity', requireAuth, requireAnyPermission('admin.manage_users', 'audit.view_logs'), (req: AuthenticatedRequest, res: Response) => {
  const history = serverStore.getUserAuditHistory(req.params.id);
  if (!history) {
    res.status(404).json({ success: false, message: 'User not found.' });
    return;
  }

  res.json({
    success: true,
    data: history,
  });
});

// View effective permissions breakdown for user
userRouter.get('/:id/effective-permissions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = serverStore.getUserById(req.params.id);
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found.' });
    return;
  }

  const role = serverStore.getRoleById(user.roleId);
  const rolePermissions = role ? role.permissions : [];
  const directPermissions = user.directPermissions || [];
  const revokedPermissions = user.revokedPermissions || [];
  const effectivePermissions = AuthService.resolveEffectivePermissions(user);

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        roleName: role?.name || 'Assigned Role',
      },
      rolePermissions,
      directPermissions,
      revokedPermissions,
      effectivePermissions,
    },
  });
});
