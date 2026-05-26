import React, { useMemo, useState, useEffect } from 'react';
import { ChevronLeft, History, Star, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ALL_PRODUCTS, type TreatmentProduct, type TreatmentRate } from './treatment-data';

type WaterUnit = 'gal' | 'L' | 'mL' | 'oz' | 'ha' | 'ac';
type TreatUnit = 'mL' | 'L' | 'tsp' | 'Tbsp' | 'g' | 'oz';

const WATER_UNITS: { key: WaterUnit; label: string; toML: number; isArea: boolean }[] = [
  { key: 'gal', label: 'Gallons (gal)', toML: 3785.41, isArea: false },
  { key: 'L', label: 'Liters (L)', toML: 1000, isArea: false },
  { key: 'mL', label: 'Milliliters (mL)', toML: 1, isArea: false },
  { key: 'oz', label: 'Ounces (oz)', toML: 29.5735, isArea: false },
  { key: 'ha', label: 'Hectares (ha)', toML: 0, isArea: true },
  { key: 'ac', label: 'Acres (ac)', toML: 0, isArea: true },
];

const TREAT_UNITS: { key: TreatUnit; label: string; fromBase: (v: number, baseUnit: string) => number }[] = [
  { key: 'mL', label: 'mL', fromBase: (v) => v },
  { key: 'L', label: 'Liters (L)', fromBase: (v) => v / 1000 },
  { key: 'tsp', label: 'Teaspoons (tsp)', fromBase: (v) => v / 5 },
  { key: 'Tbsp', label: 'Tablespoons (Tbsp)', fromBase: (v) => v / 15 },
  { key: 'g', label: 'Grams (g)', fromBase: (v) => v },
  { key: 'oz', label: 'Ounces (oz)', fromBase: (v, bu) => bu === 'g' ? v / 28.35 : v / 29.57 },
];

function getLiquidUnits(): TreatUnit[] {
  return ['mL', 'tsp', 'Tbsp', 'oz'];
}
function getDryUnits(): TreatUnit[] {
  return ['g', 'oz'];
}
function isLiquidProduct(p: TreatmentProduct): boolean {
  return p.rates[0]?.unit === 'mL' || p.rates[0]?.unit === 'L';
}
function isAreaBased(p: TreatmentProduct | null): boolean {
  return p?.rates[0]?.perVolumeUnit === 'ha';
}
function getUnits(p: TreatmentProduct | null): TreatUnit[] {
  if (!p) return ['mL'];
  if (isAreaBased(p)) {
    const u = p.rates[0]?.unit;
    return u === 'L' ? ['L', 'mL'] : ['mL', 'L'];
  }
  return isLiquidProduct(p) ? getLiquidUnits() : getDryUnits();
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
    if (rate.unit === 'L' && oUnit === 'mL') { min *= 1000; max *= 1000; }
    if (rate.unit === 'mL' && oUnit === 'L') { min /= 1000; max /= 1000; }
    return { min, max };
  }
  const rML = perVolumeToML(rate);
  if (rML <= 0) return null;
  const w = WATER_UNITS.find(u => u.key === wUnit);
  if (!w || w.isArea) return null;
  const scale = (amount * w.toML) / rML;
  const base = (v: number) => v * scale;
  const conv = TREAT_UNITS.find(u => u.key === oUnit);
  if (!conv) return null;
  return { min: conv.fromBase(base(rate.min), rate.unit), max: conv.fromBase(base(rate.max), rate.unit) };
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
const STORE_P = 'tar_presets'; const STORE_H = 'tar_history';
function loadP(): SavedPreset[] { try { return JSON.parse(localStorage.getItem(STORE_P) || '[]'); } catch { return []; } }
function loadH(): CalcHistory[] { try { return JSON.parse(localStorage.getItem(STORE_H) || '[]'); } catch { return []; } }

