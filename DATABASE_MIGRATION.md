# Turihamwe Management System — Database Migration & Schema Guide
**Institution**: Nyamuyanja SACCO Ltd, Isingiro District, Uganda  
**Technology**: PostgreSQL 16 Central Database + SQLite Branch-Level Local Caching  

---

## 1. Schema Design Principles

1. **SACCO Account Number as Primary Member Identifier**:
   - Members are uniquely identified by `sacco_account_number` (e.g., `NYA-001042`).
   - The system strictly forbids generating substitute artificial member IDs.
2. **Referential Integrity**:
   - Foreign key constraints ensure cascading updates on branch renames and restrict deletions on financial tables (`contributions`, `renewals`, `claims`).
3. **Data Safety Rule**:
   - Destructive operations (`DROP TABLE`, `TRUNCATE`, `DROP DATABASE`) are strictly prohibited in migration scripts.
4. **Audit Immutability**:
   - Every sensitive administrative event writes to `audit_logs` with pre- and post-state JSON snapshots.

---

## 2. Table Inventory

| Table Name | Primary Key | Key Foreign Keys | Purpose |
|---|---|---|---|
| `schema_migrations` | `id` (SERIAL) | None | Migration version history & checksum validation |
| `branches` | `id` (VARCHAR) | None | 6 Official SACCO branches (Kamubeizi, Nyamuyanja, etc.) |
| `roles` | `id` (VARCHAR) | None | Role definitions & permission codes |
| `users` | `id` (VARCHAR) | `role_id`, `primary_branch_id` | User accounts with 4-10 char usernames & bcrypt hashes |
| `members` | `id` (VARCHAR) | `branch_id` | Master SACCO membership ledger with unique account number |
| `controlled_corrections` | `id` (VARCHAR) | `member_id`, `corrected_by_user_id` | Audit records for member edits after 5-day lock |
| `turihamwe_plans` | `id` (VARCHAR) | `member_id`, `branch_id` | Enrolled welfare plans with coverage and validity |
| `beneficiaries` | `id` (VARCHAR) | `plan_id` | Nominated family beneficiaries |
| `contributions` | `id` (VARCHAR) | `plan_id`, `member_id`, `branch_id` | Premium payments with unique receipt numbers |
| `renewals` | `id` (VARCHAR) | `plan_id`, `member_id`, `branch_id` | Policy term extension records |
| `plan_reactivations` | `id` (VARCHAR) | `plan_id`, `reactivated_by_user_id` | Formal reactivations with board approval reference |
| `claims` | `id` (VARCHAR) | `plan_id`, `member_id`, `branch_id` | Death welfare benefit claims with dual signoff |
| `claim_documents` | `id` (VARCHAR) | `claim_id`, `uploaded_by_user_id` | Supporting documentation (burial permits, death certs) |
| `audit_logs` | `id` (VARCHAR) | `user_id`, `branch_id` | Append-only system audit log |
| `sms_queue` | `id` (VARCHAR) | `branch_id` | E.164 message queue with retry counts |
| `sms_templates` | `id` (VARCHAR) | None | Message templates with parameter substitution |
| `system_alerts` | `id` (VARCHAR) | `branch_id` | Operational alerts for expiring policies and failed sync |
| `sync_records` | `id` (VARCHAR) | `branch_id` | Branch-level offline transactional journal |
| `backups` | `id` (VARCHAR) | None | Database backup snapshot metadata & SHA-256 hashes |

---

## 3. Migration Commands

```bash
# 1. Execute migrations
npm run db:migrate

# 2. Check database status & table counts
npm run db:check

# 3. Seed production reference data (branches, roles, templates only)
npm run db:seed
```

---

## 4. Verifying Migrations in PostgreSQL

```bash
psql -h localhost -U turihamwe_user -d turihamwe_db -c "SELECT migration_name, checksum, applied_at FROM schema_migrations;"
```
