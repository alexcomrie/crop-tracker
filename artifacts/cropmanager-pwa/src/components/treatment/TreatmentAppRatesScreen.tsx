import React, { useMemo, useState, useEffect } from 'react';
import { ChevronLeft, History, Star, FlaskConical, Trash2, ClipboardList, Search, RefreshCw, ShieldAlert, Clock, CalendarClock, BookOpen, Filter, Leaf } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { generateId } from '../../lib/ids';
import { formatDateShort, today } from '../../lib/dates';
import db from '../../db/db';
import { addDiaryEntry } from '../../lib/diary';
import type { TreatmentProduct, TreatmentRate } from './treatment-data';
import {
  loadTreatmentDatabase,
  mergeCustomProducts,
  getCachedTreatmentDatabase,
  type TreatmentDatabase,
  type TreatmentEntry,
} from '../../lib/treatmentDb';

type WaterUnit = 'gal' | 'L' | 'mL' | 'oz' | 'ha' | 'ac';
type TreatUnit = 'mL' | 'L' | 'gal' | 'fl_oz' | 'tsp' | 'Tbsp' | 'cup' | 'quarter_cup' | 'half_cup' | 'g' | 'kg' | 'oz' | 'lb';

const WATER_UNITS: { key: WaterUnit; label: string; toML: number; isArea: boolean }[] = [
  { key: 'gal', label: 'Gallons (gal)', toML: 3785.41, isArea: false },
  { key: 'L', label: 'Liters (L)', toML: 1000, isArea: false },
  { key: 'mL', label: 'Milliliters (mL)', toML: 1, isArea: false },
  { key: 'oz', label: 'Fluid ounces (fl oz)', toML: 29.5735, isArea: false },
  { key: 'ha', label: 'Hectares (ha)', toML: 0, isArea: true },
  { key: 'ac', label: 'Acres (ac)', toML: 0, isArea: true },
];

const UNIT_LABELS: Record<TreatUnit, string> = {
  mL: 'mL', L: 'L', gal: 'gal', fl_oz: 'fl oz', tsp: 'tsp', Tbsp: 'Tbsp',
  cup: 'cup', quarter_cup: '¼ cup', half_cup: '½ cup',
  g: 'g', kg: 'kg', oz: 'oz', lb: 'lb',
};

const CATEGORY_STYLE: Record<string, string> = {
  Fungicide: 'bg-purple-50 text-purple-700 border-purple-200',
  Insecticide: 'bg-orange-50 text-orange-700 border-orange-200',
  Herbicide: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  Fertilizer: 'bg-green-50 text-green-700 border-green-200',
  Other: 'bg-gray-50 text-gray-600 border-gray-200',
};

function convertValue(v: number, fromUnit: string, toUnit: TreatUnit): number {
  const volRates: Record<string, number> = { mL: 1, L: 1000, gal: 3785.41, fl_oz: 29.5735, tsp: 5, Tbsp: 15, cup: 237, quarter_cup: 59.25, half_cup: 118.5 };
  const weightRates: Record<string, number> = { g: 1, kg: 1000, oz: 28.35, lb: 453.592 };
  if (volRates[fromUnit] !== undefined && volRates[toUnit] !== undefined) return v * volRates[fromUnit] / volRates[toUnit];
  if (weightRates[fromUnit] !== undefined && weightRates[toUnit] !== undefined) return v * weightRates[fromUnit] / weightRates[toUnit];
  return v;
}

function isAreaBased(p: TreatmentProduct | null, idx = 0): boolean {
  return p?.rates[idx]?.perVolumeUnit === 'ha';
}
const ALL_VOLUME_UNITS: TreatUnit[] = ['mL', 'L', 'gal', 'fl_oz', 'tsp', 'Tbsp', 'cup', 'quarter_cup', 'half_cup'];
const ALL_WEIGHT_UNITS: TreatUnit[] = ['g', 'kg', 'oz', 'lb'];

function getUnits(p: TreatmentProduct | null, idx = 0): TreatUnit[] {
  if (!p) return ['mL'];
  const baseUnit = p.rates[idx]?.unit || 'mL';
  const isVol = baseUnit === 'mL' || baseUnit === 'L';
  if (isAreaBased(p, idx)) {
    return isVol ? ['L', 'mL'] : ['g'];
  }
  return isVol ? ALL_VOLUME_UNITS : ALL_WEIGHT_UNITS;
}
function perVolumeToML(r: TreatmentRate): number {
  if (r.perVolumeUnit === 'L') return r.perVolume * 1000;
  if (r.perVolumeUnit === 'gal') return r.perVolume * 3785.41;
  return 0;
}

