import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { UserRound, Copy, Check, Save, MapPin, Phone, Home, Sprout, Wheat, Eye, ShieldCheck } from 'lucide-react';
import db from '../db/db';
import { useAppStore } from '../store/useAppStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  NAME_CHANGE_LIMIT,
  NAME_CHANGE_WINDOW_DAYS,
  canChangeName,
  changesInWindow,
  ensureFarmerId,
  farmerDisplayName,
  formatWait,
  nameChangeAvailableIn,
  recordNameChange,
  remainingNameChanges,
} from '../lib/farmer';

export function FarmerInfoScreen() {
  const { settings, updateSettings } = useAppStore();

  const crops = useLiveQuery(() => db.crops.toArray(), []) ?? [];
  const harvests = useLiveQuery(() => db.harvestLogs.toArray(), []) ?? [];
  const observations = useLiveQuery(() => db.observationLogs.toArray(), []) ?? [];

  const farmerId = ensureFarmerId(settings);
  const [name, setName] = useState(settings.farmerName ?? '');
  const [farmName, setFarmName] = useState(settings.farmName ?? '');
  const [location, setLocation] = useState(settings.farmLocation ?? '');
  const [phone, setPhone] = useState(settings.farmerPhone ?? '');
  const [notes, setNotes] = useState(settings.farmerNotes ?? '');
  const [copied, setCopied] = useState(false);
  const [savingFarm, setSavingFarm] = useState(false);

  const remaining = remainingNameChanges(settings);
  const used = changesInWindow(settings).length;
  const waitMs = nameChangeAvailableIn(settings);

  const stats = useMemo(() => {
    const active = crops.filter(c => c.status !== 'Archived').length;
    const archived = crops.filter(c => c.status === 'Archived').length;
    return { active, archived, harvests: harvests.length, observations: observations.length };
  }, [crops, harvests, observations]);

  // Persist the generated ID once so it never changes again.
  React.useEffect(() => {
    if (settings.farmerId !== farmerId) updateSettings({ farmerId });
  }, [farmerId, settings.farmerId, updateSettings]);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(farmerId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the ID. Long-press it to copy manually.');
    }
  }

  function saveName() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Enter your name first.');
      return;
    }

    // The very first name is free — only later renames count against the limit.
    if (!settings.farmerName?.trim()) {
      updateSettings({ farmerName: trimmed, farmerId });
      toast.success('Name saved.');
      return;
    }

    if (!canChangeName(settings)) {
      toast.error(`Name changes are limited to ${NAME_CHANGE_LIMIT} every ${NAME_CHANGE_WINDOW_DAYS} days. You can change it again ${formatWait(waitMs)}.`);
      return;
    }
    const patch = recordNameChange(settings, trimmed);
    if (!patch) {
      toast.error(`That name change is not allowed right now. Next change ${formatWait(waitMs)}.`);
      return;
    }
    if (Object.keys(patch).length === 0) {
      toast.info('That is already your name.');
      return;
    }
    updateSettings({ ...patch, farmerId });
    toast.success(`Name updated. ${Math.max(0, remaining - 1)} change${remaining - 1 === 1 ? '' : 's'} left this month.`);
  }

  function isFirstWording(): boolean {
    return !settings.farmerName?.trim();
  }

  function saveFarm() {
    setSavingFarm(true);
    try {
      updateSettings({
        farmName: farmName.trim(),
        farmLocation: location.trim(),
        farmerPhone: phone.trim(),
        farmerNotes: notes.trim(),
        farmerSetupDone: true,
      });
      toast.success('Farm details saved.');
    } finally {
      setSavingFarm(false);
    }
  }

  function skipPrompt() {
    updateSettings({ farmerSetupDone: true, farmerId });
    toast.info('You can add your details anytime from the Farmer Profile page.');
  }

  const initial = farmerDisplayName(settings).trim().charAt(0).toUpperCase() || 'F';

  return (
    <div className="min-h-screen bg-gray-50 pb-24 pt-2 px-4 max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Farmer Profile</h1>

      {/* Identity card */}
      <div className="bg-gradient-to-br from-green-700 to-emerald-800 rounded-2xl p-4 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-xl font-bold shrink-0">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest text-green-100 font-bold">Farmer</p>
            <p className="text-lg font-bold leading-tight truncate">{farmerDisplayName(settings)}</p>
            {settings.farmName && <p className="text-[11px] text-green-100 truncate">{settings.farmName}</p>}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2">
          <ShieldCheck className="w-4 h-4 text-green-200 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] uppercase tracking-widest text-green-200 font-bold">Permanent farmer ID</p>
            <p className="font-mono text-[13px] font-semibold truncate">{farmerId}</p>
          </div>
          <button
            onClick={() => void copyId()}
            className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0"
            aria-label="Copy farmer ID"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] text-green-100/90 mt-2 leading-tight">
          This ID is created on this device and never changes, even if you rename yourself. Keep it for support, community posts and farm records.
        </p>
      </div>

      {/* Name */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <UserRound className="w-4 h-4 text-green-700" />
          <h3 className="font-semibold text-sm">{isFirstWording() ? 'Your name' : 'Change your name'}</h3>
          {!isFirstWording() && (
            <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold ${remaining > 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {remaining} of {NAME_CHANGE_LIMIT} left
            </span>
          )}
        </div>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Alex Comrie"
          maxLength={60}
          className="h-10"
        />
        <Button className="w-full h-10 text-xs gap-2" onClick={saveName} disabled={!name.trim()}>
          <Save className="w-4 h-4" />
          {isFirstWording() ? 'Save name' : 'Update name'}
        </Button>
        <p className="text-[10px] text-muted-foreground leading-tight italic">
          {isFirstWording()
            ? 'Your first name is free. After that, names can be changed twice in any 30-day period to keep farm records consistent.'
            : used >= NAME_CHANGE_LIMIT
              ? `You have used both name changes for this 30-day window. The next change unlocks ${formatWait(waitMs)}.`
              : `You can change your name ${remaining} more time${remaining === 1 ? '' : 's'} in the next ${NAME_CHANGE_WINDOW_DAYS} days. The farmer ID stays the same.`}
        </p>
      </div>

      {/* Farm details */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Home className="w-4 h-4 text-green-700" />
          <h3 className="font-semibold text-sm">Farm details</h3>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground block">Farm name</label>
          <Input value={farmName} onChange={e => setFarmName(e.target.value)} placeholder="e.g. Comrie Family Farm" className="h-10" maxLength={80} />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Location</label>
          <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Parish, town or address" className="h-10" maxLength={120} />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> Contact number (optional)</label>
          <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 876 …" inputMode="tel" className="h-10" maxLength={40} />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground block">About your farm (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Main crops, growing style, anything worth remembering…"
            className="w-full border rounded-lg p-2 text-sm"
          />
        </div>

        <Button className="w-full h-10 text-xs gap-2" onClick={saveFarm} disabled={savingFarm}>
          <Save className="w-4 h-4" /> {savingFarm ? 'Saving…' : 'Save farm details'}
        </Button>
        {!settings.farmerSetupDone && (
          <button onClick={skipPrompt} className="w-full text-[11px] text-muted-foreground font-semibold">
            Skip for now
          </button>
        )}
      </div>

      {/* Farm stats */}
      <div className="bg-white rounded-xl border p-4 space-y-2">
        <h3 className="font-semibold text-sm">Your records</h3>
        <div className="grid grid-cols-2 gap-2">
          <Stat icon={<Sprout className="w-3.5 h-3.5 text-green-700" />} label="Active crops" value={stats.active} />
          <Stat icon={<Sprout className="w-3.5 h-3.5 text-gray-400" />} label="Archived crops" value={stats.archived} />
          <Stat icon={<Wheat className="w-3.5 h-3.5 text-amber-600" />} label="Harvests logged" value={stats.harvests} />
          <Stat icon={<Eye className="w-3.5 h-3.5 text-teal-600" />} label="Field observations" value={stats.observations} />
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground text-center leading-tight">
        Profile details are stored on this device with the rest of your farm data. They are included in backups you export from Settings.
      </p>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-gray-50 rounded-lg px-2.5 py-2">
      <p className="text-[9px] text-gray-400 uppercase font-bold flex items-center gap-1">{icon} {label}</p>
      <p className="text-lg font-bold text-gray-800 leading-tight">{value}</p>
    </div>
  );
}
