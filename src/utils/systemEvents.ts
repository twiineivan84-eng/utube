/**
 * System-Wide Reactive Event Bus for Turihamwe Management System
 * Enables real-time synchronization and data reflection across views
 * whenever a member, insurance plan, contribution, renewal, claim, or user is edited or saved.
 */

export type SystemRecordType =
  | 'MEMBER'
  | 'PLAN'
  | 'CONTRIBUTION'
  | 'RENEWAL'
  | 'CLAIM'
  | 'USER'
  | 'ROLE'
  | 'SETTINGS'
  | 'BUSINESS_RULES';

export type SystemActionType =
  | 'CREATED'
  | 'UPDATED'
  | 'DELETED'
  | 'CORRECTED'
  | 'STATUS_CHANGED';

export interface SystemRecordChangeEvent<T = unknown> {
  entityType: SystemRecordType;
  action: SystemActionType;
  id: string;
  data?: T;
  timestamp: string;
}

const EVENT_NAME = 'turihamwe:record-changed';

type EventListenerCallback = (event: SystemRecordChangeEvent<any>) => void;
const listeners = new Set<EventListenerCallback>();

/**
 * Dispatches a system-wide record change notification to inform all active views and components.
 */
export function notifyRecordChanged<T = unknown>(
  entityType: SystemRecordType,
  action: SystemActionType,
  id: string,
  data?: T
): void {
  const detail: SystemRecordChangeEvent<T> = {
    entityType,
    action,
    id,
    data,
    timestamp: new Date().toISOString(),
  };

  // 1. Notify all in-memory subscribers synchronously (works in both browser & test environments)
  listeners.forEach((callback) => {
    try {
      callback(detail);
    } catch (err) {
      console.warn('Error in record change subscriber callback:', err);
    }
  });

  // 2. Dispatch custom DOM event if running in browser window context
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
    } catch (e) {
      console.warn('Failed to dispatch system record change event:', e);
    }
  }
}

/**
 * Subscribes to system-wide record change events. Returns an unsubscribe cleanup function.
 */
export function subscribeToRecordChanges(
  callback: (event: SystemRecordChangeEvent) => void
): () => void {
  listeners.add(callback);

  return () => {
    listeners.delete(callback);
  };
}

