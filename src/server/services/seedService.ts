import bcrypt from 'bcryptjs';
import { serverStore } from '../storage/serverStore';
import { User, SaccoMember } from '../../types';
import { AuditService } from './auditService';

export class SeedService {
  public static async seedInitialData(): Promise<void> {
    await serverStore.initialize();

    const branches = serverStore.getBranches();
    const roles = serverStore.getRoles();

    const hqBranch = branches.find(b => b.code === 'NYAMUYANJA') || branches[0];
    const kagaramaBranch = branches.find(b => b.code === 'KAGARAMA') || branches[1];

    const gmRole = roles.find(r => r.code === 'GM')!;
    const itRole = roles.find(r => r.code === 'IT_OFFICER')!;
    const bmRole = roles.find(r => r.code === 'BRANCH_MGR')!;
    const tellerRole = roles.find(r => r.code === 'TELLER')!;
    const acctRole = roles.find(r => r.code === 'ACCOUNTS_ASST')!;
    const auditorRole = roles.find(r => r.code === 'AUDITOR')!;

    const defaultPasswordHash = await bcrypt.hash('Admin@2026!', 10);
    const staffPasswordHash = await bcrypt.hash('Staff@2026!', 10);
    const ivanPasswordHash = await bcrypt.hash('9090', 10);

    const devSeedUsers: User[] = [
      {
        id: 'usr-it-ivan',
        username: 'ivan', // 4 chars
        fullName: 'Ivan (IT Officer)',
        email: 'ivan.it@nyamuyanjasacco.ug',
        phone: '+256701009090',
        passwordHash: ivanPasswordHash,
        roleId: itRole.id,
        roleName: itRole.name,
        primaryBranchId: hqBranch.id,
        allowedBranchIds: branches.map(b => b.id),
        hasMultiBranchAccess: true,
        isActive: true,
        requiresPasswordReset: false,
        directPermissions: [],
        revokedPermissions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'usr-it-01',
        username: 'itadm', // 5 chars
        fullName: 'Patrick Mugisha (IT Officer)',
        email: 'it.admin@nyamuyanjasacco.ug',
        phone: '+256701234567',
        passwordHash: defaultPasswordHash,
        roleId: itRole.id,
        roleName: itRole.name,
        primaryBranchId: hqBranch.id,
        allowedBranchIds: branches.map(b => b.id),
        hasMultiBranchAccess: true,
        isActive: true,
        requiresPasswordReset: false,
        directPermissions: [],
        revokedPermissions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'usr-gm-01',
        username: 'gm001', // 5 chars
        fullName: 'Eunice Ahimbisibwe (General Manager)',
        email: 'gm@nyamuyanjasacco.ug',
        phone: '+256702345678',
        passwordHash: defaultPasswordHash,
        roleId: gmRole.id,
        roleName: gmRole.name,
        primaryBranchId: hqBranch.id,
        allowedBranchIds: branches.map(b => b.id),
        hasMultiBranchAccess: true,
        isActive: true,
        requiresPasswordReset: false,
        directPermissions: [],
        revokedPermissions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'usr-bm-nya',
        username: 'bmnya', // 5 chars - Branch Manager Nyamuyanja
        fullName: 'Frank Twinamatsiko (Branch Manager - Nyamuyanja)',
        email: 'bm.nyamuyanja@nyamuyanjasacco.ug',
        phone: '+256703456789',
        passwordHash: staffPasswordHash,
        roleId: bmRole.id,
        roleName: bmRole.name,
        primaryBranchId: hqBranch.id,
        allowedBranchIds: [hqBranch.id],
        hasMultiBranchAccess: false, // Single-branch user
        isActive: true,
        requiresPasswordReset: false,
        directPermissions: [],
        revokedPermissions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'usr-csh-01',
        username: 'csh01', // 5 chars - Cashier / Teller
        fullName: 'Sarah Kemigisha (Teller - Nyamuyanja)',
        email: 'teller01@nyamuyanjasacco.ug',
        phone: '+256704567890',
        passwordHash: staffPasswordHash,
        roleId: tellerRole.id,
        roleName: tellerRole.name,
        primaryBranchId: hqBranch.id,
        allowedBranchIds: [hqBranch.id],
        hasMultiBranchAccess: false, // Single-branch user
        isActive: true,
        requiresPasswordReset: false,
        directPermissions: [],
        revokedPermissions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'usr-acct-01',
        username: 'acct1', // 5 chars - Accounts Assistant
        fullName: 'Brian Atukwase (Accounts Assistant)',
        email: 'accounts@nyamuyanjasacco.ug',
        phone: '+256705678901',
        passwordHash: staffPasswordHash,
        roleId: acctRole.id,
        roleName: acctRole.name,
        primaryBranchId: hqBranch.id,
        allowedBranchIds: [hqBranch.id],
        hasMultiBranchAccess: false, // Single-branch user
        isActive: true,
        requiresPasswordReset: false,
        directPermissions: [],
        revokedPermissions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'usr-aud-01',
        username: 'audit', // 5 chars - Internal Auditor
        fullName: 'Doreen Natukunda (Internal Auditor)',
        email: 'auditor@nyamuyanjasacco.ug',
        phone: '+256706789012',
        passwordHash: staffPasswordHash,
        roleId: auditorRole.id,
        roleName: auditorRole.name,
        primaryBranchId: hqBranch.id,
        allowedBranchIds: branches.map(b => b.id),
        hasMultiBranchAccess: true, // Multi-branch for institutional surveillance
        isActive: true,
        requiresPasswordReset: false,
        directPermissions: [],
        revokedPermissions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    // Ensure default IT Officer account: ivan
    const existingIvan = serverStore.getUserByUsername('ivan');
    if (!existingIvan) {
      const ivanUser = devSeedUsers.find(u => u.username === 'ivan')!;
      serverStore.addUser(ivanUser);

      AuditService.log({
        userId: 'system',
        username: 'system',
        userFullName: 'System Initializer',
        branchId: hqBranch.id,
        branchName: hqBranch.name,
        action: 'USER_CREATED',
        recordType: 'USER',
        recordId: ivanUser.id,
        newValue: JSON.stringify({
          id: ivanUser.id,
          username: ivanUser.username,
          fullName: ivanUser.fullName,
          roleId: ivanUser.roleId,
          roleName: ivanUser.roleName,
          hasMultiBranchAccess: ivanUser.hasMultiBranchAccess,
        }),
        reason: 'Seeded default IT Officer administrator account',
      });
    } else {
      // If it exists: Update the existing account to the IT Officer role only if necessary.
      // Ensure the intended initial credential is correctly configured.
      // Preserve existing user ID and audit history.
      const needsRoleOrBranchUpdate =
        existingIvan.roleId !== itRole.id ||
        !existingIvan.hasMultiBranchAccess ||
        !existingIvan.isActive;

      serverStore.updateUser(existingIvan.id, {
        roleId: itRole.id,
        roleName: itRole.name,
        passwordHash: ivanPasswordHash,
        hasMultiBranchAccess: true,
        allowedBranchIds: branches.map(b => b.id),
        isActive: true,
      });

      if (needsRoleOrBranchUpdate) {
        AuditService.log({
          userId: 'system',
          username: 'system',
          userFullName: 'System Initializer',
          branchId: hqBranch.id,
          branchName: hqBranch.name,
          action: 'USER_UPDATED',
          recordType: 'USER',
          recordId: existingIvan.id,
          newValue: JSON.stringify({
            id: existingIvan.id,
            username: existingIvan.username,
            roleId: itRole.id,
            roleName: itRole.name,
            hasMultiBranchAccess: true,
          }),
          reason: 'Updated existing account to default IT Officer administrator role and initial credentials',
        });
      }
    }

    const isDeploymentReady = serverStore.getSystemSettings()['deployment.ready'] === 'true' && process.env.SEED_TEST_DATA !== 'true';

    // Only seed dev users if the system is NOT marked deployment-ready AND user accounts have not already been initialized.
    // Crucially: NEVER re-seed any account that was explicitly deleted by an administrator.
    if (!isDeploymentReady && serverStore.getUsers().length <= 1) {
      for (const u of devSeedUsers) {
        if (
          u.username !== 'ivan' &&
          !serverStore.getUserByUsername(u.username) &&
          !serverStore.isUserDeleted(u.username) &&
          !serverStore.isUserDeleted(u.id)
        ) {
          serverStore.addUser(u);
        }
      }
    }

    if (!isDeploymentReady) {
      // Ensure essential SACCO members exist
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString();
      const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 24 * 3600 * 1000).toISOString();

      const seedMembersList: SaccoMember[] = [
      {
        saccoAccountNumber: 'NYA-001042',
        fullName: 'Kato Emmanuel',
        gender: 'MALE',
        dateOfBirth: '1985-04-12',
        nationalIdNumber: 'CM85012345XYZ',
        primaryPhone: '+256772112233',
        alternativePhone: '+256750998877',
        emailAddress: 'kato.emmanuel@gmail.com',
        district: 'Isingiro',
        subCounty: 'Nyamuyanja',
        parish: 'Kashojwa',
        village: 'Kashojwa Central',
        registrationDate: twoDaysAgo.split('T')[0],
        branchId: hqBranch.id,
        branchName: hqBranch.name,
        createdById: 'usr-bm-nya',
        createdByUsername: 'bmnya',
        isLockedFromNormalEdit: false,
        turihamweStatus: 'ACTIVE',
        createdAt: twoDaysAgo,
        updatedAt: twoDaysAgo,
      },
      {
        saccoAccountNumber: 'NYA-000819',
        fullName: 'Tumusiime Grace Mugisha',
        gender: 'FEMALE',
        dateOfBirth: '1990-11-20',
        nationalIdNumber: 'CF90098765ABC',
        primaryPhone: '+256701889900',
        alternativePhone: '+256773445566',
        emailAddress: 'grace.tumusiime@yahoo.com',
        district: 'Isingiro',
        subCounty: 'Nyamuyanja',
        parish: 'Rukoni',
        village: 'Rukoni West',
        registrationDate: fortyFiveDaysAgo.split('T')[0],
        branchId: hqBranch.id,
        branchName: hqBranch.name,
        createdById: 'usr-bm-nya',
        createdByUsername: 'bmnya',
        isLockedFromNormalEdit: true,
        turihamweStatus: 'ACTIVE',
        createdAt: fortyFiveDaysAgo,
        updatedAt: fortyFiveDaysAgo,
      },
      {
        saccoAccountNumber: 'KAG-000412',
        fullName: 'Baguma Rogers',
        gender: 'MALE',
        dateOfBirth: '1978-08-15',
        nationalIdNumber: 'CM78045612DEF',
        primaryPhone: '+256782334455',
        district: 'Isingiro',
        subCounty: 'Kagarama',
        parish: 'Kagarama East',
        village: 'Kagarama Central',
        registrationDate: fortyFiveDaysAgo.split('T')[0],
        branchId: kagaramaBranch.id,
        branchName: kagaramaBranch.name,
        createdById: 'usr-it-01',
        createdByUsername: 'itadm',
        isLockedFromNormalEdit: true,
        turihamweStatus: 'ACTIVE',
        createdAt: fortyFiveDaysAgo,
        updatedAt: fortyFiveDaysAgo,
      },
      {
        saccoAccountNumber: 'NYA-002109',
        fullName: 'Mukasa Ronald',
        gender: 'MALE',
        dateOfBirth: '1979-09-22',
        nationalIdNumber: 'CM79023456ABC',
        primaryPhone: '+256782334455',
        district: 'Isingiro',
        subCounty: 'Nyamuyanja',
        parish: 'Rukoni',
        village: 'Rukoni East',
        registrationDate: fortyFiveDaysAgo.split('T')[0],
        branchId: hqBranch.id,
        branchName: hqBranch.name,
        createdById: 'usr-bm-nya',
        createdByUsername: 'bmnya',
        isLockedFromNormalEdit: true,
        turihamweStatus: 'ACTIVE',
        createdAt: fortyFiveDaysAgo,
        updatedAt: fortyFiveDaysAgo,
      },
      {
        saccoAccountNumber: 'MSH-000305',
        fullName: 'Natukunda Patience',
        gender: 'FEMALE',
        dateOfBirth: '1992-06-18',
        nationalIdNumber: 'CF92045678GHI',
        primaryPhone: '+256755778899',
        district: 'Isingiro',
        subCounty: 'Masha',
        parish: 'Masha North',
        village: 'Masha Trading Centre',
        registrationDate: twoDaysAgo.split('T')[0],
        branchId: branches.find(b => b.code === 'MASHA')?.id || hqBranch.id,
        branchName: branches.find(b => b.code === 'MASHA')?.name || hqBranch.name,
        createdById: 'usr-it-ivan',
        createdByUsername: 'ivan',
        isLockedFromNormalEdit: false,
        turihamweStatus: 'ACTIVE',
        createdAt: twoDaysAgo,
        updatedAt: twoDaysAgo,
      },
    ];

    for (const sm of seedMembersList) {
      if (!serverStore.getMemberByAccountNumber(sm.saccoAccountNumber)) {
        serverStore.addMember(sm);
      }
    }

    // Seed initial plans and sample claims if none exist
    if (serverStore.getPlans().length === 0) {
      const hqBranch = branches.find(b => b.code === 'NYAMUYANJA') || branches[0];
      const now = new Date();
      const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 3600 * 1000).toISOString();
      const futureExpiry = new Date(now.getTime() + 325 * 24 * 3600 * 1000).toISOString().split('T')[0];

      const plan1 = {
        id: 'PLN-NYA-001042',
        saccoAccountNumber: 'NYA-001042',
        memberName: 'Kato Emmanuel',
        planCode: 'STANDARD_COVER',
        status: 'ACTIVE' as const,
        enrolmentDate: fortyDaysAgo.split('T')[0],
        effectiveStartDate: fortyDaysAgo.split('T')[0],
        currentExpiryDate: futureExpiry,
        registeredBranchId: hqBranch.id,
        registeredBranchName: hqBranch.name,
        registeredByUserId: 'usr-bm-nya',
        registeredByUsername: 'bmnya',
        beneficiaryCount: 2,
        totalContributionsAmount: 120000,
        createdAt: fortyDaysAgo,
        updatedAt: fortyDaysAgo,
      };

      const plan2 = {
        id: 'PLN-NYA-000819',
        saccoAccountNumber: 'NYA-000819',
        memberName: 'Tumusiime Grace',
        planCode: 'STANDARD_COVER',
        status: 'ACTIVE' as const,
        enrolmentDate: fortyDaysAgo.split('T')[0],
        effectiveStartDate: fortyDaysAgo.split('T')[0],
        currentExpiryDate: futureExpiry,
        registeredBranchId: hqBranch.id,
        registeredBranchName: hqBranch.name,
        registeredByUserId: 'usr-bm-nya',
        registeredByUsername: 'bmnya',
        beneficiaryCount: 1,
        totalContributionsAmount: 120000,
        createdAt: fortyDaysAgo,
        updatedAt: fortyDaysAgo,
      };

      serverStore.addPlan(plan1);
      serverStore.addPlan(plan2);

      const ben1 = {
        id: 'ben-001',
        saccoAccountNumber: 'NYA-001042',
        planId: 'PLN-NYA-001042',
        fullName: 'Grace Namutebi',
        relationship: 'Spouse',
        contactPhone: '+256772998877',
        percentageAllocation: 60,
        isActive: true,
        createdAt: fortyDaysAgo,
        updatedAt: fortyDaysAgo,
      };

      const ben2 = {
        id: 'ben-002',
        saccoAccountNumber: 'NYA-001042',
        planId: 'PLN-NYA-001042',
        fullName: 'Brian Kato Junior',
        relationship: 'Child',
        contactPhone: '+256772998877',
        percentageAllocation: 40,
        isActive: true,
        createdAt: fortyDaysAgo,
        updatedAt: fortyDaysAgo,
      };

      serverStore.addBeneficiary(ben1);
      serverStore.addBeneficiary(ben2);
    }

    // Seed initial claims if none exist
    if (serverStore.getClaims().length === 0) {
      const hqBranch = branches.find(b => b.code === 'NYAMUYANJA') || branches[0];
      const now = new Date();
      const claimDate = new Date(now.getTime() - 5 * 24 * 3600 * 1000).toISOString().split('T')[0];
      const memberPlans = serverStore.getPlans({ searchQuery: 'NYA-001042' });
      const planId = memberPlans.length > 0 ? memberPlans[0].id : 'PLN-NYA-001042';

      const claim1 = {
        id: 'clm-seed-001',
        claimReference: 'CLM-NYA-2026-0001',
        saccoAccountNumber: 'NYA-001042',
        memberName: 'Kato Emmanuel',
        planId,
        planCode: 'STANDARD_COVER',
        beneficiaryId: 'ben-001',
        beneficiaryName: 'Grace Namutebi',
        beneficiaryRelationship: 'Spouse',
        branchId: hqBranch.id,
        branchName: hqBranch.name,
        claimDate,
        status: 'UNDER_REVIEW' as const,
        claimCategory: 'DEATH_OF_BENEFICIARY' as const,
        incidentDate: new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
        incidentDescription: 'Passing away of spouse at Mbarara Regional Referral Hospital following illness.',
        preparerUserId: 'usr-csh-01',
        preparerUsername: 'csh01',
        preparerFullName: 'Sarah Kemigisha (Teller)',
        supportingDocuments: [
          {
            id: 'doc-seed-01',
            claimId: 'clm-seed-001',
            documentCategory: 'DEATH_CERTIFICATE' as const,
            documentTitle: 'Hospital Death Notification & Certificate',
            originalFileName: 'mbarara_hospital_death_cert_namutebi.pdf',
            fileSize: 450200,
            mimeType: 'application/pdf',
            uploadedByUserId: 'usr-csh-01',
            uploadedByUsername: 'csh01',
            uploadedByUserFullName: 'Sarah Kemigisha (Teller)',
            branchId: hqBranch.id,
            branchName: hqBranch.name,
            uploadedAt: claimDate,
            status: 'VALID' as const,
            version: 1,
          },
          {
            id: 'doc-seed-02',
            claimId: 'clm-seed-001',
            documentCategory: 'LC1_CHAIRPERSON_LETTER' as const,
            documentTitle: 'LC1 Confirmation Letter - Kashojwa Village',
            originalFileName: 'lc1_kashojwa_confirmation.pdf',
            fileSize: 215400,
            mimeType: 'application/pdf',
            uploadedByUserId: 'usr-csh-01',
            uploadedByUsername: 'csh01',
            uploadedByUserFullName: 'Sarah Kemigisha (Teller)',
            branchId: hqBranch.id,
            branchName: hqBranch.name,
            uploadedAt: claimDate,
            status: 'VALID' as const,
            version: 1,
          },
        ],
        reviewHistory: [
          {
            id: 'rev-seed-01',
            claimId: 'clm-seed-001',
            reviewerUserId: 'usr-bm-nya',
            reviewerUsername: 'bmnya',
            reviewerFullName: 'Frank Twinamatsiko (Branch Manager)',
            branchId: hqBranch.id,
            branchName: hqBranch.name,
            reviewDate: new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString(),
            reviewNotes: 'Initial verification completed. Member plan is ACTIVE. Hospital death certificate verified against LC1 letter.',
            statusAssigned: 'UNDER_REVIEW' as const,
            createdAt: new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString(),
          },
        ],
        latestReviewNotes: 'Initial verification completed. Member plan is ACTIVE. Hospital death certificate verified against LC1 letter.',
        createdAt: new Date(now.getTime() - 5 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString(),
      };

      serverStore.addClaim(claim1);
    }
  }

    // Seed default SMS templates if none exist
    if (serverStore.getSmsTemplates().length === 0) {
      const defaultTemplates = [
        {
          id: 'tmpl-exp-30',
          code: 'EXPIRY_30_DAYS',
          category: 'EXPIRY_REMINDER_30_DAYS' as const,
          name: '30-Day Policy Expiry Reminder',
          templateText: 'Dear [Member Name], your Turihamwe cover with Nyamuyanja SACCO expires on [Expiry Date]. Please renew at [Branch] before the expiry date to maintain your funeral coverage benefits.',
          availableVariables: ['[Member Name]', '[Expiry Date]', '[Branch]', '[Policy Code]', '[Account Number]'],
          isActive: true,
          createdByUserId: 'usr-it-01',
          createdByUserFullName: 'Isaac Tumwesigye (IT Officer)',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'tmpl-exp-14',
          code: 'EXPIRY_14_DAYS',
          category: 'EXPIRY_REMINDER_14_DAYS' as const,
          name: '14-Day Expiry Urgent Reminder',
          templateText: 'Reminder: Dear [Member Name], your Turihamwe funeral coverage expires in 14 days on [Expiry Date]. Avoid benefit lapse by renewing at [Branch].',
          availableVariables: ['[Member Name]', '[Expiry Date]', '[Branch]', '[Policy Code]'],
          isActive: true,
          createdByUserId: 'usr-it-01',
          createdByUserFullName: 'Isaac Tumwesigye (IT Officer)',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'tmpl-exp-7',
          code: 'EXPIRY_7_DAYS',
          category: 'EXPIRY_REMINDER_7_DAYS' as const,
          name: '7-Day Expiry Critical Warning',
          templateText: 'URGENT: Dear [Member Name], 7 days remaining for Turihamwe policy [Policy Code] expiring [Expiry Date]. Renew now at [Branch] or via teller.',
          availableVariables: ['[Member Name]', '[Expiry Date]', '[Branch]', '[Policy Code]'],
          isActive: true,
          createdByUserId: 'usr-it-01',
          createdByUserFullName: 'Isaac Tumwesigye (IT Officer)',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'tmpl-exp-due',
          code: 'EXPIRY_DATE_NOTICE',
          category: 'EXPIRY_DATE_NOTICE' as const,
          name: 'Official Turihamwe Plan Expiry Notice',
          templateText: 'NYAMUYANJA SACCO nekumanyisa ku sente zawe za Turihamwe zihwireyo noshabwa kushashura obutarenzya ebiro mushanju (7) kuriga erizooba',
          availableVariables: [],
          isActive: true,
          createdByUserId: 'usr-it-01',
          createdByUserFullName: 'Isaac Tumwesigye (IT Officer)',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'tmpl-clm-sub',
          code: 'CLAIM_SUBMITTED_NOTICE',
          category: 'CLAIM_SUBMITTED' as const,
          name: 'Claim Submitted Acknowledgement',
          templateText: 'Dear [Member Name], claim docket [Claim Reference] has been received and entered review under [Branch]. You will be updated as review progresses.',
          availableVariables: ['[Member Name]', '[Claim Reference]', '[Branch]'],
          isActive: true,
          createdByUserId: 'usr-it-01',
          createdByUserFullName: 'Isaac Tumwesigye (IT Officer)',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'tmpl-clm-docs',
          code: 'CLAIM_DOCS_REQUESTED_NOTICE',
          category: 'CLAIM_DOCS_REQUESTED' as const,
          name: 'Claim Additional Documents Requested',
          templateText: 'Dear [Member Name], additional documents are required to process claim [Claim Reference]. Please deliver requested papers to [Branch].',
          availableVariables: ['[Member Name]', '[Claim Reference]', '[Branch]'],
          isActive: true,
          createdByUserId: 'usr-it-01',
          createdByUserFullName: 'Isaac Tumwesigye (IT Officer)',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'tmpl-clm-app',
          code: 'CLAIM_APPROVED_NOTICE',
          category: 'CLAIM_APPROVED' as const,
          name: 'Claim Approved Notification',
          templateText: 'Dear [Member Name], claim docket [Claim Reference] has been APPROVED. Disbursement processing is underway at [Branch].',
          availableVariables: ['[Member Name]', '[Claim Reference]', '[Branch]'],
          isActive: true,
          createdByUserId: 'usr-it-01',
          createdByUserFullName: 'Isaac Tumwesigye (IT Officer)',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'tmpl-clm-rej',
          code: 'CLAIM_REJECTED_NOTICE',
          category: 'CLAIM_REJECTED' as const,
          name: 'Claim Rejection Formal Notification',
          templateText: 'Notice: Claim docket [Claim Reference] could not be approved following policy review. Visit [Branch] for official documented explanation.',
          availableVariables: ['[Member Name]', '[Claim Reference]', '[Branch]'],
          isActive: true,
          createdByUserId: 'usr-it-01',
          createdByUserFullName: 'Isaac Tumwesigye (IT Officer)',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'tmpl-contrib-rec',
          code: 'CONTRIBUTION_RECEIPT_NOTICE',
          category: 'CONTRIBUTION_RECEIVED' as const,
          name: 'Contribution Receipt Notification',
          templateText: 'Nyamuyanja SACCO: Received UGX [Amount UGX] for Turihamwe Account [Account Number]. Receipt Ref: [Receipt Number]. Thank you.',
          availableVariables: ['[Member Name]', '[Account Number]', '[Amount UGX]', '[Receipt Number]', '[Branch]'],
          isActive: true,
          createdByUserId: 'usr-it-01',
          createdByUserFullName: 'Isaac Tumwesigye (IT Officer)',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      for (const t of defaultTemplates) {
        serverStore.addSmsTemplate(t);
      }
    } else {
      // Ensure approved expiry notice template is synchronized
      const existingDueTmpl = serverStore.getSmsTemplates().find(t => t.category === 'EXPIRY_DATE_NOTICE' || t.code === 'EXPIRY_DATE_NOTICE');
      if (existingDueTmpl && existingDueTmpl.templateText !== 'NYAMUYANJA SACCO nekumanyisa ku sente zawe za Turihamwe zihwireyo noshabwa kushashura obutarenzya ebiro mushanju (7) kuriga erizooba') {
        existingDueTmpl.templateText = 'NYAMUYANJA SACCO nekumanyisa ku sente zawe za Turihamwe zihwireyo noshabwa kushashura obutarenzya ebiro mushanju (7) kuriga erizooba';
        existingDueTmpl.name = 'Official Turihamwe Plan Expiry Notice';
        serverStore.updateSmsTemplate(existingDueTmpl);
      }
    }

    // Seed initial alerts if none exist
    if (serverStore.getAlerts().length === 0) {
      serverStore.addAlert({
        id: 'alt-seed-01',
        category: 'CLAIM_AWAITING_REVIEW',
        severity: 'INFO',
        title: 'Claim Docket Awaiting Review',
        message: 'Claim CLM-NYA-2026-0001 for member Kato Emmanuel is awaiting supervisory review.',
        branchId: hqBranch.id,
        branchName: hqBranch.name,
        linkTab: 'claims',
        recordId: 'clm-seed-001',
        requiredPermission: 'claims.review',
        status: 'UNREAD',
        readByUsers: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      serverStore.addAlert({
        id: 'alt-seed-02',
        category: 'UPCOMING_EXPIRY',
        severity: 'WARNING',
        title: 'Upcoming Turihamwe Policy Expiries',
        message: '14 member policies approaching annual expiry threshold within 30 days.',
        branchId: hqBranch.id,
        branchName: hqBranch.name,
        linkTab: 'turihamwe',
        requiredPermission: 'turihamwe.view_expiry',
        status: 'UNREAD',
        readByUsers: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    AuditService.log({
      userId: 'system',
      username: 'SYSTEM',
      userFullName: 'Turihamwe Initializer',
      branchId: hqBranch.id,
      branchName: hqBranch.name,
      action: 'SYSTEM_SETTING_CHANGED',
      recordType: 'SYSTEM',
      newValue: 'Initial branch and security seed configuration loaded successfully',
    });

    console.log('[SEED] Successfully seeded initial development users and 6 SACCO branches.');
  }
}
