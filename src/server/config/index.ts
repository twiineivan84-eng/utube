import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env if present
dotenv.config();

export class ConfigurationError extends Error {
  constructor(public readonly variableName: string, message?: string) {
    super(message || `Missing required environment variable: ${variableName}`);
    this.name = 'ConfigurationError';
  }
}

export type EnvironmentMode = 'development' | 'production' | 'test';

export interface AppConfig {
  nodeEnv: EnvironmentMode;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  port: number;
  appUrl: string;
  corsAllowedOrigins: string[];
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiry: string;
}

export interface DatabaseConfig {
  databaseUrl?: string;
  pgHost?: string;
  pgPort: number;
  pgDatabase?: string;
  pgUser?: string;
  pgPassword?: string;
  sqlitePath: string;
  dataDir: string;
  dataFile: string;
}

export interface PandoraConfig {
  apiUrl: string;
  balanceUrl: string;
  username: string;
  password?: string;
  senderId: string;
}

export interface SmsConfig {
  enabled: boolean;
  provider: 'AFRICAS_TALKING' | 'PANDORA';
  environment: 'SANDBOX' | 'PRODUCTION';
  username: string;
  apiKey?: string;
  senderId: string;
  pandora: PandoraConfig;
}

export interface StorageConfig {
  uploadPath: string;
  maxUploadSizeMb: number;
}

export interface BackupConfigSettings {
  enabled: boolean;
  storagePath: string;
  encryptionKey?: string;
}

export interface SyncConfig {
  enabled: boolean;
  apiUrl: string;
  intervalSeconds: number;
}

export interface SystemConfig {
  app: AppConfig;
  auth: AuthConfig;
  database: DatabaseConfig;
  sms: SmsConfig;
  storage: StorageConfig;
  backup: BackupConfigSettings;
  sync: SyncConfig;
}

/**
 * Validates and constructs the system configuration.
 * Throws a clean ConfigurationError without exposing secret values if critical production variables are absent.
 */
