import React, { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { useAppStore } from '../../store/useAppStore';
import { buildSuccessionGapData, type WeekGapData } from '../../lib/succession';
import { resolveCropData } from '../../lib/cropDb';
import type { Crop, CropData } from '../../types';
import { formatDateShort } from '../../lib/dates';

export function SuccessionGapReport() {
  const crops = useLiveQuery(() => db.crops.where('status').equals('Active').toArray()) as Crop[] | null;
  const { cropDb } = useAppStore();

  const cachedAnalysis = useLiveQuery(() => db.successionGaps.get('latest'), []);
  
  // Cast cropDb to the expected record type for the analysis function
   const cropDataOnly = Object.keys(cropDb).reduce((acc, key) => {
     const data = resolveCropData(cropDb, key);
     if (data) acc[key] = data;
     return acc;
   }, {} as Record<string, CropData>);

  const currentWeeks = crops && crops.length > 0 ? buildSuccessionGapData(crops, cropDataOnly, 12) : null;
  const weeks = currentWeeks || cachedAnalysis?.data || [];

  // Store the analysis data locally whenever it changes
  useEffect(() => {
    if (currentWeeks && currentWeeks.length > 0) {
      db.successionGaps.put({
        id: 'latest',
        data: currentWeeks,
        updatedAt: Date.now()
      }).catch(console.error);
    }
  }, [currentWeeks]);

  if (!crops && !cachedAnalysis) {
    return <p className="text-sm text-muted-foreground text-center py-6">Loading analysis...</p>;
  }

  if ((!crops || crops.length === 0) && !cachedAnalysis) {
    return <p className="text-sm text-muted-foreground text-center py-6">No crops found. Log some crops to see succession coverage.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        12-week harvest coverage overview. Green weeks have at least one crop in harvest; red weeks have no harvests scheduled.
      </p>
      <div className="space-y-2">
        {weeks.map((w: WeekGapData, i: number) => (
          <div
            key={i}
            className={`rounded-xl border p-3 text-sm flex items-start gap-3 ${w.hasHarvest ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}
          >
            <div className="w-20">
              <p className="font-semibold">Week {i + 1}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateShort(w.start)} – {formatDateShort(w.end)}
              </p>
            </div>
            <div className="flex-1">
              {w.hasHarvest ? (
                <ul className="text-xs list-disc pl-4 space-y-1">
                  {w.crops.map((name: string, idx: number) => (
                    <li key={idx}>{name}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-red-700">No harvests scheduled. Consider planting to fill this gap.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

