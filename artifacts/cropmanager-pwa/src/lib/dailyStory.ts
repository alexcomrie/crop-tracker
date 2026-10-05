import { parseDate, daysBetween, today } from './dates';
import type { FarmEvent } from './farmEvents';

/**
 * Turns a day's structured events into a natural-language journal entry,
 * plus quiet-day status lines for crops still in the ground (days in stage,
 * days since pollination for active fruit trackings).
 */

function summarize(list: string[], singular: string, plural: string): string {
  if (list.length === 0) return '';
  if (list.length === 1) return `${list[0]} ${singular}`;
  if (list.length === 2) return `${list[0]} and ${list[1]} ${plural}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]} ${plural}`;
}

function eventSentence(e: FarmEvent): string {
  switch (e.kind) {
    case 'harvest':
      return `Harvested ${e.cropName || 'crops'}${e.subtitle ? ` (${e.subtitle})` : ''}.`;
    case 'treatment':
      return `Sprayed ${e.title}${e.cropName ? ` on ${e.cropName}` : ''}${e.subtitle ? ` — ${e.subtitle}` : ''}.`;
    case 'stage':
      return `${e.subtitle || 'A crop'} moved ${e.title}.`;
    case 'activity':
      return `Field work: ${e.title}${e.subtitle ? ` — ${e.subtitle}` : ''}.`;
    case 'observation':
      return `Noted: ${e.subtitle || e.title}.`;
    case 'tracking':
      return `${e.title}${e.subtitle ? ` — ${e.subtitle}` : ''}.`;
    case 'finance':
      return `Books: ${e.title}${e.subtitle ? ` — ${e.subtitle}` : ''}.`;
    case 'reminder':
      return `Reminder due: ${e.title}.`;
    default:
      return e.title;
  }
}

/** Days the crop has spent in its current stage (stage logs → planting fallback). */
export function daysInStage(
  crop: { plantingDate: string; plantStage: string },
  stageLogs: { trackingId: string; stageTo: string; date: string }[],
  cropId: string, now: Date = today(),
): number | null {
  const logs = stageLogs.filter(s => s.trackingId === cropId);
  const last = logs.length
    ? logs.map(s => parseDate(s.date)).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime()).pop()
    : parseDate(crop.plantingDate);
  if (!last) return null;
  return Math.max(0, daysBetween(last, now));
}

/** Status line for a crop on a quiet day, e.g. "Tomato is 4 days into fruiting." */
export function cropStatusLine(
  crop: { cropName: string; variety?: string; plantStage: string; plantingDate: string; id: string },
  stageLogs: { trackingId: string; stageTo: string; date: string }[],
  now: Date = today(),
): string | null {
  const d = daysInStage(crop, stageLogs, crop.id, now);
  if (d === null) return null;
  const name = `${crop.cropName}${crop.variety ? ` (${crop.variety})` : ''}`;
  const stage = crop.plantStage.toLowerCase();
  return `${name} is ${d} day${d === 1 ? '' : 's'} into ${stage}.`;
}

/** e.g. "12 days since the watermelon was pollinated (tag #3)." */
export function trackingStatusLine(
  t: { cropName: string; label: string; tagNumber?: string; startDate: string; status: string },
  now: Date = today(),
): string | null {
  if (t.status !== 'active') return null;
  const start = parseDate(t.startDate);
  if (!start) return null;
  const d = Math.max(0, daysBetween(start, now));
  const tag = t.tagNumber ? ` (tag #${t.tagNumber})` : '';
  return `${d} day${d === 1 ? '' : 's'} since the ${t.cropName || t.label} was tracked${tag}.`;
}

const OPENERS = ['Good day, quietly.', 'Another day on the farm.', 'Slow and steady today.', 'A full day outside.'];
const CLOSERS = [
  'Nothing monumental. Still: shoulders down by dinner.',
  'Star in the margin so later-me remembers the good days too.',
  'The field keeps its own ledger; this is mine.',
];

export function storyForDay(
  date: string, events: FarmEvent[],
  statusLines: string[], index: number,
): string[] {
  const paras: string[] = [];
  if (events.length === 0) {
    paras.push(`${OPENERS[index % OPENERS.length]} No new jobs logged.`);
  } else {
    const byKind = new Map<string, FarmEvent[]>();
    for (const e of events) {
      const arr = byKind.get(e.kind) ?? [];
      arr.push(e);
      byKind.set(e.kind, arr);
    }
    const first = events.slice(0, 4).map(eventSentence);
    paras.push(`${OPENERS[index % OPENERS.length]} ${first.join(' ')}`);
    if (events.length > 4) {
      const rest = events.slice(4).map(eventSentence);
      paras.push(`Also: ${rest.join(' ')}`);
    }
    void byKind;
    void summarize;
  }
  if (statusLines.length > 0) {
    paras.push(`Around the field: ${statusLines.slice(0, 4).join(' ')}`);
  }
  paras.push(CLOSERS[index % CLOSERS.length]);
  return paras;
}
