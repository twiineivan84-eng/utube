/**
 * TURIHAMWE MANAGEMENT SYSTEM
 * Timezone & Calendar Utilities
 * 
 * Official Institutional Timezone: Africa/Kampala (East Africa Time - EAT, UTC+03:00)
 * Note: Uganda observes EAT year-round with zero daylight saving transitions.
 * 
 * Uses standard Intl.DateTimeFormat with timeZone: 'Africa/Kampala' across all operations.
 */

export const UGANDA_TIMEZONE = 'Africa/Kampala';
export const UGANDA_TIMEZONE_LABEL = 'EAT';
export const UGANDA_UTC_OFFSET_HOURS = 3;

/**
 * Returns the current calendar date string (YYYY-MM-DD) in Uganda time (Africa/Kampala).
 */
export function getUgandaDateString(dateInput: Date | string | number = new Date()): string {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  
  // Format as en-CA which reliably outputs YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: UGANDA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Returns Uganda year and month (1-12) for a given date or current time.
 */
export function getUgandaYearMonth(dateInput: Date | string | number = new Date()): { year: number; month: number } {
  const str = getUgandaDateString(dateInput);
  if (!str) {
    const fallback = new Date();
    return { year: fallback.getUTCFullYear(), month: fallback.getUTCMonth() + 1 };
  }
  const [y, m] = str.split('-').map(Number);
  return { year: y, month: m };
}

/**
 * Extracts individual date and time components in Africa/Kampala.
 */
export function getUgandaDateTimeParts(dateInput: Date | string | number = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: UGANDA_TIMEZONE,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  return {
    weekday: partMap.weekday || '',
    year: parseInt(partMap.year || '0', 10),
    monthStr: partMap.month || '',
    day: parseInt(partMap.day || '0', 10),
    hour: parseInt(partMap.hour || '0', 10),
    minute: parseInt(partMap.minute || '0', 10),
    second: parseInt(partMap.second || '0', 10),
    formattedDate: `${partMap.day} ${partMap.month} ${partMap.year}`,
    formattedTime: `${partMap.hour}:${partMap.minute}:${partMap.second}`,
  };
}

/**
 * Formats a timestamp into a human-readable Uganda local date and time string.
 * Example: "19 Oct 2026, 15:30:45 EAT"
 */
export function formatUgandaDateTime(
  dateInput: Date | string | number | null | undefined,
  options?: {
    includeSeconds?: boolean;
    includeTimezone?: boolean;
    dateStyle?: 'short' | 'medium' | 'long' | 'full';
  }
): string {
  if (!dateInput) return '—';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '—';

  const includeSeconds = options?.includeSeconds ?? true;
  const includeTz = options?.includeTimezone ?? true;

  const dateFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: UGANDA_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);

  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: UGANDA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  }).format(d);

  return `${dateFmt}, ${timeFmt}${includeTz ? ` ${UGANDA_TIMEZONE_LABEL}` : ''}`;
}

/**
 * Formats a date into a clean Uganda local date string.
 * Example: "19 Oct 2026"
 */
export function formatUgandaDate(
  dateInput: Date | string | number | null | undefined,
  style: 'short' | 'medium' | 'long' = 'medium'
): string {
  if (!dateInput) return '—';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '—';

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: UGANDA_TIMEZONE,
    day: '2-digit',
    month: style === 'short' ? '2-digit' : style === 'long' ? 'long' : 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Formats a time into a clean Uganda local time string.
 * Example: "15:30:45 EAT"
 */
export function formatUgandaTime(
  dateInput: Date | string | number | null | undefined,
  includeSeconds = true,
  includeTz = true
): string {
  if (!dateInput) return '—';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '—';

  const timeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: UGANDA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  }).format(d);

  return `${timeStr}${includeTz ? ` ${UGANDA_TIMEZONE_LABEL}` : ''}`;
}

