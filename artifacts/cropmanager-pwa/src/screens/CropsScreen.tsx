import React, { useEffect, useRef, useState } from 'react';
import { useCrops } from '../hooks/useCrops';
import { CropCard } from '../components/crops/CropCard';
import { CropDetail } from '../components/crops/CropDetail';
import { CropForm } from '../components/crops/CropForm';
import { UpdateCropForm } from '../components/crops/UpdateCropForm';
import { toast } from 'sonner';
import type { Crop } from '../types';
import { useAppStore } from '../store/useAppStore';
import { resolveCropData } from '../lib/cropDb';
import { autoAdjustTransplantSchedule } from '../lib/stages';
import db from '../db/db';
import { formatDateShort, today, daysBetween, parseDate } from '../lib/dates';
import { calculateHarvestDate, calculateTransplantDate } from '../lib/harvest';
import { generateId } from '../lib/ids';
import { autoTransitionCrop, getStageSequence } from '../lib/stages';

const FILTERS = ['All', 'Active', 'Seedling', 'Vegetative', 'Flowering', 'Fruiting', 'Middle Vegetative', 'Final Vegetative', 'Harvested'];

export function CropsScreen() {
  const [filter, setFilter] = useState('All');
  const { cropDb } = useAppStore();
  const cropsData = useCrops(filter);
  const crops = cropsData ?? [];
  const isLoading = cropsData === undefined;

  const [selectedCrop, setSelectedCrop] = useState<Crop | null>(null);
  const [updateCrop, setUpdateCrop] = useState<Crop | null>(null);
  const [editCrop, setEditCrop] = useState<Crop | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // Auto-transition crops through all stages based on their timeframes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const c of crops) {
        if (cancelled || !mountedRef.current) return;
        if (c.status === 'Harvested' || c.status === 'Deleted') continue;
        const cd = resolveCropData(cropDb, c.cropName);
        if (!cd) continue;

        // Auto-adjust transplant schedule if overdue
        const adjusted = autoAdjustTransplantSchedule(c, cd);
        if (adjusted) await db.crops.put(adjusted);

        // Auto-transition through stages
        const needsTransplant = (cd.transplant_days || 0) > 0;
        if (needsTransplant && c.plantStage === 'Seedling' && !c.transplantDateActual) continue;

        let didTransition = true;
        let currentCrop = c;
        while (didTransition) {
          if (cancelled || !mountedRef.current) return;
          const result = await autoTransitionCrop(currentCrop, cd, { stageLogs: db.stageLogs, crops: db.crops });
          didTransition = result;
          if (result) {
            const updated = await db.crops.get(currentCrop.id);
            if (updated) currentCrop = updated;
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [crops, cropDb]);

  useEffect(() => {
    (async () => {
      const threshold = Date.now() - 3 * 86400000;
      const toDelete = await db.crops.where('status').equals('Deleted').toArray();
      for (const c of toDelete) {
        if (c.updatedAt < threshold) {
          await db.crops.delete(c.id);
          await db.stageLogs.where('trackingId').equals(c.id).delete();
          await db.harvestLogs.where('cropTrackingId').equals(c.id).delete();
          await db.reminders.where('trackingId').equals(c.id).delete();
          await db.treatmentLogs.where('cropId').equals(c.id).delete();
        }
      }
    })();
  }, []);

  async function refreshTimings() {
    const adjustments = await db.cropDbAdjustments.toArray();
    for (const c of crops.filter(x => x.status === 'Active')) {
      const cd = resolveCropData(cropDb, c.cropName);
      if (!cd) continue;
      const planted = new Date(c.plantingDate);
      const tDate = calculateTransplantDate(planted, null, cd, adjustments, c.cropName.toLowerCase(), c.variety);
      const hDate = calculateHarvestDate(c, cd, adjustments);
      
      const patch: Partial<Crop> = { updatedAt: Date.now() };
      if (tDate) patch.transplantDateScheduled = formatDateShort(tDate);
      if (hDate) patch.harvestDateEstimated = formatDateShort(hDate);

      // Apply C-H Logic Update if enabled
      if (c.isContinuous) {
        // Calculate based on the newly updated C-H logic (same as CropForm)
        const growDays = cd.growing_time_days || 60;
        const harvestWks = cd.number_of_weeks_harvest || 1;
        const harvestDays = harvestWks * 7;
        const harvestIntv = cd.harvest_interval || 7;
        const isMulti = harvestWks > 1;
        
        const freqDays = c.harvestFrequency || 7;
        
        let batchOffset: number;
        if (cd.batch_offset_days && cd.batch_offset_days > 0) {
          batchOffset = cd.batch_offset_days;
        } else if (!isMulti) {
          batchOffset = freqDays;
        } else {
          const naturalOffset = Math.max(harvestDays - harvestIntv, harvestIntv);
          batchOffset = Math.max(naturalOffset, freqDays);
        }
        
        let numBatches: number;
        if (!isMulti) numBatches = Math.ceil(growDays / batchOffset);
        else numBatches = Math.max(2, Math.ceil(harvestDays / batchOffset));

        patch.batchOffset = batchOffset;
        patch.numPlots = numBatches;
      }

      await db.crops.update(c.id, patch);

      // Update existing batch planting logs with recalculated dates
      if (c.isContinuous && patch.batchOffset) {
        const existingBatches = await db.batchPlantingLogs.where('cropTrackingId').equals(c.id).toArray();
        const planted = new Date(c.plantingDate);
        for (const batch of existingBatches) {
          const batchDate = new Date(planted.getTime() + (batch.batchNumber - 1) * patch.batchOffset * 86400000);
          const nextBatchDate = new Date(planted.getTime() + batch.batchNumber * patch.batchOffset * 86400000);
          await db.batchPlantingLogs.update(batch.id, {
            batchPlantingDate: formatDateShort(batchDate),
            nextBatchDate: formatDateShort(nextBatchDate),
            updatedAt: Date.now(),
          });
        }
      }
    }
    toast.success('Timings and Continuous Harvest logic refreshed.');
  }
  const handleDeleteCrop = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this crop from your tracker? This will remove all logs and reminders associated with it.')) {
      return;
    }
    
    try {
      await db.crops.delete(id);
      await db.stageLogs.where('trackingId').equals(id).delete();
      await db.harvestLogs.where('cropTrackingId').equals(id).delete();
      await db.reminders.where('trackingId').equals(id).delete();
      await db.treatmentLogs.where('cropId').equals(id).delete();
      
      setSelectedCrop(null);
    } catch (err) {
      toast.error('Failed to delete crop. Please try again.');
    }
  };

  return (
    <div className="pb-24 pt-2">
      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto px-4 pb-2 whitespace-nowrap scrollbar-hide">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm border ${filter === f ? 'bg-green-700 text-white border-green-700' : 'bg-white border-gray-300 text-gray-700'}`}>
            {f}
          </button>
        ))}
      </div>
      <div className="px-4">
        <button onClick={refreshTimings} className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50">Refresh Timings</button>
      </div>

      <div className="px-4 pt-2">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : crops.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-4xl mb-3">🌱</p>
            <p className="font-semibold text-lg">No crops yet</p>
            <p className="text-sm text-muted-foreground mb-4">Tap + to log your first crop.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {crops.map(crop => (
              <CropCard
                key={crop.id}
                crop={crop}
                cropData={resolveCropData(cropDb, crop.cropName) || undefined}
                onClick={() => setSelectedCrop(crop)}
                onAction={action => {
                  if (action === 'update') setUpdateCrop(crop);
                  if (action === 'harvest') setUpdateCrop(crop);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-amber-500 text-white rounded-full shadow-lg flex items-center justify-center text-2xl z-40 hover:bg-amber-600 active:scale-95 transition-all"
      >
        +
      </button>

      {showForm && (
        <CropForm 
          open={showForm} 
          onClose={() => { setShowForm(false); setEditCrop(undefined); }} 
          editCrop={editCrop}
        />
      )}

      {selectedCrop && (
        <CropDetail
          crop={selectedCrop}
          onClose={() => setSelectedCrop(null)}
          onUpdate={() => { setUpdateCrop(selectedCrop); setSelectedCrop(null); }}
          onEdit={() => { setEditCrop(selectedCrop); setShowForm(true); setSelectedCrop(null); }}
          onDelete={() => handleDeleteCrop(selectedCrop.id)}
        />
      )}

      {updateCrop && (
        <UpdateCropForm
          crop={updateCrop}
          open
          onClose={() => setUpdateCrop(null)}
        />
      )}
    </div>
  );
}
