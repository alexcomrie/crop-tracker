import React, { useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { resolveCropData, getNonAliasCrops } from '../../lib/cropDb';

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

const CROP_EMOJIS: Record<string, string> = {
  'Leafy Greens': '🥬', 'Brassica': '🥦', 'Fruiting Vegetable': '🍅',
  'Vine / Fruiting Vegetable': '🥒', 'Vine Crop': '🎃', 'Root Crop': '🥕',
  'Grain': '🌽', 'Legume': '🫘', 'Herb': '🌿', 'Bulb': '🧅',
  'Rhizome': '🫚', 'Tuber': '🍠', 'default': '🌱'
};

export function CHCalculatorScreen({ onClose }: { onClose: () => void }) {
  const { cropDb } = useAppStore();
  const crops = useMemo(() => getNonAliasCrops(cropDb), [cropDb]);

  const [step, setStep] = useState<'select'|'result'>('select');
  const [selectedKey, setSelectedKey] = useState<string|null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<''|'single'|'multi'>('');
  const [freqDays, setFreqDays] = useState(7);
  const [plotArea, setPlotArea] = useState(400);
  const [startDate, setStartDate] = useState(todayISO());

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return crops
      .filter(c => (q ? (c.key.includes(q) || c.entry.display_name.toLowerCase().includes(q)) : true))
      .filter(c => {
        const multi = (c.entry.number_of_weeks_harvest || 1) > 1;
        if (typeFilter === 'single') return !multi;
        if (typeFilter === 'multi') return multi;
        return true;
      })
      .sort((a, b) => a.entry.display_name.localeCompare(b.entry.display_name));
  }, [crops, searchQuery, typeFilter]);

  function selectCrop(key: string) {
    setSelectedKey(key);
    setStep('result');
  }

  function fmtShort(d: Date): string {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d.getDate() + ' ' + months[d.getMonth()];
  }
  function fmtFull(d: Date): string {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  const result = useMemo(() => {
    if (!selectedKey) return null;
    const val = cropDb[selectedKey];
    if (!val || 'alias' in val) return null;
    const growDays    = val.growing_time_days || 60;
    const harvestWks  = val.number_of_weeks_harvest || 1;
    const harvestDays = harvestWks * 7;
    const harvestIntv = val.harvest_interval || 7;
    const isMulti     = harvestWks > 1;
    let batchOffset: number;
    if (!isMulti) {
      batchOffset = freqDays;
    } else {
      const naturalOffset = Math.max(harvestDays - harvestIntv, harvestIntv);
      batchOffset = Math.max(naturalOffset, freqDays);
    }
    let numBatches: number;
    if (!isMulti) numBatches = Math.ceil(growDays / batchOffset);
    else numBatches = Math.max(2, Math.ceil(harvestDays / batchOffset));
    const subplotArea  = Math.round((plotArea / numBatches) * 10) / 10;
    const cycleDays    = isMulti ? growDays + harvestDays : growDays;
    const startDateObj = new Date(startDate + 'T00:00:00');
    const firstHarvestDate = new Date(startDateObj.getTime() + growDays * 86400000);
    const waitWeeks    = Math.ceil(growDays / 7);
    const GRID_WEEKS = Math.min(40, Math.ceil((growDays + harvestDays + batchOffset * numBatches) / 7) + 2);
    const gridData: string[][] = [];
    for (let b = 0; b < numBatches; b++) {
      const plantWeek   = Math.floor((b * batchOffset) / 7);
      const harvestWeek = Math.floor((b * batchOffset + growDays) / 7);
      const endWeek     = isMulti ? Math.floor((b * batchOffset + cycleDays) / 7) : harvestWeek + 1;
      const row: string[] = [];
      for (let w = 0; w < GRID_WEEKS; w++) {
        if (w < plantWeek)        row.push('empty');
        else if (w === plantWeek) row.push('plant');
        else if (w < harvestWeek) row.push('grow');
        else if (w < endWeek)     row.push('harvest');
        else                       row.push('empty');
      }
      gridData.push(row);
    }
    return { val, isMulti, growDays, harvestWks, harvestDays, harvestIntv, batchOffset, numBatches, subplotArea, waitWeeks, startDateObj, firstHarvestDate, GRID_WEEKS, gridData };
  }, [selectedKey, cropDb, freqDays, plotArea, startDate]);

  return (
    <div className="absolute inset-0 bg-[#f5f5f0] flex flex-col z-[60] animate-in slide-in-from-right duration-300">
      <div className="bg-white border-b border-gray-200 h-14 flex items-center gap-3 px-4">
        <button onClick={onClose} className="w-8 h-8 rounded-lg border bg-[#f9f9f6] text-gray-600 flex items-center justify-center">‹</button>
        <h2 className="font-semibold text-[16px] flex-1">♻️ C-H Calculator</h2>
      </div>

      {step === 'select' && (
        <div className="flex-1 flex flex-col">
          <div className="bg-white border-b border-gray-200 p-3 flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search crops…" className="pl-7 pr-3 py-2 rounded-lg border bg-[#f5f5f0] w-full text-[14px]" />
            </div>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} className="rounded-lg border bg-[#f5f5f0] px-2 py-2 text-[13px]">
              <option value="">All crops</option>
              <option value="single">Single</option>
              <option value="multi">Multi</option>
            </select>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filtered.map(c => {
              const isMulti = (c.entry.number_of_weeks_harvest || 1) > 1;
              return (
                <div key={c.key} onClick={() => selectCrop(c.key)} className="bg-white border rounded-[12px] p-3 flex items-center gap-3 active:scale-[0.985] cursor-pointer">
                  <div className="w-[38px] h-[38px] rounded-[9px] bg-[#e8f5e8] flex items-center justify-center text-[18px]">{
                    CROP_EMOJIS[c.entry.plant_type] || CROP_EMOJIS['default']
                  }</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">{c.entry.display_name}</div>
                    <div className="text-[11px] text-[#888] truncate">{c.entry.plant_type} · {c.entry.growing_time_days}d grow · {c.entry.number_of_weeks_harvest}wk harvest</div>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-1 rounded-[6px] ${isMulti ? 'bg-[#e8f5e8] text-[#2d6a2d]' : 'bg-[#fef3c7] text-[#d97706]'}`}>{isMulti ? 'Multi' : 'Single'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {step === 'result' && result && (
        <div className="flex-1 flex flex-col">
          <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2">
            <button onClick={() => setStep('select')} className="w-7 h-7 rounded-lg border bg-[#f9f9f6] text-gray-600 flex items-center justify-center">‹</button>
            <div className="text-[14px] font-semibold flex-1">{result.val.display_name}</div>
            <span className={`text-[11px] font-semibold px-2 py-1 rounded-[6px] ${result.isMulti ? 'bg-[#e8f5e8] text-[#2d6a2d]' : 'bg-[#fef3c7] text-[#d97706]'}`}>{result.isMulti ? 'Multi harvest' : 'Single harvest'}</span>
          </div>

          <div className="bg-white border-b border-gray-200 p-4 space-y-2">
            <div className="text-[11px] font-semibold text-[#888] uppercase tracking-wide">Desired harvest frequency</div>
            <div className="flex gap-2 overflow-x-auto">
              {[7,14,21,28].map(d => (
                <button key={d} onClick={() => setFreqDays(d)} className={`px-3 py-2 rounded-lg border text-[12px] font-medium ${freqDays===d ? 'bg-[#e8f5e8] border-[#2d6a2d] text-[#2d6a2d]' : 'bg-[#f5f5f0] border-[#e0e0e0] text-[#555]'}`}>
                  {d===7?'Every week':d===14?'Every 2 wks':d===21?'Every 3 wks':'Monthly'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-[#888] uppercase">Plot area (sq ft)</label>
                <input type="number" min={1} value={plotArea} onChange={e => setPlotArea(parseInt(e.target.value||'0')||0)} className="w-full bg-[#f5f5f0] border rounded-lg px-3 py-2 text-[13px]" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#888] uppercase">Start date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-[#f5f5f0] border rounded-lg px-3 py-2 text-[13px]" />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white border rounded-[12px] p-3 text-center">
                <div className="text-[28px] font-semibold text-[#2d6a2d] leading-none">{result.numBatches}</div>
                <div className="text-[11px] text-[#888] mt-0.5">plots / batches</div>
                <div className="text-[12px] font-medium text-[#555] mt-1">to maintain the cycle</div>
              </div>
              <div className="bg-white border rounded-[12px] p-3 text-center">
                <div className="text-[28px] font-semibold text-[#2d6a2d] leading-none">{Math.round(result.subplotArea)}</div>
                <div className="text-[11px] text-[#888] mt-0.5">sq ft per plot</div>
                <div className="text-[12px] font-medium text-[#555] mt-1">from {plotArea} sq ft total</div>
              </div>
              <div className="bg-white border rounded-[12px] p-3 text-center">
                <div className="text-[28px] font-semibold text-[#2d6a2d] leading-none">{result.batchOffset}</div>
                <div className="text-[11px] text-[#888] mt-0.5">days between plantings</div>
                <div className="text-[12px] font-medium text-[#555] mt-1">planting interval</div>
              </div>
              <div className="bg-white border rounded-[12px] p-3 text-center">
                <div className="text-[28px] font-semibold text-[#2d6a2d] leading-none">{result.waitWeeks}</div>
                <div className="text-[11px] text-[#888] mt-0.5">weeks wait</div>
                <div className="text-[12px] font-medium text-[#555] mt-1">until first harvest</div>
              </div>
            </div>

            <div className="bg-white border rounded-[12px] overflow-hidden">
              <div className="px-4 py-3 border-b text-[13px] font-semibold">🌱 Crop data used</div>
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between"><span className="text-[12px] text-[#888]">Growing time</span><span className="text-[13px] font-semibold">{result.growDays} days</span></div>
                <div className="flex items-center justify-between"><span className="text-[12px] text-[#888]">Harvest duration</span><span className="text-[13px] font-semibold">{result.harvestWks} week(s) ({result.harvestDays}d)</span></div>
                <div className="flex items-center justify-between"><span className="text-[12px] text-[#888]">Harvest interval</span><span className="text-[13px] font-semibold">every {result.harvestIntv} days</span></div>
                <div className="flex items-center justify-between"><span className="text-[12px] text-[#888]">Planting method</span><span className="text-[13px] font-semibold">{result.val.planting_method || '—'}</span></div>
                {result.val.transplant_days != null && <div className="flex items-center justify-between"><span className="text-[12px] text-[#888]">Transplant at</span><span className="text-[13px] font-semibold">{result.val.transplant_days} days</span></div>}
                <div className="flex items-center justify-between"><span className="text-[12px] text-[#888]">Batch offset (DB)</span><span className="text-[13px] font-semibold">{result.val.batch_offset_days}</span></div>
                <div className="flex items-center justify-between"><span className="text-[12px] text-[#888]">Batch offset (used)</span><span className="text-[13px] font-semibold text-[#2d6a2d]">{result.batchOffset}</span></div>
              </div>
            </div>

            <div className="bg-white border rounded-[12px] overflow-hidden">
              <div className="px-4 py-3 border-b text-[13px] font-semibold">🧮 How the numbers work</div>
              <div className="p-3 space-y-2 text-[13px] text-[#555]">
                {!result.isMulti ? (
                  <p>You chose to harvest every {freqDays} days. Each new batch is planted every {result.batchOffset} days. With {result.growDays} days to grow, you need {result.numBatches} batches always in rotation.</p>
                ) : (
                  <p>Offset = harvest duration ({result.harvestDays}d) − harvest interval ({result.harvestIntv}d) = {result.harvestDays - result.harvestIntv}d. Adjusted to match your {freqDays}-day frequency → {result.batchOffset}d.</p>
                )}
                <p>Divide your {plotArea} sq ft into {result.numBatches} plots of ~{Math.round(result.subplotArea)} sq ft each. Plant one plot every {result.batchOffset} days. After {result.waitWeeks} weeks, Plot 1 is ready and you harvest it, then replant it immediately — the cycle repeats indefinitely.</p>
                {result.isMulti && <p className="text-[12px] text-[#888]">For multi-harvest crops, each plot keeps producing for {result.harvestWks} weeks. When Plot 1 starts slowing down, Plot 2 is already in peak harvest — no gap in supply.</p>}
              </div>
            </div>

            <div className="bg-white border rounded-[12px] overflow-hidden">
              <div className="px-4 py-3 border-b text-[13px] font-semibold">📅 Planting schedule</div>
              <div className="divide-y">
                {Array.from({ length: result.numBatches }).map((_, b) => {
                  const plantDay = b * result.batchOffset;
                  const plantDate = new Date(result.startDateObj.getTime() + plantDay * 86400000);
                  const harvDate = new Date(plantDate.getTime() + result.growDays * 86400000);
                  return (
                    <div key={b} className="px-3 py-2 flex items-start gap-3">
                      <div className="pt-1"><div className="w-[10px] h-[10px] rounded-full bg-[#2d6a2d]" /></div>
                      <div className="flex-1">
                        <div className="text-[10px] font-bold text-[#888] uppercase tracking-wide">Plot {b+1} · Day {plantDay} · {fmtShort(plantDate)}</div>
                        <div className="text-[13px] font-medium">Plant batch {b+1}{b===0?' — starting today':''}</div>
                        <div className="text-[11px] text-[#888]">Ready to harvest: {fmtShort(harvDate)} (day {plantDay + result.growDays}){result.isMulti ? ` · harvesting for ${result.harvestWks} weeks` : ''}</div>
                      </div>
                    </div>
                  );
                })}
                <div className="px-3 py-3 bg-[#fef3c7] border-t">
                  <div className="flex items-start gap-3">
                    <div className="pt-1"><div className="w-[10px] h-[10px] rounded-full bg-[#d97706]" /></div>
                    <div className="flex-1">
                      <div className="text-[10px] font-bold text-[#d97706] uppercase tracking-wide">First harvest · Day {result.growDays} · {fmtFull(result.firstHarvestDate)}</div>
                      <div className="text-[13px] font-medium">🥬 Harvest Plot 1 — then replant immediately</div>
                      <div className="text-[11px] text-[#7c3aed]">From here on, harvest every {result.batchOffset} days continuously.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border rounded-[12px] overflow-hidden">
              <div className="px-4 py-3 border-b text-[13px] font-semibold flex items-center justify-between">
                <span>📊 Visual planting calendar</span>
                <span className="text-[11px] text-[#888] font-normal">first {Math.min(result.GRID_WEEKS, 28)} weeks</span>
              </div>
              <div className="overflow-x-auto p-3">
                <table className="border-separate border-spacing-[2px] text-[10px]">
                  <thead>
                    <tr>
                      <th className="text-left text-[#888] font-semibold w-[46px]">Plot</th>
                      {Array.from({ length: Math.min(result.GRID_WEEKS, 28) }).map((_, w) => (
                        <th key={w} className="text-center text-[#888] font-normal w-[18px]">{w % 4 === 0 ? (() => {
                          const dt = new Date(result.startDateObj.getTime() + w * 7 * 86400000);
                          return `${dt.getMonth()+1}/${dt.getDate()}`;
                        })() : (w+1)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.gridData.map((row, b) => (
                      <tr key={b}>
                        <td className="text-[#555] font-semibold">P{b+1}</td>
                        {row.slice(0, Math.min(result.GRID_WEEKS, 28)).map((cell, i) => (
                          <td key={i}><div className={`w-[18px] h-[16px] rounded ${cell==='plant'?'bg-[#2d6a2d]':cell==='grow'?'bg-[#c2e0c2]':cell==='harvest'?'bg-[#d97706]':'bg-[#e8e8e4]'}`} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex gap-3 flex-wrap mt-2 text-[11px] text-[#888]">
                  <div className="flex items-center gap-2"><div className="w-[10px] h-[10px] rounded-[2px] bg-[#2d6a2d]" /> Plant</div>
                  <div className="flex items-center gap-2"><div className="w-[10px] h-[10px] rounded-[2px] bg-[#c2e0c2]" /> Growing</div>
                  <div className="flex items-center gap-2"><div className="w-[10px] h-[10px] rounded-[2px] bg-[#d97706]" /> Harvest</div>
                  <div className="flex items-center gap-2"><div className="w-[10px] h-[10px] rounded-[2px] bg-[#e8e8e4]" /> Empty/replanted</div>
                </div>
              </div>
            </div>

            <div className="bg-white border rounded-[12px] overflow-hidden mb-1">
              <div className="px-4 py-3 border-b text-[13px] font-semibold">💡 Practical tips for {result.val.display_name}</div>
              <div className="p-3 space-y-2 text-[13px] text-[#555]">
                <p>🔄 Label each plot — mark them P1 to P{result.numBatches} so you always know which is next to plant and which is next to harvest.</p>
                <p>🌱 Replant immediately after harvesting each plot. The replanted plot joins the back of the rotation — your cycle stays tight.</p>
                {result.val.transplant_days != null && <p>🪴 Transplant at day {result.val.transplant_days} — start seeds in a tray first to save plot space during germination.</p>}
                <p>📦 At full rotation you'll harvest approximately {Math.floor(plotArea / result.numBatches)} sq ft of {result.val.display_name} every {result.batchOffset} days.</p>
                {!result.isMulti
                  ? <p>⚡ {result.val.display_name} is a single-harvest crop — once you cut it, that plot needs to be replanted. Keep all {result.numBatches} plots staggered and you'll never miss a week.</p>
                  : <p>♻️ {result.val.display_name} keeps producing for {result.harvestWks} weeks per batch — you only need {result.numBatches} large plots, not {result.numBatches * 4}+ tiny ones.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

