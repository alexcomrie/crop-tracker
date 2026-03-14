import React, { useState, useEffect } from 'react';
import { BottomSheet } from '../shared/BottomSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '../../store/useAppStore';
import { generateId } from '../../lib/ids';
import { formatDateShort, addDays, today } from '../../lib/dates';
import { getRootingDays } from '../../lib/propagation';
import { generatePropReminders } from '../../lib/reminders';
import db from '../../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Propagation } from '../../types';

const METHODS = ['Cutting', 'Seed', 'Division', 'Layering', 'Grafting'];

interface PropFormProps {
  open: boolean;
  onClose: () => void;
  date?: Date;
  editProp?: Propagation;
}

export function PropForm({ open, onClose, date, editProp }: PropFormProps) {
  const { settings } = useAppStore();
  const [step, setStep] = useState(1);
  const [plantName, setPlantName] = useState(editProp?.plantName || '');
  const [method, setMethod] = useState(editProp?.propagationMethod || '');
  const [notes, setNotes] = useState(editProp?.notes || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editProp) {
      setPlantName(editProp.plantName);
      setMethod(editProp.propagationMethod);
      setNotes(editProp.notes);
    }
  }, [editProp]);

  const propAdjustments = useLiveQuery(() => db.propDbAdjustments.toArray(), []) ?? [];
  const plantDate = editProp ? new Date(editProp.propagationDate) : (date ?? today());

  function reset() { setStep(1); setPlantName(''); setMethod(''); setNotes(''); }

  async function handleSave() {
    setSaving(true);
    try {
      const rootingDays = getRootingDays(plantName, method, propAdjustments);
      const rootStart = addDays(plantDate, rootingDays.min);
      const rootEnd = addDays(plantDate, rootingDays.max);
      const id = editProp?.id || generateId('PROP');
      const prop: Propagation = {
        id,
        plantName,
        propagationDate: formatDateShort(plantDate),
        propagationMethod: method,
        notes,
        expectedRootingStart: formatDateShort(rootStart),
        expectedRootingEnd: formatDateShort(rootEnd),
        actualRootingDate: editProp?.actualRootingDate || '',
        daysToRootActual: editProp?.daysToRootActual || 0,
        status: editProp?.status || 'Propagating',
        telegramChatId: settings.telegramChatId,
        syncStatus: 'pending' as const,
        updatedAt: Date.now(),
      };
      
      if (editProp) {
        await db.propagations.put(prop);
        await db.reminders.where('trackingId').equals(id).delete();
      } else {
        await db.propagations.add(prop);
      }

      const reminders = generatePropReminders(prop, propAdjustments, settings.telegramChatId);
      if (reminders.length) await db.reminders.bulkAdd(reminders);
      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={() => { reset(); onClose(); }} title="Log Propagation" position="center">
      <div className="pt-2 space-y-4">
        {step === 1 && (
          <div>
            <p className="text-sm font-medium mb-2">Step 1: Plant Name</p>
            <Input placeholder="Plant name..." value={plantName} onChange={e => setPlantName(e.target.value)} />
            <Button className="w-full mt-3" onClick={() => setStep(2)} disabled={!plantName}>Next</Button>
          </div>
        )}
        {step === 2 && (
          <div>
            <p className="text-sm font-medium mb-2">Step 2: Method</p>
            <div className="flex flex-wrap gap-2">
              {METHODS.map(m => (
                <button key={m} onClick={() => setMethod(m)}
                  className={`px-3 py-2 rounded-full text-sm border ${method === m ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300'}`}>
                  {m}
                </button>
              ))}
            </div>
            <Button className="w-full mt-3" onClick={() => setStep(3)} disabled={!method}>Next</Button>
          </div>
        )}
        {step === 3 && (
          <div>
            <p className="text-sm font-medium mb-2">Step 3: Notes</p>
            <textarea
              className="w-full border rounded-lg p-2 text-sm min-h-[80px]"
              placeholder="Rooting method notes... e.g. 'dip cutting in rooting gel'"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
            <Button className="w-full mt-3" onClick={() => setStep(4)}>Review</Button>
          </div>
        )}
        {step === 4 && (
          <div>
            <p className="text-sm font-medium mb-3">Review & Confirm</p>
            <div className="bg-green-50 rounded-lg p-3 space-y-1 text-sm mb-4">
              <p><strong>Plant:</strong> {plantName}</p>
              <p><strong>Method:</strong> {method}</p>
              <p><strong>Date:</strong> {formatDateShort(plantDate)}</p>
              {notes && <p><strong>Notes:</strong> {notes}</p>}
            </div>
            <Button className="w-full bg-green-700" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : '✅ Confirm & Save'}
            </Button>
          </div>
        )}
        {step > 1 && <button onClick={() => setStep(step - 1)} className="w-full text-sm text-muted-foreground py-2">← Back</button>}
      </div>
    </BottomSheet>
  );
}
