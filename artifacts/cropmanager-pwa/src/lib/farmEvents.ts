import { parseDate } from './dates';

export type FarmEventKind =
  | 'activity'
  | 'treatment'
  | 'harvest'
  | 'stage'
  | 'observation'
  | 'tracking'
  | 'finance'
  | 'reminder';

export interface FarmEvent {
  id: string;
  /** Stored dd-MMM-yyyy date string (display + grouping key). */
  date: string;
  /** Epoch ms for sorting; 0 when unparseable. */
  time: number;
  kind: FarmEventKind;
  title: string;
  subtitle: string;
  cropIds: string[];
  cropName: string;
  source: { table: string; refId: string };
}

function toTime(dateStr: string): number {
  return parseDate(dateStr)?.getTime() ?? 0;
}

function ev(
  id: string, date: string, kind: FarmEventKind, title: string,
  subtitle: string, cropIds: string[], cropName: string,
  source: { table: string; refId: string },
): FarmEvent {
  return { id, date, time: toTime(date), kind, title, subtitle, cropIds, cropName, source };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildFarmEvents(all: {
  activities?: any[]; treatmentLogs?: any[]; harvestLogs?: any[];
  stageLogs?: any[]; observationLogs?: any[]; observationEntries?: any[];
  trackings?: any[]; trackingEntries?: any[]; ledgerEntries?: any[];
  reminders?: any[];
}): FarmEvent[] {
  const out: FarmEvent[] = [];
  const {
    activities = [], treatmentLogs = [], harvestLogs = [], stageLogs = [],
    observationLogs = [], observationEntries = [], trackings = [],
    trackingEntries = [], ledgerEntries = [], reminders = [],
  } = all;

  for (const a of activities) {
    out.push(ev(`act:${a.id}`, a.date ?? '', 'activity',
      `${String(a.type ?? 'activity').split(',').join(' + ')}${a.product ? `: ${a.product}` : ''}`,
      a.notes ?? '', Array.isArray(a.cropIds) ? a.cropIds : [],
      '', { table: 'activities', refId: a.id }));
  }
  for (const t of treatmentLogs) {
    out.push(ev(`tre:${t.id}`, t.date ?? '', 'treatment',
      `${t.type ?? 'treatment'}: ${t.product ?? ''}`.trim(),
      t.notes ?? '', t.cropId ? [t.cropId] : [], t.cropName ?? '',
      { table: 'treatmentLogs', refId: t.id }));
  }
  for (const h of harvestLogs) {
    out.push(ev(`har:${h.id}`, h.harvestDate ?? '', 'harvest',
      `Harvest #${h.harvestNumber ?? ''} ${h.cropName ?? ''}`.trim(),
      h.notes ?? '', [], h.cropName ?? '',
      { table: 'harvestLogs', refId: h.id }));
  }
  for (const s of stageLogs) {
    out.push(ev(`stg:${s.id}`, s.date ?? '', 'stage',
      `${s.stageFrom ?? ''} → ${s.stageTo ?? ''}`,
      s.cropName ?? '', [], s.cropName ?? '',
      { table: 'stageLogs', refId: s.id }));
  }
  for (const o of observationLogs) {
    out.push(ev(`obs:${o.id}`, o.date ?? '', 'observation',
      o.plantName ? `${o.plantName}: ${String(o.text ?? '').slice(0, 60)}` : String(o.text ?? '').slice(0, 60),
      o.text ?? '', o.cropId ? [o.cropId] : [], o.plantName ?? '',
      { table: 'observationLogs', refId: o.id }));
  }
  for (const u of observationEntries) {
    out.push(ev(`obe:${u.id}`, u.date ?? '', 'observation',
      `Update: ${String(u.text ?? '').slice(0, 60)}`,
      u.text ?? '', u.cropId ? [u.cropId] : [], '',
      { table: 'observationEntries', refId: u.id }));
  }
  for (const t of trackings) {
    const label = t.status === 'done'
      ? `Tracking done: ${t.label ?? ''}`
      : t.status === 'failed' ? `Tracking failed: ${t.label ?? ''}` : `Tracking: ${t.label ?? ''}`;
    out.push(ev(`trk:${t.id}`, t.status === 'done' && t.endDate ? t.endDate : t.startDate ?? '', 'tracking',
      label, t.notes ?? '', t.cropId ? [t.cropId] : [], t.cropName ?? '',
      { table: 'trackings', refId: t.id }));
  }
  for (const e of trackingEntries) {
    out.push(ev(`tre2:${e.id}`, e.date ?? '', 'tracking',
      `Journal: ${String(e.text ?? '').slice(0, 60)}`,
      e.text ?? '', e.cropId ? [e.cropId] : [], '',
      { table: 'trackingEntries', refId: e.id }));
  }
  for (const l of ledgerEntries) {
    out.push(ev(`led:${l.id}`, l.date ?? '', 'finance',
      `${l.type ?? ''} · ${l.category ?? ''} · $${l.amount ?? 0}`,
      l.notes ?? l.description ?? '', [], '',
      { table: 'ledgerEntries', refId: l.id }));
  }
  for (const r of reminders) {
    if (!r.sendDate) continue;
    out.push(ev(`rem:${r.id}`, r.sendDate, 'reminder',
      `Reminder: ${r.subject ?? r.type ?? ''}`,
      r.body ?? '', r.trackingId ? [r.trackingId] : [], r.cropPlantName ?? '',
      { table: 'reminders', refId: r.id }));
  }

  out.sort((a, b) => b.time - a.time || (a.id < b.id ? -1 : 1));
  return out;
}

/** Group events by stored date string, newest date first. */
export function groupEventsByDate(events: FarmEvent[]): { date: string; time: number; events: FarmEvent[] }[] {
  const map = new Map<string, { date: string; time: number; events: FarmEvent[] }>();
  for (const e of events) {
    const key = e.date || 'Undated';
    const g = map.get(key) ?? { date: key, time: e.time, events: [] };
    g.events.push(e);
    if (e.time > g.time) g.time = e.time;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.time - a.time);
}
