import React from 'react';
import { ArrowRight, Check, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import db from '../../db/db';
import type { Crop } from '../../types';
import { formatDateShort, today } from '../../lib/dates';
import { addDiaryEntry } from '../../lib/diary';
import {
  getPropMethod,
  nextPropStage,
  propGifUrl,
  propStageProgress,
} from '../../lib/propStages';

interface PropagationCardProps {
  crop: Crop;
}

/**
 * Propagation milestones live inside the crop record. This card advances the
 * separate propagationStage without disturbing the normal plant lifecycle.
 */
export function PropagationCard({ crop }: PropagationCardProps) {
  const method = getPropMethod(crop.propagationMethod);
  if (!method) return null;

  const current = crop.propagationStage || method.stages[0].key;
  const next = nextPropStage(crop.propagationMethod, current);
  const { index, total } = propStageProgress(crop.propagationMethod, current);
  const gif = propGifUrl(crop.propagationMethod, current, 256);

  async function markStage(stage: string) {
    try {
      await db.crops.update(crop.id, {
        propagationStage: stage,
        updatedAt: Date.now(),
      } as never);
      await addDiaryEntry({
        entryType: 'propagation_stage',
        cropId: crop.id,
        cropName: crop.cropName,
        variety: crop.variety,
        description: `${method!.label}: ${current} → ${stage}`,
        details: `Propagation milestone updated on ${formatDateShort(today())}`,
      });
      toast.success(`Propagation: ${stage}`);
    } catch (e) {
      console.error('[propagation] stage update failed', { id: crop.id, stage, e });
      toast.error('Could not update propagation stage: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-3 pt-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-green-700">Propagation · {method.label}</p>
          <p className="text-[11px] text-muted-foreground leading-tight">{method.description}</p>
        </div>
        <span className="text-[10px] font-bold bg-green-50 text-green-700 rounded-full px-2 py-1 shrink-0">
          {index + 1}/{total}
        </span>
      </div>

      <div className="flex items-center gap-3 p-3">
        {gif && (
          <img
            src={gif}
            alt={`${method.label} — ${current}`}
            className="w-20 h-20 rounded-xl object-cover border border-green-100 bg-green-50 shrink-0"
            loading="lazy"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase text-gray-400">Current milestone</p>
          <p className="text-sm font-bold text-gray-900">{current}</p>
          <p className="text-[10px] text-gray-500 leading-tight mt-0.5">
            {method.stages.find(s => s.key === current)?.hint}
          </p>
        </div>
      </div>

      <div className="flex gap-1 px-3">
        {method.stages.map((s, i) => (
          <div
            key={s.key}
            className={`h-1.5 flex-1 rounded-full ${i <= index ? 'bg-green-600' : 'bg-gray-200'}`}
            title={s.label}
          />
        ))}
      </div>

      <div className="p-3 space-y-1.5">
        {method.stages.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2 text-[11px]">
            <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${i < index ? 'bg-green-600 text-white' : i === index ? 'border-2 border-green-600 text-green-700 font-bold' : 'border border-gray-200 text-gray-300'}`}>
              {i < index ? <Check className="w-2.5 h-2.5" /> : i + 1}
            </span>
            <span className={i === index ? 'font-semibold text-gray-900' : i < index ? 'text-gray-500' : 'text-gray-400'}>{s.label}</span>
          </div>
        ))}
      </div>

      {next && (
        <button
          onClick={() => void markStage(next.key)}
          className="w-full flex items-center justify-center gap-1.5 bg-green-700 text-white text-xs font-semibold py-2.5"
        >
          Mark as {next.label} <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
      {!next && (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-green-50">
          <p className="text-[11px] text-green-800 font-semibold">Propagation complete — continue in Stages.</p>
          <button
            onClick={() => void markStage(method.stages[0].key)}
            className="text-[10px] text-green-700 flex items-center gap-1 shrink-0"
          >
            <RotateCcw className="w-3 h-3" /> Restart
          </button>
        </div>
      )}
    </div>
  );
}
