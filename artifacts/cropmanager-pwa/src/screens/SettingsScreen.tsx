import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAppStore } from '../store/useAppStore';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { DataManagement } from '../components/settings/DataManagement';
import type { AppSettings } from '../types';
import { CloudRain, Save, Check, Smartphone, Download, Info, Share2, Bell, Wallet, MapPin, Loader2, UserRound, Eraser } from 'lucide-react';
import { REM_TYPES } from '../components/reminders/ReminderForm';
import { notifyPermission, requestNotifyPermission, playTone } from '../lib/notify';
import { clearAllDueNotifications } from '../lib/reminderNotifications';
import { resolveCurrentLocation } from '../lib/location';
import type { ReminderTone } from '../types';

export function SettingsScreen() {
  const { settings, updateSettings } = useAppStore();
  const { isInstallable, isInstalled, handleInstallClick, platform, steps } = usePWAInstall();
  const navigate = useNavigate();

  const [local, setLocal] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [perm, setPerm] = useState(() => notifyPermission());
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState('');
  const [notifMsg, setNotifMsg] = useState('');
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [installNote, setInstallNote] = useState('');

  async function handleUseMyLocation() {
    setLocating(true);
    setLocMsg('');
    try {
      const loc = await resolveCurrentLocation();
      const patch = {
        weatherLat: loc.lat,
        weatherLon: loc.lon,
        weatherLocation: loc.name,
      };
      setLocal(l => ({ ...l, ...patch }));
      // Save immediately so the dashboard forecast refreshes for the new spot.
      updateSettings(patch);
      setLocMsg(`Located: ${loc.name}${loc.accuracy ? ` (±${loc.accuracy} m)` : ''}`);
    } catch (e) {
      setLocMsg(e instanceof Error ? e.message : 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  }

  async function handleInstall() {
    const result = await handleInstallClick();
    if (result === 'unavailable') {
      setInstallNote(
        platform === 'ios'
          ? 'Safari does not show an automatic install prompt. Follow the steps below.'
          : 'Your browser did not offer an automatic prompt. Follow the steps below.',
      );
      setShowInstallHelp(true);
    } else if (result === 'accepted') {
      setInstallNote('Installing… CropManager will appear on your home screen.');
    }
  }

  async function handleEnableNotifications() {
    const p = await requestNotifyPermission();
    setPerm(p);
  }

  async function handleClearNotifications() {
    if (!window.confirm('Clear all past-due notifications? They will be marked done and will not return.')) return;
    try {
      const count = await clearAllDueNotifications();
      setNotifMsg(count > 0 ? `Cleared ${count} past-due notification${count === 1 ? '' : 's'}` : 'No past-due notifications to clear');
    } catch (e) {
      setNotifMsg('Could not clear notifications: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  // Reminder prefs apply + persist instantly (no SAVE needed) so the
  // notifier picks them up on its next sweep.
  const setRem = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setLocal(l => ({ ...l, [key]: value }));
    updateSettings({ [key]: value } as Partial<AppSettings>);
  };

  const toggleKind = (id: string) => {
    const next = { ...(local.reminderKinds ?? {}), [id]: !((local.reminderKinds ?? {})[id] ?? true) };
    setLocal(l => ({ ...l, reminderKinds: next }));
    updateSettings({ reminderKinds: next });
  };

  const switchCls = (on: boolean) =>
    `w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-green-600' : 'bg-gray-300'}`;
  const [shareMsg, setShareMsg] = useState('');

  function appLink(): string {
    const base = (import.meta.env.BASE_URL as string | undefined) || '/';
    const root = window.location.origin + (base.endsWith('/') ? base : `${base}/`);
    return root;
  }

  async function handleShare() {
    const url = appLink();
    const data = { title: 'CropManager', text: 'Track your crops with CropManager:', url };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      throw new Error('no-share');
    } catch (e) {
      // User dismissed the sheet — not an error. Fall back to clipboard otherwise.
      if (e instanceof Error && e.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(url);
        setShareMsg('Link copied — paste it anywhere to share');
      } catch {
        setShareMsg(url);
      }
      setTimeout(() => setShareMsg(''), 4000);
    }
  }

  // Keep the editable copy in sync if settings change elsewhere
  useEffect(() => { setLocal(settings); }, [settings]);

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
        onChange={e => setLocal(l => {
          if (type !== 'number') return { ...l, [key]: e.target.value };
          // Empty input clears to previous saved value instead of storing NaN
          if (e.target.value === '') return l;
          const n = Number(e.target.value);
          return { ...l, [key]: Number.isNaN(n) ? l[key] : n };
        })}
        className="h-10"
      />
      {hint && <p className="text-[10px] text-muted-foreground leading-tight italic">{hint}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24 pt-2 px-4 space-y-4 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Settings</h1>

      {/* Farmer profile */}
      <button
        onClick={() => navigate('/farmer')}
        className="w-full bg-white rounded-xl border p-4 flex items-center gap-3 text-left hover:border-green-300 active:scale-[0.99] transition"
      >
        <div className="w-10 h-10 rounded-full bg-green-50 border flex items-center justify-center shrink-0">
          <UserRound className="w-5 h-5 text-green-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Farmer Profile</p>
          <p className="text-[10px] text-muted-foreground leading-tight truncate">
            {settings.farmerName ? `${settings.farmerName} · ${settings.farmerId}` : 'Add your name, farm details and permanent farmer ID'}
          </p>
        </div>
        <span className="text-gray-400">›</span>
      </button>
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
        <Button
          variant="outline"
          className="w-full h-10 text-xs gap-2"
          onClick={handleUseMyLocation}
          disabled={locating}
        >
          {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
          {locating ? 'Getting GPS location…' : 'Use My Current Location'}
        </Button>
        <p className="text-[10px] text-muted-foreground leading-tight italic">
          GPS fills the coordinates above and saves them right away, so the dashboard forecast follows you. If location is blocked or unavailable, type coordinates manually.
        </p>
        {locMsg && (
          <p className={`text-[11px] font-medium leading-tight ${locMsg.startsWith('Located:') ? 'text-green-700' : 'text-amber-700'}`}>
            {locMsg}
          </p>
        )}
        {field('rainThresholdMm', 'Rain Threshold (mm)', 'number', '5', 'Spraying is not recommended when rain exceeds this amount')}
      </div>

      {/* Reminders */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Bell className="w-4 h-4 text-green-700" />
          <h3 className="font-semibold text-sm">Reminders</h3>
          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold ${perm === 'granted' ? 'bg-green-100 text-green-700' : perm === 'denied' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
            {perm === 'granted' ? 'Notifications on' : perm === 'denied' ? 'Blocked' : perm === 'unsupported' ? 'Not supported' : 'Off'}
          </span>
        </div>
        {perm !== 'granted' && perm !== 'unsupported' && (
          <Button variant="outline" className="w-full h-10 text-xs gap-2" onClick={handleEnableNotifications}>
            <Bell className="w-4 h-4" />
            Enable Device Notifications
          </Button>
        )}
        <p className="text-[10px] text-muted-foreground leading-tight italic">Due reminders pop up as system notifications (app icon in the status bar) while the browser or installed app is running, plus an icon badge with the due count. Changes here save instantly.</p>
        {([
          ['remindersEnabled', 'Reminder alerts'],
          ['reminderSound', 'Sound'],
          ['reminderVibrate', 'Vibrate'],
          ['reminderBadge', 'App icon badge'],
        ] as const).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-xs font-medium">{label}</span>
            <button onClick={() => setRem(key, !((local as any)[key] ?? true))} className={switchCls(!!((local as any)[key] ?? true))} aria-label={label}>
              <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${((local as any)[key] ?? true) ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
            </button>
          </div>
        ))}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium">Tone</span>
          <span className="flex items-center gap-2">
            <select value={local.reminderTone ?? 'chime'}
              onChange={e => setRem('reminderTone', e.target.value as ReminderTone)}
              className="border rounded-lg p-1.5 text-xs bg-white">
              <option value="chime">Chime</option>
              <option value="double">Double</option>
              <option value="low">Low</option>
            </select>
            <button onClick={() => playTone(local.reminderTone ?? 'chime')} className="text-xs font-semibold text-green-700 bg-green-50 rounded-lg px-2 py-1.5">Test</button>
          </span>
        </div>
        <Button variant="outline" className="w-full h-9 text-xs gap-2 text-amber-700 border-amber-200 bg-amber-50" onClick={() => void handleClearNotifications()}>
          <Eraser className="w-4 h-4" />
          Clear past-due notifications
        </Button>
        {notifMsg && <p className="text-[10px] text-amber-700 font-medium leading-tight">{notifMsg}</p>}
        <div className="pt-1">
          <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">Show these on device</p>
          <div className="grid grid-cols-2 gap-1.5">
            {REM_TYPES.map(t => {
              const on = (local.reminderKinds ?? {})[t.id] ?? true;
              return (
                <button key={t.id} onClick={() => toggleKind(t.id)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs border font-medium ${on ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-gray-200 text-gray-400'}`}>
                  <span>{t.icon}</span><span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dashboard */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Wallet className="w-4 h-4 text-green-700" />
          <h3 className="font-semibold text-sm">Dashboard</h3>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-medium">Repayment balances</span>
            <p className="text-[10px] text-muted-foreground leading-tight italic">
              Show outstanding debt/loan balances and the next due date on the dashboard.
            </p>
          </div>
          <button
            onClick={() => setRem('showRepaymentOnDashboard', !(local.showRepaymentOnDashboard ?? true))}
            className={switchCls(local.showRepaymentOnDashboard ?? true)}
            aria-label="Show repayment balances on dashboard"
          >
            <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${(local.showRepaymentOnDashboard ?? true) ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
          </button>
        </div>
      </div>

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
        {!isInstalled && (
          <>
            <Button variant="outline" className="w-full h-10 text-xs gap-2" onClick={handleInstall}>
              <Smartphone className="w-4 h-4" />
              {isInstallable ? 'Install CropManager' : 'How to Install CropManager'}
            </Button>
            {installNote && <p className="text-[11px] text-amber-700 font-medium leading-tight">{installNote}</p>}
            <button
              onClick={() => setShowInstallHelp(v => !v)}
              className="w-full text-[11px] text-green-700 font-semibold text-center"
            >
              {showInstallHelp ? 'Hide installation steps' : isInstallable ? 'Trouble installing? Show steps' : 'Show installation steps'}
            </button>
            {showInstallHelp && (
              <ol className="space-y-2 rounded-lg bg-gray-50 border p-3">
                {steps.map((step, i) => (
                  <li key={step.title} className="flex gap-2">
                    <span className="w-5 h-5 shrink-0 rounded-full bg-green-700 text-white text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold">{step.title}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
        {isInstalled && (
          <p className="text-[11px] text-green-700 font-medium">
            CropManager is running as an installed app.
          </p>
        )}
      </div>

      {/* Share */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Share2 className="w-4 h-4 text-green-700" />
          <h3 className="font-semibold text-sm">Share CropManager</h3>
        </div>
        <p className="text-xs text-muted-foreground">Send the web app link to another phone or device — it opens straight in the browser, no install needed.</p>
        <Button variant="outline" className="w-full h-10 text-xs gap-2" onClick={handleShare}>
          <Share2 className="w-4 h-4" />
          Share App Link
        </Button>
        {shareMsg && <p className="text-xs text-center text-green-700 font-medium break-all">{shareMsg}</p>}
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