export function loadConfiguration(env: NodeJS.ProcessEnv = process.env): SystemConfig {
  const nodeEnv = (env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development') as EnvironmentMode;
  const isProduction = nodeEnv === 'production';
  const isDevelopment = nodeEnv === 'development';
  const isTest = nodeEnv === 'test';

  const port = parseInt(env.PORT || '3000', 10);
  const appUrl = env.APP_URL || (isProduction ? 'https://turihamwe.nyamuyanjasacco.ug' : `http://localhost:${port}`);

  // CORS configuration: in production parse comma-separated allowed origins; in dev allow safe fallback
  const corsAllowedOrigins = env.CORS_ALLOWED_ORIGINS
    ? env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : [appUrl];

  // Authentication configuration
  const jwtSecret = env.JWT_SECRET || (isDevelopment || isTest ? 'dev-jwt-secret-turihamwe-sacco-enterprise-auth-key-min32chars' : '');
  const jwtExpiry = env.JWT_EXPIRY || '12h';

  if (isProduction) {
    if (!env.JWT_SECRET) {
      throw new ConfigurationError('JWT_SECRET', 'Missing required environment variable: JWT_SECRET must be defined in production.');
    }
    if (env.JWT_SECRET.length < 32) {
      throw new ConfigurationError('JWT_SECRET', 'Invalid environment variable: JWT_SECRET must be at least 32 characters in production.');
    }
  }

  // Database configuration
  const databaseUrl = env.DATABASE_URL;
  const pgPort = parseInt(env.PGPORT || '5432', 10);

  if (isProduction && !databaseUrl && (!env.PGHOST || !env.PGDATABASE)) {
    throw new ConfigurationError('DATABASE_URL', 'Missing required environment variable: DATABASE_URL (or PGHOST and PGDATABASE) must be defined in production.');
  }

  const dataDir = path.resolve(process.cwd(), env.DATA_STORAGE_DIR || 'data');
  const dataFile = path.resolve(dataDir, env.DATA_FILE_NAME || 'turihamwe_central_db.json');
  const sqlitePath = env.SQLITE_DATABASE_PATH || path.resolve(dataDir, 'turihamwe-local.sqlite');

  // SMS Gateway Configuration (Active: Pandora Networks | Fallback: Africa's Talking)
  const smsEnabled = env.SMS_ENABLED !== 'false';
  const smsProvider = (env.SMS_PROVIDER === 'AFRICAS_TALKING' ? 'AFRICAS_TALKING' : 'PANDORA') as 'AFRICAS_TALKING' | 'PANDORA';
  const smsEnv = (env.SMS_ENVIRONMENT === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX') as 'SANDBOX' | 'PRODUCTION';
  const atUsername = env.AT_USERNAME || 'sandbox';
  const atApiKey = env.AT_API_KEY || env.AFRICAS_TALKING_API_KEY;
  const atSenderId = env.AT_SENDER_ID || 'TURIHAMWE';

  // Pandora Networks SMS (Primary Intended Provider for Nyamuyanja SACCO Ltd, Uganda)
  const pandoraApiUrl = env.PANDORA_SMS_API_URL || 'https://www.sms.thepandoranetworks.com/API/send_sms/';
  const pandoraBalanceUrl = env.PANDORA_SMS_BALANCE_URL || 'https://www.sms.thepandoranetworks.com/API/balance_inquiry.php';
  const pandoraUsername = env.PANDORA_SMS_USERNAME || '';
  const pandoraPassword = env.PANDORA_SMS_PASSWORD || '';
  // Maximum 11 characters GSM alphanumeric sender ID (e.g. NYAMUYANJA)
  const pandoraSenderId = env.PANDORA_SMS_SENDER_ID || 'NYAMUYANJA';

  if (isProduction && smsEnabled && smsProvider === 'AFRICAS_TALKING' && smsEnv === 'PRODUCTION') {
    if (!atApiKey) {
      throw new ConfigurationError('AT_API_KEY', 'Missing required environment variable: AT_API_KEY is required when SMS_ENVIRONMENT is set to PRODUCTION.');
    }
    if (!atUsername || atUsername.toLowerCase() === 'sandbox') {
      throw new ConfigurationError('AT_USERNAME', 'Invalid environment variable: AT_USERNAME cannot be "sandbox" when SMS_ENVIRONMENT is set to PRODUCTION.');
    }
  }

  // File Storage Configuration
  const uploadPath = path.resolve(process.cwd(), env.FILE_STORAGE_PATH || path.join(dataDir, 'uploads'));
  const maxUploadSizeMb = parseInt(env.MAX_UPLOAD_SIZE_MB || '10', 10);

  // Backup Configuration
  const backupEnabled = env.BACKUP_ENABLED !== 'false';
  const backupStoragePath = path.resolve(process.cwd(), env.BACKUP_STORAGE_DIR || path.join(dataDir, 'backups'));
  const backupEncryptionKey = env.BACKUP_ENCRYPTION_KEY;

  // Synchronization Configuration
  const syncEnabled = env.SYNC_ENABLED !== 'false';
  const syncApiUrl = env.SYNC_API_URL || '/api/sync';
  const syncIntervalSeconds = parseInt(env.SYNC_INTERVAL_SECONDS || '30', 10);

  return {
    app: {
      nodeEnv,
      isProduction,
      isDevelopment,
      isTest,
      port,
      appUrl,
      corsAllowedOrigins,
    },
    auth: {
      jwtSecret,
      jwtExpiry,
    },
    database: {
      databaseUrl,
      pgHost: env.PGHOST,
      pgPort,
      pgDatabase: env.PGDATABASE,
      pgUser: env.PGUSER,
      pgPassword: env.PGPASSWORD,
      sqlitePath,
      dataDir,
      dataFile,
    },
    sms: {
      enabled: smsEnabled,
      provider: smsProvider,
      environment: smsEnv,
      username: atUsername,
      apiKey: atApiKey,
      senderId: atSenderId,
      pandora: {
        apiUrl: pandoraApiUrl,
        balanceUrl: pandoraBalanceUrl,
        username: pandoraUsername,
        password: pandoraPassword,
        senderId: pandoraSenderId,
      },
    },
    storage: {
      uploadPath,
      maxUploadSizeMb,
    },
    backup: {
      enabled: backupEnabled,
      storagePath: backupStoragePath,
      encryptionKey: backupEncryptionKey,
    },
    sync: {
      enabled: syncEnabled,
      apiUrl: syncApiUrl,
      intervalSeconds: syncIntervalSeconds,
    },
  };
}

// Authoritative system configuration singleton
export const config: SystemConfig = loadConfiguration();
