/**
 * TURIHAMWE MANAGEMENT SYSTEM
 * Organization: Nyamuyanja SACCO Ltd, Uganda
 * Domain Types & Schemas
 */

export type BranchCode = 
  | 'NYAMUYANJA'
  | 'KAGARAMA'
  | 'NYAKIGYERA'
  | 'KAMUBEIZI'
  | 'RUBOROGOTA'
  | 'MASHA';

export interface Branch {
  id: string;
  code: BranchCode;
  name: string;
  district: string;
  isHeadquarters: boolean;
  isActive: boolean;
  createdAt: string;
}

export type PermissionCode =
  // MEMBERS
  | 'members.view'
  | 'members.register'
  | 'members.edit'
  | 'members.delete'
  | 'members.search'
  | 'members.history'
  // TURIHAMWE
  | 'turihamwe.view'
  | 'turihamwe.register_plan'
  | 'turihamwe.manage_beneficiaries'
  | 'turihamwe.view_contributions'
  | 'turihamwe.record_contribution'
  | 'turihamwe.view_renewals'
  | 'turihamwe.record_renewal'
  | 'turihamwe.view_expiry'
  | 'turihamwe.reactivate_plan'
  | 'turihamwe.view_history'
  // TRANSACTIONS
  | 'transactions.view'
  | 'transactions.record'
  | 'transactions.print_receipts'
  | 'transactions.edit'
  // CLAIMS
  | 'claims.view'
  | 'claims.create'
  | 'claims.edit'
  | 'claims.upload_documents'
  | 'claims.review'
  | 'claims.request_documents'
  | 'claims.approve'
  | 'claims.reject'
  | 'claims.close'
  | 'claims.view_history'
  | 'claims.view_payment_info'
  // REPORTS
  | 'reports.view'
  | 'reports.generate'
  | 'reports.monthly_performance'
  | 'reports.edit_templates'
  | 'reports.export'
  | 'reports.view_financial'
  // SMS/NOTIFICATIONS
  | 'sms.view_history'
  | 'sms.send'
  | 'sms.manage_templates'
  | 'sms.retry_failed'
  | 'sms.view_queue'
  | 'sms.view_notifications'
  | 'sms.configure_events'
  // ALERTS
  | 'alerts.view'
  | 'alerts.manage'
  // ADMINISTRATION
  | 'admin.manage_users'
  | 'admin.create_groups'
  | 'admin.assign_rights'
  | 'admin.modify_rights'
  | 'admin.multi_branch_access'
  | 'admin.system_settings'
  // SECURITY/AUDIT
  | 'audit.view_logs'
  | 'audit.system_reports'
  | 'audit.sync_status'
  | 'audit.manage_backups';

export type PermissionCategory = 
  | 'MEMBERS' 
  | 'TURIHAMWE' 
  | 'TRANSACTIONS' 
  | 'CLAIMS' 
  | 'REPORTS' 
  | 'SMS/NOTIFICATIONS'
  | 'ALERTS'
  | 'ADMINISTRATION' 
  | 'SECURITY/AUDIT';

export interface PermissionDefinition {
  code: PermissionCode;
  name: string;
  category: PermissionCategory;
  description: string;
}

export interface Role {
  id: string;
  name: string;
  code: string;
  description: string;
  isSystem: boolean;
  permissions: PermissionCode[];
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  username: string; // 4 - 10 chars as per rules
  fullName: string;
  email?: string;
  phone?: string;
  passwordHash?: string;
  roleId: string;
  roleName?: string;
  roleCode?: string;
  primaryBranchId: string;
  allowedBranchIds: string[]; // for multi-branch users
  hasMultiBranchAccess: boolean;
  isActive: boolean;
  requiresPasswordReset: boolean;
  directPermissions: PermissionCode[]; // custom user permissions
  revokedPermissions: PermissionCode[]; // custom revoked permissions
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  token: string;
  user: User;
  workingBranch: Branch;
  effectivePermissions: PermissionCode[];
  expiresAt: string;
}

