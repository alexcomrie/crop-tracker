import React, { useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSync } from '../../hooks/useSync';
import { RefreshCw, CloudOff } from 'lucide-react';

const TITLES: Record<string, string> = {
  dashboard: 'CropManager',
  crops: '🌱 Crops',
  propagations: '🌿 Propagations',
  calendar: '📅 Calendar',
  settings: '⚙️ Settings',
};

export function TopBar() {
  const { activeTab, settings } = useAppStore();
  const { pendingCount, isSyncing, syncNow } = useSync();
  const isOnline = navigator.onLine;

  // End of day sync logic (e.g., at the configured hour)
  useEffect(() => {
    if (!settings.syncEnabled) return;
    
    const checkSync = () => {
      const now = new Date();
      const lastSync = new Date(settings.lastSyncAt);
      
      // If same day already synced, skip
      if (now.toDateString() === lastSync.toDateString()) return;
      
      // If current hour matches autoSyncHour
      if (now.getHours() === settings.autoSyncHour) {
        syncNow();
      }
    };

    const interval = setInterval(checkSync, 1000 * 60 * 30); // Check every 30 mins
    checkSync();
    return () => clearInterval(interval);
  }, [settings.syncEnabled, settings.autoSyncHour, settings.lastSyncAt, syncNow]);

  return (
    <header className="fixed top-0 left-0 right-0 bg-green-700 text-white z-40 safe-top">
      <div className="flex items-center justify-between px-4 h-14">
        <h1 className="font-bold text-lg">{TITLES[activeTab] ?? 'CropManager'}</h1>
        <div className="flex items-center gap-3">
          {!isOnline && <CloudOff className="w-4 h-4 text-orange-300" />}
          {pendingCount > 0 && (
            <button 
              onClick={() => syncNow()}
              disabled={isSyncing || !isOnline}
              className="flex items-center gap-1.5 bg-green-800/50 hover:bg-green-600 px-2 py-1 rounded-full text-[10px] font-medium transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              {pendingCount} pending
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
