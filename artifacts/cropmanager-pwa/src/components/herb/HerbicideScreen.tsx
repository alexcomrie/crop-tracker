import React, { useMemo, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';

type Outcome = 'effective' | 'partial' | 'retreated' | 'no-effect';

interface HerbEntry {
  id: string;
  product: string;
  ingredient: string;
  mode: string;
  rate: number | null;
  volume: number | null;
  area: string;
  target: string;
  dateApplied: string;
  timeApplied: string;
  weather: string;
  reentry: number | null;
  daysExpected: number;
  reminderDays: number;
  notes: string;
  outcome: Outcome | null;
  outcomeDate: string | null;
  outcomeNotes: string;
}

const HERB_SEED: HerbEntry[] = [
  {
    id: 'h1',
    product: 'Gramoxone (Paraquat)',
    ingredient: 'Paraquat dichloride',
    mode: 'Contact (burns on contact)',
    rate: 15, volume: 10,
    area: 'Back field walkways',
    target: 'Nut grass, general broadleaf',
    dateApplied: '2026-03-05', timeApplied: '07:30',
    weather: 'Sunny, dry',
    reentry: 24, daysExpected: 3, reminderDays: 7,
    notes: 'Applied along fence line and between beds. Strong knockdown.',
    outcome: 'effective', outcomeDate: '2026-03-10',
    outcomeNotes: 'Nut grass browned off within 3 days. 90% kill rate.'
  },
  {
    id: 'h2',
    product: 'Roundup (Glyphosate 360)',
    ingredient: 'Glyphosate',
    mode: 'Systemic (absorbed, translocated)',
    rate: 20, volume: 5,
    area: 'Pepper bed perimeter',
    target: 'Nut grass, Guinea grass',
    dateApplied: '2026-03-01', timeApplied: '08:00',
    weather: 'Partly cloudy',
    reentry: 48, daysExpected: 14, reminderDays: 14,
    notes: 'Careful around pepper roots. Targeted spray only.',
    outcome: null, outcomeDate: null, outcomeNotes: ''
  }
];

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dt = new Date(y, m - 1, d);
  return `${names[dt.getDay()]} ${d} ${months[m - 1]} ${y}`;
}

function daysSince(iso: string): number {
  if (!iso) return 0;
  const applied = new Date(iso);
  const t = new Date();
  return Math.floor((t.getTime() - applied.getTime()) / 86400000);
}

function statusOf(h: HerbEntry): 'active' | 'check' | 'done' | 'unknown' {
  if (!h.dateApplied) return 'unknown';
  if (h.outcome) return 'done';
  const ds = daysSince(h.dateApplied);
  if (ds >= h.daysExpected) return 'check';
  return 'active';
}

