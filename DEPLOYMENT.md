# Turihamwe Management System — Deployment Readiness Guide
**Target Institution:** Nyamuyanja SACCO Ltd, Isingiro, Uganda  
**Environment:** Production Central Cloud & Distributed Branch Infrastructure

---

## 1. Architectural Separation from SACCO Core Banking

### Mandatory Security Rule
**The Turihamwe Management System MUST run on an independent server/cloud container completely separated from Nyamuyanja SACCO's internal core banking server.**

```
┌─────────────────────────────────┐         ┌─────────────────────────────────┐
│     Nyamuyanja SACCO Ltd        │         │   Turihamwe Management System   │
│   Internal Core Banking Server  │         │   (Independent Cloud Server)    │
│  (Isolated LAN, No Direct Turihamwe) │         │   - Node.js Express Backend     │
│  - Member Savings & Share Accounts │         │   - React 19 Frontend SPA       │
│  - Loan Portfolios & Ledger     │         │   - Central PostgreSQL DB       │
│  - Daily Teller Clearing        │         │   - Africa's Talking SMS Gateway│
└─────────────────────────────────┘         └─────────────────────────────────┘
                                                             ▲
                                                             │ HTTPS (TLS 1.3)
                                                             │ Offline-First Sync
                                            ┌────────────────┴────────────────┐
                                            │      6 SACCO Branch Terminals   │
                                            │ - Kamubeizi (First in dropdown) │
                                            │ - Nyamuyanja (Headquarters)     │
                                            │ - Kagarama                      │
                                            │ - Nyakigyera                    │
                                            │ - Ruborogota                    │
                                            │ - Masha                         │
                                            └─────────────────────────────────┘
```

**Rationale:**
1. **Financial Risk Isolation:** Prevents any software defects, bereavement claims, or welfare operations from interfering with core savings and loan transactions.
2. **Regulatory & Audit Compliance:** Complies with Bank of Uganda (BoU) and Uganda Microfinance Regulatory Authority (UMRA) guidelines requiring strict segregation between regulated financial ledgers and auxiliary social protection funds.
3. **Availability:** Turihamwe operations can proceed even during core banking end-of-day reconciliation or maintenance windows.

---

## 2. Infrastructure Requirements

### 2.1 Central Cloud Server
- **Operating System:** Ubuntu Server 22.04 LTS or 24.04 LTS (x86_64)
- **Compute:** Minimum 2 vCPUs, 4 GB RAM (8 GB recommended for 50,000+ members)
- **Storage:** 50 GB SSD with automated daily backup snapshots
- **Network:** Static Public IPv4, TLS 1.3 reverse proxy (Nginx or Caddy)
- **Node.js Runtime:** v20.x LTS or v22.x LTS with `pm2` process manager

### 2.2 Central PostgreSQL Database
- **Engine:** PostgreSQL 15 or 16
- **Database Name:** `turihamwe_db`
- **User:** `turihamwe_user` (restricted privileges, no superuser)
- **DDL Initialization Script:** `src/db/central/schema.sql`

---

## 3. Database Setup & Migration

### Step 1: Create PostgreSQL Database & User
```bash
# Connect as postgres administrator
sudo -u postgres psql

# Execute creation statements
CREATE USER turihamwe_user WITH PASSWORD 'Replace_With_Strong_Production_Password_2026';
CREATE DATABASE turihamwe_db OWNER turihamwe_user;
GRANT ALL PRIVILEGES ON DATABASE turihamwe_db TO turihamwe_user;
\c turihamwe_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
\q
```

### Step 2: Apply Central Database DDL Schema
```bash
psql -U turihamwe_user -d turihamwe_db -h localhost -f src/db/central/schema.sql
```

The schema will automatically establish:
- The 6 SACCO branches with unique codes and Kamubeizi priority
- Role definitions (GM, IT_OFFICER, BRANCH_MGR, TELLER, ACCOUNTS_ASST, AUDITOR)
- Granular permission codes
- Members table with `sacco_account_number` as primary key
- Turihamwe plans, beneficiaries, contributions, renewals, claims, documents, and audit trails
- Synchronization journal table

---

## 4. Production Environment Configuration

Create `/etc/turihamwe/.env` or `.env` in the application root with production credentials:

```ini
# Production Environment
NODE_ENV="production"
PORT=3000
APP_URL="https://turihamwe.nyamuyanjasacco.ug"

# JWT Token Security (Must be at least 32 characters of high-entropy random bytes)
# Generate with: openssl rand -base64 32
JWT_SECRET="e9f8a3c4b1d2e5f7a0b3c6d9e2f5a8b1c4d7e0f3a6b9c2d5e8f1a4b7c0d3e6f9"
JWT_EXPIRY="12h"

# Central PostgreSQL Connection
DATABASE_URL="postgresql://turihamwe_user:Your_Production_Password@localhost:5432/turihamwe_db?sslmode=require"
PGHOST="localhost"
PGPORT="5432"
PGDATABASE="turihamwe_db"
PGUSER="turihamwe_user"
PGPASSWORD="Your_Production_Password"

# Africa's Talking Uganda Live SMS API Credentials
SMS_ENVIRONMENT="PRODUCTION"
AT_USERNAME="nyamuyanjasacco"
AT_API_KEY="atsk_your_live_africastalking_production_key_here"
AT_SENDER_ID="TURIHAMWE" # UCC / Africa's Talking approved alphanumeric sender ID

# Automated Backup Directory
BACKUP_STORAGE_DIR="/var/turihamwe/backups"
BACKUP_ENCRYPTION_KEY="your_disaster_recovery_backup_passphrase"
```

---

## 5. Build & Deployment Steps

```bash
# 1. Install production dependencies
npm ci --omit=dev

# 2. Compile frontend assets
npm run build

# 3. Create persistent directories with restricted permissions
sudo mkdir -p /var/turihamwe/backups
sudo mkdir -p data
sudo chown -R $USER:$USER data /var/turihamwe/backups
chmod 700 /var/turihamwe/backups

# 4. Verify test suite passes 100%
npm test

# 5. Start application with process manager (PM2)
pm2 start server.ts --name "turihamwe-sacco" --interpreter tsx --time
pm2 save
pm2 startup
```

---

## 6. Nginx Reverse Proxy with Let's Encrypt SSL/TLS

```nginx
server {
    listen 80;
    server_name turihamwe.nyamuyanjasacco.ug;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name turihamwe.nyamuyanjasacco.ug;

    ssl_certificate /etc/letsencrypt/live/turihamwe.nyamuyanjasacco.ug/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/turihamwe.nyamuyanjasacco.ug/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Max upload size for claim documents (death certificates, medical reports)
    client_max_body_size 15M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 7. Africa's Talking Uganda Verification Checklist

1. [ ] Live Africa's Talking Uganda account funded in UGX.
2. [ ] Approved alphanumeric Sender ID (`TURIHAMWE`) registered with Uganda Communications Commission (UCC).
3. [ ] All recipient phone numbers converted to E.164 (`+256XXXXXXXXX`).
4. [ ] Inbound webhook configured for delivery reports (`/api/sms/delivery-report`).
5. [ ] Offline queue retries capped at 3 attempts with exponential backoff.
