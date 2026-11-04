import { Router, Response } from 'express';
import { requireAuth, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { serverStore } from '../storage/serverStore';
import { SaccoMember, ControlledCorrection, Beneficiary } from '../../types';
import { AuditService } from '../services/auditService';
import { isWithinUgandaFiveDaysWindow } from '../../utils/timezone';

export const memberRouter = Router();

// Validation helpers
function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return /^\+?[0-9]{9,15}$/.test(cleaned);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isWithinFiveDays(registrationDate: string): boolean {
  return isWithinUgandaFiveDaysWindow(registrationDate);
}

/**
 * GET /api/members
 * Search and list SACCO members.
 * CRITICAL RULE: Member search must support ONLY:
 * 1. SACCO account number
 * 2. Member name
 */
memberRouter.get(
  '/',
  requireAuth,
  requirePermission('members.view'),
  (req: AuthenticatedRequest, res: Response): void => {
    const { q, branchId } = req.query;
    const searchQuery = typeof q === 'string' ? q.trim() : undefined;
    const filterBranchId = typeof branchId === 'string' ? branchId : undefined;

    // Strict Branch Isolation (Phase 7 Requirement 7)
    let targetBranchId: string | undefined = filterBranchId;
    if (!req.user?.hasMultiBranchAccess) {
      targetBranchId = req.workingBranch?.id || req.user?.primaryBranchId;
    } else if (filterBranchId) {
      const allowed = new Set([req.user.primaryBranchId, ...(req.user.allowedBranchIds || [])]);
      if (!allowed.has(filterBranchId)) {
        res.status(403).json({ error: 'Forbidden: Access to records in the specified branch is not authorized.' });
        return;
      }
    }

    const members = serverStore.getMembers({
      searchQuery,
      branchId: targetBranchId,
    });

    // Populate branch names and 5-day lock status dynamically
    const enriched = members.map(m => {
      const branch = serverStore.getBranchById(m.branchId);
      const locked = !isWithinFiveDays(m.registrationDate);
      return {
        ...m,
        branchName: branch ? branch.name : m.branchName,
        isLockedFromNormalEdit: locked,
        turihamweStatus: m.turihamweStatus || 'UNREGISTERED',
      };
    });

    res.json({ success: true, data: enriched });
  }
);

/**
 * GET /api/members/:accountNumber
 * Retrieve a specific member profile with audit/correction history
 */
memberRouter.get(
  '/:accountNumber',
  requireAuth,
  requirePermission('members.view'),
  (req: AuthenticatedRequest, res: Response): void => {
    const accountNumber = req.params.accountNumber.trim().toUpperCase();
    const member = serverStore.getMemberByAccountNumber(accountNumber);

    if (!member) {
      res.status(404).json({ error: `Member with SACCO account number '${accountNumber}' not found.` });
      return;
    }

    const branch = serverStore.getBranchById(member.branchId);
    const locked = !isWithinFiveDays(member.registrationDate);
    const corrections = serverStore.getCorrectionsForMember(accountNumber);
    const auditLogs = serverStore.getAuditLogs({ limit: 50 }).filter(l => l.recordId === accountNumber);
    const beneficiaries = serverStore.getBeneficiaries(undefined, accountNumber).filter(b => b.isActive !== false);

    res.json({
      success: true,
      data: {
        ...member,
        clientStatus: member.clientStatus || 'ALIVE',
        branchName: branch ? branch.name : member.branchName,
        isLockedFromNormalEdit: locked,
        beneficiaries,
        corrections,
        auditLogs,
      },
    });
  }
);

/**
 * POST /api/members
 * Register a new SACCO member.
 * - SACCO account number is the primary identifier.
 * - Must be unique across all members.
 * - If duplicate: "This SACCO account number is already registered."
 */
memberRouter.post(
  '/',
  requireAuth,
  requirePermission('members.register'),
  (req: AuthenticatedRequest, res: Response): void => {
    const user = req.user!;
    const workingBranch = req.workingBranch!;
    const body = req.body;

    // 1. Personal Information validation
    const saccoAccountNumber = (body.saccoAccountNumber || '').trim().toUpperCase();
    const fullName = (body.fullName || '').trim();
    const gender = body.gender;
    const dateOfBirth = (body.dateOfBirth || '').trim();
    const nationalIdNumber = (body.nationalIdNumber || '').trim().toUpperCase();

    if (!saccoAccountNumber) {
      res.status(400).json({ error: 'SACCO account number is required.' });
      return;
    }

    if (!fullName) {
      res.status(400).json({ error: 'Full name is required.' });
      return;
    }

    if (!['MALE', 'FEMALE', 'OTHER'].includes(gender)) {
      res.status(400).json({ error: 'Gender must be MALE, FEMALE, or OTHER.' });
      return;
    }

    if (!dateOfBirth) {
      res.status(400).json({ error: 'Date of birth is required.' });
      return;
    }

    const dobTime = new Date(dateOfBirth).getTime();
    if (isNaN(dobTime) || dobTime > Date.now()) {
      res.status(400).json({ error: 'Valid date of birth in the past is required.' });
      return;
    }

    if (!nationalIdNumber) {
      res.status(400).json({ error: 'National ID / identification number is required.' });
      return;
    }

    // 2. Contact Information validation
    const primaryPhone = (body.primaryPhone || '').trim();
    if (!primaryPhone) {
      res.status(400).json({ error: 'Primary phone number is required.' });
      return;
    }

    if (!isValidPhone(primaryPhone)) {
      res.status(400).json({ error: 'Primary phone number is invalid. Please enter a valid telephone number.' });
      return;
    }

    const alternativePhone = (body.alternativePhone || '').trim() || undefined;
    if (alternativePhone && !isValidPhone(alternativePhone)) {
      res.status(400).json({ error: 'Alternative phone number format is invalid.' });
      return;
    }

    const emailAddress = (body.emailAddress || '').trim().toLowerCase() || undefined;
    if (emailAddress && !isValidEmail(emailAddress)) {
      res.status(400).json({ error: 'Email address format is invalid.' });
      return;
    }

    // 3. Address validation
    const district = (body.district || '').trim();
    const subCounty = (body.subCounty || '').trim();
    const parish = (body.parish || '').trim();
    const village = (body.village || '').trim();

    if (!district || !subCounty || !parish || !village) {
      res.status(400).json({ error: 'Address fields (District, Sub-county, Parish, Village) are all required.' });
      return;
    }

    // 4. Branch Rule:
    // Single-branch users: Automatically use assigned/working branch.
    // Multi-branch users: Use branch selected in current working session, only allowed branches.
    let branchId = workingBranch.id;
    if (body.branchId && body.branchId !== workingBranch.id) {
      if (!user.hasMultiBranchAccess || !user.allowedBranchIds.includes(body.branchId)) {
        res.status(403).json({ error: 'Forbidden: Unauthorized branch selection.' });
        return;
      }
      branchId = body.branchId;
    }

    const targetBranch = serverStore.getBranchById(branchId);
    if (!targetBranch) {
      res.status(400).json({ error: 'Designated SACCO branch not found.' });
      return;
    }

    // 5. Account Number Rules:
    // Required, unique, belongs to only one member, never auto-generated, never changed, never duplicated.
    const existing = serverStore.getMemberByAccountNumber(saccoAccountNumber);
    if (existing) {
      // EXACT REQUIRED ERROR MESSAGE
      res.status(409).json({ error: 'This SACCO account number is already registered.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const registrationDate = body.registrationDate || nowIso.split('T')[0];
    const clientStatus = body.clientStatus === 'DECEASED' ? 'DECEASED' : 'ALIVE';

    // Requirement 3: Validate beneficiaries submitted in the registration workflow
    const beneficiariesToCreate: Beneficiary[] = [];
    if (Array.isArray(body.beneficiaries) && body.beneficiaries.length > 0) {
      for (let i = 0; i < body.beneficiaries.length; i++) {
        const b = body.beneficiaries[i];
        const bName = (b.fullName || '').trim();
        const bDob = (b.dateOfBirth || '').trim();
        const bRel = (b.relationship || '').trim();

        if (!bName) {
          res.status(400).json({ error: `Beneficiary #${i + 1}: Full legal name is required.` });
          return;
        }
        if (!bDob) {
          res.status(400).json({ error: `Beneficiary #${i + 1} (${bName}): Date of birth is required.` });
          return;
        }
        const bDobTime = new Date(bDob).getTime();
        if (isNaN(bDobTime)) {
          res.status(400).json({ error: `Beneficiary #${i + 1} (${bName}): Date of birth is invalid.` });
          return;
        }
        if (bDobTime > Date.now()) {
          res.status(400).json({ error: `Beneficiary #${i + 1} (${bName}): Date of birth cannot be in the future.` });
          return;
        }
        if (!bRel) {
          res.status(400).json({ error: `Beneficiary #${i + 1} (${bName}): Relationship to member is required.` });
          return;
        }

        beneficiariesToCreate.push({
          id: `ben-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${i}`,
          saccoAccountNumber,
          planId: '',
          fullName: bName,
          relationship: bRel,
          dateOfBirth: bDob,
          nationalIdNumber: (b.nationalIdNumber || '').trim().toUpperCase() || undefined,
          contactPhone: (b.contactPhone || '').trim() || undefined,
          percentageAllocation: Number(b.percentageAllocation) || Math.floor(100 / body.beneficiaries.length),
          isActive: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
    }

    const newMember: SaccoMember = {
      saccoAccountNumber,
      fullName,
      gender,
      dateOfBirth,
      nationalIdNumber,
      primaryPhone,
      alternativePhone,
      emailAddress,
      district,
      subCounty,
      parish,
      village,
      registrationDate,
      branchId: targetBranch.id,
      branchName: targetBranch.name,
      clientStatus,
      clientStatusUpdatedAt: nowIso,
      clientStatusUpdatedByUserId: user.id,
      clientStatusUpdatedByUsername: user.username,
      createdById: user.id,
      createdByUsername: user.username,
      createdAt: nowIso,
      updatedAt: nowIso,
      isLockedFromNormalEdit: false,
      turihamweStatus: 'UNREGISTERED',
    };

    // Atomic persistence of member and linked beneficiaries
    serverStore.addMember(newMember);
    if (beneficiariesToCreate.length > 0) {
      serverStore.addBeneficiaries(beneficiariesToCreate);
    }

    // Audit logs
    AuditService.log({
      userId: user.id,
      username: user.username,
      userFullName: user.fullName,
      branchId: targetBranch.id,
      branchName: targetBranch.name,
      action: 'MEMBER_CREATED',
      recordType: 'MEMBERS',
      recordId: saccoAccountNumber,
      newValue: `Registered member ${fullName} (A/C: ${saccoAccountNumber}, Status: ${clientStatus}) with ${beneficiariesToCreate.length} beneficiaries at ${targetBranch.name}`,
    });

    for (const ben of beneficiariesToCreate) {
      AuditService.log({
        userId: user.id,
        username: user.username,
        userFullName: user.fullName,
        branchId: targetBranch.id,
        branchName: targetBranch.name,
        action: 'BENEFICIARY_ADDED',
        recordType: 'BENEFICIARY',
        recordId: ben.id,
        newValue: JSON.stringify(ben),
        reason: `Enrolled beneficiary ${ben.fullName} (${ben.relationship}) during registration of member ${saccoAccountNumber}`,
      });
    }

    res.status(201).json({
      success: true,
      data: {
        ...newMember,
        beneficiaries: beneficiariesToCreate,
      },
    });
  }
);

/**
 * PUT /api/members/:accountNumber
 * Edit member information within the five-day rule.
 * During the first five days: Authorized users may edit permitted member information.
 * After five days: Normal editing must automatically become locked.
 * Returns: "Editing locked — record is older than 5 days."
 */
memberRouter.put(
  '/:accountNumber',
  requireAuth,
  requirePermission('members.edit'),
  (req: AuthenticatedRequest, res: Response): void => {
    const user = req.user!;
    const workingBranch = req.workingBranch!;
    const accountNumber = req.params.accountNumber.trim().toUpperCase();

    const member = serverStore.getMemberByAccountNumber(accountNumber);
    if (!member) {
      res.status(404).json({ error: `Member with SACCO account number '${accountNumber}' not found.` });
      return;
    }

    // Branch Authorization: Admin must still obey branch/multi-branch boundaries
    if (!user.hasMultiBranchAccess) {
      const userBranchId = workingBranch?.id || user.primaryBranchId;
      if (member.branchId !== userBranchId) {
        res.status(403).json({ error: 'Forbidden: You are not authorized to modify members in another branch.' });
        return;
      }
    } else {
      const allowed = new Set([user.primaryBranchId, ...(user.allowedBranchIds || [])]);
      if (!allowed.has(member.branchId)) {
        res.status(403).json({ error: 'Forbidden: You do not have multi-branch access to this member\'s branch.' });
        return;
      }
    }

    // 5-DAY RULE ENFORCEMENT
    if (!isWithinFiveDays(member.registrationDate)) {
      // EXACT REQUIRED ERROR MESSAGE
      res.status(403).json({ error: 'Editing locked — record is older than 5 days.' });
      return;
    }

    const body = req.body;
    const updates: Partial<SaccoMember> = {};

    if (body.fullName !== undefined) updates.fullName = body.fullName.trim();
    if (body.gender !== undefined) updates.gender = body.gender;
    if (body.dateOfBirth !== undefined) updates.dateOfBirth = body.dateOfBirth;
    if (body.nationalIdNumber !== undefined) updates.nationalIdNumber = body.nationalIdNumber.trim().toUpperCase();

    if (body.primaryPhone !== undefined) {
      if (!isValidPhone(body.primaryPhone)) {
        res.status(400).json({ error: 'Primary phone number is invalid.' });
        return;
      }
      updates.primaryPhone = body.primaryPhone.trim();
    }

    if (body.alternativePhone !== undefined) {
      if (body.alternativePhone && !isValidPhone(body.alternativePhone)) {
        res.status(400).json({ error: 'Alternative phone number is invalid.' });
        return;
      }
      updates.alternativePhone = body.alternativePhone ? body.alternativePhone.trim() : undefined;
    }

    if (body.emailAddress !== undefined) {
      if (body.emailAddress && !isValidEmail(body.emailAddress)) {
        res.status(400).json({ error: 'Email address format is invalid.' });
        return;
      }
      updates.emailAddress = body.emailAddress ? body.emailAddress.trim().toLowerCase() : undefined;
    }

    if (body.district !== undefined) updates.district = body.district.trim();
    if (body.subCounty !== undefined) updates.subCounty = body.subCounty.trim();
    if (body.parish !== undefined) updates.parish = body.parish.trim();
    if (body.village !== undefined) updates.village = body.village.trim();

    // Account number cannot be changed
    delete (updates as Record<string, unknown>).saccoAccountNumber;
    delete (updates as Record<string, unknown>).registrationDate;
    delete (updates as Record<string, unknown>).branchId;

    const updated = serverStore.updateMember(accountNumber, updates);

    AuditService.log({
      userId: user.id,
      username: user.username,
      userFullName: user.fullName,
      branchId: workingBranch.id,
      branchName: workingBranch.name,
      action: 'MEMBER_EDITED',
      recordType: 'MEMBERS',
      recordId: accountNumber,
      previousValue: JSON.stringify(member),
      newValue: JSON.stringify(updated),
      reason: 'Normal edit within 5-day window',
    });

    res.json({ success: true, data: updated });
  }
);

/**
 * POST /api/members/:accountNumber/correction
 * Controlled correction mechanism for records older than 5 days.
 * Captures: User, Branch, Date/time, Member/account number, Field changed, Previous value, New value, Reason.
 */
memberRouter.post(
  '/:accountNumber/correction',
  requireAuth,
  requirePermission('members.edit'),
  (req: AuthenticatedRequest, res: Response): void => {
    const user = req.user!;
    const workingBranch = req.workingBranch!;
    const accountNumber = req.params.accountNumber.trim().toUpperCase();

    const member = serverStore.getMemberByAccountNumber(accountNumber);
    if (!member) {
      res.status(404).json({ error: `Member with SACCO account number '${accountNumber}' not found.` });
      return;
    }

    // Branch Authorization: Admin must still obey branch/multi-branch boundaries
    if (!user.hasMultiBranchAccess) {
      const userBranchId = workingBranch?.id || user.primaryBranchId;
      if (member.branchId !== userBranchId) {
        res.status(403).json({ error: 'Forbidden: You are not authorized to modify members in another branch.' });
        return;
      }
    } else {
      const allowed = new Set([user.primaryBranchId, ...(user.allowedBranchIds || [])]);
      if (!allowed.has(member.branchId)) {
        res.status(403).json({ error: 'Forbidden: You do not have multi-branch access to this member\'s branch.' });
        return;
      }
    }

    const { fieldChanged, newValue, reason } = req.body;

    if (!fieldChanged || newValue === undefined || !reason || !reason.trim()) {
      res.status(400).json({
        error: 'Controlled correction requires fieldChanged, newValue, and a detailed institutional reason.',
      });
      return;
    }

    // Disallowed fields
    if (['saccoAccountNumber', 'registrationDate', 'createdById', 'createdAt'].includes(fieldChanged)) {
      res.status(400).json({ error: `Field '${fieldChanged}' is immutable and cannot be corrected.` });
      return;
    }

    const prevValue = String((member as unknown as Record<string, unknown>)[fieldChanged] ?? '');

    const correction: ControlledCorrection = {
      id: `corr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      saccoAccountNumber: accountNumber,
      userId: user.id,
      username: user.username,
      branchId: workingBranch.id,
      branchName: workingBranch.name,
      timestamp: new Date().toISOString(),
      fieldChanged,
      previousValue: prevValue,
      newValue: String(newValue).trim(),
      reason: reason.trim(),
    };

    serverStore.addCorrection(correction);

    // Apply change to member record
    const updated = serverStore.updateMember(accountNumber, {
      [fieldChanged]: String(newValue).trim(),
    });

    // Write to audit trail
    AuditService.log({
      userId: user.id,
      username: user.username,
      userFullName: user.fullName,
      branchId: workingBranch.id,
      branchName: workingBranch.name,
      action: 'MEMBER_CORRECTION',
      recordType: 'MEMBERS',
      recordId: accountNumber,
      previousValue: `${fieldChanged}: ${prevValue}`,
      newValue: `${fieldChanged}: ${String(newValue).trim()}`,
      reason: reason.trim(),
    });

    res.json({ success: true, data: updated, correction });
  }
);

/**
 * DELETE /api/members/:accountNumber
 * Admin-only member deletion / deactivation.
 * - Requires 'members.delete' permission.
 * - Enforces branch authorization boundaries.
 * - Checks referential dependencies (plans, contributions, renewals, claims).
 * - Implements safe soft-deletion / deactivation to preserve audit & historical records.
 * - Records full immutable audit log.
 */
memberRouter.delete(
  '/:accountNumber',
  requireAuth,
  requirePermission('members.delete'),
  (req: AuthenticatedRequest, res: Response): void => {
    const user = req.user!;
    const workingBranch = req.workingBranch!;
    const accountNumber = req.params.accountNumber.trim().toUpperCase();

    const member = serverStore.getMemberByAccountNumber(accountNumber);
    if (!member) {
      res.status(404).json({ error: `Member with SACCO account number '${accountNumber}' not found.` });
      return;
    }

    if (member.isDeleted) {
      res.status(400).json({ error: `Member with SACCO account number '${accountNumber}' is already deleted/deactivated.` });
      return;
    }

    // Branch Authorization: Admin must still obey branch/multi-branch boundaries
    if (!user.hasMultiBranchAccess) {
      const userBranchId = workingBranch?.id || user.primaryBranchId;
      if (member.branchId !== userBranchId) {
        res.status(403).json({ error: 'Forbidden: You are not authorized to delete members in another branch.' });
        return;
      }
    } else {
      const allowed = new Set([user.primaryBranchId, ...(user.allowedBranchIds || [])]);
      if (!allowed.has(member.branchId)) {
        res.status(403).json({ error: 'Forbidden: You do not have multi-branch access to this member\'s branch.' });
        return;
      }
    }

    const reason = (req.body?.reason || '').trim() || 'Administrative member record deletion';

    const result = serverStore.deleteMember(accountNumber, {
      userId: user.id,
      username: user.username,
      reason,
    });

    if (!result) {
      res.status(500).json({ error: 'Failed to delete member record.' });
      return;
    }

    // Log deletion in audit trail
    AuditService.log({
      userId: user.id,
      username: user.username,
      userFullName: user.fullName,
      branchId: workingBranch.id,
      branchName: workingBranch.name,
      action: 'MEMBER_DELETED',
      recordType: 'MEMBERS',
      recordId: accountNumber,
      previousValue: JSON.stringify({
        fullName: member.fullName,
        saccoAccountNumber: member.saccoAccountNumber,
        branchId: member.branchId,
        turihamweStatus: member.turihamweStatus,
      }),
      newValue: JSON.stringify({
        isDeleted: true,
        turihamweStatus: 'SUSPENDED',
        deletedByUserId: user.id,
        deletedByUsername: user.username,
        reason,
        preservedDependencies: result.dependencies,
      }),
      reason,
    });

    res.json({
      success: true,
      message: 'Member record successfully deleted / deactivated with referential integrity preserved.',
      data: result.member,
      dependencies: result.dependencies,
    });
  }
);

/**
 * PATCH /api/members/:accountNumber/status
 * Update member vitality status: 'ALIVE' or 'DECEASED'
 * Requirement 4: Explicit status, immediate persistence, audit trail with previous and new status.
 * Marking DECEASED does NOT delete member or linked beneficiaries, claims, or financials.
 */
memberRouter.patch(
  '/:accountNumber/status',
  requireAuth,
  requirePermission('members.edit'),
  (req: AuthenticatedRequest, res: Response): void => {
    const user = req.user!;
    const workingBranch = req.workingBranch!;
    const accountNumber = req.params.accountNumber.trim().toUpperCase();
    const { status, reason } = req.body;

    if (!status || !['ALIVE', 'DECEASED'].includes(status)) {
      res.status(400).json({ error: "Invalid status: Must explicitly be 'ALIVE' or 'DECEASED'." });
      return;
    }

    const member = serverStore.getMemberByAccountNumber(accountNumber);
    if (!member) {
      res.status(404).json({ error: `Member with SACCO account number '${accountNumber}' not found.` });
      return;
    }

    // Branch Authorization check
    if (!user.hasMultiBranchAccess) {
      const userBranchId = workingBranch?.id || user.primaryBranchId;
      if (member.branchId !== userBranchId) {
        res.status(403).json({ error: 'Forbidden: You are not authorized to modify member status in another branch.' });
        return;
      }
    } else {
      const allowed = new Set([user.primaryBranchId, ...(user.allowedBranchIds || [])]);
      if (!allowed.has(member.branchId)) {
        res.status(403).json({ error: "Forbidden: You do not have multi-branch access to this member's branch." });
        return;
      }
    }

    const previousStatus = member.clientStatus || 'ALIVE';
    const nowIso = new Date().toISOString();

    const updated = serverStore.updateMember(accountNumber, {
      clientStatus: status as 'ALIVE' | 'DECEASED',
      clientStatusUpdatedAt: nowIso,
      clientStatusUpdatedByUserId: user.id,
      clientStatusUpdatedByUsername: user.username,
      clientStatusReason: reason?.trim() || undefined,
    });

    AuditService.log({
      userId: user.id,
      username: user.username,
      userFullName: user.fullName,
      branchId: member.branchId,
      branchName: member.branchName || workingBranch.name,
      action: 'MEMBER_STATUS_CHANGED',
      recordType: 'MEMBERS',
      recordId: accountNumber,
      previousValue: previousStatus,
      newValue: status,
      reason: reason?.trim() || `Client status updated from ${previousStatus} to ${status}`,
    });

    res.json({
      success: true,
      data: updated,
      message: `Member vitality status updated to ${status}.`,
    });
  }
);

/**
 * GET /api/members/:accountNumber/beneficiaries
 * Retrieve registered beneficiaries for a SACCO member.
 */
memberRouter.get(
  '/:accountNumber/beneficiaries',
  requireAuth,
  requirePermission('members.view'),
  (req: AuthenticatedRequest, res: Response): void => {
    const accountNumber = req.params.accountNumber.trim().toUpperCase();
    const member = serverStore.getMemberByAccountNumber(accountNumber);
    if (!member) {
      res.status(404).json({ error: `Member with SACCO account number '${accountNumber}' not found.` });
      return;
    }
    const beneficiaries = serverStore.getBeneficiaries(undefined, accountNumber).filter(b => b.isActive !== false);
    res.json({ success: true, data: beneficiaries });
  }
);

/**
 * POST /api/members/:accountNumber/beneficiaries
 * Add a beneficiary for an existing member.
 */
memberRouter.post(
  '/:accountNumber/beneficiaries',
  requireAuth,
  requirePermission('members.edit'),
  (req: AuthenticatedRequest, res: Response): void => {
    const user = req.user!;
    const workingBranch = req.workingBranch!;
    const accountNumber = req.params.accountNumber.trim().toUpperCase();
    const member = serverStore.getMemberByAccountNumber(accountNumber);
    if (!member) {
      res.status(404).json({ error: `Member with SACCO account number '${accountNumber}' not found.` });
      return;
    }

    const { fullName, dateOfBirth, relationship, nationalIdNumber, contactPhone, percentageAllocation } = req.body;

    if (!fullName || !fullName.trim()) {
      res.status(400).json({ error: 'Beneficiary full name is required.' });
      return;
    }
    if (!dateOfBirth) {
      res.status(400).json({ error: 'Beneficiary date of birth is required.' });
      return;
    }
    const dobTime = new Date(dateOfBirth).getTime();
    if (isNaN(dobTime)) {
      res.status(400).json({ error: 'Beneficiary date of birth is invalid.' });
      return;
    }
    if (dobTime > Date.now()) {
      res.status(400).json({ error: 'Beneficiary date of birth cannot be in the future.' });
      return;
    }
    if (!relationship || !relationship.trim()) {
      res.status(400).json({ error: 'Beneficiary relationship is required.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const newBeneficiary: Beneficiary = {
      id: `ben-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      saccoAccountNumber: member.saccoAccountNumber,
      planId: '',
      fullName: fullName.trim(),
      relationship: relationship.trim(),
      dateOfBirth: dateOfBirth.trim(),
      nationalIdNumber: (nationalIdNumber || '').trim().toUpperCase() || undefined,
      contactPhone: (contactPhone || '').trim() || undefined,
      percentageAllocation: Number(percentageAllocation) || 0,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    serverStore.addBeneficiary(newBeneficiary);

    AuditService.log({
      userId: user.id,
      username: user.username,
      userFullName: user.fullName,
      branchId: member.branchId,
      branchName: member.branchName || workingBranch.name,
      action: 'BENEFICIARY_ADDED',
      recordType: 'BENEFICIARY',
      recordId: newBeneficiary.id,
      newValue: JSON.stringify(newBeneficiary),
      reason: `Added beneficiary ${newBeneficiary.fullName} (${newBeneficiary.relationship}) for member ${accountNumber}`,
    });

    res.status(201).json({ success: true, data: newBeneficiary });
  }
);

/**
 * PUT /api/members/:accountNumber/beneficiaries/:beneficiaryId
 * Update beneficiary details.
 */
memberRouter.put(
  '/:accountNumber/beneficiaries/:beneficiaryId',
  requireAuth,
  requirePermission('members.edit'),
  (req: AuthenticatedRequest, res: Response): void => {
    const user = req.user!;
    const workingBranch = req.workingBranch!;
    const { accountNumber, beneficiaryId } = req.params;
    const member = serverStore.getMemberByAccountNumber(accountNumber.trim().toUpperCase());
    if (!member) {
      res.status(404).json({ error: `Member with SACCO account number '${accountNumber}' not found.` });
      return;
    }

    const b = serverStore.getBeneficiaries().find(x => x.id === beneficiaryId);
    if (!b || b.saccoAccountNumber.toUpperCase() !== accountNumber.trim().toUpperCase()) {
      res.status(404).json({ error: 'Beneficiary record not found for this member.' });
      return;
    }

    const { fullName, dateOfBirth, relationship, nationalIdNumber, contactPhone, percentageAllocation } = req.body;
    const updates: Partial<Beneficiary> = {};

    if (fullName !== undefined) updates.fullName = fullName.trim();
    if (relationship !== undefined) updates.relationship = relationship.trim();
    if (dateOfBirth !== undefined) {
      const dobTime = new Date(dateOfBirth).getTime();
      if (isNaN(dobTime)) {
        res.status(400).json({ error: 'Beneficiary date of birth is invalid.' });
        return;
      }
      if (dobTime > Date.now()) {
        res.status(400).json({ error: 'Beneficiary date of birth cannot be in the future.' });
        return;
      }
      updates.dateOfBirth = dateOfBirth.trim();
    }
    if (nationalIdNumber !== undefined) updates.nationalIdNumber = nationalIdNumber.trim().toUpperCase();
    if (contactPhone !== undefined) updates.contactPhone = contactPhone.trim();
    if (percentageAllocation !== undefined) updates.percentageAllocation = Number(percentageAllocation);

    const prev = JSON.stringify(b);
    const updated = serverStore.updateBeneficiary(beneficiaryId, updates);

    AuditService.log({
      userId: user.id,
      username: user.username,
      userFullName: user.fullName,
      branchId: member.branchId,
      branchName: member.branchName || workingBranch.name,
      action: 'BENEFICIARY_UPDATED',
      recordType: 'BENEFICIARY',
      recordId: beneficiaryId,
      previousValue: prev,
      newValue: JSON.stringify(updated),
      reason: `Updated beneficiary details for member ${accountNumber}`,
    });

    res.json({ success: true, data: updated });
  }
);

/**
 * DELETE /api/members/:accountNumber/beneficiaries/:beneficiaryId
 * Deactivate beneficiary record.
 */
memberRouter.delete(
  '/:accountNumber/beneficiaries/:beneficiaryId',
  requireAuth,
  requirePermission('members.edit'),
  (req: AuthenticatedRequest, res: Response): void => {
    const user = req.user!;
    const workingBranch = req.workingBranch!;
    const { accountNumber, beneficiaryId } = req.params;
    const member = serverStore.getMemberByAccountNumber(accountNumber.trim().toUpperCase());
    if (!member) {
      res.status(404).json({ error: `Member with SACCO account number '${accountNumber}' not found.` });
      return;
    }

    const b = serverStore.getBeneficiaries().find(x => x.id === beneficiaryId);
    if (!b || b.saccoAccountNumber.toUpperCase() !== accountNumber.trim().toUpperCase()) {
      res.status(404).json({ error: 'Beneficiary record not found for this member.' });
      return;
    }

    serverStore.deleteBeneficiary(beneficiaryId);

    AuditService.log({
      userId: user.id,
      username: user.username,
      userFullName: user.fullName,
      branchId: member.branchId,
      branchName: member.branchName || workingBranch.name,
      action: 'BENEFICIARY_REMOVED',
      recordType: 'BENEFICIARY',
      recordId: beneficiaryId,
      previousValue: JSON.stringify(b),
      newValue: JSON.stringify({ isActive: false }),
      reason: `Removed/deactivated beneficiary ${b.fullName} (${b.relationship}) from member ${accountNumber}`,
    });

    res.json({ success: true, message: 'Beneficiary removed successfully.' });
  }
);

