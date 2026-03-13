import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAppStore } from '../store/useAppStore';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { DataManagement } from '../components/settings/DataManagement';
import type { AppSettings } from '../types';
import { 
  DownloadCloud, 
  Info, 
  ChevronDown, 
  ChevronUp, 
  MessageCircle, 
  CloudRain, 
  Save, 
  Check,
  Smartphone
} from 'lucide-react';

export function SettingsScreen() {
  const { settings, updateSettings } = useAppStore();
  const { isInstallable, isInstalled, handleInstallClick } = usePWAInstall();
  
  const [local, setLocal] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [sheetsExpanded, setSheetsExpanded] = useState(false);

  function handleSave() {
    updateSettings(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const field = (key: keyof AppSettings, label: string, type = 'text', placeholder = '', hint = '') => (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground block">{label}</label>
      <Input
        type={type}
        value={String((local as any)[key] ?? '')}
        placeholder={placeholder}
        onChange={e => setLocal(l => ({ ...l, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
        className="h-10"
      />
      {hint && <p className="text-[10px] text-muted-foreground leading-tight italic">{hint}</p>}
    </div>
  );

  return (
    <div className="pb-24 pt-2 px-4 space-y-4 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Settings</h1>

      {/* Google Sheets Import */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <DownloadCloud className="w-4 h-4 text-green-700" />
          <h3 className="font-semibold text-sm">Google Sheets Import</h3>
        </div>

        <div className="flex items-start gap-2 bg-gray-50 rounded-lg p-3 border border-gray-100">
          <Info className="w-3.5 h-3.5 text-gray-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-gray-600 leading-normal">
            Publish each sheet tab via <span className="font-medium">File › Share › Publish to web</span>, 
            choose CSV format, and paste the URL below. Leave blank to skip that table.
          </p>
        </div>

        {field('cropsSheetUrl', 'Crops Sheet URL', 'text', 'https://docs.google.com/spreadsheets/d/e/.../pub?output=csv')}

        <button 
          onClick={() => setSheetsExpanded(!sheetsExpanded)}
          className="flex items-center gap-1.5 text-xs font-medium text-green-700 py-1"
        >
          {sheetsExpanded ? 'Hide additional sheets' : 'Show additional sheet URLs'}
          {sheetsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {sheetsExpanded && (
          <div className="space-y-3 pt-1">
            {field('propagationsSheetUrl', 'Propagations Sheet URL', 'text', '...pub?output=csv&gid=...')}
            {field('remindersSheetUrl', 'Reminders Sheet URL', 'text', '...pub?output=csv&gid=...')}
            {field('stageLogsSheetUrl', 'Stage Logs Sheet URL', 'text', '...pub?output=csv&gid=...')}
            {field('harvestLogsSheetUrl', 'Harvest Logs Sheet URL', 'text', '...pub?output=csv&gid=...')}
            {field('treatmentLogsSheetUrl', 'Treatment Logs Sheet URL', 'text', '...pub?output=csv&gid=...')}
            {field('cropDbAdjustmentSheetUrl', 'Crop Adjustments Sheet URL', 'text', '...pub?output=csv&gid=...')}
            {field('propDbAdjustmentSheetUrl', 'Prop Adjustments Sheet URL', 'text', '...pub?output=csv&gid=...')}
            {field('batchPlantingLogSheetUrl', 'Batch Planting Sheet URL', 'text', '...pub?output=csv&gid=...')}
            {field('cropSearchLogSheetUrl', 'Crop Search Sheet URL', 'text', '...pub?output=csv&gid=...')}
          </div>
        )}

        <DataManagement />
      </div>

      {/* Telegram */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle className="w-4 h-4 text-green-700" />
          <h3 className="font-semibold text-sm">Telegram Notifications</h3>
        </div>
        {field('telegramToken', 'Bot Token', 'password', '8785143281:AAE...')}
        {field('telegramChatId', 'Chat ID', 'text', '5837914244')}
      </div>

      {/* Weather */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <CloudRain className="w-4 h-4 text-green-700" />
          <h3 className="font-semibold text-sm">Weather</h3>
        </div>
        {field('weatherLocation', 'Location Name', 'text', 'Saint Ann\'s Bay')}
        <div className="grid grid-cols-2 gap-3">
          {field('weatherLat', 'Latitude', 'number', '18.4358')}
          {field('weatherLon', 'Longitude', 'number', '-77.2010')}
        </div>
        {field('rainThresholdMm', 'Rain Threshold (mm)', 'number', '5', 'Spraying is not recommended when rain exceeds this amount')}
      </div>

      {/* App Status & Installation */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Smartphone className="w-4 h-4 text-green-700" />
          <h3 className="font-semibold text-sm">App Status</h3>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Installation</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${isInstalled ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
            {isInstalled ? 'Installed' : 'Not Installed'}
          </span>
        </div>
        {!isInstalled && isInstallable && (
          <Button variant="outline" className="w-full h-10 text-xs gap-2" onClick={handleInstallClick}>
            <Smartphone className="w-4 h-4" />
            Install CropManager
          </Button>
        )}
      </div>

      {/* Learning & Sync */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <h3 className="font-semibold text-sm">Learning & Sync</h3>
        <div className="grid grid-cols-2 gap-3">
          {field('learningThreshold', 'Learning (samples)', 'number')}
          {field('monthsOfPlantingDates', 'Months (history)', 'number')}
        </div>
        {field('autoSyncHour', 'Auto-sync Hour (0-23)', 'number')}
        <div className="flex items-center justify-between pt-1">
          <label className="text-xs font-medium text-muted-foreground block">Auto-sync Enabled</label>
          <button
            onClick={() => setLocal(l => ({ ...l, syncEnabled: !l.syncEnabled }))}
            className={`px-4 py-1.5 rounded-full text-[10px] font-bold border transition-colors ${local.syncEnabled ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-100 text-gray-600 border-gray-300'}`}
          >
            {local.syncEnabled ? '✅ ENABLED' : 'DISABLED'}
          </button>
        </div>
      </div>

      <Button 
        className={`w-full h-12 gap-2 text-sm font-bold shadow-md transition-all ${saved ? 'bg-green-600' : 'bg-green-700 hover:bg-green-800'}`} 
        onClick={handleSave}
      >
        {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saved ? 'SAVED!' : 'SAVE SETTINGS'}
      </Button>
    </div>
  );
}
