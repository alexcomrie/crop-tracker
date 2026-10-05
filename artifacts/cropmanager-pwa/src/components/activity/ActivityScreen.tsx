import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, Clock, Trash2 } from 'lucide-react';
import { generateId, shortCropId } from '../../lib/ids';
import { formatDateShort, today, addDays, parseDate } from '../../lib/dates';
import { addDiaryEntry } from '../../lib/diary';
import { buildFarmEvents, groupEventsByDate, type FarmEventKind } from '../../lib/farmEvents';
import { toast } from 'sonner';

const KIND_FILTERS: { id: 'all' | FarmEventKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'activity', label: 'Logged' },
  { id: 'treatment', label: 'Sprays' },
  { id: 'harvest', label: 'Harvests' },
  { id: 'stage', label: 'Stages' },
  { id: 'observation', label: 'Notes' },
  { id: 'tracking', label: 'Tracking' },
  { id: 'finance', label: 'Finance' },
];

const KIND_STYLE: Record<FarmEventKind, { icon: string; chip: string }> = {
  activity: { icon: '📋', chip: 'bg-gray-100 text-gray-700' },
  treatment: { icon: '💧', chip: 'bg-cyan-50 text-cyan-700' },
  harvest: { icon: '🥬', chip: 'bg-amber-50 text-amber-700' },
  stage: { icon: '🌱', chip: 'bg-green-50 text-green-700' },
  observation: { icon: '👁️', chip: 'bg-teal-50 text-teal-700' },
  tracking: { icon: '🍅', chip: 'bg-orange-50 text-orange-700' },
  finance: { icon: '💰', chip: 'bg-emerald-50 text-emerald-700' },
  reminder: { icon: '🔔', chip: 'bg-purple-50 text-purple-700' },
};

const ACTIVITY_TYPES = [
  { id: 'watering', label: 'Watering', icon: '💧' },
  { id: 'fertilizer', label: 'Apply Fertilizer', icon: '🧪' },
  { id: 'pesticide', label: 'Apply Pesticide', icon: '🐛' },
  { id: 'fungicide', label: 'Apply Fungicide', icon: '🍄' },
  { id: 'herbicide', label: 'Apply Herbicide', icon: '🌿' },
  { id: 'pruning', label: 'Pruning', icon: '✂️' },
  { id: 'harvest', label: 'Harvest', icon: '🥬' },
  { id: 'inspection', label: 'Inspection', icon: '🔍' },
  { id: 'transplant', label: 'Transplant', icon: '🪴' },
  { id: 'other', label: 'Other', icon: '📝' },
];

const REMINDER_OPTIONS = [
  { value: 5, label: '5 days' },
  { value: 7, label: '1 week' },
  { value: 10, label: '10 days' },
  { value: 14, label: '2 weeks' },
  { value: 21, label: '3 weeks' },
  { value: 28, label: '4 weeks' },
];

interface Activity {
  id: string;
  date: string;
  type: string;
  product: string;
  notes: string;
  reminderDays: number | null;
  reminderDate: string | null;
  cropIds: string[];
  updatedAt: number;
}

