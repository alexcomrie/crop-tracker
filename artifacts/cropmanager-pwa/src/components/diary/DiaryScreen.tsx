import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Sprout, ArrowRight, BugPlay, Beaker, Leaf, FlaskConical, CalendarDays, ClipboardList, DollarSign, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import db from '../../db/db';
import type { DiaryEntry, DiaryEntryType } from '../../types';

const ENTRY_ICONS: Record<DiaryEntryType, React.ReactNode> = {
  crop_created: <Sprout className="w-4 h-4 text-green-600" />,
  stage_change: <ArrowRight className="w-4 h-4 text-blue-500" />,
  treatment: <BugPlay className="w-4 h-4 text-orange-500" />,
  harvest: <Beaker className="w-4 h-4 text-purple-500" />,
  note: <Leaf className="w-4 h-4 text-gray-500" />,
  propagation_created: <FlaskConical className="w-4 h-4 text-teal-600" />,
  propagation_stage: <ArrowRight className="w-4 h-4 text-teal-500" />,
  activity_log: <ClipboardList className="w-4 h-4 text-orange-500" />,
  ledger: <DollarSign className="w-4 h-4 text-emerald-500" />,
  pos_sale: <DollarSign className="w-4 h-4 text-indigo-500" />,
};

export default function DiaryScreen() {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<DiaryEntryType | 'all'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const allEntries = useLiveQuery(
    () => db.diaryEntries.orderBy('updatedAt').toArray(),
    []
  ) ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, { cropName: string; cropId: string; entries: DiaryEntry[] }>();

    for (const e of allEntries) {
      if (filterType !== 'all' && e.entryType !== filterType) continue;
      if (search && !e.cropName.toLowerCase().includes(search.toLowerCase())) continue;

      const key = e.cropId || 'unknown';
      if (!map.has(key)) {
        map.set(key, { cropName: e.cropName || 'Unknown', cropId: e.cropId, entries: [] });
      }
      map.get(key)!.entries.push(e);
    }

    for (const group of map.values()) {
      group.entries.sort((a, b) => a.date.localeCompare(b.date));
    }

    return Array.from(map.values()).sort((a, b) => {
      const aLast = a.entries[a.entries.length - 1]?.date || '';
      const bLast = b.entries[b.entries.length - 1]?.date || '';
      return bLast.localeCompare(aLast);
    });
  }, [allEntries, filterType, search]);

  const toggleExpand = (cropId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(cropId)) next.delete(cropId);
      else next.add(cropId);
      return next;
    });
  };

  async function handleDeleteEntry(id: string) {
    await db.diaryEntries.delete(id);
  }

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-white z-10 border-b p-4 space-y-3">
        <h1 className="text-lg font-bold">Diary</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" placeholder="Search crops..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {(['all', 'crop_created', 'stage_change', 'treatment', 'harvest', 'propagation_created', 'propagation_stage', 'activity_log', 'ledger', 'pos_sale'] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${filterType === t ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {t === 'all' ? 'All' : t.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {grouped.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No diary entries yet</p>
            <p className="text-xs mt-1">Diary entries are auto-created as you manage crops</p>
          </div>
        )}
        {grouped.map(group => {
          const isExpanded = expanded.has(group.cropId);
          return (
            <div key={group.cropId} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <button
                onClick={() => toggleExpand(group.cropId)}
                className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-bold text-gray-800 truncate">
                    {group.cropName}
                    {group.cropId && <span className="text-[10px] text-gray-400 font-mono ml-1">(id #{group.cropId})</span>}
                  </span>
                  <span className="shrink-0 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-semibold">
                    {group.entries.length}
                  </span>
                </div>
                {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
              </button>
              {isExpanded && (
                <div className="border-t border-gray-50">
                  {group.entries.map(e => (
                    <div key={e.id} className="flex items-start gap-2 px-3 py-2 border-b border-gray-50 last:border-b-0 group">
                      <span className="shrink-0 mt-0.5">{ENTRY_ICONS[e.entryType]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-400 font-medium">{formatDate(e.date)}</span>
                          <span className="text-[10px] text-gray-300 uppercase">{e.entryType.replace(/_/g, ' ')}</span>
                        </div>
                        <p className="text-sm text-gray-800">{e.description}</p>
                        {e.details && <p className="text-xs text-gray-400 mt-0.5">{e.details}</p>}
                      </div>
                      <button
                        onClick={() => handleDeleteEntry(e.id)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-300 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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
