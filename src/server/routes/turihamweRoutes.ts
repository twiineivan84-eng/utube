import { Router, Response } from 'express';
import { requireAuth, requirePermission, requireAnyPermission, AuthenticatedRequest } from '../middleware/auth';
import { serverStore } from '../storage/serverStore';
import { AuditService } from '../services/auditService';
import {
  TurihamwePlan,
  Contribution,
  Renewal,
  PlanReactivationLog,
  ExpiryAlertCategory
} from '../../types';

export const turihamweRouter = Router();

turihamweRouter.use(requireAuth);

// ==========================================
// 1. DASHBOARD & SUMMARY
// ==========================================
turihamweRouter.get('/summary', requirePermission('turihamwe.view'), (req: AuthenticatedRequest, res: Response) => {
  const branchId = req.query.branchId as string | undefined;
  const user = req.user!;

  // Strict branch isolation
  let targetBranchId = branchId;
  if (!user.hasMultiBranchAccess) {
    targetBranchId = req.workingBranch?.id || user.primaryBranchId;
  } else if (branchId) {
    const allowed = new Set([user.primaryBranchId, ...(user.allowedBranchIds || [])]);
    if (!allowed.has(branchId)) {
      return res.status(403).json({ error: 'Forbidden: Access to specified branch is not authorized.' });
    }
  }

  const plans = serverStore.getPlans(targetBranchId ? { branchId: targetBranchId } : undefined);
  const contributions = serverStore.getContributions(targetBranchId ? { branchId: targetBranchId } : undefined);
  const renewals = serverStore.getRenewals(targetBranchId ? { branchId: targetBranchId } : undefined);
  const expiryRecords = serverStore.getExpiryRecords(targetBranchId ? { branchId: targetBranchId } : undefined);
  const reactivations = serverStore.getReactivations();

  const totalActivePlans = plans.filter(p => p.status === 'ACTIVE').length;
  const expiringPlansCount = expiryRecords.filter(r => r.daysUntilExpiry >= 0 && r.daysUntilExpiry <= 30).length;
  const expiredPlansCount = expiryRecords.filter(r => r.daysUntilExpiry < 0 || r.planStatus === 'EXPIRED').length;
  const upcomingRenewalsCount = expiringPlansCount;
  const pendingReactivationsCount = plans.filter(p => p.status === 'REACTIVATION_PENDING').length;

  // Financial totals: Only include if user has financial viewing rights
  const userPermissions = req.effectivePermissions || [];
  const canViewFinancial = userPermissions.includes('reports.view_financial') ||
    userPermissions.includes('transactions.view') ||
    user.roleId === 'role-gm' ||
    user.roleId === 'role-auditor';

  const totalContributionsAmount = canViewFinancial
    ? contributions.reduce((sum, c) => sum + (c.amount || 0), 0)
    : null;

  res.json({
    totalActivePlans,
    totalContributionsCount: contributions.length,
    totalContributionsAmount,
    canViewFinancial,
    upcomingRenewalsCount,
    expiringPlansCount,
    expiredPlansCount,
    pendingReactivationsCount,
    recentContributions: contributions.slice(0, 5),
    recentRenewals: renewals.slice(0, 5),
  });
});

// ==========================================
// 2. CONFIGURABLE BUSINESS RULES
// ==========================================
turihamweRouter.get('/business-rules', (req: AuthenticatedRequest, res: Response) => {
  const rules = serverStore.getBusinessRulesConfig();
  res.json({
    rules,
    status: 'ACTIVE_CONFIGURABLE_FRAMEWORK',
    notice: 'Business rules for contribution amounts, renewal periods, grace periods, and late penalties are configurable parameters pending SACCO board specification.',
  });
});

turihamweRouter.put('/business-rules', requirePermission('admin.system_settings'), (req: AuthenticatedRequest, res: Response) => {
  const updates = req.body;
  const updated = serverStore.updateBusinessRulesConfig(updates);

  AuditService.log({
    userId: req.user!.id,
    username: req.user!.username,
    userFullName: req.user!.fullName,
    branchId: req.workingBranch!.id,
    branchName: req.workingBranch!.name,
    action: 'SYSTEM_SETTING_CHANGED',
    recordType: 'BUSINESS_RULES',
    newValue: 'Updated Turihamwe configurable business rules parameters',
  });

  res.json({ success: true, rules: updated });
});