export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'BRANCH_SWITCH'
  | 'MEMBER_CREATED'
  | 'MEMBER_EDITED'
  | 'MEMBER_STATUS_CHANGED'
  | 'MEMBER_DELETED'
  | 'MEMBER_DEACTIVATED'
  | 'MEMBER_CORRECTION'
  | 'BENEFICIARY_ADDED'
  | 'BENEFICIARY_UPDATED'
  | 'BENEFICIARY_REMOVED'
  | 'CONTRIBUTION_RECORDED'
  | 'CONTRIBUTION_CORRECTED'
  | 'RENEWAL_RECORDED'
  | 'RENEWAL_CORRECTED'
  | 'PLAN_REGISTERED'
  | 'PLAN_REACTIVATED'
  | 'PLAN_STATUS_CHANGED'
  | 'REACTIVATION_ATTEMPT_REJECTED'
  | 'CLAIM_CREATED'
  | 'CLAIM_EDITED'
  | 'CLAIM_DOC_UPLOADED'
  | 'CLAIM_DOC_REPLACED'
  | 'CLAIM_REVIEWED'
  | 'CLAIM_DOCS_REQUESTED'
  | 'CLAIM_STATUS_CHANGED'
  | 'CLAIM_VERIFIED'
  | 'CLAIM_APPROVED'
  | 'CLAIM_REJECTED'
  | 'CLAIM_CLOSED'
  | 'CLAIM_PAYMENT_RECORDED'
  | 'BENEFIT_RECORDED'
  | 'DUPLICATE_CLAIM_OVERRIDDEN'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'USER_ENABLED'
  | 'USER_DISABLED'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET'
  | 'BRANCH_ACCESS_CHANGED'
  | 'RIGHTS_ASSIGNED'
  | 'RIGHTS_MODIFIED'
  | 'ROLE_CREATED'
  | 'ROLE_MODIFIED'
  | 'ROLE_DELETED'
  | 'SYSTEM_SETTING_CHANGED'
  | 'BUSINESS_RULE_CONFIGURED'
  | 'SYNC_PUSH'
  | 'SYNC_PULL'
  | 'SYNC_CONFLICT_RESOLVED'
  | 'BACKUP_CREATED'
  | 'BACKUP_VERIFIED'
  | 'BACKUP_RESTORED'
  | 'BACKUP_CONFIG_CHANGED'
  | 'SESSION_INVALIDATED'
  | 'SYSTEM_ERROR_LOGGED'
  | 'INITIAL_ADMIN_SETUP'
  | 'REPORT_GENERATED'
  | 'REPORT_EXPORTED'
  | 'SMS_QUEUED'
  | 'SMS_SENT'
  | 'SMS_FAILED'
  | 'SMS_RETRIED'
  | 'SMS_DELIVERY_CONFIRMED'
  | 'SMS_DELIVERY_FAILED'
  | 'SMS_TEMPLATE_CREATED'
  | 'SMS_TEMPLATE_UPDATED'
  | 'ALERT_CREATED'
  | 'ALERT_DISMISSED'
  | 'ALERT_RESOLVED';

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  username: string;
  userFullName: string;
  branchId: string;
  branchName: string;
  action: AuditAction;
  recordType: string;
  recordId?: string;
  previousValue?: string;
  newValue?: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  isSynced: boolean;
}

