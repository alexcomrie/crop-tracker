import React from 'react';
import type { Propagation } from '../../types';
import { parseDate, daysBetween, today } from '../../lib/dates';

interface PropCardProps {
  prop: Propagation;
  onClick: () => void;
  onAction: (action: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  Propagating: '#2196f3',
  Rooted: '#43a047',
  Transplanted: '#26a69a',
  Failed: '#e53935',
};

export function PropCard({ prop, onClick, onAction }: PropCardProps) {
  const propDate = parseDate(prop.propagationDate);
  const daysOld = propDate ? daysBetween(propDate, today()) : 0;
  const rootingEnd = parseDate(prop.expectedRootingEnd);
  const isOverdue = rootingEnd && today() > rootingEnd && prop.status === 'Propagating';

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 cursor-pointer active:scale-[0.98] transition-all"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-semibold text-gray-900">{prop.plantName}</h3>
          <p className="text-sm text-muted-foreground">{prop.propagationMethod}</p>
        </div>
        <span className="text-xs font-bold uppercase px-2 py-0.5 rounded-full text-white ml-2"
          style={{ backgroundColor: STATUS_COLORS[prop.status] ?? '#9e9e9e' }}>
          {prop.status}
        </span>
      </div>

      <div className="text-xs text-muted-foreground mb-2">
        <span>Day {daysOld}</span>
        {prop.expectedRootingStart && prop.expectedRootingEnd && (
          <span className="ml-2">🌿 Rooting: {prop.expectedRootingStart} – {prop.expectedRootingEnd}</span>
        )}
        {isOverdue && <span className="ml-2 text-red-600 font-semibold">⚠️ Overdue</span>}
      </div>

      <div className="flex gap-2 mt-3">
        {prop.status === 'Propagating' && (
          <button className="flex-1 text-xs py-1.5 rounded-lg bg-green-50 text-green-700 font-medium"
            onClick={e => { e.stopPropagation(); onAction('rooted'); }}>Mark Rooted</button>
        )}
        {prop.status === 'Rooted' && (
          <button className="flex-1 text-xs py-1.5 rounded-lg bg-blue-50 text-blue-700 font-medium"
            onClick={e => { e.stopPropagation(); onAction('transplanted'); }}>Mark Transplanted</button>
        )}
      </div>
    </div>
  );
}
