# Turihamwe Management System — Environment Configuration Guide
**Institution**: Nyamuyanja SACCO Ltd, Isingiro District, Uganda  
**System**: Turihamwe Scheme Management, Member Welfare, Contributions, Renewals & Claims  

---

## 1. Master Configuration Matrix

| Variable | Required | Secret | Used By | Purpose | Example / Placeholder |
|---|---|---|---|---|---|
| `NODE_ENV` | Optional | No | Server Core (`server.ts`, `config/index.ts`) | Defines execution mode (`development`, `production`, `test`) | `development` |
| `PORT` | Optional | No | Server HTTP Binding (`server.ts`) | Internal HTTP port for the Node.js/Express server | `3000` |
| `APP_URL` | Optional | No | Server / CORS (`config/index.ts`) | Canonical public URL of the application | `https://turihamwe.nyamuyanjasacco.ug` |
| `CORS_ALLOWED_ORIGINS` | Optional | No | Express CORS Middleware (`server.ts`) | Permitted CORS origins (comma-separated) | `https://turihamwe.nyamuyanjasacco.ug` |
| `JWT_SECRET` | Required in Prod | **Yes** | Auth Service (`authService.ts`) | 256-bit cryptographic key for signing JWT tokens | `min_32_char_cryptographic_secret` |
| `JWT_EXPIRY` | Optional | No | Auth Service (`authService.ts`) | Token session lifespan duration | `12h` |
| `DATABASE_URL` | Required in Prod | **Yes** | PostgreSQL Central Storage | Central PostgreSQL connection URI (isolated from SACCO core banking) | `postgresql://user:pass@host:5432/turihamwe_db?sslmode=require` |
| `PGHOST` | Optional | No | PostgreSQL Connection | PostgreSQL host (used if `DATABASE_URL` not set) | `localhost` |
| `PGPORT` | Optional | No | PostgreSQL Connection | PostgreSQL port number | `5432` |
| `PGDATABASE` | Optional | No | PostgreSQL Connection | Central database name | `turihamwe_db` |
| `PGUSER` | Optional | No | PostgreSQL Connection | Central database user | `turihamwe_user` |
| `PGPASSWORD` | Optional | **Yes** | PostgreSQL Connection | Central database password | `your_secure_db_password` |
| `SQLITE_DATABASE_PATH` | Optional | No | Branch Offline Engine | Authoritative path for offline SQLite database file | `./data/turihamwe-local.sqlite` |
| `DATA_STORAGE_DIR` | Optional | No | Server State Engine | Directory path for local database files | `./data` |
| `DATA_FILE_NAME` | Optional | No | Server State Engine | Central persistent JSON snapshot state file | `turihamwe_central_db.json` |
| `SMS_ENABLED` | Optional | No | SMS Engine (`smsService.ts`) | Master toggle for SMS dispatch (`true`/`false`) | `true` |
| `SMS_ENVIRONMENT` | Optional | No | SMS Engine (`smsService.ts`) | Africa's Talking gateway environment (`SANDBOX`/`PRODUCTION`) | `SANDBOX` |
| `AT_USERNAME` | Required if Live SMS | No | SMS Engine (`smsService.ts`) | Africa's Talking account username (`sandbox` or SACCO live username) | `sandbox` |
| `AT_API_KEY` | Required if Live SMS | **Yes** | SMS Engine (`smsService.ts`) | Africa's Talking live API key for Uganda SMS | `atsk_live_xxxxxxxxxxxxxxxx` |
| `AFRICAS_TALKING_API_KEY` | Optional | **Yes** | SMS Engine (`smsService.ts`) | Compatibility alias for `AT_API_KEY` | `atsk_live_xxxxxxxxxxxxxxxx` |
| `AT_SENDER_ID` | Optional | No | SMS Engine (`smsService.ts`) | UCC approved alphanumeric Sender ID | `TURIHAMWE` |
| `FILE_STORAGE_PATH` | Optional | No | Claim Documents (`config/index.ts`) | Directory for claim verification uploads | `./data/uploads` |
| `MAX_UPLOAD_SIZE_MB` | Optional | No | Claim Uploads & Express Middleware | Max file upload limit in megabytes | `10` |
| `BACKUP_ENABLED` | Optional | No | Backup Engine (`serverStore.ts`) | Enables automated database snapshots | `true` |
| `BACKUP_STORAGE_DIR` | Optional | No | Backup Engine (`serverStore.ts`) | Directory where encrypted backup snapshots are saved | `./data/backups` |
| `BACKUP_ENCRYPTION_KEY` | Optional | **Yes** | Backup Engine (`serverStore.ts`) | Passphrase for encrypting backup archives | `your_backup_encryption_passphrase` |
| `SYNC_ENABLED` | Optional | No | Branch Sync Engine (`syncRoutes.ts`) | Enables background branch transaction synchronization | `true` |
| `SYNC_API_URL` | Optional | No | Sync Engine (`config/index.ts`) | Endpoint path for branch synchronization | `/api/sync` |
| `SYNC_INTERVAL_SECONDS` | Optional | No | Sync Engine (`config/index.ts`) | Polling retry interval for pending records | `30` |
| `DISABLE_HMR` | Optional | No | Vite Config (`vite.config.ts`) | Disables WebSocket HMR in AI Studio container | `true` |
| `VITE_API_BASE_URL` | Optional | No | Frontend Client (`src/api/client.ts`) | Base path prefix for client HTTP API requests | `/api` |

