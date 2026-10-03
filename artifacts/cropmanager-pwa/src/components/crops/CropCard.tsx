import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import type { Crop, CropData } from '../../types';
import { parseDate, daysBetween, today } from '../../lib/dates';
import { STAGE_COLORS } from '../../lib/stages';

interface CropCardProps {
  crop: Crop;
  cropData?: CropData;
  onClick: () => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  kind?: 'crop' | 'propagation';
  onLongPress?: () => void;
}

export function CropCard({ crop, cropData, onClick, selectMode, selected, onToggle, kind = 'crop', onLongPress }: CropCardProps) {
  const pressTimer = React.useRef<number | null>(null);
  const pressFired = React.useRef(false);

  function cancelPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function startPress() {
    if (!onLongPress || selectMode) return;
    pressFired.current = false;
    cancelPress();
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      pressFired.current = true;
      onLongPress();
    }, 500);
  }

  function handleClick() {
    if (pressFired.current) {
      pressFired.current = false;
      return;
    }
    onClick();
  }
  const harvestLogs = useLiveQuery(() =>
    db.harvestLogs.where('cropTrackingId').equals(crop.id).toArray()
  , [crop.id]);

  const planted = parseDate(crop.plantingDate);
  const harvestEst = parseDate(crop.harvestDateEstimated);
  const daysOld = planted ? daysBetween(planted, today()) : 0;
  const totalDays = cropData?.growing_time_days ?? 90;
  const progress = Math.min(100, Math.max(0, Math.round((daysOld / totalDays) * 100)));
  const daysToHarvest = harvestEst ? daysBetween(today(), harvestEst) : null;
  const harvestCount = harvestLogs?.length ?? 0;

  const stageColor = STAGE_COLORS[crop.plantStage] ?? '#9e9e9e';

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border py-3 px-3 cursor-pointer active:scale-[0.98] transition-all select-none ${selected ? 'border-green-600 ring-1 ring-green-600' : 'border-gray-100'}`}
      onClick={handleClick}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      onContextMenu={e => { if (onLongPress && !selectMode) e.preventDefault(); }}
    >
      <div className="flex items-center justify-between gap-2">
        {selectMode && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={e => { e.stopPropagation(); onToggle?.(); }}
            onClick={e => e.stopPropagation()}
            className="w-5 h-5 accent-green-700 shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[14px] text-gray-900 truncate leading-tight">{crop.cropName}</h3>
          {crop.variety && <p className="text-[11px] text-muted-foreground truncate">{crop.variety} · {crop.plantingMethod}</p>}
          {!crop.variety && <p className="text-[11px] text-muted-foreground truncate">{crop.plantingMethod}</p>}
        </div>
        <span className="flex items-center gap-1 shrink-0">
          <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full leading-none ${kind === 'crop' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
            {kind === 'crop' ? '🌾 Crop' : '🌿 Prop'}
          </span>
          <span
            className="text-[10px] font-bold uppercase px-2 py-1 rounded-full text-white leading-none"
            style={{ backgroundColor: stageColor }}
          >
            {crop.plantStage}
          </span>
        </span>
      </div>

      <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2.5 mb-1">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${progress}%`, backgroundColor: '#2d6a2d' }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Day {daysOld} · {progress}%</span>
        <span className="flex items-center gap-1">
          {harvestCount > 0 && <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full font-bold">×{harvestCount}</span>}
          {daysToHarvest !== null && (
            <span className={daysToHarvest <= 7 && daysToHarvest >= 0 ? 'text-amber-600 font-semibold' : daysToHarvest < 0 ? 'text-red-500' : ''}>
              {daysToHarvest > 0 ? `${daysToHarvest}d left` : daysToHarvest === 0 ? 'today' : `${Math.abs(daysToHarvest)}d over`}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
