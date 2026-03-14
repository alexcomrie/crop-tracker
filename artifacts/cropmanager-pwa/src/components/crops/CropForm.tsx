import React, { useState } from 'react';
import { BottomSheet } from '../shared/BottomSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '../../store/useAppStore';
import { generateId } from '../../lib/ids';
import { formatDateShort, today } from '../../lib/dates';
import { resolveCropData } from '../../lib/cropDb';
import { calculateHarvestDate, calculateTransplantDate } from '../../lib/harvest';
import { generateCropReminders } from '../../lib/reminders';
import { calcSprayDates, formatSprayDates } from '../../lib/sprays';
import db from '../../db/db';
import type { Crop } from '../../types';

interface CropFormProps {
  open: boolean;
  onClose: () => void;
  date?: Date;
}

const PLANTING_METHODS = ['Seed Tray', 'Direct Ground', 'Direct Bed', 'Cutting', 'Division', 'Grafted'];
const TRAY_COLORS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Pink', 'White'];

export function CropForm({ open, onClose, date }: CropFormProps) {
  const { cropDb, settings } = useAppStore();
  const [step, setStep] = useState(1);
  const [cropKey, setCropKey] = useState('');
  const [variety, setVariety] = useState('');
  const [method, setMethod] = useState('');
  const [trayColors, setTrayColors] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [isContinuous, setIsContinuous] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [plantDate, setPlantDate] = useState<Date>(date ?? today());
  
  // Ensure date is a valid Date object
  const validPlantDate = plantDate instanceof Date && !isNaN(plantDate.getTime()) ? plantDate : today();

  const cropKeys = Object.keys(cropDb).sort();
  const filtered = cropKeys.filter(k => {
    const data = resolveCropData(cropDb, k);
    return k.includes(search.toLowerCase()) || (data?.display_name ?? k).toLowerCase().includes(search.toLowerCase());
  });

  const selectedCropData = cropKey ? resolveCropData(cropDb, cropKey) : null;

  function reset() {
    setStep(1); setCropKey(''); setVariety(''); setMethod(''); setTrayColors([]); setNotes(''); setIsContinuous(false); setSearch(''); setPlantDate(date ?? today());
  }

  async function handleSave() {
    if (!cropKey || !method) return;
    setSaving(true);
    try {
      const id = generateId('CT');
      const now = Date.now();
      const cropData = resolveCropData(cropDb, cropKey);

      let notesStr = notes;
      if (trayColors.length > 0) notesStr = `🎨 Tray: ${trayColors.join(', ')}${notes ? '\n' + notes : ''}`;

      const transplantDate = cropData
        ? calculateTransplantDate(validPlantDate, null, cropData, [], cropKey, variety)
        : null;
      const baseCrop: Crop = {
        id, cropName: cropData?.display_name ?? cropKey, variety,
        plantingMethod: method, plantStage: 'Seed',
        plantingDate: formatDateShort(validPlantDate),
        transplantDateScheduled: transplantDate ? formatDateShort(transplantDate) : '',
        transplantDateActual: '', germinationDate: '',
        harvestDateEstimated: '', harvestDateActual: '',
        isContinuous,
        nextConsistentPlanting: '', batchNumber: 1,
        fungusSprayDates: '', pestSprayDates: '',
        status: 'Active', notes: notesStr,
        daysSeedGerm: 0, daysGermTransplant: 0, daysTransplantHarvest: 0,
        telegramChatId: settings.telegramChatId,
        syncStatus: 'pending', updatedAt: now,
      };

      if (cropData) {
        const harvestDate = calculateHarvestDate(baseCrop, cropData, []);
        if (harvestDate) baseCrop.harvestDateEstimated = formatDateShort(harvestDate);
        const fungusDates = calcSprayDates(validPlantDate, cropData.fungus_spray_days ?? []);
        const pestDates = calcSprayDates(validPlantDate, cropData.pest_spray_days ?? []);
        baseCrop.fungusSprayDates = formatSprayDates(fungusDates);
        baseCrop.pestSprayDates = formatSprayDates(pestDates);
      }

      await db.crops.add(baseCrop);

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
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Step 5: Constant Harvest</p>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <p className="text-sm font-medium text-gray-900">Continuous Production?</p>
                <p className="text-[10px] text-gray-500">Enable if crop yields multiple harvests over time</p>
              </div>
              <input
                type="checkbox"
                checked={isContinuous}
                onChange={e => setIsContinuous(e.target.checked)}
                className="w-5 h-5 accent-green-600 cursor-pointer"
              />
            </div>
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
