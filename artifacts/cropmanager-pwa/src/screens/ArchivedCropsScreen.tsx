import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCrops } from '../hooks/useCrops';
import { useProps } from '../hooks/useProps';
import { CropCard } from '../components/crops/CropCard';
import { PropCard } from '../components/props/PropCard';
import { PropDetail } from '../components/props/PropDetail';
import type { Propagation } from '../types';
import { useAppStore } from '../store/useAppStore';
import { resolveCropData } from '../lib/cropDb';
import { toast } from 'sonner';
import db from '../db/db';
import { cropDetailsPath } from '../lib/routes';
import { ArrowLeft } from 'lucide-react';

export function ArchivedCropsScreen() {
  const { cropDb } = useAppStore();
  const navigate = useNavigate();
  const cropsData = useCrops('Archived');
  const propsData = useProps('Archived');
  const crops = cropsData ?? [];
  const props = propsData ?? [];
  const isLoading = cropsData === undefined || propsData === undefined;
  const [selectedProp, setSelectedProp] = useState<Propagation | null>(null);

  const rows = [
    ...crops.map(c => ({ key: `crop:${c.id}`, updatedAt: c.updatedAt })),
    ...props.map(p => ({ key: `prop:${p.id}`, updatedAt: p.updatedAt })),
  ].sort((a, b) => b.updatedAt - a.updatedAt);

  async function unarchiveCrop(id: string, archivedFrom?: string) {
    try {
      await db.crops.update(id, { status: archivedFrom ?? 'Active', updatedAt: Date.now() } as never);
      toast.success('Crop restored');
    } catch (e) {
      console.error('[archive] restore crop failed', { id, e });
      toast.error('Restore failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function unarchiveProp(id: string, archivedFrom?: string) {
    try {
      await db.propagations.update(id, { status: archivedFrom ?? 'Propagating', updatedAt: Date.now() } as never);
      toast.success('Propagation restored');
    } catch (e) {
      console.error('[archive] restore prop failed', { id, e });
      toast.error('Restore failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleDeleteProp(id: string) {
    try {
      await db.propagations.delete(id);
      await db.reminders.where('trackingId').equals(id).delete();
      setSelectedProp(null);
      toast.success('Propagation deleted');
    } catch (e) {
      console.error('[archive] delete prop failed', { id, e });
      toast.error('Delete failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 pt-2">
      <div className="max-w-md mx-auto flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate('/crops')} aria-label="Back to tracker" className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="font-semibold text-[15px]">Archived</h1>
        <span className="ml-auto text-[11px] text-muted-foreground">{crops.length} crops · {props.length} props</span>
      </div>

      <div className="max-w-md mx-auto px-4 pt-2">
        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <p className="text-4xl mb-3">📦</p>
            <p className="font-semibold">No archived items</p>
            <p className="text-sm text-muted-foreground mb-4">Use Archive on the tracker to tuck crops or propagations away here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(row => {
              if (row.key.startsWith('crop:')) {
                const crop = crops.find(c => c.id === row.key.slice(5));
                if (!crop) return null;
                return (
                  <div key={row.key} className="space-y-1">
                    <CropCard
                      crop={crop}
                      cropData={resolveCropData(cropDb, crop.cropName) || undefined}
                      kind="crop"
                      onClick={() => navigate(cropDetailsPath(crop.id))}
                    />
                    <button
                      onClick={() => unarchiveCrop(crop.id, crop.archivedFrom)}
                      className="w-full text-xs font-semibold text-green-700 bg-white border border-gray-200 rounded-lg py-1.5"
                    >
                      Restore
                    </button>
                  </div>
                );
              }
              const prop = props.find(p => p.id === row.key.slice(5));
              if (!prop) return null;
              return (
                <div key={row.key} className="space-y-1">
                  <PropCard
                    prop={prop}
                    onClick={() => setSelectedProp(prop)}
                    onAction={() => {}}
                  />
                  <button
                    onClick={() => unarchiveProp(prop.id, prop.archivedFrom)}
                    className="w-full text-xs font-semibold text-green-700 bg-white border border-gray-200 rounded-lg py-1.5"
                  >
                    Restore
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedProp && (
        <PropDetail
          prop={selectedProp}
          onClose={() => setSelectedProp(null)}
          onEdit={() => setSelectedProp(null)}
          onDelete={() => handleDeleteProp(selectedProp.id)}
        />
      )}
    </div>
  );
}
