import React, { useEffect, useState } from 'react';
import { ChevronLeft, BarChart2 } from 'lucide-react';
import db from '../../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Crop, StageLog } from '../../types';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAppStore } from '../../store/useAppStore';
import { resolveCropData } from '../../lib/cropDb';

type AvgRow = {
  cropName: string;
  samples: number;
  seedToGerm: number | null;
  germToTransplant: number | null;
  transplantToHarvest: number | null;
  devSeedToGerm: number | null;
  devGermToTransplant: number | null;
  devTransplantToHarvest: number | null;
};

export function CropHistoryScreen({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<AvgRow[]>([]);
  const [query, setQuery] = useState('');
  const { cropDb } = useAppStore();

  useEffect(() => {
    (async () => {
      const [allCrops, allLogs] = await Promise.all([
        db.crops.toArray(),
        db.stageLogs.toArray()
      ]);

      // Build per-tracking durations from stage logs
      const byTracking: Record<string, { cropName: string; g?: number; t?: number; h?: number }> = {};
      for (const log of allLogs) {
        const entry = byTracking[log.trackingId] ?? { cropName: log.cropName };
        if (log.stageTo === 'Germinated') entry.g = log.daysElapsed;
        if (log.stageTo === 'Transplanted') entry.t = log.daysElapsed;
        if (log.stageTo === 'Harvested') entry.h = log.daysElapsed;
        byTracking[log.trackingId] = entry;
      }

      // Group by crop name, accumulate observed durations and deviations vs DB defaults
      const groups: Record<string, {
        seedToGerm: number[];
        germToTransplant: number[];
        transplantToHarvest: number[];
        devSeedToGerm: number[];
        devGermToTransplant: number[];
        devTransplantToHarvest: number[];
        samples: number;
      }> = {};

      const ensure = (key: string) => {
        if (!groups[key]) {
          groups[key] = {
            seedToGerm: [], germToTransplant: [], transplantToHarvest: [],
            devSeedToGerm: [], devGermToTransplant: [], devTransplantToHarvest: [],
            samples: 0
          };
        }
        return groups[key];
      };

      for (const c of allCrops) {
        const track = byTracking[c.id];
        const key = c.cropName.toLowerCase();
        const bucket = ensure(key);
        const defaults = (() => {
          const cd = resolveCropData(cropDb, key);
          if (!cd) return { g: null as number | null, gt: null as number | null, th: null as number | null };
          const g = Math.round(((cd.germination_days_min ?? 0) + (cd.germination_days_max ?? 0)) / 2) || null;
          const gt = cd.transplant_days ?? null;
          let th: number | null = cd.growing_from_transplant ?? null;
          if (th == null && cd.growing_time_days != null && cd.transplant_days != null) {
            th = cd.growing_time_days - cd.transplant_days;
          }
          return { g, gt, th };
        })();

        // Compute observed durations from stage logs if present
        const gDays = track?.g;
        const tDays = track?.t;
        const hDays = track?.h;
        if (typeof gDays === 'number') {
          bucket.seedToGerm.push(gDays);
          if (defaults.g != null) bucket.devSeedToGerm.push(gDays - defaults.g);
        }
        if (typeof tDays === 'number' && typeof gDays === 'number') {
          const gtDays = tDays - gDays;
          bucket.germToTransplant.push(gtDays);
          if (defaults.gt != null) bucket.devGermToTransplant.push(gtDays - defaults.gt);
        }
        if (typeof hDays === 'number' && typeof tDays === 'number') {
          const thDays = hDays - tDays;
          bucket.transplantToHarvest.push(thDays);
          if (defaults.th != null) bucket.devTransplantToHarvest.push(thDays - defaults.th);
        }
        bucket.samples += 1;
      }

      const out: AvgRow[] = Object.entries(groups).map(([key, data]) => {
        const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
        return {
          cropName: key,
          samples: data.samples,
          seedToGerm: avg(data.seedToGerm),
          germToTransplant: avg(data.germToTransplant),
          transplantToHarvest: avg(data.transplantToHarvest),
          devSeedToGerm: avg(data.devSeedToGerm),
          devGermToTransplant: avg(data.devGermToTransplant),
          devTransplantToHarvest: avg(data.devTransplantToHarvest),
        };
      }).sort((a, b) => a.cropName.localeCompare(b.cropName));
      setRows(out);
    })();
  }, [cropDb]);

  const filtered = rows.filter(r =>
    r.cropName.includes(query.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-white animate-in slide-in-from-right duration-300">
      <header className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="font-bold text-lg flex items-center gap-2"><BarChart2 className="w-5 h-5" /> History & Averages</h2>
        </div>
      </header>
      <div className="p-4 space-y-3 border-b">
        <Input placeholder="Search crops..." value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
            <p className="text-4xl mb-3">📊</p>
            <p className="font-semibold">No history yet</p>
            <p className="text-sm text-muted-foreground">Stage durations will appear as you log crops.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(r => (
              <div key={r.cropName} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold capitalize">{r.cropName.replace(/_/g,' ')}</h3>
                  <Badge variant="secondary" className="bg-gray-50 text-gray-700 border-none text-[10px]">n={r.samples}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="p-3 rounded-lg bg-green-50 border border-green-100">
                    <p className="text-[10px] uppercase text-gray-500">Seed → Germination</p>
                    <p className="font-bold text-green-800">{r.seedToGerm ?? '—'} days</p>
                    {r.devSeedToGerm != null && (
                      <p className={`text-[11px] ${r.devSeedToGerm > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                        Δ {r.devSeedToGerm > 0 ? '+' : ''}{r.devSeedToGerm} vs DB
                      </p>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
                    <p className="text-[10px] uppercase text-gray-500">Germination → Transplant</p>
                    <p className="font-bold text-amber-800">{r.germToTransplant ?? '—'} days</p>
                    {r.devGermToTransplant != null && (
                      <p className={`text-[11px] ${r.devGermToTransplant > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                        Δ {r.devGermToTransplant > 0 ? '+' : ''}{r.devGermToTransplant} vs DB
                      </p>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                    <p className="text-[10px] uppercase text-gray-500">Transplant → Harvest</p>
                    <p className="font-bold text-blue-800">{r.transplantToHarvest ?? '—'} days</p>
                    {r.devTransplantToHarvest != null && (
                      <p className={`text-[11px] ${r.devTransplantToHarvest > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                        Δ {r.devTransplantToHarvest > 0 ? '+' : ''}{r.devTransplantToHarvest} vs DB
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div className="mt-4">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">Tracker Stages</div>
              <TrackerStages />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TrackerStages() {
  const crops = useLiveQuery(() => db.crops.toArray(), []) ?? [];
  const logs = useLiveQuery(() => db.stageLogs.toArray(), []) ?? [];
  const byId = new Map<string, { name: string; entries: { to: string; date: string }[] }>();
  crops.forEach((c: any) => {
    byId.set(c.id, { name: `${c.cropName}${c.variety ? ' ('+c.variety+')' : ''}`, entries: [] });
  });
  logs.forEach((l: any) => {
    const e = byId.get(l.trackingId);
    if (e) e.entries.push({ to: l.stageTo, date: l.date });
  });
  const items = Array.from(byId.entries()).map(([id, v]) => ({ id, ...v, entries: v.entries.sort((a,b) => a.date.localeCompare(b.date)) })).filter(x => x.entries.length > 0);
  if (items.length === 0) return <div className="text-xs text-gray-400 italic p-3">No stage updates recorded yet.</div>;
  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="bg-white border border-gray-100 rounded-lg p-3">
          <div className="text-sm font-semibold mb-1">{item.name}</div>
          <div className="flex flex-wrap gap-2">
            {item.entries.map((e,i) => (
              <span key={i} className="text-[11px] px-2 py-1 rounded bg-gray-50 border border-gray-100">{e.to} · {e.date}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
