# Turihamwe Management System
**Organization:** Nyamuyanja SACCO Ltd, Isingiro District, Uganda  
**System Classification:** Production-Grade Offline-First SACCO Social Protection & Bereavement Welfare Platform  
**Target Architecture:** Distributed Branch Offline SQLite/IndexedDB + Central Cloud PostgreSQL Synchronization  
**Version:** 1.0.0 (Phase 8 Production Readiness)

---

## 1. System Overview

The **Turihamwe Management System** is a dedicated welfare and bereavement management system engineered specifically for **Nyamuyanja SACCO Ltd** in Isingiro, Uganda. Operating across 6 branches—**Kamubeizi, Nyamuyanja (HQ), Kagarama, Nyakigyera, Ruborogota, and Masha**—the platform delivers social protection coverage, transparent member enrolment, contribution tracking, policy renewal management, document-backed claim dockets, in-system operational alerts, automated SMS notifications via Africa's Talking Uganda, and cryptographic database backup and recovery.

### Critical Institutional Architectural Boundaries
1. **Core Banking Separation:** The Turihamwe system is strictly isolated from Nyamuyanja SACCO's internal core banking server to protect transactional financial ledgers and regulatory compliance.
2. **Offline-First Resilience:** Branch staff can execute full workflows during cellular and ISP outages (registering members, recording contributions, issuing receipts, logging claims). Transactions queue locally in IndexedDB/SQLite and synchronize to the central cloud server upon reconnection.
3. **Branch Isolation:** Strict multi-tenant-style branch isolation ensures branch staff only view and modify records belonging to their assigned primary or authorized branches.

---

## 2. Technology Stack

- **Runtime & Backend:** Node.js (v20+), Express 4.x, TypeScript, `tsx`
- **Frontend SPA:** React 19, Vite 8, Tailwind CSS, Lucide Icons
- **Local Persistence (Edge / Offline):** SQL.js (WebAssembly SQLite) / Dexie.js (IndexedDB)
- **Central Database (Cloud Server):** PostgreSQL (schema provided in `src/db/central/schema.sql`) / Persistent atomic JSON store (`data/turihamwe_central_db.json`)
- **Security & Cryptography:** `bcryptjs` (salt rounds: 10), JSON Web Tokens (12-hour expiration, token denylist for immediate revocation), Node.js `crypto` (SHA-256 for backup manifests)
- **Telecom & SMS Gateway:** Africa's Talking Uganda SMS API / Sandbox integration with E.164 sanitization (`+256...`) and idempotency deduplication keys

---

## 3. Project Directory Structure

```
├── .env.example                     # Environment variable template with safe placeholders
├── DEPLOYMENT.md                    # Production deployment and infrastructure isolation guide
├── README.md                        # Master institutional system documentation
├── index.html                       # HTML5 entry point with synchronized SACCO metadata
├── metadata.json                    # Application metadata and capability definitions
├── package.json                     # NPM dependencies and scripts
├── server.ts                        # Full-stack Node.js Express server + Vite middleware
├── tsconfig.json                    # Strict TypeScript compilation rules
├── vite.config.ts                   # Vite bundler configuration
├── data/                            # Persistent server datastore and automated backup archives
│   ├── turihamwe_central_db.json    # Central persistent database ledger
│   └── backups/                     # SHA-256 verified JSON archive snapshots
├── src/
│   ├── api/                         # Frontend API client (`client.ts`)
│   ├── components/                  # Reusable UI components
│   │   ├── alerts/                  # Alert Center drawer and item components
│   │   ├── auth/                    # LoginForm, SetupAdminModal
│   │   ├── common/                  # SaccoLogo, Modal, Card, Input wrappers
│   │   ├── layout/                  # Header, Sidebar, AppShell
│   │   └── turihamwe/               # Plan, Contribution, Claim card components
│   ├── constants/                   # Static institutional configurations
│   │   ├── branches.ts              # 6 official branches (Kamubeizi priority)
│   │   └── permissions.ts           # 35 granular permissions and default roles
│   ├── context/                     # React Context providers (AuthContext, SyncContext)
│   ├── db/                          # Database schemas and engine bindings
│   │   ├── central/schema.sql       # PostgreSQL central cloud database DDL
│   │   └── local/                   # SQLite/IndexedDB offline engine and repository
│   ├── server/                      # Server-side architecture
│   │   ├── middleware/              # Auth, branch isolation, and permission guards
│   │   ├── routes/                  # Express REST routers (Auth, Members, Plans, Claims, etc.)
│   │   ├── services/                # Business logic (AuthService, SmsService, AuditService)
│   │   └── storage/                 # ServerStore with atomic temporary writes
│   ├── tests/                       # Automated test suites
│   │   ├── memberManagement.test.ts # Phase 2 Member Management & SACCO rules (13 tests)
│   │   ├── phase6ReportsSmsAlerts.test.ts # Phase 6 Reporting, SMS & Alerts (10 tests)
│   │   ├── phase7SecurityAdminBackupAudit.test.ts # Phase 7 Security & Audit (18 tests)
│   │   ├── phase8MasterVerification.test.ts # Phase 8 Master QA & Integration (16 tests)
│   │   └── runAllSuites.ts          # Unified master test runner (57 tests)
│   ├── types/                       # Universal TypeScript domain interfaces
│   └── views/                       # Primary navigation views
│       ├── ClaimsView.tsx           # Claims lifecycle, dockets, documents, separation of duties
│       ├── DashboardView.tsx        # KPI summaries, expiring policies, recent activity
│       ├── MembersView.tsx          # Member search, 5-day lock rule, controlled corrections
│       ├── ReportsView.tsx          # Branch summaries, financial gating, CSV/Excel export
│       ├── SmsNotificationsView.tsx # SMS queue, Africa's Talking templates, dispatch
│       ├── SystemView.tsx           # System health, backups, sync queue, business rules
│       ├── TurihamweView.tsx        # Plan registration, beneficiaries, contributions
│       └── UsersAndRightsView.tsx   # User provisioning, roles, granular permission matrix
```

