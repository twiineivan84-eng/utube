import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthSession, Branch, PermissionCode, User } from '../../types';
import { serverStore } from '../storage/serverStore';
import { AuditService } from './auditService';
import { config } from '../config';

const JWT_SECRET: jwt.Secret = config.auth.jwtSecret;
const TOKEN_EXPIRY = config.auth.jwtExpiry as jwt.SignOptions['expiresIn'];

export class AuthService {
  private static revokedTokens: Set<string> = new Set<string>();

  /**
   * Immediately invalidates an active JWT session (protects against session theft/reuse)
   */
  public static invalidateSession(token: string, details?: {
    userId?: string;
    username?: string;
    userFullName?: string;
    branchId?: string;
    branchName?: string;
    reason?: string;
  }): void {
    if (!token) return;
    this.revokedTokens.add(token);

    if (details?.userId && details?.username) {
      AuditService.log({
        userId: details.userId,
        username: details.username,
        userFullName: details.userFullName || 'Authorized User',
        branchId: details.branchId || 'SYSTEM',
        branchName: details.branchName || 'SACCO System',
        action: 'LOGOUT',
        recordType: 'AUTHENTICATION',
        newValue: details.reason || 'Active session token invalidated and revoked.',
      });
    }
  }

  /**
   * Resolves effective permissions for a user:
   * Base role permissions + direct user grants - direct user revocations
   */
  public static resolveEffectivePermissions(user: User): PermissionCode[] {
    const role = serverStore.getRoleById(user.roleId);
    const basePermissions = new Set<PermissionCode>(role ? role.permissions : []);

    // Apply explicit direct grants
    for (const perm of user.directPermissions || []) {
      basePermissions.add(perm);
    }

    // Apply explicit direct revocations
    for (const perm of user.revokedPermissions || []) {
      basePermissions.delete(perm);
    }

    return Array.from(basePermissions);
  }

