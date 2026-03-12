import React from 'react';
import type { Crop, CropData } from '../../types';
import { parseDate, daysBetween, today } from '../../lib/dates';
import { STAGE_COLORS } from '../../lib/stages';

interface CropCardProps {
  crop: Crop;
  cropData?: CropData;
  onClick: () => void;
  onAction: (action: string) => void;
}

export function CropCard({ crop, cropData, onClick, onAction }: CropCardProps) {
  const planted = parseDate(crop.plantingDate);
  const harvestEst = parseDate(crop.harvestDateEstimated);
  const daysOld = planted ? daysBetween(planted, today()) : 0;
  const totalDays = cropData?.growing_time_days ?? 90;
  const progress = Math.min(100, Math.round((daysOld / totalDays) * 100));
  const daysToHarvest = harvestEst ? daysBetween(today(), harvestEst) : null;

  const stageColor = STAGE_COLORS[crop.plantStage] ?? '#9e9e9e';

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 cursor-pointer active:scale-[0.98] transition-all"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{crop.cropName}</h3>
          {crop.variety && <p className="text-sm text-muted-foreground">{crop.variety}</p>}
        </div>
        <span
          className="text-xs font-bold uppercase px-2 py-0.5 rounded-full text-white ml-2 shrink-0"
          style={{ backgroundColor: stageColor }}
        >
          {crop.plantStage}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
        <span>Planted {daysOld}d ago</span>
        {daysToHarvest !== null && (
          <span className={daysToHarvest <= 7 ? 'text-amber-600 font-semibold' : ''}>
            {daysToHarvest > 0 ? `Harvest in ${daysToHarvest}d` : daysToHarvest === 0 ? '🥬 Harvest today!' : `${Math.abs(daysToHarvest)}d overdue`}
          </span>
        )}
      </div>

      <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${progress}%`, backgroundColor: '#2d6a2d' }}
        />
      </div>
      <p className="text-xs text-right text-muted-foreground">{progress}% · {crop.plantingMethod}</p>

      <div className="flex gap-2 mt-3">
        <button
          className="flex-1 text-xs py-1.5 rounded-lg bg-green-50 text-green-700 font-medium hover:bg-green-100"
          onClick={e => { e.stopPropagation(); onAction('update'); }}
        >Update</button>
        <button
          className="flex-1 text-xs py-1.5 rounded-lg bg-blue-50 text-blue-700 font-medium hover:bg-blue-100"
          onClick={e => { e.stopPropagation(); onAction('harvest'); }}
        >Harvest</button>
      </div>
    </div>
  );
}