// ==========================================
// 3. TURIHAMWE PLANS
// ==========================================
turihamweRouter.get('/plans', requirePermission('turihamwe.view'), (req: AuthenticatedRequest, res: Response) => {
  const searchQuery = req.query.search as string | undefined;
  const branchId = req.query.branchId as string | undefined;
  const status = req.query.status as string | undefined;
  const user = req.user!;

  // Strict branch isolation
  let targetBranchId = branchId;
  if (!user.hasMultiBranchAccess) {
    targetBranchId = req.workingBranch?.id || user.primaryBranchId;
  } else if (branchId) {
    const allowed = new Set([user.primaryBranchId, ...(user.allowedBranchIds || [])]);
    if (!allowed.has(branchId)) {
      return res.status(403).json({ error: 'Forbidden: Access to specified branch is not authorized.' });
    }
  }

  const plans = serverStore.getPlans({ searchQuery, branchId: targetBranchId, status });
  res.json(plans);
});

turihamweRouter.get('/plans/:id', requirePermission('turihamwe.view'), (req: AuthenticatedRequest, res: Response) => {
  const plan = serverStore.getPlanById(req.params.id);
  if (!plan) {
    return res.status(404).json({ error: 'Turihamwe plan not found' });
  }
  const beneficiaries = serverStore.getBeneficiaries(plan.id);
  const contributions = serverStore.getContributions({ planId: plan.id });
  const renewals = serverStore.getRenewals({ planId: plan.id });
  const reactivations = serverStore.getReactivations(plan.id);

  res.json({
    plan,
    beneficiaries,
    contributions,
    renewals,
    reactivations,
  });
});

turihamweRouter.get('/plans/account/:accountNumber', requirePermission('turihamwe.view'), (req: AuthenticatedRequest, res: Response) => {
  const plan = serverStore.getPlanByAccountNumber(req.params.accountNumber);
  if (!plan) {
    return res.status(404).json({ error: 'No Turihamwe plan registered for this SACCO member' });
  }
  res.json(plan);
});

turihamweRouter.post('/plans', requirePermission('turihamwe.register_plan'), (req: AuthenticatedRequest, res: Response) => {
  const { saccoAccountNumber, effectiveStartDate, currentExpiryDate, notes } = req.body;

  if (!saccoAccountNumber || !effectiveStartDate || !currentExpiryDate) {
    return res.status(400).json({ error: 'SACCO account number, start date, and expiry date are required.' });
  }

  // Confirm member exists
  const member = serverStore.getMemberByAccountNumber(saccoAccountNumber);
  if (!member) {
    return res.status(404).json({ error: `Member with SACCO account number ${saccoAccountNumber} does not exist.` });
  }

  // Prevent duplicate active plan
  const existingPlan = serverStore.getPlanByAccountNumber(saccoAccountNumber);
  if (existingPlan && existingPlan.status === 'ACTIVE') {
    return res.status(409).json({ error: `Member ${saccoAccountNumber} already has an active Turihamwe plan (${existingPlan.id}).` });
  }

  const branch = req.workingBranch!;
  const user = req.user!;
  const planId = `PLN-${branch.code.substring(0, 3)}-${saccoAccountNumber.replace(/[^0-9]/g, '').slice(-6) || Math.floor(100000 + Math.random() * 900000)}`;

  const newPlan: TurihamwePlan = {
    id: planId,
    saccoAccountNumber: member.saccoAccountNumber,
    memberName: member.fullName,
    planCode: 'STANDARD',
    status: 'ACTIVE',
    enrolmentDate: new Date().toISOString().split('T')[0],
    effectiveStartDate,
    currentExpiryDate,
    registeredBranchId: branch.id,
    registeredBranchName: branch.name,
    registeredByUserId: user.id,
    registeredByUsername: user.username,
    beneficiaryCount: 0,
    totalContributionsAmount: 0,
    notes: notes?.trim() || 'Enrolled in Turihamwe protection plan',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  serverStore.addPlan(newPlan);

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: branch.id,
    branchName: branch.name,
    action: 'PLAN_REGISTERED',
    recordType: 'TURIHAMWE_PLAN',
    recordId: newPlan.id,
    newValue: `Registered Turihamwe plan ${newPlan.id} for ${member.saccoAccountNumber} (${member.fullName})`,
  });

  res.status(201).json(newPlan);
});

