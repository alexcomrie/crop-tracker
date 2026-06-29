import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BottomSheet } from '../shared/BottomSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import type { Crop } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { getValidNextStages, getStageSequence } from '../../lib/stages';
import { resolveCropData } from '../../lib/cropDb';
import { processStageChange, isVineFamily, promoteNextBatch } from '../../lib/stages';
import { formatDateShort, today, daysBetween } from '../../lib/dates';
import { addDiaryEntry } from '../../lib/diary';
import { logDeviation } from '../../lib/learning';
import { sendTelegramMessage } from '../../lib/telegram';
import db from '../../db/db';
import { generateId } from '../../lib/ids';

interface UpdateCropFormProps {
  crop: Crop;
  open: boolean;
  onClose: () => void;
}

type UpdateMode = 'stage' | 'treatment' | 'notes' | 'harvest';

export function UpdateCropForm({ crop, open, onClose }: UpdateCropFormProps) {
  const { cropDb, fertDb, settings } = useAppStore();
  const [mode, setMode] = useState<UpdateMode>('stage');
  const [newStage, setNewStage] = useState('');
  const [treatmentType, setTreatmentType] = useState('');
  const [product, setProduct] = useState('');
  const [treatmentNotes, setTreatmentNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [fertilizerInterval, setFertilizerInterval] = useState('7');
  const [fertProfile, setFertProfile] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [harvestDate, setHarvestDate] = useState(formatDateShort(today()));
  const [harvestQty, setHarvestQty] = useState('');
  const [harvestNotes, setHarvestNotes] = useState('');
  const existingHarvestLogs = useLiveQuery(
    () => db.harvestLogs.where('cropTrackingId').equals(crop.id).toArray(),
    [crop.id]
  ) ?? [];

  const cropData = resolveCropData(cropDb, crop.cropName);
  const isVine = isVineFamily(crop.cropName, cropData?.plant_type);
  const validStages = getValidNextStages(crop.plantStage, cropData).filter(s => {
    if ((s === 'Grafting' || s === 'Healing') && !isVine) return false;
    return true;
  });

  const [tickGerminated, setTickGerminated] = useState(!!crop.germinationDate);
  const [tickTransplanted, setTickTransplanted] = useState(!!crop.transplantDateActual);
  const [tickHarvested, setTickHarvested] = useState(!!crop.harvestDateActual);
  const [stageDate, setStageDate] = useState(formatDateShort(today()));
  
  const fertProfiles = fertDb?.crops ? Object.entries(fertDb.crops).map(([key, val]) => ({
    key,
    name: (val as any).display_name || key,
    profile: (val as any).fert_profile || key
  })) : [];
  
  async function handleStageChange() {
    if (!newStage) return;
    setSaving(true);
    // Always use today if no valid date is provided
    let dateNow = today();
    if (stageDate) {
      const parts = stageDate.split('-').map(s => parseInt(s, 10));
      if (parts.length === 3 && parts[0] > 0 && parts[1] >= 1 && parts[1] <= 12 && parts[2] >= 1) {
        dateNow = new Date(parts[0], parts[1]-1, parts[2]);
      }
    }
    
    // Fetch adjustments and existing harvest logs
    const [adjustments, existingHarvestLogs] = await Promise.all([
      db.cropDbAdjustments.toArray(),
      db.harvestLogs.where('cropTrackingId').equals(crop.id).toArray()
    ]);

    const { updatedCrop, stageLog, harvestLog } = processStageChange(
      crop, newStage, dateNow, cropData ?? {} as any, adjustments, existingHarvestLogs
    );
    
    await db.crops.put(updatedCrop);
    await db.stageLogs.add(stageLog);
    await addDiaryEntry({
      entryType: 'stage_change',
      cropId: crop.id,
      cropName: crop.cropName,
      variety: crop.variety,
      description: crop.plantStage === 'Seed' && newStage === 'Germinated'
        ? `Planted in '${crop.plantingMethod || 'direct'}' · germinated`
        : `${crop.plantStage} → ${newStage}`,
      details: crop.plantingMethod && !(crop.plantStage === 'Seed' && newStage === 'Germinated')
        ? `Method: ${crop.plantingMethod}`
        : newStage === 'Harvested' ? `Planted: ${crop.plantingDate}` : '',
    });

    // Continuous Harvest Promotion Logic
    if (newStage === 'Harvested' && crop.isContinuous) {
      await promoteNextBatch(crop, db);
    }

    if (harvestLog) {
      await db.harvestLogs.add(harvestLog);
      await addDiaryEntry({
        entryType: 'harvest',
        cropId: crop.id,
        cropName: crop.cropName,
        variety: crop.variety,
        description: `Harvest #${harvestLog.harvestNumber}: ${crop.cropName}`,
        details: `Days from planting: ${harvestLog.daysFromPlanting}d`,
      });
      
      // Learning engine: update adjustments if this was a harvest
      if (newStage === 'Harvested') {
        const field = crop.transplantDateActual ? 'growing_from_transplant' : 'growing_time_days';
        const actualValue = harvestLog.daysFromPlanting;
        const dbDefault = field === 'growing_from_transplant' 
          ? (cropData?.growing_from_transplant ?? cropData?.growing_time_days ?? 60)
          : (cropData?.growing_time_days ?? 60);

        const newAdj = logDeviation(
           crop.cropName, field, dbDefault, actualValue, crop.variety, adjustments, settings.learningThreshold
         );
         await db.cropDbAdjustments.put(newAdj);

         // Notify if threshold reached
         if (newAdj.sampleCount === settings.learningThreshold) {
           const msg = `📚 <b>Database Learning Update</b>\n` +
             `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
             `🌱 Crop: <b>${crop.cropName}</b>\n` +
             `📊 Field: ${field}\n` +
             `📈 Your average: <b>${newAdj.yourAverage} days</b> (${newAdj.sampleCount} samples)\n\n` +
             `<i>Your data now overrides the database default for this crop.</i>`;
           await sendTelegramMessage(settings.telegramToken, settings.telegramChatId, msg);
         }
       }
    }
    setSaving(false);
    setDone(true);
    toast.success(`Stage changed to ${newStage}`);
    setTimeout(onClose, 1500);
  }

  async function handleManualProgress() {
    setSaving(true);
    const dateNowStr = formatDateShort(today());
    const update: Partial<Crop> = { updatedAt: Date.now() };

    if (tickGerminated) {
      update.germinationDate = dateNowStr;
      if (crop.plantingDate) {
        // days since planting is not critical here; keep existing if any
      }
    } else {
      update.germinationDate = '';
      update.daysSeedGerm = 0;
    }

    if (tickTransplanted) {
      update.transplantDateActual = dateNowStr;
    } else {
      update.transplantDateActual = '';
      update.daysGermTransplant = 0;
    }

    if (tickHarvested) {
      update.harvestDateActual = dateNowStr;
      update.status = 'Harvested';
      update.plantStage = 'Harvested';
      if (crop.isContinuous) {
        await promoteNextBatch(crop, db);
      }
    } else {
      update.harvestDateActual = '';
      update.daysTransplantHarvest = 0;
      // derive stage from toggles
      update.plantStage = tickTransplanted ? 'Transplanted' : (tickGerminated ? 'Germinated' : 'Seed');
    }

    await db.crops.update(crop.id, update);

    const stageChanges: string[] = [];
    if (tickGerminated && !crop.germinationDate) stageChanges.push('Germinated');
    if (tickTransplanted && !crop.transplantDateActual) stageChanges.push('Transplanted');
    if (tickHarvested && !crop.harvestDateActual) stageChanges.push('Harvested');
    for (const s of stageChanges) {
      await addDiaryEntry({
        entryType: 'stage_change',
        cropId: crop.id,
        cropName: crop.cropName,
        variety: crop.variety,
        description: s === 'Germinated'
          ? `Planted in '${crop.plantingMethod || 'direct'}' · germinated`
          : `${crop.plantStage} → ${s}`,
        details: crop.plantingMethod ? `Method: ${crop.plantingMethod}` : '',
      });
    }

    setSaving(false);
    setDone(true);
    toast.success('Manual progress applied');
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
      updatedAt: Date.now(),
    };
    await db.treatmentLogs.add(treatmentLog);
    await addDiaryEntry({
      entryType: 'treatment',
      cropId: crop.id,
      cropName: crop.cropName,
      variety: crop.variety,
      description: `${treatmentType.charAt(0).toUpperCase() + treatmentType.slice(1)}: ${product}`,
      details: treatmentNotes || '',
    });
    // Update spray dates on crop
    const update: Partial<Crop> = { updatedAt: Date.now() };
    if (treatmentType === 'fungus') update.fungusSprayDates = [crop.fungusSprayDates, formatDateShort(now)].filter(Boolean).join(', ');
    if (treatmentType === 'pest') update.pestSprayDates = [crop.pestSprayDates, formatDateShort(now)].filter(Boolean).join(', ');
    // Track fertilizer next application
    if (treatmentType === 'fertilizer') {
      const interval = parseInt(fertilizerInterval, 10) || 7;
      const nextDate = new Date(now.getTime() + interval * 86400000);
      update.fertilizerType = product;
      update.fertilizerDays = interval;
      update.nextFertilizerDate = formatDateShort(nextDate);
    }
    await db.crops.where('id').equals(crop.id).modify(update);
    setSaving(false);
    setDone(true);
    setTimeout(onClose, 1500);
  }

  async function handleNotes() {
    await db.crops.where('id').equals(crop.id).modify({ notes, updatedAt: Date.now() });
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
          {(['stage', 'harvest', 'treatment', 'notes'] as UpdateMode[]).map(m => (
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
            <div className="mt-3 flex items-center gap-2">
              <Input type="date" className="w-48" value={stageDate} onChange={e => setStageDate(e.target.value)} />
              <span className="text-xs text-muted-foreground">Stage date</span>
            </div>
            <Button className="w-full mt-3" onClick={handleStageChange} disabled={!newStage || saving}>
              {saving ? 'Saving...' : 'Confirm Stage Change'}
            </Button>

              <div className="mt-5 border-t pt-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Manual Progression</p>
                <div className="flex items-center justify-between py-1.5">
                  <label className="text-sm">Germinated</label>
                  <input type="checkbox" className="w-5 h-5 accent-green-600" checked={tickGerminated} onChange={e => { setTickGerminated(e.target.checked); if (!e.target.checked && tickTransplanted) setTickTransplanted(false); }} />
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <label className="text-sm">Transplanted</label>
                  <input type="checkbox" className="w-5 h-5 accent-green-600" checked={tickTransplanted} onChange={e => { setTickTransplanted(e.target.checked); if (e.target.checked) setTickGerminated(true); if (e.target.checked && tickHarvested) setTickHarvested(false); }} />
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <label className="text-sm">Harvested</label>
                  <input type="checkbox" className="w-5 h-5 accent-green-600" checked={tickHarvested} onChange={e => { setTickHarvested(e.target.checked); if (e.target.checked) { setTickGerminated(true); setTickTransplanted(true); } }} />
                </div>
                <Button variant="outline" className="w-full mt-2" onClick={handleManualProgress} disabled={saving}>
                  {saving ? 'Saving...' : 'Apply Manual Progress'}
                </Button>
              <button
                className="w-full mt-2 px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm font-semibold"
                onClick={async () => {
                  if (!window.confirm('Mark this crop as failed? It will be auto-removed after a few days.')) return;
                  await db.crops.update(crop.id, { status: 'Deleted', plantStage: 'Deleted', updatedAt: Date.now() });
                  onClose();
                }}
              >
                Mark as Failed
              </button>
            </div>
          </div>
        )}

        {mode === 'harvest' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {crop.isContinuous ? 'Log individual harvests for this continuous crop.' : 'Log individual harvest events.'}
            </p>
            {existingHarvestLogs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Past Harvests ({existingHarvestLogs.length})</p>
                {existingHarvestLogs.sort((a, b) => b.harvestNumber - a.harvestNumber).map(h => (
                  <div key={h.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div>
                      <span className="text-sm font-medium">Harvest #{h.harvestNumber}</span>
                      <span className="text-xs text-gray-400 ml-2">{h.harvestDate}</span>
                      {h.notes && <p className="text-xs text-gray-500 mt-0.5">{h.notes}</p>}
                    </div>
                    <span className="text-xs text-gray-400">{h.daysFromPlanting} days</span>
                  </div>
                ))}
              </div>
            )}
            <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Log New Harvest</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400">Date</label>
                  <Input type="date" className="w-full" value={harvestDate} onChange={e => setHarvestDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400">Quantity</label>
                  <Input type="text" placeholder="e.g. 2.5 kg" value={harvestQty} onChange={e => setHarvestQty(e.target.value)} />
                </div>
              </div>
              <Input type="text" placeholder="Notes (optional)" value={harvestNotes} onChange={e => setHarvestNotes(e.target.value)} />
              <Button className="w-full" onClick={async () => {
                if (!harvestDate) return;
                setSaving(true);
                const nextNumber = existingHarvestLogs.length > 0
                  ? Math.max(...existingHarvestLogs.map(h => h.harvestNumber)) + 1
                  : 1;
                const from = crop.plantingDate ? new Date(crop.plantingDate) : null;
                const hDate = new Date(harvestDate);
                const daysFromPlanting = from ? daysBetween(from, hDate) : 0;
                const notesText = [harvestQty, harvestNotes].filter(Boolean).join(' · ');
                await db.harvestLogs.add({
                  id: generateId('HL'),
                  cropTrackingId: crop.id,
                  cropName: crop.cropName,
                  harvestNumber: nextNumber,
                  harvestDate,
                  daysFromPlanting,
                  deviationFromDb: 0,
                  notes: notesText,
                  updatedAt: Date.now(),
                });
                await addDiaryEntry({
                  entryType: 'harvest',
                  cropId: crop.id,
                  cropName: crop.cropName,
                  variety: crop.variety,
                  description: `Harvest #${nextNumber}: ${crop.cropName}`,
                  details: `Days from planting: ${daysFromPlanting}d${notesText ? ` · ${notesText}` : ''}`,
                });
                setHarvestQty('');
                setHarvestNotes('');
                setSaving(false);
                toast.success(`Harvest #${nextNumber} logged`);
              }} disabled={!harvestDate || saving}>
                {saving ? 'Saving...' : <span className="flex items-center justify-center gap-1"><Plus className="w-4 h-4" /> Log Harvest</span>}
              </Button>
            </div>
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
            {treatmentType === 'fertilizer' && (
              <>
                <select 
                  className="w-full border rounded-lg p-2 text-sm bg-white"
                  value={fertProfile}
                  onChange={e => setFertProfile(e.target.value)}
                >
                  <option value="">Select fertilizer profile...</option>
                  {fertProfiles.map(fp => (
                    <option key={fp.key} value={fp.profile}>{fp.name} ({fp.profile})</option>
                  ))}
                </select>
                <div className="flex gap-2 items-center">
                  <span className="text-sm text-muted-foreground">Repeat every</span>
                  <select 
                    className="border rounded-lg p-2 text-sm bg-white"
                    value={fertilizerInterval}
                    onChange={e => setFertilizerInterval(e.target.value)}
                  >
                    <option value="7">7 days</option>
                    <option value="14">14 days</option>
                    <option value="21">21 days</option>
                    <option value="28">28 days</option>
                  </select>
                </div>
              </>
            )}
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
