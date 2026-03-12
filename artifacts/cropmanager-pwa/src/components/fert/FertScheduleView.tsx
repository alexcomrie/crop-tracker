import React from 'react';
import type { Crop } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { buildFertScheduleData } from '../../lib/fertilizer';

interface FertScheduleViewProps {
  crop: Crop;
}

export function FertScheduleView({ crop }: FertScheduleViewProps) {
  const { cropDb, fertDb } = useAppStore();
  const data = buildFertScheduleData(crop.cropName, crop.variety, crop, fertDb, cropDb);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="font-bold text-green-700 mb-2">🍵 YOUR 5 TEAS</h3>
        <div className="space-y-1">
          {data.teas.map(t => (
            <div key={t.name} className="bg-green-50 rounded-lg px-3 py-2">
              <p className="font-semibold">{t.name}</p>
              <p className="text-muted-foreground text-xs">{t.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-bold text-amber-700 mb-2">🍞 YEAST PREPARATION</h3>
        <p className="text-muted-foreground">{data.yeastPrep}</p>
        <p className="text-muted-foreground mt-1">{data.yeastDosing}</p>
      </div>

      <div className="bg-blue-50 rounded-lg p-3">
        <p className="font-semibold text-blue-800">📏 HOW TO READ DILUTIONS</p>
        <p className="text-xs text-blue-700 mt-1">{data.dilutionNote}</p>
      </div>

      <div>
        <h3 className="font-bold text-green-700 mb-2">🌱 4-STAGE FEEDING PLAN</h3>
        <div className="space-y-3">
          {data.stages.map(stage => (
            <div key={stage.key}
              className={`rounded-xl p-3 border ${data.currentActiveStageKey === stage.key ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-100'}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold">{stage.label}</p>
                {data.currentActiveStageKey === stage.key && (
                  <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full">ACTIVE</span>
                )}
              </div>
              <div className="space-y-1">
                <p><span className="text-muted-foreground">🌿 Foliar:</span> {stage.foliarStr}</p>
                {stage.foliarMixExample && <p className="text-xs text-muted-foreground pl-4">Example: {stage.foliarMixExample}</p>}
                <p><span className="text-muted-foreground">💧 Drench:</span> {stage.drenchStr}</p>
                {stage.drenchMixExample && <p className="text-xs text-muted-foreground pl-4">Example: {stage.drenchMixExample}</p>}
                <p className="text-xs text-muted-foreground">📅 Frequency: {stage.frequency}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-bold mb-2">📋 APPLICATION RULES</h3>
        <ul className="space-y-1">
          {data.applicationRules.map((r, i) => (
            <li key={i} className="flex gap-2 text-muted-foreground">
              <span>{i + 1}.</span><span>{r}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-amber-50 rounded-lg p-3">
        <p className="font-semibold">🦟 MOSQUITO CONTROL</p>
        <p className="text-xs text-muted-foreground mt-1">{data.thymeOilTip}</p>
      </div>
    </div>
  );
}