// ==========================================
// 4. CONTRIBUTIONS MODULE
// ==========================================
turihamweRouter.get('/contributions', requireAnyPermission('turihamwe.view_contributions', 'transactions.view'), (req: AuthenticatedRequest, res: Response) => {
  const { saccoAccountNumber, planId, branchId, startDate, endDate, search, status } = req.query;
  const user = req.user!;

  // Strict branch isolation
  let targetBranchId = branchId as string | undefined;
  if (!user.hasMultiBranchAccess) {
    targetBranchId = req.workingBranch?.id || user.primaryBranchId;
  } else if (targetBranchId) {
    const allowed = new Set([user.primaryBranchId, ...(user.allowedBranchIds || [])]);
    if (!allowed.has(targetBranchId)) {
      return res.status(403).json({ error: 'Forbidden: Access to specified branch is not authorized.' });
    }
  }

  const contributions = serverStore.getContributions({
    saccoAccountNumber: saccoAccountNumber as string,
    planId: planId as string,
    branchId: targetBranchId,
    startDate: startDate as string,
    endDate: endDate as string,
    searchQuery: search as string,
    status: status as string,
  });

  res.json(contributions);
});

turihamweRouter.get('/contributions/:id', requireAnyPermission('turihamwe.view_contributions', 'transactions.view'), (req: AuthenticatedRequest, res: Response) => {
  const contribution = serverStore.getContributionById(req.params.id) ||
    serverStore.getContributionByReceipt(req.params.id);

  if (!contribution) {
    return res.status(404).json({ error: 'Contribution record not found' });
  }

  res.json(contribution);
});

