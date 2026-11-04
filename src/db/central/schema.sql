-- ============================================================
-- TURIHAMWE MANAGEMENT SYSTEM
-- Organization: Nyamuyanja SACCO Ltd, Uganda
-- Central Database Schema (PostgreSQL)
-- Version: 1.0.0 (Phase 1)
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. BRANCHES
CREATE TABLE IF NOT EXISTS branches (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL UNIQUE,
    district VARCHAR(64) NOT NULL DEFAULT 'Isingiro',
    is_headquarters BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_branches_code ON branches(code);
CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(is_active);

-- 2. PERMISSIONS
CREATE TABLE IF NOT EXISTS permissions (
    code VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    category VARCHAR(64) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. ROLES
CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL UNIQUE,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. ROLE_PERMISSIONS
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id VARCHAR(64) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_code VARCHAR(64) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_code)
);

-- 5. USERS
-- Username rule: Minimum 4 characters, Maximum 10 characters
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(10) NOT NULL UNIQUE CHECK (char_length(username) >= 4 AND char_length(username) <= 10),
    full_name VARCHAR(128) NOT NULL,
    email VARCHAR(128),
    phone VARCHAR(32),
    password_hash VARCHAR(255) NOT NULL,
    role_id VARCHAR(64) NOT NULL REFERENCES roles(id),
    primary_branch_id VARCHAR(64) NOT NULL REFERENCES branches(id),
    has_multi_branch_access BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    requires_password_reset BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(primary_branch_id);

-- 6. USER_ALLOWED_BRANCHES (For multi-branch access)
CREATE TABLE IF NOT EXISTS user_allowed_branches (
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id VARCHAR(64) NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assigned_by VARCHAR(64),
    PRIMARY KEY (user_id, branch_id)
);

-- 7. USER_PERMISSIONS (Direct user-level grant or override)
CREATE TABLE IF NOT EXISTS user_permissions (
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_code VARCHAR(64) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
    is_granted BOOLEAN NOT NULL DEFAULT TRUE, -- TRUE = explicit grant, FALSE = explicit revoke
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assigned_by VARCHAR(64),
    PRIMARY KEY (user_id, permission_code)
);

