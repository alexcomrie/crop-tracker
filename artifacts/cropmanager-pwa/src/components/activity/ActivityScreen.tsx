import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, Plus, X, Check, Clock, Trash2 } from 'lucide-react';
import { generateId } from '../../lib/ids';
import { formatDateShort, today } from '../../lib/dates';
import { addDiaryEntry } from '../../lib/diary';
import type { Crop } from '../../types';

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
  const activitiesData = useLiveQuery(() => 
    db.activities.orderBy('date').reverse().toArray()
  );
  const activities = activitiesData ?? [];
  const isLoadingActivities = activitiesData === undefined;

  const crops = useLiveQuery(() => 
    db.crops.where('status').equals('Active').toArray()
  ) ?? [];

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
    setSaving(true);
    const reminderDate = form.reminderDays 
      ? formatDateShort(new Date(today().getTime() + form.reminderDays * 86400000))
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

    // Update crops with fertilizer tracking if applicable
    if (form.types.includes('fertilizer') && form.cropIds.length > 0 && form.reminderDays) {
      const nextDate = new Date(today().getTime() + form.reminderDays * 86400000);
      for (const cropId of form.cropIds) {
        await db.crops.update(cropId, {
          fertilizerType: form.product || 'Activity Log',
          fertilizerDays: form.reminderDays,
          nextFertilizerDate: formatDateShort(nextDate),
          updatedAt: Date.now(),
        });
      }
    }
    
    setSaving(false);
    setView('list');
    setForm({
      date: formatDateShort(today()),
      types: [],
      product: '',
      notes: '',
      reminderDays: null,
      cropIds: [],
    });
  }

  async function handleDelete(id: string) {
    if (window.confirm('Delete this activity?')) {
      await db.activities.delete(id);
    }
  }

  const formatActivityDate = (iso: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d} ${months[m-1]} ${y}`;
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
          {isLoadingActivities ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <div className="text-4xl mb-2">📋</div>
              <div className="text-sm font-medium">No activities logged yet.</div>
              <div className="text-xs mt-1">Tap + New to record your first activity.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map(a => {
                const typeIds = a.type.split(',').filter(Boolean);
                const actTypes = typeIds.map(id => ACTIVITY_TYPES.find(t => t.id === id)).filter(Boolean);
                return (
                  <div key={a.id} className="bg-white border border-[#e0e0e0] rounded-[12px] p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{actTypes[0]?.icon || '📝'}</span>
                        <div>
                          <div className="font-semibold text-[14px]">
                            {actTypes.map(t => t?.label).filter(Boolean).join(', ') || a.type}
                          </div>
                          <div className="text-[11px] text-gray-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatActivityDate(a.date)}
                            {a.reminderDate && <span className="ml-2 text-blue-600">→ Reminder: {formatActivityDate(a.reminderDate)}</span>}
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDelete(a.id)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {a.product && <div className="text-sm text-gray-600 mt-1">Product: {a.product}</div>}
                    {a.notes && <div className="text-sm text-gray-500 mt-1">{a.notes}</div>}
                    {a.cropIds.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {a.cropIds.map(cid => {
                          const crop = crops.find(c => c.id === cid);
                          return crop ? (
                            <span key={cid} className="text-[10px] px-2 py-0.5 bg-green-50 text-green-700 rounded-full">
                              {crop.cropName}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}