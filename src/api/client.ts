import {
  Branch,
  Role,
  User,
  AuditLog,
  PermissionDefinition,
  AuthSession,
  SaccoMember,
  ControlledCorrection,
  TurihamwePlan,
  Beneficiary,
  TurihamweClaim,
  ClaimDocument,
  ClaimStatus,
  DocumentCategory,
  SmsTemplate,
  SmsMessage,
  NotificationEvent,
  SystemAlert,
  ReportGenerationLog,
  MonthlyBranchSummary,
  ReportCategory,
  BackupRecord,
  BackupConfig,
  SystemHealthMetrics,
  UserAuditHistory,
  BusinessRulesConfig,
  SmsProviderDiagnostics
} from '../types';

const API_BASE = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || '/api';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('turihamwe_auth_token') || localStorage.getItem('turihamwe_token');
  }

  public setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('turihamwe_auth_token', token);
      localStorage.setItem('turihamwe_token', token);
    } else {
      localStorage.removeItem('turihamwe_auth_token');
      localStorage.removeItem('turihamwe_token');
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 && endpoint !== '/auth/login') {
        this.setToken(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('turihamwe_cached_user');
          localStorage.removeItem('turihamwe_cached_branch');
          localStorage.removeItem('turihamwe_cached_perms');
          window.dispatchEvent(new CustomEvent('turihamwe_session_expired', {
            detail: { message: data.error || 'Session expired or invalid credentials' }
          }));
        }
      }
      const errorMsg = data.message || data.error || `HTTP ${response.status}`;
      throw new Error(errorMsg);
    }

    return data as T;
  }

  // --- Auth ---
  public async login(branchId: string, username: string, password: string): Promise<{ success: boolean; session: AuthSession }> {
    const res = await this.request<{ success: boolean; session: AuthSession }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ branchId, username, password }),
    });

    if (res.session?.token) {
      this.setToken(res.session.token);
    }
    return res;
  }

  public async verifyToken(): Promise<{ valid: boolean; session?: AuthSession }> {
    if (!this.token) return { valid: false };
    return this.request<{ valid: boolean; session?: AuthSession }>('/auth/verify', {
      method: 'POST',
    });
  }

  public async getUserBranches(username: string): Promise<{
    found: boolean;
    hasMultiBranchAccess: boolean;
    primaryBranchId?: string;
    primaryBranchName?: string;
    allowedBranches: Branch[];
  }> {
    return this.request(`/auth/user-branches?username=${encodeURIComponent(username)}`);
  }

  public async switchBranch(newBranchId: string): Promise<{ success: boolean; session: AuthSession }> {
    const res = await this.request<{ success: boolean; session: AuthSession }>('/auth/switch-branch', {
      method: 'POST',
      body: JSON.stringify({ newBranchId }),
    });

    if (res.session?.token) {
      this.setToken(res.session.token);
    }
    return res;
  }

  public async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    } finally {
      this.setToken(null);
    }
  }

  public async setupInitialAdmin(data: {
    username: string;
    fullName: string;
    password: string;
    primaryBranchId: string;
    email?: string;
    phone?: string;
  }): Promise<{ success: boolean; user: User }> {
    return this.request('/auth/setup-admin', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async checkSetupStatus(): Promise<{ hasUsers: boolean; userCount: number }> {
    return this.request('/auth/setup-status');
  }

  // --- Branches ---
  public async getBranches(): Promise<{ success: boolean; data: Branch[] }> {
    return this.request('/branches');
  }

  // --- Audit Logs ---
  public async getAuditLogs(filter?: {
    branchId?: string;
    userId?: string;
    action?: string;
    recordType?: string;
    recordId?: string;
    startDate?: string;
    endDate?: string;
    searchQuery?: string;
    limit?: number;
  }): Promise<{ success: boolean; data: AuditLog[]; total: number }> {
    const params = new URLSearchParams();
    if (filter?.branchId) params.append('branchId', filter.branchId);
    if (filter?.userId) params.append('userId', filter.userId);
    if (filter?.action) params.append('action', filter.action);
    if (filter?.recordType) params.append('recordType', filter.recordType);
    if (filter?.recordId) params.append('recordId', filter.recordId);
    if (filter?.startDate) params.append('startDate', filter.startDate);
    if (filter?.endDate) params.append('endDate', filter.endDate);
    if (filter?.searchQuery) params.append('q', filter.searchQuery);
    if (filter?.limit) params.append('limit', filter.limit.toString());

    return this.request(`/audit-logs?${params.toString()}`);
  }

  public async getAuditLogById(id: string): Promise<{ success: boolean; data: AuditLog }> {
    return this.request(`/audit-logs/${encodeURIComponent(id)}`);
  }

  public async exportAuditLogs(data: {
    format?: string;
    branchId?: string;
    startDate?: string;
    endDate?: string;
    action?: string;
    recordType?: string;
  }): Promise<{ success: boolean; data: AuditLog[]; count: number; format: string }> {
    return this.request('/audit-logs/export', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // --- Members ---
  public async getMembers(query?: string, branchId?: string): Promise<{ success: boolean; data: SaccoMember[] }> {
    const params = new URLSearchParams();
    if (query) params.append('q', query);
    if (branchId) params.append('branchId', branchId);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/members${queryString}`);
  }

  public async searchMembers(query: string): Promise<{ success: boolean; data: SaccoMember[] }> {
    return this.getMembers(query);
  }

  public async getPlans(accountNumber?: string, branchId?: string): Promise<{ success: boolean; data: TurihamwePlan[] }> {
    const params = new URLSearchParams();
    if (accountNumber) params.append('accountNumber', accountNumber);
    if (branchId) params.append('branchId', branchId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/turihamwe/plans${qs}`);
  }

  public async getBeneficiaries(planId: string): Promise<{ success: boolean; data: Beneficiary[] }> {
    const res = await this.request<{ success: boolean; data: TurihamwePlan; beneficiaries?: Beneficiary[] }>(
      `/turihamwe/plans/${encodeURIComponent(planId)}`
    );
    return {
      success: res.success,
      data: res.beneficiaries || [],
    };
  }

  public async getMemberByAccount(accountNumber: string): Promise<{
    success: boolean;
    data: SaccoMember & { corrections?: ControlledCorrection[]; auditLogs?: AuditLog[] };
  }> {
    return this.request(`/members/${encodeURIComponent(accountNumber)}`);
  }

  public async registerMember(memberData: Partial<SaccoMember> & {
    beneficiaries?: Array<{
      fullName: string;
      dateOfBirth: string;
      relationship: string;
      nationalIdNumber?: string;
      contactPhone?: string;
    }>;
  }): Promise<{ success: boolean; data: SaccoMember }> {
    return this.request('/members', {
      method: 'POST',
      body: JSON.stringify(memberData),
    });
  }

  public async updateMemberClientStatus(
    accountNumber: string,
    status: 'ALIVE' | 'DECEASED',
    reason?: string
  ): Promise<{ success: boolean; data: SaccoMember; message?: string }> {
    return this.request(`/members/${encodeURIComponent(accountNumber)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ clientStatus: status, reason }),
    });
  }

  public async updateMember(accountNumber: string, updates: Partial<SaccoMember>): Promise<{ success: boolean; data: SaccoMember }> {
    return this.request(`/members/${encodeURIComponent(accountNumber)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async submitControlledCorrection(
    accountNumber: string,
    correction: { fieldChanged: string; newValue: string; reason: string }
  ): Promise<{ success: boolean; data: SaccoMember; correction: ControlledCorrection }> {
    return this.request(`/members/${encodeURIComponent(accountNumber)}/correction`, {
      method: 'POST',
      body: JSON.stringify(correction),
    });
  }

  public async deleteMember(
    accountNumber: string,
    reason?: string
  ): Promise<{ success: boolean; message: string; data?: SaccoMember; dependencies?: string[] }> {
    return this.request(`/members/${encodeURIComponent(accountNumber)}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
  }

  // --- Users & Rights ---
  public async getUsers(): Promise<{ success: boolean; data: User[] }> {
    return this.request('/users');
  }

  public async getRoles(): Promise<{ success: boolean; data: Role[] }> {
    return this.request('/users/roles');
  }

  public async getPermissions(): Promise<{ success: boolean; data: PermissionDefinition[] }> {
    return this.request('/users/permissions');
  }

  public async createUser(userData: {
    username: string;
    fullName: string;
    email?: string;
    phone?: string;
    password: string;
    roleId: string;
    primaryBranchId: string;
    hasMultiBranchAccess?: boolean;
    allowedBranchIds?: string[];
  }): Promise<{ success: boolean; data: User }> {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  public async modifyUserRights(
    userId: string,
    rights: {
      roleId?: string;
      directPermissions?: string[];
      revokedPermissions?: string[];
      allowedBranchIds?: string[];
      hasMultiBranchAccess?: boolean;
      reason?: string;
    }
  ): Promise<{ success: boolean; data: User }> {
    return this.request(`/users/${userId}/rights`, {
      method: 'PUT',
      body: JSON.stringify(rights),
    });
  }

  public async toggleUserStatus(userId: string, isActive: boolean, reason?: string): Promise<{ success: boolean; data: User }> {
    return this.request(`/users/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ isActive, reason }),
    });
  }

  public async editUser(userId: string, updates: Partial<User> & { password?: string }): Promise<{ success: boolean; data: User }> {
    return this.request(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async deleteUser(userId: string, reason?: string): Promise<{ success: boolean; message: string; deletedUser?: User }> {
    return this.request(`/users/${userId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
  }

  public async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return this.request('/users/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  public async resetUserPassword(userId: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    });
  }

  public async getUserActivity(userId: string): Promise<{ success: boolean; data: UserAuditHistory }> {
    return this.request(`/users/${userId}/activity`);
  }

  public async getUserEffectivePermissions(userId: string): Promise<{
    success: boolean;
    data: {
      user: Partial<User>;
      rolePermissions: string[];
      directPermissions: string[];
      revokedPermissions: string[];
      effectivePermissions: string[];
    };
  }> {
    return this.request(`/users/${userId}/effective-permissions`);
  }

  public async createRole(roleData: {
    name: string;
    code: string;
    description?: string;
    permissions: string[];
  }): Promise<{ success: boolean; data: Role }> {
    return this.request('/users/roles', {
      method: 'POST',
      body: JSON.stringify(roleData),
    });
  }

  public async updateRole(
    roleId: string,
    roleData: {
      name?: string;
      description?: string;
      permissions?: string[];
      reason?: string;
    }
  ): Promise<{ success: boolean; data: Role }> {
    return this.request(`/users/roles/${encodeURIComponent(roleId)}`, {
      method: 'PUT',
      body: JSON.stringify(roleData),
    });
  }

  public async deleteRole(roleId: string): Promise<{ success: boolean; message?: string }> {
    return this.request(`/users/roles/${encodeURIComponent(roleId)}`, {
      method: 'DELETE',
    });
  }

  // --- System Configuration & Business Settings (Phase 7) ---
  public async getSystemConfig(): Promise<{
    success: boolean;
    data: {
      businessRules: BusinessRulesConfig;
      systemSettings: Record<string, string>;
    };
  }> {
    return this.request('/system/config');
  }

  public async updateBusinessRules(updates: Partial<BusinessRulesConfig>, reason?: string): Promise<{
    success: boolean;
    data: BusinessRulesConfig;
    message: string;
  }> {
    return this.request('/system/config/business-rules', {
      method: 'PUT',
      body: JSON.stringify({ ...updates, reason }),
    });
  }

  public async updateSystemSettings(settings: Record<string, string>, reason?: string): Promise<{
    success: boolean;
    data: Record<string, string>;
    message: string;
  }> {
    return this.request('/system/config/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings, reason }),
    });
  }

  // --- Central Database Backup & Restore (Phase 7) ---
  public async getBackups(): Promise<{ success: boolean; data: BackupRecord[] }> {
    return this.request('/system/backups');
  }

  public async createBackup(notes?: string): Promise<{ success: boolean; data: BackupRecord; message: string }> {
    return this.request('/system/backups', {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  }

  public async verifyBackup(backupId: string): Promise<{
    success: boolean;
    data: {
      verified: boolean;
      checksumMatch: boolean;
      details: string;
      backup?: BackupRecord;
    };
  }> {
    return this.request(`/system/backups/${encodeURIComponent(backupId)}/verify`, {
      method: 'POST',
    });
  }

  public async restoreBackup(
    backupId: string,
    data: { reason: string; confirmationAcknowledged: boolean }
  ): Promise<{
    success: boolean;
    message: string;
    recordCounts?: BackupRecord['recordCounts'];
  }> {
    return this.request(`/system/backups/${encodeURIComponent(backupId)}/restore`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async getBackupConfig(): Promise<{ success: boolean; data: BackupConfig }> {
    return this.request('/system/backup-config');
  }

  public async updateBackupConfig(updates: Partial<BackupConfig>): Promise<{ success: boolean; data: BackupConfig; message: string }> {
    return this.request('/system/backup-config', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  // --- System Health & Monitoring (Phase 7) ---
  public async getSystemHealth(): Promise<{ success: boolean; data: SystemHealthMetrics }> {
    return this.request('/system/health');
  }

  public async getSyncMonitoring(branchId?: string): Promise<{
    success: boolean;
    data: {
      totalRecords: number;
      pendingCount: number;
      failedCount: number;
      syncedCount: number;
      conflictCount: number;
      pendingRecords: unknown[];
      failedRecords: unknown[];
      recentSynced: unknown[];
      conflicts: unknown[];
    };
  }> {
    const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    return this.request(`/system/sync-monitoring${qs}`);
  }

  public async retrySyncRecord(id: string): Promise<{ success: boolean; record?: unknown; message?: string }> {
    return this.request(`/system/sync-retry/${encodeURIComponent(id)}`, {
      method: 'POST',
    });
  }

  public async getEnvironmentStatus(): Promise<{
    success: boolean;
    data: {
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
    };
  }> {
    return this.request('/system/environment');
  }

  public async autoFillEnvironment(): Promise<{
    success: boolean;
    message: string;
    readyToContinue: boolean;
  }> {
    return this.request('/system/environment/autofill', {
      method: 'POST',
    });
  }

  public async clearAllOperationalData(): Promise<{
    success: boolean;
    data: {
      clearedMembers: number;
      clearedPlans: number;
      clearedClaims: number;
      clearedContributions: number;
      clearedRenewals: number;
      clearedBackups: number;
    };
    message: string;
  }> {
    return this.request('/system/clear-data', {
      method: 'POST',
    });
  }

  // --- Synchronization ---
  public async getSyncStatus(): Promise<{
    success: boolean;
    serverTimestamp: string;
    totalSyncJournals: number;
    recentJournals: unknown[];
  }> {
    return this.request('/sync/status');
  }

  public async pushSyncQueue(items: unknown[]): Promise<{
    success: boolean;
    processed: Array<{ id: string; status: 'SYNCED' | 'CONFLICT' | 'FAILED'; error?: string }>;
  }> {
    return this.request('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ queueItems: items }),
    });
  }

  // --- Claims Management (Phase 5) ---
  public async getClaims(filter?: {
    branchId?: string;
    status?: string;
    searchQuery?: string;
    saccoAccountNumber?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{ success: boolean; data: TurihamweClaim[]; total: number }> {
    const params = new URLSearchParams();
    if (filter?.branchId) params.append('branchId', filter.branchId);
    if (filter?.status) params.append('status', filter.status);
    if (filter?.searchQuery) params.append('searchQuery', filter.searchQuery);
    if (filter?.saccoAccountNumber) params.append('saccoAccountNumber', filter.saccoAccountNumber);
    if (filter?.startDate) params.append('startDate', filter.startDate);
    if (filter?.endDate) params.append('endDate', filter.endDate);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/claims${qs}`);
  }

  public async getClaimStats(branchId?: string): Promise<{
    success: boolean;
    data: {
      total: number;
      draft: number;
      submitted: number;
      underReview: number;
      awaitingDocuments: number;
      approved: number;
      rejected: number;
      closed: number;
      requiringAction: number;
    };
  }> {
    const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    return this.request(`/claims/stats${qs}`);
  }

  public async checkDuplicateClaims(params: {
    saccoAccountNumber: string;
    planId: string;
    beneficiaryId?: string;
    currentClaimId?: string;
  }): Promise<{
    success: boolean;
    hasPotentialDuplicates: boolean;
    duplicateClaims: TurihamweClaim[];
  }> {
    const qs = new URLSearchParams({
      saccoAccountNumber: params.saccoAccountNumber,
      planId: params.planId,
      ...(params.beneficiaryId ? { beneficiaryId: params.beneficiaryId } : {}),
      ...(params.currentClaimId ? { currentClaimId: params.currentClaimId } : {}),
    }).toString();
    return this.request(`/claims/check-duplicate?${qs}`);
  }

  public async getClaimById(idOrRef: string): Promise<{ success: boolean; data: TurihamweClaim; error?: string }> {
    return this.request(`/claims/${encodeURIComponent(idOrRef)}`);
  }

  public async createClaim(data: {
    saccoAccountNumber: string;
    planId: string;
    beneficiaryId?: string;
    claimCategory: string;
    incidentDate: string;
    incidentDescription: string;
    initialStatus?: 'DRAFT' | 'SUBMITTED';
    duplicateWarningAcknowledged?: boolean;
    duplicateOverrideReason?: string;
    supportingDocuments?: ClaimDocument[];
  }): Promise<{
    success: boolean;
    data?: TurihamweClaim;
    error?: string;
    requiresAcknowledgement?: boolean;
    duplicateClaims?: TurihamweClaim[];
  }> {
    return this.request('/claims', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async updateClaim(
    id: string,
    data: {
      incidentDate?: string;
      incidentDescription?: string;
      claimCategory?: string;
      statusTransitionToSubmitted?: boolean;
    }
  ): Promise<{ success: boolean; data?: TurihamweClaim; error?: string }> {
    return this.request(`/claims/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  public async uploadClaimDocument(
    claimId: string,
    docData: {
      documentCategory: DocumentCategory;
      documentTitle: string;
      originalFileName: string;
      fileSize: number;
      mimeType: string;
      fileDataUrl?: string;
      replacedById?: string;
      replacementReason?: string;
      notes?: string;
    }
  ): Promise<{ success: boolean; data?: ClaimDocument; error?: string }> {
    return this.request(`/claims/${encodeURIComponent(claimId)}/documents`, {
      method: 'POST',
      body: JSON.stringify(docData),
    });
  }

  public async getClaimDocument(claimId: string, documentId: string): Promise<{ success: boolean; data?: ClaimDocument; error?: string }> {
    return this.request(`/claims/${encodeURIComponent(claimId)}/documents/${encodeURIComponent(documentId)}`);
  }

  public async reviewClaim(
    claimId: string,
    reviewData: {
      reviewNotes: string;
      newStatus?: ClaimStatus;
      requestedDocuments?: string[];
    }
  ): Promise<{ success: boolean; data?: TurihamweClaim; error?: string }> {
    return this.request(`/claims/${encodeURIComponent(claimId)}/review`, {
      method: 'POST',
      body: JSON.stringify(reviewData),
    });
  }

  public async approveClaim(
    claimId: string,
    data: {
      approvalReference?: string;
      approvalNotes?: string;
    }
  ): Promise<{ success: boolean; data?: TurihamweClaim; error?: string }> {
    return this.request(`/claims/${encodeURIComponent(claimId)}/approve`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async rejectClaim(
    claimId: string,
    data: {
      rejectionReason: string;
      rejectionNotes?: string;
    }
  ): Promise<{ success: boolean; data?: TurihamweClaim; error?: string }> {
    return this.request(`/claims/${encodeURIComponent(claimId)}/reject`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async recordClaimPayment(
    claimId: string,
    data: {
      paymentReference: string;
      paymentDate?: string;
      disbursementNotes?: string;
    }
  ): Promise<{ success: boolean; data?: TurihamweClaim; error?: string }> {
    return this.request(`/claims/${encodeURIComponent(claimId)}/payment`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async closeClaim(
    claimId: string,
    reason?: string
  ): Promise<{ success: boolean; data?: TurihamweClaim; error?: string }> {
    return this.request(`/claims/${encodeURIComponent(claimId)}/close`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // --- Reports & Analytics (Phase 6) ---
  public async getMonthlySummary(year?: number, month?: number, branchId?: string): Promise<{
    success: boolean;
    data: MonthlyBranchSummary;
    canViewFinancial: boolean;
  }> {
    const params = new URLSearchParams();
    if (year) params.append('year', String(year));
    if (month) params.append('month', String(month));
    if (branchId) params.append('branchId', branchId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/reports/summary${qs}`);
  }

  public async getMonthlyBranchSummary(filter?: {
    branchId?: string;
    year?: number;
    month?: number;
  }): Promise<{
    success: boolean;
    data: MonthlyBranchSummary;
    canViewFinancial: boolean;
  }> {
    return this.getMonthlySummary(filter?.year, filter?.month, filter?.branchId);
  }

  public async getReportData(params: {
    category: ReportCategory;
    subType?: string;
    branchId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }): Promise<{
    success: boolean;
    metadata: {
      reportCode: string;
      reportTitle: string;
      category: string;
      branchName: string;
      generatedAt: string;
      generatedBy: string;
      canViewFinancial: boolean;
      recordCount: number;
    };
    data: any[];
  }> {
    const qs = new URLSearchParams({
      category: params.category,
      ...(params.subType ? { subType: params.subType } : {}),
      ...(params.branchId ? { branchId: params.branchId } : {}),
      ...(params.startDate ? { startDate: params.startDate } : {}),
      ...(params.endDate ? { endDate: params.endDate } : {}),
      ...(params.status ? { status: params.status } : {}),
    }).toString();
    return this.request(`/reports/data?${qs}`);
  }

  public async exportReport(data: {
    reportCode: string;
    reportTitle: string;
    reportCategory: ReportCategory;
    exportFormat: 'EXCEL' | 'PDF' | 'CSV';
    recordCount: number;
    filterParams?: any;
  }): Promise<{ success: boolean; data: ReportGenerationLog; message: string }> {
    return this.request('/reports/export', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async getReportLogs(branchId?: string, category?: string): Promise<{
    success: boolean;
    data: ReportGenerationLog[];
  }> {
    const params = new URLSearchParams();
    if (branchId) params.append('branchId', branchId);
    if (category) params.append('category', category);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/reports/logs${qs}`);
  }

  // --- SMS Notifications & Africa's Talking (Phase 6) ---
  public async getSmsTemplates(category?: string): Promise<{
    success: boolean;
    data: SmsTemplate[];
  }> {
    const qs = category ? `?category=${encodeURIComponent(category)}` : '';
    return this.request(`/sms/templates${qs}`);
  }

  public async createSmsTemplate(data: {
    code: string;
    name: string;
    category: string;
    templateText: string;
    availableVariables?: string[];
  }): Promise<{ success: boolean; data: SmsTemplate }> {
    return this.request('/sms/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async updateSmsTemplate(
    id: string,
    data: Partial<SmsTemplate>
  ): Promise<{ success: boolean; data: SmsTemplate }> {
    return this.request(`/sms/templates/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  public async getSmsQueue(filter?: {
    branchId?: string;
    status?: string;
    searchQuery?: string;
    saccoAccountNumber?: string;
  }): Promise<{ success: boolean; data: SmsMessage[]; total: number }> {
    const params = new URLSearchParams();
    if (filter?.branchId) params.append('branchId', filter.branchId);
    if (filter?.status) params.append('status', filter.status);
    if (filter?.searchQuery) params.append('searchQuery', filter.searchQuery);
    if (filter?.saccoAccountNumber) params.append('saccoAccountNumber', filter.saccoAccountNumber);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/sms/queue${qs}`);
  }

  public async sendSms(data: {
    recipientPhone: string;
    recipientName: string;
    messageText: string;
    saccoAccountNumber?: string;
    planId?: string;
    claimId?: string;
    eventReferenceKey?: string;
    templateCategory?: string;
    dispatchImmediately?: boolean;
  }): Promise<{ success: boolean; data?: SmsMessage; message: string; error?: string }> {
    return this.request('/sms/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async retrySms(id: string): Promise<{ success: boolean; data?: SmsMessage; message: string; error?: string }> {
    return this.request(`/sms/queue/${encodeURIComponent(id)}/retry`, {
      method: 'POST',
    });
  }

  public async processSmsQueue(): Promise<{
    success: boolean;
    data: { processed: number; sent: number; failed: number };
    message: string;
  }> {
    return this.request('/sms/process-queue', {
      method: 'POST',
    });
  }

  public async getSmsDiagnostics(): Promise<{
    success: boolean;
    data: SmsProviderDiagnostics;
  }> {
    return this.request('/sms/diagnostics');
  }

  public async getSmsProvider(): Promise<{
    success: boolean;
    provider: 'PANDORA' | 'AFRICAS_TALKING';
    activeSenderId: string;
  }> {
    return this.request('/sms/provider');
  }

  public async setSmsProvider(provider: 'PANDORA' | 'AFRICAS_TALKING'): Promise<{
    success: boolean;
    provider: 'PANDORA' | 'AFRICAS_TALKING';
    message: string;
  }> {
    return this.request('/sms/provider', {
      method: 'POST',
      body: JSON.stringify({ provider }),
    });
  }

  public async testSmsConnection(provider?: 'PANDORA' | 'AFRICAS_TALKING'): Promise<{
    success: boolean;
    data: {
      connected: boolean;
      environment: 'SANDBOX' | 'PRODUCTION';
      balanceUGX?: string | null;
      message: string;
      error?: string;
      checkedAt: string;
    };
    message: string;
  }> {
    return this.request('/sms/test-connection', {
      method: 'POST',
      body: JSON.stringify(provider ? { provider } : {}),
    });
  }

  public async testSmsSend(data: {
    recipientPhone: string;
    confirmSandboxTest: boolean;
  }): Promise<{
    success: boolean;
    data?: SmsMessage;
    message: string;
    error?: string;
  }> {
    return this.request('/sms/test-send', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async startSmsWorker(): Promise<{
    success: boolean;
    message: string;
    workerStatus: string;
  }> {
    return this.request('/sms/worker/start', {
      method: 'POST',
    });
  }

  public async stopSmsWorker(): Promise<{
    success: boolean;
    message: string;
    workerStatus: string;
  }> {
    return this.request('/sms/worker/stop', {
      method: 'POST',
    });
  }

  public async getNotificationEvents(branchId?: string, eventType?: string): Promise<{
    success: boolean;
    data: NotificationEvent[];
    total: number;
  }> {
    const params = new URLSearchParams();
    if (branchId) params.append('branchId', branchId);
    if (eventType) params.append('eventType', eventType);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/sms/notifications${qs}`);
  }

  public async evaluateExpiries(): Promise<{
    success: boolean;
    data: { eventsCreated: number; messagesQueued: number };
    message: string;
  }> {
    return this.request('/sms/evaluate-expiries', {
      method: 'POST',
    });
  }

  // --- Alert Center (Phase 6) ---
  public async getAlerts(filter?: {
    branchId?: string;
    category?: string;
    status?: string;
  }): Promise<{ success: boolean; data: SystemAlert[]; unreadCount: number; total: number }> {
    const params = new URLSearchParams();
    if (filter?.branchId) params.append('branchId', filter.branchId);
    if (filter?.category) params.append('category', filter.category);
    if (filter?.status) params.append('status', filter.status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/alerts${qs}`);
  }

  public async markAlertRead(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/alerts/${encodeURIComponent(id)}/read`, {
      method: 'POST',
    });
  }

  public async resolveAlert(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/alerts/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
    });
  }

  public async createAlert(data: Partial<SystemAlert>): Promise<{ success: boolean; data: SystemAlert }> {
    return this.request('/alerts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const apiClient = new ApiClient();
