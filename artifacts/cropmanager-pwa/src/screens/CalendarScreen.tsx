import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { addDays, formatDateShort, today } from '../lib/dates';
import { buildFarmEvents, type FarmEvent } from '../lib/farmEvents';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type ViewMode = 'week' | 'month' | 'year';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const KIND_DOT: Record<string, string> = {
  activity: 'bg-gray-400', treatment: 'bg-cyan-500', harvest: 'bg-amber-500',
  stage: 'bg-green-500', observation: 'bg-teal-500', tracking: 'bg-orange-500',
  finance: 'bg-emerald-500', reminder: 'bg-purple-500',
};

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

function EventLine({ e }: { e: FarmEvent }) {
  return (
    <div className="flex items-center gap-2 text-xs py-0.5">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${KIND_DOT[e.kind] ?? 'bg-gray-400'}`} />
      <span className="text-gray-700 truncate">{e.title}</span>
      <span className="text-gray-400 shrink-0">[{e.kind}]</span>
    </div>
  );
}

export function CalendarScreen() {
  const [view, setView] = useState<ViewMode>('week');
  const todayDate = today();
  const todayStr = formatDateShort(todayDate);

  const [weekOffset, setWeekOffset] = useState(0);
  const [viewYear, setViewYear] = useState(todayDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayDate.getMonth());
  const [expandedDay, setExpandedDay] = useState<string | null>(todayStr);
  const [monthSelected, setMonthSelected] = useState<string | null>(null);

  const activities = useLiveQuery(() => db.activities.toArray().catch(() => [])) ?? [];
  const treatmentLogs = useLiveQuery(() => db.treatmentLogs.toArray().catch(() => [])) ?? [];
  const harvestLogs = useLiveQuery(() => db.harvestLogs.toArray().catch(() => [])) ?? [];
  const stageLogs = useLiveQuery(() => db.stageLogs.toArray().catch(() => [])) ?? [];
  const observationLogs = useLiveQuery(() => db.observationLogs.toArray().catch(() => [])) ?? [];
  const observationEntries = useLiveQuery(() => db.observationEntries.toArray().catch(() => [])) ?? [];
  const trackings = useLiveQuery(() => db.trackings.toArray().catch(() => [])) ?? [];
  const trackingEntries = useLiveQuery(() => db.trackingEntries.toArray().catch(() => [])) ?? [];
  const ledgerEntries = useLiveQuery(() => db.ledgerEntries.toArray().catch(() => [])) ?? [];
  const reminders = useLiveQuery(() => db.reminders.toArray().catch(() => [])) ?? [];

  const eventsByDate = useMemo(() => {
    const events = buildFarmEvents({
      activities, treatmentLogs, harvestLogs, stageLogs, observationLogs,
      observationEntries, trackings, trackingEntries, ledgerEntries, reminders,
    });
    const map = new Map<string, FarmEvent[]>();
    for (const e of events) {
      if (!e.date) continue;
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [activities, treatmentLogs, harvestLogs, stageLogs, observationLogs, observationEntries, trackings, trackingEntries, ledgerEntries, reminders]);

  const hasEvent = (dayStr: string) => (eventsByDate.get(dayStr)?.length ?? 0) > 0;

  const weekStart = useMemo(() => addDays(todayDate, weekOffset * 7), [weekOffset, todayDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekDayStrs = useMemo(() => weekDays.map(d => formatDateShort(d)), [weekDays]);

  const monthDays = useMemo(() => getMonthDays(viewYear, viewMonth), [viewYear, viewMonth]);
  const monthEvents = useMemo(() => {
    const list: { date: string; events: FarmEvent[] }[] = [];
    for (const d of monthDays) {
      if (d.getMonth() !== viewMonth) continue;
      const key = formatDateShort(d);
      const evs = eventsByDate.get(key);
      if (evs?.length) list.push({ date: key, events: evs });
    }
    return list;
  }, [monthDays, viewMonth, eventsByDate]);

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

  const jumpToMonth = (year: number, month: number) => {
    setViewYear(year);
    setViewMonth(month);
    setMonthSelected(null);
    setView('month');
  };

  const viewTitle = view === 'week'
    ? `${MONTHS[weekDays[0].getMonth()]} ${weekDays[0].getDate()} — ${MONTHS[weekDays[6].getMonth()]} ${weekDays[6].getDate()}, ${weekDays[6].getFullYear()}`
    : view === 'month' ? `${MONTHS[viewMonth]} ${viewYear}` : `${viewYear}`;

  return (
    <div className="min-h-screen bg-gray-50 pb-24 pt-2">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-2">
          <button onClick={goPrev} aria-label="Previous period" className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
          <button onClick={() => { setWeekOffset(0); setViewYear(todayDate.getFullYear()); setViewMonth(todayDate.getMonth()); }} className="text-sm font-semibold text-gray-800 hover:text-green-700">{viewTitle}</button>
          <button onClick={goNext} aria-label="Next period" className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight className="w-5 h-5 text-gray-600" /></button>
        </div>
        <div className="flex px-4 pb-2 gap-1">
          {(['week', 'month', 'year'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${view === v ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {view === 'week' && (
        <div className="px-4 pt-3 space-y-2">
          {weekDays.map((day, i) => {
            const dayStr = weekDayStrs[i];
            const isToday = dayStr === todayStr;
            const evs = eventsByDate.get(dayStr) ?? [];
            const open = expandedDay === dayStr;
            return (
              <button key={dayStr} onClick={() => setExpandedDay(open ? null : dayStr)}
                className={`w-full text-left rounded-xl border p-3 ${isToday ? 'border-green-400 bg-green-50' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className={`font-semibold text-sm ${isToday ? 'text-green-700' : 'text-gray-800'}`}>
                    {DAYS_SHORT[day.getDay()]}, {MONTHS[day.getMonth()]} {day.getDate()}
                    {isToday && <span className="ml-2 text-xs bg-green-600 text-white px-1.5 rounded-full">Today</span>}
                  </p>
                  <span className="text-[11px] text-muted-foreground">{evs.length === 0 ? 'no events' : `${evs.length} event${evs.length === 1 ? '' : 's'} ${open ? '▾' : '▸'}`}</span>
                </div>
                {open && (
                  <div className="mt-1 border-t border-gray-100 pt-1.5">
                    {evs.length === 0
                      ? <p className="text-xs text-gray-400">Nothing logged — tap + in Crops or Activity to add.</p>
                      : evs.slice(0, 8).map(e => <EventLine key={e.id} e={e} />)}
                    {evs.length > 8 && <p className="text-[10px] text-gray-400">+{evs.length - 8} more</p>}
                  </div>
                )}
              </button>
            );
          })}
          <p className="text-[10px] text-muted-foreground px-1">Tap a day to expand / collapse its events (auto-collapsed to prevent clutter).</p>
        </div>
      )}

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
              const evs = eventsByDate.get(dayStr) ?? [];
              const selected = monthSelected === dayStr;
              return (
                <button key={i} onClick={() => setMonthSelected(selected ? null : dayStr)}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm relative ${
                    isToday ? 'bg-green-600 text-white font-bold' : selected ? 'bg-green-100 font-bold text-green-800' : isCurrentMonth ? 'text-gray-800' : 'text-gray-300'
                  } ${!isToday && isCurrentMonth ? 'hover:bg-gray-50' : ''}`}>
                  <span>{day.getDate()}</span>
                  {evs.length > 0 && (
                    <span className={`absolute bottom-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${isToday ? 'bg-white text-green-700' : 'bg-green-600 text-white'}`}>
                      {evs.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-600" /> Day with events (badge = count)</span>
          </div>
          <div className="mt-3 space-y-3">
            {(monthSelected ? monthEvents.filter(m => m.date === monthSelected) : monthEvents).map(m => (
              <div key={m.date} className="bg-white rounded-xl border border-gray-100 p-3">
                <p className="text-xs font-bold text-gray-700 mb-1">{m.date} · {m.events.length} event{m.events.length === 1 ? '' : 's'}</p>
                {m.events.map(e => <EventLine key={e.id} e={e} />)}
              </div>
            ))}
            {monthEvents.length === 0 && <p className="text-xs text-gray-400 text-center py-6">No events this month yet.</p>}
          </div>
        </div>
      )}

      {view === 'year' && (
        <div className="px-3 pt-3">
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 12 }, (_, m) => {
              const days = getMonthDays(viewYear, m);
              const inMonth = days.filter(d => d.getMonth() === m);
              const activeDays = inMonth.filter(d => hasEvent(formatDateShort(d)));
              return (
                <button key={m} onClick={() => jumpToMonth(viewYear, m)} className="bg-white rounded-xl border border-gray-100 p-2 text-left hover:border-green-300">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-bold text-gray-700">{MONTHS[m]}</p>
                    {activeDays.length > 0 && <span className="text-[9px] font-bold bg-green-600 text-white rounded-full px-1.5 py-0.5">{activeDays.length}d</span>}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5">
                    {inMonth.slice(0, 35).map((day, i) => {
                      const dayStr = formatDateShort(day);
                      const hot = hasEvent(dayStr);
                      const isToday = dayStr === todayStr;
                      return (
                        <div key={i}
                          className={`text-center text-[9px] leading-none py-1 rounded ${isToday ? 'bg-green-600 text-white font-bold' : hot ? 'bg-green-100 text-green-800 font-bold' : 'text-gray-400'}`}>
                          {day.getDate()}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-gray-400 mt-1">Tap to open {MONTHS[m]} →</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
