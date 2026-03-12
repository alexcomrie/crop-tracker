import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { Crop } from '../../types';
import { buildFertScheduleData } from '../../lib/fertilizer';

interface FertScheduleViewProps {
  crop: Crop;
}

export function FertScheduleView({ crop }: FertScheduleViewProps) {
  const { fertDb, cropDb } = useAppStore();
  const data = buildFertScheduleData(crop.cropName, crop.variety, crop, fertDb, cropDb);

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-1 text-sm">
        <p className="font-semibold">Your Teas</p>
        <ul className="list-disc pl-5 space-y-1">
          {data.teas.map(t => (
            <li key={t.name}>
              <span className="font-medium">{t.name}:</span>{' '}
              <span className="text-muted-foreground">{t.description}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
        <p className="font-semibold">Yeast Preparation</p>
        <p className="text-muted-foreground">{data.yeastPrep}</p>
        <p className="font-semibold mt-2">Yeast Dosing</p>
        <p className="text-muted-foreground">{data.yeastDosing}</p>
        <p className="font-semibold mt-2">How to Read Dilutions</p>
        <p className="text-muted-foreground">{data.dilutionNote}</p>
        <p className="font-semibold mt-2">Mosquito Control</p>
        <p className="text-muted-foreground">{data.thymeOilTip}</p>
      </div>

      <div className="space-y-2">
        <p className="font-semibold text-sm">4-Stage Feeding Plan</p>
        <div className="space-y-2">
          {data.stages.map(s => (
            <div
              key={s.key}
              className={`rounded-xl border p-3 text-sm space-y-1 ${
                s.key === data.currentActiveStageKey ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold">{s.label}</p>
                {s.key === data.currentActiveStageKey && (
                  <span className="text-xs text-green-700 font-semibold">Current stage</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Foliar:</span> {s.foliarStr || 'Not applicable'}
              </p>
              {s.foliarMixExample && (
                <p className="text-xs text-muted-foreground">
                  Example: {s.foliarMixExample}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                <span className="font-medium">Drench:</span> {s.drenchStr || 'Not applicable'}
              </p>
              {s.drenchMixExample && (
                <p className="text-xs text-muted-foreground">
                  Example: {s.drenchMixExample}
                </p>
              )}
              <p className="text-xs mt-1">
                <span className="font-medium">Frequency:</span> {s.frequency}
              </p>
              {s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1 text-sm">
        <p className="font-semibold">Application Rules</p>
        <ul className="list-disc pl-5 space-y-1">
          {data.applicationRules.map((r, idx) => (
            <li key={idx} className="text-muted-foreground">
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

