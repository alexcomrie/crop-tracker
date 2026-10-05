import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, BookOpen, CalendarDays } from 'lucide-react';
import db from '../../db/db';
import { parseDate, formatDateShort, today } from '../../lib/dates';
import { buildFarmEvents, groupEventsByDate } from '../../lib/farmEvents';
import { cropStatusLine, trackingStatusLine, storyForDay } from '../../lib/dailyStory';

/**
 * Daily farm journal in natural language: one entry per date with the
 * day's events written out, plus quiet-day status lines (days in stage,
 * days since pollination). Newest day first.
 */
export default function DiaryScreen() {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set([formatDateShort(today())]));

  const activities = useLiveQuery(() => db.activities.toArray().catch(() => [])) ?? [];
  const treatmentLogs = useLiveQuery(() => db.treatmentLogs.toArray().catch(() => [])) ?? [];
  const harvestLogs = useLiveQuery(() => db.harvestLogs.toArray().catch(() => [])) ?? [];
  const stageLogs = useLiveQuery(() => db.stageLogs.toArray().catch(() => [])) ?? [];
  const observationLogs = useLiveQuery(() => db.observationLogs.toArray().catch(() => [])) ?? [];
  const observationEntries = useLiveQuery(() => db.observationEntries.toArray().catch(() => [])) ?? [];
  const trackings = useLiveQuery(() => db.trackings.toArray().catch(() => [])) ?? [];
  const trackingEntries = useLiveQuery(() => db.trackingEntries.toArray().catch(() => [])) ?? [];
  const ledgerEntries = useLiveQuery(() => db.ledgerEntries.toArray().catch(() => [])) ?? [];
  const crops = useLiveQuery(() => db.crops.toArray().catch(() => [])) ?? [];
  const activeCrops = useMemo(() => crops.filter(c => c.status === 'Active'), [crops]);

  const days = useMemo(() => {
    const q = search.trim().toLowerCase();
    const events = buildFarmEvents({
      activities, treatmentLogs, harvestLogs, stageLogs,
      observationLogs, observationEntries, trackings, trackingEntries, ledgerEntries,
    }).filter(e =>
      !q || e.title.toLowerCase().includes(q) || e.subtitle.toLowerCase().includes(q) || e.cropName.toLowerCase().includes(q)
    );
    const groups = groupEventsByDate(events);
    // Quiet days still get a journal page when crops are in the ground:
    // backfill the most recent 14 days so status lines have somewhere to live.
    const known = new Set(groups.map(g => g.date));
    const out = [...groups];
    for (let i = 0; i < 14; i++) {
      const d = new Date(today().getTime() - i * 86400000);
      const key = formatDateShort(d);
      if (!known.has(key)) out.push({ date: key, time: d.getTime(), events: [] });
    }
    out.sort((a, b) => b.time - a.time);
    return out.slice(0, 30);
  }, [activities, treatmentLogs, harvestLogs, stageLogs, observationLogs, observationEntries, trackings, trackingEntries, ledgerEntries, search]);

  const statusFor = (dateStr: string): string[] => {
    const day = parseDate(dateStr) ?? today();
    const lines: string[] = [];
    for (const c of activeCrops.slice(0, 6)) {
      const line = cropStatusLine(c as never, stageLogs as never, day);
      if (line) lines.push(line);
    }
    for (const t of (trackings as never[] as { cropName: string; label: string; tagNumber?: string; startDate: string; status: string }[]).slice(0, 4)) {
      const line = trackingStatusLine(t, day);
      if (line) lines.push(line);
    }
    return lines;
  };

  const toggle = (date: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const prettyDate = (dateStr: string) => {
    const d = parseDate(dateStr);
    if (!d) return dateStr;
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-white z-10 border-b p-4 space-y-3">
        <h1 className="text-lg font-bold flex items-center gap-2"><BookOpen className="w-5 h-5 text-amber-600" /> Farm Diary</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search the journal..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {days.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No journal pages yet</p>
            <p className="text-xs mt-1">Log crops and activities and the diary writes itself</p>
          </div>
        )}
        {days.map((g, i) => {
          const open = expanded.has(g.date);
          const paras = storyForDay(g.date, g.events, statusFor(g.date), i);
          return (
            <article key={g.date} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <button onClick={() => toggle(g.date)} className="w-full text-left p-4 hover:bg-gray-50">
                <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700">{prettyDate(g.date)}</p>
                <p className="text-sm text-gray-800 mt-1 leading-relaxed">{paras[0]}</p>
                <p className="text-[11px] text-gray-400 mt-1">{g.events.length === 0 ? 'Quiet day' : `${g.events.length} event${g.events.length === 1 ? '' : 's'}`} · tap to {open ? 'fold' : 'read'}</p>
              </button>
              {open && (
                <div className="px-4 pb-4 space-y-2 border-t border-gray-50 pt-3">
                  {paras.slice(1).map((p, j) => (
                    <p key={j} className="text-sm text-gray-700 leading-relaxed">{p}</p>
                  ))}
                  {g.events.length > 0 && (
                    <details className="pt-1">
                      <summary className="text-[11px] font-semibold text-gray-400 cursor-pointer">Source events ({g.events.length})</summary>
                      <div className="mt-1 space-y-1">
                        {g.events.map(e => (
                          <p key={e.id} className="text-[11px] text-gray-500">· [{e.kind}] {e.title}{e.cropName ? ` — ${e.cropName}` : ''}</p>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
