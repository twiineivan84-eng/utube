# Turihamwe Management System — Production Deployment Guide
**Institution**: Nyamuyanja SACCO Ltd, Isingiro District, Uganda  
**Application**: Turihamwe Scheme Management, Member Welfare, Contributions, Renewals & Claims  
**Version**: 1.0.0-phase9  

---

## 1. Production Architecture Overview

The Turihamwe Management System employs an institutional, offline-first hybrid architecture:

```
[ Central Cloud / Server ]
├── Express.js API & Vite Single Page App (Port 3000)
├── Central PostgreSQL 16 Database (Isolated from SACCO Core Banking)
├── Africa's Talking Uganda Live SMS Gateway
├── Encrypted Snapshot Backup Archive Storage (/app/data/backups)
└── Claim Evidence File Store (/app/data/uploads)
         ▲
         │ HTTPS / TLS (Bidirectional Sync API)
         ▼
[ Six SACCO Branch Nodes ]
├── 1. Nyamuyanja (Main Branch / HQ)
├── 2. Kagarama Branch
├── 3. Nyakigyera Branch
├── 4. Kamubeizi Branch
├── 5. Ruborogota Branch
└── 6. Masha Branch
     └── SQLite / IndexedDB Local Storage & Transactional Journal
```

---

## 2. Server Prerequisites

- **Operating System**: Linux (Ubuntu 22.04 LTS / Debian 12 / Alpine 3.19 recommended)
- **Runtime**: Node.js 22 LTS or Docker Engine $\ge 24.0$ with Docker Compose $\ge 2.20$
- **Database**: PostgreSQL 15 or 16
- **Reverse Proxy**: NGINX / Caddy with TLS 1.3 certificate (Let's Encrypt or Institutional CA)
- **Minimum Hardware**: 2 vCPUs, 4 GB RAM, 50 GB NVMe Storage

---

## 3. Step-by-Step Deployment Options

### Option A: Containerized Deployment via Docker Compose (Recommended)

1. **Clone repository onto the target server**:
   ```bash
   git clone <repository_url> /opt/turihamwe
   cd /opt/turihamwe
   ```

2. **Configure production environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your production database credentials, 32+ char JWT secret, and Africa's Talking live key
   chmod 600 .env
   ```

3. **Deploy the stack**:
   ```bash
   docker compose up -d --build
   ```

4. **Verify container health**:
   ```bash
   docker compose ps
   curl -s http://127.0.0.1:3000/api/health | jq .
   ```

---

### Option B: Bare-Metal / Virtual Machine Deployment

1. **Install Node.js 22 LTS**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs postgresql-client
   ```

2. **Install project dependencies & build frontend bundle**:
   ```bash
   npm ci
   npm run build
   ```

3. **Execute database migrations**:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

4. **Start via Process Manager (PM2)**:
   ```bash
   sudo npm install -g pm2
   pm2 start "npm start" --name turihamwe-sacco
   pm2 save
   pm2 startup
   ```

---

## 4. Reverse Proxy & HTTPS Configuration (NGINX)

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

    client_max_body_size 10M;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

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

## 5. Verification Commands

```bash
# Verify health endpoint
curl -s https://turihamwe.nyamuyanjasacco.ug/api/health

# Verify database health & table counts
npm run db:check

# Run full automated test suite (78 tests)
npm test
```
