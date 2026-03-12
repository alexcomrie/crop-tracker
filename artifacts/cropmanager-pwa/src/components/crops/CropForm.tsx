import React, { useState } from 'react';
import { BottomSheet } from '../shared/BottomSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '../../store/useAppStore';
import { generateId } from '../../lib/ids';
import { formatDateShort, today } from '../../lib/dates';
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
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [plantDate, setPlantDate] = useState<Date>(date ?? today());
  const cropKeys = Object.keys(cropDb).sort();
  const filtered = cropKeys.filter(k =>
    k.includes(search.toLowerCase()) || (cropDb[k]?.display_name ?? k).toLowerCase().includes(search.toLowerCase())
  );
  const selectedCropData = cropDb[cropKey];

  function reset() {
    setStep(1); setCropKey(''); setVariety(''); setMethod(''); setTrayColors([]); setNotes(''); setSearch(''); setPlantDate(date ?? today());
  }

  async function handleSave() {
    if (!cropKey) return;
    setSaving(true);
    try {
      const cropData = cropDb[cropKey];
      const now = Date.now();
      const id = generateId('CROP');

      let notesStr = notes;
      if (trayColors.length > 0) notesStr = `🎨 Tray: ${trayColors.join(', ')}${notes ? '\n' + notes : ''}`;

      const transplantDate = cropData
        ? calculateTransplantDate(plantDate, null, cropData, [], cropKey, variety)
        : null;
      const baseCrop: Crop = {
        id, cropName: cropData?.display_name ?? cropKey, variety,
        plantingMethod: method, plantStage: 'Seed',
        plantingDate: formatDateShort(plantDate),
        transplantDateScheduled: transplantDate ? formatDateShort(transplantDate) : '',
        transplantDateActual: '', germinationDate: '',
        harvestDateEstimated: '', harvestDateActual: '',
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
        const fungusDates = calcSprayDates(plantDate, cropData.fungus_spray_days ?? []);
        const pestDates = calcSprayDates(plantDate, cropData.pest_spray_days ?? []);
        baseCrop.fungusSprayDates = formatSprayDates(fungusDates);
        baseCrop.pestSprayDates = formatSprayDates(pestDates);
      }

      await db.crops.add(baseCrop);

      if (cropData) {
        const reminders = generateCropReminders(baseCrop, cropData, [], settings.telegramChatId);
        if (reminders.length) await db.reminders.bulkAdd(reminders);
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
                value={plantDate.toISOString().slice(0, 10)}
                onChange={e => {
                  const v = e.target.value;
                  if (v) setPlantDate(new Date(v + 'T00:00:00'));
                }}
                className="w-40 text-sm"
              />
              <p className="text-xs text-muted-foreground">Planting date</p>
            </div>
            <Input placeholder="Search crops..." value={search} onChange={e => setSearch(e.target.value)} className="mb-2" />
            <div className="max-h-60 overflow-y-auto space-y-1">
              {filtered.slice(0, 30).map(k => (
                <button key={k} onClick={() => { setCropKey(k); setStep(2); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-green-50 ${cropKey === k ? 'bg-green-100 font-semibold' : 'bg-gray-50'}`}>
                  {cropDb[k]?.display_name ?? k}
                </button>
              ))}
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
            <p className="text-sm font-medium text-gray-700 mb-2">Step 5: Notes</p>
            <textarea
              className="w-full border rounded-lg p-2 text-sm min-h-[80px]"
              placeholder="Optional notes..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
            <Button className="w-full mt-3" onClick={() => setStep(6)}>Review</Button>
          </div>
        )}

        {step === 6 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Review & Confirm</p>
            <div className="bg-green-50 rounded-lg p-3 space-y-1 text-sm mb-4">
              <p><strong>Crop:</strong> {selectedCropData?.display_name ?? cropKey}</p>
              {variety && <p><strong>Variety:</strong> {variety}</p>}
              <p><strong>Method:</strong> {method}</p>
              <p><strong>Planting Date:</strong> {formatDateShort(plantDate)}</p>
              {trayColors.length > 0 && <p><strong>Tray:</strong> {trayColors.join(', ')}</p>}
              {notes && <p><strong>Notes:</strong> {notes}</p>}
            </div>
            <Button className="w-full bg-green-700 hover:bg-green-800" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : '✅ Confirm & Save'}
            </Button>
          </div>
        )}

        {step > 1 && step < 6 && (
          <button onClick={() => setStep(step - 1)} className="w-full text-sm text-muted-foreground py-2">← Back</button>
        )}
      </div>
    </BottomSheet>
  );
}
