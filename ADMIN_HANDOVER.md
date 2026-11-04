# Turihamwe Management System — Administrator Handover Guide
**Audience**: Nyamuyanja SACCO IT Officers, General Manager & Operations Leads  
**Institution**: Nyamuyanja SACCO Ltd, Isingiro District, Uganda  

---

## 1. System Roles & Access Hierarchy

The system defines 6 core institutional roles:

1. **General Manager (`GM`)**:
   - Executive authority, dual signoff for death benefit claims above approval threshold, full institutional reports, audit oversight.
2. **IT Officer / System Administrator (`IT_OFFICER`)**:
   - Technical administration, user lifecycle management, role and permission grants, database backups, restore procedures, system settings.
3. **Branch Manager (`BRANCH_MGR`)**:
   - Branch supervisory oversight, initial claim review, controlled correction authorization, branch performance reporting.
4. **Teller / Cashier (`TELLER`)**:
   - Frontline member registration, contribution recording, receipt issuance, member balance lookups. Restricted to working branch.
5. **Accounts Assistant (`ACCOUNTS_ASST`)**:
   - Financial posting, claim disbursement vouchers, daily and monthly reconciliation reports.
6. **Internal Auditor (`AUDITOR`)**:
   - Read-only institutional surveillance, immutable audit trail analysis, compliance inspection across all six branches.

---

## 2. Daily Administrative Tasks

### A. Managing Staff Users & Branch Rights
1. Navigate to **Users & Rights** $\rightarrow$ **User Accounts**.
2. **Username Rule**: Must be 4 to 10 lowercase alphanumeric characters (e.g. `itadm`, `gm001`, `bm001`).
3. Assign **Primary Branch**. For roving managers or auditors, enable **Multi-Branch Access** and select permitted branches.
4. Set role and apply any specific direct permission grants or revocations.

### B. Monitoring Branch Synchronization
1. Open **System Administration** $\rightarrow$ **Sync Monitor**.
2. Check for branches with pending transactions.
3. If an internet outage occurred at a branch, verify that pending records sync automatically upon reconnection.

### C. Reviewing Audit Logs
1. Open **Audit Logs**.
2. Filter by date, branch, or action type (e.g. `LOGIN_SUCCESS`, `CLAIM_APPROVED`, `CONTROLLED_CORRECTION`).
3. Ensure no unauthorized actions or security anomalies are present.

### D. Performing Daily Backups
1. Open **System Administration** $\rightarrow$ **Backups & Health**.
2. Verify that the automated nightly backup completed with status `VERIFIED`.
3. Check the calculated SHA-256 checksum.

---

## 3. Five-Day Member Editing Rule Administration

- Newly enrolled SACCO members may have their biographical details directly edited by authorized branch staff for **up to 5 days** from registration.
- On **Day 6 and onwards**, direct editing is automatically locked.
- To update details after 5 days, a **Controlled Correction** must be submitted with:
  - Identification of changed field
  - Previous and new value
  - Mandatory justification reason (e.g. legal name change, utility bill correction)
  - Approval by Branch Manager or IT Officer
- All corrections are recorded in the permanent audit ledger.

---

## 4. Claim Processing & Dual Signoff Policy

1. **Lodgement**: Filed by branch staff with deceased name and relationship.
2. **Document Verification**: Burial permit, death certificate, and national ID uploaded. Executable files (`.exe`, `.sh`) are strictly blocked.
3. **Branch Review**: Branch Manager verifies documentation and transitions claim to `UNDER_REVIEW`.
4. **Executive Approval**: General Manager provides formal signoff and authorizes approved amount.
5. **Disbursement**: Accounts Assistant records disbursement voucher; member receives instant SMS confirmation.