turihamweRouter.post('/contributions', requireAnyPermission('turihamwe.record_contribution', 'transactions.record'), (req: AuthenticatedRequest, res: Response) => {
  const {
    saccoAccountNumber,
    planId,
    amount,
    paymentMethod,
    contributionDate,
    periodCoveredStart,
    periodCoveredEnd,
    remarks,
  } = req.body;

  // Validation 1: Required fields
  if (!saccoAccountNumber || !planId || amount === undefined || amount === null || !paymentMethod || !contributionDate) {
    return res.status(400).json({
      error: 'Missing required fields: saccoAccountNumber, planId, amount, paymentMethod, and contributionDate are required.',
    });
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Contribution amount must be a positive number.' });
  }

  // Validation 2: Confirm member exists
  const member = serverStore.getMemberByAccountNumber(saccoAccountNumber);
  if (!member) {
    return res.status(404).json({ error: `SACCO member with account ${saccoAccountNumber} not found.` });
  }

  // Validation 3: Confirm Turihamwe plan exists
  const plan = serverStore.getPlanById(planId);
  if (!plan) {
    return res.status(404).json({ error: `Turihamwe plan ${planId} not found.` });
  }

  // Validation 4: Confirm selected plan belongs to that member
  if (plan.saccoAccountNumber.toUpperCase() !== member.saccoAccountNumber.toUpperCase()) {
    return res.status(400).json({
      error: `Plan ${planId} does not belong to member ${saccoAccountNumber}. Plan belongs to ${plan.saccoAccountNumber}.`,
    });
  }

  // Validation 5: Prevent duplicate contribution records (e.g. same member, amount and date recorded in last 3 minutes)
  const recentContribs = serverStore.getContributions({ saccoAccountNumber: member.saccoAccountNumber });
  const isDuplicate = recentContribs.some(c => {
    const timeDiff = Math.abs(Date.now() - new Date(c.createdAt).getTime());
    return c.amount === numAmount && c.contributionDate === contributionDate && timeDiff < 3 * 60 * 1000;
  });

  if (isDuplicate) {
    return res.status(409).json({
      error: 'Duplicate contribution detected: An identical contribution for this member and amount was recorded just moments ago.',
    });
  }

  // Generate unique contribution reference
  const dateStr = new Date().getFullYear();
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const receiptNumber = `TRH-CTR-${dateStr}-${randomSuffix}`;

  const branch = req.workingBranch!;
  const user = req.user!;

  const newContribution: Contribution = {
    id: `ctr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    receiptNumber,
    saccoAccountNumber: member.saccoAccountNumber,
    memberName: member.fullName,
    planId: plan.id,
    branchId: branch.id,
    branchName: branch.name,
    receivedByUserId: user.id,
    receivedByUsername: user.username,
    amount: numAmount,
    paymentMethod,
    contributionDate,
    status: 'CONFIRMED',
    periodCoveredStart: periodCoveredStart || undefined,
    periodCoveredEnd: periodCoveredEnd || undefined,
    remarks: remarks?.trim() || undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isSynced: true,
  };

  serverStore.addContribution(newContribution);

  // Immutable audit log
  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: branch.id,
    branchName: branch.name,
    action: 'CONTRIBUTION_RECORDED',
    recordType: 'CONTRIBUTION',
    recordId: newContribution.receiptNumber,
    newValue: `Recorded UGX ${numAmount.toLocaleString()} contribution for account ${member.saccoAccountNumber} (${member.fullName}) - Receipt: ${receiptNumber}`,
  });

  res.status(201).json(newContribution);
});

// Authorized correction of a contribution
turihamweRouter.put('/contributions/:id/correct', requireAnyPermission('transactions.edit', 'turihamwe.record_contribution'), (req: AuthenticatedRequest, res: Response) => {
  const { reason, remarks, paymentMethod } = req.body;

  if (!reason || reason.trim().length < 5) {
    return res.status(400).json({ error: 'A valid justification reason is required for contribution correction.' });
  }

  const contribution = serverStore.getContributionById(req.params.id) ||
    serverStore.getContributionByReceipt(req.params.id);

  if (!contribution) {
    return res.status(404).json({ error: 'Contribution record not found.' });
  }

  const previousState = JSON.stringify({
    status: contribution.status,
    remarks: contribution.remarks,
    paymentMethod: contribution.paymentMethod,
  });

  const updated = serverStore.updateContribution(contribution.id, {
    status: 'CORRECTED',
    correctionReason: reason.trim(),
    correctedByUserId: req.user!.id,
    correctedAt: new Date().toISOString(),
    remarks: remarks !== undefined ? remarks : contribution.remarks,
    paymentMethod: paymentMethod || contribution.paymentMethod,
  });

  AuditService.log({
    userId: req.user!.id,
    username: req.user!.username,
    userFullName: req.user!.fullName,
    branchId: req.workingBranch!.id,
    branchName: req.workingBranch!.name,
    action: 'CONTRIBUTION_CORRECTED',
    recordType: 'CONTRIBUTION',
    recordId: contribution.receiptNumber,
    previousValue: previousState,
    newValue: `Corrected contribution ${contribution.receiptNumber}: ${reason.trim()}`,
    reason: reason.trim(),
  });

  res.json({ success: true, contribution: updated });
});

// ==========================================
// 5. RENEWALS MODULE
// ==========================================
turihamweRouter.get('/renewals', requirePermission('turihamwe.view_renewals'), (req: AuthenticatedRequest, res: Response) => {
  const { saccoAccountNumber, planId, branchId, startDate, endDate, search } = req.query;
  const user = req.user!;

  // Strict branch isolation
  let targetBranchId = branchId as string | undefined;
  if (!user.hasMultiBranchAccess) {
    targetBranchId = req.workingBranch?.id || user.primaryBranchId;
  } else if (targetBranchId) {
    const allowed = new Set([user.primaryBranchId, ...(user.allowedBranchIds || [])]);
    if (!allowed.has(targetBranchId)) {
      return res.status(403).json({ error: 'Forbidden: Access to specified branch is not authorized.' });
    }
  }

  const renewals = serverStore.getRenewals({
    saccoAccountNumber: saccoAccountNumber as string,
    planId: planId as string,
    branchId: targetBranchId,
    startDate: startDate as string,
    endDate: endDate as string,
    searchQuery: search as string,
  });

  res.json(renewals);
});

turihamweRouter.get('/renewals/:id', requirePermission('turihamwe.view_renewals'), (req: AuthenticatedRequest, res: Response) => {
  const renewal = serverStore.getRenewalById(req.params.id) ||
    serverStore.getRenewalByReference(req.params.id);

  if (!renewal) {
    return res.status(404).json({ error: 'Renewal record not found' });
  }

  res.json(renewal);
});

turihamweRouter.post('/renewals', requirePermission('turihamwe.record_renewal'), (req: AuthenticatedRequest, res: Response) => {
  const {
    planId,
    renewalDate,
    effectiveDate,
    newExpiryDate,
    renewalFee,
    receiptReference,
    notes,
  } = req.body;

  if (!planId || !renewalDate || !effectiveDate || !newExpiryDate) {
    return res.status(400).json({
      error: 'Missing required renewal parameters: planId, renewalDate, effectiveDate, and newExpiryDate are required.',
    });
  }

  const plan = serverStore.getPlanById(planId);
  if (!plan) {
    return res.status(404).json({ error: `Turihamwe plan ${planId} does not exist.` });
  }

  const member = serverStore.getMemberByAccountNumber(plan.saccoAccountNumber);
  if (!member) {
    return res.status(404).json({ error: `Member associated with plan ${planId} was not found.` });
  }

  const dateStr = new Date().getFullYear();
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const renewalReference = `TRH-RNW-${dateStr}-${randomSuffix}`;

  const branch = req.workingBranch!;
  const user = req.user!;

  const previousPlanStatus = plan.status;
  const previousExpiryDate = plan.currentExpiryDate;
  const resultingPlanStatus = 'ACTIVE';

  const newRenewal: Renewal = {
    id: `rnw-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    renewalReference,
    planId: plan.id,
    saccoAccountNumber: plan.saccoAccountNumber,
    memberName: plan.memberName,
    branchId: branch.id,
    branchName: branch.name,
    processedByUserId: user.id,
    processedByUsername: user.username,
    renewalDate,
    effectiveDate,
    previousExpiryDate,
    newExpiryDate,
    previousPlanStatus,
    resultingPlanStatus,
    renewalFee: renewalFee ? Number(renewalFee) : undefined,
    receiptReference: receiptReference?.trim() || undefined,
    renewalStatus: 'ACTIVE',
    notes: notes?.trim() || undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isSynced: true,
  };

  serverStore.addRenewal(newRenewal);

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: branch.id,
    branchName: branch.name,
    action: 'RENEWAL_RECORDED',
    recordType: 'RENEWAL',
    recordId: newRenewal.renewalReference,
    previousValue: `Status: ${previousPlanStatus}, Expiry: ${previousExpiryDate}`,
    newValue: `Status: ${resultingPlanStatus}, Expiry: ${newExpiryDate} (Ref: ${renewalReference})`,
    reason: notes?.trim() || 'Annual policy renewal processed',
  });

  res.status(201).json(newRenewal);
});

