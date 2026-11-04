import { localDb, LocalSyncQueueItem } from './sqliteEngine';
import {
  SaccoMember,
  AuditLog,
  AuditAction,
  TurihamwePlan,
  Contribution,
  Renewal,
  PlanReactivationLog,
  TurihamweClaim,
  ClaimDocument,
  ClaimReviewRecord,
  ClaimStatus,
  ClaimPaymentInfo,
  ClaimApprovalRejectionRecord,
  SmsMessage,
  SmsTemplate,
  SystemAlert,
  ReportGenerationLog
} from '../../types';
import { isWithinUgandaFiveDaysWindow } from '../../utils/timezone';

export class LocalRepository {
  // --- Audit Trail ---
  public static async recordLocalAudit(params: {
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
  }): Promise<AuditLog> {
    const log: AuditLog = {
      id: `local-aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      userId: params.userId,
      username: params.username,
      userFullName: params.userFullName,
      branchId: params.branchId,
      branchName: params.branchName,
      action: params.action,
      recordType: params.recordType,
      recordId: params.recordId,
      previousValue: params.previousValue,
      newValue: params.newValue,
      reason: params.reason,
      isSynced: false,
    };

    await localDb.auditLogs.put(log);

    // Queue for sync
    await this.queueForSync({
      entityType: 'AUDIT_LOG',
      entityId: log.id,
      operation: 'INSERT',
      payload: log,
      branchId: params.branchId,
      userId: params.userId,
    });

    return log;
  }

  // --- Sync Queueing ---
  public static async queueForSync(params: {
    entityType: string;
    entityId: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    payload: unknown;
    branchId: string;
    userId: string;
  }): Promise<void> {
    const queueItem: LocalSyncQueueItem = {
      id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      entityType: params.entityType,
      entityId: params.entityId,
      operation: params.operation,
      payloadJson: JSON.stringify(params.payload),
      createdAt: new Date().toISOString(),
      branchId: params.branchId,
      userId: params.userId,
      status: 'PENDING',
      retryCount: 0,
    };

    await localDb.syncQueue.put(queueItem);
  }

  // --- Member Operations ---
  public static async searchMembers(query: string, includeDeleted = false): Promise<SaccoMember[]> {
    const clean = query.trim().toLowerCase();
    if (!clean) return [];

    // CRITICAL RULE: Member search must ONLY support:
    // 1. SACCO account number
    // 2. Member name
    const all = await localDb.members.toArray();
    return all.filter(m => 
      (includeDeleted || !m.isDeleted) &&
      (m.saccoAccountNumber.toLowerCase().includes(clean) ||
       m.fullName.toLowerCase().includes(clean))
    );
  }

  public static async getMemberByAccount(accountNumber: string): Promise<SaccoMember | undefined> {
    return localDb.members.get(accountNumber.trim().toUpperCase());
  }

  /**
   * Updates a member record in local storage and propagates changes to all dependent records
   * (plans, contributions, renewals, claims, SMS notifications) across the system.
   */
  public static async updateMemberLocally(updatedMember: SaccoMember): Promise<void> {
    try {
      if (typeof indexedDB === 'undefined' && (typeof window === 'undefined' || !window.indexedDB)) {
        return;
      }
      await localDb.members.put(updatedMember);

      const acc = updatedMember.saccoAccountNumber.toUpperCase();
      const newFullName = updatedMember.fullName?.trim();
      const newPhone = updatedMember.primaryPhone?.trim();

      // 1. Propagate changes to Turihamwe Insurance Plans
      const plans = await localDb.plans.where('saccoAccountNumber').equals(acc).toArray();
      for (const p of plans) {
        if (newFullName) p.memberName = newFullName;
        if (updatedMember.isDeleted || updatedMember.turihamweStatus === 'SUSPENDED') {
          p.status = 'SUSPENDED';
        } else if (updatedMember.turihamweStatus === 'ACTIVE') {
          p.status = 'ACTIVE';
        } else if (updatedMember.turihamweStatus === 'EXPIRED') {
          p.status = 'EXPIRED';
        }
        p.updatedAt = new Date().toISOString();
        await localDb.plans.put(p);
      }

      // 2. Propagate changes to Contributions
      const contribs = await localDb.contributions.where('saccoAccountNumber').equals(acc).toArray();
      for (const c of contribs) {
        if (newFullName) c.memberName = newFullName;
        c.updatedAt = new Date().toISOString();
        await localDb.contributions.put(c);
      }

      // 3. Propagate changes to Renewals
      const renewals = await localDb.renewals.where('saccoAccountNumber').equals(acc).toArray();
      for (const r of renewals) {
        if (newFullName) r.memberName = newFullName;
        r.updatedAt = new Date().toISOString();
        await localDb.renewals.put(r);
      }

      // 4. Propagate changes to Claims
      const claims = await localDb.claims.where('saccoAccountNumber').equals(acc).toArray();
      for (const cl of claims) {
        if (newFullName) cl.memberName = newFullName;
        cl.updatedAt = new Date().toISOString();
        await localDb.claims.put(cl);
      }

      // 5. Propagate changes to SMS Queue for pending messages
      if (newPhone || newFullName) {
        const allSms = await localDb.smsQueue.toArray();
        for (const sms of allSms) {
          if (sms.saccoAccountNumber?.toUpperCase() === acc && sms.status === 'PENDING') {
            if (newPhone) sms.recipientPhone = newPhone;
            if (newFullName) sms.recipientName = newFullName;
            sms.updatedAt = new Date().toISOString();
            await localDb.smsQueue.put(sms);
          }
        }
      }
    } catch {
      // Local database operation completed or skipped safely if indexedDB is unavailable
    }
  }

  /**
   * Helper: Check if member is within the 5-day normal editing window using Uganda calendar.
   */
  public static isWithinFiveDaysWindow(registrationDate: string): boolean {
    return isWithinUgandaFiveDaysWindow(registrationDate);
  }

  // --- Turihamwe Plan Local Operations ---
  public static async searchPlans(query: string): Promise<TurihamwePlan[]> {
    const clean = query.trim().toLowerCase();
    if (!clean) return localDb.plans.toArray();

    // Search strictly by SACCO account number or Member name
    const all = await localDb.plans.toArray();
    return all.filter(p =>
      p.saccoAccountNumber.toLowerCase().includes(clean) ||
      p.memberName.toLowerCase().includes(clean)
    );
  }

  public static async getPlanById(planId: string): Promise<TurihamwePlan | undefined> {
    return localDb.plans.get(planId);
  }

  public static async getPlanByAccount(accountNumber: string): Promise<TurihamwePlan | undefined> {
    const plans = await localDb.plans.where('saccoAccountNumber').equals(accountNumber.trim().toUpperCase()).toArray();
    return plans[0];
  }

  public static async savePlanLocally(plan: TurihamwePlan): Promise<void> {
    await localDb.plans.put(plan);
  }

  // --- Contribution Local Operations ---
  public static async recordLocalContribution(params: {
    saccoAccountNumber: string;
    memberName: string;
    planId: string;
    branchId: string;
    branchName: string;
    receivedByUserId: string;
    receivedByUsername: string;
    amount: number;
    paymentMethod: 'CASH' | 'SACCO_TRANSFER' | 'MOBILE_MONEY' | 'BANK_DRAFT';
    contributionDate: string;
    periodCoveredStart?: string;
    periodCoveredEnd?: string;
    remarks?: string;
  }): Promise<Contribution> {
    const receiptNumber = `TRH-CTR-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const contribution: Contribution = {
      id: `ctr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      receiptNumber,
      saccoAccountNumber: params.saccoAccountNumber.toUpperCase(),
      memberName: params.memberName,
      planId: params.planId,
      branchId: params.branchId,
      branchName: params.branchName,
      receivedByUserId: params.receivedByUserId,
      receivedByUsername: params.receivedByUsername,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      contributionDate: params.contributionDate,
      status: 'RECORDED',
      periodCoveredStart: params.periodCoveredStart,
      periodCoveredEnd: params.periodCoveredEnd,
      remarks: params.remarks,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSynced: false,
    };

    await localDb.contributions.put(contribution);

    // Queue for sync
    await this.queueForSync({
      entityType: 'CONTRIBUTION',
      entityId: contribution.id,
      operation: 'INSERT',
      payload: contribution,
      branchId: params.branchId,
      userId: params.receivedByUserId,
    });

    // Record audit
    await this.recordLocalAudit({
      userId: params.receivedByUserId,
      username: params.receivedByUsername,
      userFullName: params.receivedByUsername,
      branchId: params.branchId,
      branchName: params.branchName,
      action: 'CONTRIBUTION_RECORDED',
      recordType: 'CONTRIBUTION',
      recordId: contribution.receiptNumber,
      newValue: `Recorded UGX ${params.amount.toLocaleString()} contribution for account ${params.saccoAccountNumber} (Ref: ${receiptNumber})`,
    });

    return contribution;
  }

  // --- Renewal Local Operations ---
  public static async recordLocalRenewal(params: {
    planId: string;
    saccoAccountNumber: string;
    memberName: string;
    branchId: string;
    branchName: string;
    processedByUserId: string;
    processedByUsername: string;
    renewalDate: string;
    effectiveDate: string;
    previousExpiryDate: string;
    newExpiryDate: string;
    previousPlanStatus: TurihamwePlan['status'];
    resultingPlanStatus: TurihamwePlan['status'];
    renewalFee?: number;
    receiptReference?: string;
    notes?: string;
  }): Promise<Renewal> {
    const renewalReference = `TRH-RNW-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const renewal: Renewal = {
      id: `rnw-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      renewalReference,
      planId: params.planId,
      saccoAccountNumber: params.saccoAccountNumber.toUpperCase(),
      memberName: params.memberName,
      branchId: params.branchId,
      branchName: params.branchName,
      processedByUserId: params.processedByUserId,
      processedByUsername: params.processedByUsername,
      renewalDate: params.renewalDate,
      effectiveDate: params.effectiveDate,
      previousExpiryDate: params.previousExpiryDate,
      newExpiryDate: params.newExpiryDate,
      previousPlanStatus: params.previousPlanStatus,
      resultingPlanStatus: params.resultingPlanStatus,
      renewalFee: params.renewalFee,
      receiptReference: params.receiptReference,
      renewalStatus: 'RECORDED',
      notes: params.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSynced: false,
    };

    await localDb.renewals.put(renewal);

    // Update local plan expiry & status
    const existingPlan = await localDb.plans.get(params.planId);
    if (existingPlan) {
      existingPlan.currentExpiryDate = params.newExpiryDate;
      existingPlan.status = params.resultingPlanStatus;
      existingPlan.lastRenewalDate = params.renewalDate;
      existingPlan.updatedAt = new Date().toISOString();
      await localDb.plans.put(existingPlan);
    }

    // Queue for sync
    await this.queueForSync({
      entityType: 'RENEWAL',
      entityId: renewal.id,
      operation: 'INSERT',
      payload: renewal,
      branchId: params.branchId,
      userId: params.processedByUserId,
    });

    // Record audit
    await this.recordLocalAudit({
      userId: params.processedByUserId,
      username: params.processedByUsername,
      userFullName: params.processedByUsername,
      branchId: params.branchId,
      branchName: params.branchName,
      action: 'RENEWAL_RECORDED',
      recordType: 'RENEWAL',
      recordId: renewal.renewalReference,
      newValue: `Recorded renewal for ${params.saccoAccountNumber} extending expiry from ${params.previousExpiryDate} to ${params.newExpiryDate}`,
    });

    return renewal;
  }

  // ==========================================
  // CLAIMS MANAGEMENT (OFFLINE-FIRST)
  // ==========================================

  public static async getClaimsLocally(filter?: {
    branchId?: string;
    status?: string;
    searchQuery?: string;
    saccoAccountNumber?: string;
  }): Promise<TurihamweClaim[]> {
    let claims = await localDb.claims.toArray();

    if (filter?.branchId) {
      claims = claims.filter(c => c.branchId === filter.branchId);
    }

    if (filter?.status && filter.status !== 'ALL') {
      claims = claims.filter(c => c.status === filter.status);
    }

    if (filter?.saccoAccountNumber) {
      claims = claims.filter(c => c.saccoAccountNumber.toUpperCase() === filter.saccoAccountNumber!.toUpperCase());
    }

    if (filter?.searchQuery) {
      const q = filter.searchQuery.trim().toLowerCase();
      // CRITICAL RULE: Search must ONLY support Claim ID, SACCO account number, Member name
      claims = claims.filter(c =>
        c.claimReference.toLowerCase().includes(q) ||
        c.saccoAccountNumber.toLowerCase().includes(q) ||
        c.memberName.toLowerCase().includes(q)
      );
    }

    return claims.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static async getClaimByIdLocally(idOrRef: string): Promise<TurihamweClaim | undefined> {
    const all = await localDb.claims.toArray();
    return all.find(c => c.id === idOrRef || c.claimReference.toUpperCase() === idOrRef.toUpperCase());
  }

  public static async checkPotentialDuplicateClaimsLocally(params: {
    saccoAccountNumber: string;
    planId: string;
    beneficiaryId?: string;
    currentClaimId?: string;
  }): Promise<TurihamweClaim[]> {
    const claims = await localDb.claims.toArray();
    return claims.filter(c => {
      if (params.currentClaimId && c.id === params.currentClaimId) return false;
      const isSameMember = c.saccoAccountNumber.toUpperCase() === params.saccoAccountNumber.toUpperCase();
      const isSamePlan = c.planId === params.planId;
      const isSameBeneficiary = params.beneficiaryId && c.beneficiaryId === params.beneficiaryId;
      const isOngoing = c.status !== 'REJECTED' && c.status !== 'CLOSED';
      return (isSameMember && isSamePlan && isOngoing) || (isSameBeneficiary && isOngoing);
    });
  }

  public static async createClaimLocally(claim: TurihamweClaim): Promise<TurihamweClaim> {
    await localDb.claims.put(claim);

    // Queue for sync
    await this.queueForSync({
      entityType: 'CLAIM',
      entityId: claim.id,
      operation: 'INSERT',
      payload: claim,
      branchId: claim.branchId,
      userId: claim.preparerUserId,
    });

    // Record audit
    await this.recordLocalAudit({
      userId: claim.preparerUserId,
      username: claim.preparerUsername,
      userFullName: claim.preparerFullName,
      branchId: claim.branchId,
      branchName: claim.branchName,
      action: 'CLAIM_CREATED',
      recordType: 'CLAIM',
      recordId: claim.claimReference,
      newValue: JSON.stringify({
        claimReference: claim.claimReference,
        status: claim.status,
        saccoAccountNumber: claim.saccoAccountNumber,
      }),
      reason: claim.duplicateWarningAcknowledged ? `Created with duplicate override justification: ${claim.duplicateOverrideReason}` : 'Claim filed locally',
    });

    return claim;
  }

  public static async updateClaimLocally(claim: TurihamweClaim, userId: string, username: string): Promise<TurihamweClaim> {
    claim.updatedAt = new Date().toISOString();
    await localDb.claims.put(claim);

    await this.queueForSync({
      entityType: 'CLAIM',
      entityId: claim.id,
      operation: 'UPDATE',
      payload: claim,
      branchId: claim.branchId,
      userId,
    });

    await this.recordLocalAudit({
      userId,
      username,
      userFullName: username,
      branchId: claim.branchId,
      branchName: claim.branchName,
      action: 'CLAIM_EDITED',
      recordType: 'CLAIM',
      recordId: claim.claimReference,
      newValue: JSON.stringify(claim),
      reason: 'Claim modified locally',
    });

    return claim;
  }

  public static async addClaimDocumentLocally(claimId: string, doc: ClaimDocument): Promise<void> {
    const claim = await this.getClaimByIdLocally(claimId);
    if (!claim) throw new Error('Claim not found');

    if (doc.replacedById) {
      const oldDoc = claim.supportingDocuments.find(d => d.id === doc.replacedById);
      if (oldDoc) oldDoc.status = 'REPLACED';
    }

    claim.supportingDocuments.push(doc);
    if (claim.status === 'AWAITING_DOCUMENTS') {
      claim.status = 'UNDER_REVIEW';
    }
    claim.updatedAt = new Date().toISOString();

    await localDb.claims.put(claim);
    await localDb.claimDocuments.put(doc);

    await this.queueForSync({
      entityType: 'CLAIM_DOCUMENT',
      entityId: doc.id,
      operation: 'INSERT',
      payload: { claimId, doc },
      branchId: doc.branchId,
      userId: doc.uploadedByUserId,
    });

    await this.recordLocalAudit({
      userId: doc.uploadedByUserId,
      username: doc.uploadedByUsername,
      userFullName: doc.uploadedByUserFullName,
      branchId: doc.branchId,
      branchName: doc.branchName,
      action: doc.replacedById ? 'CLAIM_DOC_REPLACED' : 'CLAIM_DOC_UPLOADED',
      recordType: 'CLAIM_DOCUMENT',
      recordId: `${claim.claimReference}::${doc.id}`,
      reason: doc.replacedById ? `Replaced document: ${doc.replacementReason}` : 'Document uploaded locally',
    });
  }

  public static async addClaimReviewLocally(
    claimId: string,
    review: ClaimReviewRecord,
    newStatus: ClaimStatus
  ): Promise<TurihamweClaim> {
    const claim = await this.getClaimByIdLocally(claimId);
    if (!claim) throw new Error('Claim not found');

    claim.reviewHistory.push(review);
    claim.status = newStatus;
    claim.latestReviewNotes = review.reviewNotes;
    if (review.requestedDocuments && review.requestedDocuments.length > 0) {
      claim.requestedDocumentsNotes = review.requestedDocuments.join('; ');
    }
    claim.updatedAt = new Date().toISOString();

    await localDb.claims.put(claim);
    await localDb.claimReviews.put(review);

    await this.queueForSync({
      entityType: 'CLAIM_REVIEW',
      entityId: review.id,
      operation: 'INSERT',
      payload: { claimId, review, newStatus },
      branchId: review.branchId,
      userId: review.reviewerUserId,
    });

    await this.recordLocalAudit({
      userId: review.reviewerUserId,
      username: review.reviewerUsername,
      userFullName: review.reviewerFullName,
      branchId: review.branchId,
      branchName: review.branchName,
      action: newStatus === 'AWAITING_DOCUMENTS' ? 'CLAIM_DOCS_REQUESTED' : 'CLAIM_REVIEWED',
      recordType: 'CLAIM',
      recordId: claim.claimReference,
      reason: newStatus === 'AWAITING_DOCUMENTS' ? 'Requested additional documents locally' : 'Claim reviewed locally',
    });

    return claim;
  }

  public static async approveClaimLocally(
    claimId: string,
    record: ClaimApprovalRejectionRecord
  ): Promise<TurihamweClaim> {
    const claim = await this.getClaimByIdLocally(claimId);
    if (!claim) throw new Error('Claim not found');

    claim.status = 'APPROVED';
    claim.approvalRecord = record;
    claim.updatedAt = new Date().toISOString();

    await localDb.claims.put(claim);

    await this.queueForSync({
      entityType: 'CLAIM_APPROVAL',
      entityId: `app-${claim.id}`,
      operation: 'UPDATE',
      payload: { claimId, record },
      branchId: record.branchId,
      userId: record.decidedByUserId,
    });

    await this.recordLocalAudit({
      userId: record.decidedByUserId,
      username: record.decidedByUsername,
      userFullName: record.decidedByFullName,
      branchId: record.branchId,
      branchName: record.branchName,
      action: 'CLAIM_APPROVED',
      recordType: 'CLAIM',
      recordId: claim.claimReference,
      reason: `Claim approved offline under reference ${record.reasonOrReference}`,
    });

    return claim;
  }

  public static async rejectClaimLocally(
    claimId: string,
    record: ClaimApprovalRejectionRecord
  ): Promise<TurihamweClaim> {
    const claim = await this.getClaimByIdLocally(claimId);
    if (!claim) throw new Error('Claim not found');

    claim.status = 'REJECTED';
    claim.rejectionRecord = record;
    claim.updatedAt = new Date().toISOString();

    await localDb.claims.put(claim);

    await this.queueForSync({
      entityType: 'CLAIM_REJECTION',
      entityId: `rej-${claim.id}`,
      operation: 'UPDATE',
      payload: { claimId, record },
      branchId: record.branchId,
      userId: record.decidedByUserId,
    });

    await this.recordLocalAudit({
      userId: record.decidedByUserId,
      username: record.decidedByUsername,
      userFullName: record.decidedByFullName,
      branchId: record.branchId,
      branchName: record.branchName,
      action: 'CLAIM_REJECTED',
      recordType: 'CLAIM',
      recordId: claim.claimReference,
      reason: `Claim rejected offline: ${record.reasonOrReference}`,
    });

    return claim;
  }

  public static async recordClaimPaymentLocally(
    claimId: string,
    paymentInfo: ClaimPaymentInfo,
    branchId: string,
    branchName: string
  ): Promise<TurihamweClaim> {
    const claim = await this.getClaimByIdLocally(claimId);
    if (!claim) throw new Error('Claim not found');

    claim.paymentInfo = paymentInfo;
    claim.status = 'CLOSED';
    claim.updatedAt = new Date().toISOString();

    await localDb.claims.put(claim);

    await this.queueForSync({
      entityType: 'CLAIM_PAYMENT',
      entityId: `pay-${claim.id}`,
      operation: 'UPDATE',
      payload: { claimId, paymentInfo },
      branchId,
      userId: paymentInfo.recordedByUserId,
    });

    await this.recordLocalAudit({
      userId: paymentInfo.recordedByUserId,
      username: paymentInfo.recordedByUsername,
      userFullName: paymentInfo.recordedByUsername,
      branchId,
      branchName,
      action: 'CLAIM_PAYMENT_RECORDED',
      recordType: 'CLAIM',
      recordId: claim.claimReference,
      reason: `Recorded payment reference ${paymentInfo.paymentReference}`,
    });

    return claim;
  }

  // ==========================================
  // PHASE 6: OFFLINE SMS & ALERTS
  // ==========================================
  public static async queueSmsLocally(message: SmsMessage): Promise<SmsMessage> {
    await localDb.smsQueue.put(message);

    await this.queueForSync({
      entityType: 'SMS_MESSAGE',
      entityId: message.id,
      operation: 'INSERT',
      payload: message,
      branchId: message.branchId,
      userId: message.queuedByUserId,
    });

    await this.recordLocalAudit({
      userId: message.queuedByUserId,
      username: message.queuedByUserFullName,
      userFullName: message.queuedByUserFullName,
      branchId: message.branchId,
      branchName: message.branchName,
      action: 'SMS_QUEUED',
      recordType: 'SMS',
      recordId: message.id,
      reason: 'Outbound SMS queued offline',
    });

    return message;
  }

  public static async getSmsQueueLocally(filter?: {
    branchId?: string;
    status?: string;
  }): Promise<SmsMessage[]> {
    let list = await localDb.smsQueue.toArray();
    if (filter?.branchId) {
      list = list.filter(m => m.branchId === filter.branchId);
    }
    if (filter?.status && filter.status !== 'ALL') {
      list = list.filter(m => m.status === filter.status);
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static async getAlertsLocally(filter?: {
    branchId?: string;
    status?: string;
  }): Promise<SystemAlert[]> {
    let list = await localDb.systemAlerts.toArray();
    if (filter?.branchId) {
      list = list.filter(a => a.branchId === filter.branchId || a.branchId === 'ALL');
    }
    if (filter?.status) {
      list = list.filter(a => a.status === filter.status);
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static async markAlertReadLocally(alertId: string, userId: string): Promise<void> {
    const alert = await localDb.systemAlerts.get(alertId);
    if (alert) {
      if (!alert.readByUsers.includes(userId)) {
        alert.readByUsers.push(userId);
      }
      alert.status = 'READ';
      alert.updatedAt = new Date().toISOString();
      await localDb.systemAlerts.put(alert);

      await this.queueForSync({
        entityType: 'ALERT',
        entityId: alert.id,
        operation: 'UPDATE',
        payload: alert,
        branchId: alert.branchId,
        userId,
      });
    }
  }

  public static async recordReportLogLocally(log: ReportGenerationLog): Promise<void> {
    await localDb.reportLogs.put(log);

    await this.queueForSync({
      entityType: 'REPORT_LOG',
      entityId: log.id,
      operation: 'INSERT',
      payload: log,
      branchId: log.branchId,
      userId: log.generatedByUserId,
    });
  }
}
