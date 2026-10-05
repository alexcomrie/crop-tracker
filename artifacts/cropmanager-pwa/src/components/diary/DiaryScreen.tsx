import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, BookOpen, CalendarDays } from 'lucide-react';
import db from '../../db/db';
import { parseDate, formatDateShort, today } from '../../lib/dates';
import { buildFarmEvents, groupEventsByDate } from '../../lib/farmEvents';
import {
  diaryDate, directLine, plantingLine, cropStatusLine, trackingStatusLine,
  type CropRef,
} from '../../lib/dailyStory';
import type { FarmEvent } from '../../lib/farmEvents';

const SECTIONS: { kinds: FarmEvent['kind'][]; title: string; icon: string }[] = [
  { kinds: ['treatment'], title: 'Sprays', icon: '🧪' },
  { kinds: ['harvest'], title: 'Harvests', icon: '🥬' },
  { kinds: ['stage'], title: 'Stage moves', icon: '🔄' },
  { kinds: ['activity'], title: 'Field work', icon: '📋' },
  { kinds: ['observation'], title: 'Notes', icon: '👁️' },
  { kinds: ['tracking'], title: 'Tracking', icon: '🍅' },
  { kinds: ['finance'], title: 'Books', icon: '💰' },
  { kinds: ['reminder'], title: 'Due', icon: '🔔' },
];

/**
 * Straight-to-point daily farm log. One page per date (dd/mm/yyyy), one
 * direct line per event: what was planted (crop, variety, method, crop id),
 * what was sprayed / harvested / moved / noted — plus quiet-day status
 * lines (days in stage, days since tracked).
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
  const cropById = useMemo(
    () => new Map((crops as CropRef[]).map(c => [c.id, c])),
    [crops],
  );

  const days = useMemo(() => {
    const q = search.trim().toLowerCase();
    const events = buildFarmEvents({
      activities, treatmentLogs, harvestLogs, stageLogs,
      observationLogs, observationEntries, trackings, trackingEntries, ledgerEntries,
    }).filter(e =>
      !q || e.title.toLowerCase().includes(q) || e.subtitle.toLowerCase().includes(q) || e.cropName.toLowerCase().includes(q)
    );
    const groups = groupEventsByDate(events);
    // Quiet days still get a page while crops are in the ground (last 14 days).
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

  const plantedOn = (dateStr: string): CropRef[] =>
    (crops as CropRef[]).filter(c => c.plantingDate === dateStr);

  const statusFor = (dateStr: string): string[] => {
    const day = parseDate(dateStr) ?? today();
    const lines: string[] = [];
    for (const c of activeCrops.slice(0, 6)) {
      const line = cropStatusLine(c as CropRef, stageLogs as never, day);
      if (line) lines.push(line);
    }
    for (const t of (trackings as never[] as { cropName: string; label: string; tagNumber?: string; startDate: string; status: string; cropId?: string }[]).slice(0, 4)) {
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

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-white z-10 border-b p-4 space-y-3">
        <h1 className="text-lg font-bold flex items-center gap-2"><BookOpen className="w-5 h-5 text-amber-600" /> Farm Diary</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search the diary..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {days.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No diary pages yet</p>
            <p className="text-xs mt-1">Plant crops and log work — the diary writes itself</p>
          </div>
        )}
        {days.map(g => {
          const open = expanded.has(g.date);
          const planted = plantedOn(g.date);
          const status = statusFor(g.date);
          const preview = planted[0]
            ? plantingLine(planted[0])
            : g.events[0]
              ? directLine(g.events[0], cropById)
              : status[0] ?? 'No activity logged.';
          return (
            <article key={g.date} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <button onClick={() => toggle(g.date)} className="w-full text-left p-4 hover:bg-gray-50">
                <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700">date: {diaryDate(g.date)}</p>
                <p className="text-sm text-gray-800 mt-1 leading-relaxed">{preview}</p>
                <p className="text-[11px] text-gray-400 mt-1">
                  {planted.length + g.events.length === 0 ? 'Quiet day' : `${planted.length + g.events.length} entr${planted.length + g.events.length === 1 ? 'y' : 'ies'}`} · tap to {open ? 'fold' : 'read'}
                </p>
              </button>
              {open && (
                <div className="px-4 pb-4 pt-3 border-t border-gray-100 space-y-4">
                  {planted.length > 0 && (
                    <section>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-green-700 mb-1.5">🌱 Planted ({planted.length})</p>
                      <div className="rounded-lg border border-green-100 divide-y divide-green-50 overflow-hidden">
                        {planted.map(c => (
                          <p key={c.id} className="text-sm text-gray-800 leading-relaxed px-3 py-2 bg-green-50/40">{plantingLine(c)}</p>
                        ))}
                      </div>
                    </section>
                  )}
                  {SECTIONS.map(sec => {
                    const rows = g.events.filter(e => sec.kinds.includes(e.kind));
                    if (rows.length === 0) return null;
                    return (
                      <section key={sec.title}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">{sec.icon} {sec.title} ({rows.length})</p>
                        <div className="rounded-lg border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                          {rows.map(e => (
                            <p key={e.id} className="text-sm text-gray-700 leading-relaxed px-3 py-2">{directLine(e, cropById)}</p>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                  {planted.length + g.events.length === 0 && (
                    <section>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">🌿 Around the field</p>
                      <div className="rounded-lg border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                        {status.length === 0 && (
                          <p className="text-sm text-gray-400 px-3 py-2">Quiet day — nothing in the ground yet.</p>
                        )}
                        {status.map((s, j) => (
                          <p key={j} className="text-sm text-gray-600 leading-relaxed px-3 py-2">{s}</p>
                        ))}
                      </div>
                    </section>
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
