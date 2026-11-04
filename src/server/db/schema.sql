-- ============================================================================
-- TURIHAMWE MANAGEMENT SYSTEM — PRODUCTION POSTGRESQL SCHEMA (PHASE 9)
-- Institution: Nyamuyanja SACCO Ltd, Isingiro District, Uganda
-- Purpose: Centralized repository for Member Welfare, Schemes, Claims & Audit
-- Note: Isolated from SACCO Core Banking; SACCO Account Number is Authoritative Member ID
-- ============================================================================

-- 1. Schema Migrations Ledger
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    checksum VARCHAR(64) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2. Branches
CREATE TABLE IF NOT EXISTS branches (
    id VARCHAR(50) PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL UNIQUE,
    location VARCHAR(255) NOT NULL,
    contact_person VARCHAR(100) NOT NULL,
    contact_phone VARCHAR(30) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_branches_code ON branches(code);
CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(is_active);

-- 3. Roles & Permissions Matrix
CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    is_system_role BOOLEAN DEFAULT TRUE NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. Users & Access Control
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(10) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150),
    phone_number VARCHAR(30) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id VARCHAR(50) NOT NULL REFERENCES roles(id) ON UPDATE CASCADE,
    primary_branch_id VARCHAR(50) NOT NULL REFERENCES branches(id) ON UPDATE CASCADE,
    authorized_branch_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    has_multi_branch_access BOOLEAN DEFAULT FALSE NOT NULL,
    direct_permissions_granted JSONB NOT NULL DEFAULT '[]'::jsonb,
    direct_permissions_revoked JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_login_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_username_length CHECK (char_length(username) >= 4 AND char_length(username) <= 10)
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(primary_branch_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- 5. SACCO Members (Master Entity)
-- SACCO Account Number is the authoritative primary identifier; no replacement IDs permitted.
CREATE TABLE IF NOT EXISTS members (
    id VARCHAR(50) PRIMARY KEY,
    sacco_account_number VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    primary_phone VARCHAR(30) NOT NULL,
    alternative_phone VARCHAR(30),
    email VARCHAR(150),
    branch_id VARCHAR(50) NOT NULL REFERENCES branches(id) ON UPDATE CASCADE,
    nin VARCHAR(30),
    gender VARCHAR(10),
    date_of_birth VARCHAR(20),
    physical_address VARCHAR(255),
    occupation VARCHAR(100),
    monthly_income NUMERIC(15, 2),
    registration_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_members_account_no ON members(sacco_account_number);
CREATE INDEX IF NOT EXISTS idx_members_name ON members(full_name);
CREATE INDEX IF NOT EXISTS idx_members_branch ON members(branch_id);
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(primary_phone);
CREATE INDEX IF NOT EXISTS idx_members_deleted ON members(is_deleted);

-- 6. Member Controlled Corrections (Post 5-Day Audit Logging)
CREATE TABLE IF NOT EXISTS controlled_corrections (
    id VARCHAR(50) PRIMARY KEY,
    member_id VARCHAR(50) NOT NULL REFERENCES members(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    corrected_by_user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON UPDATE CASCADE,
    branch_id VARCHAR(50) NOT NULL REFERENCES branches(id) ON UPDATE CASCADE,
    reason TEXT NOT NULL,
    changes_summary TEXT NOT NULL,
    previous_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_corrections_member ON controlled_corrections(member_id);
CREATE INDEX IF NOT EXISTS idx_corrections_timestamp ON controlled_corrections(timestamp);

-- 7. Turihamwe Insurance/Welfare Plans
CREATE TABLE IF NOT EXISTS turihamwe_plans (
    id VARCHAR(50) PRIMARY KEY,
    plan_number VARCHAR(50) NOT NULL UNIQUE,
    member_id VARCHAR(50) NOT NULL REFERENCES members(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    sacco_account_number VARCHAR(50) NOT NULL,
    branch_id VARCHAR(50) NOT NULL REFERENCES branches(id) ON UPDATE CASCADE,
    scheme_type VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    expiry_date TIMESTAMP WITH TIME ZONE NOT NULL,
    total_contributions_ugx NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    coverage_amount_ugx NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plans_member ON turihamwe_plans(member_id);
CREATE INDEX IF NOT EXISTS idx_plans_sacco_acc ON turihamwe_plans(sacco_account_number);
CREATE INDEX IF NOT EXISTS idx_plans_branch ON turihamwe_plans(branch_id);
CREATE INDEX IF NOT EXISTS idx_plans_status ON turihamwe_plans(status);
CREATE INDEX IF NOT EXISTS idx_plans_expiry ON turihamwe_plans(expiry_date);

-- 8. Beneficiaries
CREATE TABLE IF NOT EXISTS beneficiaries (
    id VARCHAR(50) PRIMARY KEY,
    plan_id VARCHAR(50) NOT NULL REFERENCES turihamwe_plans(id) ON DELETE CASCADE ON UPDATE CASCADE,
    full_name VARCHAR(150) NOT NULL,
    relationship VARCHAR(50) NOT NULL,
    date_of_birth VARCHAR(20),
    phone_number VARCHAR(30),
    allocation_percentage NUMERIC(5, 2) DEFAULT 0 NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_beneficiaries_plan ON beneficiaries(plan_id);

-- 9. Contributions
CREATE TABLE IF NOT EXISTS contributions (
    id VARCHAR(50) PRIMARY KEY,
    receipt_number VARCHAR(50) NOT NULL UNIQUE,
    plan_id VARCHAR(50) NOT NULL REFERENCES turihamwe_plans(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    member_id VARCHAR(50) NOT NULL REFERENCES members(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    branch_id VARCHAR(50) NOT NULL REFERENCES branches(id) ON UPDATE CASCADE,
    amount_ugx NUMERIC(15, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    reference_code VARCHAR(100) NOT NULL,
    contribution_date TIMESTAMP WITH TIME ZONE NOT NULL,
    recorded_by_user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON UPDATE CASCADE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contributions_plan ON contributions(plan_id);
CREATE INDEX IF NOT EXISTS idx_contributions_member ON contributions(member_id);
CREATE INDEX IF NOT EXISTS idx_contributions_branch ON contributions(branch_id);
CREATE INDEX IF NOT EXISTS idx_contributions_receipt ON contributions(receipt_number);

-- 10. Renewals
CREATE TABLE IF NOT EXISTS renewals (
    id VARCHAR(50) PRIMARY KEY,
    renewal_number VARCHAR(50) NOT NULL UNIQUE,
    plan_id VARCHAR(50) NOT NULL REFERENCES turihamwe_plans(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    member_id VARCHAR(50) NOT NULL REFERENCES members(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    branch_id VARCHAR(50) NOT NULL REFERENCES branches(id) ON UPDATE CASCADE,
    previous_expiry_date TIMESTAMP WITH TIME ZONE NOT NULL,
    new_expiry_date TIMESTAMP WITH TIME ZONE NOT NULL,
    renewal_fee_ugx NUMERIC(15, 2) NOT NULL,
    payment_reference VARCHAR(100) NOT NULL,
    renewed_by_user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON UPDATE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_renewals_plan ON renewals(plan_id);
CREATE INDEX IF NOT EXISTS idx_renewals_branch ON renewals(branch_id);

-- 11. Plan Reactivations Log
CREATE TABLE IF NOT EXISTS plan_reactivations (
    id VARCHAR(50) PRIMARY KEY,
    plan_id VARCHAR(50) NOT NULL REFERENCES turihamwe_plans(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    reactivated_by_user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON UPDATE CASCADE,
    reason TEXT NOT NULL,
    board_approval_reference VARCHAR(100) NOT NULL,
    previous_status VARCHAR(30) NOT NULL,
    new_status VARCHAR(30) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 12. Claims
CREATE TABLE IF NOT EXISTS claims (
    id VARCHAR(50) PRIMARY KEY,
    claim_number VARCHAR(50) NOT NULL UNIQUE,
    plan_id VARCHAR(50) NOT NULL REFERENCES turihamwe_plans(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    member_id VARCHAR(50) NOT NULL REFERENCES members(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    deceased_name VARCHAR(150) NOT NULL,
    relationship_to_member VARCHAR(50) NOT NULL,
    incident_date TIMESTAMP WITH TIME ZONE NOT NULL,
    filing_date TIMESTAMP WITH TIME ZONE NOT NULL,
    claimed_amount_ugx NUMERIC(15, 2) NOT NULL,
    approved_amount_ugx NUMERIC(15, 2),
    branch_id VARCHAR(50) NOT NULL REFERENCES branches(id) ON UPDATE CASCADE,
    filed_by_user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON UPDATE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'FILED',
    decision_reason TEXT,
    reviewed_by_user_id VARCHAR(50) REFERENCES users(id) ON UPDATE CASCADE,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    approved_by_user_id VARCHAR(50) REFERENCES users(id) ON UPDATE CASCADE,
    approved_at TIMESTAMP WITH TIME ZONE,
    payment_info JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_claims_plan ON claims(plan_id);
CREATE INDEX IF NOT EXISTS idx_claims_member ON claims(member_id);
CREATE INDEX IF NOT EXISTS idx_claims_branch ON claims(branch_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);

-- 13. Claim Documents
CREATE TABLE IF NOT EXISTS claim_documents (
    id VARCHAR(50) PRIMARY KEY,
    claim_id VARCHAR(50) NOT NULL REFERENCES claims(id) ON DELETE CASCADE ON UPDATE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    document_category VARCHAR(50) NOT NULL,
    uploaded_by_user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON UPDATE CASCADE,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_claim ON claim_documents(claim_id);

-- 14. Comprehensive Audit Trail
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id) ON UPDATE CASCADE,
    username VARCHAR(50) NOT NULL,
    user_full_name VARCHAR(150),
    branch_id VARCHAR(50) REFERENCES branches(id) ON UPDATE CASCADE,
    branch_name VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100),
    record_reference VARCHAR(100),
    details TEXT NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    ip_address VARCHAR(50),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_branch ON audit_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);

-- 15. SMS Queue & Message History
CREATE TABLE IF NOT EXISTS sms_queue (
    id VARCHAR(50) PRIMARY KEY,
    recipient_phone VARCHAR(30) NOT NULL,
    message_text TEXT NOT NULL,
    template_id VARCHAR(50),
    entity_type VARCHAR(50),
    entity_id VARCHAR(50),
    branch_id VARCHAR(50) REFERENCES branches(id) ON UPDATE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    retry_count INT DEFAULT 0 NOT NULL,
    max_retries INT DEFAULT 3 NOT NULL,
    provider_message_id VARCHAR(100),
    failure_reason TEXT,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sms_status ON sms_queue(status);
CREATE INDEX IF NOT EXISTS idx_sms_phone ON sms_queue(recipient_phone);
CREATE INDEX IF NOT EXISTS idx_sms_branch ON sms_queue(branch_id);

-- 16. SMS Templates
CREATE TABLE IF NOT EXISTS sms_templates (
    id VARCHAR(50) PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    template_text TEXT NOT NULL,
    required_variables JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    updated_by_user_id VARCHAR(50) REFERENCES users(id) ON UPDATE CASCADE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 17. System Alerts
CREATE TABLE IF NOT EXISTS system_alerts (
    id VARCHAR(50) PRIMARY KEY,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    branch_id VARCHAR(50) REFERENCES branches(id) ON UPDATE CASCADE,
    entity_type VARCHAR(50),
    entity_id VARCHAR(50),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_alerts_status ON system_alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_branch ON system_alerts(branch_id);

-- 18. Branch Synchronization Journal
CREATE TABLE IF NOT EXISTS sync_records (
    id VARCHAR(50) PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50) NOT NULL,
    operation VARCHAR(20) NOT NULL,
    payload_json JSONB NOT NULL,
    local_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    branch_id VARCHAR(50) NOT NULL REFERENCES branches(id) ON UPDATE CASCADE,
    user_id VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    retry_count INT DEFAULT 0 NOT NULL,
    error_message TEXT,
    synced_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_records(status);
CREATE INDEX IF NOT EXISTS idx_sync_branch ON sync_records(branch_id);

-- 19. Backups History & Integrity Hashes
CREATE TABLE IF NOT EXISTS backups (
    id VARCHAR(50) PRIMARY KEY,
    backup_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    backup_type VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL,
    created_by_user_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_backups_status ON backups(status);
CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at);