---

## 2. Categorization & Scope

### Development Variables
The system is built to be **fully operational in development out of the box** without external cloud databases or live cellular networks.
- `NODE_ENV=development`
- `PORT=3000`
- `SMS_ENVIRONMENT=SANDBOX`
- `AT_USERNAME=sandbox`
- `SQLITE_DATABASE_PATH=./data/turihamwe-local.sqlite`
- `VITE_API_BASE_URL=/api`

### Production Variables
In production, strict validation guarantees that the system refuses to start in an insecure state:
- `NODE_ENV=production`
- `JWT_SECRET`: Mandatory ($\ge 32$ characters). The dev fallback is rejected in production.
- `DATABASE_URL` (or `PGHOST` + `PGDATABASE`): Mandatory for centralized PostgreSQL persistence.
- `APP_URL`: Canonical public HTTPS URL for CORS and notification callbacks.
- `AT_USERNAME` & `AT_API_KEY`: Mandatory if `SMS_ENVIRONMENT=PRODUCTION` and `SMS_ENABLED=true`.

### Secret Variables (Never Exposed to Frontend / Browser)
The following variables are kept strictly on the Node.js server and must **never** be prefixed with `VITE_` or bundled into client code:
- `JWT_SECRET`
- `DATABASE_URL`
- `PGPASSWORD`
- `AT_API_KEY`
- `AFRICAS_TALKING_API_KEY`
- `BACKUP_ENCRYPTION_KEY`

### Administrator-Provided Variables
When deploying the application to live infrastructure for Nyamuyanja SACCO Ltd, the administrator must supply:
1. **Central PostgreSQL Database**: `DATABASE_URL` pointing to the SACCO's isolated PostgreSQL database.
2. **Production JWT Signing Secret**: `JWT_SECRET` (generate with `openssl rand -hex 32`).
3. **Africa's Talking Uganda Live Gateway**:
   - `SMS_ENVIRONMENT=PRODUCTION`
   - `AT_USERNAME` (SACCO's registered Africa's Talking account name)
   - `AT_API_KEY` (Generated from Africa's Talking console)
   - `AT_SENDER_ID=TURIHAMWE` (Registered with Uganda Communications Commission)
4. **Disaster Recovery Passphrase**: `BACKUP_ENCRYPTION_KEY`.

---

## 3. Google AI Studio Environment Setup

If Google AI Studio displays the prompt **“Enter your environment variable to continue”**:
- You can enter:
  - **Name**: `NODE_ENV`
  - **Value**: `development`
- Or enter:
  - **Name**: `JWT_SECRET`
  - **Value**: `dev-jwt-secret-turihamwe-sacco-enterprise-auth-key-min32chars`

In development mode, all critical systems (authentication, branch isolation, claims, member management, backups, and sync) use validated, safe development defaults.
