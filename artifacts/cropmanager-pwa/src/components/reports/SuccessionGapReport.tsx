import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { useAppStore } from '../../store/useAppStore';
import { buildSuccessionGapData } from '../../lib/succession';
import type { Crop } from '../../types';
import { formatDateShort } from '../../lib/dates';

export function SuccessionGapReport() {
  const crops = useLiveQuery(() => db.crops.toArray(), []) as Crop[] | null;
  const { cropDb } = useAppStore();

  if (!crops || crops.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">No crops found. Log some crops to see succession coverage.</p>;
  }

  const weeks = buildSuccessionGapData(crops, cropDb, 12);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        12-week harvest coverage overview. Green weeks have at least one crop in harvest; red weeks have no harvests scheduled.
      </p>
      <div className="space-y-2">
        {weeks.map((w, i) => (
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
                  {w.crops.map((name, idx) => (
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

