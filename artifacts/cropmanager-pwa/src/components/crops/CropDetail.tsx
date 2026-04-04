import React, { useState } from 'react';
import { BottomSheet } from '../shared/BottomSheet';
import { StageTimeline } from '../shared/StageTimeline';
import { Button } from '@/components/ui/button';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import type { Crop } from '../../types';
import { parseDate, formatDateDisplay, daysBetween, today, formatDateShort } from '../../lib/dates';
import { STAGE_COLORS } from '../../lib/stages';
import { FertScheduleView } from './FertScheduleView';
import { calculateTransplantDate, calculateHarvestDate } from '../../lib/harvest';
import { generateId } from '../../lib/ids';

import { Trash2, Edit3, Info, Calendar as CalendarIcon, Repeat } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { resolveCropData } from '../../lib/cropDb';
import { calculateBatchPlantingDates } from '../../lib/reminders';

interface CropDetailProps {
  crop: Crop;
  onClose: () => void;
  onUpdate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const STAGE_ORDER = ['Seed', 'Germinated', 'Seedling', 'Transplanted', 'Vegetative', 'Flowering', 'Fruiting', 'Harvested'];

export function CropDetail({ crop, onClose, onUpdate, onEdit, onDelete }: CropDetailProps) {
  const { cropDb } = useAppStore();
  const treatmentLogs = useLiveQuery(() => db.treatmentLogs.where('cropId').equals(crop.id).sortBy('date'), [crop.id]);
  const stageLogs = useLiveQuery(() => db.stageLogs.where('trackingId').equals(crop.id).sortBy('date'), [crop.id]);
  const batchLogs = useLiveQuery(() => db.batchPlantingLogs.where('cropTrackingId').equals(crop.id).toArray(), [crop.id]);
  const activeBatches = useLiveQuery(() => db.crops.where('parentCropId').equals(crop.id).toArray(), [crop.id]);
  const [showFert, setShowFert] = useState(false);

  const cropData = resolveCropData(cropDb, crop.cropName);
  const batchDates = crop.isContinuous && cropData ? calculateBatchPlantingDates(crop, cropData, 3) : [];
  
  const confirmedBatchNumbers = new Set(batchLogs?.map(l => l.batchNumber) || []);
  const createdBatchNumbers = new Set(activeBatches?.map(c => c.batchNumber) || []);
  
  // Find the next batch to confirm: the first one that isn't confirmed yet
  const nextBatchToConfirm = batchDates.find(b => !confirmedBatchNumbers.has(b.batchNumber));
  
  const planted = parseDate(crop.plantingDate);
  const daysOld = planted ? daysBetween(planted, today()) : 0;

  const stages = [
    { label: 'Planted', date: crop.plantingDate, done: !!crop.plantingDate },
    { label: 'Germinated', date: crop.germinationDate, done: !!crop.germinationDate },
    { label: 'Transplanted', date: crop.transplantDateActual, done: !!crop.transplantDateActual },
    { label: 'Harvested', date: crop.harvestDateActual, done: !!crop.harvestDateActual },
  ];

  return (
    <BottomSheet open onClose={onClose} title={`${crop.cropName}${crop.variety ? ' · ' + crop.variety : ''}`}>
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: STAGE_COLORS[crop.plantStage] ?? '#9e9e9e' }}>
            {crop.plantStage}
          </span>
          <span className="text-sm text-muted-foreground">Day {daysOld}</span>
          <span className="text-xs font-mono text-muted-foreground ml-auto">{crop.id}</span>
        </div>

        <StageTimeline stages={stages} />

        <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <p className="text-muted-foreground">Planted</p><p className="font-medium">{crop.plantingDate || '—'}</p>
            <p className="text-muted-foreground">Germinated</p><p className="font-medium">{crop.germinationDate || '—'}</p>
            <p className="text-muted-foreground">Transplant Sched.</p><p className="font-medium">{crop.transplantDateScheduled || '—'}</p>
            <p className="text-muted-foreground">Transplanted</p><p className="font-medium">{crop.transplantDateActual || '—'}</p>
            <p className="text-muted-foreground">Est. Harvest</p><p className="font-medium text-green-700">{crop.harvestDateEstimated || '—'}</p>
            <p className="text-muted-foreground">Actual Harvest</p><p className="font-medium">{crop.harvestDateActual || '—'}</p>
          </div>
        </div>