export function HerbicideScreen({ onClose }: { onClose: () => void }) {
  const treatmentLogs = useLiveQuery(() => db.treatmentLogs.where('type').equals('herbicide').toArray(), []) ?? [];
  const herbLog: HerbEntry[] = useMemo(() => {
    if (!treatmentLogs || treatmentLogs.length === 0) return HERB_SEED;
    return treatmentLogs.map(t => {
      let meta: Partial<HerbEntry> = {};
      if (t.notes && t.notes.startsWith('HERBJSON:')) {
        try { meta = JSON.parse(t.notes.slice(9)); } catch {}
      }
      return {
        id: t.id,
        product: t.product,
        ingredient: (meta.ingredient as any) || '',
        mode: (meta.mode as any) || '',
        rate: (meta.rate as any) ?? null,
        volume: (meta.volume as any) ?? null,
        area: t.cropName,
        target: (meta.target as any) || '',
        dateApplied: t.date,
        timeApplied: (meta.timeApplied as any) || '',
        weather: (meta.weather as any) || '',
        reentry: (meta.reentry as any) ?? null,
        daysExpected: (meta.daysExpected as any) ?? 7,
        reminderDays: (meta.reminderDays as any) ?? 10,
        notes: (meta.notes as any) || '',
        outcome: (meta.outcome as any) ?? null,
        outcomeDate: (meta.outcomeDate as any) ?? null,
        outcomeNotes: (meta.outcomeNotes as any) || '',
      };
    });
  }, [treatmentLogs]);
  const [filterMode, setFilterMode] = useState<'all'|'active'|'done'>('all');
  const [view, setView] = useState<'list'|'form'|'detail'>('list');
  const [editingId, setEditingId] = useState<string|null>(null);
  const [viewingId, setViewingId] = useState<string|null>(null);
  const herbIdCounter = useRef(10);

  const list = useMemo(() => {
    let items = [...herbLog];
    if (filterMode === 'active') items = items.filter(h => statusOf(h) !== 'done');
    if (filterMode === 'done') items = items.filter(h => statusOf(h) === 'done');
    items.sort((a, b) => (b.dateApplied || '').localeCompare(a.dateApplied || ''));
    return items;
  }, [herbLog, filterMode]);

  const viewing = herbLog.find(h => h.id === viewingId) || null;
  const editing = herbLog.find(h => h.id === editingId) || null;

  const [form, setForm] = useState({
    product: '', ingredient: '', mode: '',
    rate: '', volume: '',
    area: '', target: '',
    dateApplied: todayISO(), timeApplied: '',
    weather: '', reentry: '',
    daysExpected: '7', reminderDays: '10',
    notes: ''
  });
  const [outcomeNotesDraft, setOutcomeNotesDraft] = useState('');

  function openHerbForm(editId?: string) {
    if (editId) {
      const h = herbLog.find(x => x.id === editId);
      if (h) {
        setForm({
          product: h.product,
          ingredient: h.ingredient,
          mode: h.mode,
          rate: h.rate?.toString() || '',
          volume: h.volume?.toString() || '',
          area: h.area,
          target: h.target,
          dateApplied: h.dateApplied,
          timeApplied: h.timeApplied,
          weather: h.weather,
          reentry: h.reentry?.toString() || '',
          daysExpected: h.daysExpected.toString(),
          reminderDays: h.reminderDays.toString(),
          notes: h.notes
        });
        setEditingId(editId);
      }
    } else {
      setEditingId(null);
      setForm({
        product: '', ingredient: '', mode: '',
        rate: '', volume: '',
        area: '', target: '',
        dateApplied: todayISO(), timeApplied: '',
        weather: '', reentry: '',
        daysExpected: '7', reminderDays: '10',
        notes: ''
      });
    }
    setView('form');
  }

  function closeHerbForm() {
    if (editingId && viewingId) {
      setEditingId(null);
      setView('detail');
    } else {
      setEditingId(null);
      setView('list');
    }
  }

  function openHerbDetail(id: string) {
    setViewingId(id);
    setView('detail');
    setOutcomeNotesDraft(herbLog.find(h => h.id === id)?.outcomeNotes || '');
  }

  function closeHerbDetail() {
    setViewingId(null);
    setView('list');
  }

  async function saveHerbEntry() {
    if (!form.product || !form.dateApplied) return;
    const id = editingId ?? 'h' + (++herbIdCounter.current);
    const meta = {
      ingredient: form.ingredient,
      mode: form.mode,
      rate: parseFloat(form.rate) || null,
      volume: parseFloat(form.volume) || null,
      target: form.target,
      timeApplied: form.timeApplied,
      weather: form.weather,
      reentry: parseInt(form.reentry) || null,
      daysExpected: parseInt(form.daysExpected) || 7,
      reminderDays: parseInt(form.reminderDays) || 10,
      notes: form.notes,
      outcome: editing?.outcome ?? null,
      outcomeDate: editing?.outcomeDate ?? null,
      outcomeNotes: editing?.outcomeNotes ?? '',
    };
    const t = {
      id,
      cropId: 'HERB',
      cropName: form.area,
      date: form.dateApplied,
      daysFromPlanting: 0,
      type: 'herbicide',
      product: form.product,
      notes: 'HERBJSON:' + JSON.stringify(meta),
      updatedAt: Date.now(),
    };
    await db.treatmentLogs.put(t);
    closeHerbForm();
  }

  async function setHerbOutcome(id: string, outcome: Outcome) {
    const t = await db.treatmentLogs.get(id);
    if (!t) return;
    let meta: any = {};
    if (t.notes && t.notes.startsWith('HERBJSON:')) { try { meta = JSON.parse(t.notes.slice(9)); } catch {} }
    meta.outcome = outcome;
    await db.treatmentLogs.update(id, { notes: 'HERBJSON:' + JSON.stringify(meta), updatedAt: Date.now() });
  }

  async function saveHerbOutcome(id: string) {
    const t = await db.treatmentLogs.get(id);
    if (!t) return;
    let meta: any = {};
    if (t.notes && t.notes.startsWith('HERBJSON:')) { try { meta = JSON.parse(t.notes.slice(9)); } catch {} }
    meta.outcomeDate = todayISO();
    meta.outcomeNotes = outcomeNotesDraft;
    await db.treatmentLogs.update(id, { notes: 'HERBJSON:' + JSON.stringify(meta), updatedAt: Date.now() });
  }

  async function deleteHerbEntry(id: string) {
    if (!confirm('Delete this herbicide record?')) return;
    await db.treatmentLogs.delete(id);
    closeHerbDetail();
  }

  return (
    <div className="absolute inset-0 bg-[#f5f5f0] flex flex-col z-[60] animate-in slide-in-from-right duration-300 overflow-y-auto min-h-0">
      <div className="bg-white border-b border-gray-200 h-14 flex items-center gap-3 px-4">
        <button onClick={onClose} className="w-8 h-8 rounded-lg border bg-[#f9f9f6] text-gray-600 flex items-center justify-center">‹</button>
        <h2 className="font-semibold text-[16px] flex-1">🌿 Herbicide Schedule</h2>
        <Button className="h-8" onClick={() => openHerbForm()} title="+ Log">+ Log</Button>
      </div>

      {view === 'list' && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 flex gap-2">
            {(['all','active','done'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilterMode(t)}
                className={`flex-1 text-[11px] font-semibold py-2 rounded-lg border ${filterMode===t ? 'bg-[#e8f5e8] border-[#2d6a2d] text-[#2d6a2d]' : 'bg-white border-[#e0e0e0] text-[#888]'}`}
              >
                {t === 'all' ? 'All' : t === 'active' ? 'Active' : 'Completed'}
              </button>
            ))}
          </div>
          <div className="p-4 space-y-3">
            {list.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <div className="text-4xl mb-2">🌿</div>
                <div className="text-sm font-medium">No applications logged. Tap + Log to record one.</div>
              </div>
            ) : (
              list.map(h => {
                const st = statusOf(h);
                const ds = daysSince(h.dateApplied);
                const pct = Math.min(100, Math.round((ds / Math.max(1, h.daysExpected)) * 100));
                const chip =
                  st === 'active' ? { text: `⏳ Working — day ${ds}/${h.daysExpected}`, cls: 'bg-[#fef3c7] text-[#d97706]' } :
                  st === 'check'  ? { text: '🔍 Check outcome', cls: 'bg-[#ede9fe] text-[#7c3aed]' } :
                  st === 'done'   ? { text: `✅ ${h.outcome === 'effective' ? 'Effective' : h.outcome === 'partial' ? 'Partial' : 'Retreated'}`, cls: 'bg-[#e8f5e8] text-[#2d6a2d]' } :
                                    { text: 'Unknown', cls: 'bg-gray-100 text-gray-500' };
                return (
                  <div key={h.id} onClick={() => openHerbDetail(h.id)} className="bg-white border border-[#e0e0e0] rounded-[12px] p-4 active:scale-[0.985] transition-transform cursor-pointer">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[14px] font-semibold">🌿 {h.product}</div>
                        <div className="text-[12px] text-[#888]">{h.area} · {fmtDate(h.dateApplied)}</div>
                      </div>
                      <span className={`text-[11px] font-semibold px-2 py-1 rounded-[6px] ${chip.cls}`}>{chip.text}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="text-[11px] font-medium px-2 py-1 rounded-[6px] bg-[#f9f9f6] text-[#555]">{h.ingredient}</span>
                      <span className="text-[11px] font-medium px-2 py-1 rounded-[6px] bg-[#f9f9f6] text-[#555]">Target: {h.target}</span>
                    </div>
                    {st !== 'done' ? (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[11px] text-[#888] mb-1">
                          <span>Effectiveness progress</span>
                          <span>{pct}% · Day {ds} of {h.daysExpected}</span>
                        </div>
                        <div className="h-[6px] bg-[#e0e0e0] rounded overflow-hidden">
                          <div className={`h-full rounded ${pct >= 100 ? 'bg-[#d97706]' : 'bg-[#2d6a2d]'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-[12px] text-[#888]">{h.outcomeNotes || 'Completed'}</div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {view === 'form' && (
        <div className="flex-1 overflow-y-auto">
          <div className="bg-white border-b border-gray-200 h-12 flex items-center px-4 gap-2">
            <button onClick={closeHerbForm} className="w-7 h-7 rounded-lg border bg-[#f9f9f6] text-gray-600 flex items-center justify-center">‹</button>
            <div className="font-semibold text-[14px]">{editing ? 'Edit Application' : 'Log Herbicide Application'}</div>
          </div>
          <div className="p-4 space-y-4">
            <section className="bg-white border border-[#e0e0e0] rounded-[12px] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#e0e0e0] text-[13px] font-semibold">🌿 Herbicide Details</div>
              <div className="p-4 space-y-3">
                <div className="field">
                  <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide">Product Name</label>
                  <input className="bg-white border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px] w-full" placeholder="e.g. Roundup, Gramoxone, Karmex" value={form.product} onChange={e => setForm({ ...form, product: e.target.value })}/>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="field">
                    <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide">Active Ingredient</label>
                    <input className="bg-white border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px]" placeholder="e.g. Glyphosate" value={form.ingredient} onChange={e => setForm({ ...form, ingredient: e.target.value })}/>
                  </div>
                  <div className="field">
                    <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide">Mode of Action</label>
                    <select className="bg-white border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px]" value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })}>
                      <option value="">Select…</option>
                      <option>Contact (burns on contact)</option>
                      <option>Systemic (absorbed, translocated)</option>
                      <option>Pre-emergent (prevents germination)</option>
                      <option>Post-emergent (kills existing weeds)</option>
                      <option>Selective (targets specific weeds)</option>
                      <option>Non-selective (kills all vegetation)</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="field">
                    <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide">Mix Rate (ml/L)</label>
                    <input type="number" className="bg-white border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px]" placeholder="e.g. 10" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })}/>
                  </div>
                  <div className="field">
                    <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide">Total Volume Applied (L)</label>
                    <input type="number" className="bg-white border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px]" placeholder="e.g. 5" value={form.volume} onChange={e => setForm({ ...form, volume: e.target.value })}/>
                  </div>
                </div>
              </div>
            </section>
            <section className="bg-white border border-[#e0e0e0] rounded-[12px] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#e0e0e0] text-[13px] font-semibold">📍 Application Info</div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="field">
                    <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide">Target Area / Crop Block</label>
                    <input className="bg-white border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px]" placeholder="e.g. Back field, Pepper bed, Entire garden" value={form.area} onChange={e => setForm({ ...form, area: e.target.value })}/>
                  </div>
                  <div className="field">
                    <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide">Target Weeds</label>
                    <input className="bg-white border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px]" placeholder="e.g. Nut grass, Broadleaf, General weeds" value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}/>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="field">
                    <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide">Date Applied</label>
                    <input type="date" className="bg-white border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px]" value={form.dateApplied} onChange={e => setForm({ ...form, dateApplied: e.target.value })}/>
                  </div>
                  <div className="field">
                    <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide">Time Applied</label>
                    <input type="time" className="bg-white border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px]" value={form.timeApplied} onChange={e => setForm({ ...form, timeApplied: e.target.value })}/>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="field">
                    <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide">Weather at Time</label>
                    <select className="bg-white border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px]" value={form.weather} onChange={e => setForm({ ...form, weather: e.target.value })}>
                      <option value="">Select…</option>
                      <option>Sunny, dry</option>
                      <option>Partly cloudy</option>
                      <option>Overcast, dry</option>
                      <option>Light rain after</option>
                      <option>Windy</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide">Re-entry Interval (hrs)</label>
                    <input type="number" className="bg-white border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px]" placeholder="e.g. 24" value={form.reentry} onChange={e => setForm({ ...form, reentry: e.target.value })}/>
                  </div>
                </div>
              </div>
            </section>
            <section className="bg-white border border-[#e0e0e0] rounded-[12px] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#e0e0e0] text-[13px] font-semibold">⏱ Effectiveness Tracking</div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="field">
                    <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide">Expected Days to Work</label>
                    <input type="number" className="bg-white border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px]" placeholder="e.g. 7" value={form.daysExpected} onChange={e => setForm({ ...form, daysExpected: e.target.value })}/>
                  </div>
                  <div className="field">
                    <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide">Check-back Reminder (days)</label>
                    <input type="number" className="bg-white border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px]" placeholder="e.g. 10" value={form.reminderDays} onChange={e => setForm({ ...form, reminderDays: e.target.value })}/>
                  </div>
                </div>
                <div className="field">
                  <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide">Notes</label>
                  <textarea className="bg-white border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px] min-h-[70px]" placeholder="Any observations, dilution notes, areas to re-treat…" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/>
                </div>
              </div>
            </section>
            <div className="flex gap-2 pb-6">
              <Button className="flex-1 h-10 bg-[#2d6a2d] hover:bg-[#3d8b3d]" onClick={saveHerbEntry}>💾 Save Application</Button>
              <Button variant="outline" className="h-10" onClick={closeHerbForm}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {view === 'detail' && viewing && (
        <div className="flex-1 overflow-y-auto">
          <div className="bg-white border-b border-gray-200 h-12 flex items-center px-4 gap-2">
            <button onClick={closeHerbDetail} className="w-7 h-7 rounded-lg border bg-[#f9f9f6] text-gray-600 flex items-center justify-center">‹</button>
            <div className="font-semibold text-[14px] flex-1">{viewing.product}</div>
            <Button variant="outline" className="h-8" onClick={() => openHerbForm(viewing.id)}>Edit</Button>
          </div>
          <div className="p-4 space-y-4">
            <section className="bg-white border border-[#e0e0e0] rounded-[12px] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#e0e0e0] text-[13px] font-semibold">🌿 Product</div>
              <div className="p-4">
                <div className="text-[16px] font-semibold">{viewing.product}</div>
                <div className="text-[13px] text-[#888]">{viewing.ingredient} · {viewing.mode}</div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="bg-[#f5f5f0] rounded-lg p-3 text-center">
                    <div className="text-[20px] font-semibold text-[#2d6a2d]">{viewing.rate ?? '—'}</div>
                    <div className="text-[11px] text-[#888]">ml/L mix rate</div>
                  </div>
                  <div className="bg-[#f5f5f0] rounded-lg p-3 text-center">
                    <div className="text-[20px] font-semibold text-[#2d6a2d]">{viewing.volume ?? '—'}</div>
                    <div className="text-[11px] text-[#888]">litres applied</div>
                  </div>
                </div>
              </div>
            </section>
            <section className="bg-white border border-[#e0e0e0] rounded-[12px] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#e0e0e0] text-[13px] font-semibold">📍 Application</div>
              <div className="p-4 space-y-1">
                <div className="text-[13px] text-[#555]"><span className="font-semibold">Area:</span> {viewing.area}</div>
                <div className="text-[13px] text-[#555]"><span className="font-semibold">Target weeds:</span> {viewing.target}</div>
                <div className="text-[13px] text-[#555]"><span className="font-semibold">Applied:</span> {fmtDate(viewing.dateApplied)}{viewing.timeApplied ? ` at ${viewing.timeApplied}` : ''}</div>
                <div className="text-[13px] text-[#555]"><span className="font-semibold">Weather:</span> {viewing.weather || 'Not recorded'}</div>
                <div className="text-[13px] text-[#555]"><span className="font-semibold">Re-entry interval:</span> {viewing.reentry ?? '—'} hours</div>
                {viewing.notes && <div className="mt-2 bg-[#f5f5f0] rounded-lg p-3 text-[12px] text-[#555]">{viewing.notes}</div>}
              </div>
            </section>
            <section className="bg-white border border-[#e0e0e0] rounded-[12px] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#e0e0e0] text-[13px] font-semibold">⏱ Effectiveness</div>
              <div className="p-4">
                {(() => {
                  const ds = daysSince(viewing.dateApplied);
                  const pct = Math.min(100, Math.round((ds / Math.max(1, viewing.daysExpected)) * 100));
                  return (
                    <>
                      <div className="flex items-center justify-between text-[12px] text-[#888] mb-1">
                        <span>Day {ds} of {viewing.daysExpected} expected</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-2 bg-[#e0e0e0] rounded overflow-hidden">
                        <div className={`h-full rounded ${pct >= 100 && !viewing.outcome ? 'bg-[#d97706]' : 'bg-[#2d6a2d]'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </>
                  );
                })()}
                <div className="mt-4">
                  <div className="text-[12px] font-semibold text-[#888] uppercase mb-2">Outcome</div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { key: 'effective', label: '✅ Effective' },
                      { key: 'partial', label: '⚡ Partially effective' },
                      { key: 'retreated', label: '🔁 Needed re-treatment' },
                      { key: 'no-effect', label: '❌ No effect' },
                    ] as { key: Outcome; label: string }[]).map(o => (
                      <button key={o.key}
                        onClick={() => setHerbOutcome(viewing.id, o.key)}
                        className={`px-3 py-2 rounded-lg border text-[12px] font-medium ${viewing.outcome === o.key ? 'bg-[#e8f5e8] border-[#2d6a2d] text-[#2d6a2d]' : 'bg-[#f5f5f0] border-[#e0e0e0] text-[#555]'}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3">
                    <label className="text-[12px] font-semibold text-[#888] uppercase mb-1 block">Outcome Notes</label>
                    <textarea className="w-full bg-white border border-[#e0e0e0] rounded-lg px-3 py-2 text-[13px] min-h-[60px]"
                      value={outcomeNotesDraft} onChange={e => setOutcomeNotesDraft(e.target.value)} />
                    <Button className="w-full mt-2" onClick={() => saveHerbOutcome(viewing.id)}>Save Outcome</Button>
                  </div>
                </div>
              </div>
            </section>
            <div className="flex gap-2 pb-6">
              <Button variant="outline" className="flex-1" onClick={() => openHerbForm(viewing.id)}>✏️ Edit</Button>
              <Button variant="destructive" onClick={() => deleteHerbEntry(viewing.id)}>🗑 Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
