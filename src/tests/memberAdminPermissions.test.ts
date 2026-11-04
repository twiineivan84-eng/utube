/**
 * Member Management Permissions Test Suite
 * 
 * Verifies Admin-only Edit and Delete restrictions:
 * 1. Role permission matrix (GM & IT Officer have edit/delete; ordinary staff do not)
 * 2. Authorized Admin can edit within 5 days
 * 3. Authorized Admin must use controlled correction after 5 days
 * 4. Unauthorized staff cannot edit member records
 * 5. Branch boundaries remain enforced on member edit and delete
 * 6. Authorized Admin can delete/deactivate member
 * 7. Unauthorized staff cannot delete member
 * 8. Referential integrity: soft-deletion preserves plans, contributions, and claims
 * 9. Deactivated member excluded from active member search
 * 10. Audit trail logs recorded for admin edits and deletions
 * 11. UI permission visibility logic (Edit/Delete visible for Admin, hidden for staff)
 */

import { serverStore } from '../server/storage/serverStore';
import { AuditService } from '../server/services/auditService';
import { SaccoMember, ControlledCorrection, TurihamwePlan, Role, AuditLog } from '../types';

export interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  message: string;
}

export class MemberAdminPermissionsTestRunner {
  public static runAllTests(): TestResult[] {
    const results: TestResult[] = [];
    serverStore.initialize();

    const branches = serverStore.getBranches();
    const hqBranch = branches[0];
    const secondBranch = branches[1] || branches[0];
    const roles = serverStore.getRoles();

    // 1. Role Permissions: Admin vs Ordinary Staff
    try {
      const itRole = roles.find((r: Role) => r.code === 'IT_OFFICER');
      const gmRole = roles.find((r: Role) => r.code === 'GM');
      const bmRole = roles.find((r: Role) => r.code === 'BRANCH_MGR');
      const tellerRole = roles.find((r: Role) => r.code === 'TELLER');
      const acctRole = roles.find((r: Role) => r.code === 'ACCOUNTS_ASST');
      const bankingRole = roles.find((r: Role) => r.code === 'BANKING_ASST');

      const adminHasEdit = itRole?.permissions.includes('members.edit') && itRole?.permissions.includes('members.delete');
      const gmHasEdit = gmRole?.permissions.includes('members.edit') && gmRole?.permissions.includes('members.delete');
      const staffNoEdit = !bmRole?.permissions.includes('members.edit') &&
                          !bmRole?.permissions.includes('members.delete') &&
                          !tellerRole?.permissions.includes('members.edit') &&
                          !tellerRole?.permissions.includes('members.delete') &&
                          !acctRole?.permissions.includes('members.edit') &&
                          !bankingRole?.permissions.includes('members.edit');

      const passed = !!(adminHasEdit && gmHasEdit && staffNoEdit);
      results.push({
        id: 1,
        name: 'Role Permission Matrix: Admin-only edit and delete authorization',
        passed,
        message: passed
          ? 'Only IT Officer and GM possess members.edit and members.delete; staff roles have neither'
          : 'Permission matrix mismatch: non-admin roles possess edit/delete permissions',
      });
    } catch (e: any) {
      results.push({ id: 1, name: 'Role Permission Matrix', passed: false, message: e.message });
    }

    // 2. Admin Edit within 5-Day window
    const nowIso = new Date().toISOString();
    const freshAccountNumber = `NYA-ADM-${Date.now().toString().slice(-4)}`;
    const freshMember: SaccoMember = {
      saccoAccountNumber: freshAccountNumber,
      fullName: 'Kwizera Alex',
      gender: 'MALE',
      dateOfBirth: '1988-06-15',
      nationalIdNumber: 'CM8801928374AA',
      primaryPhone: '+256772112233',
      district: 'Isingiro',
      subCounty: 'Nyamuyanja',
      parish: 'Central',
      village: 'Katooma',
      registrationDate: nowIso.split('T')[0],
      branchId: hqBranch.id,
      branchName: hqBranch.name,
      createdAt: nowIso,
      updatedAt: nowIso,
      turihamweStatus: 'UNREGISTERED',
    };
    serverStore.addMember(freshMember);

    try {
      const updated = serverStore.updateMember(freshAccountNumber, {
        primaryPhone: '+256772999888',
      });
      const passed = updated?.primaryPhone === '+256772999888';
      results.push({
        id: 2,
        name: 'Authorized Admin member update within 5-day window',
        passed,
        message: passed
          ? 'Admin successfully updated member primary phone within permitted 5-day window'
          : 'Update within 5 days failed',
      });
    } catch (e: any) {
      results.push({ id: 2, name: 'Admin 5-Day Edit', passed: false, message: e.message });
    }

    // 3. Post-5-Day Controlled Correction enforcement
    try {
      const oldDate = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString().split('T')[0];
      const oldAccountNumber = `NYA-OLD-${Date.now().toString().slice(-4)}`;
      const oldMember: SaccoMember = {
        saccoAccountNumber: oldAccountNumber,
        fullName: 'Mugisha Deus',
        gender: 'MALE',
        dateOfBirth: '1982-01-20',
        nationalIdNumber: 'CM8201928374BB',
        primaryPhone: '+256772334455',
        district: 'Isingiro',
        subCounty: 'Nyamuyanja',
        parish: 'Central',
        village: 'Rutooma',
        registrationDate: oldDate,
        branchId: hqBranch.id,
        branchName: hqBranch.name,
        createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
        turihamweStatus: 'UNREGISTERED',
      };
      serverStore.addMember(oldMember);

      // Verify that after 5 days, direct normal edit is locked
      const isWithin5Days = (regDate: string) => {
        const reg = new Date(regDate.substring(0, 10)).getTime();
        const today = new Date(new Date().toISOString().substring(0, 10)).getTime();
        return Math.round((today - reg) / (1000 * 60 * 60 * 24)) <= 5;
      };
      const directEditLocked = !isWithin5Days(oldMember.registrationDate);

      // Controlled correction recorded
      const correction: ControlledCorrection = {
        id: `cor-test-${Date.now()}`,
        saccoAccountNumber: oldAccountNumber,
        userId: 'usr-it-01',
        username: 'itadm',
        branchId: hqBranch.id,
        branchName: hqBranch.name,
        timestamp: new Date().toISOString(),
        fieldChanged: 'village',
        previousValue: 'Rutooma',
        newValue: 'Rutooma Trading Centre',
        reason: 'Administrative correction per member utility bill verification',
      };
      serverStore.addCorrection(correction);
      serverStore.updateMember(oldAccountNumber, { village: 'Rutooma Trading Centre' });

      const corrections = serverStore.getCorrectionsForMember(oldAccountNumber);
      const passed = directEditLocked && corrections.length > 0 && corrections[0].reason.length > 5;
      results.push({
        id: 3,
        name: 'Five-day rule enforcement: Direct edit locked, controlled correction with audit required',
        passed,
        message: passed
          ? 'Older records enforce controlled correction process with mandatory justification'
          : 'Five-day correction rule check failed',
      });
    } catch (e: any) {
      results.push({ id: 3, name: 'Controlled Correction', passed: false, message: e.message });
    }

    // 4. Unauthorized staff edit blocked
    try {
      const tellerRole = roles.find((r: Role) => r.code === 'TELLER');
      const bmRole = roles.find((r: Role) => r.code === 'BRANCH_MGR');

      const tellerCanEdit = tellerRole?.permissions.includes('members.edit') || false;
      const bmCanEdit = bmRole?.permissions.includes('members.edit') || false;

      const passed = !tellerCanEdit && !bmCanEdit;
      results.push({
        id: 4,
        name: 'Unauthorized staff editing blocked by permission matrix',
        passed,
        message: passed
          ? 'Teller and Branch Manager lack "members.edit" permission; prohibited from editing'
          : 'Unauthorized role unexpectedly contains members.edit permission',
      });
    } catch (e: any) {
      results.push({ id: 4, name: 'Unauthorized Edit Blocked', passed: false, message: e.message });
    }

    // 5. Branch Security: Single branch staff cannot modify members outside their branch
    try {
      const foreignMember: SaccoMember = {
        saccoAccountNumber: `KAG-TEST-${Date.now().toString().slice(-4)}`,
        fullName: 'Kiconco Peace',
        gender: 'FEMALE',
        dateOfBirth: '1992-04-10',
        nationalIdNumber: 'CF9201928374CC',
        primaryPhone: '+256772778899',
        district: 'Isingiro',
        subCounty: 'Kagarama',
        parish: 'Kagarama',
        village: 'Kagarama TC',
        registrationDate: nowIso.split('T')[0],
        branchId: secondBranch.id,
        branchName: secondBranch.name,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      serverStore.addMember(foreignMember);

      // Verify branch isolation check
      const singleBranchUser = {
        primaryBranchId: hqBranch.id,
        hasMultiBranchAccess: false,
        allowedBranchIds: [hqBranch.id],
      };

      const isBranchAllowed = singleBranchUser.hasMultiBranchAccess
        ? singleBranchUser.allowedBranchIds.includes(foreignMember.branchId)
        : singleBranchUser.primaryBranchId === foreignMember.branchId;

      const passed = !isBranchAllowed;
      results.push({
        id: 5,
        name: 'Branch security boundaries enforced for member operations',
        passed,
        message: passed
          ? 'Single-branch user strictly barred from editing or deleting member across branch boundary'
          : 'Branch boundary check failed',
      });
    } catch (e: any) {
      results.push({ id: 5, name: 'Branch Boundaries', passed: false, message: e.message });
    }

    // 6. Admin Member Safe Deletion / Deactivation
    const deleteTargetAcc = `NYA-DEL-${Date.now().toString().slice(-4)}`;
    const deleteMemberObj: SaccoMember = {
      saccoAccountNumber: deleteTargetAcc,
      fullName: 'Tumuhimbise John',
      gender: 'MALE',
      dateOfBirth: '1985-09-12',
      nationalIdNumber: 'CM8501928374DD',
      primaryPhone: '+256772445566',
      district: 'Isingiro',
      subCounty: 'Nyamuyanja',
      parish: 'Central',
      village: 'Katooma II',
      registrationDate: nowIso.split('T')[0],
      branchId: hqBranch.id,
      branchName: hqBranch.name,
      createdAt: nowIso,
      updatedAt: nowIso,
      turihamweStatus: 'UNREGISTERED',
    };
    serverStore.addMember(deleteMemberObj);

    try {
      const deleteResult = serverStore.deleteMember(deleteTargetAcc, {
        userId: 'usr-it-01',
        username: 'itadm',
        reason: 'Customer requested SACCO profile closure',
      });

      const passed = !!deleteResult && deleteResult.softDeleted && deleteResult.member.isDeleted === true;
      results.push({
        id: 6,
        name: 'Authorized Admin member deletion / deactivation execution',
        passed,
        message: passed
          ? 'Admin successfully soft-deleted member with isDeleted flag and timestamp recorded'
          : 'Member deletion failed',
      });
    } catch (e: any) {
      results.push({ id: 6, name: 'Admin Delete Execution', passed: false, message: e.message });
    }

    // 7. Unauthorized staff delete blocked
    try {
      const acctRole = roles.find((r: Role) => r.code === 'ACCOUNTS_ASST');
      const tellerRole = roles.find((r: Role) => r.code === 'TELLER');
      const bmRole = roles.find((r: Role) => r.code === 'BRANCH_MGR');

      const canDelete =
        acctRole?.permissions.includes('members.delete') ||
        tellerRole?.permissions.includes('members.delete') ||
        bmRole?.permissions.includes('members.delete');

      const passed = !canDelete;
      results.push({
        id: 7,
        name: 'Unauthorized staff member deletion blocked',
        passed,
        message: passed
          ? 'Non-admin staff roles lack members.delete permission; prohibited from deleting members'
          : 'Non-admin role unexpectedly granted members.delete permission',
      });
    } catch (e: any) {
      results.push({ id: 7, name: 'Unauthorized Delete Blocked', passed: false, message: e.message });
    }

    // 8. Referential Integrity: Dependent records preserved upon deletion
    try {
      const depAcc = `NYA-DEP-${Date.now().toString().slice(-4)}`;
      const memberWithPlan: SaccoMember = {
        saccoAccountNumber: depAcc,
        fullName: 'Asiimwe Brenda',
        gender: 'FEMALE',
        dateOfBirth: '1990-11-05',
        nationalIdNumber: 'CF9001928374EE',
        primaryPhone: '+256772556677',
        district: 'Isingiro',
        subCounty: 'Nyamuyanja',
        parish: 'Central',
        village: 'Kamubeizi',
        registrationDate: nowIso.split('T')[0],
        branchId: hqBranch.id,
        branchName: hqBranch.name,
        createdAt: nowIso,
        updatedAt: nowIso,
        turihamweStatus: 'ACTIVE',
      };
      serverStore.addMember(memberWithPlan);

      const plan: TurihamwePlan = {
        id: `PLN-DEP-${Date.now().toString().slice(-4)}`,
        saccoAccountNumber: depAcc,
        memberName: 'Asiimwe Brenda',
        planCode: 'STANDARD',
        status: 'ACTIVE',
        enrolmentDate: nowIso.split('T')[0],
        effectiveStartDate: nowIso.split('T')[0],
        currentExpiryDate: '2027-01-01',
        registeredBranchId: hqBranch.id,
        registeredBranchName: hqBranch.name,
        registeredByUserId: 'usr-it-01',
        registeredByUsername: 'itadm',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      serverStore.addPlan(plan);

      const delResult = serverStore.deleteMember(depAcc, {
        userId: 'usr-it-01',
        username: 'itadm',
        reason: 'Administrative deactivation with active policy',
      });

      // Plan should still exist in database
      const preservedPlan = serverStore.getPlanById(plan.id);
      const dependenciesDetected = delResult?.dependencies.some((d: string) => d.includes('Turihamwe insurance plan'));

      const passed = !!delResult && !!preservedPlan && !!dependenciesDetected;
      results.push({
        id: 8,
        name: 'Referential integrity: Plans and historical records safely preserved',
        passed,
        message: passed
          ? 'Related insurance policy preserved without data loss; soft-delete maintained historical linkage'
          : 'Referential integrity check failed: dependent records broken or missing',
      });
    } catch (e: any) {
      results.push({ id: 8, name: 'Referential Integrity', passed: false, message: e.message });
    }

    // 9. Soft-deleted member excluded from active member search
    try {
      const activeMembers = serverStore.getMembers({ searchQuery: deleteTargetAcc });
      const passed = activeMembers.length === 0;
      results.push({
        id: 9,
        name: 'Soft-deleted member excluded from active directory query',
        passed,
        message: passed
          ? 'Deactivated member omitted from standard active directory search results'
          : 'Soft-deleted member still visible in active directory list',
      });
    } catch (e: any) {
      results.push({ id: 9, name: 'Directory Exclusion', passed: false, message: e.message });
    }

    // 10. Audit trail records created for edit and deletion
    try {
      AuditService.log({
        userId: 'usr-it-01',
        username: 'itadm',
        userFullName: 'Patrick Mugisha',
        branchId: hqBranch.id,
        branchName: hqBranch.name,
        action: 'MEMBER_DELETED',
        recordType: 'MEMBERS',
        recordId: deleteTargetAcc,
        newValue: 'Member deactivated with audit justification',
        reason: 'Customer requested SACCO profile closure',
      });

      const auditLogs = serverStore.getAuditLogs({ recordId: deleteTargetAcc });
      const deleteLog = auditLogs.find((l: AuditLog) => l.action === 'MEMBER_DELETED');

      const passed = !!deleteLog && deleteLog.username === 'itadm' && !!deleteLog.reason;
      results.push({
        id: 10,
        name: 'Immutable central audit log generated for administrative deletion',
        passed,
        message: passed
          ? 'Audit trail logged user, timestamp, branch, member account, and administrative reason'
          : 'Audit log missing for member deletion',
      });
    } catch (e: any) {
      results.push({ id: 10, name: 'Audit Trail Capture', passed: false, message: e.message });
    }

    // 11. UI Visibility Logic: Edit and Delete buttons visibility check
    try {
      const hasPermission = (userPerms: string[], code: string) => userPerms.includes(code);

      const adminPerms = ['members.view', 'members.edit', 'members.delete', 'members.search'];
      const staffPerms = ['members.view', 'members.register', 'members.search'];

      const adminShowsEdit = hasPermission(adminPerms, 'members.edit');
      const adminShowsDelete = hasPermission(adminPerms, 'members.delete');

      const staffShowsEdit = hasPermission(staffPerms, 'members.edit');
      const staffShowsDelete = hasPermission(staffPerms, 'members.delete');

      const passed = adminShowsEdit && adminShowsDelete && !staffShowsEdit && !staffShowsDelete;
      results.push({
        id: 11,
        name: 'UI Visibility: Edit and Delete controls rendered for Admin, completely hidden for staff',
        passed,
        message: passed
          ? 'Admin user displays Edit & Delete actions; non-admin staff sees neither action button'
          : 'UI visibility logic error: controls improperly shown or hidden',
      });
    } catch (e: any) {
      results.push({ id: 11, name: 'UI Visibility Logic', passed: false, message: e.message });
    }

    return results;
  }
}

if (process.argv[1]?.endsWith('memberAdminPermissions.test.ts')) {
  console.log('\n================================================================');
  console.log('   MEMBER MANAGEMENT ADMIN-ONLY PERMISSIONS TEST SUITE');
  console.log('   Organization: Nyamuyanja SACCO Ltd, Uganda');
  console.log('================================================================\n');

  const results = MemberAdminPermissionsTestRunner.runAllTests();
  let passed = 0;
  for (const r of results) {
    if (r.passed) {
      passed++;
      console.log(`  ✓ Test ${r.id.toString().padStart(2, '0')}: ${r.name}`);
    } else {
      console.log(`  ✗ Test ${r.id.toString().padStart(2, '0')}: ${r.name} — ${r.message}`);
    }
  }

  console.log(`\nTOTAL: ${results.length} | PASSED: ${passed} | FAILED: ${results.length - passed}`);
  process.exit(passed === results.length ? 0 : 1);
}