        {batchDates.length > 0 && (
          <div className="bg-amber-50 rounded-xl border border-amber-100 p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-800">
              <Repeat className="w-4 h-4" />
              <p className="text-[10px] font-bold uppercase tracking-widest">Continuous Batch Schedule</p>
            </div>
            <div className="space-y-2">
              {batchDates.map(b => {
                const isConfirmed = confirmedBatchNumbers.has(b.batchNumber);
                const isCreated = createdBatchNumbers.has(b.batchNumber);
                const isNext = nextBatchToConfirm?.batchNumber === b.batchNumber;
                const dateArrived = b.date <= today();

                const handleCreateClone = async () => {
                  try {
                    const batchId = generateId('CT');
                    const batchDateStr = formatDateShort(b.date);
                    
                    // 1. Create the new crop record
                    const newCrop: Crop = {
                      ...crop,
                      id: batchId,
                      cropName: `${crop.cropName} [Batch ${b.batchNumber}]`,
                      plantingDate: batchDateStr,
                      batchNumber: b.batchNumber,
                      parentCropId: crop.id,
                      plantStage: 'Seed',
                      isContinuous: true, // Keep continuous status for the batch
                      harvestFrequency: crop.harvestFrequency, // Copy C-H metadata
                      numPlots: crop.numPlots,
                      batchOffset: crop.batchOffset,
                      germinationDate: '',
                      transplantDateActual: '',
                      harvestDateActual: '',
                      updatedAt: Date.now(),
                    };
                    
                    // Recalculate transplant and harvest dates for the new crop
                    if (cropData) {
                      const newTransplant = calculateTransplantDate(b.date, null, cropData, [], crop.cropName, crop.variety);
                      if (newTransplant) newCrop.transplantDateScheduled = formatDateShort(newTransplant);
                      
                      const newHarvest = calculateHarvestDate(newCrop, cropData, []);
                      if (newHarvest) newCrop.harvestDateEstimated = formatDateShort(newHarvest);
                    }

                    await db.crops.add(newCrop);

                    // 2. Add the log entry if it wasn't confirmed yet
                    if (!isConfirmed) {
                      await db.batchPlantingLogs.add({
                        id: `${crop.id}_B${b.batchNumber}`,
                        cropTrackingId: crop.id,
                        cropName: crop.cropName,
                        batchNumber: b.batchNumber,
                        batchPlantingDate: batchDateStr,
                        confirmedPlantedDate: formatDateShort(today()),
                        nextBatchDate: '',
                        status: 'active',
                        notes: '',
                        updatedAt: Date.now(),
                      });
                    }
                  } catch (err) {
                    console.error('Failed to create batch clone:', err);
                  }
                };

                return (
                  <div key={b.batchNumber} className={`flex items-center justify-between bg-white/60 rounded-lg px-3 py-2 border ${isConfirmed ? 'border-green-100' : 'border-amber-100/50'}`}>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span 
                          className={`text-xs font-bold ${isConfirmed ? 'text-green-900' : 'text-amber-900'} ${isConfirmed && !isCreated ? 'cursor-pointer hover:underline' : ''}`}
                          onClick={() => { if (isConfirmed && !isCreated) handleCreateClone(); }}
                        >
                          Batch #{b.batchNumber}
                        </span>
                        {isConfirmed && <span className="text-[9px] bg-green-100 text-green-700 px-1 rounded">Confirmed</span>}
                        {isConfirmed && isCreated && <span className="text-[9px] bg-blue-100 text-blue-700 px-1 rounded">Created</span>}
                      </div>
                      <span className="text-[10px] text-amber-700 uppercase font-medium">Planting Date</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-amber-900">{formatDateShort(b.date)}</span>
                      {isNext && dateArrived && !isConfirmed && (
                        <button
                          className="text-[10px] px-2 py-1 rounded bg-amber-600 text-white font-bold uppercase hover:bg-amber-700 transition-colors"
                          onClick={handleCreateClone}
                        >Confirm</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-start gap-2 bg-amber-100/50 rounded-lg p-2">
              <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[9px] text-amber-700 leading-tight">Reminders are set for 1 day before each batch date.</p>
            </div>
          </div>
        )}

        {(crop.fungusSprayDates || crop.pestSprayDates) && (
          <div className="bg-amber-50 rounded-lg p-3 text-sm">
            <p className="font-medium mb-1">Spray Schedule</p>
            {crop.fungusSprayDates && <p className="text-xs"><span className="text-muted-foreground">🍄 Fungus:</span> {crop.fungusSprayDates}</p>}
            {crop.pestSprayDates && <p className="text-xs"><span className="text-muted-foreground">🐛 Pest:</span> {crop.pestSprayDates}</p>}
          </div>
        )}

        {crop.notes && (
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="font-medium mb-1">Notes</p>
            <p className="text-muted-foreground whitespace-pre-line">{crop.notes}</p>
          </div>
        )}

        {treatmentLogs && treatmentLogs.length > 0 && (
          <div>
            <p className="font-medium text-sm mb-2">Treatment Log</p>
            <div className="space-y-1">
              {treatmentLogs.map(t => (
                <div key={t.id} className="flex items-start gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2">
                  <span>{t.type === 'fungus' ? '🍄' : t.type === 'pest' ? '🐛' : '💧'}</span>
                  <div>
                    <p className="font-medium">{t.product}</p>
                    <p className="text-muted-foreground">{t.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button className="flex-1" onClick={onUpdate}>Update Status</Button>
          <Button variant="outline" className="border-gray-200" onClick={onEdit}>
            <Edit3 className="w-4 h-4 mr-2" /> Edit
          </Button>
          <Button className="flex-1 bg-amber-500 hover:bg-amber-600" onClick={() => setShowFert(true)}>
            Fertilizer
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-300 hover:text-red-500 border border-gray-100 h-10 w-10 shrink-0" onClick={onDelete}>
            <Trash2 className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <BottomSheet open={showFert} onClose={() => setShowFert(false)} title="Fertilizer Schedule" position="center">
        <div className="py-4">
          <FertScheduleView crop={crop} />
        </div>
      </BottomSheet>
    </BottomSheet>
  );
}
