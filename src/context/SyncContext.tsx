import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { SyncState } from '../types';
import { localDb } from '../db/local/sqliteEngine';
import { apiClient } from '../api/client';

interface SyncContextType {
  syncState: SyncState;
  pendingCount: number;
  lastSyncedAt: string | null;
  isOnline: boolean;
  syncError: string | null;
  triggerSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [syncState, setSyncState] = useState<SyncState>(navigator.onLine ? 'SYNCHRONIZED' : 'OFFLINE');
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(localStorage.getItem('turihamwe_last_sync_time'));
  const [syncError, setSyncError] = useState<string | null>(null);

  // Monitor offline/online browser events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncState('SYNCHRONIZED');
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncState('OFFLINE');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check pending local queue count
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await localDb.syncQueue.where('status').equals('PENDING').count();
      setPendingCount(count);
    } catch {
      // Ignore if localDb is initializing
    }
  }, []);

  useEffect(() => {
    refreshPendingCount();
    const interval = setInterval(refreshPendingCount, 10000);
    return () => clearInterval(interval);
  }, [refreshPendingCount]);

  const triggerSync = async () => {
    if (!navigator.onLine) {
      setSyncState('OFFLINE');
      return;
    }

    try {
      setSyncState('SYNCHRONIZING');
      setSyncError(null);

      // Fetch pending queue
      const pendingItems = await localDb.syncQueue.where('status').equals('PENDING').toArray();

      if (pendingItems.length > 0) {
        const result = await apiClient.pushSyncQueue(pendingItems);
        for (const item of result.processed) {
          if (item.status === 'SYNCED') {
            await localDb.syncQueue.delete(item.id);
          } else {
            await localDb.syncQueue.update(item.id, {
              status: item.status === 'CONFLICT' ? 'CONFLICT' : 'ERROR',
              errorMessage: item.error,
              retryCount: (pendingItems.find(p => p.id === item.id)?.retryCount || 0) + 1,
            });
          }
        }
      }

      // Check central status
      await apiClient.getSyncStatus();

      const now = new Date().toISOString();
      setLastSyncedAt(now);
      localStorage.setItem('turihamwe_last_sync_time', now);
      setSyncState('SYNCHRONIZED');
      await refreshPendingCount();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Synchronization failed';
      setSyncError(message);
      setSyncState('SYNC_ERROR');
    }
  };

  return (
    <SyncContext.Provider
      value={{
        syncState,
        pendingCount,
        lastSyncedAt,
        isOnline,
        syncError,
        triggerSync,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
};
