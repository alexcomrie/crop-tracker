import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { addDays, formatDateShort, formatDateDisplay, today } from '../lib/dates';
import { useWeather } from '../hooks/useWeather';

const TYPE_EMOJI: Record<string, string> = {
  harvest: '🥬', transplant: '🌱', spray_fungus: '🍄', spray_pest: '🐛',
  next_planting: '📅', germination_check: '🌱', rooting_check: '🌿',
  true_leaf_check: '🍃', fert_application: '💧',
};

export function CalendarScreen() {
  const [weekOffset, setWeekOffset] = useState(0);
  const { forecasts } = useWeather();

  const start = addDays(today(), weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const dayStrs = days.map(d => formatDateShort(d));

  const reminders = useLiveQuery(async () => {
    const all = await db.reminders.filter(r => !r.sent).toArray();
    return all.filter(r => dayStrs.includes(r.sendDate));
  }, [weekOffset]) ?? [];

  return (
    <div className="pb-24 pt-2">
      {/* Week navigation */}
      <div className="flex items-center justify-between px-4 mb-3">
        <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 rounded-lg hover:bg-gray-100 text-xl">‹</button>
        <p className="font-semibold text-sm">
          {formatDateDisplay(start).replace(/\w+ /, '')} — {formatDateDisplay(days[6]).replace(/\w+ /, '')}
        </p>
        <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 rounded-lg hover:bg-gray-100 text-xl">›</button>
      </div>

      <div className="px-4 space-y-2">
        {days.map((day, i) => {
          const dayStr = dayStrs[i];
          const dayReminders = reminders.filter(r => r.sendDate === dayStr);
          const forecast = forecasts[weekOffset * 7 + i];
          const isToday = dayStr === formatDateShort(today());

          return (
            <div
              key={dayStr}
              className={`rounded-xl border p-3 ${isToday ? 'border-green-400 bg-green-50' : 'bg-white border-gray-100'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className={`font-semibold text-sm ${isToday ? 'text-green-700' : 'text-gray-800'}`}>
                  {formatDateDisplay(day)}
                  {isToday && <span className="ml-2 text-xs bg-green-600 text-white px-1.5 rounded-full">Today</span>}
                </p>
                {forecast && (
                  <span className="text-xs text-muted-foreground">
                    {forecast.emoji} {forecast.tempMax}°{forecast.precipMm > 0 ? ` · ${forecast.precipMm}mm` : ''}
                  </span>
                )}
              </div>

              {dayReminders.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing due</p>
              ) : (
                <div className="space-y-1">
                  {dayReminders.map(r => (
                    <div key={r.id} className="flex items-center gap-2 text-xs">
                      <span>{TYPE_EMOJI[r.type] ?? '📌'}</span>
                      <span className="text-gray-700">{r.subject}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