  /**
   * Branch-aware login validation
   */
  public static async login(params: {
    branchId: string;
    username: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ success: boolean; session?: AuthSession; message?: string }> {
    const { branchId, username, password, ipAddress, userAgent } = params;

    // Validate username length (4 to 10 chars)
    if (!username || username.trim().length < 4 || username.trim().length > 10) {
      AuditService.log({
        userId: 'system',
        username: username || 'UNKNOWN',
        userFullName: 'Unauthenticated Request',
        branchId: branchId || 'UNKNOWN',
        branchName: 'Unknown Branch',
        action: 'LOGIN_FAILED',
        recordType: 'AUTHENTICATION',
        reason: 'Username must be between 4 and 10 characters',
        ipAddress,
        userAgent,
      });

      return {
        success: false,
        message: 'Invalid credentials. Username must be between 4 and 10 characters.',
      };
    }

    const cleanUsername = username.trim().toLowerCase();

    if (serverStore.isUserDeleted(cleanUsername)) {
      AuditService.log({
        userId: 'system',
        username: cleanUsername,
        userFullName: 'Deleted User',
        branchId: branchId || 'UNKNOWN',
        branchName: 'Unknown Branch',
        action: 'LOGIN_FAILED',
        recordType: 'AUTHENTICATION',
        reason: 'User account has been deleted',
        ipAddress,
        userAgent,
      });

      return {
        success: false,
        message: 'Invalid credentials or branch selection. Please contact your IT administrator.',
      };
    }

    const user = serverStore.getUserByUsername(cleanUsername);

    if (!user) {
      AuditService.log({
        userId: 'system',
        username: cleanUsername,
        userFullName: 'Unregistered User',
        branchId: branchId || 'UNKNOWN',
        branchName: 'Unknown Branch',
        action: 'LOGIN_FAILED',
        recordType: 'AUTHENTICATION',
        reason: 'User account not found',
        ipAddress,
        userAgent,
      });

      return {
        success: false,
        message: 'Invalid credentials or branch selection. Please contact your IT administrator.',
      };
    }

    if (!user.isActive) {
      AuditService.log({
        userId: user.id,
        username: user.username,
        userFullName: user.fullName,
        branchId: branchId || user.primaryBranchId,
        branchName: 'Assigned Branch',
        action: 'LOGIN_FAILED',
        recordType: 'AUTHENTICATION',
        reason: 'User account is inactive/deactivated',
        ipAddress,
        userAgent,
      });

      return {
        success: false,
        message: 'Account is inactive. Please contact an authorized administrator/IT personnel.',
      };
    }

    // Branch authorization check
    const selectedBranch = serverStore.getBranchById(branchId);
    if (!selectedBranch || !selectedBranch.isActive) {
      return {
        success: false,
        message: 'The selected branch is invalid or inactive.',
      };
    }

    // Enforce branch assignment:
    // Single-branch users MUST match primaryBranchId exactly.
    // Multi-branch users can choose primaryBranchId or any allowedBranchIds.
    let branchAuthorized = false;
    if (user.hasMultiBranchAccess) {
      const allowed = new Set([user.primaryBranchId, ...(user.allowedBranchIds || [])]);
      branchAuthorized = allowed.has(selectedBranch.id);
    } else {
      branchAuthorized = user.primaryBranchId === selectedBranch.id;
    }

    if (!branchAuthorized) {
      AuditService.log({
        userId: user.id,
        username: user.username,
        userFullName: user.fullName,
        branchId: selectedBranch.id,
        branchName: selectedBranch.name,
        action: 'LOGIN_FAILED',
        recordType: 'AUTHENTICATION',
        reason: `Unauthorized branch access attempt. User assigned to ${user.primaryBranchId}`,
        ipAddress,
        userAgent,
      });

      return {
        success: false,
        message: user.hasMultiBranchAccess
          ? 'You do not have access rights to the selected branch.'
          : 'You can only log in through your assigned branch. Contact IT if you need a branch transfer.',
      };
    }

    // Password verification
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash || '');
    if (!isPasswordValid) {
      // NOTE: Do NOT implement automatic account lockout (Requirement 3)
      AuditService.log({
        userId: user.id,
        username: user.username,
        userFullName: user.fullName,
        branchId: selectedBranch.id,
        branchName: selectedBranch.name,
        action: 'LOGIN_FAILED',
        recordType: 'AUTHENTICATION',
        reason: 'Incorrect password supplied',
        ipAddress,
        userAgent,
      });

      return {
        success: false,
        message: 'Invalid credentials. If you cannot log in, contact an authorized administrator/IT personnel.',
      };
    }

    // Update last login
    serverStore.updateUser(user.id, {
      lastLoginAt: new Date().toISOString(),
    });

    const effectivePermissions = this.resolveEffectivePermissions(user);

    // Generate JWT token
    const token = jwt.sign(
      {
        sub: user.id,
        username: user.username,
        workingBranchId: selectedBranch.id,
        roleId: user.roleId,
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    // Audit login success
    AuditService.log({
      userId: user.id,
      username: user.username,
      userFullName: user.fullName,
      branchId: selectedBranch.id,
      branchName: selectedBranch.name,
      action: 'LOGIN_SUCCESS',
      recordType: 'AUTHENTICATION',
      newValue: `Logged in to ${selectedBranch.name} (Working Branch)`,
      ipAddress,
      userAgent,
    });

    const sessionUser: User = {
      ...user,
      passwordHash: undefined, // never expose hash
    };

    return {
      success: true,
      session: {
        token,
        user: sessionUser,
        workingBranch: selectedBranch,
        effectivePermissions,
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      },
    };
  }

  /**
   * Verify token and rebuild session
   */
  public static verifyToken(token: string): { valid: boolean; session?: AuthSession } {
    if (!token || this.revokedTokens.has(token)) {
      return { valid: false };
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        sub: string;
        username: string;
        workingBranchId: string;
      };

      if (serverStore.isUserDeleted(decoded.sub) || serverStore.isUserDeleted(decoded.username)) {
        return { valid: false };
      }

      const user = serverStore.getUserById(decoded.sub);
      if (!user || !user.isActive) {
        return { valid: false };
      }

      const branch = serverStore.getBranchById(decoded.workingBranchId) || serverStore.getBranchById(user.primaryBranchId);
      if (!branch) {
        return { valid: false };
      }

      const effectivePermissions = this.resolveEffectivePermissions(user);

      return {
        valid: true,
        session: {
          token,
          user: {
            ...user,
            passwordHash: undefined,
          },
          workingBranch: branch,
          effectivePermissions,
          expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        },
      };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Switch working branch for a multi-branch user
   */
  public static switchBranch(params: {
    userId: string;
    newBranchId: string;
    ipAddress?: string;
  }): { success: boolean; session?: AuthSession; message?: string } {
    const user = serverStore.getUserById(params.userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    if (!user.hasMultiBranchAccess) {
      return {
        success: false,
        message: 'User does not possess multi-branch authorization.',
      };
    }

    const allowed = new Set([user.primaryBranchId, ...(user.allowedBranchIds || [])]);
    if (!allowed.has(params.newBranchId)) {
      return {
        success: false,
        message: 'User is not permitted to access this designated branch.',
      };
    }

    const branch = serverStore.getBranchById(params.newBranchId);
    if (!branch || !branch.isActive) {
      return { success: false, message: 'Selected branch is unavailable.' };
    }

    const token = jwt.sign(
      {
        sub: user.id,
        username: user.username,
        workingBranchId: branch.id,
        roleId: user.roleId,
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    AuditService.log({
      userId: user.id,
      username: user.username,
      userFullName: user.fullName,
      branchId: branch.id,
      branchName: branch.name,
      action: 'BRANCH_SWITCH',
      recordType: 'AUTHENTICATION',
      newValue: `Switched working branch to ${branch.name}`,
      ipAddress: params.ipAddress,
    });

    return {
      success: true,
      session: {
        token,
        user: { ...user, passwordHash: undefined },
        workingBranch: branch,
        effectivePermissions: this.resolveEffectivePermissions(user),
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      },
    };
  }

  /**
   * Initial administrator setup mechanism
   */
  public static async setupInitialAdmin(params: {
    username: string;
    fullName: string;
    password: string;
    primaryBranchId: string;
    email?: string;
    phone?: string;
  }): Promise<{ success: boolean; user?: User; message?: string }> {
    const { username, fullName, password, primaryBranchId, email, phone } = params;

    // Check username rules (4 to 10 chars)
    if (!username || username.trim().length < 4 || username.trim().length > 10) {
      return {
        success: false,
        message: 'Username must be between 4 and 10 characters in length.',
      };
    }

    const cleanUsername = username.trim().toLowerCase();
    const existing = serverStore.getUserByUsername(cleanUsername);
    if (existing) {
      return {
        success: false,
        message: `Username '${cleanUsername}' is already registered.`,
      };
    }

    // Role assignment: find IT Officer role or General Manager role
    const roles = serverStore.getRoles();
    const adminRole = roles.find(r => r.code === 'IT_OFFICER') || roles.find(r => r.code === 'GM') || roles[0];

    const branch = serverStore.getBranchById(primaryBranchId) || serverStore.getBranches()[0];
    const passwordHash = await bcrypt.hash(password, 10);

    const allBranches = serverStore.getBranches();
    const newUser: User = {
      id: `usr-${Date.now()}`,
      username: cleanUsername,
      fullName: fullName.trim(),
      email: email?.trim(),
      phone: phone?.trim(),
      passwordHash,
      roleId: adminRole.id,
      roleName: adminRole.name,
      primaryBranchId: branch.id,
      allowedBranchIds: allBranches.map(b => b.id), // multi-branch access for initial administrator
      hasMultiBranchAccess: true,
      isActive: true,
      requiresPasswordReset: false,
      directPermissions: [],
      revokedPermissions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    serverStore.addUser(newUser);

    AuditService.log({
      userId: newUser.id,
      username: newUser.username,
      userFullName: newUser.fullName,
      branchId: branch.id,
      branchName: branch.name,
      action: 'INITIAL_ADMIN_SETUP',
      recordType: 'USERS',
      recordId: newUser.id,
      newValue: `Provisioned initial administrator account: ${newUser.username}`,
    });

    return {
      success: true,
      user: { ...newUser, passwordHash: undefined },
    };
  }

  /**
   * Secure user password change (self-service)
   * Validates old password, checks security policies, never exposes hash or plaintext
   */
  public static async changePassword(params: {
    userId: string;
    currentPassword: string;
    newPassword: string;
    ipAddress?: string;
  }): Promise<{ success: boolean; message: string }> {
    const { userId, currentPassword, newPassword, ipAddress } = params;

    const user = serverStore.getUserById(userId);
    if (!user) {
      return { success: false, message: 'User not found.' };
    }

    if (!user.isActive) {
      return { success: false, message: 'Account is inactive. Operation blocked.' };
    }

    // Verify current password
    const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash || '');
    if (!isCurrentValid) {
      AuditService.log({
        userId: user.id,
        username: user.username,
        userFullName: user.fullName,
        branchId: user.primaryBranchId,
        branchName: 'Assigned Branch',
        action: 'PASSWORD_CHANGED',
        recordType: 'AUTHENTICATION',
        reason: 'Failed password change: current password verification failed.',
        ipAddress,
      });

      return { success: false, message: 'Current password provided is incorrect.' };
    }

    // Security policies for new password
    if (!newPassword || newPassword.length < 8) {
      return { success: false, message: 'New password must be at least 8 characters long.' };
    }

    if (newPassword.toLowerCase() === user.username.toLowerCase()) {
      return { success: false, message: 'New password cannot match your username.' };
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    serverStore.updateUser(user.id, {
      passwordHash: newHash,
      requiresPasswordReset: false,
    });

    AuditService.log({
      userId: user.id,
      username: user.username,
      userFullName: user.fullName,
      branchId: user.primaryBranchId,
      branchName: 'Assigned Branch',
      action: 'PASSWORD_CHANGED',
      recordType: 'AUTHENTICATION',
      recordId: user.id,
      newValue: 'User successfully updated account password credentials.',
      ipAddress,
    });

    return { success: true, message: 'Password updated successfully.' };
  }

  /**
   * Secure administrator password reset
   */
  public static async resetUserPassword(params: {
    adminUserId: string;
    adminUsername: string;
    adminFullName: string;
    targetUserId: string;
    newPassword: string;
    branchId: string;
    branchName: string;
    ipAddress?: string;
  }): Promise<{ success: boolean; message: string }> {
    const { adminUserId, adminUsername, adminFullName, targetUserId, newPassword, branchId, branchName, ipAddress } = params;

    const targetUser = serverStore.getUserById(targetUserId);
    if (!targetUser) {
      return { success: false, message: 'Target user does not exist.' };
    }

    if (!newPassword || newPassword.length < 8) {
      return { success: false, message: 'Password must be at least 8 characters in length.' };
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    serverStore.updateUser(targetUser.id, {
      passwordHash: newHash,
      requiresPasswordReset: true,
    });

    AuditService.log({
      userId: adminUserId,
      username: adminUsername,
      userFullName: adminFullName,
      branchId,
      branchName,
      action: 'PASSWORD_RESET',
      recordType: 'USERS',
      recordId: targetUser.id,
      newValue: `Administrative password reset issued for user ${targetUser.username} (${targetUser.fullName}).`,
      ipAddress,
    });

    return { success: true, message: `Password for ${targetUser.username} has been reset successfully.` };
  }
}