/**
 * Determines whether a stored timestamp (typically ISO-8601 UTC) falls within a
 * Uganda-local calendar date range (inclusive).
 * 
 * Handles midnight transitions accurately:
 * A transaction recorded at 22:30:00 UTC on 2026-10-18 is 01:30:00 EAT on 2026-10-19.
 * When filtering for 2026-10-19 in Uganda, this correctly includes that transaction.
 */
export function isTimestampInUgandaDateRange(
  timestamp: string | Date | number,
  startDate?: string,
  endDate?: string
): boolean {
  if (!timestamp) return false;
  const ugandaDate = getUgandaDateString(timestamp);
  if (!ugandaDate) return false;

  if (startDate && ugandaDate < startDate) return false;
  if (endDate && ugandaDate > endDate) return false;
  return true;
}

/**
 * Calculates the exact calendar day difference between two dates in the Uganda calendar.
 * Positive number: targetDate is in the future.
 * Negative number: targetDate is in the past.
 * 0: targetDate is today in Uganda.
 */
export function diffInUgandaCalendarDays(
  targetDateStr: string,
  baseDateInput: Date | string = new Date()
): number {
  const targetClean = targetDateStr.substring(0, 10);
  const baseUgandaStr = getUgandaDateString(baseDateInput);
  
  if (!targetClean || !baseUgandaStr) return 0;
  if (targetClean === baseUgandaStr) return 0;

  // Use UTC dates to compute day differences safely without DST distortions
  const [tY, tM, tD] = targetClean.split('-').map(Number);
  const [bY, bM, bD] = baseUgandaStr.split('-').map(Number);

  const tUtc = Date.UTC(tY, tM - 1, tD);
  const bUtc = Date.UTC(bY, bM - 1, bD);

  return Math.round((tUtc - bUtc) / (1000 * 60 * 60 * 24));
}

/**
 * Five-day direct editing restriction verification.
 * 
 * Business Rule:
 * Authorized officers may edit member information within five calendar days of registration.
 * After five days, direct editing is locked and requires a Controlled Correction with audit trail.
 * 
 * Timezone-Aware Evaluation:
 * Evaluated relative to the current Uganda calendar date.
 * If registered on 2026-01-15:
 * Day 0 (2026-01-15): 0 days elapsed -> allowed
 * Day 1 (2026-01-16): 1 day elapsed -> allowed
 * Day 5 (2026-01-20): 5 days elapsed -> allowed
 * Day 6 (2026-01-21): 6 days elapsed -> locked
 */
export function isWithinUgandaFiveDaysWindow(
  registrationDate: string,
  currentDateInput: Date | string = new Date()
): boolean {
  if (!registrationDate) return false;
  const regDateClean = registrationDate.substring(0, 10);
  const currentUgandaDate = getUgandaDateString(currentDateInput);
  
  const [rY, rM, rD] = regDateClean.split('-').map(Number);
  const [cY, cM, cD] = currentUgandaDate.split('-').map(Number);

  const rUtc = Date.UTC(rY, rM - 1, rD);
  const cUtc = Date.UTC(cY, cM - 1, cD);

  const diffDays = Math.round((cUtc - rUtc) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 5;
}

/**
 * Evaluates clock drift between client machine and trusted server timestamp.
 * If drift exceeds thresholdMs (default: 2 minutes / 120,000ms), provides a warning flag.
 */
export function detectClockDrift(
  clientTimeMs: number = Date.now(),
  serverTimeMs: number,
  thresholdMs = 120000
): { hasDrift: boolean; driftSeconds: number; message?: string } {
  const driftMs = Math.abs(clientTimeMs - serverTimeMs);
  const driftSeconds = Math.round(driftMs / 1000);
  const hasDrift = driftMs > thresholdMs;

  return {
    hasDrift,
    driftSeconds,
    message: hasDrift
      ? `System clock drift detected: local device time diverges by ~${driftSeconds} seconds from central server time.`
      : undefined,
  };
}
