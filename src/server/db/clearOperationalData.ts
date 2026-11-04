import { serverStore } from '../storage/serverStore';

export async function clearAllOperationalDataForDeployment(): Promise<{
  clearedMembers: number;
  clearedPlans: number;
  clearedClaims: number;
  clearedContributions: number;
  clearedRenewals: number;
  clearedBackups: number;
  clearedTestUsers: number;
  clearedTestSms: number;
}> {
  console.log('\n================================================================');
  console.log('   TURIHAMWE SACCO — PRE-DEPLOYMENT DATA PURGE');
  console.log('   Sanitizing operational database for institutional go-live');
  console.log('================================================================\n');

  await serverStore.initialize();
  const results = serverStore.clearAllOperationalData('usr-it-01', 'itadm');

  console.log('[DEPLOYMENT PREP] Operational data tables cleared successfully:');
  console.log(`  - Members removed:        ${results.clearedMembers}`);
  console.log(`  - Mutual Health Plans:    ${results.clearedPlans}`);
  console.log(`  - Medical Claims:         ${results.clearedClaims}`);
  console.log(`  - Premium Contributions:  ${results.clearedContributions}`);
  console.log(`  - Policy Renewals:        ${results.clearedRenewals}`);
  console.log(`  - Test Archives/Backups:  ${results.clearedBackups}`);
  console.log(`  - Test User Accounts:     ${results.clearedTestUsers}`);
  console.log(`  - Test SMS Messages:      ${results.clearedTestSms}`);
  console.log('\n[DEPLOYMENT STATUS] deployment.ready = true');
  console.log('[DEPLOYMENT STATUS] deployment.status = READY_FOR_PRODUCTION');
  console.log('Institutional branches, roles, system parameters, and security policies preserved intact.');
  console.log('================================================================\n');

  return results;
}

if (process.argv[1]?.endsWith('clearOperationalData.ts')) {
  clearAllOperationalDataForDeployment()
    .then(() => {
      console.log('[DEPLOYMENT] Pre-production data clearing complete.');
      process.exit(0);
    })
    .catch(err => {
      console.error('[DEPLOYMENT ERROR] Failed to clear operational data:', err);
      process.exit(1);
    });
}