---

## 4. Security Architecture

### 4.1 Authentication & Login Flow
1. **Branch Selection:** Users first select or confirm their operating branch.
2. **Username Constraint:** Strictly **4 to 10 characters** (e.g. `itadm`, `gm001`, `bmnya`, `csh01`).
3. **Password Security:** Salted and hashed using `bcrypt` (10 rounds). Plaintext passwords and hashes are strictly masked and never returned in API payloads or logged in audit trails.
4. **No Auto-Lockout:** In compliance with SACCO operational directives, automatic account lockouts after failed password attempts are disabled to prevent deliberate denial-of-service against branch cashiers in rural areas.
5. **Session Revocation:** On logout, the JWT token signature is immediately stored in a memory-backed denylist to prevent session fixation, token reuse, or replay attacks.

### 4.2 Branch Isolation & Data Scoping
- **Single-Branch Staff:** Automatically restricted to their primary assigned branch. All database queries for members, plans, claims, contributions, and SMS logs enforce server-side `branchId` filtering.
- **Multi-Branch Staff:** Authorized personnel (e.g., General Manager, roving IT Officer, Internal Auditor) may explicitly switch between assigned branches; all operations record both the acting user and the active working branch.
- **Ordinary User Self-Modification Block:** Users are strictly blocked by server-side middleware from altering their own roles, permissions, or branch assignments.

### 4.3 Five-Day Member Editing Rule
- Newly registered member information may be edited freely by authorized staff within the first **5 calendar days**.
- On Day 6 and beyond, normal editing is locked (`Editing locked — record is older than 5 days`).
- Any subsequent modifications must be processed through the **Controlled Correction Workflow**, capturing: field name, prior value, new value, mandatory institutional reason, acting user, branch, and timestamp into immutable audit logs.

### 4.4 Member Search Boundary
- To prevent privacy leakage and ensure fast lookups, member search strictly accepts **SACCO Account Number** or **Member Name**. Search by phone number or national ID is disallowed in member searches.

---

## 5. Development & Local Setup

### Prerequisites
- Node.js (v20.x or later)
- npm (v10.x or later)

### Quick Start
```bash
# 1. Clone repository and navigate to root
cd turihamwe-management-system

# 2. Install dependencies
npm install

# 3. Copy environment configuration template
cp .env.example .env

# 4. Start full-stack development server (Express backend + Vite HMR on port 3000)
npm run dev
```

Visit `http://localhost:3000` in your web browser.

### Default Seed Staff Credentials (Development Only)
| Username | Role | Full Name | Primary Branch | Default Password |
| :--- | :--- | :--- | :--- | :--- |
| `itadm` | IT Systems Officer | Patrick Mugisha | Nyamuyanja (HQ) | `Admin@2026!` |
| `gm001` | General Manager | Eunice Ahimbisibwe | Nyamuyanja (HQ) | `Admin@2026!` |
| `bmnya` | Branch Manager | Frank Twinamatsiko | Nyamuyanja Branch | `Staff@2026!` |
| `csh01` | Teller / Cashier | Sarah Kemigisha | Nyamuyanja Branch | `Staff@2026!` |

---

## 6. Testing & Quality Assurance

The application includes an automated test harness covering 57 test scenarios across all 4 operational phases:

```bash
# Run all 57 automated verification tests
npm test
```

### Test Suite Summary
- **Phase 2 (13 Tests):** Member registration, account number uniqueness, 5-day lock window, controlled corrections, branch restrictions, offline queueing.
- **Phase 6 (10 Tests):** Multi-category reports, financial permission masking, export audit logs, Africa's Talking SMS queue, deduplication keys, 30/14/7-day expiry triggers.
- **Phase 7 (18 Tests):** 4-10 char username rule, bcrypt hashing, single-branch isolation, session invalidation on logout, effective permissions matrix, user enable/disable, SHA-256 backup verification, controlled database restore.
- **Phase 8 (16 Tests):** End-to-end entity lifecycle, data consistency, calendar-day 5-day rule, search boundary enforcement, claim separation of duties, document executable rejection, Africa's Talking E.164 formatting, atomic disk save, 6 branches configuration with Kamubeizi priority, business rules safety.

```bash
# Run static type checking and linter
npm run lint

# Compile production client build
npm run build
```

---

## 7. Business Rules Safety & Governance

In strict accordance with SACCO governance requirements, unconfirmed business parameters are **never hardcoded or invented**. The system exposes a configurable parameters framework:
- **Confirmed Active Policies:** Notification timing intervals at **30 days, 14 days, 7 days, expiry day (0), and post-expiry follow-up**.
- **Pending Institutional Approval (Unresolved):** Contribution amounts, contribution frequency schedules, benefit disbursement formulas, renewal grace periods, claim waiting periods, and late penalties. These remain configurable hooks awaiting SACCO Board ratification.