export function TreatmentAppRatesScreen({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState('');
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

  useEffect(() => { setHistory(loadH()); setPresets(loadP()); }, []);

  const product = useMemo(() => ALL_PRODUCTS.find(p => p.id === selectedId) || null, [selectedId]);
  const rate = useMemo(() => product?.rates[rateIdx] ?? null, [product, rateIdx]);
  const availUnits = useMemo(() => getUnits(product), [product]);

  useEffect(() => {
    if (product && isAreaBased(product)) { setWaterUnit('ha'); }
  }, [product]);

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

  const cbAddHistory = () => {
    if (!product || !rate || !res) return;
    const e: CalcHistory = {
      productName: product.name, rateLabel: rate.label,
      waterAmount: waterNum, waterUnit: WATER_UNITS.find(u => u.key === waterUnit)?.label || waterUnit,
      treatUnit: TREAT_UNITS.find(u => u.key === treatUnit)?.label || treatUnit,
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
    const pr = ALL_PRODUCTS.find(x => x.id === p.productId);
    if (pr) { const i = pr.rates.findIndex(r => r.label === p.rateLabel); setRateIdx(i >= 0 ? i : 0); }
    setShowPres(false);
  };
  const cbDelPreset = (i: number) => { const u = presets.filter((_, j) => j !== i); setPresets(u); localStorage.setItem(STORE_P, JSON.stringify(u)); };

  const activeWaterUnits = useMemo(() => WATER_UNITS.filter(u => product && isAreaBased(product) ? u.isArea : !u.isArea), [product]);

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const f = ALL_PRODUCTS.filter(p => !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.classification.toLowerCase().includes(q));
    const g: { cat: string; items: TreatmentProduct[] }[] = [];
    const fn = f.filter(p => p.category === 'Fungicide');
    const ins = f.filter(p => p.category === 'Insecticide');
    if (fn.length) g.push({ cat: 'Fungicides', items: fn });
    if (ins.length) g.push({ cat: 'Insecticides', items: ins });
    return g;
  }, [search]);

  function fmt(v: number): string {
    if (Math.abs(v) < 0.01) return v.toFixed(3);
    if (Math.abs(v) < 1) return v.toFixed(2);
    return v.toFixed(1);
  }

  return (
    <div className="absolute inset-0 bg-[#f5f5f0] flex flex-col z-[60] animate-in slide-in-from-right duration-300">
      <div className="bg-white border-b border-gray-200 h-14 flex items-center gap-3 px-4 shrink-0">
        <button onClick={onClose} className="w-8 h-8 rounded-lg border bg-[#f9f9f6] text-gray-600 flex items-center justify-center">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="font-semibold text-[16px] flex-1">Treatment App Rates</h2>
        <button onClick={() => { setShowHist(!showHist); setShowPres(false); }} className={`w-8 h-8 rounded-lg border flex items-center justify-center ${showHist ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-[#f9f9f6] text-gray-600'}`}>
          <History className="w-4 h-4" />
        </button>
        <button onClick={() => { setShowPres(!showPres); setShowHist(false); }} className={`w-8 h-8 rounded-lg border flex items-center justify-center ${showPres ? 'bg-yellow-50 text-yellow-600 border-yellow-200' : 'bg-[#f9f9f6] text-gray-600'}`}>
          <Star className="w-4 h-4" />
        </button>
      </div>

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
                    <span className="text-gray-500 ml-1">— {ALL_PRODUCTS.find(x => x.id === p.productId)?.name || p.productId}, {p.waterAmount} {p.waterUnit}</span>
                  </button>
                  <button onClick={() => cbDelPreset(i)} className="text-red-400 hover:text-red-600 ml-2 text-[10px]">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-white border border-[#e0e0e0] rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-sm">1. Select Product</h3>
          <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="mb-2" />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {grouped.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">No products found.</p> : grouped.map(g => (
              <div key={g.cat}>
                <div className="text-[10px] font-bold text-gray-400 uppercase px-1 py-1">{g.cat}</div>
                {g.items.map(p => (
                  <button key={p.id} onClick={() => { setSelectedId(p.id); setRateIdx(0); setSearch(''); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${selectedId === p.id ? 'bg-green-100 text-green-800 font-semibold' : 'hover:bg-gray-50'}`}>
                    <FlaskConical className={`w-4 h-4 shrink-0 ${p.classification === 'Contact' ? 'text-orange-500' : p.classification === 'Systemic' ? 'text-blue-500' : 'text-purple-500'}`} />
                    <span className="flex-1">{p.name}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${p.classification === 'Contact' ? 'bg-orange-50 text-orange-600' : p.classification === 'Systemic' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>{p.classification}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {product && (
          <>
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

            <div className="bg-white border border-[#e0e0e0] rounded-xl p-4">
              <h3 className="font-semibold text-sm">Label Rate</h3>
              <p className="text-lg font-bold text-green-700 mt-1">
                {rate!.min === rate!.max ? `${rate!.min} ${rate!.unit}` : `${rate!.min}–${rate!.max} ${rate!.unit}`}
                {' '}per {rate!.perVolume} {rate!.perVolumeUnit === 'ha' ? 'hectare' : rate!.perVolumeUnit === 'gal' ? 'gal' : 'L'}
              </p>
              {isAreaBased(product) && <p className="text-xs text-amber-600 mt-1">Area-based product — enter area instead of water volume</p>}
            </div>

            <div className="bg-white border border-[#e0e0e0] rounded-xl p-4 space-y-3">
              <h3 className="font-semibold text-sm">{isAreaBased(product) ? '2. Enter Area' : '2. Enter Water Amount'}</h3>
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
              <h3 className="font-semibold text-sm">3. Output Unit</h3>
              <div className="flex flex-wrap gap-2">
                {availUnits.map(u => {
                  const info = TREAT_UNITS.find(t => t.key === u);
                  return <button key={u} onClick={() => setTreatUnit(u)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${treatUnit === u ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600'}`}>{info?.label || u}</button>;
                })}
              </div>
            </div>

            {res && (
              <div className="bg-white border-2 border-green-200 rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-sm text-green-800">Result</h3>
                <div className="text-center py-4">
                  <div className="text-3xl font-bold text-green-700">
                    {fmt(res.min)}{rate!.min !== rate!.max ? ` – ${fmt(res.max)}` : ''}
                    <span className="text-xl ml-1">{TREAT_UNITS.find(u => u.key === treatUnit)?.label || treatUnit}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">for {waterNum} {WATER_UNITS.find(u => u.key === waterUnit)?.label?.split(' ')[0]}{isAreaBased(product) ? '' : ' of water'}</p>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 h-8 text-xs" onClick={cbAddHistory}>Save to History</Button>
                  <Button variant="outline" className="h-8 text-xs" onClick={() => setSavingP(true)}>Save as Mix</Button>
                </div>
              </div>
            )}

            {waterNum <= 0 && rate && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center text-sm text-gray-400">
                Enter {isAreaBased(product) ? 'area' : 'water amount'} to calculate treatment rate
              </div>
            )}

            {allRes && showAll && (
              <div className="bg-white border border-[#e0e0e0] rounded-xl p-4 space-y-2">
                <h3 className="font-semibold text-sm">All Units</h3>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(allRes).map(([unit, vals]) => (
                    <div key={unit} className="bg-gray-50 rounded-lg p-2 text-center">
                      <div className="text-xs text-gray-500 uppercase font-bold">{unit}</div>
                      <div className="font-bold text-sm">{fmt(vals.min)}{vals.min !== vals.max ? ` – ${fmt(vals.max)}` : ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rate && waterNum > 0 && availUnits.length > 1 && (
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="rounded" />
                Show all units
              </label>
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
          </>
        )}

        <div className="bg-white border border-[#e0e0e0] rounded-xl p-4 space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={batchMode} onChange={e => setBatchMode(e.target.checked)} className="rounded" />
            <span className="font-semibold">Batch Mode (Tank Mix)</span>
          </label>
          {batchMode && (
            <div className="space-y-2 mt-2">
              <p className="text-xs text-gray-500">Select multiple products for tank mix calculation:</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {ALL_PRODUCTS.map(p => (
                  <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 rounded p-1">
                    <input type="checkbox" checked={batchIds.includes(p.id)} onChange={e => { if (e.target.checked) setBatchIds([...batchIds, p.id]); else setBatchIds(batchIds.filter(b => b !== p.id)); }} className="rounded" />
                    {p.name}
                  </label>
                ))}
              </div>
              {batchIds.length > 0 && waterNum > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <h4 className="text-xs font-bold text-gray-600 uppercase">Tank Mix Results</h4>
                  {batchIds.map(pid => {
                    const pr = ALL_PRODUCTS.find(x => x.id === pid);
                    if (!pr) return null;
                    const r = pr.rates[0]; if (!r) return null;
                    const c = calc(r, waterNum, waterUnit, treatUnit);
                    return (
                      <div key={pid} className="flex justify-between text-xs">
                        <span>{pr.name}</span>
                        <span className="font-semibold">{c ? `${fmt(c.min)}${c.min !== c.max ? `–${fmt(c.max)}` : ''} ${TREAT_UNITS.find(u => u.key === treatUnit)?.label || treatUnit}` : 'N/A'}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          <strong>Safety Reminder:</strong> Always follow label instructions. Wear proper PPE. Do not exceed recommended rates. Consult CCJ agronomists for crop-specific programs.
        </div>

        {waterNum > 100 && waterUnit === 'gal' && product && !isAreaBased(product) && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-700">
            Water volume exceeds typical application range ({waterNum} gal). Verify your input and consult label guidelines.
          </div>
        )}
      </div>
    </div>
  );
}
