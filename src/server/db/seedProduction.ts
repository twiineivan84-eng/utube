import { serverStore } from '../storage/serverStore';
import { SeedService } from '../services/seedService';
import { INITIAL_BRANCHES } from '../../constants/branches';
import { DEFAULT_ROLES } from '../../constants/permissions';

export async function seedProductionReferenceData(): Promise<{
  branchesSeeded: number;
  rolesSeeded: number;
  templatesSeeded: number;
}> {
  await serverStore.initialize();
  await SeedService.seedInitialData();

  const branches = serverStore.getBranches();
  const roles = serverStore.getRoles();
  const templates = serverStore.getSmsTemplates();

  console.log('[SEED PRODUCTION] Production reference data validated:');
  console.log(`  - Branches available: ${branches.length}`);
  console.log(`  - System Roles available: ${roles.length}`);
  console.log(`  - SMS Templates available: ${templates.length}`);
  console.log('  - Operational Members: Preserved existing (No fake members generated)');

  return {
    branchesSeeded: branches.length,
    rolesSeeded: roles.length,
    templatesSeeded: templates.length,
  };
}

if (process.argv[1]?.endsWith('seedProduction.ts')) {
  seedProductionReferenceData()
    .then(() => {
      console.log('[SEED PRODUCTION] Reference seeding completed successfully.');
      process.exit(0);
    })
    .catch(err => {
      console.error('[SEED PRODUCTION ERROR]', err);
      process.exit(1);
    });
}