export function ActivityScreen({ onClose }: { onClose: () => void }) {
  const activitiesData = useLiveQuery(() => db.activities.toArray().catch(() => []));
  const treatmentLogs = useLiveQuery(() => db.treatmentLogs.toArray().catch(() => [])) ?? [];
  const harvestLogs = useLiveQuery(() => db.harvestLogs.toArray().catch(() => [])) ?? [];
  const stageLogs = useLiveQuery(() => db.stageLogs.toArray().catch(() => [])) ?? [];
  const observationLogs = useLiveQuery(() => db.observationLogs.toArray().catch(() => [])) ?? [];
  const observationEntries = useLiveQuery(() => db.observationEntries.toArray().catch(() => [])) ?? [];
  const trackings = useLiveQuery(() => db.trackings.toArray().catch(() => [])) ?? [];
  const trackingEntries = useLiveQuery(() => db.trackingEntries.toArray().catch(() => [])) ?? [];
  const ledgerEntries = useLiveQuery(() => db.ledgerEntries.toArray().catch(() => [])) ?? [];
  const activities = useMemo(() => [...(activitiesData ?? [])].sort(
    (a, b) => (parseDate(b.date)?.getTime() || 0) - (parseDate(a.date)?.getTime() || 0)), [activitiesData]);
  const isLoadingActivities = activitiesData === undefined;

  const crops = useLiveQuery(() =>
    db.crops.where('status').equals('Active').toArray()
  ) ?? [];
  const allCrops = useLiveQuery(() => db.crops.toArray().catch(() => [])) ?? [];
  const cropById = useMemo(() => new Map(allCrops.map(c => [c.id, c])), [allCrops]);

  // Unified feed: everything the farm did, not just manual activity rows.
  const [kindFilter, setKindFilter] = useState<'all' | FarmEventKind>('all');
  const feedGroups = useMemo(() => {
    const events = buildFarmEvents({
      activities, treatmentLogs, harvestLogs, stageLogs,
      observationLogs, observationEntries, trackings, trackingEntries, ledgerEntries,
    }).filter(e => kindFilter === 'all' || e.kind === kindFilter);
    return groupEventsByDate(events).slice(0, 60);
  }, [activities, treatmentLogs, harvestLogs, stageLogs, observationLogs, observationEntries, trackings, trackingEntries, ledgerEntries, kindFilter]);

  const [view, setView] = useState<'list' | 'form'>('list');
  const [form, setForm] = useState({
    date: formatDateShort(today()),
    types: [] as string[],
    product: '',
    notes: '',
    reminderDays: null as number | null,
    cropIds: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (form.types.length===0) { toast.error('Select at least one type'); return; }
    setSaving(true);
    try {
      const reminderDate = form.reminderDays
        ? formatDateShort(addDays(today(), form.reminderDays))
        : null;

      const activity: Activity = {
        id: generateId('ACT'),
        date: form.date || formatDateShort(today()),
        type: form.types.join(','),
        product: form.product,
        notes: form.notes,
        reminderDays: form.reminderDays,
        reminderDate,
        cropIds: form.cropIds,
        updatedAt: Date.now(),
      };

      await db.activities.add(activity);
      const typeLabels = form.types.map(t => ACTIVITY_TYPES.find(at => at.id === t)?.label || t).join(', ');
      await addDiaryEntry({
        entryType: 'activity_log',
        cropId: 'activity',
        cropName: typeLabels,
        description: `Activity: ${typeLabels}${form.product ? ` — ${form.product}` : ''}`,
        details: form.notes || '',
        date: form.date || formatDateShort(today()),
      });

      // Update crops with fertilizer tracking if applicable (single bulk op)
      if (form.types.includes('fertilizer') && form.cropIds.length > 0 && form.reminderDays) {
        const nextDate = addDays(today(), form.reminderDays);
        await db.crops.where('id').anyOf(form.cropIds).modify({
          fertilizerType: form.product || 'Activity Log',
          fertilizerDays: form.reminderDays,
          nextFertilizerDate: formatDateShort(nextDate),
          updatedAt: Date.now(),
        });
      }

      setView('list');
      setForm({
        date: formatDateShort(today()),
        types: [],
        product: '',
        notes: '',
        reminderDays: null,
        cropIds: [],
      });
      toast.success('Activity saved');
    } catch (e) {
      console.error('[activity] save failed', { e });
      toast.error('Could not save activity: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (window.confirm('Delete this activity?')) {
      try {
        await db.activities.delete(id);
      } catch (e) {
        console.error('[activity] delete failed', { id, e });
        toast.error('Delete failed: ' + (e instanceof Error ? e.message : String(e)));
      }
    }
  }

  const formatActivityDate = (val: string) => {
    if (!val) return '';
    const d = parseDate(val);
    if (!d) return val;
    return formatDateShort(d);
  };

  return (
    <div className="absolute inset-0 bg-[#f5f5f0] flex flex-col z-[60] animate-in slide-in-from-right duration-300 overflow-y-auto">
      <div className="bg-white border-b border-gray-200 h-14 flex items-center gap-3 px-4">
        <button onClick={onClose} className="w-8 h-8 rounded-lg border bg-[#f9f9f6] text-gray-600 flex items-center justify-center">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="font-semibold text-[16px] flex-1">📋 Activity Log</h2>
        <Button className="h-8" onClick={() => setView('form')} title="+ New">+ New</Button>
      </div>

      {view === 'form' && (
        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          <div className="bg-white border border-[#e0e0e0] rounded-[12px] p-4 space-y-4">
            <h3 className="font-semibold text-[14px]">New Activity</h3>
            
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Date</label>
                <Input 
                  type="date" 
                  value={form.date} 
                  onChange={e => setForm({...form, date: e.target.value || formatDateShort(today())})}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Activity Types (tap all that apply)</label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {ACTIVITY_TYPES.map(t => {
                    const active = form.types.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => setForm({...form, types: active ? form.types.filter(x => x !== t.id) : [...form.types, t.id]})}
                        className={`py-2 px-1 rounded-lg text-[11px] font-medium border ${active ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-200'}`}
                      >
                        {t.icon} {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Product / Details</label>
                <Input 
                  placeholder="e.g. Nitro Plus, Copper fungicide..." 
                  value={form.product}
                  onChange={e => setForm({...form, product: e.target.value})}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Notes</label>
                <Input 
                  placeholder="Optional notes..." 
                  value={form.notes}
                  onChange={e => setForm({...form, notes: e.target.value})}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Set Reminder</label>
                <select 
                  className="w-full mt-1 border rounded-lg p-2 text-sm bg-white"
                  value={form.reminderDays ?? ''}
                  onChange={e => setForm({...form, reminderDays: e.target.value ? parseInt(e.target.value) : null})}
                >
                  <option value="">No reminder</option>
                  {REMINDER_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              {crops.length > 0 && (
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">Tag Crops (optional)</label>
                  <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                    {crops.map(c => (
                      <label key={c.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50">
                        <input 
                          type="checkbox"
                          checked={form.cropIds.includes(c.id)}
                          onChange={e => {
                            if (e.target.checked) {
                              setForm({...form, cropIds: [...form.cropIds, c.id]});
                            } else {
                              setForm({...form, cropIds: form.cropIds.filter(id => id !== c.id)});
                            }
                          }}
                          className="w-4 h-4 accent-green-600"
                        />
                        <span className="text-sm">{c.cropName}</span>
                        {c.variety && <span className="text-xs text-gray-400">{c.variety}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : '💾 Save Activity'}
              </Button>
              <Button variant="outline" onClick={() => setView('list')}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {view === 'list' && (
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-[11px] text-muted-foreground mb-2">Every logged farm event — manual activities plus sprays, harvests, stage changes, notes, tracking and ledger, newest first.</p>
          <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
            {KIND_FILTERS.map(k => (
              <button key={k.id} onClick={() => setKindFilter(k.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs border font-semibold ${kindFilter === k.id ? 'bg-green-700 text-white border-green-700' : 'bg-white border-gray-300 text-gray-700'}`}>
                {k.label}
              </button>
            ))}
          </div>
          {isLoadingActivities ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : feedGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <div className="text-4xl mb-2">📋</div>
              <div className="text-sm font-medium">Nothing here yet.</div>
              <div className="text-xs mt-1">Tap + New to record your first activity.</div>
            </div>
          ) : (
            <div className="space-y-4">
              {feedGroups.map(g => (
                <div key={g.date}>
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">{g.date} · {g.events.length}</p>
                  <div className="space-y-2">
                    {g.events.map(e => {
                      const st = KIND_STYLE[e.kind];
                      const cropsForEvent = (e.cropIds ?? []).map(cid => cropById.get(cid)).filter(Boolean);
                      return (
                        <div key={e.id} className="bg-white border border-[#e0e0e0] rounded-[12px] p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-base shrink-0">{st.icon}</span>
                              <div className="min-w-0">
                                <p className="font-semibold text-[13px] truncate">{e.title}</p>
                                <p className="text-[11px] text-gray-500 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />{formatActivityDate(e.date)}
                                  <span className={`ml-1 px-1.5 py-0.5 rounded-full font-bold ${st.chip}`}>{e.kind}</span>
                                </p>
                              </div>
                            </div>
                            {e.source.table === 'activities' && (
                              <button onClick={() => handleDelete(e.source.refId)} className="text-gray-400 hover:text-red-500 shrink-0">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          {e.subtitle && <p className="text-xs text-gray-600 mt-1 whitespace-pre-line">{e.subtitle}</p>}
                          {(cropsForEvent.length > 0 || e.cropName) && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {cropsForEvent.map(c => (
                                <span key={c!.id} className="text-[10px] px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-semibold">
                                  {shortCropId(c!.id)} · {c!.cropName}
                                </span>
                              ))}
                              {cropsForEvent.length === 0 && e.cropName && (
                                <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{e.cropName}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}