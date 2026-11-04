import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { serverStore } from '../storage/serverStore';

export interface DatabaseHealthReport {
  status: 'HEALTHY' | 'WARNING' | 'ERROR';
  mode: 'CENTRAL_POSTGRESQL' | 'LOCAL_TRANSACTIONAL_JOURNAL';
  tables: Record<string, number>;
  totalRecords: number;
  schemaVersion: string;
  sqlitePath: string;
  sqliteExists: boolean;
  backupLocation: string;
  backupLocationExists: boolean;
  uploadLocation: string;
  uploadLocationExists: boolean;
  warnings: string[];
}

export async function checkDatabaseHealth(): Promise<DatabaseHealthReport> {
  await serverStore.initialize();
  const warnings: string[] = [];
  const mode = config.database.databaseUrl ? 'CENTRAL_POSTGRESQL' : 'LOCAL_TRANSACTIONAL_JOURNAL';

  if (!config.database.databaseUrl) {
    if (config.app.isProduction) {
      warnings.push('Production environment detected without DATABASE_URL configured.');
    }
  }

  const sqliteExists = fs.existsSync(config.database.sqlitePath);
  const backupLocationExists = fs.existsSync(config.backup.storagePath);
  const uploadLocationExists = fs.existsSync(config.storage.uploadPath);

  if (!backupLocationExists) {
    warnings.push(`Backup storage directory does not exist: ${config.backup.storagePath}`);
  }
  if (!uploadLocationExists) {
    warnings.push(`Claim document uploads directory does not exist: ${config.storage.uploadPath}`);
  }

  const branches = serverStore.getBranches();
  const users = serverStore.getUsers();
  const members = serverStore.getMembers();
  const plans = serverStore.getPlans();
  const contributions = serverStore.getContributions();
  const claims = serverStore.getClaims();

  const tables: Record<string, number> = {
    branches: branches.length,
    users: users.length,
    members: members.length,
    plans: plans.length,
    contributions: contributions.length,
    claims: claims.length,
  };

  const totalRecords = Object.values(tables).reduce((acc, count) => acc + count, 0);

  const report: DatabaseHealthReport = {
    status: warnings.length === 0 ? 'HEALTHY' : 'WARNING',
    mode,
    tables,
    totalRecords,
    schemaVersion: '1.0.0-phase9',
    sqlitePath: config.database.sqlitePath,
    sqliteExists,
    backupLocation: config.backup.storagePath,
    backupLocationExists,
    uploadLocation: config.storage.uploadPath,
    uploadLocationExists,
    warnings,
  };

  return report;
}

if (process.argv[1]?.endsWith('checkDb.ts')) {
  checkDatabaseHealth()
    .then(rep => {
      console.log('================================================================');
      console.log('   TURIHAMWE MANAGEMENT SYSTEM — DATABASE HEALTH REPORT');
      console.log('================================================================');
      console.log(`Status:         ${rep.status}`);
      console.log(`Mode:           ${rep.mode}`);
      console.log(`Total Records:  ${rep.totalRecords}`);
      console.log(`SQLite Cache:   ${rep.sqlitePath} (Exists: ${rep.sqliteExists})`);
      console.log(`Backups Dir:    ${rep.backupLocation} (Exists: ${rep.backupLocationExists})`);
      console.log(`Uploads Dir:    ${rep.uploadLocation} (Exists: ${rep.uploadLocationExists})`);
      console.log('Table Counts:');
      for (const [table, count] of Object.entries(rep.tables)) {
        console.log(`  - ${table.padEnd(16)}: ${count}`);
      }
      if (rep.warnings.length > 0) {
        console.log('\nWarnings:');
        rep.warnings.forEach(w => console.log(`  ! ${w}`));
      }
      console.log('================================================================');
      process.exit(0);
    })
    .catch(err => {
      console.error('[DB CHECK ERROR]', err);
      process.exit(1);
    });
}
