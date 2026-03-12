import React, { useState } from 'react';
import { BottomSheet } from '../shared/BottomSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Crop } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { VALID_NEXT_STAGES } from '../../lib/stages';
import { processStageChange } from '../../lib/stages';
import { formatDateShort, today } from '../../lib/dates';
import db from '../../db/db';
import { generateId } from '../../lib/ids';

interface UpdateCropFormProps {
  crop: Crop;
  open: boolean;
  onClose: () => void;
}

type UpdateMode = 'stage' | 'treatment' | 'notes';

export function UpdateCropForm({ crop, open, onClose }: UpdateCropFormProps) {
  const { cropDb, settings } = useAppStore();
  const [mode, setMode] = useState<UpdateMode>('stage');
  const [newStage, setNewStage] = useState('');
  const [treatmentType, setTreatmentType] = useState('');
  const [product, setProduct] = useState('');
  const [treatmentNotes, setTreatmentNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const cropData = cropDb[crop.cropName.toLowerCase()];
  const validStages = VALID_NEXT_STAGES[crop.plantStage] ?? [];

  async function handleStageChange() {
    if (!newStage) return;
    setSaving(true);
    const dateNow = today();
    const { updatedCrop, stageLog, harvestLog } = processStageChange(crop, newStage, dateNow, cropData ?? {} as any, []);
    await db.crops.put(updatedCrop);
    await db.stageLogs.add(stageLog);
    if (harvestLog) await db.harvestLogs.add(harvestLog);
    setSaving(false);
    setDone(true);
    setTimeout(onClose, 1500);
  }

  async function handleTreatment() {
    if (!treatmentType || !product) return;
    setSaving(true);
    const from = cropData ? (new Date(crop.plantingDate)).getTime() : 0;
    const now = today();
    const daysFromPlanting = from ? Math.round((now.getTime() - from) / 86400000) : 0;
    const treatmentLog = {
      id: generateId('TL'),
      cropId: crop.id,
      cropName: crop.cropName,
      date: formatDateShort(now),
      daysFromPlanting,
      type: treatmentType,
      product,
      notes: treatmentNotes,
      syncStatus: 'pending' as const,
      updatedAt: Date.now(),
    };
    await db.treatmentLogs.add(treatmentLog);
    // Update spray dates on crop
    const update: Partial<Crop> = { syncStatus: 'pending', updatedAt: Date.now() };
    if (treatmentType === 'fungus') update.fungusSprayDates = [crop.fungusSprayDates, formatDateShort(now)].filter(Boolean).join(', ');
    if (treatmentType === 'pest') update.pestSprayDates = [crop.pestSprayDates, formatDateShort(now)].filter(Boolean).join(', ');
    await db.crops.where('id').equals(crop.id).modify(update);
    setSaving(false);
    setDone(true);
    setTimeout(onClose, 1500);
  }

  async function handleNotes() {
    await db.crops.where('id').equals(crop.id).modify({ notes, syncStatus: 'pending', updatedAt: Date.now() });
    setDone(true);
    setTimeout(onClose, 1500);
  }

  if (done) {
    return (
      <BottomSheet open={open} onClose={onClose}>
        <div className="py-8 text-center">
          <p className="text-4xl mb-2">✅</p>
          <p className="font-semibold">Updated!</p>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`Update: ${crop.cropName}`}>
      <div className="pt-2 space-y-4">
        <div className="flex gap-2">
          {(['stage', 'treatment', 'notes'] as UpdateMode[]).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-1.5 rounded-lg text-sm capitalize ${mode === m ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-700'}`}>
              {m}
            </button>
          ))}
        </div>

        {mode === 'stage' && (
          <div>
            <p className="text-sm text-muted-foreground mb-2">Current: <strong>{crop.plantStage}</strong></p>
            <div className="flex flex-wrap gap-2">
              {validStages.map(s => (
                <button key={s} onClick={() => setNewStage(s)}
                  className={`px-3 py-2 rounded-full text-sm border ${newStage === s ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300'}`}>
                  {s}
                </button>
              ))}
            </div>
            {validStages.length === 0 && <p className="text-sm text-muted-foreground">No valid next stages.</p>}
            <Button className="w-full mt-3" onClick={handleStageChange} disabled={!newStage || saving}>
              {saving ? 'Saving...' : 'Confirm Stage Change'}
            </Button>
          </div>
        )}

        {mode === 'treatment' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {['fungus', 'pest', 'fertilizer'].map(t => (
                <button key={t} onClick={() => setTreatmentType(t)}
                  className={`flex-1 py-2 rounded-lg text-sm capitalize ${treatmentType === t ? 'bg-green-700 text-white' : 'bg-gray-100'}`}>
                  {t === 'fungus' ? '🍄' : t === 'pest' ? '🐛' : '💧'} {t}
                </button>
              ))}
            </div>
            <Input placeholder="Product name" value={product} onChange={e => setProduct(e.target.value)} />
            <Input placeholder="Notes (optional)" value={treatmentNotes} onChange={e => setTreatmentNotes(e.target.value)} />
            <Button className="w-full" onClick={handleTreatment} disabled={!treatmentType || !product || saving}>
              {saving ? 'Saving...' : 'Log Treatment'}
            </Button>
          </div>
        )}

        {mode === 'notes' && (
          <div className="space-y-3">
            <textarea
              className="w-full border rounded-lg p-2 text-sm min-h-[100px]"
              placeholder="Notes..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              defaultValue={crop.notes}
            />
            <Button className="w-full" onClick={handleNotes}>Save Notes</Button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
