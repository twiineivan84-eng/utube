import { Router, Response } from 'express';
import { requireAuth, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { serverStore } from '../storage/serverStore';
import { AuditService } from '../services/auditService';
import {
  TurihamweClaim,
  ClaimDocument,
  ClaimReviewRecord,
  ClaimStatus,
  ClaimApprovalRejectionRecord,
  ClaimPaymentInfo
} from '../../types';

export const claimRouter = Router();

claimRouter.use(requireAuth);

// ==========================================
// 1. CLAIMS LIST & SEARCH
// ==========================================
claimRouter.get('/', requirePermission('claims.view'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workingBranch = req.workingBranch;
  const status = req.query.status as string | undefined;
  const searchQuery = req.query.searchQuery as string | undefined;
  const saccoAccountNumber = req.query.saccoAccountNumber as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;

  let branchId = req.query.branchId as string | undefined;

  // Branch scoping: If user doesn't have multi-branch access, enforce working branch
  if (!user.hasMultiBranchAccess && workingBranch) {
    branchId = workingBranch.id;
  } else if (user.hasMultiBranchAccess && branchId) {
    const allowed = new Set([user.primaryBranchId, ...(user.allowedBranchIds || [])]);
    if (!allowed.has(branchId)) {
      res.status(403).json({ success: false, error: 'Forbidden: Access to claims in specified branch is not authorized.' });
      return;
    }
  }

  const claims = serverStore.getClaims({
    branchId: branchId || undefined,
    status: status || undefined,
    searchQuery: searchQuery || undefined,
    saccoAccountNumber: saccoAccountNumber || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  // Redact payment info if user lacks claims.view_payment_info
  const canViewPayment = req.effectivePermissions?.includes('claims.view_payment_info') ||
    user.roleId === 'role-gm' ||
    user.roleId === 'role-bm' ||
    user.roleId === 'role-accounts' ||
    user.roleId === 'role-auditor';

  const sanitized = claims.map(c => {
    if (!canViewPayment && c.paymentInfo) {
      return { ...c, paymentInfo: undefined };
    }
    return c;
  });

  res.json({
    success: true,
    data: sanitized,
    total: sanitized.length,
  });
});

// ==========================================
// 2. CLAIMS DASHBOARD STATISTICS
// ==========================================
claimRouter.get('/stats', requirePermission('claims.view'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workingBranch = req.workingBranch;

  let branchId = req.query.branchId as string | undefined;
  if (!user.hasMultiBranchAccess && workingBranch) {
    branchId = workingBranch.id;
  }

  const stats = serverStore.getClaimStatistics(branchId);
  res.json({
    success: true,
    data: stats,
  });
});

// ==========================================
// 3. CHECK DUPLICATE CLAIMS
// ==========================================
claimRouter.get('/check-duplicate', requirePermission('claims.create'), (req: AuthenticatedRequest, res: Response) => {
  const saccoAccountNumber = req.query.saccoAccountNumber as string;
  const planId = req.query.planId as string;
  const beneficiaryId = req.query.beneficiaryId as string | undefined;
  const currentClaimId = req.query.currentClaimId as string | undefined;

  if (!saccoAccountNumber || !planId) {
    res.status(400).json({ success: false, error: 'saccoAccountNumber and planId are required' });
    return;
  }

  const duplicates = serverStore.checkPotentialDuplicateClaims({
    saccoAccountNumber,
    planId,
    beneficiaryId: beneficiaryId || undefined,
    currentClaimId: currentClaimId || undefined,
  });

  res.json({
    success: true,
    hasPotentialDuplicates: duplicates.length > 0,
    duplicateClaims: duplicates,
  });
});

// ==========================================
// 4. GET CLAIM BY ID / REFERENCE
// ==========================================
claimRouter.get('/:idOrRef', requirePermission('claims.view'), (req: AuthenticatedRequest, res: Response) => {
  const { idOrRef } = req.params;
  const user = req.user!;
  const workingBranch = req.workingBranch;

  const claim = serverStore.getClaimById(idOrRef);
  if (!claim) {
    res.status(404).json({ success: false, error: 'Claim docket not found' });
    return;
  }

  // Branch isolation check
  if (!user.hasMultiBranchAccess && workingBranch && claim.branchId !== workingBranch.id) {
    res.status(403).json({ success: false, error: 'Unauthorized: Claim belongs to another branch docket' });
    return;
  }

  const canViewPayment = req.effectivePermissions?.includes('claims.view_payment_info') ||
    user.roleId === 'role-gm' ||
    user.roleId === 'role-bm' ||
    user.roleId === 'role-accounts' ||
    user.roleId === 'role-auditor';

  const result = canViewPayment ? claim : { ...claim, paymentInfo: undefined };

  res.json({
    success: true,
    data: result,
  });
});

// ==========================================
// 5. CREATE NEW CLAIM
// ==========================================
claimRouter.post('/', requirePermission('claims.create'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workingBranch = req.workingBranch;

  if (!workingBranch) {
    res.status(400).json({ success: false, error: 'No active operating branch context' });
    return;
  }

  const {
    saccoAccountNumber,
    planId,
    beneficiaryId,
    claimCategory,
    incidentDate,
    incidentDescription,
    initialStatus,
    duplicateWarningAcknowledged,
    duplicateOverrideReason,
    supportingDocuments,
  } = req.body;

  if (!saccoAccountNumber || !planId || !claimCategory || !incidentDate) {
    res.status(400).json({
      success: false,
      error: 'Missing mandatory fields: saccoAccountNumber, planId, claimCategory, incidentDate are required',
    });
    return;
  }

  // Verify member exists
  const member = serverStore.getMemberByAccountNumber(saccoAccountNumber);
  if (!member) {
    res.status(404).json({ success: false, error: `Member with account ${saccoAccountNumber} not found in SACCO records` });
    return;
  }

  // Verify plan exists and links to member
  const plan = serverStore.getPlanById(planId);
  if (!plan || plan.saccoAccountNumber.toUpperCase() !== saccoAccountNumber.toUpperCase()) {
    res.status(400).json({ success: false, error: 'Invalid plan or plan does not belong to this SACCO member' });
    return;
  }

  // Check beneficiary if specified
  let beneficiaryName: string | undefined;
  let beneficiaryRelationship: string | undefined;
  if (beneficiaryId) {
    const bens = serverStore.getBeneficiaries(planId);
    const b = bens.find((item: any) => item.id === beneficiaryId);
    if (b) {
      beneficiaryName = b.fullName;
      beneficiaryRelationship = b.relationship;
    }
  }

  // Check potential duplicates
  const duplicates = serverStore.checkPotentialDuplicateClaims({
    saccoAccountNumber,
    planId,
    beneficiaryId,
  });

  if (duplicates.length > 0 && !duplicateWarningAcknowledged) {
    res.status(409).json({
      success: false,
      error: 'Potential duplicate claim detected for this member/beneficiary.',
      requiresAcknowledgement: true,
      duplicateClaims: duplicates,
    });
    return;
  }

  // Generate unique Claim Reference: e.g. CLM-NYA-2026-0042
  const branchCodePrefix = (workingBranch.code || 'SACCO').substring(0, 3).toUpperCase();
  const currentYear = new Date().getFullYear();
  const totalClaimsCount = serverStore.getClaims().length + 1;
  const seqNumber = String(totalClaimsCount).padStart(4, '0');
  const claimReference = `CLM-${branchCodePrefix}-${currentYear}-${seqNumber}`;

  const status: ClaimStatus = initialStatus === 'DRAFT' ? 'DRAFT' : 'SUBMITTED';

  const newClaim: TurihamweClaim = {
    id: `clm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    claimReference,
    saccoAccountNumber: member.saccoAccountNumber,
    memberName: member.fullName,
    planId: plan.id,
    planCode: plan.planCode,
    beneficiaryId: beneficiaryId || undefined,
    beneficiaryName,
    beneficiaryRelationship,
    branchId: workingBranch.id,
    branchName: workingBranch.name,
    claimDate: new Date().toISOString().split('T')[0],
    status,
    claimCategory,
    incidentDate,
    incidentDescription: incidentDescription || '',
    preparerUserId: user.id,
    preparerUsername: user.username,
    preparerFullName: user.fullName,
    supportingDocuments: Array.isArray(supportingDocuments) ? supportingDocuments : [],
    reviewHistory: [],
    duplicateWarningAcknowledged: Boolean(duplicateWarningAcknowledged),
    duplicateOverrideReason: duplicateOverrideReason || undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  serverStore.addClaim(newClaim);

  // Audit
  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: workingBranch.id,
    branchName: workingBranch.name,
    action: 'CLAIM_CREATED',
    recordType: 'CLAIM',
    recordId: newClaim.claimReference,
    newValue: JSON.stringify({
      claimReference: newClaim.claimReference,
      saccoAccountNumber: newClaim.saccoAccountNumber,
      planId: newClaim.planId,
      status: newClaim.status,
      category: newClaim.claimCategory,
    }),
    reason: duplicateWarningAcknowledged ? `Created with duplicate override justification: ${duplicateOverrideReason}` : 'Claim filed',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  if (duplicateWarningAcknowledged) {
    AuditService.log({
      userId: user.id,
      username: user.username,
      userFullName: user.fullName,
      branchId: workingBranch.id,
      branchName: workingBranch.name,
      action: 'DUPLICATE_CLAIM_OVERRIDDEN',
      recordType: 'CLAIM',
      recordId: newClaim.claimReference,
      newValue: duplicateOverrideReason,
      reason: 'User acknowledged potential duplicate and proceeded with justification',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  res.status(201).json({
    success: true,
    data: newClaim,
    message: `Claim docket ${newClaim.claimReference} created successfully.`,
  });
});

// ==========================================
// 6. UPDATE CLAIM (DRAFT OR AWAITING_DOCS ONLY)
// ==========================================
claimRouter.put('/:id', requirePermission('claims.edit'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const workingBranch = req.workingBranch;

  const claim = serverStore.getClaimById(id);
  if (!claim) {
    res.status(404).json({ success: false, error: 'Claim docket not found' });
    return;
  }

  // Branch check
  if (!user.hasMultiBranchAccess && workingBranch && claim.branchId !== workingBranch.id) {
    res.status(403).json({ success: false, error: 'Unauthorized: Claim belongs to another branch' });
    return;
  }

  // Edit restriction: only DRAFT or AWAITING_DOCUMENTS can be edited
  if (claim.status !== 'DRAFT' && claim.status !== 'AWAITING_DOCUMENTS') {
    res.status(400).json({
      success: false,
      error: `Claims in status '${claim.status}' cannot be edited. Only DRAFT and AWAITING_DOCUMENTS allow modification.`,
    });
    return;
  }

  const { incidentDate, incidentDescription, claimCategory, statusTransitionToSubmitted } = req.body;

  const prev = JSON.stringify({
    incidentDate: claim.incidentDate,
    incidentDescription: claim.incidentDescription,
    claimCategory: claim.claimCategory,
    status: claim.status,
  });

  if (incidentDate) claim.incidentDate = incidentDate;
  if (incidentDescription !== undefined) claim.incidentDescription = incidentDescription;
  if (claimCategory) claim.claimCategory = claimCategory;

  if (statusTransitionToSubmitted && claim.status === 'DRAFT') {
    claim.status = 'SUBMITTED';
  }

  claim.updatedAt = new Date().toISOString();
  serverStore.updateClaim(claim);

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: workingBranch?.id || claim.branchId,
    branchName: workingBranch?.name || claim.branchName,
    action: 'CLAIM_EDITED',
    recordType: 'CLAIM',
    recordId: claim.claimReference,
    previousValue: prev,
    newValue: JSON.stringify({
      incidentDate: claim.incidentDate,
      incidentDescription: claim.incidentDescription,
      claimCategory: claim.claimCategory,
      status: claim.status,
    }),
    reason: 'Claim details updated by authorized user',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({
    success: true,
    data: claim,
    message: 'Claim updated successfully',
  });
});

// ==========================================
// 7. ATTACH SUPPORTING DOCUMENT
// ==========================================
claimRouter.post('/:id/documents', requirePermission('claims.upload_documents'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const workingBranch = req.workingBranch;

  const claim = serverStore.getClaimById(id);
  if (!claim) {
    res.status(404).json({ success: false, error: 'Claim docket not found' });
    return;
  }

  const {
    documentCategory,
    documentTitle,
    originalFileName,
    fileSize,
    mimeType,
    fileDataUrl,
    replacedById,
    replacementReason,
    notes,
  } = req.body;

  if (!documentCategory || !documentTitle || !originalFileName) {
    res.status(400).json({ success: false, error: 'documentCategory, documentTitle and originalFileName are required' });
    return;
  }

  // Security: reject unsafe files
  const unsafeExtensions = ['.exe', '.bat', '.cmd', '.sh', '.php', '.js', '.vbs', '.py'];
  const ext = originalFileName.toLowerCase().slice(originalFileName.lastIndexOf('.'));
  if (unsafeExtensions.includes(ext)) {
    res.status(400).json({ success: false, error: 'File type rejected for security compliance' });
    return;
  }

  // Size limit: 10MB
  if (fileSize && fileSize > 10 * 1024 * 1024) {
    res.status(400).json({ success: false, error: 'Document exceeds maximum allowed size of 10MB' });
    return;
  }

  // Compute version number
  const existingCategoryDocs = claim.supportingDocuments.filter(d => d.documentCategory === documentCategory);
  const version = existingCategoryDocs.length + 1;

  const doc: ClaimDocument = {
    id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    claimId: claim.id,
    documentCategory,
    documentTitle,
    originalFileName,
    fileSize: fileSize || 0,
    mimeType: mimeType || 'application/octet-stream',
    fileDataUrl,
    uploadedByUserId: user.id,
    uploadedByUsername: user.username,
    uploadedByUserFullName: user.fullName,
    branchId: workingBranch?.id || claim.branchId,
    branchName: workingBranch?.name || claim.branchName,
    uploadedAt: new Date().toISOString(),
    status: 'VALID',
    version,
    replacedById: replacedById || undefined,
    replacementReason: replacementReason || undefined,
    notes: notes || undefined,
  };

  serverStore.addClaimDocument(claim.id, doc);

  // If claim was awaiting documents, advance status to UNDER_REVIEW
  if (claim.status === 'AWAITING_DOCUMENTS') {
    claim.status = 'UNDER_REVIEW';
    serverStore.updateClaim(claim);
  }

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: workingBranch?.id || claim.branchId,
    branchName: workingBranch?.name || claim.branchName,
    action: replacedById ? 'CLAIM_DOC_REPLACED' : 'CLAIM_DOC_UPLOADED',
    recordType: 'CLAIM_DOCUMENT',
    recordId: `${claim.claimReference}::${doc.id}`,
    newValue: JSON.stringify({
      documentTitle: doc.documentTitle,
      category: doc.documentCategory,
      fileName: doc.originalFileName,
      version: doc.version,
    }),
    reason: replacedById ? `Replaced document ${replacedById}: ${replacementReason}` : 'Supporting document attached to claim docket',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(201).json({
    success: true,
    data: doc,
    message: `Document '${doc.documentTitle}' attached to claim successfully.`,
  });
});

// ==========================================
// 8. CLAIM REVIEW / REQUEST DOCUMENTS
// ==========================================
claimRouter.post('/:id/review', requirePermission('claims.review'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const workingBranch = req.workingBranch;

  const claim = serverStore.getClaimById(id);
  if (!claim) {
    res.status(404).json({ success: false, error: 'Claim docket not found' });
    return;
  }

  const { reviewNotes, newStatus, requestedDocuments } = req.body;

  if (!reviewNotes) {
    res.status(400).json({ success: false, error: 'Review notes are required' });
    return;
  }

  // Determine resulting status
  let targetStatus: ClaimStatus = claim.status;
  if (newStatus && ['UNDER_REVIEW', 'AWAITING_DOCUMENTS'].includes(newStatus)) {
    targetStatus = newStatus as ClaimStatus;
  } else if (requestedDocuments && requestedDocuments.length > 0) {
    targetStatus = 'AWAITING_DOCUMENTS';
  } else if (claim.status === 'SUBMITTED') {
    targetStatus = 'UNDER_REVIEW';
  }

  const reviewRecord: ClaimReviewRecord = {
    id: `rev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    claimId: claim.id,
    reviewerUserId: user.id,
    reviewerUsername: user.username,
    reviewerFullName: user.fullName,
    branchId: workingBranch?.id || claim.branchId,
    branchName: workingBranch?.name || claim.branchName,
    reviewDate: new Date().toISOString(),
    reviewNotes,
    statusAssigned: targetStatus,
    requestedDocuments: requestedDocuments || undefined,
    createdAt: new Date().toISOString(),
  };

  serverStore.addClaimReview(claim.id, reviewRecord, targetStatus);

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: workingBranch?.id || claim.branchId,
    branchName: workingBranch?.name || claim.branchName,
    action: targetStatus === 'AWAITING_DOCUMENTS' ? 'CLAIM_DOCS_REQUESTED' : 'CLAIM_REVIEWED',
    recordType: 'CLAIM',
    recordId: claim.claimReference,
    newValue: JSON.stringify({
      targetStatus,
      reviewNotes,
      requestedDocuments,
    }),
    reason: targetStatus === 'AWAITING_DOCUMENTS' ? `Requested documents: ${requestedDocuments?.join(', ')}` : 'Claim review recorded',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({
    success: true,
    data: serverStore.getClaimById(claim.id),
    message: targetStatus === 'AWAITING_DOCUMENTS' ? 'Additional documents requested from member' : 'Claim review recorded',
  });
});

// ==========================================
// 9. APPROVE CLAIM (SEPARATION OF DUTIES)
// ==========================================
claimRouter.post('/:id/approve', requirePermission('claims.approve'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const workingBranch = req.workingBranch;

  const claim = serverStore.getClaimById(id);
  if (!claim) {
    res.status(404).json({ success: false, error: 'Claim docket not found' });
    return;
  }

  // Separation of duties: The person who prepared the claim should not approve it alone
  if (claim.preparerUserId === user.id) {
    // Only General Manager can override self-approval
    if (user.roleId !== 'role-gm') {
      res.status(403).json({
        success: false,
        error: 'Separation of duties violation: Claim preparer cannot approve their own claim docket. Requires independent supervisory approval.',
      });
      return;
    }
  }

  const { approvalReference, approvalNotes } = req.body;

  const record: ClaimApprovalRejectionRecord = {
    decision: 'APPROVED',
    decidedByUserId: user.id,
    decidedByUsername: user.username,
    decidedByFullName: user.fullName,
    branchId: workingBranch?.id || claim.branchId,
    branchName: workingBranch?.name || claim.branchName,
    decisionDate: new Date().toISOString(),
    reasonOrReference: approvalReference || `APP-${Date.now().toString().slice(-6)}`,
    decisionNotes: approvalNotes || '',
  };

  serverStore.approveClaim(claim.id, record);

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: workingBranch?.id || claim.branchId,
    branchName: workingBranch?.name || claim.branchName,
    action: 'CLAIM_APPROVED',
    recordType: 'CLAIM',
    recordId: claim.claimReference,
    newValue: JSON.stringify(record),
    reason: `Claim approved with reference ${record.reasonOrReference}. ${approvalNotes || ''}`.trim(),
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({
    success: true,
    data: serverStore.getClaimById(claim.id),
    message: `Claim ${claim.claimReference} approved successfully under approval reference ${record.reasonOrReference}.`,
  });
});

// ==========================================
// 10. REJECT CLAIM (SEPARATION OF DUTIES)
// ==========================================
claimRouter.post('/:id/reject', requirePermission('claims.reject'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const workingBranch = req.workingBranch;

  const claim = serverStore.getClaimById(id);
  if (!claim) {
    res.status(404).json({ success: false, error: 'Claim docket not found' });
    return;
  }

  const { rejectionReason, rejectionNotes } = req.body;

  if (!rejectionReason) {
    res.status(400).json({ success: false, error: 'Formal rejection reason is mandatory' });
    return;
  }

  const record: ClaimApprovalRejectionRecord = {
    decision: 'REJECTED',
    decidedByUserId: user.id,
    decidedByUsername: user.username,
    decidedByFullName: user.fullName,
    branchId: workingBranch?.id || claim.branchId,
    branchName: workingBranch?.name || claim.branchName,
    decisionDate: new Date().toISOString(),
    reasonOrReference: rejectionReason,
    decisionNotes: rejectionNotes || '',
  };

  serverStore.rejectClaim(claim.id, record);

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: workingBranch?.id || claim.branchId,
    branchName: workingBranch?.name || claim.branchName,
    action: 'CLAIM_REJECTED',
    recordType: 'CLAIM',
    recordId: claim.claimReference,
    newValue: JSON.stringify(record),
    reason: `Claim rejected: ${rejectionReason}`,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({
    success: true,
    data: serverStore.getClaimById(claim.id),
    message: `Claim ${claim.claimReference} rejected. Rejection reason recorded in audit log.`,
  });
});

// ==========================================
// 11. RECORD PAYMENT / REFERENCE & CLOSE
// ==========================================
claimRouter.post('/:id/payment', requirePermission('claims.close'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const workingBranch = req.workingBranch;

  const claim = serverStore.getClaimById(id);
  if (!claim) {
    res.status(404).json({ success: false, error: 'Claim docket not found' });
    return;
  }

  if (claim.status !== 'APPROVED') {
    res.status(400).json({
      success: false,
      error: `Payment reference can only be recorded for APPROVED claims. Current status is '${claim.status}'.`,
    });
    return;
  }

  const { paymentReference, paymentDate, disbursementNotes } = req.body;

  if (!paymentReference) {
    res.status(400).json({ success: false, error: 'Payment / voucher reference is mandatory' });
    return;
  }

  const paymentInfo: ClaimPaymentInfo = {
    paymentReference,
    paymentDate: paymentDate || new Date().toISOString().split('T')[0],
    disbursementNotes: disbursementNotes || '',
    recordedByUserId: user.id,
    recordedByUsername: user.username,
    recordedAt: new Date().toISOString(),
  };

  serverStore.recordClaimPayment(claim.id, paymentInfo);

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: workingBranch?.id || claim.branchId,
    branchName: workingBranch?.name || claim.branchName,
    action: 'CLAIM_PAYMENT_RECORDED',
    recordType: 'CLAIM',
    recordId: claim.claimReference,
    newValue: JSON.stringify(paymentInfo),
    reason: `Payment reference ${paymentReference} recorded; docket finalized and closed`,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: workingBranch?.id || claim.branchId,
    branchName: workingBranch?.name || claim.branchName,
    action: 'CLAIM_CLOSED',
    recordType: 'CLAIM',
    recordId: claim.claimReference,
    newValue: 'CLOSED',
    reason: 'Settlement finalized',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({
    success: true,
    data: serverStore.getClaimById(claim.id),
    message: `Payment reference ${paymentReference} recorded. Claim ${claim.claimReference} has been closed.`,
  });
});

// ==========================================
// 12. CLOSE CLAIM DIRECTLY
// ==========================================
claimRouter.post('/:id/close', requirePermission('claims.close'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const workingBranch = req.workingBranch;

  const claim = serverStore.getClaimById(id);
  if (!claim) {
    res.status(404).json({ success: false, error: 'Claim docket not found' });
    return;
  }

  claim.status = 'CLOSED';
  claim.updatedAt = new Date().toISOString();
  serverStore.updateClaim(claim);

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: workingBranch?.id || claim.branchId,
    branchName: workingBranch?.name || claim.branchName,
    action: 'CLAIM_CLOSED',
    recordType: 'CLAIM',
    recordId: claim.claimReference,
    newValue: 'CLOSED',
    reason: req.body.reason || 'Claim docket closed by authorized officer',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({
    success: true,
    data: claim,
    message: `Claim docket ${claim.claimReference} closed successfully.`,
  });
});

// ==========================================
// 13. SECURE DOCUMENT ACCESS & AUDITING (REQ 14)
// ==========================================
claimRouter.get('/:id/documents/:docId', requirePermission('claims.view'), (req: AuthenticatedRequest, res: Response) => {
  const { id, docId } = req.params;
  const user = req.user!;
  const workingBranch = req.workingBranch;

  const claim = serverStore.getClaimById(id);
  if (!claim) {
    res.status(404).json({ success: false, error: 'Claim docket not found' });
    return;
  }

  // Branch isolation check
  if (!user.hasMultiBranchAccess && workingBranch && claim.branchId !== workingBranch.id) {
    res.status(403).json({ success: false, error: 'Unauthorized: Claim belongs to another branch docket' });
    return;
  }

  // Prevent file manipulation across claims: document must belong to this specific claim
  const document = claim.supportingDocuments.find(d => d.id === docId);
  if (!document) {
    res.status(404).json({ success: false, error: 'Document not found within this claim docket' });
    return;
  }

  // Audit document access
  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: workingBranch?.id || claim.branchId,
    branchName: workingBranch?.name || claim.branchName,
    action: 'CLAIM_VERIFIED',
    recordType: 'CLAIM_DOCUMENT',
    recordId: `${claim.claimReference}::${document.id}`,
    newValue: `Inspected document: ${document.documentTitle} (${document.originalFileName})`,
    reason: 'Authorized claim document inspection',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({
    success: true,
    data: document,
  });
});

