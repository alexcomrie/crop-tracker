import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, CheckCircle2, Clock, Trash2, Plus } from 'lucide-react';
import { markReminderDone } from '../hooks/useReminders';
import { EmptyState } from '../components/shared/EmptyState';
import { toast } from 'sonner';
import { parseDate } from '../lib/dates';
import { shortCropId } from '../lib/ids';
import { cropDetailsPath } from '../lib/routes';
import { ReminderForm } from '../components/reminders/ReminderForm';

export function RemindersScreen() {
  const remindersData = useLiveQuery(async () => {
    const all = await db.reminders.toArray();
    return all.sort((a, b) => {
      // Stored dates are dd-MMM-yyyy: parse chronologically, never `new Date(str)`
      const ta = a.sendDate ? parseDate(a.sendDate)?.getTime() ?? 0 : 0;
      const tb = b.sendDate ? parseDate(b.sendDate)?.getTime() ?? 0 : 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return tb - ta;
    });
  });
  const reminders = remindersData ?? [];
  const isLoading = remindersData === undefined;
  const crops = useLiveQuery(() => db.crops.toArray().catch(() => []), []) ?? [];
  const cropById = useMemo(() => new Map(crops.map(c => [c.id, c])), [crops]);
  const navigate = useNavigate();

  const [showForm, setShowForm] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<'all' | 'crop' | 'field'>('all');
  const visible = useMemo(() => reminders.filter(r => {
    const isCrop = !!r.trackingId && r.trackingId !== 'MANUAL' && cropById.has(r.trackingId);
    if (scopeFilter === 'crop') return isCrop;
    if (scopeFilter === 'field') return !isCrop;
    return true;
  }), [reminders, scopeFilter, cropById]);

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this reminder?')) {
      try {
        await db.reminders.delete(id);
      } catch (e) {
        console.error('[reminders] delete failed', { id, e });
        toast.error('Delete failed: ' + (e instanceof Error ? e.message : String(e)));
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24 pt-2">
      {/* Header actions (title lives in TopBar) */}
      <div className="bg-white border-b border-gray-100 p-4 sticky top-0 z-10 flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={showForm ? 'Close reminder form' : 'New reminder'}
          onClick={() => setShowForm(!showForm)}
          className={`h-9 w-9 rounded-lg border border-gray-100 shadow-sm transition-transform ${showForm ? 'rotate-45 text-red-500 bg-red-50' : 'text-purple-600 bg-purple-50'}`}
        >
          <Plus className="w-5 h-5" />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {showForm && (
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-gray-900">New Reminder</h3>
            <ReminderForm crops={crops} onDone={() => setShowForm(false)} />
            <Button variant="ghost" className="w-full h-9 text-gray-400" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        )}

        <div className="flex gap-1">
          {(['all', 'crop', 'field'] as const).map(f => (
            <button key={f} onClick={() => setScopeFilter(f)}
              className={`flex-1 py-1.5 rounded-full text-xs font-bold border ${scopeFilter === f ? 'bg-purple-600 text-white border-purple-600' : 'bg-white border-gray-200 text-gray-600'}`}>
              {f === 'all' ? `All (${reminders.length})` : f === 'crop' ? 'Tracked crops' : 'Field notes'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <EmptyState icon={<Bell className="w-12 h-12" />} title="No reminders found" />
          ) : (
            visible.map(r => {
              const linked = r.trackingId && r.trackingId !== 'MANUAL' ? cropById.get(r.trackingId) : undefined;
              return (
              <div
                key={r.id}
                className={`bg-white border border-gray-100 rounded-xl p-4 shadow-sm transition-opacity ${r.sent ? 'opacity-50' : 'opacity-100'}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[10px] uppercase border-none ${r.sent ? 'bg-gray-100 text-gray-500' : 'bg-purple-50 text-purple-700'}`}>
                      {r.type.replace(/_/g, ' ')}
                    </Badge>
                    <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {r.sendDate}
                    </span>
                  </div>
                  {!r.sent && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-300 hover:text-red-500" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <h3 className="font-bold text-sm text-gray-900 mb-1">{r.subject}: {r.cropPlantName}</h3>
                {linked ? (
                  <button onClick={() => navigate(cropDetailsPath(linked.id))}
                    className="mb-2 inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full pl-1.5 pr-2.5 py-0.5 text-left">
                    <span className="text-[10px] font-bold bg-green-700 text-white rounded-full px-1.5 py-0.5">{shortCropId(linked.id)}</span>
                    <span className="text-xs font-semibold text-green-800">{linked.cropName} · {linked.plantStage}</span>
                  </button>
                ) : (
                  <p className="text-[10px] text-muted-foreground mb-2">🌱 Field reminder (no tracker crop)</p>
                )}
                <p className="text-xs text-gray-500 leading-relaxed mb-4">{r.body}</p>

                {!r.sent ? (
                  <Button
                    className="w-full bg-purple-600 hover:bg-purple-700 h-9 rounded-lg text-xs font-bold gap-2"
                    onClick={() => markReminderDone(r.id)}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Mark as Completed
                  </Button>
                ) : (
                  <div className="flex items-center justify-center gap-1.5 py-1 text-xs font-bold text-green-600 bg-green-50 rounded-lg">
                    <CheckCircle2 className="w-4 h-4" />
                    Task Finished
                  </div>
                )}
              </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
