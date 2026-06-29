import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Sprout, ArrowRight, BugPlay, Beaker, Leaf, FlaskConical, CalendarDays, ClipboardList, DollarSign } from 'lucide-react';
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

  const allEntries = useLiveQuery(
    () => db.diaryEntries.orderBy('updatedAt').reverse().toArray(),
    []
  ) ?? [];

  const filtered = allEntries.filter(e => {
    if (filterType !== 'all' && e.entryType !== filterType) return false;
    if (search && !e.cropName.toLowerCase().includes(search.toLowerCase()) && !e.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

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
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No diary entries yet</p>
            <p className="text-xs mt-1">Diary entries are auto-created as you manage crops</p>
          </div>
        )}
        {filtered.map(e => (
          <div key={e.id} className="bg-white rounded-xl border p-3 flex gap-3">
            <div className="mt-0.5 shrink-0">{ENTRY_ICONS[e.entryType]}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold">{e.cropName}</span>
                {e.variety && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{e.variety}</span>}
                <span className="text-[10px] text-gray-400">{e.date}</span>
              </div>
              <p className="text-sm text-gray-700 mt-0.5">{e.description}</p>
              {e.details && <p className="text-xs text-gray-400 mt-0.5">{e.details}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