function calc(
  rate: TreatmentRate,
  amount: number,
  wUnit: WaterUnit,
  oUnit: TreatUnit,
): { min: number; max: number } | null {
  if (rate.perVolumeUnit === 'ha') {
    const ha = wUnit === 'ac' ? amount * 0.404686 : amount;
    let min = rate.min * ha;
    let max = rate.max * ha;
    if (oUnit !== rate.unit) {
      min = convertValue(min, rate.unit, oUnit);
      max = convertValue(max, rate.unit, oUnit);
    }
    return { min, max };
  }
  const rML = perVolumeToML(rate);
  if (rML <= 0) return null;
  const w = WATER_UNITS.find(u => u.key === wUnit);
  if (!w || w.isArea) return null;
  const scale = (amount * w.toML) / rML;
  return {
    min: convertValue(rate.min * scale, rate.unit, oUnit),
    max: convertValue(rate.max * scale, rate.unit, oUnit),
  };
}

interface SavedPreset {
  name: string; productId: string; rateLabel: string;
  waterAmount: number; waterUnit: WaterUnit; treatUnit: TreatUnit;
}
interface CalcHistory {
  productName: string; rateLabel: string;
  waterAmount: number; waterUnit: string; treatUnit: string;
  resultMin: string; resultMax: string; timestamp: number;
}
interface CustomProduct {
  id: string;
  name: string;
  category: 'Fungicide' | 'Insecticide' | 'Herbicide' | 'Fertilizer' | 'Other';
  classification: 'Contact' | 'Systemic' | 'Both';
  rateMin: number;
  rateMax: number;
  rateUnit: 'mL' | 'g';
  perVolume: number;
  perVolumeUnit: 'L' | 'gal';
  notes: string;
}

const STORE_P = 'tar_presets'; const STORE_H = 'tar_history'; const STORE_C = 'tar_custom';

function loadP(): SavedPreset[] { try { return JSON.parse(localStorage.getItem(STORE_P) || '[]'); } catch { return []; } }
function loadH(): CalcHistory[] { try { return JSON.parse(localStorage.getItem(STORE_H) || '[]'); } catch { return []; } }
function loadC(): CustomProduct[] { try { return JSON.parse(localStorage.getItem(STORE_C) || '[]'); } catch { return []; } }

function customToProduct(c: CustomProduct): TreatmentProduct {
  return {
    id: c.id,
    name: c.name,
    category: c.category,
    classification: c.classification,
    rates: [{ label: 'Standard', min: c.rateMin, max: c.rateMax, unit: c.rateUnit, perVolume: c.perVolume, perVolumeUnit: c.perVolumeUnit, notes: c.notes || undefined }],
    isCustom: true,
    notes: c.notes,
  };
}

function fmt(v: number): string {
  if (Math.abs(v) < 0.01) return v.toFixed(3);
  if (Math.abs(v) < 1) return v.toFixed(2);
  if (Math.abs(v) < 1000) return v.toFixed(1);
  return v.toFixed(0);
}