// ==========================================
// 6. EXPIRY MANAGEMENT
// ==========================================
turihamweRouter.get('/expiry', requirePermission('turihamwe.view_expiry'), (req: AuthenticatedRequest, res: Response) => {
  const { branchId, category, status, search } = req.query;
  const user = req.user!;

  // Strict branch isolation
  let targetBranchId = branchId as string | undefined;
  if (!user.hasMultiBranchAccess) {
    targetBranchId = req.workingBranch?.id || user.primaryBranchId;
  } else if (targetBranchId) {
    const allowed = new Set([user.primaryBranchId, ...(user.allowedBranchIds || [])]);
    if (!allowed.has(targetBranchId)) {
      return res.status(403).json({ error: 'Forbidden: Access to specified branch is not authorized.' });
    }
  }

  const records = serverStore.getExpiryRecords({
    branchId: targetBranchId,
    category: category as ExpiryAlertCategory,
    status: status as string,
    searchQuery: search as string,
  });

  res.json(records);
});

// ==========================================
// 7. REACTIVATION WORKFLOW
// ==========================================
turihamweRouter.post('/plans/:id/reactivate', requirePermission('turihamwe.reactivate_plan'), (req: AuthenticatedRequest, res: Response) => {
  const { justificationReason, newExpiryDate } = req.body;

  if (!justificationReason || justificationReason.trim().length < 5) {
    return res.status(400).json({
      error: 'An administrative justification reason is required to reactivate a lapsed or suspended plan.',
    });
  }

  const plan = serverStore.getPlanById(req.params.id);
  if (!plan) {
    return res.status(404).json({ error: `Turihamwe plan ${req.params.id} not found.` });
  }

  const branch = req.workingBranch!;
  const user = req.user!;

  const previousStatus = plan.status;
  const previousExpiry = plan.currentExpiryDate;

  // Reactivate plan
  const log: PlanReactivationLog = {
    id: `react-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    planId: plan.id,
    saccoAccountNumber: plan.saccoAccountNumber,
    memberName: plan.memberName,
    branchId: branch.id,
    branchName: branch.name,
    requestedByUserId: user.id,
    requestedByUsername: user.username,
    timestamp: new Date().toISOString(),
    previousStatus,
    newStatus: 'ACTIVE',
    previousExpiryDate: previousExpiry,
    newExpiryDate: newExpiryDate || undefined,
    justificationReason: justificationReason.trim(),
    status: 'COMPLETED',
  };

  serverStore.addReactivation(log);

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: branch.id,
    branchName: branch.name,
    action: 'PLAN_REACTIVATED',
    recordType: 'TURIHAMWE_PLAN',
    recordId: plan.id,
    previousValue: `Status was ${previousStatus}, expiry was ${previousExpiry}`,
    newValue: `Reactivated to ACTIVE status${newExpiryDate ? `, new expiry: ${newExpiryDate}` : ''}`,
    reason: justificationReason.trim(),
  });

  const updatedPlan = serverStore.getPlanById(plan.id);
  res.json({
    success: true,
    plan: updatedPlan,
    reactivationLog: log,
  });
});
