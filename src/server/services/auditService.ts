import crypto from 'crypto';
import { AuditAction, AuditLog } from '../../types';
import { serverStore } from '../storage/serverStore';

export interface RecordAuditParams {
  userId: string;
  username: string;
  userFullName: string;
  branchId: string;
  branchName: string;
  action: AuditAction;
  recordType: string;
  recordId?: string;
  previousValue?: string;
  newValue?: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  isSynced?: boolean;
}

function sanitizeAuditPayload(val?: string): string | undefined {
  if (!val) return val;
  // Redact bcrypt hashes ($2a$, $2b$, $2y$)
  let sanitized = val.replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, '[REDACTED_PASSWORD_HASH]');
  // Redact passwords, secrets, tokens in JSON or plaintext
  sanitized = sanitized.replace(/"(password|passwordHash|secret|token|apiKey)":\s*"[^"]*"/gi, '"$1":"[REDACTED]"');
  return sanitized;
}

export class AuditService {
  public static log(params: RecordAuditParams): AuditLog {
    const logEntry: AuditLog = {
      id: `aud-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      userId: params.userId,
      username: params.username,
      userFullName: params.userFullName,
      branchId: params.branchId,
      branchName: params.branchName,
      action: params.action,
      recordType: params.recordType,
      recordId: params.recordId,
      previousValue: sanitizeAuditPayload(params.previousValue),
      newValue: sanitizeAuditPayload(params.newValue),
      reason: sanitizeAuditPayload(params.reason),
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      isSynced: params.isSynced ?? true,
    };

    serverStore.addAuditLog(logEntry);
    return logEntry;
  }

  public static getLogs(filter?: {
    branchId?: string;
    userId?: string;
    action?: string;
    recordType?: string;
    recordId?: string;
    startDate?: string;
    endDate?: string;
    searchQuery?: string;
    limit?: number;
  }): AuditLog[] {
    return serverStore.getAuditLogs(filter);
  }

  public static getLogById(id: string): AuditLog | undefined {
    return serverStore.getAuditLogById(id);
  }
}
