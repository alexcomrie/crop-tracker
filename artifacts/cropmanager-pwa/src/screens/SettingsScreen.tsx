import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAppStore } from '../store/useAppStore';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { DataManagement } from '../components/settings/DataManagement';
import type { AppSettings } from '../types';
import { CloudRain, Save, Check, Smartphone, Download, Info } from 'lucide-react';

export function SettingsScreen() {
  const { settings, updateSettings } = useAppStore();
  const { isInstallable, isInstalled, handleInstallClick } = usePWAInstall();
  
  const [local, setLocal] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);

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

      {/* Weather */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <CloudRain className="w-4 h-4 text-green-700" />
          <h3 className="font-semibold text-sm">Weather</h3>
        </div>
        {field('weatherLocation', 'Location Name', 'text', "Saint Ann's Bay")}
        <div className="grid grid-cols-2 gap-3">
          {field('weatherLat', 'Latitude', 'number', '18.4358')}
          {field('weatherLon', 'Longitude', 'number', '-77.2010')}
        </div>
        {field('rainThresholdMm', 'Rain Threshold (mm)', 'number', '5', 'Spraying is not recommended when rain exceeds this amount')}
      </div>

      {/* Data Management */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Download className="w-4 h-4 text-green-700" />
          <h3 className="font-semibold text-sm">Data Management</h3>
        </div>
        <DataManagement />
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

      {/* About */}
      <div className="bg-white rounded-xl border p-4 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Info className="w-4 h-4 text-green-700" />
          <h3 className="font-semibold text-sm">About</h3>
        </div>
        <p className="text-xs text-muted-foreground">CropManager — Farm Management Suite</p>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Alexandre Comrie. All rights reserved.</p>
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