export interface SaccoMember {
  saccoAccountNumber: string; // Primary identifier, strictly unique
  fullName: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  dateOfBirth: string;
  nationalIdNumber: string;
  primaryPhone: string;
  alternativePhone?: string;
  emailAddress?: string;
  district: string;
  subCounty: string;
  parish: string;
  village: string;
  registrationDate: string;
  branchId: string;
  branchName?: string;
  createdById?: string;
  createdByUsername?: string;
  isLockedFromNormalEdit?: boolean;
  turihamweStatus?: 'ACTIVE' | 'EXPIRED' | 'UNREGISTERED' | 'SUSPENDED';
  clientStatus?: 'ALIVE' | 'DECEASED'; // Explicit client vitality status (default: ALIVE)
  clientStatusUpdatedAt?: string;
  clientStatusUpdatedByUserId?: string;
  clientStatusUpdatedByUsername?: string;
  clientStatusReason?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedByUserId?: string;
  deletedByUsername?: string;
  deletedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ControlledCorrection {
  id: string;
  saccoAccountNumber: string;
  userId: string;
  username: string;
  branchId: string;
  branchName: string;
  timestamp: string;
  fieldChanged: string;
  previousValue: string;
  newValue: string;
  reason: string;
}

export type SyncState = 'OFFLINE' | 'SYNCHRONIZING' | 'SYNCHRONIZED' | 'SYNC_ERROR';

export interface SyncRecord {
  id: string;
  entityType: string;
  entityId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payloadJson: string;
  localTimestamp: string;
  branchId: string;
  userId: string;
  status: 'PENDING' | 'SYNCED' | 'CONFLICT' | 'FAILED';
  errorMessage?: string;
  retryCount: number;
}

// ==========================================
// TURIHAMWE CORE TYPES (PHASE 3 & 4)
// ==========================================

export type TurihamwePlanStatus =
  | 'ACTIVE'
  | 'PENDING'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'REACTIVATION_PENDING'
  | 'CANCELLED';

export interface TurihamwePlan {
  id: string; // e.g. "PLN-NYA-001042"
  saccoAccountNumber: string; // Strictly linked to existing SACCO member
  memberName: string;
  planCode: string; // e.g. "STANDARD"
  status: TurihamwePlanStatus;
  enrolmentDate: string;
  effectiveStartDate: string;
  currentExpiryDate: string;
  lastRenewalDate?: string;
  registeredBranchId: string;
  registeredBranchName?: string;
  registeredByUserId: string;
  registeredByUsername?: string;
  beneficiaryCount?: number;
  totalContributionsAmount?: number;
  lastContributionDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Beneficiary {
  id: string;
  saccoAccountNumber: string;
  planId: string;
  fullName: string;
  relationship: string;
  dateOfBirth?: string;
  nationalIdNumber?: string;
  contactPhone?: string;
  percentageAllocation: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ContributionStatus = 'CONFIRMED' | 'RECORDED' | 'CORRECTED' | 'CANCELLED';

export interface Contribution {
  id: string;
  receiptNumber: string; // Unique reference e.g. "TRH-CTR-2026-0001"
  saccoAccountNumber: string; // Strictly linked to existing SACCO member
  memberName: string;
  planId: string; // Strictly linked to TurihamwePlan
  branchId: string;
  branchName?: string;
  receivedByUserId: string;
  receivedByUsername?: string;
  amount: number; // Configurable / unprescribed amount
  paymentMethod: 'CASH' | 'SACCO_TRANSFER' | 'MOBILE_MONEY' | 'BANK_DRAFT';
  contributionDate: string;
  status: ContributionStatus;
  periodCoveredStart?: string;
  periodCoveredEnd?: string;
  remarks?: string;
  correctionReason?: string;
  correctedByUserId?: string;
  correctedAt?: string;
  createdAt: string;
  updatedAt: string;
  isSynced?: boolean;
}

export type RenewalStatus = 'RECORDED' | 'ACTIVE' | 'PENDING_POLICY_RULE' | 'REJECTED';

export interface Renewal {
  id: string;
  renewalReference: string; // Unique reference e.g. "TRH-RNW-2026-0001"
  planId: string; // Strictly linked to TurihamwePlan
  saccoAccountNumber: string; // Strictly linked to SaccoMember
  memberName: string;
  branchId: string;
  branchName?: string;
  processedByUserId: string;
  processedByUsername?: string;
  renewalDate: string;
  effectiveDate: string;
  previousExpiryDate: string;
  newExpiryDate: string;
  previousPlanStatus: TurihamwePlanStatus;
  resultingPlanStatus: TurihamwePlanStatus;
  renewalFee?: number; // Configurable / pending calculation
  receiptReference?: string;
  renewalStatus: RenewalStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  isSynced?: boolean;
}

export type ExpiryAlertCategory =
  | 'EXPIRING_30_DAYS'
  | 'EXPIRING_14_DAYS'
  | 'EXPIRING_7_DAYS'
  | 'EXPIRES_TODAY'
  | 'POST_EXPIRY_FOLLOW_UP';

export interface ExpiryRecord {
  planId: string;
  saccoAccountNumber: string;
  memberName: string;
  branchId: string;
  branchName: string;
  planStatus: TurihamwePlanStatus;
  currentExpiryDate: string;
  daysUntilExpiry: number; // Negative if past expiry
  alertCategory: ExpiryAlertCategory;
  lastRenewalDate?: string;
  lastRenewalReference?: string;
  isFollowUpRequired: boolean;
  followUpStatus?: 'PENDING' | 'CONTACTED' | 'RENEWED' | 'REACTIVATION_REQUESTED' | 'DISCONTINUED';
  notes?: string;
}

export interface PlanReactivationLog {
  id: string;
  planId: string;
  saccoAccountNumber: string;
  memberName: string;
  branchId: string;
  branchName: string;
  requestedByUserId: string;
  requestedByUsername: string;
  timestamp: string;
  previousStatus: TurihamwePlanStatus;
  newStatus: TurihamwePlanStatus;
  previousExpiryDate: string;
  newExpiryDate?: string;
  justificationReason: string;
  status: 'COMPLETED' | 'PENDING_EXECUTIVE_APPROVAL';
}

/**
 * CONFIGURABLE BUSINESS RULES ENGINE
 * Explicitly models all unconfirmed business rules as configurable state rather than invented hardcoded values.
 */
export interface BusinessRulesConfig {
  contributionAmount: {
    status: 'PENDING_INSTITUTIONAL_APPROVAL';
    defaultAmount: number | null;
    isConfigurable: true;
    notes: string;
  };
  contributionFrequency: {
    status: 'PENDING_INSTITUTIONAL_APPROVAL';
    allowedFrequencies: string[];
    defaultFrequency: string | null;
    isConfigurable: true;
    notes: string;
  };
  gracePeriodDays: {
    status: 'PENDING_INSTITUTIONAL_APPROVAL';
    defaultDays: number | null;
    isConfigurable: true;
    notes: string;
  };
  renewalCoverPeriodMonths: {
    status: 'PENDING_INSTITUTIONAL_APPROVAL';
    defaultMonths: number | null;
    isConfigurable: true;
    notes: string;
  };
  reactivationEligibility: {
    status: 'PENDING_EXECUTIVE_POLICY';
    requiresBoardApproval: boolean;
    isConfigurable: true;
    notes: string;
  };
  // PHASE 5: CLAIM BUSINESS RULES (CONFIGURABLE & PENDING INSTITUTIONAL RATIFICATION)
  claimQualifyingEvents: {
    status: 'PENDING_INSTITUTIONAL_APPROVAL';
    allowedEvents: string[];
    isConfigurable: true;
    notes: string;
  };
  claimWaitingPeriodDays: {
    status: 'PENDING_INSTITUTIONAL_APPROVAL';
    defaultDays: number | null;
    isConfigurable: true;
    notes: string;
  };
  claimExclusions: {
    status: 'PENDING_INSTITUTIONAL_APPROVAL';
    exclusionList: string[];
    isConfigurable: true;
    notes: string;
  };
  claimBenefitCalculation: {
    status: 'PENDING_INSTITUTIONAL_APPROVAL';
    benefitFormulaDescription: string | null;
    isConfigurable: true;
    notes: string;
  };
  claimFilingDeadlineDays: {
    status: 'PENDING_INSTITUTIONAL_APPROVAL';
    maxDaysFromIncident: number | null;
    isConfigurable: true;
    notes: string;
  };
  claimApprovalHierarchy: {
    status: 'PENDING_INSTITUTIONAL_APPROVAL';
    requiresExecutiveApproval: boolean;
    requiresDualSignOffAboveThreshold: boolean;
    isConfigurable: true;
    notes: string;
  };
  // PHASE 7: BUSINESS SETTINGS FRAMEWORK (UNCONFIRMED VALUES ARE CONFIGURABLE, NOT INVENTED)
  notificationTiming: {
    status: 'ACTIVE_POLICY';
    confirmedIntervalsDays: number[]; // [30, 14, 7, 0, -1]
    isConfigurable: true;
    notes: string;
  };
  eligibilityRules: {
    status: 'PENDING_INSTITUTIONAL_APPROVAL';
    minMembershipDurationDays: number | null;
    minSavingsBalanceUGX: number | null;
    isConfigurable: true;
    notes: string;
  };
  claimRequirements: {
    status: 'PENDING_INSTITUTIONAL_APPROVAL';
    mandatoryDocumentTypes: string[];
    isConfigurable: true;
    notes: string;
  };
}

// ==========================================
// TURIHAMWE CLAIMS TYPES (PHASE 5)
// ==========================================

export type ClaimStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'AWAITING_DOCUMENTS'
  | 'APPROVED'
  | 'REJECTED'
  | 'CLOSED';

export type ClaimCategory =
  | 'DEATH_OF_MEMBER'
  | 'DEATH_OF_BENEFICIARY'
  | 'CRITICAL_ILLNESS_PENDING_POLICY'
  | 'PERMANENT_DISABILITY_PENDING_POLICY'
  | 'OTHER_EVENT';

export type DocumentCategory =
  | 'DEATH_CERTIFICATE'
  | 'NATIONAL_ID_COPY'
  | 'BURIAL_PERMIT'
  | 'POLICE_REPORT'
  | 'MEDICAL_REPORT'
  | 'LC1_CHAIRPERSON_LETTER'
  | 'SACCO_PASSBOOK_COPY'
  | 'OTHER_SUPPORTING_DOC';

export type ClaimDocumentStatus =
  | 'VALID'
  | 'REQUIRES_CLARIFICATION'
  | 'REPLACED'
  | 'SUPERSEDED';

export interface ClaimDocument {
  id: string;
  claimId: string;
  documentCategory: DocumentCategory;
  documentTitle: string;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
  fileDataUrl?: string; // base64 preview for documents
  uploadedByUserId: string;
  uploadedByUsername: string;
  uploadedByUserFullName: string;
  branchId: string;
  branchName: string;
  uploadedAt: string;
  status: ClaimDocumentStatus;
  version: number;
  replacedById?: string;
  replacementReason?: string;
  notes?: string;
}

export interface ClaimReviewRecord {
  id: string;
  claimId: string;
  reviewerUserId: string;
  reviewerUsername: string;
  reviewerFullName: string;
  branchId: string;
  branchName: string;
  reviewDate: string;
  reviewNotes: string;
  statusAssigned: ClaimStatus;
  requestedDocuments?: string[];
  createdAt: string;
}

export interface ClaimPaymentInfo {
  paymentReference: string; // e.g. "CHQ-2026-081" or "MOMO-TXN-902"
  paymentDate: string;
  disbursementNotes?: string;
  recordedByUserId: string;
  recordedByUsername: string;
  recordedAt: string;
}

export interface ClaimApprovalRejectionRecord {
  decision: 'APPROVED' | 'REJECTED';
  decidedByUserId: string;
  decidedByUsername: string;
  decidedByFullName: string;
  branchId: string;
  branchName: string;
  decisionDate: string;
  reasonOrReference: string;
  decisionNotes?: string;
}

export interface TurihamweClaim {
  id: string;
  claimReference: string; // Unique reference e.g. "CLM-NYA-2026-0001"
  saccoAccountNumber: string; // Strictly linked to existing SACCO member
  memberName: string;
  planId: string; // Strictly linked to TurihamwePlan
  planCode?: string;
  beneficiaryId?: string;
  beneficiaryName?: string;
  beneficiaryRelationship?: string;
  branchId: string; // Originating branch
  branchName: string;
  claimDate: string;
  status: ClaimStatus;
  claimCategory: ClaimCategory;
  incidentDate: string;
  incidentDescription: string;
  preparerUserId: string;
  preparerUsername: string;
  preparerFullName: string;
  supportingDocuments: ClaimDocument[];
  reviewHistory: ClaimReviewRecord[];
  latestReviewNotes?: string;
  requestedDocumentsNotes?: string;
  approvalRecord?: ClaimApprovalRejectionRecord;
  rejectionRecord?: ClaimApprovalRejectionRecord;
  paymentInfo?: ClaimPaymentInfo;
  duplicateWarningAcknowledged?: boolean;
  duplicateOverrideReason?: string;
  createdAt: string;
  updatedAt: string;
  isSynced?: boolean;
}

// ==========================================
// PHASE 6: SMS NOTIFICATIONS & TEMPLATES
// ==========================================

export type SmsTemplateCategory =
  | 'EXPIRY_REMINDER_30_DAYS'
  | 'EXPIRY_REMINDER_14_DAYS'
  | 'EXPIRY_REMINDER_7_DAYS'
  | 'EXPIRY_DATE_NOTICE'
  | 'POST_EXPIRY_FOLLOWUP'
  | 'CONTRIBUTION_RECEIVED'
  | 'RENEWAL_CONFIRMED'
  | 'CLAIM_SUBMITTED'
  | 'CLAIM_DOCS_REQUESTED'
  | 'CLAIM_APPROVED'
  | 'CLAIM_REJECTED'
  | 'CUSTOM_ANNOUNCEMENT';

export interface SmsTemplate {
  id: string;
  code: string;
  category: SmsTemplateCategory;
  name: string;
  templateText: string;
  availableVariables: string[];
  isActive: boolean;
  branchId?: string;
  createdByUserId: string;
  createdByUserFullName: string;
  updatedByUserId?: string;
  updatedByUserFullName?: string;
  createdAt: string;
  updatedAt: string;
}

export type SmsStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';

export interface SmsMessage {
  id: string;
  eventId?: string;
  eventReferenceKey?: string;
  recipientPhone: string;
  recipientName: string;
  saccoAccountNumber?: string;
  planId?: string;
  claimId?: string;
  branchId: string;
  branchName: string;
  messageText: string;
  templateCategory?: SmsTemplateCategory;
  status: SmsStatus;
  retryCount: number;
  maxRetries: number;
  sentAt?: string;
  failedAt?: string;
  failureReason?: string;
  provider: 'AFRICAS_TALKING' | 'PANDORA';
  providerMessageId?: string;
  providerCostUGX?: number;
  deliveryStatus?: string;
  queuedByUserId: string;
  queuedByUserFullName: string;
  createdAt: string;
  updatedAt: string;
  isSynced?: boolean;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  lockedAt?: string;
  lockedBy?: string;
  deliveryConfirmed?: boolean;
  deliveryReceiptAt?: string;
  deliveryReceiptNetworkCode?: string;
  deliveryReceiptRawStatus?: string;
}

export type SmsDeliveryStatus =
  | 'Pending'
  | 'Submitted'
  | 'Buffered'
  | 'Delivered'
  | 'Failed'
  | 'Rejected'
  | 'AbsentSubscriber'
  | 'Expired'
  | 'SimulatedSandbox'
  | 'Unknown';

export type SmsConfigurationStatus = 'CONFIGURED' | 'MISSING' | 'INVALID' | 'DISABLED';
export type SmsWorkerStatus = 'RUNNING' | 'STOPPED' | 'PAUSED';

export interface SmsProviderDiagnostics {
  provider: "Africa's Talking" | "Pandora Networks";
  environment: 'SANDBOX' | 'PRODUCTION';
  configurationStatus: SmsConfigurationStatus;
  configurationMessage: string;
  workerStatus: SmsWorkerStatus;
  workerIntervalSeconds: number;
  isSubmissionEnabled: boolean;
  senderId: string;
  hasApiKey: boolean;
  isPlaceholderKey: boolean;
  counts: {
    total: number;
    pending: number;
    sending: number;
    sent: number;
    deliveredConfirmed: number;
    failed: number;
    retrying: number;
  };
  lastSuccessfulSubmissionTime?: string;
  lastSubmissionAttemptTime?: string;
  lastErrorSanitized?: string;
  lastErrorTime?: string;
  balanceEstimateUGX?: string | null;
  sandboxNotice?: string;
  deliveryReceiptsSupported: boolean;
}

export type NotificationEventType =
  | 'EXPIRY_30_DAYS'
  | 'EXPIRY_14_DAYS'
  | 'EXPIRY_7_DAYS'
  | 'EXPIRY_DUE_TODAY'
  | 'POST_EXPIRY_GRACE'
  | 'CLAIM_SUBMITTED'
  | 'CLAIM_DOCUMENTS_REQUESTED'
  | 'CLAIM_APPROVED'
  | 'CLAIM_REJECTED'
  | 'CONTRIBUTION_LOGGED'
  | 'SYSTEM_ALERT';

export interface NotificationEvent {
  id: string;
  eventType: NotificationEventType;
  deduplicationKey: string;
  saccoAccountNumber?: string;
  memberName?: string;
  recipientPhone?: string;
  planId?: string;
  claimId?: string;
  claimReference?: string;
  branchId: string;
  branchName: string;
  description: string;
  processed: boolean;
  processedAt?: string;
  smsMessageId?: string;
  createdAt: string;
}

// ==========================================
// PHASE 6: IN-SYSTEM ALERT CENTER
// ==========================================

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type AlertCategory =
  | 'UPCOMING_EXPIRY'
  | 'EXPIRED_PLAN'
  | 'PENDING_RENEWAL'
  | 'CLAIM_AWAITING_REVIEW'
  | 'CLAIM_AWAITING_DOCS'
  | 'SMS_FAILURE'
  | 'SYNC_ERROR'
  | 'SYSTEM_EVENT';

export type AlertStatus = 'UNREAD' | 'READ' | 'RESOLVED';

export interface SystemAlert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  message: string;
  branchId: string;
  branchName: string;
  linkTab?: 'turihamwe' | 'claims' | 'transactions' | 'reports' | 'system';
  recordId?: string;
  requiredPermission?: PermissionCode;
  status: AlertStatus;
  readByUsers: string[];
  resolvedByUserId?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// PHASE 6: ADVANCED REPORTING & EXPORT LOGS
// ==========================================

export type ReportCategory =
  | 'MEMBERS'
  | 'TURIHAMWE'
  | 'CONTRIBUTIONS'
  | 'RENEWALS'
  | 'CLAIMS'
  | 'PERFORMANCE'
  | 'AUDIT'
  | 'SYSTEM';

export interface ReportGenerationLog {
  id: string;
  reportCode: string;
  reportTitle: string;
  reportCategory: ReportCategory;
  branchId: string;
  branchName: string;
  generatedByUserId: string;
  generatedByUsername: string;
  generatedByUserFullName: string;
  dateRange: string;
  filterParamsJson: string;
  isExport: boolean;
  exportFormat?: 'EXCEL' | 'PDF' | 'CSV';
  recordCount: number;
  timestamp: string;
}

export interface MonthlyBranchSummary {
  month: number;
  year: number;
  monthName: string;
  branchId: string;
  branchName: string;
  newRegistrations: number;
  activePlans: number;
  expiredPlans: number;
  renewalsCompleted: number;
  claimsSubmitted: number;
  claimsApproved: number;
  claimsRejected: number;
  claimsSettled: number;
  smsDispatched: number;
  smsFailed: number;
  financials?: {
    totalContributionsUGX: number;
    renewalPremiumsUGX: number;
    benefitsPaidUGX: number;
  };
}

// ==========================================
// PHASE 7: BACKUP, RESTORE & SYSTEM HEALTH
// ==========================================

export type BackupStatus = 'COMPLETED' | 'VERIFIED' | 'FAILED' | 'RESTORING' | 'RESTORED';
export type BackupType = 'MANUAL' | 'SCHEDULED';

export interface BackupRecord {
  id: string; // e.g. "BKP-20260928-142500"
  filename: string;
  createdAt: string;
  sizeBytes: number;
  checksum: string; // SHA-256 integrity hash
  createdByUserId: string;
  createdByUsername: string;
  createdByUserFullName: string;
  type: BackupType;
  status: BackupStatus;
  verifiedAt?: string;
  verifiedByUserId?: string;
  verifiedByUsername?: string;
  verificationDetails?: string;
  notes?: string;
  recordCounts: {
    members: number;
    plans: number;
    contributions: number;
    renewals: number;
    claims: number;
    users: number;
    auditLogs: number;
  };
}

export interface BackupConfig {
  scheduledBackupsEnabled: boolean;
  backupFrequency: 'DAILY' | 'TWICE_DAILY' | 'WEEKLY' | 'CUSTOM';
  cronScheduleDescription: string;
  retentionDays: number | null; // Configurable, not hardcoded
  backupStorageLocation: string;
  encryptionEnabled: boolean;
  notifyOnFailure: boolean;
  lastBackupAt?: string;
  nextScheduledBackupAt?: string;
  lastVerificationStatus?: 'SUCCESS' | 'FAILED' | 'NEVER';
  lastVerificationAt?: string;
  updatedAt: string;
  updatedByUserId: string;
}

export interface SystemHealthMetrics {
  application: {
    status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
    uptimeSeconds: number;
    version: string;
    nodeEnv: string;
    timestamp: string;
    memoryUsageMB: number;
  };
  database: {
    status: 'HEALTHY' | 'DEGRADED' | 'ERROR';
    type: 'PostgreSQL_Central_Storage';
    totalRecords: number;
    tableCounts: {
      branches: number;
      users: number;
      roles: number;
      members: number;
      plans: number;
      beneficiaries: number;
      contributions: number;
      renewals: number;
      claims: number;
      auditLogs: number;
      smsQueue: number;
    };
    lastWriteAt: string;
  };
  localSQLite: {
    status: 'SYNCHRONIZED' | 'PENDING_TRANSACTIONS' | 'OFFLINE';
    storageEngine: 'sql.js_IndexedDB';
    localRecordsCount: number;
  };
  centralPostgresConnectivity: {
    status: 'CONNECTED' | 'DISCONNECTED' | 'LATENCY_HIGH';
    latencyMs: number;
    lastHeartbeat: string;
  };
  sync: {
    status: 'SYNCHRONIZED' | 'SYNCHRONIZING' | 'OFFLINE' | 'SYNC_ERROR';
    pendingRecordsCount: number;
    failedRecordsCount: number;
    conflictCount: number;
    lastSuccessfulSyncAt: string | null;
    lastAttemptAt: string | null;
    errorDetails: string | null;
  };
  smsGateway: {
    status: 'OPERATIONAL' | 'DEGRADED' | 'DISCONNECTED';
    provider: 'AFRICAS_TALKING';
    pendingCount: number;
    sentCount: number;
    failedCount: number;
    failureRatePercent: number;
  };
  backups: {
    status: 'HEALTHY' | 'WARNING' | 'NO_BACKUPS';
    totalBackups: number;
    lastBackupAt: string | null;
    lastBackupStatus: string | null;
    lastVerifiedAt: string | null;
    autoBackupsEnabled: boolean;
  };
  recentErrors: Array<{
    id: string;
    timestamp: string;
    source: 'SYNC' | 'SMS' | 'AUTH' | 'DATABASE' | 'SYSTEM';
    message: string;
    details?: string;
    branchId?: string;
  }>;
}

export interface UserAuditHistory {
  user: User;
  activityLogs: AuditLog[];
  actionsPerformed: AuditLog[];
  permissionChangeHistory: AuditLog[];
}
