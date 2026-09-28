import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { useAppStore } from '../store/useAppStore';
import { resolveCropData } from '../lib/cropDb';
import { getEffectiveCropData, getPersonalCropData, foundationFruitDefault, upsertPersonalFruitMaturity } from '../lib/personalCropDb';
import { parseDate, formatDateShort, daysBetween, today, toInputDateStr, fromInputDateStr } from '../lib/dates';
import { CANONICAL_STAGES, STAGE_COLORS, normalizeStage, getValidNextStages, processStageChange } from '../lib/stages';
import { generateId } from '../lib/ids';
import { TrackingCard } from '../components/observations/TrackingCard';
import { addDiaryEntry } from '../lib/diary';
import { logDeviation, scheduleMicroTraining } from '../lib/learning';
import { toast } from 'sonner';
import { ROUTES } from '../lib/routes';
import { Trash2, Sprout, Droplets, Eye, Wheat, ChevronRight } from 'lucide-react';

export function CropDetailsScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { cropDb, settings } = useAppStore();

  const crop = useLiveQuery(() => id ? db.crops.get(id) : undefined, [id]);
  const stageLogs = useLiveQuery(() => id ? db.stageLogs.where('trackingId').equals(id).sortBy('date') : [], [id]) ?? [];
  const harvestLogs = useLiveQuery(() => id ? db.harvestLogs.where('cropTrackingId').equals(id).toArray() : [], [id]) ?? [];
  const treatmentLogs = useLiveQuery(() => id ? db.treatmentLogs.where('cropId').equals(id).sortBy('date') : [], [id]) ?? [];
  const observationLogs = useLiveQuery(() => id ? db.observationLogs.where('cropId').equals(id).sortBy('date') : [], [id]) ?? [];
  const trackings = useLiveQuery(() => id ? db.trackings.where('cropId').equals(id).toArray() : [], [id]) ?? [];
  const personal = useLiveQuery(() => id && crop ? db.personalCropDb.get(crop.cropName.toLowerCase()) : undefined, [crop?.cropName]);

  const [activeSheet, setActiveSheet] = useState<'stages'|'observations'|'treatments'|'harvest'>('stages');
  const [stageDate, setStageDate] = useState(formatDateShort(today()));
  const [selectedStage, setSelectedStage] = useState('');
  const [obsText, setObsText] = useState('');
  const [trackLabel, setTrackLabel] = useState('');
  const [trackTag, setTrackTag] = useState('');
  const [trackDate, setTrackDate] = useState(formatDateShort(today()));
  const [trackNotes, setTrackNotes] = useState('');
  // Personal fruit-maturity record for this crop (auto-filled from finished trackings)
  const personalFruit = useLiveQuery(
    () => (crop ? getPersonalCropData(crop.cropName) : Promise.resolve(null)),
    [crop?.cropName]
  ) ?? null;
  const fruitDefault = crop ? foundationFruitDefault(crop.cropName) : null;
  const [harvestQty, setHarvestQty] = useState('');
  const [harvestNotes, setHarvestNotes] = useState('');
  const [harvestDate, setHarvestDate] = useState(formatDateShort(today()));
  const [treatmentTypes, setTreatmentTypes] = useState<string[]>(['fertilizer']);
  const [treatmentDate, setTreatmentDate] = useState(formatDateShort(today()));
  const [treatmentNotes, setTreatmentNotes] = useState('');
  const [product, setProduct] = useState('');
  const [saving, setSaving] = useState(false);

  function toggleTreatmentType(t: string) {
    setTreatmentTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  // Live personal-override profile (no stale useState mirror of store + Dexie)
  const effectiveData = useLiveQuery(
    () => (crop ? getEffectiveCropData(crop.cropName, cropDb as Record<string, unknown>) : Promise.resolve(null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [crop?.cropName, cropDb]
  ) ?? null;

  if (!crop) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Crop not found</p>
        <button onClick={() => navigate(ROUTES.CROPS)} className="ml-3 text-sm text-green-700 font-semibold">Back</button>
      </div>
    );
  }

  const cropData = (effectiveData as never) ?? resolveCropData(cropDb, crop.cropName);
  const normalizedCurrent = normalizeStage(crop.plantStage);
  const currentIdx = CANONICAL_STAGES.indexOf(normalizedCurrent as never);

  // Build milestone map with dates and deltas
  const stageDateMap = new Map<string, string>();
  stageDateMap.set('Seed', crop.plantingDate);
  stageDateMap.set('Germinated', crop.germinationDate);
  if ((crop as unknown as { upPottedDate?: string }).upPottedDate) stageDateMap.set('Up-planted', (crop as unknown as { upPottedDate: string }).upPottedDate);
  if (crop.transplantDateActual) stageDateMap.set('Transplanted', crop.transplantDateActual);
  for (const sl of stageLogs) {
    // only map canonical
    if ((CANONICAL_STAGES as readonly string[]).includes(sl.stageTo)) stageDateMap.set(sl.stageTo, sl.date);
  }

  const validNext = getValidNextStages(crop.plantStage, cropData as never, crop.plantingMethod);

  async function handleStageChange() {
    if (!crop || !selectedStage) return;
    setSaving(true);
    try {
      const dt = parseDate(stageDate) ?? today();
      const [adjustments, existing] = await Promise.all([
        db.cropDbAdjustments.toArray(),
        db.harvestLogs.where('cropTrackingId').equals(crop.id).toArray(),
      ]);
      const { updatedCrop, stageLog } = processStageChange(crop, selectedStage, dt, cropData as never, adjustments, existing);
      await db.crops.put(updatedCrop as never);
      await db.stageLogs.add(stageLog as never);
      await addDiaryEntry({
        entryType: 'stage_change',
        cropId: crop.id,
        cropName: crop.cropName,
        variety: crop.variety,
        description: `${crop.plantStage} → ${selectedStage}`,
        details: selectedStage === 'Germinated' ? 'Manual germination confirmed' : '',
      });
      toast.success(`Stage → ${selectedStage}`);
      setSelectedStage('');
    } catch (e) {
      console.error('[details] stage change failed', { id: crop.id, selectedStage, e });
      toast.error('Stage change failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddObservation() {
    if (!crop || !obsText.trim()) return;
    try {
      const entry = {
        id: generateId('DE' as never) as string,
        cropId: crop.id,
        date: formatDateShort(today()),
        text: obsText.trim(),
        updatedAt: Date.now(),
      };
      await db.observationLogs.add(entry as never);
      await addDiaryEntry({
        entryType: 'note',
        cropId: crop.id,
        cropName: crop.cropName,
        variety: crop.variety,
        description: `Observation: ${obsText.trim().slice(0, 40)}`,
        details: obsText.trim(),
      });
    setObsText('');
    toast.success('Observation saved');
    } catch (e) {
      console.error('[details] add observation failed', { id: crop.id, e });
      toast.error('Could not save observation: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleAddTracking() {
    if (!crop) return;
    const start = parseDate(trackDate) ?? today();
    try {
      await db.trackings.add({
        id: generateId('TR'),
        cropId: crop.id,
        cropName: crop.cropName,
        tagNumber: trackTag.trim(),
        label: trackLabel.trim() || 'Fruit',
        startDate: formatDateShort(start),
        // No manual target: maturity is learnt from finished trackings, never guessed
        targetDays: 0,
        notes: trackNotes.trim(),
        status: 'active',
        endDate: '',
        updatedAt: Date.now(),
      } as never);
      await addDiaryEntry({
        entryType: 'note',
        cropId: crop.id,
        cropName: crop.cropName,
        variety: crop.variety,
        description: `Tracking started${trackTag.trim() ? ` #${trackTag.trim()}` : ''}: ${trackLabel.trim() || 'Fruit'}`,
        details: '',
        date: formatDateShort(start),
      });
      setTrackLabel(''); setTrackTag(''); setTrackNotes('');
      setTrackDate(formatDateShort(today()));
      toast.success('Tracking started');
    } catch (e) {
      console.error('[details] add tracking failed', { id: crop.id, e });
      toast.error('Could not start tracking: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleFinishTracking(tid: string, startDateStr: string, label: string) {
    if (!crop) return;
    try {
      const start = parseDate(startDateStr) ?? today();
      const end = today();
      const elapsed = Math.max(0, daysBetween(start, end));
      const endStr = formatDateShort(end);
      await db.trackings.update(tid, { status: 'done', endDate: endStr, updatedAt: Date.now() } as never);
      // Learn the pattern: actual maturity days feed the scalar learner so the
      // app can assign expected maturity from real data going forward
      const adjustments = await db.cropDbAdjustments.toArray();
      const dbDefault = (cropData as unknown as { growing_time_days?: number } | null)?.growing_time_days ?? 60;
      const newAdj = logDeviation(crop.cropName, 'fruit_maturity_days', dbDefault, elapsed, crop.variety, adjustments, settings.learningThreshold);
      await db.cropDbAdjustments.put(newAdj as never);
      await upsertPersonalFruitMaturity(crop.cropName, elapsed);
      await addDiaryEntry({
        entryType: 'note',
        cropId: crop.id,
        cropName: crop.cropName,
        variety: crop.variety,
        description: `Tracking finished: ${label} matured in ${elapsed}d`,
        details: '',
        date: endStr,
      });
      toast.success(`Matured in ${elapsed}d — pattern learnt`);
    } catch (e) {
      console.error('[details] finish tracking failed', { id: tid, e });
      toast.error('Could not complete tracking: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleDeleteTracking(tid: string) {
    if (!window.confirm('Delete this tracking?')) return;
    try {
      await db.trackings.delete(tid);
      toast.success('Tracking deleted');
    } catch (e) {
      console.error('[details] delete tracking failed', { id: tid, e });
      toast.error('Delete failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleLogHarvest() {
    if (!crop || !harvestDate) { toast.error('Pick a harvest date first'); return; }
    setSaving(true);
    try {
    const hDate = parseDate(harvestDate) ?? today();
    const planted = parseDate(crop.plantingDate);
    const daysFromPlanting = planted ? daysBetween(planted, hDate) : 0;
    const nextNumber = harvestLogs.length > 0 ? Math.max(...harvestLogs.map(h => h.harvestNumber)) + 1 : 1;
    const est = parseDate(crop.harvestDateEstimated);
    const deviation = est ? daysBetween(est, hDate) : 0;
    const hl = {
      id: generateId('HL'),
      cropTrackingId: crop.id,
      cropName: crop.cropName,
      harvestNumber: nextNumber,
      harvestDate,
      daysFromPlanting,
      deviationFromDb: deviation,
      notes: [harvestQty, harvestNotes].filter(Boolean).join(' · '),
      updatedAt: Date.now(),
    };
    await db.harvestLogs.add(hl as never);
    // update crop last harvest
    await db.crops.update(crop.id, { harvestDateActual: harvestDate, updatedAt: Date.now() } as never);
    // learning
    const adjustments = await db.cropDbAdjustments.toArray();
    const field = crop.transplantDateActual ? 'growing_from_transplant' : 'growing_time_days';
    const dbDefault = field === 'growing_from_transplant'
      ? ((cropData as unknown as { growing_from_transplant?: number })?.growing_from_transplant ?? (cropData as unknown as { growing_time_days?: number })?.growing_time_days ?? 60)
      : ((cropData as unknown as { growing_time_days?: number })?.growing_time_days ?? 60);
    const newAdj = logDeviation(crop.cropName, field, dbDefault, daysFromPlanting, crop.variety, adjustments, settings.learningThreshold);
    await db.cropDbAdjustments.put(newAdj as never);
    // personal DB
    const { upsertPersonalFromCrop } = await import('../lib/personalCropDb');
    await upsertPersonalFromCrop({ ...crop, harvestDateActual: harvestDate } as never, daysFromPlanting);
    // C-H self-tune: actual harvest cadence feeds the learned batch offset
    if (crop.isContinuous) {
      const { medianHarvestGapDays } = await import('../lib/harvest');
      const { logBatchOffset } = await import('../lib/learning');
      const gap = medianHarvestGapDays(
        [...harvestLogs.map(h => h.harvestDate), harvestDate]
          .map(d => parseDate(d))
          .filter((d): d is Date => d !== null)
      );
      if (gap !== null) {
        const batchDbDefault = (cropData as unknown as { batch_offset_days?: number } | null)?.batch_offset_days ?? 7;
        const batchAdj = logBatchOffset(crop.cropName, crop.variety, batchDbDefault, gap, adjustments, settings.learningThreshold);
        await db.cropDbAdjustments.put(batchAdj as never);
      }
    }
    scheduleMicroTraining(cropDb as Record<string, unknown>);
    await addDiaryEntry({
      entryType: 'harvest',
      cropId: crop.id,
      cropName: crop.cropName,
      variety: crop.variety,
      description: `Harvest #${nextNumber}: ${crop.cropName}`,
      details: `${daysFromPlanting}d · ${hl.notes}`,
    });
    toast.success(`Harvest #${nextNumber} logged`);
    setHarvestQty(''); setHarvestNotes('');
    } catch (e) {
      console.error('[details] log harvest failed', { id: crop.id, harvestDate, e });
      toast.error('Could not log harvest: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function handleTreatment() {
    if (!crop || treatmentTypes.length === 0) { toast.error('Select at least one treatment type'); return; }
    if (!product.trim()) { toast.error('Enter a product name first'); return; }
    setSaving(true);
    try {
    const onDate = parseDate(treatmentDate) ?? today();
    const planted = parseDate(crop.plantingDate);
    const daysFromPlanting = planted ? daysBetween(planted, onDate) : 0;
    const dateStr = formatDateShort(onDate);
    const note = treatmentNotes.trim();
    // One log per selected type (shared date/product) — keeps per-type history queryable
    for (const t of treatmentTypes) {
      await db.treatmentLogs.add({
        id: generateId('TL'),
        cropId: crop.id,
        cropName: crop.cropName,
        date: dateStr,
        daysFromPlanting,
        type: t,
        product: product.trim(),
        notes: note,
        updatedAt: Date.now(),
      } as never);
    }
    await addDiaryEntry({
      entryType: 'treatment',
      cropId: crop.id,
      cropName: crop.cropName,
      variety: crop.variety,
      description: `${treatmentTypes.join(' + ')}: ${product.trim()}`,
      details: note,
      date: dateStr,
    });
    setProduct('');
    setTreatmentNotes('');
    toast.success(`Treatment logged (${treatmentTypes.join(' + ')})`);
    } catch (e) {
      console.error('[details] log treatment failed', { id: crop.id, treatmentTypes, e });
      toast.error('Could not log treatment: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 pt-2">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-md mx-auto flex items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-[15px] truncate">{crop.cropName} {crop.variety ? `· ${crop.variety}` : ''}</h1>
            <p className="text-[11px] text-muted-foreground truncate">{crop.plantingMethod} · Planted {crop.plantingDate}</p>
          </div>
          <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full text-white" style={{ backgroundColor: STAGE_COLORS[normalizedCurrent] ?? '#9e9e9e' }}>
            {normalizedCurrent}
          </span>
        </div>
        {/* Milestone progress bar */}
        <div className="max-w-md mx-auto px-4 pb-3 relative">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide snap-x py-1">
            {CANONICAL_STAGES.map((s, idx) => {
              const done = idx < currentIdx || idx === currentIdx;
              const isCurrent = idx === currentIdx;
              const date = stageDateMap.get(s);
              const prevDate = idx > 0 ? stageDateMap.get(CANONICAL_STAGES[idx - 1]) : null;
              let delta: number | null = null;
              if (date && prevDate) {
                const a = parseDate(prevDate);
                const b = parseDate(date);
                if (a && b) delta = daysBetween(a, b);
              }
              return (
                <React.Fragment key={s}>
                  <div className="flex flex-col items-center min-w-[52px]">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 ${done ? 'text-white' : 'bg-white text-gray-400 border-gray-200'}`}
                      style={{ backgroundColor: done ? (STAGE_COLORS[s] ?? '#9e9e9e') : undefined, borderColor: done ? (STAGE_COLORS[s] ?? '#9e9e9e') : undefined }}>
                      {done ? '✓' : idx + 1}
                    </div>
                    <span className={`text-[8px] font-bold mt-1 text-center leading-tight ${isCurrent ? 'text-green-700' : done ? 'text-gray-700' : 'text-gray-400'}`}>{s.replace('Vegetative ', 'V.')}</span>
                    {date && <span className="text-[8px] text-muted-foreground">{date.slice(0, 6)}</span>}
                    {delta !== null && <span className="text-[8px] text-amber-600">+{delta}d</span>}
                  </div>
                  {idx < CANONICAL_STAGES.length - 1 && (
                    <div className={`h-0.5 flex-1 min-w-[8px] rounded ${idx < currentIdx ? 'bg-green-600' : 'bg-gray-200'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <div className="pointer-events-none absolute right-2 top-0 bottom-8 w-8 bg-gradient-to-l from-white to-transparent" />
          <div className="flex items-center gap-2 mt-2 text-[10px]">
            <span className="text-muted-foreground">Est. harvest: <strong className="text-green-700">{crop.harvestDateEstimated || '—'}</strong></span>
            {personal && <span className="ml-auto bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">Personal ×{personal.sampleCount}</span>}
          </div>
        </div>
        {/* Sheet tabs */}
        <div className="max-w-md mx-auto flex gap-1 px-2 overflow-x-auto scrollbar-hide">
          {[
            { k: 'stages', l: 'Stages', i: Sprout },
            { k: 'observations', l: 'Observations', i: Eye },
            { k: 'treatments', l: 'Treatments', i: Droplets },
            { k: 'harvest', l: 'Harvest', i: Wheat },
          ].map(t => (
            <button key={t.k} onClick={() => setActiveSheet(t.k as never)}
              className={`flex items-center gap-1 px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap border ${activeSheet === t.k ? 'bg-green-700 text-white border-green-700' : 'bg-white border-gray-200 text-gray-600'}`}>
              <t.i className="w-3 h-3" /> {t.l}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-4 space-y-4">
        {activeSheet === 'stages' && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Stage Control</p>
              <p className="text-[11px] text-muted-foreground mt-1">Current: <strong>{normalizedCurrent}</strong> · Tap to advance or regress. Seed → Germinated manual, Germinated→Seedling auto 7d, Seedling tray needs Up-potted/Transplant, Transplant→ Vegetative 2-2.5w auto.</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {validNext.map(s => (
                  <button key={s} onClick={() => setSelectedStage(s)}
                    className={`px-3 py-2 rounded-full text-xs border font-semibold ${selectedStage === s ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-200'}`}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <input type="date" className="border rounded-lg px-2 py-1.5 text-xs flex-1" value={toInputDateStr(stageDate)} onChange={e => {
                  const v = fromInputDateStr(e.target.value);
                  if (v) setStageDate(v);
                }} />
                <span className="text-[11px] text-muted-foreground">{stageDate}</span>
              </div>
              <button disabled={!selectedStage || saving} onClick={handleStageChange}
                className="w-full mt-3 bg-green-700 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-40">
                {saving ? 'Saving...' : `Confirm → ${selectedStage || 'select stage'}`}
              </button>
              <p className="text-[10px] text-muted-foreground mt-2">Tinygpt autonomous transitions run in background; you can always regress manual.</p>
              {(() => {
                const planted = parseDate(crop.plantingDate);
                const ageDays = planted ? daysBetween(planted, today()) : 0;
                const showCatchup = ageDays > 30 && stageLogs.length === 0;
                return (<>
                  {showCatchup && (
                    <p className="text-[11px] mt-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-2">
                      Planted {ageDays}d ago with no stage history — log each past stage change with its date below to catch up accurately.
                    </p>
                  )}
                  <label className="flex items-center justify-between mt-2 p-2 bg-gray-50 rounded-lg border cursor-pointer">
                    <span className="text-xs font-medium">Manual hold <span className="text-muted-foreground font-normal">— pause auto-transitions for hand-entered history</span></span>
                    <input
                      type="checkbox"
                      checked={!!crop.autoHold}
                      onChange={async e => {
                        try {
                          await db.crops.update(crop.id, { autoHold: e.target.checked, updatedAt: Date.now() } as never);
                          toast.success(e.target.checked ? 'Auto-update paused' : 'Auto-update resumed');
                        } catch (err) {
                          console.error('[details] auto-hold toggle failed', { id: crop.id, err });
                          toast.error('Could not update: ' + (err instanceof Error ? err.message : String(err)));
                        }
                      }}
                      className="w-5 h-5 accent-green-700"
                    />
                  </label>
                </>);
              })()}
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Stage History</p>
              <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
                {stageLogs.length === 0 && <p className="text-xs text-muted-foreground">No transitions yet</p>}
                {[...stageLogs].reverse().map(sl => (
                  <div key={sl.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                    <span className="font-medium">{sl.stageFrom} <ChevronRight className="inline w-3 h-3" /> {sl.stageTo}</span>
                    <span className="text-muted-foreground">{sl.date} · {sl.daysElapsed}d</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Danger</p>
                <button onClick={async () => {
                  if (!confirm('Delete this crop? All logs removed.')) return;
                  try {
                    await db.crops.delete(crop.id);
                    await db.stageLogs.where('trackingId').equals(crop.id).delete();
                    await db.harvestLogs.where('cropTrackingId').equals(crop.id).delete();
                    await db.observationLogs.where('cropId').equals(crop.id).delete();
                    navigate(ROUTES.CROPS);
                  } catch (e) {
                    console.error('[details] delete crop failed', { id: crop.id, e });
                    toast.error('Delete failed: ' + (e instanceof Error ? e.message : String(e)));
                  }
                }} className="text-xs text-red-600 font-bold flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete Crop</button>
              </div>
            </div>
          </div>
        )}

        {activeSheet === 'observations' && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Observation Log</p>
              <textarea value={obsText} onChange={e => setObsText(e.target.value)} placeholder="Leaf color, pest sighting, watering, weather..."
                className="w-full mt-2 border rounded-lg p-2 text-sm min-h-[80px]" />
              <button onClick={handleAddObservation} className="w-full mt-2 bg-green-700 text-white rounded-lg py-2 text-sm font-semibold">Add Observation</button>
            </div>
            <div className="space-y-1.5">
              {observationLogs.length === 0 && <p className="text-xs text-muted-foreground bg-white rounded-xl p-3 border">No observations yet</p>}
              {[...observationLogs].reverse().map(o => (
                <div key={o.id} className="bg-white rounded-xl border border-gray-100 p-3">
                  <p className="text-xs text-muted-foreground">{o.date}</p>
                  <p className="text-sm mt-1 whitespace-pre-line">{o.text}</p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Growth Tracking</p>
              <p className="text-[10px] text-muted-foreground">Track fruit maturation from an event date (e.g. pollination). Tag the physical fruit to match. Expected maturity is learnt from finished trackings — nothing to guess up front.</p>
              {personalFruit && (personalFruit.fruitSampleCount ?? 0) >= 2 && personalFruit.fruitGrowthDays != null ? (
                <p className="text-[11px] bg-[#e8f5e8] text-[#2d6a2d] rounded-lg px-2 py-1.5 font-semibold">🧠 Learned maturity: ~{personalFruit.fruitGrowthDays}d from {personalFruit.fruitSampleCount} tracked fruits</p>
              ) : fruitDefault != null ? (
                <p className="text-[11px] bg-gray-50 text-gray-600 rounded-lg px-2 py-1.5">Typical maturity: ~{fruitDefault}d (research default — your finishes will override it)</p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <input value={trackLabel} onChange={e=>setTrackLabel(e.target.value)} placeholder="Label (e.g. Watermelon)" className="border rounded-lg p-2 text-sm" />
                <input value={trackTag} onChange={e=>setTrackTag(e.target.value)} placeholder="Tag # (optional)" className="border rounded-lg p-2 text-sm" />
              </div>
              <input type="date" value={toInputDateStr(trackDate)} onChange={e=>{
                const v=fromInputDateStr(e.target.value); if(v) setTrackDate(v);
              }} className="w-full border rounded-lg p-2 text-sm" />
              <input value={trackNotes} onChange={e=>setTrackNotes(e.target.value)} placeholder="Notes (optional)" className="w-full border rounded-lg p-2 text-sm" />
              <button onClick={handleAddTracking} className="w-full bg-green-700 text-white rounded-lg py-2 text-sm font-semibold">Start Tracking</button>
            </div>
            <div className="space-y-1.5">
              {[...trackings]
                .sort((a, b) => {
                  if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
                  return (parseDate(b.startDate)?.getTime() ?? 0) - (parseDate(a.startDate)?.getTime() ?? 0);
                })
                .map(t => (
                  <TrackingCard
                    key={t.id}
                    tracking={t}
                    onFinish={handleFinishTracking}
                    onDelete={handleDeleteTracking}
                  />
                ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Notes</p>
              <textarea defaultValue={crop.notes} placeholder="Observation notes..." id="crop-notes-obs" className="w-full mt-2 border rounded-lg p-2 text-sm min-h-[80px]" />
              <button onClick={async ()=>{
                const el=document.getElementById('crop-notes-obs') as HTMLTextAreaElement | null;
                if(!el) return;
                try {
                  await db.crops.update(crop.id, { notes: el.value, updatedAt: Date.now() } as never);
                  toast.success('Notes saved');
                } catch (e) {
                  console.error('[details] save notes failed', { id: crop.id, e });
                  toast.error('Could not save notes: ' + (e instanceof Error ? e.message : String(e)));
                }
              }} className="w-full mt-2 bg-green-700 text-white rounded-lg py-2 text-sm font-semibold">Save Notes</button>
            </div>
          </div>
        )}

        {activeSheet === 'treatments' && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Treatment</p>
              <div className="flex gap-1">
                {(['fertilizer','pest','fungus'] as const).map(t => (
                  <button key={t} onClick={() => toggleTreatmentType(t)} className={`flex-1 py-2 rounded-lg text-xs capitalize font-semibold ${treatmentTypes.includes(t)?'bg-green-700 text-white':'bg-gray-100'}`}>{treatmentTypes.includes(t) ? '✓ ' : ''}{t}</button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">Select one or more — each gets its own log entry.</p>
              <input type="date" value={toInputDateStr(treatmentDate)} onChange={e=>{
                const v=fromInputDateStr(e.target.value); if(v) setTreatmentDate(v);
              }} className="w-full border rounded-lg p-2 text-sm" />
              <input value={product} onChange={e => setProduct(e.target.value)} placeholder="Product name" className="w-full border rounded-lg p-2 text-sm" />
              <input value={treatmentNotes} onChange={e => setTreatmentNotes(e.target.value)} placeholder="Notes (optional)" className="w-full border rounded-lg p-2 text-sm" />
              <button onClick={handleTreatment} disabled={!product.trim() || treatmentTypes.length===0 || saving} className="w-full bg-green-700 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-40">Log Treatment{treatmentTypes.length>1?` (${treatmentTypes.length})`:''}</button>
            </div>
            <div className="space-y-1.5">
              {treatmentLogs.map(t => (
                <div key={t.id} className="flex gap-2 bg-white rounded-xl border border-gray-100 p-3 text-sm">
                  <span>{t.type === 'fungus' ? '🍄' : t.type === 'pest' ? '🐛' : '💧'}</span>
                  <div className="flex-1">
                    <p className="font-medium">{t.product}</p>
                    <p className="text-xs text-muted-foreground">{t.date} · {t.daysFromPlanting}d</p>
                    {t.notes && <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-line">{t.notes}</p>}
                  </div>
                </div>
              ))}
              {treatmentLogs.length===0 && <p className="text-xs text-muted-foreground bg-white rounded-xl p-3 border">No treatments</p>}
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Notes</p>
              <textarea defaultValue={crop.notes} placeholder="Treatment notes..." id="crop-notes-treat" className="w-full mt-2 border rounded-lg p-2 text-sm min-h-[80px]" />
              <button onClick={async ()=>{
                const el=document.getElementById('crop-notes-treat') as HTMLTextAreaElement | null;
                if(!el) return;
                try {
                  await db.crops.update(crop.id, { notes: el.value, updatedAt: Date.now() } as never);
                  toast.success('Notes saved');
                } catch (e) {
                  console.error('[details] save notes failed', { id: crop.id, e });
                  toast.error('Could not save notes: ' + (e instanceof Error ? e.message : String(e)));
                }
              }} className="w-full mt-2 bg-green-700 text-white rounded-lg py-2 text-sm font-semibold">Save Notes</button>
            </div>
          </div>
        )}

        {activeSheet === 'harvest' && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Harvest Log (last on sheet)</p>
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={toInputDateStr(harvestDate)} onChange={e=>{
                    const v=fromInputDateStr(e.target.value); if(!v) return; setHarvestDate(v);
                  }} className="border rounded-lg p-2 text-sm" />
                  <input value={harvestQty} onChange={e=>setHarvestQty(e.target.value)} placeholder="Qty (e.g. 2kg)" className="border rounded-lg p-2 text-sm" />
                </div>
                <input value={harvestNotes} onChange={e=>setHarvestNotes(e.target.value)} placeholder="Notes" className="w-full border rounded-lg p-2 text-sm" />
                <button onClick={handleLogHarvest} disabled={saving} className="w-full bg-amber-600 text-white rounded-lg py-2 text-sm font-semibold">Log Harvest</button>
              </div>
            </div>
            <div className="space-y-1.5">
              {harvestLogs.length===0 && <p className="text-xs text-muted-foreground bg-white rounded-xl p-3 border">No harvests yet</p>}
              {[...harvestLogs].sort((a,b)=>b.harvestNumber-a.harvestNumber).map(h=>(
                <div key={h.id} className="bg-white rounded-xl border border-gray-100 p-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold">Harvest #{h.harvestNumber}</p>
                    <p className="text-xs text-muted-foreground">{h.harvestDate} · {h.daysFromPlanting}d {h.notes? `· ${h.notes}`:''}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${h.deviationFromDb===0?'bg-gray-100':'bg-amber-50 text-amber-700'}`}>{h.deviationFromDb>0?`+${h.deviationFromDb}d`: `${h.deviationFromDb}d`}</span>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Notes</p>
              <textarea defaultValue={crop.notes} placeholder="Harvest notes..." id="crop-notes-harvest" className="w-full mt-2 border rounded-lg p-2 text-sm min-h-[80px]" />
              <button onClick={async ()=>{
                const el=document.getElementById('crop-notes-harvest') as HTMLTextAreaElement | null;
                if(!el) return;
                try {
                  await db.crops.update(crop.id, { notes: el.value, updatedAt: Date.now() } as never);
                  toast.success('Notes saved');
                } catch (e) {
                  console.error('[details] save notes failed', { id: crop.id, e });
                  toast.error('Could not save notes: ' + (e instanceof Error ? e.message : String(e)));
                }
              }} className="w-full mt-2 bg-green-700 text-white rounded-lg py-2 text-sm font-semibold">Save Notes</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
