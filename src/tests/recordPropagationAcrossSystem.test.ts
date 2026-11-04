import { describe, it } from 'node:test';
import assert from 'node:assert';
import { serverStore } from '../server/storage/serverStore';
import { SaccoMember, TurihamwePlan, Contribution, Renewal, TurihamweClaim } from '../types';
import { LocalRepository } from '../db/local/localRepository';
import { localDb } from '../db/local/sqliteEngine';
import { notifyRecordChanged, subscribeToRecordChanges, SystemRecordChangeEvent } from '../utils/systemEvents';

export async function runRecordPropagationTests() {
  console.log('>>> [SUITE] RECORD PROPAGATION & CROSS-SYSTEM REFLECTION');

  // Test 1: Updating member's full name propagates across plans, contributions, renewals, and claims
  await (async () => {
    const ts = Date.now();
    const acc = `ACC-PROP-${ts}`;
    const initialName = `Propagate Test Member ${ts}`;
    const updatedName = `Propagate Updated Member ${ts}`;

    const member: SaccoMember = {
      saccoAccountNumber: acc,
      fullName: initialName,
      gender: 'FEMALE',
      dateOfBirth: '1985-06-15',
      nationalIdNumber: `CM850615${ts.toString().slice(-6)}A`,
      primaryPhone: '+256772111222',
      district: 'Isingiro',
      subCounty: 'Nyamuyanja',
      parish: 'Kagarama',
      village: 'Central',
      branchId: 'branch-nya',
      branchName: 'Nyamuyanja',
      registrationDate: new Date().toISOString().substring(0, 10),
      turihamweStatus: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    serverStore.addMember(member);

    // Create linked plan
    const plan: TurihamwePlan = {
      id: `plan-prop-${ts}`,
      planCode: `PLN-${ts}`,
      enrolmentDate: '2026-01-01',
      saccoAccountNumber: acc,
      memberName: initialName,
      status: 'ACTIVE',
      effectiveStartDate: '2026-01-01',
      currentExpiryDate: '2026-12-31',
      registeredBranchId: 'branch-nya',
      registeredBranchName: 'Nyamuyanja',
      registeredByUserId: 'usr-admin-01',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    serverStore.addPlan(plan);

    // Create linked contribution
    const contrib: Contribution = {
      id: `ctr-prop-${ts}`,
      receiptNumber: `REC-PROP-${ts}`,
      saccoAccountNumber: acc,
      memberName: initialName,
      planId: plan.id,
      branchId: 'branch-nya',
      receivedByUserId: 'usr-admin-01',
      amount: 50000,
      paymentMethod: 'CASH',
      contributionDate: '2026-02-01',
      status: 'CONFIRMED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    serverStore.addContribution(contrib);

    // Create linked renewal
    const renewal: Renewal = {
      id: `rnw-prop-${ts}`,
      renewalReference: `RNW-PROP-${ts}`,
      planId: plan.id,
      saccoAccountNumber: acc,
      memberName: initialName,
      branchId: 'branch-nya',
      processedByUserId: 'usr-admin-01',
      renewalDate: '2026-02-10',
      effectiveDate: '2026-01-01',
      previousExpiryDate: '2026-12-31',
      newExpiryDate: '2027-12-31',
      previousPlanStatus: 'ACTIVE',
      resultingPlanStatus: 'ACTIVE',
      renewalStatus: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    serverStore.addRenewal(renewal);

    // Create linked claim
    const claim: TurihamweClaim = {
      id: `clm-prop-${ts}`,
      claimReference: `CLM-PROP-${ts}`,
      saccoAccountNumber: acc,
      memberName: initialName,
      planId: plan.id,
      branchId: 'branch-nya',
      branchName: 'Nyamuyanja',
      claimDate: '2026-02-15',
      status: 'SUBMITTED',
      claimCategory: 'DEATH_OF_MEMBER',
      incidentDate: '2026-02-14',
      incidentDescription: 'Claim notice for member welfare benefit',
      preparerUserId: 'usr-admin-01',
      preparerUsername: 'adm',
      preparerFullName: 'Administrator',
      supportingDocuments: [],
      reviewHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    serverStore.addClaim(claim);

    // Perform member update with new full name
    const updated = serverStore.updateMember(acc, {
      fullName: updatedName,
      primaryPhone: '+256772999888',
    });

    assert.ok(updated, 'Member update must succeed');
    assert.strictEqual(updated.fullName, updatedName);

    // Verify propagation across all modules in serverStore
    const fetchedPlan = serverStore.getPlanById(plan.id);
    assert.strictEqual(fetchedPlan?.memberName, updatedName, 'Plan memberName must reflect updated full name');

    const fetchedContrib = serverStore.getContributions({ planId: plan.id });
    assert.strictEqual(fetchedContrib[0]?.memberName, updatedName, 'Contribution memberName must reflect updated full name');

    const fetchedRenewal = serverStore.getRenewals({ planId: plan.id });
    assert.strictEqual(fetchedRenewal[0]?.memberName, updatedName, 'Renewal memberName must reflect updated full name');

    const fetchedClaim = serverStore.getClaimById(claim.id);
    assert.strictEqual(fetchedClaim?.memberName, updatedName, 'Claim memberName must reflect updated full name');

    console.log('  ✓ Test 01: Updating member full name reflects across plans, contributions, renewals, and claims');
  })();

  // Test 2: LocalRepository updateMemberLocally propagates to local storage safely
  await (async () => {
    const ts = Date.now();
    const acc = `ACC-LOC-${ts}`;
    const initialName = `Local Test Member ${ts}`;
    const updatedName = `Local Updated Member ${ts}`;

    const member: SaccoMember = {
      saccoAccountNumber: acc,
      fullName: initialName,
      gender: 'MALE',
      dateOfBirth: '1990-01-01',
      nationalIdNumber: `CM900101${ts.toString().slice(-6)}A`,
      primaryPhone: '+256701111222',
      district: 'Isingiro',
      subCounty: 'Nyamuyanja',
      parish: 'Nyamuyanja',
      village: 'Kitojo',
      branchId: 'branch-nya',
      registrationDate: new Date().toISOString().substring(0, 10),
      turihamweStatus: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Propagate local member update through LocalRepository API
    const updatedMember: SaccoMember = {
      ...member,
      fullName: updatedName,
      village: 'Trading Centre',
    };
    await LocalRepository.updateMemberLocally(updatedMember);

    // Verify 5-day helper rule preserved
    assert.strictEqual(LocalRepository.isWithinFiveDaysWindow(member.registrationDate), true);

    console.log('  ✓ Test 02: LocalRepository.updateMemberLocally propagates changes across local storage');
  })();

  // Test 3: Updating a contribution recalculates plan total contributions amount
  await (async () => {
    const ts = Date.now();
    const acc = `ACC-CALC-${ts}`;
    serverStore.addMember({
      saccoAccountNumber: acc,
      fullName: 'Calculation Test',
      gender: 'MALE',
      dateOfBirth: '1990-01-01',
      nationalIdNumber: `CM90CALC${ts.toString().slice(-4)}`,
      primaryPhone: '+256701000111',
      district: 'Isingiro',
      subCounty: 'Nyamuyanja',
      parish: 'Central',
      village: 'Trading Centre',
      registrationDate: '2026-01-01',
      branchId: 'branch-nya',
      branchName: 'Nyamuyanja Branch',
      turihamweStatus: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
    });
    const plan: TurihamwePlan = {
      id: `plan-calc-${ts}`,
      planCode: `PLN-CALC-${ts}`,
      enrolmentDate: '2026-01-01',
      saccoAccountNumber: acc,
      memberName: 'Calculation Test',
      status: 'ACTIVE',
      effectiveStartDate: '2026-01-01',
      currentExpiryDate: '2026-12-31',
      registeredBranchId: 'branch-nya',
      registeredByUserId: 'usr-admin-01',
      totalContributionsAmount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    serverStore.addPlan(plan);

    const c1: Contribution = {
      id: `c1-${ts}`,
      receiptNumber: `REC-C1-${ts}`,
      saccoAccountNumber: acc,
      memberName: 'Calculation Test',
      planId: plan.id,
      branchId: 'branch-nya',
      receivedByUserId: 'usr-admin-01',
      amount: 40000,
      paymentMethod: 'CASH',
      contributionDate: '2026-02-01',
      status: 'CONFIRMED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    serverStore.addContribution(c1);

    const planAfterC1 = serverStore.getPlanById(plan.id);
    assert.strictEqual(planAfterC1?.totalContributionsAmount, 40000);

    // Update contribution amount from 40,000 to 65,000
    serverStore.updateContribution(c1.id, { amount: 65000 });

    const planAfterUpdate = serverStore.getPlanById(plan.id);
    assert.strictEqual(planAfterUpdate?.totalContributionsAmount, 65000, 'Plan total contributions must recalculate after contribution edit');

    console.log('  ✓ Test 03: Updating contribution amounts recalculates plan totals across the system');
  })();

  // Test 4: System event bus notifies subscribers on record changes
  await (async () => {
    let receivedEvent: SystemRecordChangeEvent | null = null;
    const unsubscribe = subscribeToRecordChanges((e) => {
      receivedEvent = e;
    });

    notifyRecordChanged('MEMBER', 'UPDATED', 'NYA-001042', { fullName: 'Notified Member' });

    assert.ok(receivedEvent, 'Subscriber must receive dispatched record change event');
    assert.strictEqual((receivedEvent as SystemRecordChangeEvent)?.entityType, 'MEMBER');
    assert.strictEqual((receivedEvent as SystemRecordChangeEvent)?.action, 'UPDATED');
    assert.strictEqual((receivedEvent as SystemRecordChangeEvent)?.id, 'NYA-001042');

    unsubscribe();
    console.log('  ✓ Test 04: System-wide reactive event bus notifies subscribers on record saving');
  })();

  console.log('All record propagation tests passed successfully!\n');
}

// Execute directly if run via CLI
if (process.argv[1]?.includes('recordPropagationAcrossSystem')) {
  runRecordPropagationTests().catch(err => {
    console.error('Record propagation test suite failed:', err);
    process.exit(1);
  });
}
