-- ============================================================
-- TURIHAMWE MANAGEMENT SYSTEM
-- Organization: Nyamuyanja SACCO Ltd, Uganda
-- Local Offline SQLite Schema
-- Version: 1.0.0 (Phase 1)
-- ============================================================

PRAGMA foreign_keys = ON;

-- 1. LOCAL BRANCH CACHE
CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE,
    district TEXT NOT NULL,
    is_headquarters INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 2. LOCAL PERMISSIONS CACHE
CREATE TABLE IF NOT EXISTS permissions (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT
);

-- 3. LOCAL ROLES CACHE
CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_system INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 4. LOCAL ROLE_PERMISSIONS CACHE
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id TEXT NOT NULL,
    permission_code TEXT NOT NULL,
    PRIMARY KEY (role_id, permission_code)
);

-- 5. LOCAL USERS CACHE
-- Username: min 4, max 10 characters
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    password_hash TEXT NOT NULL,
    role_id TEXT NOT NULL,
    primary_branch_id TEXT NOT NULL,
    has_multi_branch_access INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    requires_password_reset INTEGER NOT NULL DEFAULT 0,
    last_login_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 6. LOCAL USER ALLOWED BRANCHES
CREATE TABLE IF NOT EXISTS user_allowed_branches (
    user_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    PRIMARY KEY (user_id, branch_id)
);

-- 7. LOCAL USER DIRECT PERMISSIONS
CREATE TABLE IF NOT EXISTS user_permissions (
    user_id TEXT NOT NULL,
    permission_code TEXT NOT NULL,
    is_granted INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, permission_code)
);

-- 8. LOCAL MEMBERS
-- Critical: Primary key is the sacco_account_number. Exactly ONE per member.
CREATE TABLE IF NOT EXISTS members (
    sacco_account_number TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    gender TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    national_id_number TEXT NOT NULL,
    primary_phone TEXT NOT NULL,
    alternative_phone TEXT,
    email_address TEXT,
    district TEXT NOT NULL,
    sub_county TEXT NOT NULL,
    parish TEXT NOT NULL,
    village TEXT NOT NULL,
    registration_date TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    is_locked_from_normal_edit INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'SYNCED' -- 'SYNCED', 'PENDING', 'CONFLICT'
);

CREATE INDEX IF NOT EXISTS idx_local_members_name ON members(full_name);

-- 9. LOCAL MEMBER CORRECTIONS
CREATE TABLE IF NOT EXISTS member_corrections (
    id TEXT PRIMARY KEY,
    sacco_account_number TEXT NOT NULL,
    field_name TEXT NOT NULL,
    previous_value TEXT,
    new_value TEXT NOT NULL,
    reason TEXT NOT NULL,
    corrected_by_user_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    corrected_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'PENDING'
);

-- 10. LOCAL TURIHAMWE PLANS
CREATE TABLE IF NOT EXISTS turihamwe_plans (
    id TEXT PRIMARY KEY,
    sacco_account_number TEXT NOT NULL,
    plan_code TEXT NOT NULL DEFAULT 'STANDARD',
    status TEXT NOT NULL,
    enrolment_date TEXT NOT NULL,
    effective_start_date TEXT NOT NULL,
    current_expiry_date TEXT NOT NULL,
    last_renewal_date TEXT,
    registered_branch_id TEXT NOT NULL,
    registered_by_user_id TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'SYNCED'
);

-- 11. LOCAL BENEFICIARIES
CREATE TABLE IF NOT EXISTS beneficiaries (
    id TEXT PRIMARY KEY,
    sacco_account_number TEXT NOT NULL,
    full_name TEXT NOT NULL,
    relationship TEXT NOT NULL,
    date_of_birth TEXT,
    national_id_number TEXT,
    contact_phone TEXT,
    percentage_allocation REAL DEFAULT 100.0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'SYNCED'
);

-- 12. LOCAL CONTRIBUTIONS
CREATE TABLE IF NOT EXISTS contributions (
    id TEXT PRIMARY KEY,
    sacco_account_number TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    received_by_user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'CASH',
    receipt_number TEXT NOT NULL UNIQUE,
    contribution_date TEXT NOT NULL,
    period_covered_start TEXT,
    period_covered_end TEXT,
    remarks TEXT,
    created_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'PENDING'
);

-- 13. LOCAL RENEWALS
CREATE TABLE IF NOT EXISTS renewals (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    sacco_account_number TEXT NOT NULL,
    previous_expiry_date TEXT NOT NULL,
    new_expiry_date TEXT NOT NULL,
    processed_by_user_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    renewal_fee REAL NOT NULL DEFAULT 0.0,
    renewal_date TEXT NOT NULL,
    receipt_reference TEXT,
    created_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'PENDING'
);

-- 14. LOCAL CLAIMS
CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    sacco_account_number TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    beneficiary_id TEXT,
    claim_date TEXT NOT NULL,
    claim_type TEXT NOT NULL,
    status TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    prepared_by_user_id TEXT NOT NULL,
    approved_by_user_id TEXT,
    approval_date TEXT,
    rejection_reason TEXT,
    benefit_amount REAL,
    payment_reference TEXT,
    payment_disbursed_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'PENDING'
);

-- 15. LOCAL AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    user_full_name TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    action TEXT NOT NULL,
    record_type TEXT NOT NULL,
    record_id TEXT,
    previous_value TEXT,
    new_value TEXT,
    reason TEXT,
    ip_address TEXT,
    user_agent TEXT,
    is_synced INTEGER NOT NULL DEFAULT 0
);

-- 16. LOCAL SYNC QUEUE (Offline-first change journal)
CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SYNCING', 'CONFLICT', 'ERROR'
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT
);

-- 17. LOCAL CONFLICT STORE
CREATE TABLE IF NOT EXISTS sync_conflicts (
    id TEXT PRIMARY KEY,
    queue_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    client_version_json TEXT NOT NULL,
    server_version_json TEXT NOT NULL,
    conflict_detected_at TEXT NOT NULL,
    resolution_status TEXT NOT NULL DEFAULT 'UNRESOLVED', -- 'UNRESOLVED', 'USE_SERVER', 'USE_CLIENT', 'MERGED'
    resolved_by_user_id TEXT,
    resolved_at TEXT
);
