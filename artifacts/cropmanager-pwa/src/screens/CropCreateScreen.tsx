import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { resolveCropData } from '../lib/cropDb';
import { generateId } from '../lib/ids';
import { formatDateShort, today, toIsoDateStr } from '../lib/dates';
import { calculateHarvestDate, calculateTransplantDate } from '../lib/harvest';
import { generateCropReminders } from '../lib/reminders';
import { calcSprayDates, formatSprayDates } from '../lib/sprays';
import { addDiaryEntry } from '../lib/diary';
import { calcBatchOffset, calcNumBatches } from '../lib/continuous';
import { upsertPersonalFromCrop } from '../lib/personalCropDb';
import db from '../db/db';
import { toast } from 'sonner';
import { ROUTES } from '../lib/routes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PLANTING_METHODS = ['Seed Tray','Seed Bed','Direct Bed','Direct Ground','Pot / Container','Cuttings','Division','Grafted','Hydroponic'];
const TRAY_COLORS = ['Red','Orange','Yellow','Green','Blue','Purple','Pink','White'];

export function CropCreateScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const { cropDb, settings } = useAppStore();
  const [step, setStep] = useState(1);
  const [cropKey, setCropKey] = useState('');
  const [variety, setVariety] = useState('');
  const [customVariety, setCustomVariety] = useState('');
  const [method, setMethod] = useState('');
  const [trayColors, setTrayColors] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [isContinuous, setIsContinuous] = useState(false);
  const [freqDays, setFreqDays] = useState(7);
  const [plotArea, setPlotArea] = useState(400);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [plantDate, setPlantDate] = useState<Date>(today());

  const validPlantDate = plantDate instanceof Date && !isNaN(plantDate.getTime()) ? plantDate : today();
  const cropKeys = Object.keys(cropDb).sort();
  const filtered = cropKeys.filter(k => {
    const data = resolveCropData(cropDb, k);
    return k.includes(search.toLowerCase()) || (data?.display_name ?? k).toLowerCase().includes(search.toLowerCase());
  });
  const selectedCropData = cropKey ? resolveCropData(cropDb, cropKey) : null;

  const chResult = useMemo(() => {
    if (!selectedCropData || !isContinuous) return null;
    const growDays = selectedCropData.growing_time_days || 60;
    // Frequency always drives the plan; DB offset only prefilled the control
    const batchOffset = calcBatchOffset(freqDays);
    const numBatches = calcNumBatches(selectedCropData, batchOffset);
    const subplotArea = Math.round((plotArea / numBatches) * 10) / 10;
    const upcomingBatches = Array.from({ length: numBatches }).map((_, b) => {
      const plantDay = b * batchOffset;
      const d = new Date(validPlantDate.getTime() + plantDay * 86400000);
      return { batchNumber: b + 1, plantDate: d };
    });
    return { growDays, batchOffset, numBatches, subplotArea, upcomingBatches };
  }, [selectedCropData, isContinuous, freqDays, plotArea, validPlantDate]);

  const locked = !cropKey;

  async function handleSave() {
    if (!cropKey || !method) { toast.error('Select a crop and planting method first'); return; }
    setSaving(true);
    let step = 'init';
    try {
      const id = editId || generateId('CT');
      const now = Date.now();
      const cropData = resolveCropData(cropDb, cropKey);
      let notesStr = notes;
      if (trayColors.length) notesStr = `🎨 Tray: ${trayColors.join(', ')}${notes ? '\n' + notes : ''}`;
      const transplantDate = cropData ? calculateTransplantDate(validPlantDate, null, cropData, [], cropKey, variety) : null;
      const baseCrop: any = {
        id, cropName: cropData?.display_name ?? cropKey, variety: variety ?? '',
        plantingMethod: method, plantStage: 'Seed',
        plantingDate: formatDateShort(validPlantDate),
        transplantDateScheduled: transplantDate ? formatDateShort(transplantDate) : '',
        transplantDateActual: '',
        germinationDate: '',
        harvestDateEstimated: '',
        harvestDateActual: '',
        isContinuous: !!isContinuous,
        nextConsistentPlanting: '',
        parentCropId: '',
        batchNumber: 1,
        fungusSprayDates: '', pestSprayDates: '',
        fertilizerType: '', fertilizerDays: 0, nextFertilizerDate: '',
        status: 'Active', notes: notesStr ?? '',
        daysSeedGerm: 0, daysGermTransplant: 0, daysTransplantHarvest: 0,
        telegramChatId: settings.telegramChatId ?? '',
        plotId: '', updatedAt: now,
      };
      // Only include optional numeric fields when defined — explicit undefined
      // values can break IndexedDB structured-clone in some browsers.
      if (isContinuous) baseCrop.harvestFrequency = freqDays;
      if (chResult?.numBatches != null) baseCrop.numPlots = chResult.numBatches;
      if (chResult?.batchOffset != null) baseCrop.batchOffset = chResult.batchOffset;
      if (cropData) {
        const harvestDate = calculateHarvestDate(baseCrop, cropData, []);
        if (harvestDate) baseCrop.harvestDateEstimated = formatDateShort(harvestDate);
        baseCrop.fungusSprayDates = formatSprayDates(calcSprayDates(validPlantDate, cropData.fungus_spray_days ?? []));
        baseCrop.pestSprayDates = formatSprayDates(calcSprayDates(validPlantDate, cropData.pest_spray_days ?? []));
      }
      if (editId) {
        step = 'crops.put';
        await db.crops.put(baseCrop);
        step = 'reminders.delete';
        await db.reminders.where('trackingId').equals(id).delete();
      } else {
        step = 'crops.add';
        await db.crops.add(baseCrop);
        step = 'diary.add';
        await addDiaryEntry({ entryType: 'crop_created', cropId: id, cropName: baseCrop.cropName, variety, description: `New crop: ${baseCrop.cropName}`, details: `Method: ${method}` });
        step = 'personal.upsert';
        await upsertPersonalFromCrop(baseCrop);
      }
      if (cropData) {
        step = 'reminders.generate';
        const reminders = generateCropReminders(baseCrop, cropData, [], settings.telegramChatId ?? '');
        if (reminders.length) {
          step = 'reminders.bulkAdd';
          await db.reminders.bulkAdd(reminders as never);
        }
      }
      toast.success(editId ? 'Crop updated' : 'Crop added');
      navigate(ROUTES.CROPS);
    } catch (e) {
  console.error('Save failed at step:', step, e);
  const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  toast.error(`Failed to save at ${step}: ${msg}`);
} finally { setSaving(false); }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 pt-2">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-md mx-auto flex items-center gap-3 px-4 py-3">
          <h1 className="font-semibold text-[15px]">{editId ? 'Edit Crop' : 'New Crop'}</h1>
          <span className="ml-auto text-[11px] text-muted-foreground">Step {step}/7</span>
        </div>
        <div className="max-w-md mx-auto px-4 pb-2">
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full bg-green-700 transition-all" style={{ width: `${(step/7)*100}%` }} />
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-4 space-y-4">
        {step === 1 && (
          <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Select Crop & Date</p>
            <div className="flex items-center gap-2">
              <Input type="date" value={toIsoDateStr(validPlantDate)} onChange={e=>{
                const v=e.target.value; if(v){ const [y,m,d]=v.split('-').map(Number); setPlantDate(new Date(y,m-1,d)); }
              }} className="w-40 text-sm" />
              <p className="text-xs text-muted-foreground">Planting date</p>
            </div>
            <Input placeholder="Search crops..." value={search} onChange={e=>setSearch(e.target.value)} />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {filtered.slice(0,30).map(k=>{
                const data=resolveCropData(cropDb,k);
                return (
                  <button key={k} onClick={()=>{
                    setCropKey(k);
                    if(data && (data.number_of_weeks_harvest??0)>1) setIsContinuous(true); else setIsContinuous(false);
                    if (data && data.batch_offset_days && data.batch_offset_days > 0) setFreqDays(data.batch_offset_days);
                  }} className={`w-full text-left px-3 py-2 rounded-lg text-sm ${cropKey===k?'bg-green-100 font-semibold':'bg-gray-50 hover:bg-green-50'}`}>
                    {data?.display_name ?? k}
                  </button>
                );
              })}
            </div>
            <Button className="w-full" disabled={!cropKey} onClick={()=>setStep(2)}>Next</Button>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Variety</p>
            <p className="text-xs text-muted-foreground">Crop: <strong>{selectedCropData?.display_name ?? cropKey}</strong></p>
            <div className="flex flex-wrap gap-2">
              {(selectedCropData?.varieties ?? []).map(v=>(
                <button key={v} onClick={()=>{ setVariety(v); setCustomVariety(''); }} className={`px-3 py-1.5 rounded-full text-sm border ${variety===v?'bg-green-600 text-white border-green-600':'bg-white border-gray-300'}`}>{v}</button>
              ))}
              <button onClick={()=>{ setVariety(''); setCustomVariety(''); }} className={`px-3 py-1.5 rounded-full text-sm border ${!(selectedCropData?.varieties ?? []).includes(variety)?'bg-green-600 text-white border-green-600':'bg-white border-gray-300'}`}>None/Other</button>
            </div>
            {!(selectedCropData?.varieties ?? []).includes(variety) && (
              <Input placeholder="Variety name (optional)" value={customVariety} onChange={e=>{ setCustomVariety(e.target.value); setVariety(e.target.value); }} />
            )}
            <Button className="w-full" onClick={()=>setStep(3)}>Next</Button>
            <button onClick={()=>setStep(1)} className="w-full text-sm text-muted-foreground">← Back</button>
          </div>
        )}

        {step === 3 && (
          <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Planting Method</p>
            <div className={`flex flex-wrap gap-2 ${locked?'opacity-40 pointer-events-none':''}`}>
              {PLANTING_METHODS.map(m=>(
                <button key={m} onClick={()=>setMethod(m)} className={`px-3 py-2 rounded-full text-sm border ${method===m?'bg-green-600 text-white border-green-600':'bg-white border-gray-300'}`}>{m}</button>
              ))}
            </div>
            {locked && <p className="text-xs text-amber-600">Select a crop first</p>}
            <Button className="w-full" disabled={!method || locked} onClick={()=>setStep(method==='Seed Tray' || method==='Grafted' ? 4 : 5)}>Next</Button>
            <button onClick={()=>setStep(2)} className="w-full text-sm text-muted-foreground">← Back</button>
          </div>
        )}

        {step === 4 && (
          <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Tray Colour</p>
            <div className="flex flex-wrap gap-2">
              {TRAY_COLORS.map(c=>(
                <button key={c} onClick={()=>setTrayColors(prev=>prev.includes(c)?prev.filter(x=>x!==c):[...prev,c])} className={`px-3 py-2 rounded-full text-sm border ${trayColors.includes(c)?'bg-green-600 text-white border-green-600':'bg-white border-gray-300'}`}>{c}</button>
              ))}
            </div>
            <Button className="w-full" onClick={()=>setStep(5)}>Next</Button>
            <button onClick={()=>setStep(3)} className="w-full text-sm text-muted-foreground">← Back</button>
          </div>
        )}

        {step === 5 && (
          <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Continuous Harvest</p>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
              <div><p className="text-sm font-medium">Continuous Production?</p><p className="text-[10px] text-gray-500">Batch schedule</p></div>
              <input type="checkbox" checked={isContinuous} onChange={e=>setIsContinuous(e.target.checked)} className="w-5 h-5 accent-green-600" />
            </div>
            {isContinuous && chResult && (
              <div className="space-y-2">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">Harvest frequency</label>
                  <div className="flex gap-2 overflow-x-auto">
                    {[7,14,21,28].map(d => (
                      <button key={d} onClick={()=>setFreqDays(d)} className={`px-3 py-2 rounded-lg border text-[12px] font-medium shrink-0 ${freqDays===d ? 'bg-green-50 border-green-600 text-green-700' : 'bg-white border-gray-300 text-gray-700'}`}>
                        {d===7?'Weekly':d===14?'2 wks':d===21?'3 wks':'Monthly'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">Total plot area (sq ft)</label>
                  <Input type="number" min={1} value={String(plotArea)} onChange={e=>setPlotArea(Math.max(1, parseInt(e.target.value || '0', 10) || 0))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white border rounded-xl p-2 text-center"><div className="text-xl font-semibold text-green-700">{chResult.numBatches}</div><div className="text-[10px] text-gray-500">Plots</div></div>
                  <div className="bg-white border rounded-xl p-2 text-center"><div className="text-xl font-semibold text-green-700">{chResult.batchOffset}</div><div className="text-[10px] text-gray-500">Days Between</div></div>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-2">
                  <p className="text-[10px] font-bold uppercase text-amber-800">Upcoming Batches</p>
                  {chResult.upcomingBatches.slice(0,6).map(b=>(<div key={b.batchNumber} className="flex justify-between text-xs"><span>Batch #{b.batchNumber}</span><span>{formatDateShort(b.plantDate)}</span></div>))}
                </div>
              </div>
            )}
            <Button className="w-full" onClick={()=>setStep(6)}>Next</Button>
            <button onClick={()=>setStep(method==='Seed Tray' ? 4 : 3)} className="w-full text-sm text-muted-foreground">← Back</button>
          </div>
        )}

        {step === 6 && (
          <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Notes</p>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes..." className="w-full border rounded-lg p-2 text-sm min-h-[80px]" />
            <Button className="w-full" onClick={()=>setStep(7)}>Review</Button>
            <button onClick={()=>setStep(5)} className="w-full text-sm text-muted-foreground">← Back</button>
          </div>
        )}

        {step === 7 && (
          <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Review & Confirm</p>
            <div className="bg-green-50 rounded-lg p-3 text-sm space-y-1">
              <p><strong>Crop:</strong> {selectedCropData?.display_name ?? cropKey}</p>
              {variety && <p><strong>Variety:</strong> {variety}</p>}
              <p><strong>Method:</strong> {method}</p>
              <p><strong>Date:</strong> {formatDateShort(validPlantDate)}</p>
              {trayColors.length>0 && <p><strong>Tray:</strong> {trayColors.join(', ')}</p>}
              <p><strong>Continuous:</strong> {isContinuous?'Yes':'No'}</p>
              {notes && <p><strong>Notes:</strong> {notes}</p>}
            </div>
            <Button className="w-full bg-green-700 hover:bg-green-800" disabled={saving} onClick={handleSave}>{saving?'Saving...':'✅ Confirm & Save'}</Button>
            <button onClick={()=>setStep(6)} className="w-full text-sm text-muted-foreground">← Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
