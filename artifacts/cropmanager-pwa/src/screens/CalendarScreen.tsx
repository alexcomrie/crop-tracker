import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { addDays, formatDateShort, today } from '../lib/dates';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type ViewMode = 'week' | 'month' | 'year';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getMonthDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const days: Date[] = [];
  for (let i = 0; i < startPad; i++) days.push(new Date(year, month, -startPad + i + 1));
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  const endPad = 42 - days.length;
  for (let i = 1; i <= endPad; i++) days.push(new Date(year, month + 1, i));
  return days;
}

export function CalendarScreen() {
  const [view, setView] = useState<ViewMode>('week');
  const [todayDate] = useState(() => new Date());
  const todayStr = formatDateShort(todayDate);

  // Week state
  const [weekOffset, setWeekOffset] = useState(0);
  // Month/Year state
  const [viewYear, setViewYear] = useState(todayDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayDate.getMonth());

  // Fetch all activities
  const allActivities = useLiveQuery(() => db.activities.toArray());
  const loading = allActivities === undefined;
  const activities = allActivities ?? [];

  // Build a Set of date strings that have activities
  const activityDates = useMemo(() => {
    const set = new Set<string>();
    for (const a of activities) {
      if (a.date) set.add(a.date);
    }
    return set;
  }, [activities]);

  // Week view data
  const weekStart = useMemo(() => addDays(todayDate, weekOffset * 7), [weekOffset]);
  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const weekDayStrs = useMemo(() => weekDays.map(d => formatDateShort(d)), [weekDays]);

  // Month view data
  const monthDays = useMemo(() => getMonthDays(viewYear, viewMonth), [viewYear, viewMonth]);
  const firstMonthDay = new Date(viewYear, viewMonth, 1);

  // Navigation
  const goNext = () => {
    if (view === 'week') setWeekOffset(w => w + 1);
    else if (view === 'month') {
      if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
      else setViewMonth(m => m + 1);
    } else setViewYear(y => y + 1);
  };
  const goPrev = () => {
    if (view === 'week') setWeekOffset(w => w - 1);
    else if (view === 'month') {
      if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
      else setViewMonth(m => m - 1);
    } else setViewYear(y => y - 1);
  };

  const viewTitle = view === 'week'
    ? `${MONTHS[weekDays[0].getMonth()]} ${weekDays[0].getDate()} — ${MONTHS[weekDays[6].getMonth()]} ${weekDays[6].getDate()}, ${weekDays[6].getFullYear()}`
    : view === 'month'
    ? `${MONTHS[viewMonth]} ${viewYear}`
    : `${viewYear}`;

  return (
    <div className="pb-24">
      {/* View Toggle + Navigation */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-2">
          <button onClick={goPrev} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
          <button onClick={() => { setWeekOffset(0); setViewYear(todayDate.getFullYear()); setViewMonth(todayDate.getMonth()); }} className="text-sm font-semibold text-gray-800 hover:text-green-700">{viewTitle}</button>
          <button onClick={goNext} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight className="w-5 h-5 text-gray-600" /></button>
        </div>
        <div className="flex px-4 pb-2 gap-1">
          {(['week', 'month', 'year'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                view === v ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Week View */}
      {view === 'week' && (
        <div className="px-4 pt-3 space-y-2">
          {weekDays.map((day, i) => {
            const dayStr = weekDayStrs[i];
            const isToday = dayStr === todayStr;
            const hasActivity = activityDates.has(dayStr);
            return (
              <div
                key={dayStr}
                className={`rounded-xl border p-3 ${isToday ? 'border-green-400 bg-green-50' : 'bg-white border-gray-100'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className={`font-semibold text-sm ${isToday ? 'text-green-700' : 'text-gray-800'}`}>
                    {DAYS_SHORT[day.getDay()]}, {MONTHS[day.getMonth()]} {day.getDate()}
                    {isToday && <span className="ml-2 text-xs bg-green-600 text-white px-1.5 rounded-full">Today</span>}
                    {hasActivity && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 rounded-full">Activity</span>}
                  </p>
                </div>
                {hasActivity ? (
                  <div className="space-y-1">
                    {activities.filter(a => a.date === dayStr).map(a => (
                      <div key={a.id} className="flex items-center gap-2 text-xs">
                        <span className="text-gray-700">{a.type}: {a.product || a.notes}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No activities</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Month View */}
      {view === 'month' && (
        <div className="px-3 pt-3">
          <div className="grid grid-cols-7 gap-0.5">
            {DAYS_SHORT.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-gray-400 uppercase py-1">{d}</div>
            ))}
            {monthDays.map((day, i) => {
              const dayStr = formatDateShort(day);
              const isToday = dayStr === todayStr;
              const isCurrentMonth = day.getMonth() === viewMonth;
              const hasActivity = activityDates.has(dayStr);
              return (
                <div
                  key={i}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm relative ${
                    isToday ? 'bg-green-600 text-white font-bold' : isCurrentMonth ? 'text-gray-800' : 'text-gray-300'
                  } ${!isToday && isCurrentMonth ? 'hover:bg-gray-50' : ''}`}
                >
                  <span>{day.getDate()}</span>
                  {hasActivity && (
                    <span className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${isToday ? 'bg-white' : 'bg-green-500'}`} />
                  )}
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Activity logged</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 px-1.5 rounded bg-green-600 text-white text-[10px] font-bold">16</span> Today</span>
          </div>
        </div>
      )}

      {/* Year View */}
      {view === 'year' && (
        <div className="px-3 pt-3">
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 12 }, (_, m) => {
              const days = getMonthDays(viewYear, m);
              const first = days.find(d => d.getMonth() === m)!;
              const daysInMonth = days.filter(d => d.getMonth() === m);
              const activityCount = daysInMonth.filter(d => activityDates.has(formatDateShort(d))).length;
              return (
                <div key={m} className="bg-white rounded-xl border border-gray-100 p-2">
                  <p className="text-xs font-bold text-gray-700 mb-1">{MONTHS[m]}</p>
                  <div className="grid grid-cols-7 gap-0.5">
                    {days.filter(d => d.getMonth() === m || (m === 0 && d.getMonth() === 11 && d.getFullYear() < viewYear) || (m === 11 && d.getMonth() === 0 && d.getFullYear() > viewYear)).slice(0, 35).map((day, i) => {
                      const dayStr = formatDateShort(day);
                      const isCurrentMonth = day.getMonth() === m;
                      const hasActivity = isCurrentMonth && activityDates.has(dayStr);
                      const isToday = dayStr === todayStr;
                      return (
                        <div
                          key={i}
                          className={`text-center text-[9px] leading-none py-0.5 rounded ${
                            isToday ? 'bg-green-600 text-white font-bold' : isCurrentMonth ? 'text-gray-700' : 'text-gray-200'
                          }`}
                        >
                          {day.getDate()}
                          {hasActivity && <span className="block w-1 h-1 mx-auto rounded-full bg-green-500 mt-0.5" />}
                        </div>
                      );
                    })}
                  </div>
                  {activityCount > 0 && (
                    <p className="text-[9px] text-green-600 font-medium mt-1">{activityCount} activity days</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && view === 'week' && (
        <div className="px-4 text-center py-8">
          <div className="animate-pulse space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
          </div>
        </div>
      )}
    </div>
  );
}
