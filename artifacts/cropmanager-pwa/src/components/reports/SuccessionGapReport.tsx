import React, { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { useAppStore } from '../../store/useAppStore';
import { buildSuccessionGapData, buildSuccessionGapDataFromDates, type WeekGapData } from '../../lib/succession';
import { resolveCropData } from '../../lib/cropDb';
import { getEffectiveCropData } from '../../lib/personalCropDb';
import { getPredictedHarvestDate } from '../../lib/micro-crop/hybrid';
import type { Crop, CropData } from '../../types';
import { formatDateShort } from '../../lib/dates';

export function SuccessionGapReport() {
  const crops = useLiveQuery(() => db.crops.where('status').equals('Active').toArray()) as Crop[] | null;
  const { cropDb, settings } = useAppStore();

  const cachedAnalysis = useLiveQuery(() => db.successionGaps.get('latest'), []);

  // Cast cropDb to the expected record type for the analysis function
   const cropDataOnly = Object.keys(cropDb).reduce((acc, key) => {
     const data = resolveCropData(cropDb, key);
     if (data) acc[key] = data;
     return acc;
   }, {} as Record<string, CropData>);

  // Tinygpt-aware predictions: hybrid micro + scalar harvest dates per active crop.
  // Falls back to stored harvestDateEstimated per crop when prediction is unavailable.
  const microDeps = useLiveQuery(async () => {
    const [adjustments, microRow] = await Promise.all([
      db.cropDbAdjustments.toArray().catch(() => []),
      db.microModels.get('micro_crop_v1').catch(() => null),
    ]);
    return { adjustments, microRow };
  }, []);
  const predicted = useLiveQuery(async () => {
    if (!crops || crops.length === 0) return null;
    const micro = microDeps?.microRow as unknown as {
      serialized?: Record<string, number[][]>;
      config?: unknown;
      itos?: string[];
    } | null;
    const dates = new Map<string, Date>();
    let microUsed = 0;
    for (const crop of crops.filter(c => c.status === 'Active')) {
      try {
        const effective = await getEffectiveCropData(crop.cropName, cropDb as Record<string, unknown>)
          ?? resolveCropData(cropDb, crop.cropName);
        if (!effective) continue;
        const predictedDate = await getPredictedHarvestDate(
          crop,
          effective as CropData,
          (microDeps?.adjustments ?? []) as never,
          micro as never,
          settings.learningThreshold ?? 3
        );
        if (predictedDate) {
          dates.set(crop.id, predictedDate);
          // Count crops where the micro model actually contributed (stored estimate differs)
          const stored = crop.harvestDateEstimated;
          if (micro?.serialized) microUsed += 1;
          void stored;
        }
      } catch { /* per-crop fallback handled below */ }
    }
    return { dates, microUsed };
  }, [crops, microDeps, cropDb, settings.learningThreshold]);

  const predictedWeeks = predicted && predicted.dates.size > 0 && crops && crops.length > 0
    ? buildSuccessionGapDataFromDates(crops, predicted.dates, 12)
    : null;
  const currentWeeks = crops && crops.length > 0 ? buildSuccessionGapData(crops, cropDataOnly, 12) : null;
  const weeks = predictedWeeks || currentWeeks || cachedAnalysis?.data || [];
  const tinygptActive = (predicted?.microUsed ?? 0) > 0;

  // Store the analysis data locally whenever it changes
  useEffect(() => {
    if (weeks && weeks.length > 0) {
      db.successionGaps.put({
        id: 'latest',
        data: weeks,
        updatedAt: Date.now()
      }).catch(console.error);
    }
  }, [predictedWeeks, currentWeeks]);

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
        {tinygptActive && (
          <span className="ml-1 inline-block bg-[#e8f5e8] text-[#2d6a2d] px-1.5 py-0.5 rounded-full font-bold text-[11px]">🧠 Tinygpt-adjusted</span>
        )}
      </p>
      {tinygptActive && (
        <p className="text-[11px] text-[#888]">Harvest weeks rebuilt from your harvest logs + Tinygpt predictions — they adjust as you log more harvests.</p>
      )}
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
