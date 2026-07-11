import React, { useState, useMemo } from 'react';
import { ChevronLeft, BarChart2, ChevronDown, ChevronUp, TrendingUp, Calendar, Layers, GitBranch, Beaker, Archive, GripHorizontal, LineChart as LineChartIcon, Activity, ArrowUpDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend, Cell } from 'recharts';
import db from '../../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Crop, StageLog, HarvestLog, CropDbAdjustment } from '../../types';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAppStore } from '../../store/useAppStore';
import { resolveCropData } from '../../lib/cropDb';
import { parseDate } from '../../lib/dates';

const CHART_STYLE = `
@keyframes chartProgressive { from { stroke-dashoffset: 2000; } to { stroke-dashoffset: 0; } }
@keyframes barGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
.chart-line { stroke-dasharray: 2000; animation: chartProgressive 2.5s ease-in-out forwards; }
.chart-bar { animation: barGrow 0.6s ease-out forwards; transform-origin: bottom; }
`;

function avg(arr: number[]) { return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null; }
function minV(arr: number[]) { return arr.length ? Math.min(...arr) : null; }
function maxV(arr: number[]) { return arr.length ? Math.max(...arr) : null; }
function medianV(arr: number[]) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function fmt(n: number | null) { return n != null ? `${n}d` : '—'; }

type SortKey = 'name' | 'samples' | 'success' | 'harvests';

interface GroupData {
  cropName: string;
  samples: number;
  seedToGerm: number[];
  germToTransplant: number[];
  transplantToHarvest: number[];
  seedToGermDev: number[];
  germToTransplantDev: number[];
  transplantToHarvestDev: number[];
  totalReachedGerminated: number;
  totalReachedTransplanted: number;
  totalReachedHarvested: number;
  monthlyPlantings: Record<number, number>;
  individualCrops: { id: string; name: string; variety: string; planted: string; stages: { to: string; date: string; days: number }[] }[];
  varieties: Record<string, { count: number; seedToGerm: number[]; germToTransplant: number[]; transplantToHarvest: number[] }>;
  harvestLogs: HarvestLog[];
  adjustments: CropDbAdjustment[];
  dbDefaults: { g: number | null; gt: number | null; th: number | null };
}

