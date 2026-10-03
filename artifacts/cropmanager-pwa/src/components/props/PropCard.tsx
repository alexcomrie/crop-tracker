import React from 'react';
import type { Propagation } from '../../types';
import { parseDate, daysBetween, today } from '../../lib/dates';

interface PropCardProps {
  prop: Propagation;
  onClick: () => void;
  onAction: (action: string) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  onLongPress?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  Propagating: '#2196f3',
  Callusing: '#7c4dff',
  Rooted: '#43a047',
  'Potted / Transplanted': '#26a69a',
  Failed: '#e53935',
};

export function PropCard({ prop, onClick, onAction, selectMode, selected, onToggle, onLongPress }: PropCardProps) {
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
  const propDate = parseDate(prop.propagationDate);
  const daysOld = propDate ? daysBetween(propDate, today()) : 0;
  const rootingEnd = parseDate(prop.expectedRootingEnd);
  const isOverdue = rootingEnd && today() > rootingEnd && (prop.status === 'Propagating' || prop.status === 'Callusing');

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
      <div className="flex items-start justify-between mb-2 gap-2">
        {selectMode && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={e => { e.stopPropagation(); onToggle?.(); }}
            onClick={e => e.stopPropagation()}
            className="w-5 h-5 accent-green-700 shrink-0 mt-0.5"
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{prop.plantName}</h3>
          <p className="text-sm text-muted-foreground truncate">{prop.propagationMethod}</p>
        </div>
        <span className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full leading-none bg-blue-50 text-blue-700">
            🌿 Prop
          </span>
          <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full text-white ml-1 whitespace-nowrap leading-none"
            style={{ backgroundColor: STATUS_COLORS[prop.status] ?? '#9e9e9e' }}>
            {prop.status}
          </span>
        </span>
      </div>

      <div className="text-xs text-muted-foreground mb-2">
        <span>Day {daysOld}</span>
        {prop.expectedRootingStart && prop.expectedRootingEnd && (
          <span className="ml-2">🌿 Rooting: {prop.expectedRootingStart} – {prop.expectedRootingEnd}</span>
        )}
        {isOverdue && <span className="ml-2 text-red-600 font-semibold">⚠️ Overdue</span>}
      </div>

      <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
        {prop.status === 'Propagating' && (
          <button className="flex-1 text-xs py-1.5 px-2 rounded-lg bg-indigo-50 text-indigo-700 font-medium whitespace-nowrap"
            onClick={e => { e.stopPropagation(); onAction('Callusing'); }}>Mark Callusing</button>
        )}
        {(prop.status === 'Propagating' || prop.status === 'Callusing') && (
          <button className="flex-1 text-xs py-1.5 px-2 rounded-lg bg-green-50 text-green-700 font-medium whitespace-nowrap"
            onClick={e => { e.stopPropagation(); onAction('Rooted'); }}>Mark Rooted</button>
        )}
        {prop.status === 'Rooted' && (
          <button className="flex-1 text-xs py-1.5 px-2 rounded-lg bg-blue-50 text-blue-700 font-medium whitespace-nowrap"
            onClick={e => { e.stopPropagation(); onAction('Potted / Transplanted'); }}>Mark Potted</button>
        )}
      </div>
    </div>
  );
}
