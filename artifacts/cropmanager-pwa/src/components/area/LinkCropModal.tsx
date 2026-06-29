import { useState } from 'react';
import { Unlink } from 'lucide-react';
import { toast } from 'sonner';

import db from '../../db/db';
import type { Crop } from '../../types';

interface Props {
  plotId: string;
  crops: Crop[];
  onClose: () => void;
}

export function LinkCropModal({ plotId, crops, onClose }: Props) {
  const [linking, setLinking] = useState(false);

  const handleLink = async (cropId: string) => {
    setLinking(true);
    try {
      await db.crops.update(cropId, { plotId });
    } catch {
      toast.error('Failed to link crop');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (cropId: string) => {
    setLinking(true);
    try {
      await db.crops.update(cropId, { plotId: '' });
    } catch {
      toast.error('Failed to unlink crop');
    } finally {
      setLinking(false);
    }
  };

  const eligibleCrops = crops.filter(
    c => !c.plotId || c.plotId === plotId
  );
  const linkedCrops = eligibleCrops.filter(c => c.plotId === plotId);

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
                  disabled={linking}
                  className="text-xs text-red-500 font-semibold flex items-center gap-1 shrink-0"
                >
                  <Unlink className="w-3 h-3" /> Unlink
                </button>
              </div>
            ))}
          </div>
        )}
        {eligibleCrops.filter(c => !c.plotId).length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-400 font-medium">Available Crops</p>
            {eligibleCrops.filter(c => !c.plotId).map(crop => (
              <div key={crop.id} className="flex items-center justify-between border rounded-lg p-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{crop.cropName} {crop.variety ? `(${crop.variety})` : ''}</p>
                  <p className="text-xs text-gray-400">{crop.plantingMethod} · {crop.plantingDate}</p>
                </div>
                <button
                  onClick={() => handleLink(crop.id)}
                  disabled={linking}
                  className="text-xs text-purple-600 font-semibold shrink-0"
                >
                  Link
                </button>
              </div>
            ))}
          </div>
        )}
        {eligibleCrops.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">No active crops available to link.</p>
        )}
        <button onClick={onClose} className="w-full py-2.5 border rounded-xl text-sm font-medium mt-1">Close</button>
      </div>
    </div>
  );
}
