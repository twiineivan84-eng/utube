# Turihamwe Management System — Africa's Talking Uganda SMS Gateway Guide
**Institution**: Nyamuyanja SACCO Ltd, Isingiro District, Uganda  

---

## 1. Locked Provider Specification

The official SMS delivery partner for Nyamuyanja SACCO Ltd is **Africa's Talking**.

- **Staging / Development**: Africa's Talking Sandbox
- **Production**: Africa's Talking Uganda Live SMS API (`https://api.africastalking.com/version1/messaging`)
- **Alpha Sender ID**: `TURIHAMWE` (Registered with Uganda Communications Commission)

---

## 2. Environment Configuration

### Development Mode (.env)
```bash
SMS_ENABLED=true
SMS_ENVIRONMENT=SANDBOX
AT_USERNAME=sandbox
AT_API_KEY=atsk_sandbox_development_placeholder
AT_SENDER_ID=TURIHAMWE
```

### Production Mode (.env)
```bash
SMS_ENABLED=true
SMS_ENVIRONMENT=PRODUCTION
AT_USERNAME=nyamuyanja_sacco
AT_API_KEY=atsk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AT_SENDER_ID=TURIHAMWE
```

---

## 3. Supported Notification Events & Cadence

1. **Member Enrolment Confirmation**:
   - Sent immediately upon Turihamwe plan activation.
2. **Contribution Receipt Notification**:
   - Dispatched upon contribution ingestion with receipt number and SACCO account balance.
3. **Confirmed Policy Expiry Reminders**:
   - Interval 1: **30 Days Prior**
   - Interval 2: **14 Days Prior**
   - Interval 3: **7 Days Prior**
   - Interval 4: **Day of Expiry (Day 0)**
   - Interval 5: **Post-Expiry Grace Notification (Day -1)**
4. **Claim Lodgement & Payment Settlement**:
   - Sent when a claim is filed and when the benefit disbursement voucher is finalized.

---

## 4. E.164 Phone Number Formatting

The SMS engine strictly validates and normalizes all recipient phone numbers to Ugandan E.164 format:
- `0772 123 456` $\rightarrow$ `+256772123456`
- `256701234567` $\rightarrow$ `+256701234567`
- `+256782000000` $\rightarrow$ `+256782000000`

---

## 5. Duplicate Suppression Guarantee

The SMS service tracks `entityType` and `entityId` within a 24-hour deduplication window. Even if a synchronization retry pushes the same contribution or claim multiple times, the system suppresses duplicate SMS dispatches.
