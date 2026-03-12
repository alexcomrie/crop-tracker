import React from 'react';
import { Button } from '@/components/ui/button';
import { useSync } from '../../hooks/useSync';
import { useSyncStore } from '../../store/useSyncStore';
import { useAppStore } from '../../store/useAppStore';

export function SyncPanel() {
  const { pendingCount, isSyncing, syncErrors, syncNow } = useSync();
  const { syncProgress } = useSyncStore();
  const { settings } = useAppStore();

  const isOnline = navigator.onLine;
  const lastSync = settings.lastSyncAt
    ? new Date(settings.lastSyncAt).toLocaleString()
    : 'Never';

  return (
    <div className="bg-white rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Sync Status</h3>
        <div className={`flex items-center gap-1 text-xs ${isOnline ? 'text-green-600' : 'text-red-500'}`}>
          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
          {isOnline ? 'Online' : 'Offline'}
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Pending changes</span>
        <span className={`font-bold ${pendingCount > 0 ? 'text-amber-600' : 'text-green-600'}`}>
          {pendingCount}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Last synced</span>
        <span>{lastSync}</span>
      </div>

      {syncProgress && (
        <div className={`text-sm rounded-lg px-3 py-2 ${syncProgress.includes('❌') ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
          {syncProgress}
        </div>
      )}

      {syncErrors.length > 0 && (
        <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">
          {syncErrors[syncErrors.length - 1]}
        </div>
      )}

      <Button
        className="w-full"
        onClick={syncNow}
        disabled={isSyncing || !isOnline || !settings.gasWebAppUrl}
      >
        {isSyncing ? '⏳ Syncing...' : !isOnline ? '📡 Offline' : '🔄 Sync Now'}
      </Button>

      {!settings.gasWebAppUrl && (
        <p className="text-xs text-muted-foreground text-center">Configure GAS Web App URL in settings to enable sync</p>
      )}
    </div>
  );
}
