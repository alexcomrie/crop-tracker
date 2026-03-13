import { useEffect, useCallback } from 'react';
import { useSyncStore } from '../store/useSyncStore';
import { useAppStore } from '../store/useAppStore';
import { buildSyncPayload, pushToSheets, getPendingCount } from '../lib/sync';

export function useSync() {
  const { pendingCount, isSyncing, syncErrors, setPendingCount, setIsSyncing, setSyncProgress, addSyncError, clearSyncErrors, setLastSyncAt } = useSyncStore();
  const { settings, updateSettings } = useAppStore();

  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, [setPendingCount]);

  useEffect(() => {
    refreshPendingCount();
    const timer = setInterval(refreshPendingCount, 10000);
    return () => clearInterval(timer);
  }, [refreshPendingCount]);

  const syncNow = useCallback(async () => {
    if (isSyncing || !navigator.onLine) return;
    setIsSyncing(true);
    setSyncProgress('Preparing...');
    clearSyncErrors();
    try {
      const payload = await buildSyncPayload();
      const totalRecords = Object.values(payload).reduce((a, arr) => a + (arr as any[]).length, 0);
      setSyncProgress(`Uploading ${totalRecords} records...`);
      const result = await pushToSheets(payload, setSyncProgress);
      if (result.success) {
        const ts = Date.now();
        setLastSyncAt(ts);
        updateSettings({ lastSyncAt: ts });
        setSyncProgress(`✅ Done. ${totalRecords} records synced.`);
        await refreshPendingCount();
      } else {
        addSyncError(result.error ?? 'Unknown error');
        setSyncProgress('❌ Sync failed');
      }
    } catch (err: any) {
      addSyncError(err.message);
      setSyncProgress('❌ Sync error');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncProgress(''), 3000);
    }
  }, [isSyncing, settings, setIsSyncing, setSyncProgress, addSyncError, clearSyncErrors, setLastSyncAt, updateSettings, refreshPendingCount]);

  return { pendingCount, isSyncing, syncErrors, syncNow, refreshPendingCount };
}
