import Dexie, { Table } from 'dexie';
import {
  Branch,
  Role,
  User,
  AuditLog,
  SaccoMember,
  TurihamwePlan,
  Beneficiary,
  Contribution,
  Renewal,
  PlanReactivationLog,
  TurihamweClaim,
  ClaimDocument,
  ClaimReviewRecord,
  SmsTemplate,
  SmsMessage,
  NotificationEvent,
  SystemAlert,
  ReportGenerationLog
} from '../../types';

export interface LocalSyncQueueItem {
  id: string;
  entityType: string;
  entityId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payloadJson: string;
  createdAt: string;
  branchId: string;
  userId: string;
  status: 'PENDING' | 'SYNCING' | 'CONFLICT' | 'ERROR';
  retryCount: number;
  errorMessage?: string;
}

export interface LocalConflict {
  id: string;
  queueId: string;
  entityType: string;
  entityId: string;
  clientVersionJson: string;
  serverVersionJson: string;
  detectedAt: string;
  status: 'UNRESOLVED' | 'RESOLVED_LOCAL' | 'RESOLVED_REMOTE';
}

export class TurihamweLocalDatabase extends Dexie {
  branches!: Table<Branch, string>;
  users!: Table<User, string>;
  roles!: Table<Role, string>;
  members!: Table<SaccoMember, string>;
  plans!: Table<TurihamwePlan, string>;
  beneficiaries!: Table<Beneficiary, string>;
  contributions!: Table<Contribution, string>;
  renewals!: Table<Renewal, string>;
  reactivations!: Table<PlanReactivationLog, string>;
  auditLogs!: Table<AuditLog, string>;
  syncQueue!: Table<LocalSyncQueueItem, string>;
  syncConflicts!: Table<LocalConflict, string>;
  claims!: Table<TurihamweClaim, string>;
  claimDocuments!: Table<ClaimDocument, string>;
  claimReviews!: Table<ClaimReviewRecord, string>;
  smsTemplates!: Table<SmsTemplate, string>;
  smsQueue!: Table<SmsMessage, string>;
  notificationEvents!: Table<NotificationEvent, string>;
  systemAlerts!: Table<SystemAlert, string>;
  reportLogs!: Table<ReportGenerationLog, string>;

  constructor() {
    super('Turihamwe_Branch_LocalDB');
    this.version(2).stores({
      branches: 'id, code, name',
      users: 'id, username, primaryBranchId',
      roles: 'id, code',
      members: 'saccoAccountNumber, fullName, branchId, registrationDate',
      plans: 'id, saccoAccountNumber, status, registeredBranchId, currentExpiryDate',
      beneficiaries: 'id, saccoAccountNumber, planId',
      contributions: 'id, receiptNumber, saccoAccountNumber, planId, branchId, contributionDate, status',
      renewals: 'id, renewalReference, planId, saccoAccountNumber, branchId, renewalDate',
      reactivations: 'id, planId, saccoAccountNumber, timestamp',
      auditLogs: 'id, timestamp, branchId, userId, action',
      syncQueue: 'id, entityType, entityId, status, createdAt',
      syncConflicts: 'id, queueId, entityType, entityId, status',
    });

    this.version(3).stores({
      branches: 'id, code, name',
      users: 'id, username, primaryBranchId',
      roles: 'id, code',
      members: 'saccoAccountNumber, fullName, branchId, registrationDate',
      plans: 'id, saccoAccountNumber, status, registeredBranchId, currentExpiryDate',
      beneficiaries: 'id, saccoAccountNumber, planId',
      contributions: 'id, receiptNumber, saccoAccountNumber, planId, branchId, contributionDate, status',
      renewals: 'id, renewalReference, planId, saccoAccountNumber, branchId, renewalDate',
      reactivations: 'id, planId, saccoAccountNumber, timestamp',
      auditLogs: 'id, timestamp, branchId, userId, action, recordId, recordType',
      syncQueue: 'id, entityType, entityId, status, createdAt',
      syncConflicts: 'id, queueId, entityType, entityId, status',
    });

    this.version(4).stores({
      branches: 'id, code, name',
      users: 'id, username, primaryBranchId',
      roles: 'id, code',
      members: 'saccoAccountNumber, fullName, branchId, registrationDate',
      plans: 'id, saccoAccountNumber, status, registeredBranchId, currentExpiryDate',
      beneficiaries: 'id, saccoAccountNumber, planId',
      contributions: 'id, receiptNumber, saccoAccountNumber, planId, branchId, contributionDate, status',
      renewals: 'id, renewalReference, planId, saccoAccountNumber, branchId, renewalDate',
      reactivations: 'id, planId, saccoAccountNumber, timestamp',
      auditLogs: 'id, timestamp, branchId, userId, action, recordId, recordType',
      syncQueue: 'id, entityType, entityId, status, createdAt',
      syncConflicts: 'id, queueId, entityType, entityId, status',
      claims: 'id, claimReference, saccoAccountNumber, planId, branchId, status, claimDate, createdAt',
      claimDocuments: 'id, claimId, branchId, documentCategory, status, uploadedAt',
      claimReviews: 'id, claimId, reviewerUserId, branchId, reviewDate',
    });

    this.version(5).stores({
      branches: 'id, code, name',
      users: 'id, username, primaryBranchId',
      roles: 'id, code',
      members: 'saccoAccountNumber, fullName, branchId, registrationDate',
      plans: 'id, saccoAccountNumber, status, registeredBranchId, currentExpiryDate',
      beneficiaries: 'id, saccoAccountNumber, planId',
      contributions: 'id, receiptNumber, saccoAccountNumber, planId, branchId, contributionDate, status',
      renewals: 'id, renewalReference, planId, saccoAccountNumber, branchId, renewalDate',
      reactivations: 'id, planId, saccoAccountNumber, timestamp',
      auditLogs: 'id, timestamp, branchId, userId, action, recordId, recordType',
      syncQueue: 'id, entityType, entityId, status, createdAt',
      syncConflicts: 'id, queueId, entityType, entityId, status',
      claims: 'id, claimReference, saccoAccountNumber, planId, branchId, status, claimDate, createdAt',
      claimDocuments: 'id, claimId, branchId, documentCategory, status, uploadedAt',
      claimReviews: 'id, claimId, reviewerUserId, branchId, reviewDate',
      smsTemplates: 'id, code, category, branchId, isActive',
      smsQueue: 'id, eventId, eventReferenceKey, recipientPhone, branchId, status, createdAt',
      notificationEvents: 'id, eventType, deduplicationKey, branchId, saccoAccountNumber, processed, createdAt',
      systemAlerts: 'id, category, severity, branchId, status, createdAt',
      reportLogs: 'id, reportCode, reportCategory, branchId, generatedByUserId, timestamp',
    });
  }

  public async clearAllOperationalData(): Promise<void> {
    try {
      await Promise.all([
        this.members.clear(),
        this.plans.clear(),
        this.beneficiaries.clear(),
        this.contributions.clear(),
        this.renewals.clear(),
        this.reactivations.clear(),
        this.claims.clear(),
        this.claimDocuments.clear(),
        this.claimReviews.clear(),
        this.auditLogs.clear(),
        this.syncQueue.clear(),
        this.syncConflicts.clear(),
        this.smsQueue.clear(),
        this.systemAlerts.clear(),
        this.reportLogs.clear(),
      ]);
    } catch (err) {
      console.warn('Could not clear some local IndexedDB tables:', err);
    }
  }
}

export const localDb = new TurihamweLocalDatabase();

