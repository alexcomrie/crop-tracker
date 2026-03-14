import React, { useEffect, useState } from 'react';
import { useCrops } from '../hooks/useCrops';
import { CropCard } from '../components/crops/CropCard';
import { CropDetail } from '../components/crops/CropDetail';
import { CropForm } from '../components/crops/CropForm';
import { UpdateCropForm } from '../components/crops/UpdateCropForm';
import type { Crop } from '../types';
import { useAppStore } from '../store/useAppStore';
import { resolveCropData } from '../lib/cropDb';
import { autoAdjustTransplantSchedule } from '../lib/stages';
import db from '../db/db';

const FILTERS = ['All', 'Active', 'Seedling', 'Vegetative', 'Flowering', 'Fruiting', 'Harvested'];

export function CropsScreen() {
  const [filter, setFilter] = useState('All');
  const { cropDb } = useAppStore();
  const crops = useCrops(filter) ?? [];

  const [selectedCrop, setSelectedCrop] = useState<Crop | null>(null);
  const [updateCrop, setUpdateCrop] = useState<Crop | null>(null);
  const [editCrop, setEditCrop] = useState<Crop | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);

  // Auto-adjust transplant schedule if overdue
  useEffect(() => {
    (async () => {
      for (const c of crops) {
        const cd = resolveCropData(cropDb, c.cropName);
        const updated = autoAdjustTransplantSchedule(c, cd);
        if (updated) {
          await db.crops.put(updated);
        }
      }
    })();
  }, [crops, cropDb]);

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
      console.error('Failed to delete crop:', err);
      alert('Failed to delete crop. Please try again.');
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

      <div className="px-4 pt-2">
        {crops.length === 0 ? (
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
