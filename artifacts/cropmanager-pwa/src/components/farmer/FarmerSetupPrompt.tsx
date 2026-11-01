import React, { useState } from 'react';
import { Sprout, ShieldCheck, ArrowRight } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ensureFarmerId } from '../../lib/farmer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * First-start name prompt. Shown once per install until the farmer either
 * saves a name or explicitly skips. The permanent farmer ID is generated
 * here so it exists even when the name is skipped.
 */
export function FarmerSetupPrompt() {
  const { settings, updateSettings } = useAppStore();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  if (settings.farmerSetupDone) return null;

  const farmerId = ensureFarmerId(settings);

  function finish(withName: boolean) {
    setBusy(true);
    updateSettings({
      farmerId,
      farmerSetupDone: true,
      ...(withName && name.trim() ? { farmerName: name.trim() } : {}),
    });
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-br from-green-700 to-emerald-800 px-5 pt-6 pb-5 text-white">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-3">
            <Sprout className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold leading-tight">Welcome to CropManager</h2>
          <p className="text-[12px] text-green-100 mt-1 leading-snug">
            What should we call you? Your name appears on your farmer profile and community posts.
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground block">Your name</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Alex Comrie"
              maxLength={60}
              autoFocus
              className="h-11"
              onKeyDown={e => { if (e.key === 'Enter' && name.trim()) finish(true); }}
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-100 px-3 py-2">
            <ShieldCheck className="w-4 h-4 text-green-700 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-green-800">Your farmer ID</p>
              <p className="font-mono text-[12px] font-semibold text-green-900">{farmerId}</p>
              <p className="text-[10px] text-green-700 leading-tight mt-0.5">
                Created on this device. It never changes and is not shared anywhere.
              </p>
            </div>
          </div>

          <Button className="w-full h-11 gap-2" onClick={() => finish(true)} disabled={!name.trim() || busy}>
            Start farming <ArrowRight className="w-4 h-4" />
          </Button>
          <button
            onClick={() => finish(false)}
            disabled={busy}
            className="w-full text-[11px] text-muted-foreground font-semibold py-1"
          >
            Skip for now — I’ll add my details later
          </button>
        </div>
      </div>
    </div>
  );
}
