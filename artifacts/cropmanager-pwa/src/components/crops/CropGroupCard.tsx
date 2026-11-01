import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Crop, CropData } from '../../types';
import { parseDate, daysBetween, today } from '../../lib/dates';
import { STAGE_COLORS } from '../../lib/stages';
import { stageGifUrl } from '../../lib/stageGifs';

interface CropGroupCardProps {
  name: string;
  crops: Crop[];
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenCrop: (crop: Crop) => void;
  onLongPressCrop?: (crop: Crop) => void;
  selectMode?: boolean;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  cropDataFor: (crop: Crop) => CropData | undefined;
}

function daysFor(crop: Crop) {
  const planted = parseDate(crop.plantingDate);
  return planted ? daysBetween(planted, today()) : 0;
}

/**
 * Collapsible card that bundles 2+ crops sharing a name (e.g. "Pumpkin ×3").
 * Each row shows its own day progress instead of a shared progress bar.
 */
export function CropGroupCard({
  name, crops, expanded, onToggleExpand, onOpenCrop, onLongPressCrop,
  selectMode, selectedIds, onToggleSelect, cropDataFor,
}: CropGroupCardProps) {
  const pressTimer = React.useRef<number | null>(null);
  const pressFired = React.useRef<string | null>(null);

  function cancelPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function startPress(crop: Crop) {
    if (!onLongPressCrop || selectMode) return;
    pressFired.current = null;
    cancelPress();
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      pressFired.current = crop.id;
      onLongPressCrop(crop);
    }, 500);
  }

  const selectedCount = crops.filter(c => selectedIds.includes(c.id)).length;

  return (
    <div className={`bg-white rounded-xl shadow-sm border overflow-hidden ${selectedCount > 0 ? 'border-green-600 ring-1 ring-green-600' : 'border-gray-100'}`}>
      <button
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2 py-3 px-3 text-left active:bg-gray-50 select-none"
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[14px] text-gray-900 truncate leading-tight">
            {name} <span className="text-green-700">×{crops.length}</span>
          </h3>
          <p className="text-[11px] text-muted-foreground truncate">
            {crops.length} entries · tap to {expanded ? 'collapse' : 'see each one'}
            {selectMode && selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
          </p>
        </div>
        <div className="flex -space-x-2 shrink-0">
          {crops.slice(0, 3).map(c => (
            <img
              key={c.id}
              src={stageGifUrl(c.plantStage, 32)}
              alt=""
              className="w-8 h-8 rounded-full object-contain bg-gray-50 border-2 border-white"
              loading="lazy"
            />
          ))}
          {crops.length > 3 && (
            <span className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white text-[10px] font-bold text-gray-500 flex items-center justify-center">
              +{crops.length - 3}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {crops.map(crop => {
            const daysOld = daysFor(crop);
            const totalDays = cropDataFor(crop)?.growing_time_days ?? 90;
            const progress = Math.min(100, Math.max(0, Math.round((daysOld / totalDays) * 100)));
            const harvestEst = parseDate(crop.harvestDateEstimated);
            const daysToHarvest = harvestEst ? daysBetween(today(), harvestEst) : null;
            const stageColor = STAGE_COLORS[crop.plantStage] ?? '#9e9e9e';
            const selected = selectedIds.includes(crop.id);

            function handleClick() {
              if (pressFired.current === crop.id) {
                pressFired.current = null;
                return;
              }
              if (selectMode) onToggleSelect(crop.id);
              else onOpenCrop(crop);
            }

            return (
              <div
                key={crop.id}
                role="button"
                tabIndex={0}
                onClick={handleClick}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
                onTouchStart={() => startPress(crop)}
                onTouchEnd={cancelPress}
                onTouchMove={cancelPress}
                onMouseDown={() => startPress(crop)}
                onMouseUp={cancelPress}
                onMouseLeave={cancelPress}
                onContextMenu={e => { if (onLongPressCrop && !selectMode) e.preventDefault(); }}
                className="flex items-center gap-2 py-2.5 px-3 cursor-pointer active:bg-gray-50 select-none"
              >
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelect(crop.id)}
                    onClick={e => e.stopPropagation()}
                    className="w-5 h-5 accent-green-700 shrink-0"
                  />
                )}
                <img src={stageGifUrl(crop.plantStage, 32)} alt="" className="w-8 h-8 shrink-0 rounded-lg object-contain" loading="lazy" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[12px] font-medium truncate">
                      {crop.variety || crop.plantingMethod || 'Standard'}
                    </span>
                    <span
                      className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full text-white leading-none shrink-0"
                      style={{ backgroundColor: stageColor }}
                    >
                      {crop.plantStage}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Day {daysOld} · {progress}% grown
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {daysToHarvest !== null && (
                    <p className={`text-[10px] font-semibold ${daysToHarvest <= 7 && daysToHarvest >= 0 ? 'text-amber-600' : daysToHarvest < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                      {daysToHarvest > 0 ? `${daysToHarvest}d left` : daysToHarvest === 0 ? 'today' : `${Math.abs(daysToHarvest)}d over`}
                    </p>
                  )}
                  <p className="text-[9px] text-muted-foreground">
                    {crop.batchNumber ? `Batch ${crop.batchNumber}` : crop.plotId || '—'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
