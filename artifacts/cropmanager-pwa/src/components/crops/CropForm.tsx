import React, { useState, useEffect } from 'react';
import { BottomSheet } from '../shared/BottomSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '../../store/useAppStore';
import { generateId } from '../../lib/ids';
import { formatDateShort, today, addDays } from '../../lib/dates';
import { resolveCropData } from '../../lib/cropDb';
import { calculateHarvestDate, calculateTransplantDate } from '../../lib/harvest';
import { generateCropReminders, calculateBatchPlantingDates } from '../../lib/reminders';
import { calcSprayDates, formatSprayDates } from '../../lib/sprays';
import db from '../../db/db';
import type { Crop } from '../../types';

interface CropFormProps {
  open: boolean;
  onClose: () => void;
  date?: Date;
  editCrop?: Crop;
}

const PLANTING_METHODS = ['Seed Tray', 'Direct Ground', 'Direct Bed', 'Cutting', 'Division', 'Grafted'];
const TRAY_COLORS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Pink', 'White'];

export function CropForm({ open, onClose, date, editCrop }: CropFormProps) {
  const { cropDb, settings } = useAppStore();
  const [step, setStep] = useState(1);
  const [cropKey, setCropKey] = useState(editCrop ? editCrop.cropName.toLowerCase() : '');
  const [variety, setVariety] = useState(editCrop?.variety || '');
  const [method, setMethod] = useState(editCrop?.plantingMethod || '');
  const [trayColors, setTrayColors] = useState<string[]>([]);
  const [notes, setNotes] = useState(editCrop?.notes || '');
  const [isContinuous, setIsContinuous] = useState(editCrop?.isContinuous || false);
  const [freqDays, setFreqDays] = useState(editCrop?.harvestFrequency || 7);
  const [plotArea, setPlotArea] = useState(400); // Default to 400
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [plantDate, setPlantDate] = useState<Date>(editCrop ? new Date(editCrop.plantingDate) : (date ?? today()));

  // Initialize fields if editing
  useEffect(() => {
    if (editCrop) {
      setCropKey(editCrop.cropName.toLowerCase());
      setVariety(editCrop.variety);
      setMethod(editCrop.plantingMethod);
      setNotes(editCrop.notes);
      setIsContinuous(editCrop.isContinuous);
      setPlantDate(new Date(editCrop.plantingDate));
    }
  }, [editCrop]);
  
  // Ensure date is a valid Date object
  const validPlantDate = plantDate instanceof Date && !isNaN(plantDate.getTime()) ? plantDate : today();

  const cropKeys = Object.keys(cropDb).sort();
  const filtered = cropKeys.filter(k => {
    const data = resolveCropData(cropDb, k);
    return k.includes(search.toLowerCase()) || (data?.display_name ?? k).toLowerCase().includes(search.toLowerCase());
  });

  const selectedCropData = cropKey ? resolveCropData(cropDb, cropKey) : null;

  const chResult = React.useMemo(() => {
    if (!selectedCropData || !isContinuous) return null;
    const growDays    = selectedCropData.growing_time_days || 60;
    const harvestWks  = selectedCropData.number_of_weeks_harvest || 1;
    const harvestDays = harvestWks * 7;
    const harvestIntv = selectedCropData.harvest_interval || 7;
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
    const startDateObj = validPlantDate;
    const firstHarvestDate = new Date(startDateObj.getTime() + growDays * 86400000);
    const waitWeeks    = Math.ceil(growDays / 7);

    const upcomingBatches = Array.from({ length: numBatches }).map((_, b) => {
      const plantDay = b * batchOffset;
      const plantDate = new Date(startDateObj.getTime() + plantDay * 86400000);
      const harvDate = new Date(plantDate.getTime() + growDays * 86400000);
      return { batchNumber: b + 1, plantDate, harvDate, plantDay };
    });

    return { isMulti, growDays, harvestWks, harvestDays, harvestIntv, batchOffset, numBatches, subplotArea, waitWeeks, startDateObj, firstHarvestDate, upcomingBatches };
  }, [selectedCropData, isContinuous, freqDays, plotArea, validPlantDate]);

  function reset() {
    setStep(1); setCropKey(''); setVariety(''); setMethod(''); setTrayColors([]); setNotes(''); setIsContinuous(false); setSearch(''); setPlantDate(date ?? today());
  }

  async function handleSave() {
    if (!cropKey || !method) return;
    setSaving(true);
    try {
      const id = editCrop?.id || generateId('CT');
      const now = Date.now();
      const cropData = resolveCropData(cropDb, cropKey);

      let notesStr = notes;
      if (trayColors.length > 0) notesStr = `🎨 Tray: ${trayColors.join(', ')}${notes ? '\n' + notes : ''}`;

      const transplantDate = cropData
        ? calculateTransplantDate(validPlantDate, null, cropData, [], cropKey, variety)
        : null;
      const baseCrop: Crop = {
        id, cropName: cropData?.display_name ?? cropKey, variety,
        plantingMethod: method, plantStage: editCrop?.plantStage || 'Seed',
        plantingDate: formatDateShort(validPlantDate),
        transplantDateScheduled: transplantDate ? formatDateShort(transplantDate) : '',
        transplantDateActual: editCrop?.transplantDateActual || '',
        germinationDate: editCrop?.germinationDate || '',
        harvestDateEstimated: '', 
        harvestDateActual: editCrop?.harvestDateActual || '',
        isContinuous,
        harvestFrequency: isContinuous ? freqDays : undefined,
        numPlots: chResult?.numBatches,
        batchOffset: chResult?.batchOffset,
        nextConsistentPlanting: editCrop?.nextConsistentPlanting || '',
        batchNumber: editCrop?.batchNumber || 1,
        fungusSprayDates: '', pestSprayDates: '',
        status: editCrop?.status || 'Active', 
        notes: notesStr,
        daysSeedGerm: editCrop?.daysSeedGerm || 0, 
        daysGermTransplant: editCrop?.daysGermTransplant || 0, 
        daysTransplantHarvest: editCrop?.daysTransplantHarvest || 0,
        telegramChatId: settings.telegramChatId,
        updatedAt: now,
      };

      if (cropData) {
        const harvestDate = calculateHarvestDate(baseCrop, cropData, []);
        if (harvestDate) baseCrop.harvestDateEstimated = formatDateShort(harvestDate);
        const fungusDates = calcSprayDates(validPlantDate, cropData.fungus_spray_days ?? []);
        const pestDates = calcSprayDates(validPlantDate, cropData.pest_spray_days ?? []);
        baseCrop.fungusSprayDates = formatSprayDates(fungusDates);
        baseCrop.pestSprayDates = formatSprayDates(pestDates);
      }

      if (editCrop) {
        await db.crops.put(baseCrop);
        // Clear existing reminders if re-calculating
        await db.reminders.where('trackingId').equals(id).delete();
      } else {
        await db.crops.add(baseCrop);
      }

      // Generate reminders
      if (cropData) {
        const reminders = generateCropReminders(baseCrop, cropData, [], settings.telegramChatId);
        if (reminders.length > 0) {
          await db.reminders.bulkAdd(reminders);
        }
      }

      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={() => { reset(); onClose(); }} title="Log New Crop" position="center">
      <div className="pt-2 space-y-4">
        {step === 1 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Step 1: Select Crop & Date</p>
            <div className="flex items-center gap-2 mb-2">
              <Input
                type="date"
                value={plantDate ? plantDate.toISOString().slice(0, 10) : ''}
                onChange={e => {
                  const v = e.target.value;
                  if (v) {
                    const [year, month, day] = v.split('-').map(Number);
                    setPlantDate(new Date(year, month - 1, day));
                  }
                }}
                className="w-40 text-sm"
              />
              <p className="text-xs text-muted-foreground">Planting date</p>
            </div>
            <Input placeholder="Search crops..." value={search} onChange={e => setSearch(e.target.value)} className="mb-2" />
            <div className="max-h-60 overflow-y-auto space-y-1">
              {filtered.slice(0, 30).map(k => {
                const data = resolveCropData(cropDb, k);
                return (
                  <button key={k} onClick={() => { 
                    setCropKey(k); 
                    if (data && (data.number_of_weeks_harvest ?? 0) > 1) {
                      setIsContinuous(true);
                    } else {
                      setIsContinuous(false);
                    }
                    setStep(2); 
                  }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-green-50 ${cropKey === k ? 'bg-green-100 font-semibold' : 'bg-gray-50'}`}>
                    {data?.display_name ?? k}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Step 2: Variety</p>
            <p className="text-xs text-muted-foreground mb-2">Crop: <strong>{selectedCropData?.display_name ?? cropKey}</strong></p>
            <div className="flex flex-wrap gap-2 mb-3">
              {(selectedCropData?.varieties ?? []).map(v => (
                <button key={v} onClick={() => setVariety(v)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${variety === v ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300'}`}>
                  {v}
                </button>
              ))}
              <button onClick={() => setVariety('')}
                className={`px-3 py-1.5 rounded-full text-sm border ${variety === '' ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300'}`}>
                None/Other
              </button>
            </div>
            {variety === '' && (
              <Input placeholder="Variety name (optional)" onChange={e => setVariety(e.target.value)} />
            )}
            <Button className="w-full mt-3" onClick={() => setStep(3)}>Next</Button>
          </div>
        )}

        {step === 3 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Step 3: Planting Method</p>
            <div className="flex flex-wrap gap-2">
              {PLANTING_METHODS.map(m => (
                <button key={m} onClick={() => setMethod(m)}
                  className={`px-3 py-2 rounded-full text-sm border ${method === m ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300'}`}>
                  {m}
                </button>
              ))}
            </div>
            <Button className="w-full mt-3" onClick={() => setStep(method === 'Seed Tray' || method === 'Grafted' ? 4 : 5)} disabled={!method}>Next</Button>
          </div>
        )}

        {step === 4 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Step 4: Tray Colour</p>
            <div className="flex flex-wrap gap-2">
              {TRAY_COLORS.map(c => (
                <button key={c} onClick={() => setTrayColors(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                  className={`px-3 py-2 rounded-full text-sm border ${trayColors.includes(c) ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300'}`}>
                  {c}
                </button>
              ))}
            </div>
            <Button className="w-full mt-3" onClick={() => setStep(5)}>Next</Button>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-gray-700">Step 5: Constant Harvest</p>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <p className="text-sm font-medium text-gray-900">Continuous Production?</p>
                <p className="text-[10px] text-gray-500">Enable to generate batch planting schedule</p>
              </div>
              <input
                type="checkbox"
                checked={isContinuous}
                onChange={e => setIsContinuous(e.target.checked)}
                className="w-5 h-5 accent-green-600 cursor-pointer"
              />
            </div>

            {isContinuous && selectedCropData && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-[#888] uppercase tracking-wide">Desired harvest frequency</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {[7,14,21,28].map(d => (
                      <button key={d} onClick={() => setFreqDays(d)} className={`px-3 py-2 rounded-lg border text-[12px] font-medium whitespace-nowrap ${freqDays===d ? 'bg-[#e8f5e8] border-[#2d6a2d] text-[#2d6a2d]' : 'bg-[#f5f5f0] border-[#e0e0e0] text-[#555]'}`}>
                        {d===7?'Weekly':d===14?'2 wks':d===21?'3 wks':'Monthly'}
                      </button>
                    ))}
                  </div>
                </div>

                {chResult && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white border rounded-[12px] p-2 text-center">
                      <div className="text-[20px] font-semibold text-[#2d6a2d] leading-none">{chResult.numBatches}</div>
                      <div className="text-[10px] text-[#888] mt-0.5">Plots Needed</div>
                    </div>
                    <div className="bg-white border rounded-[12px] p-2 text-center">
                      <div className="text-[20px] font-semibold text-[#2d6a2d] leading-none">{chResult.batchOffset}</div>
                      <div className="text-[10px] text-[#888] mt-0.5">Days Between</div>
                    </div>
                  </div>
                )}

                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 space-y-2">
                  <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest">Upcoming Batch Planting Dates</p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {chResult?.upcomingBatches.map(b => (
                      <div key={b.batchNumber} className="flex items-center justify-between text-xs">
                        <span className="font-medium text-amber-900">Batch #{b.batchNumber} {b.batchNumber === 1 ? '(Today)' : ''}</span>
                        <span className="text-amber-700">{formatDateShort(b.plantDate)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[9px] text-amber-600 italic">Dates calculated using C-H Calculator logic</p>
                </div>
              </div>
            )}

            <Button className="w-full mt-3" onClick={() => setStep(6)}>Next</Button>
          </div>
        )}

        {step === 6 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Step 6: Notes</p>
            <textarea
              className="w-full border rounded-lg p-2 text-sm min-h-[80px]"
              placeholder="Optional notes..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
            <Button className="w-full mt-3" onClick={() => setStep(7)}>Review</Button>
          </div>
        )}

        {step === 7 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Review & Confirm</p>
            <div className="bg-green-50 rounded-lg p-3 space-y-1 text-sm mb-4">
              <p><strong>Crop:</strong> {selectedCropData?.display_name ?? cropKey}</p>
              {variety && <p><strong>Variety:</strong> {variety}</p>}
              <p><strong>Method:</strong> {method}</p>
              <p><strong>Planting Date:</strong> {formatDateShort(validPlantDate)}</p>
              {trayColors.length > 0 && <p><strong>Tray:</strong> {trayColors.join(', ')}</p>}
              <p><strong>Continuous:</strong> {isContinuous ? 'Yes' : 'No'}</p>
              {notes && <p><strong>Notes:</strong> {notes}</p>}
            </div>
            <Button className="w-full bg-green-700 hover:bg-green-800" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : '✅ Confirm & Save'}
            </Button>
          </div>
        )}

        {step > 1 && step < 7 && (
          <button onClick={() => setStep(step - 1)} className="w-full text-sm text-muted-foreground py-2">← Back</button>
        )}
      </div>
    </BottomSheet>
  );
}