function fmtAge(ms: number | null): string {
  if (ms === null) return 'not synced yet';
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function TreatmentAppRatesScreen({ onClose }: { onClose: () => void }) {
  const [database, setDatabase] = useState<TreatmentDatabase | null>(() => getCachedTreatmentDatabase());
  const [loading, setLoading] = useState(!database);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [cropFilter, setCropFilter] = useState('All');
  const [targetFilter, setTargetFilter] = useState('All');
  const [showFilters, setShowFilters] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rateIdx, setRateIdx] = useState(0);
  const [waterAmount, setWaterAmount] = useState('');
  const [waterUnit, setWaterUnit] = useState<WaterUnit>('gal');
  const [treatUnit, setTreatUnit] = useState<TreatUnit>('mL');
  const [showAll, setShowAll] = useState(false);
  const [history, setHistory] = useState<CalcHistory[]>([]);
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [savingP, setSavingP] = useState(false);
  const [pName, setPName] = useState('');
  const [showHist, setShowHist] = useState(false);
  const [showPres, setShowPres] = useState(false);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [batchMode, setBatchMode] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activityNotes, setActivityNotes] = useState('');

  const [customs, setCustoms] = useState<CustomProduct[]>([]);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [cf, setCf] = useState<CustomProduct>({
    id: '', name: '', category: 'Fungicide', classification: 'Contact',
    rateMin: 0, rateMax: 0, rateUnit: 'mL', perVolume: 3.8, perVolumeUnit: 'L', notes: '',
  });

  async function sync(force: boolean) {
    setSyncing(true);
    setSyncError(null);
    try {
      const result = await loadTreatmentDatabase({ force });
      setDatabase(result.database);
      setSyncedAt(Date.now());
      setSyncError(result.error);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }

  useEffect(() => {
    setHistory(loadH()); setPresets(loadP()); setCustoms(loadC());
    void sync(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const customProducts = useMemo(() => customs.map(customToProduct), [customs]);
  const entries = useMemo(
    () => mergeCustomProducts(database?.entries ?? [], customProducts),
    [database, customProducts],
  );

  const product = useMemo(() => entries.find(p => p.id === selectedId) ?? null, [entries, selectedId]);
  const rate = useMemo(() => product?.rates[rateIdx] ?? null, [product, rateIdx]);
  const availUnits = useMemo(() => getUnits(product, rateIdx), [product, rateIdx]);

  useEffect(() => {
    if (!product) return;
    if (isAreaBased(product, rateIdx)) { setWaterUnit('ha'); }
    else if (waterUnit === 'ha') { setWaterUnit('gal'); }
  }, [product, rateIdx]);

  useEffect(() => {
    if (availUnits.length > 0 && !availUnits.includes(treatUnit)) setTreatUnit(availUnits[0]);
  }, [availUnits]);

  const waterNum = parseFloat(waterAmount) || 0;
  const res = useMemo(() => rate && waterNum > 0 ? calc(rate, waterNum, waterUnit, treatUnit) : null, [rate, waterNum, waterUnit, treatUnit]);

  const allRes = useMemo(() => {
    if (!rate || waterNum <= 0) return null;
    const r: Record<string, { min: number; max: number }> = {};
    for (const u of availUnits) {
      const c = calc(rate, waterNum, waterUnit, u);
      if (c) r[u] = c;
    }
    return r;
  }, [rate, waterNum, waterUnit, availUnits]);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(entries.map(e => e.category)))],
    [entries],
  );
  const crops = useMemo(
    () => Array.from(new Set(entries.flatMap(e => e.crops ?? []).map(c => c.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [entries],
  );
  const targets = useMemo(
    () => Array.from(new Set(entries.flatMap(e => e.targets ?? []).map(t => t.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [entries],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(p => {
      if (category !== 'All' && p.category !== category) return false;
      if (cropFilter !== 'All' && !(p.crops ?? []).some(c => c.toLowerCase() === cropFilter.toLowerCase())) return false;
      if (targetFilter !== 'All' && !(p.targets ?? []).some(t => t.toLowerCase() === targetFilter.toLowerCase())) return false;
      if (!q) return true;
      const haystack = [
        p.name, p.category, p.classification, p.activeIngredient ?? '',
        ...(p.crops ?? []), ...(p.targets ?? []), p.notes ?? '',
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, search, category, cropFilter, targetFilter]);

  const grouped = useMemo(() => {
    const cats = new Map<string, TreatmentEntry[]>();
    for (const p of filtered) {
      const cat = p.category === 'Fungicide' ? 'Fungicides'
        : p.category === 'Insecticide' ? 'Insecticides'
          : p.category === 'Herbicide' ? 'Herbicides'
            : p.category === 'Fertilizer' ? 'Fertilizers' : 'Other';
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat)!.push(p);
    }
    return Array.from(cats.entries()).map(([cat, items]) => ({ cat, items }));
  }, [filtered]);

  const hasFilters = category !== 'All' || cropFilter !== 'All' || targetFilter !== 'All' || !!search.trim();

  const cbAddHistory = () => {
    if (!product || !rate || !res) return;
    const e: CalcHistory = {
      productName: product.name, rateLabel: rate.label,
      waterAmount: waterNum, waterUnit: WATER_UNITS.find(u => u.key === waterUnit)?.label || waterUnit,
      treatUnit: UNIT_LABELS[treatUnit] || treatUnit,
      resultMin: fmt(res.min), resultMax: rate.min === rate.max ? '' : fmt(res.max),
      timestamp: Date.now(),
    };
    const u = [e, ...history]; setHistory(u); localStorage.setItem(STORE_H, JSON.stringify(u.slice(0, 50)));
  };
  const cbSavePreset = () => {
    if (!product || !pName.trim()) return;
    const p: SavedPreset = { name: pName.trim(), productId: product.id, rateLabel: rate?.label || 'Standard', waterAmount: waterNum, waterUnit, treatUnit };
    const u = [...presets, p]; setPresets(u); localStorage.setItem(STORE_P, JSON.stringify(u));
    setSavingP(false); setPName('');
  };
  const cbLoadPreset = (p: SavedPreset) => {
    setSelectedId(p.productId); setWaterAmount(p.waterAmount.toString()); setWaterUnit(p.waterUnit); setTreatUnit(p.treatUnit);
    const pr = entries.find(x => x.id === p.productId);
    if (pr) { const i = pr.rates.findIndex(r => r.label === p.rateLabel); setRateIdx(i >= 0 ? i : 0); }
    setShowPres(false);
  };
  const cbDelPreset = (i: number) => { const u = presets.filter((_, j) => j !== i); setPresets(u); localStorage.setItem(STORE_P, JSON.stringify(u)); };

  const activeWaterUnits = useMemo(() => WATER_UNITS.filter(u => product && isAreaBased(product) ? u.isArea : !u.isArea), [product]);

  const cbSaveCustom = () => {
    if (!cf.name.trim() || cf.rateMin <= 0) return;
    const c: CustomProduct = { ...cf, id: `custom_${Date.now()}`, name: cf.name.trim() };
    const u = [...customs, c]; setCustoms(u); localStorage.setItem(STORE_C, JSON.stringify(u));
    setShowCustomForm(false);
    setSelectedId(c.id);
    setRateIdx(0);
    setCf({ id: '', name: '', category: 'Fungicide', classification: 'Contact', rateMin: 0, rateMax: 0, rateUnit: 'mL', perVolume: 3.8, perVolumeUnit: 'L', notes: '' });
  };
  const cbDelCustom = (id: string) => {
    const u = customs.filter(c => c.id !== id); setCustoms(u); localStorage.setItem(STORE_C, JSON.stringify(u));
    if (selectedId === id) { setSelectedId(null); setRateIdx(0); }
  };

  return (
    <div className="absolute inset-0 bg-[#f5f5f0] flex flex-col z-[60] animate-in slide-in-from-right duration-300">
      <div className="bg-white border-b border-gray-200 h-14 flex items-center gap-2 px-4 shrink-0">
        <button onClick={onClose} className="w-8 h-8 rounded-lg border bg-[#f9f9f6] text-gray-600 flex items-center justify-center" aria-label="Close">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-[16px] leading-tight truncate">Treatment Database</h2>
          <p className="text-[10px] text-gray-500 leading-tight truncate">
            {entries.length} products · {syncedAt ? `synced ${fmtAge(Date.now() - syncedAt)}` : 'shared list'}
          </p>
        </div>
        <button onClick={() => void sync(true)} disabled={syncing} className="w-8 h-8 rounded-lg border bg-[#f9f9f6] text-gray-600 flex items-center justify-center" aria-label="Refresh from Google Sheet" title="Refresh from Google Sheet">
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={() => { setShowHist(!showHist); setShowPres(false); }} className={`w-8 h-8 rounded-lg border flex items-center justify-center ${showHist ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-[#f9f9f6] text-gray-600'}`} aria-label="Recent calculations">
          <History className="w-4 h-4" />
        </button>
        <button onClick={() => { setShowPres(!showPres); setShowHist(false); }} className={`w-8 h-8 rounded-lg border flex items-center justify-center ${showPres ? 'bg-yellow-50 text-yellow-600 border-yellow-200' : 'bg-[#f9f9f6] text-gray-600'}`} aria-label="Saved mixes">
          <Star className="w-4 h-4" />
        </button>
      </div>

      {syncError && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-1.5 text-[10px] text-amber-800">
          Offline or sheet unavailable ({syncError}). Showing the last saved list.
        </div>
      )}

      {showHist && (
        <div className="bg-blue-50 border-b border-blue-100 p-3 max-h-48 overflow-y-auto shrink-0">
          <h3 className="text-xs font-bold text-blue-700 uppercase mb-2">Recent Calculations</h3>
          {history.length === 0 ? <p className="text-xs text-blue-500">No history yet.</p> : (
            <div className="space-y-1.5">
              {history.map((h, i) => (
                <div key={i} className="bg-white rounded-lg p-2 text-xs flex justify-between items-center">
                  <div>
                    <span className="font-semibold">{h.productName}</span>
                    <span className="text-gray-500 ml-1">{h.waterAmount} {h.waterUnit} → {h.resultMin}{h.resultMax ? `–${h.resultMax}` : ''} {h.treatUnit}</span>
                  </div>
                  <span className="text-gray-400 text-[10px]">{new Date(h.timestamp).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showPres && (
        <div className="bg-yellow-50 border-b border-yellow-100 p-3 max-h-48 overflow-y-auto shrink-0">
          <h3 className="text-xs font-bold text-yellow-700 uppercase mb-2">Saved Mixes</h3>
          {presets.length === 0 ? <p className="text-xs text-yellow-600">No saved mixes yet.</p> : (
            <div className="space-y-1.5">
              {presets.map((p, i) => (
                <div key={i} className="bg-white rounded-lg p-2 text-xs flex justify-between items-center">
                  <button className="text-left flex-1" onClick={() => cbLoadPreset(p)}>
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-gray-500 ml-1">— {entries.find(x => x.id === p.productId)?.name || p.productId}, {p.waterAmount} {p.waterUnit}</span>
                  </button>
                  <button onClick={() => cbDelPreset(i)} className="text-red-400 hover:text-red-600 ml-2 text-[10px]">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : !product ? (
          <>
            {/* Search + filters */}
            <div className="bg-white border border-[#e0e0e0] rounded-xl p-3 space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder="Search product, crop, pest or disease…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-[11px] border font-semibold whitespace-nowrap ${category === cat ? 'bg-green-700 text-white border-green-700' : 'bg-white border-gray-300 text-gray-700'}`}>
                    {cat === 'All' ? 'All types' : cat}
                  </button>
                ))}
                <button onClick={() => setShowFilters(v => !v)}
                  className={`px-3 py-1.5 rounded-full text-[11px] border font-semibold whitespace-nowrap flex items-center gap-1 ${showFilters || cropFilter !== 'All' || targetFilter !== 'All' ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-gray-300 text-gray-700'}`}>
                  <Filter className="w-3 h-3" /> Crop / target
                </button>
              </div>
              {showFilters && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Crop</label>
                    <select value={cropFilter} onChange={e => setCropFilter(e.target.value)} className="w-full mt-1 border rounded-lg p-2 text-xs bg-white">
                      <option value="All">All crops</option>
                      {crops.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Target</label>
                    <select value={targetFilter} onChange={e => setTargetFilter(e.target.value)} className="w-full mt-1 border rounded-lg p-2 text-xs bg-white">
                      <option value="All">All targets</option>
                      {targets.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-gray-500">{filtered.length} product{filtered.length === 1 ? '' : 's'} found</p>
                {hasFilters && (
                  <button onClick={() => { setSearch(''); setCategory('All'); setCropFilter('All'); setTargetFilter('All'); }} className="text-[11px] text-green-700 font-semibold">
                    Clear filters
                  </button>
                )}
              </div>
            </div>


            {grouped.length === 0 ? (
              <div className="text-center py-12 text-sm text-gray-400">
                No products match those filters.
              </div>
            ) : grouped.map(g => (
              <div key={g.cat} className="space-y-1.5">
                <div className="text-[10px] font-bold text-gray-400 uppercase px-1 flex items-center gap-1">
                  {g.cat} <span className="text-gray-300">({g.items.length})</span>
                </div>
                {g.items.map(p => (
                  <button key={p.id}
                    onClick={() => { setSelectedId(p.id); setRateIdx(0); setWaterAmount(''); setBatchIds([]); }}
                    className="w-full text-left bg-white border border-[#e0e0e0] rounded-xl px-3 py-2.5 flex items-center gap-2 hover:border-green-300 active:scale-[0.99] transition"
                  >
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover border shrink-0" loading="lazy" />
                    ) : (
                      <span className="w-10 h-10 rounded-lg bg-gray-50 border flex items-center justify-center shrink-0">
                        <FlaskConical className={`w-4 h-4 ${p.classification === 'Contact' ? 'text-orange-500' : p.classification === 'Systemic' ? 'text-blue-500' : 'text-purple-500'}`} />
                      </span>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold truncate">{p.name}</span>
                        {p.isCustom && <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1 rounded">LOCAL</span>}
                      </span>
                      <span className="block text-[10px] text-gray-500 truncate">
                        {p.activeIngredient || `${p.classification} ${p.category.toLowerCase()}`}
                      </span>
                      <span className="flex items-center gap-1 mt-1 flex-wrap">
                        {(p.crops ?? []).slice(0, 3).map(c => (
                          <span key={c} className="text-[9px] bg-green-50 text-green-700 rounded-full px-1.5 py-0.5">{c}</span>
                        ))}
                        {(p.crops?.length ?? 0) > 3 && <span className="text-[9px] text-gray-400">+{(p.crops?.length ?? 0) - 3}</span>}
                      </span>
                    </span>
                    <span className="text-right shrink-0 space-y-1">
                      <span className={`block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${CATEGORY_STYLE[p.category] ?? CATEGORY_STYLE.Other}`}>
                        {p.category}
                      </span>
                      <span className="block text-[9px] text-gray-500">
                        {p.reiHours !== undefined ? `REI ${p.reiHours}h` : 'REI ?'} · {p.phiDays !== undefined ? `PHI ${p.phiDays}d` : 'PHI ?'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </>
        ) : (
          <>
            {/* Product detail */}
            <button onClick={() => { setSelectedId(null); setWaterAmount(''); }} className="flex items-center gap-1 text-xs font-semibold text-green-700">
              <ChevronLeft className="w-4 h-4" /> All products
            </button>

            <div className="bg-white border border-[#e0e0e0] rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name} className="w-16 h-16 rounded-xl object-cover border shrink-0" loading="lazy" />
                ) : (
                  <span className="w-16 h-16 rounded-xl bg-gray-50 border flex items-center justify-center shrink-0">
                    <FlaskConical className="w-7 h-7 text-gray-400" />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-[16px] leading-tight">{product.name}</h3>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${CATEGORY_STYLE[product.category] ?? CATEGORY_STYLE.Other}`}>{product.category}</span>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{product.classification}</span>
                    {product.source === 'sheet' && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">sheet</span>}
                  </div>
                  {product.activeIngredient && <p className="text-[11px] text-gray-500 mt-1">{product.activeIngredient}</p>}
                </div>
                {product.isCustom && (
                  <button onClick={() => cbDelCustom(product.id)} className="text-red-300 hover:text-red-500 p-1" aria-label="Delete local product">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-orange-50 border border-orange-100 p-2">
                  <p className="text-[9px] font-bold uppercase text-orange-500 flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Re-entry (REI)</p>
                  <p className="text-sm font-bold text-orange-800">{product.reiHours !== undefined ? `${product.reiHours} hours` : 'Check label'}</p>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-100 p-2">
                  <p className="text-[9px] font-bold uppercase text-blue-500 flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Pre-harvest (PHI)</p>
                  <p className="text-sm font-bold text-blue-800">{product.phiDays !== undefined ? `${product.phiDays} days` : 'Check label'}</p>
                </div>
              </div>

              {(product.crops?.length || product.targets?.length) ? (
                <div className="space-y-2">
                  {product.crops && product.crops.length > 0 && (
                    <div>
                      <p className="text-[9px] font-bold uppercase text-gray-400 flex items-center gap-1"><Leaf className="w-3 h-3" /> Crops</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {product.crops.map(c => (
                          <button key={c} onClick={() => { setSelectedId(null); setCropFilter(c); setShowFilters(true); }}
                            className="text-[10px] bg-green-50 text-green-700 border border-green-100 rounded-full px-2 py-0.5">
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {product.targets && product.targets.length > 0 && (
                    <div>
                      <p className="text-[9px] font-bold uppercase text-gray-400">Targets</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {product.targets.map(t => (
                          <button key={t} onClick={() => { setSelectedId(null); setTargetFilter(t); setShowFilters(true); }}
                            className="text-[10px] bg-amber-50 text-amber-800 border border-amber-100 rounded-full px-2 py-0.5">
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {product.guide && (
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-[10px] font-bold uppercase text-gray-500 flex items-center gap-1 mb-1"><BookOpen className="w-3 h-3" /> How to use</p>
                  <p className="text-xs text-gray-700 leading-snug">{product.guide}</p>
                </div>
              )}
              {product.warnings && (
                <div className="rounded-lg bg-red-50 border border-red-100 p-3">
                  <p className="text-[10px] font-bold uppercase text-red-600 flex items-center gap-1 mb-1"><ShieldAlert className="w-3 h-3" /> Safety & resistance</p>
                  <p className="text-xs text-red-800 leading-snug">{product.warnings}</p>
                </div>
              )}
              {product.notes && <p className="text-[11px] text-gray-500 italic">{product.notes}</p>}
            </div>

            {/* Rates + calculator */}
            {product.rates.length > 1 && (
              <div className="bg-white border border-[#e0e0e0] rounded-xl p-4 space-y-2">
                <h3 className="font-semibold text-sm">Rate Variant</h3>
                <div className="flex flex-wrap gap-2">
                  {product.rates.map((r, i) => (
                    <button key={i} onClick={() => setRateIdx(i)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${rateIdx === i ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{r.label}</button>
                  ))}
                </div>
                {rate?.notes && <p className="text-xs text-amber-600">{rate.notes}</p>}
              </div>
            )}

            {rate && (
              <>
                <div className="bg-white border border-[#e0e0e0] rounded-xl p-4">
                  <h3 className="font-semibold text-sm">Label Rate</h3>
                  <p className="text-lg font-bold text-green-700 mt-1">
                    {rate.min === rate.max ? `${fmt(rate.min)} ${rate.unit}` : `${fmt(rate.min)}–${fmt(rate.max)} ${rate.unit}`}
                    {' '}per {rate.perVolume} {rate.perVolumeUnit === 'ha' ? 'hectare' : rate.perVolumeUnit === 'gal' ? 'gal' : 'L'}
                  </p>
                  {isAreaBased(product) && <p className="text-xs text-amber-600 mt-1">Area-based — enter hectares/acres below</p>}
                </div>

                <div className="bg-white border border-[#e0e0e0] rounded-xl p-4 space-y-3">
                  <h3 className="font-semibold text-sm flex items-center gap-1"><Clock className="w-4 h-4 text-green-700" /> {isAreaBased(product) ? 'Enter Area' : 'Enter Water Amount'}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">{isAreaBased(product) ? 'Area' : 'Water'}</label>
                      <Input type="number" step="0.1" value={waterAmount} onChange={e => setWaterAmount(e.target.value)} placeholder="0" className="mt-1" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Unit</label>
                      <select value={waterUnit} onChange={e => setWaterUnit(e.target.value as WaterUnit)} className="w-full mt-1 border rounded-lg p-2 text-sm bg-white">
                        {activeWaterUnits.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-[#e0e0e0] rounded-xl p-4 space-y-2">
                  <h3 className="font-semibold text-sm">Output Unit</h3>
                  <div className="flex flex-wrap gap-2">
                    {availUnits.map(u => (
                      <button key={u} onClick={() => setTreatUnit(u)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${treatUnit === u ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        {UNIT_LABELS[u] || u}
                      </button>
                    ))}
                  </div>
                </div>

                {res && (
                  <div className="bg-white border-2 border-green-200 rounded-xl p-4 space-y-3">
                    <h3 className="font-semibold text-sm text-green-800">Result</h3>
                    <div className="text-center py-4">
                      <div className="text-3xl font-bold text-green-700">
                        {fmt(res.min)}{rate.min !== rate.max ? ` – ${fmt(res.max)}` : ''}
                        <span className="text-xl ml-1">{UNIT_LABELS[treatUnit] || treatUnit}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        for {waterNum} {WATER_UNITS.find(u => u.key === waterUnit)?.label?.split(' ')[0]}{isAreaBased(product) ? '' : ' of water'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1 h-8 text-xs" onClick={cbAddHistory}>Save to History</Button>
                      <Button variant="outline" className="h-8 text-xs" onClick={() => setSavingP(true)}>Save as Mix</Button>
                    </div>
                    <button onClick={() => { setShowActivityModal(true); setActivityNotes(''); }} className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-green-300 rounded-lg text-xs text-green-700 font-semibold hover:bg-green-50">
                      <ClipboardList className="w-3.5 h-3.5" /> Add to Activity Log
                    </button>
                  </div>
                )}

                {waterNum <= 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center text-sm text-gray-400">
                    Enter {isAreaBased(product) ? 'area' : 'water amount'} to calculate
                  </div>
                )}

                {allRes && showAll && (
                  <div className="bg-white border border-[#e0e0e0] rounded-xl p-4 space-y-2">
                    <h3 className="font-semibold text-sm">All Units</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(allRes).map(([unit, vals]) => (
                        <div key={unit} className="bg-gray-50 rounded-lg p-2 text-center">
                          <div className="text-[10px] text-gray-500 uppercase font-bold">{UNIT_LABELS[unit as TreatUnit] || unit}</div>
                          <div className="font-bold text-sm">{fmt(vals.min)}{vals.min !== vals.max ? ` – ${fmt(vals.max)}` : ''}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {waterNum > 0 && availUnits.length > 1 && (
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="rounded" />
                    Show all units
                  </label>
                )}
              </>
            )}

            {savingP && (
              <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[70] p-4">
                <div className="bg-white rounded-xl p-4 w-full max-w-sm space-y-3">
                  <h3 className="font-semibold text-sm">Save Mix</h3>
                  <Input placeholder="e.g. Mancozeb 80% for 2 gal" value={pName} onChange={e => setPName(e.target.value)} autoFocus />
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={cbSavePreset} disabled={!pName.trim()}>Save</Button>
                    <Button variant="outline" onClick={() => { setSavingP(false); setPName(''); }}>Cancel</Button>
                  </div>
                </div>
              </div>
            )}

            {showActivityModal && product && rate && res && (
              <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[70] p-4" onClick={() => setShowActivityModal(false)}>
                <div className="bg-white rounded-xl p-4 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
                  <h3 className="font-semibold text-sm flex items-center gap-2"><ClipboardList className="w-4 h-4 text-green-600" /> Add to Activity Log</h3>
                  <p className="text-xs text-gray-500">
                    {product.name} — {rate.label}: {fmt(res.min)}{rate.min !== rate.max ? `–${fmt(res.max)}` : ''} {UNIT_LABELS[treatUnit]}
                  </p>
                  <Input type="text" placeholder="Notes (optional)" value={activityNotes} onChange={e => setActivityNotes(e.target.value)} />
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={async () => {
                      try {
                        const resultStr = `${fmt(res.min)}${rate.min !== rate.max ? `–${fmt(res.max)}` : ''} ${UNIT_LABELS[treatUnit]}`;
                        const activity = {
                          id: generateId('ACT'),
                          date: formatDateShort(today()),
                          type: product.category === 'Fungicide' ? 'fungicide' : product.category === 'Insecticide' ? 'pesticide' : 'other',
                          product: `${product.name} (${rate.label})`,
                          notes: [resultStr, activityNotes].filter(Boolean).join(' · '),
                          reminderDays: null,
                          reminderDate: null,
                          cropIds: [],
                          updatedAt: Date.now(),
                        };
                        await db.activities.add(activity);
                        await addDiaryEntry({
                          entryType: 'activity_log',
                          cropId: 'treatment',
                          cropName: activity.type.charAt(0).toUpperCase() + activity.type.slice(1),
                          description: `Treatment applied: ${product.name}`,
                          details: `${resultStr}${activityNotes ? ` · ${activityNotes}` : ''}`,
                        });
                        setShowActivityModal(false);
                        toast.success('Added to Activity Log');
                      } catch (e) {
                        console.error('[treatment] activity log failed', { e });
                        toast.error('Could not log activity: ' + (e instanceof Error ? e.message : String(e)));
                      }
                    }}>Add</Button>
                    <Button variant="outline" onClick={() => setShowActivityModal(false)}>Cancel</Button>
                  </div>
                </div>
              </div>
            )}

            {/* Tank mix */}
            <div className="bg-white border border-[#e0e0e0] rounded-xl p-4 space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={batchMode} onChange={e => setBatchMode(e.target.checked)} className="rounded" />
                <span className="font-semibold">Batch Mode (Tank Mix)</span>
              </label>
              {batchMode && (
                <div className="space-y-2 mt-2">
                  <p className="text-xs text-gray-500">Select multiple products for tank mix:</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {entries.map(p => (
                      <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 rounded p-1">
                        <input type="checkbox" checked={batchIds.includes(p.id)} onChange={e => { if (e.target.checked) setBatchIds([...batchIds, p.id]); else setBatchIds(batchIds.filter(b => b !== p.id)); }} className="rounded" />
                        {p.name}
                      </label>
                    ))}
                  </div>
                  {batchIds.length > 0 && waterNum > 0 && (
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                      <h4 className="text-xs font-bold text-gray-600 uppercase">Tank Mix Results</h4>
                      {(() => {
                        const selected = batchIds.map(pid => entries.find(x => x.id === pid)).filter((p): p is TreatmentEntry => !!p);
                        const areaN = selected.filter(p => isAreaBased(p)).length;
                        const mixed = areaN > 0 && areaN < selected.length;
                        return (
                          <>
                            {mixed && (
                              <p className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-2 py-1.5">
                                Mixed units: {areaN} area-based (per ha) + {selected.length - areaN} volume-based. Rows that don't match the current water unit show — instead of a wrong number.
                              </p>
                            )}
                            {selected.map(pr => {
                              const r = pr.rates[0]; if (!r) return null;
                              const rowArea = isAreaBased(pr);
                              const uiArea = waterUnit === 'ha';
                              if (rowArea !== uiArea) {
                                return (
                                  <div key={pr.id} className="flex justify-between text-xs">
                                    <span>{pr.name}</span>
                                    <span className="font-semibold text-gray-400" title={rowArea ? 'Area-based — switch water unit to ha' : 'Volume-based — switch water unit to gal/L'}>—</span>
                                  </div>
                                );
                              }
                              const c = calc(r, waterNum, waterUnit, treatUnit);
                              return (
                                <div key={pr.id} className="flex justify-between text-xs">
                                  <span>{pr.name}</span>
                                  <span className="font-semibold">{c ? `${fmt(c.min)}${c.min !== c.max ? `–${fmt(c.max)}` : ''} ${UNIT_LABELS[treatUnit] || treatUnit}` : 'N/A'}</span>
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          <strong>Safety reminder:</strong> This database is a planning aid. Always follow the printed product label, wear proper PPE, and confirm rates, REI and PHI for your crop before spraying. Consult your local extension officer or CCJ agronomist for crop-specific programmes.
        </div>
      </div>

      {/* Custom product form */}
      {showCustomForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base">Add a local product</h3>
              <button onClick={() => setShowCustomForm(false)} className="text-gray-400"><ChevronLeft className="w-5 h-5 rotate-90" /></button>
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase">Product Name</label>
              <Input value={cf.name} onChange={e => setCf({ ...cf, name: e.target.value })} placeholder="e.g. My Custom Spray" className="mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Type</label>
                <select value={cf.category} onChange={e => setCf({ ...cf, category: e.target.value as CustomProduct['category'] })} className="w-full mt-1 border rounded-lg p-2 text-sm bg-white">
                  <option value="Fungicide">Fungicide</option>
                  <option value="Insecticide">Insecticide</option>
                  <option value="Herbicide">Herbicide</option>
                  <option value="Fertilizer">Fertilizer</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Mode of Action</label>
                <select value={cf.classification} onChange={e => setCf({ ...cf, classification: e.target.value as CustomProduct['classification'] })} className="w-full mt-1 border rounded-lg p-2 text-sm bg-white">
                  <option value="Contact">Contact</option>
                  <option value="Systemic">Systemic</option>
                  <option value="Both">Both</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Rate Min</label>
                <Input type="number" step="0.1" value={cf.rateMin || ''} onChange={e => setCf({ ...cf, rateMin: parseFloat(e.target.value) || 0 })} className="mt-1" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Rate Max</label>
                <Input type="number" step="0.1" value={cf.rateMax || ''} onChange={e => setCf({ ...cf, rateMax: parseFloat(e.target.value) || 0 })} className="mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Rate Unit</label>
                <select value={cf.rateUnit} onChange={e => setCf({ ...cf, rateUnit: e.target.value as CustomProduct['rateUnit'] })} className="w-full mt-1 border rounded-lg p-2 text-sm bg-white">
                  <option value="mL">mL (liquid)</option>
                  <option value="g">g (dry)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Per Volume</label>
                <div className="flex gap-2 mt-1">
                  <Input type="number" step="0.1" value={cf.perVolume || ''} onChange={e => setCf({ ...cf, perVolume: parseFloat(e.target.value) || 0 })} className="flex-1" />
                  <select value={cf.perVolumeUnit} onChange={e => setCf({ ...cf, perVolumeUnit: e.target.value as CustomProduct['perVolumeUnit'] })} className="border rounded-lg p-2 text-sm bg-white">
                    <option value="L">L</option>
                    <option value="gal">gal</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase">Notes</label>
              <Input value={cf.notes} onChange={e => setCf({ ...cf, notes: e.target.value })} placeholder="Crop-specific instructions…" className="mt-1" />
            </div>

            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={cbSaveCustom} disabled={!cf.name.trim() || cf.rateMin <= 0}>Add Product</Button>
              <Button variant="outline" onClick={() => setShowCustomForm(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
