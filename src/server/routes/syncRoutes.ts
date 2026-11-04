import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { serverStore } from '../storage/serverStore';
import { AuditService } from '../services/auditService';
import { SyncRecord } from '../../types';

export const syncRouter = Router();

// Get sync status & central version info
syncRouter.get('/status', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const records = serverStore.getSyncRecords();
  res.json({
    success: true,
    serverTimestamp: new Date().toISOString(),
    branchId: req.workingBranch?.id,
    totalSyncJournals: records.length,
    recentJournals: records.slice(0, 10),
  });
});

// Push offline changes from branch to central server
syncRouter.post('/push', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { queueItems } = req.body as { queueItems: SyncRecord[] };

  if (!Array.isArray(queueItems)) {
    res.status(400).json({ success: false, message: 'Invalid queueItems payload array.' });
    return;
  }

  const processed: Array<{ id: string; status: 'SYNCED' | 'CONFLICT' | 'FAILED'; error?: string }> = [];

  for (const item of queueItems) {
    try {
      // Record in central sync journal
      const syncRecord: SyncRecord = {
        id: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        operation: item.operation,
        payloadJson: item.payloadJson,
        localTimestamp: item.localTimestamp,
        branchId: req.workingBranch!.id,
        userId: req.user!.id,
        status: 'SYNCED',
        retryCount: item.retryCount || 0,
      };

      serverStore.addSyncRecord(syncRecord);

      // Materialize entity into central store if not already present
      if (item.payloadJson) {
        try {
          const payload = JSON.parse(item.payloadJson);
          if (item.entityType === 'CONTRIBUTION') {
            const existing = serverStore.getContributionById(payload.id) ||
              serverStore.getContributionByReceipt(payload.receiptNumber);
            if (!existing) {
              serverStore.addContribution({ ...payload, isSynced: true });
            }
          } else if (item.entityType === 'RENEWAL') {
            const existing = serverStore.getRenewalById(payload.id) ||
              serverStore.getRenewalByReference(payload.renewalReference);
            if (!existing) {
              serverStore.addRenewal({ ...payload, isSynced: true });
            }
          } else if (item.entityType === 'MEMBER') {
            const existing = serverStore.getMemberByAccountNumber(payload.saccoAccountNumber);
            if (!existing) {
              serverStore.addMember(payload);
            } else if (item.operation === 'UPDATE') {
              // Controlled conflict detection: Do not silently overwrite if central record was modified by another location
              const centralUpdatedAt = new Date(existing.updatedAt).getTime();
              const offlineTimestamp = new Date(item.localTimestamp).getTime();
              const hasConflict = centralUpdatedAt > offlineTimestamp && existing.updatedAt !== payload.updatedAt && existing.branchId !== req.workingBranch!.id;

              if (hasConflict) {
                serverStore.updateSyncRecord(syncRecord.id, {
                  status: 'CONFLICT',
                  errorMessage: `Controlled Conflict: Member ${payload.saccoAccountNumber} was concurrently modified at branch ${existing.branchId}. Both revisions preserved for administrative review.`,
                });

                AuditService.log({
                  userId: req.user!.id,
                  username: req.user!.username,
                  userFullName: req.user!.fullName,
                  branchId: req.workingBranch!.id,
                  branchName: req.workingBranch!.name,
                  action: 'SYNC_PUSH',
                  recordType: 'MEMBER_CONFLICT',
                  recordId: payload.saccoAccountNumber,
                  previousValue: JSON.stringify(existing),
                  newValue: JSON.stringify(payload),
                  reason: 'Controlled synchronization conflict flagged: automatic overwrite prevented.',
                });

                processed.push({ id: item.id, status: 'CONFLICT', error: 'Concurrent modification conflict detected' });
                continue;
              }

              serverStore.updateMember(payload.saccoAccountNumber, payload);
            }
          } else if (item.entityType === 'CLAIM') {
            const existing = serverStore.getClaimById(payload.id) || serverStore.getClaimById(payload.claimReference);
            if (!existing) {
              serverStore.addClaim({ ...payload, isSynced: true });
            } else if (item.operation === 'UPDATE') {
              const centralUpdatedAt = new Date(existing.updatedAt).getTime();
              const offlineTimestamp = new Date(item.localTimestamp).getTime();
              const hasConflict = centralUpdatedAt > offlineTimestamp && existing.updatedAt !== payload.updatedAt && existing.branchId !== req.workingBranch!.id;

              if (hasConflict) {
                serverStore.updateSyncRecord(syncRecord.id, {
                  status: 'CONFLICT',
                  errorMessage: `Controlled Conflict: Claim docket ${existing.claimReference} was concurrently modified. Overwrite blocked.`,
                });

                AuditService.log({
                  userId: req.user!.id,
                  username: req.user!.username,
                  userFullName: req.user!.fullName,
                  branchId: req.workingBranch!.id,
                  branchName: req.workingBranch!.name,
                  action: 'SYNC_PUSH',
                  recordType: 'CLAIM_CONFLICT',
                  recordId: existing.claimReference,
                  previousValue: JSON.stringify(existing),
                  newValue: JSON.stringify(payload),
                  reason: 'Controlled synchronization conflict on claim docket: automatic overwrite prevented.',
                });

                processed.push({ id: item.id, status: 'CONFLICT', error: 'Concurrent modification conflict detected' });
                continue;
              }

              serverStore.updateClaim({ ...payload, isSynced: true });
            }
          } else if (item.entityType === 'CLAIM_DOCUMENT') {
            if (payload.claimId && payload.doc) {
              serverStore.addClaimDocument(payload.claimId, payload.doc);
            }
          } else if (item.entityType === 'CLAIM_REVIEW') {
            if (payload.claimId && payload.review) {
              serverStore.addClaimReview(payload.claimId, payload.review, payload.newStatus || 'UNDER_REVIEW');
            }
          } else if (item.entityType === 'CLAIM_APPROVAL') {
            if (payload.claimId && payload.record) {
              serverStore.approveClaim(payload.claimId, payload.record);
            }
          } else if (item.entityType === 'CLAIM_REJECTION') {
            if (payload.claimId && payload.record) {
              serverStore.rejectClaim(payload.claimId, payload.record);
            }
          } else if (item.entityType === 'CLAIM_PAYMENT') {
            if (payload.claimId && payload.paymentInfo) {
              serverStore.recordClaimPayment(payload.claimId, payload.paymentInfo);
            }
          } else if (item.entityType === 'SMS_MESSAGE') {
            const existing = serverStore.getSmsById(payload.id);
            if (!existing) {
              serverStore.addSmsMessage({ ...payload, isSynced: true });
            } else if (item.operation === 'UPDATE') {
              serverStore.updateSmsMessage({ ...payload, isSynced: true });
            }
          } else if (item.entityType === 'ALERT') {
            const existing = serverStore.getAlertById(payload.id);
            if (!existing) {
              serverStore.addAlert(payload);
            } else if (item.operation === 'UPDATE') {
              serverStore.updateAlert(payload);
            }
          } else if (item.entityType === 'REPORT_LOG') {
            serverStore.addReportLog(payload);
          }
        } catch {
          // Payload parse handled gracefully
        }
      }

      AuditService.log({
        userId: req.user!.id,
        username: req.user!.username,
        userFullName: req.user!.fullName,
        branchId: req.workingBranch!.id,
        branchName: req.workingBranch!.name,
        action: 'SYNC_PUSH',
        recordType: item.entityType,
        recordId: item.entityId,
        newValue: `Synced ${item.operation} on ${item.entityType}:${item.entityId}`,
      });

      processed.push({ id: item.id, status: 'SYNCED' });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown synchronization error';
      processed.push({
        id: item.id,
        status: 'FAILED',
        error: errorMessage,
      });
    }
  }

  res.json({
    success: true,
    serverTimestamp: new Date().toISOString(),
    processed,
  });
});

// Pull central updates to local branch
syncRouter.post('/pull', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { sinceTimestamp } = req.body;
  const syncRecords = serverStore.getSyncRecords();

  const filtered = sinceTimestamp
    ? syncRecords.filter(r => r.localTimestamp > sinceTimestamp)
    : syncRecords.slice(0, 50);

  res.json({
    success: true,
    serverTimestamp: new Date().toISOString(),
    updates: filtered,
  });
});