-- 8. MEMBERS
-- Critical Rule: SACCO Account Number is the single primary member identifier. Strictly Unique.
CREATE TABLE IF NOT EXISTS members (
    sacco_account_number VARCHAR(64) PRIMARY KEY,
    full_name VARCHAR(128) NOT NULL,
    gender VARCHAR(16) NOT NULL CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
    date_of_birth DATE NOT NULL,
    national_id_number VARCHAR(32) NOT NULL,
    primary_phone VARCHAR(32) NOT NULL,
    alternative_phone VARCHAR(32),
    email_address VARCHAR(128),
    district VARCHAR(64) NOT NULL,
    sub_county VARCHAR(64) NOT NULL,
    parish VARCHAR(64) NOT NULL,
    village VARCHAR(64) NOT NULL,
    registration_date DATE NOT NULL DEFAULT CURRENT_DATE,
    branch_id VARCHAR(64) NOT NULL REFERENCES branches(id),
    created_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    is_locked_from_normal_edit BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_members_account ON members(sacco_account_number);
CREATE INDEX IF NOT EXISTS idx_members_name ON members(full_name);
CREATE INDEX IF NOT EXISTS idx_members_branch ON members(branch_id);

-- 9. MEMBER CORRECTIONS (Controlled correction audit after 5-day lock)
CREATE TABLE IF NOT EXISTS member_corrections (
    id VARCHAR(64) PRIMARY KEY,
    sacco_account_number VARCHAR(64) NOT NULL REFERENCES members(sacco_account_number) ON DELETE CASCADE,
    field_name VARCHAR(64) NOT NULL,
    previous_value TEXT,
    new_value TEXT NOT NULL,
    reason TEXT NOT NULL,
    corrected_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    branch_id VARCHAR(64) NOT NULL REFERENCES branches(id),
    corrected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. TURIHAMWE PLANS
CREATE TABLE IF NOT EXISTS turihamwe_plans (
    id VARCHAR(64) PRIMARY KEY,
    sacco_account_number VARCHAR(64) NOT NULL REFERENCES members(sacco_account_number) ON DELETE RESTRICT,
    plan_code VARCHAR(32) NOT NULL DEFAULT 'STANDARD',
    status VARCHAR(32) NOT NULL CHECK (status IN ('ACTIVE', 'EXPIRING', 'EXPIRED', 'SUSPENDED', 'TERMINATED')),
    enrolment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_start_date DATE NOT NULL,
    current_expiry_date DATE NOT NULL,
    last_renewal_date DATE,
    registered_branch_id VARCHAR(64) NOT NULL REFERENCES branches(id),
    registered_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_turihamwe_account ON turihamwe_plans(sacco_account_number);
CREATE INDEX IF NOT EXISTS idx_turihamwe_expiry ON turihamwe_plans(current_expiry_date);
CREATE INDEX IF NOT EXISTS idx_turihamwe_status ON turihamwe_plans(status);

-- 11. BENEFICIARIES
CREATE TABLE IF NOT EXISTS beneficiaries (
    id VARCHAR(64) PRIMARY KEY,
    sacco_account_number VARCHAR(64) NOT NULL REFERENCES members(sacco_account_number) ON DELETE CASCADE,
    full_name VARCHAR(128) NOT NULL,
    relationship VARCHAR(64) NOT NULL,
    date_of_birth DATE,
    national_id_number VARCHAR(32),
    contact_phone VARCHAR(32),
    percentage_allocation NUMERIC(5,2) DEFAULT 100.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_beneficiaries_account ON beneficiaries(sacco_account_number);

-- 12. CONTRIBUTIONS
CREATE TABLE IF NOT EXISTS contributions (
    id VARCHAR(64) PRIMARY KEY,
    sacco_account_number VARCHAR(64) NOT NULL REFERENCES members(sacco_account_number) ON DELETE RESTRICT,
    plan_id VARCHAR(64) NOT NULL REFERENCES turihamwe_plans(id),
    branch_id VARCHAR(64) NOT NULL REFERENCES branches(id),
    received_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(32) NOT NULL DEFAULT 'CASH',
    receipt_number VARCHAR(64) NOT NULL UNIQUE,
    contribution_date DATE NOT NULL DEFAULT CURRENT_DATE,
    period_covered_start DATE,
    period_covered_end DATE,
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contributions_account ON contributions(sacco_account_number);
CREATE INDEX IF NOT EXISTS idx_contributions_branch ON contributions(branch_id);
CREATE INDEX IF NOT EXISTS idx_contributions_receipt ON contributions(receipt_number);

-- 13. RENEWALS
CREATE TABLE IF NOT EXISTS renewals (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL REFERENCES turihamwe_plans(id),
    sacco_account_number VARCHAR(64) NOT NULL REFERENCES members(sacco_account_number),
    previous_expiry_date DATE NOT NULL,
    new_expiry_date DATE NOT NULL,
    processed_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    branch_id VARCHAR(64) NOT NULL REFERENCES branches(id),
    renewal_fee NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    renewal_date DATE NOT NULL DEFAULT CURRENT_DATE,
    receipt_reference VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 14. CLAIMS
CREATE TABLE IF NOT EXISTS claims (
    id VARCHAR(64) PRIMARY KEY, -- Claim ID e.g. CLM-2026-0001
    sacco_account_number VARCHAR(64) NOT NULL REFERENCES members(sacco_account_number) ON DELETE RESTRICT,
    plan_id VARCHAR(64) NOT NULL REFERENCES turihamwe_plans(id),
    beneficiary_id VARCHAR(64) REFERENCES beneficiaries(id),
    claim_date DATE NOT NULL DEFAULT CURRENT_DATE,
    claim_type VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'APPROVED', 'REJECTED', 'CLOSED')),
    branch_id VARCHAR(64) NOT NULL REFERENCES branches(id),
    prepared_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    approved_by_user_id VARCHAR(64) REFERENCES users(id),
    approval_date TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    benefit_amount NUMERIC(12,2),
    payment_reference VARCHAR(64),
    payment_disbursed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_claims_account ON claims(sacco_account_number);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_branch ON claims(branch_id);

-- 15. CLAIM DOCUMENTS
CREATE TABLE IF NOT EXISTS claim_documents (
    id VARCHAR(64) PRIMARY KEY,
    claim_id VARCHAR(64) NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    document_title VARCHAR(128) NOT NULL,
    document_type VARCHAR(64) NOT NULL, -- Death Certificate, National ID, Medical Report, etc.
    file_path VARCHAR(255) NOT NULL,
    uploaded_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 16. AUDIT LOGS
-- Immutable institutional audit logs. No updates or deletes allowed.
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id VARCHAR(64) NOT NULL,
    username VARCHAR(32) NOT NULL,
    user_full_name VARCHAR(128) NOT NULL,
    branch_id VARCHAR(64) NOT NULL,
    branch_name VARCHAR(128) NOT NULL,
    action VARCHAR(64) NOT NULL,
    record_type VARCHAR(64) NOT NULL,
    record_id VARCHAR(64),
    previous_value TEXT,
    new_value TEXT,
    reason TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    is_synced BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_branch ON audit_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

-- 17. SMS TEMPLATES
CREATE TABLE IF NOT EXISTS sms_templates (
    code VARCHAR(64) PRIMARY KEY,
    title VARCHAR(128) NOT NULL,
    template_body TEXT NOT NULL,
    available_variables TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 18. SMS LOGS
CREATE TABLE IF NOT EXISTS sms_logs (
    id VARCHAR(64) PRIMARY KEY,
    sacco_account_number VARCHAR(64) REFERENCES members(sacco_account_number),
    recipient_phone VARCHAR(32) NOT NULL,
    message_text TEXT NOT NULL,
    template_code VARCHAR(64) REFERENCES sms_templates(code),
    status VARCHAR(32) NOT NULL CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
    gateway_reference VARCHAR(128),
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 19. SYNCHRONIZATION JOURNAL
CREATE TABLE IF NOT EXISTS sync_journal (
    id VARCHAR(64) PRIMARY KEY,
    branch_id VARCHAR(64) NOT NULL REFERENCES branches(id),
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    operation VARCHAR(16) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    payload_json TEXT NOT NULL,
    client_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    server_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(32) NOT NULL CHECK (status IN ('PENDING', 'APPLIED', 'CONFLICT', 'REJECTED')),
    conflict_details TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_branch ON sync_journal(branch_id);
CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_journal(status);

-- 20. SYSTEM SETTINGS
CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(64) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    data_type VARCHAR(32) NOT NULL DEFAULT 'STRING',
    description TEXT,
    updated_by_user_id VARCHAR(64) REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
