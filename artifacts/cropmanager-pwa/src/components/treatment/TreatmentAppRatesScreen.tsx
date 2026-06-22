import React, { useMemo, useState, useEffect } from 'react';
import { ChevronLeft, History, Star, FlaskConical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ALL_PRODUCTS, type TreatmentProduct, type TreatmentRate } from './treatment-data';

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

function convertValue(v: number, fromUnit: string, toUnit: TreatUnit): number {
  const volRates: Record<string, number> = { mL: 1, L: 1000, gal: 3785.41, fl_oz: 29.5735, tsp: 5, Tbsp: 15, cup: 237, quarter_cup: 59.25, half_cup: 118.5 };
  const weightRates: Record<string, number> = { g: 1, kg: 1000, oz: 28.35, lb: 453.592 };
  if (volRates[fromUnit] !== undefined && volRates[toUnit] !== undefined) return v * volRates[fromUnit] / volRates[toUnit];
  if (weightRates[fromUnit] !== undefined && weightRates[toUnit] !== undefined) return v * weightRates[fromUnit] / weightRates[toUnit];
  return v;
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
  return ['mL', 'L', 'gal', 'fl_oz', 'tsp', 'Tbsp', 'cup', 'quarter_cup', 'half_cup', 'g', 'kg', 'oz', 'lb'];
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
  const baseMin = rate.min * scale;
  const baseMax = rate.max * scale;
  return {
    min: convertValue(baseMin, rate.unit, oUnit),
    max: convertValue(baseMax, rate.unit, oUnit),
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

  // Custom product state
  const [customs, setCustoms] = useState<CustomProduct[]>([]);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [cf, setCf] = useState<CustomProduct>({
    id: '', name: '', category: 'Fungicide', classification: 'Contact',
    rateMin: 0, rateMax: 0, rateUnit: 'mL', perVolume: 3.8, perVolumeUnit: 'L', notes: '',
  });

  useEffect(() => {
    setHistory(loadH()); setPresets(loadP()); setCustoms(loadC());
  }, []);

  const customProducts = useMemo(() => customs.map(customToProduct), [customs]);
  const allProducts = useMemo(() => [...ALL_PRODUCTS, ...customProducts], [customProducts]);

  const product = useMemo(() => allProducts.find(p => p.id === selectedId) || null, [allProducts, selectedId]);
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
    const pr = allProducts.find(x => x.id === p.productId);
    if (pr) { const i = pr.rates.findIndex(r => r.label === p.rateLabel); setRateIdx(i >= 0 ? i : 0); }
    setShowPres(false);
  };
  const cbDelPreset = (i: number) => { const u = presets.filter((_, j) => j !== i); setPresets(u); localStorage.setItem(STORE_P, JSON.stringify(u)); };

  const activeWaterUnits = useMemo(() => WATER_UNITS.filter(u => product && isAreaBased(product) ? u.isArea : !u.isArea), [product]);

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const f = allProducts.filter(p => !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.classification.toLowerCase().includes(q));
    const cats = new Map<string, TreatmentProduct[]>();
    for (const p of f) {
      const cat = p.category === 'Fungicide' ? 'Fungicides' : p.category === 'Insecticide' ? 'Insecticides' : p.category === 'Herbicide' ? 'Herbicides' : p.category === 'Fertilizer' ? 'Fertilizers' : 'Other';
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat)!.push(p);
    }
    return Array.from(cats.entries()).map(([cat, items]) => ({ cat, items }));
  }, [search, allProducts]);

  const cbSaveCustom = () => {
    if (!cf.name.trim() || cf.rateMin <= 0) return;
    const c: CustomProduct = { ...cf, id: `custom_${Date.now()}`, name: cf.name.trim() };
    const u = [...customs, c]; setCustoms(u); localStorage.setItem(STORE_C, JSON.stringify(u));
    setShowCustomForm(false);
    setCf({ id: '', name: '', category: 'Fungicide', classification: 'Contact', rateMin: 0, rateMax: 0, rateUnit: 'mL', perVolume: 3.8, perVolumeUnit: 'L', notes: '' });
  };
  const cbDelCustom = (id: string) => {
    const u = customs.filter(c => c.id !== id); setCustoms(u); localStorage.setItem(STORE_C, JSON.stringify(u));
    if (selectedId === id) { setSelectedId(null); setRateIdx(0); }
  };

  function fmt(v: number): string {
    if (Math.abs(v) < 0.01) return v.toFixed(3);
    if (Math.abs(v) < 1) return v.toFixed(2);
    if (Math.abs(v) < 1000) return v.toFixed(1);
    return v.toFixed(0);
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
                    <span className="text-gray-500 ml-1">— {allProducts.find(x => x.id === p.productId)?.name || p.productId}, {p.waterAmount} {p.waterUnit}</span>
                  </button>
                  <button onClick={() => cbDelPreset(i)} className="text-red-400 hover:text-red-600 ml-2 text-[10px]">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Product Selector */}
        <div className="bg-white border border-[#e0e0e0] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">1. Select Product</h3>
            <button onClick={() => setShowCustomForm(true)} className="text-xs text-blue-600 font-semibold flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Custom
            </button>
          </div>
          <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="mb-2" />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {grouped.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">No products found.</p> : grouped.map(g => (
              <div key={g.cat}>
                <div className="text-[10px] font-bold text-gray-400 uppercase px-1 py-1 flex items-center gap-1">
                  {g.cat}
                  {g.items.some(p => p.isCustom) && <span className="text-blue-400">(custom)</span>}
                </div>
                {g.items.map(p => (
                  <div key={p.id} className="flex items-center gap-1">
                    <button onClick={() => { setSelectedId(p.id); setRateIdx(0); setSearch(''); }}
                      className={`flex-1 text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${selectedId === p.id ? 'bg-green-100 text-green-800 font-semibold' : 'hover:bg-gray-50'}`}>
                      <FlaskConical className={`w-4 h-4 shrink-0 ${p.classification === 'Contact' ? 'text-orange-500' : p.classification === 'Systemic' ? 'text-blue-500' : 'text-purple-500'}`} />
                      <span className="flex-1">{p.name}{p.isCustom ? ' *' : ''}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${p.classification === 'Contact' ? 'bg-orange-50 text-orange-600' : p.classification === 'Systemic' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>{p.classification}</span>
                    </button>
                    {p.isCustom && (
                      <button onClick={() => cbDelCustom(p.id)} className="text-red-300 hover:text-red-500 p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
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
                {rate!.min === rate!.max ? `${fmt(rate!.min)} ${rate!.unit}` : `${fmt(rate!.min)}–${fmt(rate!.max)} ${rate!.unit}`}
                {' '}per {rate!.perVolume} {rate!.perVolumeUnit === 'ha' ? 'hectare' : rate!.perVolumeUnit === 'gal' ? 'gal' : 'L'}
              </p>
              {isAreaBased(product) && <p className="text-xs text-amber-600 mt-1">Area-based — enter hectares/acres below</p>}
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
                    {fmt(res.min)}{rate!.min !== rate!.max ? ` – ${fmt(res.max)}` : ''}
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
              </div>
            )}

            {waterNum <= 0 && rate && (
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

        {/* Batch Mode */}
        <div className="bg-white border border-[#e0e0e0] rounded-xl p-4 space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={batchMode} onChange={e => setBatchMode(e.target.checked)} className="rounded" />
            <span className="font-semibold">Batch Mode (Tank Mix)</span>
          </label>
          {batchMode && (
            <div className="space-y-2 mt-2">
              <p className="text-xs text-gray-500">Select multiple products for tank mix:</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {allProducts.map(p => (
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
                    const pr = allProducts.find(x => x.id === pid);
                    if (!pr) return null;
                    const r = pr.rates[0]; if (!r) return null;
                    const c = calc(r, waterNum, waterUnit, treatUnit);
                    return (
                      <div key={pid} className="flex justify-between text-xs">
                        <span>{pr.name}</span>
                        <span className="font-semibold">{c ? `${fmt(c.min)}${c.min !== c.max ? `–${fmt(c.max)}` : ''} ${UNIT_LABELS[treatUnit] || treatUnit}` : 'N/A'}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Safety Note */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          <strong>Safety Reminder:</strong> Always follow label instructions. Wear proper PPE. Do not exceed recommended rates. Consult CCJ agronomists for crop-specific programs.
        </div>

        {waterNum > 100 && waterUnit === 'gal' && product && !isAreaBased(product) && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-700">
            Water volume exceeds typical application range ({waterNum} gal). Verify your input and consult label guidelines.
          </div>
        )}
      </div>

      {/* Custom Product Form Modal */}
      {showCustomForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base">Add Custom Product</h3>
              <button onClick={() => setShowCustomForm(false)} className="text-gray-400"><ChevronLeft className="w-5 h-5 rotate-90" /></button>
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase">Product Name</label>
              <Input value={cf.name} onChange={e => setCf({...cf, name: e.target.value})} placeholder="e.g. My Custom Spray" className="mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Type</label>
                <select value={cf.category} onChange={e => setCf({...cf, category: e.target.value as any})} className="w-full mt-1 border rounded-lg p-2 text-sm bg-white">
                  <option value="Fungicide">Fungicide</option>
                  <option value="Insecticide">Insecticide</option>
                  <option value="Herbicide">Herbicide</option>
                  <option value="Fertilizer">Fertilizer</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Mode of Action</label>
                <select value={cf.classification} onChange={e => setCf({...cf, classification: e.target.value as any})} className="w-full mt-1 border rounded-lg p-2 text-sm bg-white">
                  <option value="Contact">Contact</option>
                  <option value="Systemic">Systemic</option>
                  <option value="Both">Both</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Rate Min</label>
                <Input type="number" step="0.1" value={cf.rateMin || ''} onChange={e => setCf({...cf, rateMin: parseFloat(e.target.value) || 0})} className="mt-1" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Rate Max</label>
                <Input type="number" step="0.1" value={cf.rateMax || ''} onChange={e => setCf({...cf, rateMax: parseFloat(e.target.value) || 0})} className="mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Rate Unit</label>
                <select value={cf.rateUnit} onChange={e => setCf({...cf, rateUnit: e.target.value as any})} className="w-full mt-1 border rounded-lg p-2 text-sm bg-white">
                  <option value="mL">mL (liquid)</option>
                  <option value="g">g (dry)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase">Per Volume</label>
                <div className="flex gap-2 mt-1">
                  <Input type="number" step="0.1" value={cf.perVolume || ''} onChange={e => setCf({...cf, perVolume: parseFloat(e.target.value) || 0})} className="flex-1" />
                  <select value={cf.perVolumeUnit} onChange={e => setCf({...cf, perVolumeUnit: e.target.value as any})} className="border rounded-lg p-2 text-sm bg-white">
                    <option value="L">L</option>
                    <option value="gal">gal</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase">Notes (optional)</label>
              <Input value={cf.notes} onChange={e => setCf({...cf, notes: e.target.value})} placeholder="Crop-specific instructions..." className="mt-1" />
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
