# Turihamwe Management System — Offline & Branch Synchronization Operations
**Institution**: Nyamuyanja SACCO Ltd, Isingiro District, Uganda  

---

## 1. Offline-First Model Across the Six Branches

All six SACCO branches (Nyamuyanja, Kagarama, Nyakigyera, Kamubeizi, Ruborogota, Masha) often face temporary cellular and grid connectivity interruptions. The system ensures continuous operational capability:

1. **Local Journaling**:
   - When the central server is unreachable, transactions (member registrations, contributions, claims) are written to local SQLite / IndexedDB cache in `PENDING` status.
2. **Four Distinct UI Synchronization States**:
   - 🟢 **Synchronized**: All branch transactions match central cloud repository.
   - 🟡 **Offline**: Operating locally; transactions are safely saved to local journal.
   - 🔵 **Synchronizing**: Background push/pull active with central server.
   - 🔴 **Sync Error / Conflict**: Attention required; records held without destructive overwrite.
3. **No Silent Overwrite / Data Destruction**:
   - Conflicts do not employ last-write-wins. Conflicted records enter `CONFLICT` status and trigger administrative alerts for manual resolution.

---

## 2. Synchronization Lifecycle

```
[ Local Action Taken ] ──▶ Write to Local SQLite / IndexedDB
                                      │
                                      ▼
                             Status: PENDING
                                      │
                    [ Connectivity Restored ]
                                      │
                                      ▼
                      Push to /api/sync Endpoint
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
       [ Valid & Unique ]                           [ Conflict Detected ]
              │                                               │
              ▼                                               ▼
       Status: SYNCED                                 Status: CONFLICT
 (Saved to Central Database)                      (Preserved; Alert Raised)
```

---

## 3. Resolving Sync Errors

1. Open **System Administration** $\rightarrow$ **Synchronization Monitor**.
2. Filter by status: `FAILED` or `CONFLICT`.
3. Review the payload and conflict details.
4. Click **Retry Sync** to re-queue the transaction.
5. If the conflict is caused by duplicate receipt numbers or concurrent edits, an authorized administrator can inspect both versions and apply a controlled update.
