import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAppStore } from '../store/useAppStore';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { SyncPanel } from '../components/settings/SyncPanel';
import { DataManagement } from '../components/settings/DataManagement';
import type { AppSettings } from '../types';

export function SettingsScreen() {
  const { settings, updateSettings } = useAppStore();
  const { isInstallable, isInstalled, handleInstallClick } = usePWAInstall();
  
  // Auto-fill empty GAS config from environment if currently empty
  const initialLocal = { ...settings };
  if (!initialLocal.spreadsheetId) initialLocal.spreadsheetId = import.meta.env.VITE_SPREADSHEET_ID || '';
  if (!initialLocal.gasWebAppUrl) initialLocal.gasWebAppUrl = import.meta.env.VITE_GAS_URL || '';
  if (!initialLocal.syncToken) initialLocal.syncToken = import.meta.env.VITE_SYNC_TOKEN || '';

  const [local, setLocal] = useState<AppSettings>(initialLocal);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    updateSettings(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const field = (key: keyof AppSettings, label: string, type = 'text', placeholder = '') => (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      <Input
        type={type}
        value={String((local as any)[key] ?? '')}
        placeholder={placeholder}
        onChange={e => setLocal(l => ({ ...l, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
      />
    </div>
  );

  return (
    <div className="pb-24 pt-2 px-4 space-y-4">
      <SyncPanel />

      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-green-800">GAS Sync Configuration</h3>
          <button 
            onClick={() => setLocal(l => ({ 
              ...l, 
              spreadsheetId: import.meta.env.VITE_SPREADSHEET_ID || '',
              gasWebAppUrl: import.meta.env.VITE_GAS_URL || '',
              syncToken: import.meta.env.VITE_SYNC_TOKEN || ''
            }))}
            className="text-[10px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-200"
          >
            Load from Env
          </button>
        </div>
        {field('spreadsheetId', 'Google Spreadsheet ID', 'text', '1jA1Fpw27...')}
        {field('gasWebAppUrl', 'GAS Web App URL', 'url', 'https://script.google.com/...')}
        {field('syncToken', 'Sync Token', 'password', 'Your SYNC_TOKEN')}
        {field('telegramChatId', 'Telegram Chat ID')}
      </div>

      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-semibold">Weather</h3>
        {field('weatherLat', 'Latitude', 'number')}
        {field('weatherLon', 'Longitude', 'number')}
        {field('weatherLocation', 'Location Name')}
        {field('rainThresholdMm', 'Rain Threshold (mm)', 'number')}
      </div>

      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-semibold">Learning & Sync</h3>
        {field('learningThreshold', 'Learning Threshold (samples)', 'number')}
        {field('monthsOfPlantingDates', 'Months of Planting Dates', 'number')}
        {field('autoSyncHour', 'Auto-sync Hour (0-23)', 'number')}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Auto-sync Enabled</label>
          <button
            onClick={() => setLocal(l => ({ ...l, syncEnabled: !l.syncEnabled }))}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border ${local.syncEnabled ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-100 text-gray-600 border-gray-300'}`}
          >
            {local.syncEnabled ? '✅ Enabled' : 'Disabled'}
          </button>
        </div>
      </div>

      <Button className="w-full bg-green-700" onClick={handleSave}>
        {saved ? '✅ Saved!' : 'Save Settings'}
      </Button>

      <DataManagement />

      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-semibold text-green-800">App Status</h3>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Installation</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${isInstalled ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
            {isInstalled ? '✅ Installed' : 'Not Installed'}
          </span>
        </div>
        {!isInstalled && isInstallable && (
          <Button
            onClick={handleInstallClick}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
          >
            Install CropManager
          </Button>
        )}
        {!isInstalled && !isInstallable && (
          <p className="text-[10px] text-muted-foreground text-center">
            To install, use your browser's "Add to Home Screen" option.
          </p>
        )}
      </div>

      <div className="bg-gray-50 rounded-xl border p-4 text-xs text-muted-foreground">
        <p className="font-medium mb-1">About</p>
        <p>CropManager PWA v1.0</p>
        <p>Mirrors CropManager v9.13 GAS Bot</p>
        <p>Saint Ann's Bay, Jamaica 🇯🇲</p>
      </div>
    </div>
  );
}
