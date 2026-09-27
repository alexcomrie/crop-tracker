import { useState } from 'react';
import { Unlink } from 'lucide-react';
import { toast } from 'sonner';

import db from '../../db/db';
import type { Crop, FarmArea } from '../../types';

interface Props {
  plotId: string;
  crops: Crop[];
  plots?: FarmArea[];
  onClose: () => void;
}

export function LinkCropModal({ plotId, crops, plots = [], onClose }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  const tagOf = (pid: string) => plots.find(p => p.id === pid)?.tag ?? pid.slice(0, 6);

  async function run(id: string, patch: { plotId: string }, past: string, present: string) {
    setPendingId(id);
    try {
      await db.crops.update(id, { ...patch, updatedAt: Date.now() });
      toast.success(`Crop ${past}`);
    } catch (e) {
      console.error('[area] crop plot link failed', { id, patch, e });
      toast.error(`Failed to ${present} crop`);
    } finally {
      setPendingId(null);
    }
  }

  const handleLink = (cropId: string) => run(cropId, { plotId }, 'linked', 'link');
  const handleMove = (cropId: string, fromTag: string) => {
    if (!window.confirm(`Move this crop from ${fromTag} to this plot?`)) return;
    void run(cropId, { plotId }, 'moved', 'move');
  };
  const handleUnlink = (cropId: string) => run(cropId, { plotId: '' }, 'unlinked', 'unlink');

  const linkedCrops = crops.filter(c => c.plotId === plotId);
  const unlinkedCrops = crops.filter(c => !c.plotId);
  const elsewhereCrops = crops.filter(c => c.plotId && c.plotId !== plotId);

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-4 space-y-3 max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-sm">Link Crop to Plot</h3>
        {linkedCrops.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-400 font-medium">Linked Crops</p>
            {linkedCrops.map(crop => (
              <div key={crop.id} className="flex items-center justify-between border rounded-lg p-2.5 bg-purple-50">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{crop.cropName} {crop.variety ? `(${crop.variety})` : ''}</p>
                  <p className="text-xs text-gray-400">{crop.plantingMethod}</p>
                </div>
                <button
                  onClick={() => handleUnlink(crop.id)}
                  disabled={pendingId !== null}
                  className="text-xs text-red-500 font-semibold flex items-center gap-1 shrink-0 disabled:opacity-40"
                >
                  <Unlink className="w-3 h-3" /> {pendingId === crop.id ? '…' : 'Unlink'}
                </button>
              </div>
            ))}
          </div>
        )}
        {unlinkedCrops.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-400 font-medium">Available Crops</p>
            {unlinkedCrops.map(crop => (
              <div key={crop.id} className="flex items-center justify-between border rounded-lg p-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{crop.cropName} {crop.variety ? `(${crop.variety})` : ''}</p>
                  <p className="text-xs text-gray-400">{crop.plantingMethod} · {crop.plantingDate}</p>
                </div>
                <button
                  onClick={() => handleLink(crop.id)}
                  disabled={pendingId !== null}
                  className="text-xs text-purple-600 font-semibold shrink-0 disabled:opacity-40"
                >
                  {pendingId === crop.id ? '…' : 'Link'}
                </button>
              </div>
            ))}
          </div>
        )}
        {elsewhereCrops.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-400 font-medium">On Other Plots</p>
            {elsewhereCrops.map(crop => (
              <div key={crop.id} className="flex items-center justify-between border rounded-lg p-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{crop.cropName} {crop.variety ? `(${crop.variety})` : ''}</p>
                  <p className="text-xs text-gray-400">On {tagOf(crop.plotId)} · {crop.plantingMethod}</p>
                </div>
                <button
                  onClick={() => handleMove(crop.id, tagOf(crop.plotId))}
                  disabled={pendingId !== null}
                  className="text-xs text-amber-600 font-semibold shrink-0 disabled:opacity-40"
                >
                  {pendingId === crop.id ? '…' : 'Move here'}
                </button>
              </div>
            ))}
          </div>
        )}
        {crops.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">No active crops available to link.</p>
        )}
        <button onClick={onClose} className="w-full py-2.5 border rounded-xl text-sm font-medium mt-1">Close</button>
      </div>
    </div>
  );
}
