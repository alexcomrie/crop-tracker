import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { useAppStore } from '../store/useAppStore';
import { generateId } from '../lib/ids';
import { TrackingCard } from '../components/observations/TrackingCard';
import { addDiaryEntry } from '../lib/diary';
import { logDeviation } from '../lib/learning';
import { formatDateShort, parseDate, daysBetween, today, toInputDateStr, fromInputDateStr } from '../lib/dates';
import { toast } from 'sonner';

/**
 * Independent field observations + growth tracking for plants that were
 * never entered into the crop tracker. Stored in the same tables with an
 * empty cropId so crop detail views never mix them in.
 */
export function FieldObservationsScreen() {
  const { settings } = useAppStore();

  // Observation form
  const [obsPlant, setObsPlant] = useState('');
  const [obsText, setObsText] = useState('');
  const [obsDate, setObsDate] = useState(formatDateShort(today()));

  // Tracking form
  const [trackPlant, setTrackPlant] = useState('');
  const [trackLabel, setTrackLabel] = useState('');
  const [trackTag, setTrackTag] = useState('');
  const [trackDate, setTrackDate] = useState(formatDateShort(today()));
  const [trackNotes, setTrackNotes] = useState('');

  const observations = useLiveQuery(async () => {
    const all = await db.observationLogs.toArray().catch(() => []);
    return all
      .filter(o => !o.cropId)
      .sort((a, b) => (parseDate(b.date)?.getTime() ?? 0) - (parseDate(a.date)?.getTime() ?? 0));
  }, []) ?? [];

  const trackings = useLiveQuery(async () => {
    const all = await db.trackings.toArray().catch(() => []);
    return all
      .filter(t => !t.cropId)
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        return (parseDate(b.startDate)?.getTime() ?? 0) - (parseDate(a.startDate)?.getTime() ?? 0);
      });
  }, []) ?? [];

  // Learned maturity for whatever plant name is currently typed
  const learnedKey = trackPlant.trim().toLowerCase();
  const fruitLearn = useLiveQuery(async () => {
    if (!learnedKey) return null;
    const all = await db.cropDbAdjustments.where('cropKey').equals(learnedKey).toArray().catch(() => []);
    return all.find(a => a.field === 'fruit_maturity_days') ?? null;
  }, [learnedKey]) ?? null;

  async function handleAddObservation() {
    if (!obsText.trim()) { toast.error('Write the observation first'); return; }
    const date = parseDate(obsDate) ?? today();
    const plant = obsPlant.trim();
    try {
      await db.observationLogs.add({
        id: generateId('DE' as never) as string,
        cropId: '',
        date: formatDateShort(date),
        text: obsText.trim(),
        plantName: plant,
        updatedAt: Date.now(),
      } as never);
      await addDiaryEntry({
        entryType: 'note',
        cropId: '',
        cropName: plant || 'Field note',
        variety: '',
        description: `Field observation: ${obsText.trim().slice(0, 40)}`,
        details: obsText.trim(),
        date: formatDateShort(date),
      });
      setObsText('');
      setObsDate(formatDateShort(today()));
      toast.success('Observation saved');
    } catch (e) {
      console.error('[field-obs] add observation failed', { e });
      toast.error('Could not save observation: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleDeleteObservation(id: string) {
    if (!window.confirm('Delete this observation?')) return;
    try {
      await db.observationLogs.delete(id);
    } catch (e) {
      console.error('[field-obs] delete observation failed', { id, e });
      toast.error('Delete failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleAddTracking() {
    const start = parseDate(trackDate) ?? today();
    const plant = trackPlant.trim();
    try {
      await db.trackings.add({
        id: generateId('TR'),
        cropId: '',
        cropName: plant,
        tagNumber: trackTag.trim(),
        label: trackLabel.trim() || plant || 'Fruit',
        startDate: formatDateShort(start),
        targetDays: 0,
        notes: trackNotes.trim(),
        status: 'active',
        endDate: '',
        updatedAt: Date.now(),
      } as never);
      await addDiaryEntry({
        entryType: 'note',
        cropId: '',
        cropName: plant || 'Field tracking',
        variety: '',
        description: `Tracking started${trackTag.trim() ? ` #${trackTag.trim()}` : ''}: ${trackLabel.trim() || plant || 'Fruit'}`,
        details: '',
        date: formatDateShort(start),
      });
      setTrackLabel(''); setTrackTag(''); setTrackNotes('');
      setTrackDate(formatDateShort(today()));
      toast.success('Tracking started');
    } catch (e) {
      console.error('[field-obs] add tracking failed', { e });
      toast.error('Could not start tracking: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleFinishTracking(tid: string, startDateStr: string, label: string) {
    try {
      const start = parseDate(startDateStr) ?? today();
      const end = today();
      const elapsed = Math.max(0, daysBetween(start, end));
      const endStr = formatDateShort(end);
      await db.trackings.update(tid, { status: 'done', endDate: endStr, updatedAt: Date.now() } as never);
      // Learn the pattern even for untracked plants: first sample sets the baseline
      const key = (trackings.find(t => t.id === tid)?.cropName || '').toLowerCase() || 'field';
      const adjustments = await db.cropDbAdjustments.toArray();
      const newAdj = logDeviation(key, 'fruit_maturity_days', elapsed, elapsed, '', adjustments, settings.learningThreshold);
      await db.cropDbAdjustments.put(newAdj as never);
      await addDiaryEntry({
        entryType: 'note',
        cropId: '',
        cropName: label,
        variety: '',
        description: `Tracking finished: ${label} matured in ${elapsed}d`,
        details: '',
        date: endStr,
      });
      toast.success(`Matured in ${elapsed}d — pattern learnt`);
    } catch (e) {
      console.error('[field-obs] finish tracking failed', { id: tid, e });
      toast.error('Could not complete tracking: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleDeleteTracking(tid: string) {
    if (!window.confirm('Delete this tracking?')) return;
    try {
      await db.trackings.delete(tid);
      toast.success('Tracking deleted');
    } catch (e) {
      console.error('[field-obs] delete tracking failed', { id: tid, e });
      toast.error('Delete failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 pt-2">
      <div className="max-w-md mx-auto px-4 space-y-4">
        <p className="text-[11px] text-muted-foreground">
          For plants already growing that were never entered into the crop tracker. Entries here never mix with crop records.
        </p>

        <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Observation Log</p>
          <input value={obsPlant} onChange={e => setObsPlant(e.target.value)} placeholder="Plant name (optional)" className="w-full border rounded-lg p-2 text-sm" />
          <textarea value={obsText} onChange={e => setObsText(e.target.value)} placeholder="Leaf color, pest sighting, watering, weather..."
            className="w-full border rounded-lg p-2 text-sm min-h-[80px]" />
          <input type="date" value={toInputDateStr(obsDate)} onChange={e => {
            const v = fromInputDateStr(e.target.value); if (v) setObsDate(v);
          }} className="w-full border rounded-lg p-2 text-sm" />
          <button onClick={handleAddObservation} className="w-full bg-green-700 text-white rounded-lg py-2 text-sm font-semibold">Add Observation</button>
        </div>

        <div className="space-y-1.5">
          {observations.length === 0 && <p className="text-xs text-muted-foreground bg-white rounded-xl p-3 border">No field observations yet</p>}
          {observations.map(o => (
            <div key={o.id} className="bg-white rounded-xl border border-gray-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{o.date}</p>
                <button onClick={() => handleDeleteObservation(o.id)} aria-label="Delete observation" className="text-xs text-red-500 font-semibold shrink-0">Delete</button>
              </div>
              {o.plantName && <p className="text-xs font-semibold text-green-700 mt-0.5">🌱 {o.plantName}</p>}
              <p className="text-sm mt-1 whitespace-pre-line">{o.text}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Growth Tracking</p>
          <p className="text-[10px] text-muted-foreground">Track fruit maturation from an event date (e.g. pollination). Tag the physical fruit to match. Expected maturity is learnt from finished trackings.</p>
          {fruitLearn && fruitLearn.sampleCount >= 2 && (
            <p className="text-[11px] bg-[#e8f5e8] text-[#2d6a2d] rounded-lg px-2 py-1.5 font-semibold">🧠 Learned maturity: ~{Math.round(fruitLearn.yourAverage)}d from {fruitLearn.sampleCount} tracked fruits</p>
          )}
          <input value={trackPlant} onChange={e => setTrackPlant(e.target.value)} placeholder="Plant (e.g. Mango tree)" className="w-full border rounded-lg p-2 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <input value={trackLabel} onChange={e => setTrackLabel(e.target.value)} placeholder="Label (e.g. Fruit 1)" className="border rounded-lg p-2 text-sm" />
            <input value={trackTag} onChange={e => setTrackTag(e.target.value)} placeholder="Tag # (optional)" className="border rounded-lg p-2 text-sm" />
          </div>
          <input type="date" value={toInputDateStr(trackDate)} onChange={e => {
            const v = fromInputDateStr(e.target.value); if (v) setTrackDate(v);
          }} className="w-full border rounded-lg p-2 text-sm" />
          <input value={trackNotes} onChange={e => setTrackNotes(e.target.value)} placeholder="Notes (optional)" className="w-full border rounded-lg p-2 text-sm" />
          <button onClick={handleAddTracking} className="w-full bg-green-700 text-white rounded-lg py-2 text-sm font-semibold">Start Tracking</button>
        </div>

        <div className="space-y-1.5">
          {trackings.length === 0 && <p className="text-xs text-muted-foreground bg-white rounded-xl p-3 border">No field trackings yet</p>}
          {trackings.map(t => (
            <TrackingCard key={t.id} tracking={t} onFinish={handleFinishTracking} onDelete={handleDeleteTracking} />
          ))}
        </div>
      </div>
    </div>
  );
}
