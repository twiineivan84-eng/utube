# Turihamwe Management System — Operational Troubleshooting Guide
**Institution**: Nyamuyanja SACCO Ltd, Isingiro District, Uganda  

---

## 1. Common Operational Scenarios

### Symptom: "Session expired or invalid credentials"
- **Cause**: JWT token has expired (default: 12 hours) or server secret was changed.
- **Resolution**: Re-authenticate at the login screen. The application now automatically purges stale tokens and redirects smoothly to the login view.

---

### Symptom: "Missing required environment variable: JWT_SECRET"
- **Cause**: Server started with `NODE_ENV=production` without defining `JWT_SECRET` in `.env` or system environment.
- **Resolution**: Generate a secure 256-bit string (`openssl rand -hex 32`) and assign it to `JWT_SECRET` in `.env`.

---

### Symptom: Branch transactions remain in "PENDING" status
- **Cause**: Local branch internet connectivity is offline or central API endpoint is unreachable.
- **Resolution**: 
  1. Verify branch router and cellular modem connection.
  2. Confirm central server status via `https://turihamwe.nyamuyanjasacco.ug/api/health`.
  3. Once network is restored, transactions sync automatically. Click **Sync Now** to trigger an immediate cycle.

---

### Symptom: "SMS dispatch failed: Missing required environment variable: AT_API_KEY"
- **Cause**: `SMS_ENVIRONMENT` was set to `PRODUCTION` without specifying `AT_API_KEY` or `AT_USERNAME`.
- **Resolution**: Supply valid live credentials from the Africa's Talking Uganda portal, or set `SMS_ENVIRONMENT=SANDBOX` / `SMS_ENABLED=false` for local testing.

---

### Symptom: Member details cannot be edited
- **Cause**: The 5-day editing window has elapsed. The record is locked by institutional rule.
- **Resolution**: Use the **Controlled Correction** action from the member profile. Provide a documented justification reason for managerial approval.

---

## 2. Server Diagnostic Commands

```bash
# 1. Check application and subsystem health
curl -s http://127.0.0.1:3000/api/health | jq .

# 2. Check database status and table counts
npm run db:check

# 3. Check database migrations
npm run db:migrate

# 4. View real-time application logs (Docker)
docker compose logs -f --tail=100 app_server

# 5. View real-time application logs (PM2)
pm2 logs turihamwe-sacco --lines 100
```
