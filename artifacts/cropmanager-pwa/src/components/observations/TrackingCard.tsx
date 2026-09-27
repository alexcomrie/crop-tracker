import React from 'react';
import type { Tracking } from '../../types';
import { parseDate, daysBetween, today } from '../../lib/dates';

interface TrackingCardProps {
  tracking: Tracking;
  onFinish: (id: string, startDate: string, label: string) => void;
  onDelete: (id: string) => void;
}

/** Shared fruit/crop growth tracking card: start date + elapsed days only. No guessed maturity. */
export function TrackingCard({ tracking: t, onFinish, onDelete }: TrackingCardProps) {
  const start = parseDate(t.startDate);
  const end = t.status !== 'active' && t.endDate ? (parseDate(t.endDate) ?? today()) : today();
  const elapsed = start ? Math.max(0, daysBetween(start, end)) : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-[13px] truncate">
          {t.tagNumber && <span className="mr-1.5 inline-block bg-green-50 text-green-700 px-1.5 py-0.5 rounded-md text-[10px] font-bold">#{t.tagNumber}</span>}
          {t.label}
        </p>
        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${t.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {t.status}
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
        <span>Started {t.startDate}</span>
        <span className="font-bold text-gray-900 text-[13px]">Day {elapsed}</span>
      </div>
      {t.status !== 'active' && (
        <p className="text-[11px] text-muted-foreground mt-0.5">Matured {t.endDate} · took {elapsed}d</p>
      )}
      {t.notes && <p className="text-xs text-gray-600 mt-1 whitespace-pre-line">{t.notes}</p>}
      <div className="flex gap-2 mt-2">
        {t.status === 'active' && (
          <button onClick={() => onFinish(t.id, t.startDate, t.tagNumber ? `#${t.tagNumber} ${t.label}` : t.label)} className="flex-1 text-xs font-semibold text-green-700 bg-green-50 rounded-lg py-1.5">Ripe — finish</button>
        )}
        <button onClick={() => onDelete(t.id)} className="flex-1 text-xs font-semibold text-red-600 bg-red-50 rounded-lg py-1.5">Delete</button>
      </div>
    </div>
  );
}