export function CropHistoryScreen({ onClose }: { onClose: () => void }) {
  const { cropDb } = useAppStore();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<SortKey>('name');

  const allCrops = useLiveQuery(() => db.crops.toArray(), []) ?? [];
  const allLogs = useLiveQuery(() => db.stageLogs.toArray(), []) ?? [];
  const allHarvestLogs = useLiveQuery(() => db.harvestLogs.toArray(), []) ?? [];
  const allAdjustments = useLiveQuery(() => db.cropDbAdjustments.toArray(), []) ?? [];

  const groups = useMemo(() => {
    const byTracking: Record<string, { g?: number; t?: number; h?: number }> = {};
    for (const log of allLogs) {
      const e = byTracking[log.trackingId] ?? {};
      if (log.stageTo === 'Germinated') e.g = log.daysElapsed;
      if (log.stageTo === 'Transplanted') e.t = log.daysElapsed;
      if (log.stageTo === 'Harvested') e.h = log.daysElapsed;
      byTracking[log.trackingId] = e;
    }

    const stageByTracking: Record<string, { to: string; date: string; days: number }[]> = {};
    for (const log of allLogs) {
      if (!stageByTracking[log.trackingId]) stageByTracking[log.trackingId] = [];
      stageByTracking[log.trackingId].push({ to: log.stageTo, date: log.date, days: log.daysElapsed });
    }
    for (const key of Object.keys(stageByTracking)) {
      stageByTracking[key].sort((a, b) => a.date.localeCompare(b.date));
    }

    const harvestByCrop: Record<string, HarvestLog[]> = {};
    for (const h of allHarvestLogs) {
      if (!harvestByCrop[h.cropName]) harvestByCrop[h.cropName] = [];
      harvestByCrop[h.cropName].push(h);
    }

    const adjByCrop: Record<string, CropDbAdjustment[]> = {};
    for (const a of allAdjustments) {
      if (!adjByCrop[a.cropKey]) adjByCrop[a.cropKey] = [];
      adjByCrop[a.cropKey].push(a);
    }

    const groups: Record<string, GroupData> = {};

    const ensure = (key: string): GroupData => {
      if (!groups[key]) {
        groups[key] = {
          cropName: key,
          samples: 0,
          seedToGerm: [], germToTransplant: [], transplantToHarvest: [],
          seedToGermDev: [], germToTransplantDev: [], transplantToHarvestDev: [],
          totalReachedGerminated: 0, totalReachedTransplanted: 0, totalReachedHarvested: 0,
          monthlyPlantings: {},
          individualCrops: [],
          varieties: {},
          harvestLogs: [],
          adjustments: [],
          dbDefaults: { g: null, gt: null, th: null },
        };
      }
      return groups[key];
    };

    for (const c of allCrops) {
      const key = c.cropName.toLowerCase();
      const bucket = ensure(key);
      bucket.samples += 1;

      const defaults = (() => {
        const cd = resolveCropData(cropDb, key);
        if (!cd) return { g: null, gt: null, th: null };
        const g = Math.round(((cd.germination_days_min ?? 0) + (cd.germination_days_max ?? 0)) / 2) || null;
        const gt = cd.transplant_days ?? null;
        let th: number | null = cd.growing_from_transplant ?? null;
        if (th == null && cd.growing_time_days != null && cd.transplant_days != null) {
          th = cd.growing_time_days - cd.transplant_days;
        }
        return { g, gt, th };
      })();
      bucket.dbDefaults = defaults;

      const track = byTracking[c.id];
      const gDays = track?.g;
      const tDays = track?.t;
      const hDays = track?.h;

      if (typeof gDays === 'number') {
        bucket.seedToGerm.push(gDays);
        bucket.totalReachedGerminated += 1;
        if (defaults.g != null) bucket.seedToGermDev.push(gDays - defaults.g);
      }
      if (typeof tDays === 'number' && typeof gDays === 'number') {
        const gtDays = tDays - gDays;
        bucket.germToTransplant.push(gtDays);
        bucket.totalReachedTransplanted += 1;
        if (defaults.gt != null) bucket.germToTransplantDev.push(gtDays - defaults.gt);
      }
      if (typeof hDays === 'number' && typeof tDays === 'number') {
        const thDays = hDays - tDays;
        bucket.transplantToHarvest.push(thDays);
        bucket.totalReachedHarvested += 1;
        if (defaults.th != null) bucket.transplantToHarvestDev.push(thDays - defaults.th);
      }

      const planted = parseDate(c.plantingDate);
      if (planted) {
        const month = planted.getMonth() + 1;
        bucket.monthlyPlantings[month] = (bucket.monthlyPlantings[month] || 0) + 1;
      }

      const stages = stageByTracking[c.id] ?? [];
      bucket.individualCrops.push({
        id: c.id,
        name: `${c.cropName}${c.variety ? ` (${c.variety})` : ''}`,
        variety: c.variety,
        planted: c.plantingDate,
        stages,
      });

      const vKey = c.variety || '(default)';
      if (!bucket.varieties[vKey]) {
        bucket.varieties[vKey] = { count: 0, seedToGerm: [], germToTransplant: [], transplantToHarvest: [] };
      }
      const v = bucket.varieties[vKey];
      v.count += 1;
      if (typeof gDays === 'number') v.seedToGerm.push(gDays);
      if (typeof tDays === 'number' && typeof gDays === 'number') v.germToTransplant.push(tDays - gDays);
      if (typeof hDays === 'number' && typeof tDays === 'number') v.transplantToHarvest.push(hDays - tDays);

      bucket.harvestLogs = harvestByCrop[key] ?? [];
      bucket.adjustments = adjByCrop[key] ?? [];
    }

    return Object.entries(groups)
      .map(([, data]) => data)
      .sort((a, b) => a.cropName.localeCompare(b.cropName));
  }, [allCrops, allLogs, allHarvestLogs, allAdjustments, cropDb]);

  const filtered = useMemo(() => {
    let result = groups.filter(r => r.cropName.includes(query.toLowerCase()));
    switch (sortKey) {
      case 'samples':
        result.sort((a, b) => b.samples - a.samples);
        break;
      case 'success': {
        result.sort((a, b) => {
          const aRate = a.samples ? a.totalReachedHarvested / a.samples : 0;
          const bRate = b.samples ? b.totalReachedHarvested / b.samples : 0;
          return bRate - aRate;
        });
        break;
      }
      case 'harvests':
        result.sort((a, b) => (b.harvestLogs?.length ?? 0) - (a.harvestLogs?.length ?? 0));
        break;
      default:
        result.sort((a, b) => a.cropName.localeCompare(b.cropName));
    }
    return result;
  }, [groups, query, sortKey]);

  const toggle = (name: string) => setExpanded(p => ({ ...p, [name]: !p[name] }));

  const allExpanded = Object.values(expanded).every(Boolean);

  return (
    <div className="flex flex-col h-full bg-white animate-in slide-in-from-right duration-300">
      <style>{CHART_STYLE}</style>
      <header className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="font-bold text-lg flex items-center gap-2"><BarChart2 className="w-5 h-5" /> Crop Analysis</h2>
        </div>
      </header>
      <div className="p-4 space-y-2 border-b">
        <Input placeholder="Search crops..." value={query} onChange={e => setQuery(e.target.value)} />
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-3 h-3 text-gray-400" />
          {(['name', 'samples', 'success', 'harvests'] as SortKey[]).map(k => (
            <button key={k} onClick={() => setSortKey(k)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium ${sortKey === k ? 'bg-green-100 text-green-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
              {k === 'name' ? 'Name' : k === 'samples' ? 'Samples' : k === 'success' ? 'Success Rate' : 'Harvests'}
            </button>
          ))}
          <button onClick={() => setExpanded(filtered.reduce((a, g) => ({ ...a, [g.cropName]: !allExpanded }), {}))}
            className="ml-auto px-2 py-0.5 rounded text-[10px] font-medium bg-gray-50 text-gray-500 hover:bg-gray-100">
            {allExpanded ? 'Collapse All' : 'Expand All'}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
            <p className="text-4xl mb-3">📊</p>
            <p className="font-semibold">No data yet</p>
            <p className="text-sm text-muted-foreground">Crop analysis will appear as you log crops.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(r => (
              <CropAnalysisCard key={r.cropName} data={r} expanded={!!expanded[r.cropName]} onToggle={() => toggle(r.cropName)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Crop Analysis Card (collapsible) ────────────────────────────────── */
function CropAnalysisCard({ data, expanded, onToggle }: { data: GroupData; expanded: boolean; onToggle: () => void }) {
  const successRate = data.samples ? Math.round(data.totalReachedHarvested / data.samples * 100) : 0;
  const avgDays = avg(data.transplantToHarvest);
  const harvestCount = data.harvestLogs?.length ?? 0;

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm">
      <button onClick={onToggle} className="w-full p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-bold capitalize">{data.cropName.replace(/_/g, ' ')}</h3>
            <Badge variant="secondary" className="bg-gray-50 text-gray-700 border-none text-[10px]">n={data.samples}</Badge>
          </div>
          {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </div>
        {!expanded && (
          <div className="flex gap-3 mt-2 text-[10px] text-gray-500">
            <span>🌱 {successRate}% success</span>
            {avgDays != null && <span>📅 avg {avgDays}d to harvest</span>}
            {harvestCount > 0 && <span>🏆 {harvestCount} harvests</span>}
          </div>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          <StageDurations data={data} />
          <SuccessFunnel data={data} />
          <SeasonalCalendar data={data} />
          <LifecycleGantt data={data} />
          <DeviationTrend data={data} />
          <VarietyComparison data={data} />
          <YieldAnalysis data={data} />
          <HarvestTimeline data={data} />
          <LearningDashboard data={data} />
        </div>
      )}
    </div>
  );
}

/* ─── 1. Stage Duration Cards ─────────────────────────────────────────── */
function StageDurations({ data }: { data: GroupData }) {
  const cards = [
    { label: 'Seed → Germination', values: data.seedToGerm, dev: data.seedToGermDev, db: data.dbDefaults.g, color: 'green' },
    { label: 'Germination → Transplant', values: data.germToTransplant, dev: data.germToTransplantDev, db: data.dbDefaults.gt, color: 'amber' },
    { label: 'Transplant → Harvest', values: data.transplantToHarvest, dev: data.transplantToHarvestDev, db: data.dbDefaults.th, color: 'blue' },
  ];
  const colorMap: Record<string, string> = { green: 'bg-green-50 border-green-100', amber: 'bg-amber-50 border-amber-100', blue: 'bg-blue-50 border-blue-100' };
  const devColor = (v: number) => v > 0 ? 'text-amber-700' : 'text-green-700';

  if (cards.every(c => c.values.length === 0)) return null;

  return (
    <div>
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Layers className="w-3 h-3" /> Stage Durations</h4>
      <div className="grid grid-cols-3 gap-2">
        {cards.map(c => {
          const a = avg(c.values);
          const mn = minV(c.values);
          const mx = maxV(c.values);
          const md = medianV(c.values);
          const d = avg(c.dev);
          if (c.values.length === 0) return <div key={c.label} className={`p-2.5 rounded-lg border ${colorMap[c.color]} opacity-40`}><p className="text-[9px] uppercase text-gray-500 mb-1 leading-tight">{c.label}</p><p className="text-xs text-gray-400">No data</p></div>;
          return (
            <div key={c.label} className={`p-2.5 rounded-lg border ${colorMap[c.color]}`}>
              <p className="text-[9px] uppercase text-gray-500 mb-1 leading-tight">{c.label}</p>
              <p className="font-bold text-sm">{fmt(a)}</p>
              <p className="text-[10px] text-gray-500">min {fmt(mn)} · max {fmt(mx)}</p>
              <p className="text-[10px] text-gray-500">median {fmt(md)}</p>
              {d != null && <p className={`text-[10px] font-medium ${devColor(d)}`}>Δ {d > 0 ? '+' : ''}{d}d vs DB ({fmt(c.db)})</p>}
              {c.values.length > 1 && (
                <div className="mt-1.5 w-full bg-white/60 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full bg-current opacity-40" style={{ width: `${Math.min(100, (a ?? 0) / ((mx ?? 1) || 1) * 100)}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 2. Success Funnel ───────────────────────────────────────────────── */
function SuccessFunnel({ data }: { data: GroupData }) {
  const stages = [
    { label: 'Seed', count: data.samples, pct: 100 },
    { label: 'Germinated', count: data.totalReachedGerminated, pct: data.samples ? Math.round(data.totalReachedGerminated / data.samples * 100) : 0 },
    { label: 'Transplanted', count: data.totalReachedTransplanted, pct: data.samples ? Math.round(data.totalReachedTransplanted / data.samples * 100) : 0 },
    { label: 'Harvested', count: data.totalReachedHarvested, pct: data.samples ? Math.round(data.totalReachedHarvested / data.samples * 100) : 0 },
  ];

  return (
    <div>
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Success Funnel</h4>
      <div className="bg-gray-50 rounded-xl p-3 space-y-2">
        {stages.map((s, i) => (
          <div key={s.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium">{s.label}</span>
              <span className="text-muted-foreground">{s.count} ({s.pct}%)</span>
            </div>
            <div className="w-full bg-white rounded-full h-2.5 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${s.pct}%`, backgroundColor: ['#6b7280', '#16a34a', '#ca8a04', '#2563eb'][i] }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── 3. Seasonal Calendar ────────────────────────────────────────────── */
function SeasonalCalendar({ data }: { data: GroupData }) {
  const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  const chartData = months.map((m, i) => ({ month: m, plantings: data.monthlyPlantings[i + 1] ?? 0 }));
  if (!chartData.some(d => d.plantings > 0)) return null;

  return (
    <div>
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Calendar className="w-3 h-3" /> Planting Season</h4>
      <div className="bg-gray-50 rounded-xl p-3">
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <XAxis dataKey="month" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="plantings" fill="#16a34a" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={2000} animationEasing="ease-out" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ─── 5. Crop Lifecycle Gantt ──────────────────────────────────────────── */
const STAGE_COLORS_GANTT: Record<string, string> = {
  Seed: '#9e9e9e', Germinated: '#4caf50', Transplanted: '#ff9800',
  Vegetative: '#2196f3', Flowering: '#e91e63', Fruiting: '#9c27b0', Harvested: '#f44336',
};

function LifecycleGantt({ data }: { data: GroupData }) {
  const cropsWithStages = data.individualCrops.filter(c => c.stages.length > 0);
  if (cropsWithStages.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1"><GripHorizontal className="w-3 h-3" /> Crop Lifecycles</h4>
      <div className="bg-gray-50 rounded-xl p-3 space-y-3 max-h-80 overflow-y-auto">
        {cropsWithStages.map(crop => {
          const planted = parseDate(crop.planted);
          if (!planted) return null;
          const allDates = [planted, ...crop.stages.map(s => parseDate(s.date)).filter((d): d is Date => d != null)];
          if (allDates.length < 2) return null;
          const minTime = Math.min(...allDates.map(d => d.getTime()));
          const maxTime = Math.max(...allDates.map(d => d.getTime()));
          const range = maxTime - minTime || 1;

          const segments: { left: number; width: number; color: string; label: string }[] = [];
          let prevTime = minTime;
          for (const s of crop.stages) {
            const d = parseDate(s.date);
            if (!d) continue;
            const left = ((prevTime - minTime) / range) * 100;
            const width = ((d.getTime() - prevTime) / range) * 100;
            if (width > 1) segments.push({ left, width, color: STAGE_COLORS_GANTT[s.to] ?? '#9e9e9e', label: s.to });
            prevTime = d.getTime();
          }

          return (
            <div key={crop.id} className="text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-gray-700 truncate">{crop.name}</span>
                <span className="text-[9px] text-gray-400 ml-2 shrink-0">{crop.planted} → {crop.stages[crop.stages.length - 1]?.date}</span>
              </div>
              <div className="relative h-6 bg-gray-200/60 rounded-full overflow-hidden">
                {segments.map((seg, i) => (
                  <div key={i} className="absolute top-0 h-full rounded-full flex items-center justify-center text-[7px] text-white font-bold" style={{ left: `${seg.left}%`, width: `${seg.width}%`, backgroundColor: seg.color, minWidth: seg.width > 8 ? 0 : undefined }}>
                    {seg.width > 12 ? seg.label : ''}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 10. Deviation Trend ─────────────────────────────────────────────── */
function DeviationTrend({ data }: { data: GroupData }) {
  const crops = data.individualCrops.filter(c => c.stages.some(s => s.to === 'Harvested'));
  if (crops.length < 2) return null;

  const chartData = crops.map((c, idx) => {
    const harvestStage = c.stages.find(s => s.to === 'Harvested');
    const totalDays = harvestStage?.days ?? 0;
    const dbVal = data.dbDefaults.th ?? 0;
    const seedToGerm = c.stages.find(s => s.to === 'Germinated');
    const germDays = seedToGerm?.days ?? 0;
    const dev = dbVal ? totalDays - dbVal : 0;
    return { index: idx + 1, totalDays, deviation: dev, label: `#${idx + 1}` };
  });

  return (
    <div>
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Activity className="w-3 h-3" /> Deviation Trend</h4>
      <div className="bg-gray-50 rounded-xl p-3">
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="totalDays" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} name="Actual days" isAnimationActive={true} animationDuration={2500} animationEasing="ease-in-out" />
            <Line type="monotone" dataKey="deviation" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 2" name="Deviation from DB" isAnimationActive={true} animationDuration={2500} animationEasing="ease-in-out" animationBegin={300} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ─── 7. Variety Comparison ───────────────────────────────────────────── */
function VarietyComparison({ data }: { data: GroupData }) {
  const entries = Object.entries(data.varieties);
  if (entries.length <= 1) return null;

  return (
    <div>
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1"><GitBranch className="w-3 h-3" /> Variety Comparison</h4>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(entries.length, 3)}, 1fr)` }}>
        {entries.map(([vName, vData]) => (
          <div key={vName} className="bg-gray-50 rounded-lg p-2.5 border">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold capitalize truncate">{vName.replace(/_/g, ' ')}</span>
              <Badge variant="secondary" className="text-[10px] shrink-0 ml-1">n={vData.count}</Badge>
            </div>
            <div className="space-y-0.5 text-[10px]">
              <div><span className="text-gray-500">Seed→Germ:</span> <span className="font-semibold">{fmt(avg(vData.seedToGerm))}</span></div>
              <div><span className="text-gray-500">Germ→Trans:</span> <span className="font-semibold">{fmt(avg(vData.germToTransplant))}</span></div>
              <div><span className="text-gray-500">Trans→Harv:</span> <span className="font-semibold">{fmt(avg(vData.transplantToHarvest))}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── 8. Yield & Productivity ──────────────────────────────────────────── */
function YieldAnalysis({ data }: { data: GroupData }) {
  const logs = data.harvestLogs;
  if (!logs || logs.length === 0) return null;

  const sorted = [...logs].sort((a, b) => a.harvestDate.localeCompare(b.harvestDate));
  const harvestCount = sorted.length;

  const qtyPattern = /([\d.]+)\s*(\w+)/;
  const quantities: number[] = [];
  for (const h of logs) {
    if (h.notes) {
      const m = h.notes.match(qtyPattern);
      if (m) quantities.push(parseFloat(m[1]));
    }
  }
  const avgQty = quantities.length ? (quantities.reduce((a, b) => a + b, 0) / quantities.length).toFixed(1) : null;
  const avgQtyUnit = quantities.length ? logs.find(h => h.notes?.match(qtyPattern))?.notes?.match(qtyPattern)?.[2] ?? '' : '';

  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d1 = parseDate(sorted[i - 1].harvestDate);
    const d2 = parseDate(sorted[i].harvestDate);
    if (d1 && d2) intervals.push(Math.round((d2.getTime() - d1.getTime()) / 86400000));
  }
  const avgInterval = intervals.length ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length) : null;

  return (
    <div>
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Archive className="w-3 h-3" /> Yield & Productivity</h4>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div className="bg-green-50 rounded-lg p-2.5 text-center border border-green-100">
          <p className="text-[9px] uppercase text-gray-500">Total Harvests</p>
          <p className="font-bold text-green-800 text-lg">{harvestCount}</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-2.5 text-center border border-blue-100">
          <p className="text-[9px] uppercase text-gray-500">Avg Quantity</p>
          <p className="font-bold text-blue-800 text-lg">{avgQty ?? '—'} <span className="text-xs">{avgQtyUnit}</span></p>
        </div>
        <div className="bg-amber-50 rounded-lg p-2.5 text-center border border-amber-100">
          <p className="text-[9px] uppercase text-gray-500">Avg Interval</p>
          <p className="font-bold text-amber-800 text-lg">{avgInterval ?? '—'} <span className="text-xs">days</span></p>
        </div>
      </div>
    </div>
  );
}

/* ─── 4. Harvest Timeline (line chart) ────────────────────────────────── */
function HarvestTimeline({ data }: { data: GroupData }) {
  const logs = data.harvestLogs;
  if (!logs || logs.length < 2) return null;

  const sorted = [...logs].sort((a, b) => a.harvestDate.localeCompare(b.harvestDate));
  const chartData = sorted.map(h => ({ label: `#${h.harvestNumber}`, days: h.daysFromPlanting }));

  return (
    <div>
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1"><LineChartIcon className="w-3 h-3" /> Harvest Timeline</h4>
      <div className="bg-gray-50 rounded-xl p-3">
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} domain={['dataMin - 5', 'dataMax + 5']} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="days" stroke="#16a34a" strokeWidth={2} dot={{ r: 4, fill: '#16a34a' }} name="Days from planting" isAnimationActive={true} animationDuration={2500} animationEasing="ease-in-out" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ─── 6. Learning Dashboard ───────────────────────────────────────────── */
function LearningDashboard({ data }: { data: GroupData }) {
  const adj = data.adjustments;
  if (!adj || adj.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Beaker className="w-3 h-3" /> Learning Dashboard</h4>
      <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
        {adj.map(a => {
          const learned = a.sampleCount >= 3;
          return (
            <div key={a.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border text-xs">
              <div className="flex-1 min-w-0">
                <p className="font-medium capitalize">{a.field.replace(/_/g, ' ')}</p>
                <p className="text-[10px] text-muted-foreground">
                  Your avg: <span className="font-semibold">{a.yourAverage}</span> · DB: {a.databaseDefault} · Samples: {a.sampleCount}
                </p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${learned ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {learned ? 'Learned' : `Need ${3 - a.sampleCount} more`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
