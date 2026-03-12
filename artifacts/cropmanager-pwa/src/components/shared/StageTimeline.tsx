import React from 'react';
import { STAGE_COLORS } from '../../lib/stages';

interface Stage {
  label: string;
  date: string;
  done: boolean;
}

interface StageTimelineProps {
  stages: Stage[];
}

export function StageTimeline({ stages }: StageTimelineProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2">
      {stages.map((s, i) => (
        <React.Fragment key={s.label}>
          <div className="flex flex-col items-center min-w-[60px]">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 ${s.done ? 'border-transparent' : 'border-gray-300 bg-gray-100 text-gray-400'}`}
              style={s.done ? { backgroundColor: '#2d6a2d', borderColor: '#2d6a2d' } : {}}
            >
              {s.done ? '✓' : i + 1}
            </div>
            <span className="text-xs text-center mt-1 text-muted-foreground leading-tight">{s.label}</span>
            {s.date && <span className="text-xs text-center text-green-700 font-medium">{s.date}</span>}
          </div>
          {i < stages.length - 1 && (
            <div className={`flex-1 h-0.5 min-w-[12px] ${s.done ? 'bg-green-600' : 'bg-gray-200'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
