# Turihamwe Management System — Backup & Disaster Recovery Guide
**Institution**: Nyamuyanja SACCO Ltd, Isingiro District, Uganda  

---

## 1. Backup Architecture & Policies

The backup subsystem guarantees transactional recoverability and point-in-time state restoration:

1. **Automated Snapshot Generation**:
   - Takes full JSON table snapshots and stores them in `BACKUP_STORAGE_DIR` (default: `/app/data/backups`).
2. **Cryptographic SHA-256 Verification**:
   - Every backup is immediately hashed using SHA-256 upon disk write.
   - The checksum is recorded in the backup catalog and verified against re-reads to detect corruption.
3. **Encryption Support**:
   - Optional archive encryption using `BACKUP_ENCRYPTION_KEY`.
4. **Configurable Scheduling**:
   - Backup frequency (Daily, Weekly, Monthly) and retention policies remain configurable in System Settings (`admin.system_settings`).

---

## 2. Triggering Backups

### Via Web Administrative Interface
1. Navigate to **System Administration** $\rightarrow$ **Backups & Health**.
2. Click **Create Snapshot Backup**.
3. Select Backup Type (**Full Institutional Snapshot**).
4. Review the generated SHA-256 checksum and record counts.

### Via Command-Line Interface / Cron
```bash
# Automated daily backup cron job
0 2 * * * cd /opt/turihamwe && tsx -e "import { serverStore } from './src/server/storage/serverStore'; serverStore.initialize().then(() => serverStore.createBackup('AUTOMATED_NIGHTLY_SNAPSHOT', 'usr-it-01', 'FULL'));" >> /var/log/turihamwe_backup.log 2>&1
```

---

## 3. Disaster Recovery & Restoration Procedure

### Step 1: Verify Backup Archive Integrity
```bash
# Verify SHA-256 checksum
sha256sum /app/data/backups/turihamwe_backup_2026-10-01T02-00-00.json
```

### Step 2: Perform Controlled Recovery
Restoration requires explicit reason logging and administrative identity to prevent accidental overwrite:

```bash
# Controlled recovery via Node script
tsx -e "
import { serverStore } from './src/server/storage/serverStore';
async function restore() {
  await serverStore.initialize();
  const res = serverStore.restoreBackup('backup-id-here', 'usr-it-01', 'Restoration following server hardware migration');
  console.log(res);
}
restore();
"
```

### Step 3: Verify Restored State
```bash
npm run db:check
npm test
```
