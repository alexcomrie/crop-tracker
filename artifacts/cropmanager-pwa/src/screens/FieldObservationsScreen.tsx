import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { useAppStore } from '../store/useAppStore';
import { getNonAliasCrops } from '../lib/cropDb';
import { generateId } from '../lib/ids';
import { DateInput } from '../components/shared/DateInput';
import { TrackingCard } from '../components/observations/TrackingCard';
import { addDiaryEntry } from '../lib/diary';
import { logDeviation } from '../lib/learning';
import { foundationFruitDefault, getPersonalCropData, upsertPersonalFruitMaturity } from '../lib/personalCropDb';
import { formatDateShort, parseDate, daysBetween, today } from '../lib/dates';
import { toast } from 'sonner';
import type { TrackingEntry, ObservationEntry } from '../types';

/**
 * Independent field observations + growth tracking for plants that were
 * never entered into the crop tracker. Stored in the same tables with an
 * empty cropId so crop detail views never mix them in.
 */
export function FieldObservationsScreen() {
  const { settings, cropDb } = useAppStore();

  // Optional foundation crop name: entries are stored under it so they feed
  // the personal database even when the plant was never entered in the tracker.
  // Empty = free-text custom plant.
  const [foundationKey, setFoundationKey] = useState('');
  const [foundationSearch, setFoundationSearch] = useState('');
  const foundationCrops = useMemo(() => getNonAliasCrops(cropDb), [cropDb]);
  const foundationEntry = foundationKey ? foundationCrops.find(c => c.key === foundationKey) ?? null : null;
  const foundationName = foundationEntry ? foundationEntry.entry.display_name : '';
  const foundationMatches = foundationSearch.trim()
    ? foundationCrops
        .filter(c => c.key.includes(foundationSearch.trim().toLowerCase()) || c.entry.display_name.toLowerCase().includes(foundationSearch.trim().toLowerCase()))
        .slice(0, 6)
    : [];

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
  const trackingEntries = useLiveQuery(async () => {
    const all = await db.trackingEntries.toArray().catch((): TrackingEntry[] => []);
    return all.filter(e => !e.cropId);
  }, []) ?? [];
  const observationEntries = useLiveQuery(async () => {
    const all = await db.observationEntries.toArray().catch((): ObservationEntry[] => []);
    return all.filter(e => !e.cropId);
  }, []) ?? [];
  const [obsEntryText, setObsEntryText] = useState<Record<string, string>>({});
  const [obsEntryDate, setObsEntryDate] = useState<Record<string, string>>({});
  const [editingObsId, setEditingObsId] = useState<string | null>(null);
  const [editObsText, setEditObsText] = useState('');

  // Identity for learning: foundation name when picked, else typed plant
  const identityName = foundationName || trackPlant.trim();
  const learnedKey = identityName.toLowerCase();
  const personalFruit = useLiveQuery(
    () => (learnedKey ? getPersonalCropData(learnedKey) : Promise.resolve(null)),
    [learnedKey]
  ) ?? null;
  const fruitDefault = learnedKey ? foundationFruitDefault(learnedKey) : null;

  async function handleAddObservation() {
    if (!obsText.trim()) { toast.error('Write the observation first'); return; }
    const date = parseDate(obsDate) ?? today();
    const plant = foundationName || obsPlant.trim();
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

  async function handleAddObservationEntry(observationId: string) {
    const text = (obsEntryText[observationId] ?? '').trim();
    if (!text) return;
    try {
      const onDate = parseDate(obsEntryDate[observationId] ?? '') ?? today();
      await db.observationEntries.add({
        id: generateId('DE' as never) as string,
        observationId,
        cropId: '',
        date: formatDateShort(onDate),
        text,
        updatedAt: Date.now(),
      } as never);
      setObsEntryText(prev => {
        const next = { ...prev };
        delete next[observationId];
        return next;
      });
    } catch (e) {
      console.error('[field-obs] add observation update failed', { observationId, e });
      toast.error('Could not save update: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleDeleteObservationEntry(entryId: string) {
    try {
      await db.observationEntries.delete(entryId);
    } catch (e) {
      console.error('[field-obs] delete observation update failed', { id: entryId, e });
      toast.error('Delete failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleDeleteObservation(id: string) {
    if (!window.confirm('Delete this observation and its updates?')) return;
    try {
      const entries = await db.observationEntries.where('observationId').equals(id).toArray().catch((): ObservationEntry[] => []);
      await Promise.all(entries.map(e => db.observationEntries.delete(e.id)));
      await db.observationLogs.delete(id);
      if (editingObsId === id) setEditingObsId(null);
      toast.success('Observation deleted');
    } catch (e) {
      console.error('[field-obs] delete observation failed', { id, e });
      toast.error('Delete failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleSaveObservationEdit(oid: string) {
    if (!editObsText.trim()) { toast.error('Observation cannot be empty'); return; }
    try {
      await db.observationLogs.update(oid, { text: editObsText.trim(), updatedAt: Date.now() } as never);
      setEditingObsId(null);
      toast.success('Observation updated');
    } catch (e) {
      console.error('[field-obs] edit observation failed', { id: oid, e });
      toast.error('Could not update observation: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleFailTracking(tid: string) {
    if (!window.confirm('Mark this tracking as failed? It will stop and auto-delete after 30 days.')) return;
    try {
      await db.trackings.update(tid, { status: 'failed', endDate: formatDateShort(today()), updatedAt: Date.now() } as never);
      toast.success('Tracking stopped — failed entries auto-delete after 30 days');
    } catch (e) {
      console.error('[field-obs] fail tracking failed', { id: tid, e });
      toast.error('Could not stop tracking: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleSaveTrackingEdit(tid: string, patch: { label: string; tagNumber: string; startDate: string; notes: string }) {
    try {
      await db.trackings.update(tid, { ...patch, updatedAt: Date.now() } as never);
      toast.success('Tracking updated');
    } catch (e) {
      console.error('[field-obs] edit tracking failed', { id: tid, e });
      toast.error('Could not update tracking: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleAddTrackingEntry(trackingId: string, text: string, dateStr: string) {
    try {
      const onDate = parseDate(dateStr) ?? today();
      await db.trackingEntries.add({
        id: generateId('TR'),
        trackingId,
        cropId: '',
        date: formatDateShort(onDate),
        text,
        updatedAt: Date.now(),
      } as never);
    } catch (e) {
      console.error('[field-obs] add journal entry failed', { trackingId, e });
      toast.error('Could not save entry: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleDeleteTrackingEntry(entryId: string) {
    try {
      await db.trackingEntries.delete(entryId);
    } catch (e) {
      console.error('[field-obs] delete journal entry failed', { id: entryId, e });
      toast.error('Delete failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleAddTracking() {
    const start = parseDate(trackDate) ?? today();
    // Foundation name when picked (feeds personal DB), else free-text plant
    const plant = foundationName || trackPlant.trim();
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
      // Learn the pattern two ways: scalar adjustment trail + personal DB
      // fruit fields (auto-filled from real finishes, seeded from research)
      const rec = trackings.find(t => t.id === tid);
      const key = (rec?.cropName || '').toLowerCase() || 'field';
      const adjustments = await db.cropDbAdjustments.toArray();
      const newAdj = logDeviation(key, 'fruit_maturity_days', elapsed, elapsed, '', adjustments, settings.learningThreshold);
      await db.cropDbAdjustments.put(newAdj as never);
      await upsertPersonalFruitMaturity(rec?.cropName || 'field', elapsed);
      await addDiaryEntry({
        entryType: 'note',
        cropId: rec?.cropId ?? '',
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
    if (!window.confirm('Delete this tracking and its journal?')) return;
    try {
      const entries = await db.trackingEntries.where('trackingId').equals(tid).toArray().catch(() => []);
      await Promise.all(entries.map(e => db.trackingEntries.delete(e.id)));
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
          For plants already growing that were never entered into the crop tracker. Pick a foundation crop below and finishes update its personal database — otherwise entries stay independent under a custom plant name.
        </p>

        <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Crop (optional)</p>
          <p className="text-[10px] text-muted-foreground">Pick a foundation crop so finishes update its personal database — or leave empty for a custom plant.</p>
          {foundationEntry ? (
            <div className="flex items-center justify-between gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <p className="text-sm font-semibold text-green-800 truncate">📎 {foundationEntry.entry.display_name}</p>
              <button onClick={() => { setFoundationKey(''); setFoundationSearch(''); }} className="text-xs text-muted-foreground font-semibold shrink-0">Clear</button>
            </div>
          ) : (
            <>
              <input value={foundationSearch} onChange={e => setFoundationSearch(e.target.value)} placeholder="Search crop names…" className="w-full border rounded-lg p-2 text-sm" />
              {foundationSearch.trim() && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {foundationMatches.length === 0 && <p className="text-xs text-muted-foreground">No matches — leave empty for a custom plant.</p>}
                  {foundationMatches.map(c => (
                    <button key={c.key} onClick={() => { setFoundationKey(c.key); setFoundationSearch(''); }} className="w-full text-left px-3 py-2 rounded-lg text-sm bg-gray-50 hover:bg-green-50 border border-gray-100 truncate">
                      {c.entry.display_name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Observation Log</p>
          {!foundationEntry && (
            <input value={obsPlant} onChange={e => setObsPlant(e.target.value)} placeholder="Plant name (optional)" className="w-full border rounded-lg p-2 text-sm" />
          )}
          <textarea value={obsText} onChange={e => setObsText(e.target.value)} placeholder="Leaf color, pest sighting, watering, weather..."
            className="w-full border rounded-lg p-2 text-sm min-h-[80px]" />
          <DateInput value={obsDate} onChange={setObsDate} ariaLabel="Observation date" />
          <button onClick={handleAddObservation} className="w-full bg-green-700 text-white rounded-lg py-2 text-sm font-semibold">Add Observation</button>
        </div>

        <div className="space-y-1.5">
          {observations.length === 0 && <p className="text-xs text-muted-foreground bg-white rounded-xl p-3 border">No field observations yet</p>}
          {observations.map(o => (
            <div key={o.id} className="bg-white rounded-xl border border-gray-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{o.date}</p>
                <span className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => { setEditingObsId(o.id); setEditObsText(o.text); }}
                    aria-label="Edit observation"
                    title="Edit"
                    className="w-6 h-6 rounded-lg hover:bg-gray-100 text-gray-400 flex items-center justify-center text-sm"
                  >✎</button>
                  <button onClick={() => handleDeleteObservation(o.id)} aria-label="Delete observation" className="text-xs text-red-500 font-semibold">Delete</button>
                </span>
              </div>
              {o.plantName && <p className="text-xs font-semibold text-green-700 mt-0.5">🌱 {o.plantName}</p>}
              {editingObsId === o.id ? (
                <>
                  <textarea value={editObsText} onChange={e => setEditObsText(e.target.value)} className="w-full mt-1 border rounded-lg p-2 text-sm min-h-[80px]" />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleSaveObservationEdit(o.id)} className="flex-1 text-xs font-semibold text-white bg-green-700 rounded-lg py-1.5">Save</button>
                    <button onClick={() => setEditingObsId(null)} className="flex-1 text-xs font-semibold text-gray-600 bg-gray-100 rounded-lg py-1.5">Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm mt-1 whitespace-pre-line">{o.text}</p>
                  {observationEntries.filter(u => u.observationId === o.id).length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                      {observationEntries.filter(u => u.observationId === o.id).map(u => (
                        <div key={u.id} className="flex items-start justify-between gap-2 text-xs">
                          <p className="flex-1"><span className="text-muted-foreground font-semibold mr-1">{u.date}</span><span className="whitespace-pre-line">{u.text}</span></p>
                          <button onClick={() => handleDeleteObservationEntry(u.id)} aria-label="Delete update" className="text-red-400 font-bold shrink-0">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <DateInput
                      value={obsEntryDate[o.id] ?? formatDateShort(today())}
                      onChange={v => setObsEntryDate(prev => ({ ...prev, [o.id]: v }))}
                      ariaLabel="Update date"
                      className="border rounded-lg p-2 text-xs w-[128px] shrink-0 min-h-[36px] bg-white"
                    />
                    <input
                      value={obsEntryText[o.id] ?? ''}
                      onChange={e => setObsEntryText(prev => ({ ...prev, [o.id]: e.target.value }))}
                      placeholder="Log an update…"
                      className="flex-1 border rounded-lg p-2 text-xs min-w-0"
                    />
                    <button
                      onClick={() => handleAddObservationEntry(o.id)}
                      disabled={!(obsEntryText[o.id] ?? '').trim()}
                      className="text-xs font-semibold text-green-700 bg-green-50 rounded-lg px-3 disabled:opacity-40 shrink-0"
                    >Add</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Growth Tracking</p>
          <p className="text-[10px] text-muted-foreground">Track fruit maturation from an event date (e.g. pollination). Tag the physical fruit to match. Expected maturity is learnt from finished trackings.</p>
          {personalFruit && (personalFruit.fruitSampleCount ?? 0) >= 2 && personalFruit.fruitGrowthDays != null ? (
            <p className="text-[11px] bg-[#e8f5e8] text-[#2d6a2d] rounded-lg px-2 py-1.5 font-semibold">🧠 Learned maturity: ~{personalFruit.fruitGrowthDays}d from {personalFruit.fruitSampleCount} tracked fruits</p>
          ) : fruitDefault != null ? (
            <p className="text-[11px] bg-gray-50 text-gray-600 rounded-lg px-2 py-1.5">Typical maturity: ~{fruitDefault}d (research default — your finishes will override it)</p>
          ) : null}
          {!foundationEntry && (
            <input value={trackPlant} onChange={e => setTrackPlant(e.target.value)} placeholder="Plant (e.g. Mango tree)" className="w-full border rounded-lg p-2 text-sm" />
          )}
          <div className="grid grid-cols-2 gap-2">
            <input value={trackLabel} onChange={e => setTrackLabel(e.target.value)} placeholder="Label (e.g. Fruit 1)" className="border rounded-lg p-2 text-sm" />
            <input value={trackTag} onChange={e => setTrackTag(e.target.value)} placeholder="Tag # (optional)" className="border rounded-lg p-2 text-sm" />
          </div>
          <DateInput value={trackDate} onChange={setTrackDate} ariaLabel="Tracking start date" />
          <input value={trackNotes} onChange={e => setTrackNotes(e.target.value)} placeholder="Notes (optional)" className="w-full border rounded-lg p-2 text-sm" />
          <button onClick={handleAddTracking} className="w-full bg-green-700 text-white rounded-lg py-2 text-sm font-semibold">Start Tracking</button>
        </div>

        <div className="space-y-1.5">
          {trackings.filter(t => t.status === 'active').length === 0 && trackings.length === 0 && (
            <p className="text-xs text-muted-foreground bg-white rounded-xl p-3 border">No field trackings yet</p>
          )}
          {trackings
            .filter(t => t.status === 'active')
            .map(t => (
              <TrackingCard
                key={t.id}
                tracking={t}
                entries={trackingEntries.filter(e => e.trackingId === t.id)}
                onFinish={handleFinishTracking}
                onFail={handleFailTracking}
                onDelete={handleDeleteTracking}
                onSaveEdit={handleSaveTrackingEdit}
                onAddEntry={handleAddTrackingEntry}
                onDeleteEntry={handleDeleteTrackingEntry}
              />
            ))}
        </div>
        {(() => {
          const done = trackings.filter(t => t.status !== 'active');
          if (done.length === 0) return null;
          return (
            <details className="bg-white rounded-xl border border-gray-100">
              <summary className="p-3 text-xs font-bold uppercase tracking-widest text-gray-500 cursor-pointer">Completed ({done.length})</summary>
              <div className="px-3 pb-3 space-y-1.5">
                {done.map(t => (
                  <TrackingCard
                    key={t.id}
                    tracking={t}
                    entries={[]}
                    onFinish={handleFinishTracking}
                    onFail={handleFailTracking}
                    onDelete={handleDeleteTracking}
                    onSaveEdit={handleSaveTrackingEdit}
                    onAddEntry={handleAddTrackingEntry}
                    onDeleteEntry={handleDeleteTrackingEntry}
                  />
                ))}
              </div>
            </details>
          );
        })()}
      </div>
    </div>
  );
}
