import { parseDate, daysBetween, today } from './dates';
import { shortCropId } from './ids';
import type { FarmEvent } from './farmEvents';

/**
 * Straight-to-point daily farm log. One dated page per day, one direct
 * line per event — crop, variety, method, short crop id, and the note.
 * No prose padding.
 */

export interface CropRef {
  id: string;
  cropName: string;
  variety?: string;
  plantingMethod?: string;
  plantingDate?: string;
  plantStage?: string;
  notes?: string;
}

/** dd/mm/yyyy for the diary date header. */
export function diaryDate(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** "Hot Pepper of the Scotch Bonnet variety" or just "Hot Pepper". */
function named(cropName: string, variety?: string): string {
  const v = (variety ?? '').trim();
  return v ? `${cropName} of the ${v} variety` : cropName;
}

/** Container detail parsed from the crop notes ("🧫 Container: ..." first line). */
export function containerOf(crop?: CropRef): string {
  const notes = crop?.notes ?? '';
  const first = notes.split('\n')[0] ?? '';
  const m = /🧫 Container:\s*(.+)/.exec(first);
  return m ? m[1].trim() : '';
}

function tag(id: string): string {
  return `crop id ${shortCropId(id)}`;
}

/** One direct line per event. */
export function directLine(e: FarmEvent, cropById: Map<string, CropRef>): string {
  const cid = e.cropIds[0];
  const crop = cid ? cropById.get(cid) : undefined;
  const name = crop ? named(crop.cropName, crop.variety) : (e.cropName || 'crop');
  const idBit = cid ? `, ${tag(cid)}` : '';

  switch (e.kind) {
    case 'activity': {
      const extra = e.subtitle ? ` — ${e.subtitle}` : '';
      return `${e.title}${extra}.`;
    }
    case 'treatment': {
      // e.title is "type: product"
      const m = /^([^:]+):\s*(.*)$/.exec(e.title);
      const type = (m?.[1] ?? e.title).trim();
      const product = (m?.[2] ?? '').trim();
      const what = product ? `${type} (${product})` : type;
      const note = e.subtitle ? ` Note to self: ${e.subtitle}` : '';
      return `Sprayed ${name}${idBit} with ${what}.${note}`;
    }
    case 'harvest': {
      const n = /Harvest #(\d+)/.exec(e.title)?.[1];
      const note = e.subtitle ? ` Note to self: ${e.subtitle}` : '';
      return `Harvested ${name}${idBit}${n ? `, harvest #${n}` : ''}.${note}`;
    }
    case 'stage': {
      return `${name}${idBit} moved ${e.title}.`;
    }
    case 'observation': {
      return `${name}${idBit}: ${e.subtitle || e.title}`;
    }
    case 'tracking': {
      return `${e.title}${e.cropName ? ` — ${e.cropName}` : ''}${idBit}${e.subtitle ? `: ${e.subtitle}` : ''}.`;
    }
    case 'finance': {
      return `${e.title}${e.subtitle ? ` — ${e.subtitle}` : ''}.`;
    }
    case 'reminder': {
      return `Due: ${e.title}${e.subtitle ? ` — ${e.subtitle}` : ''}.`;
    }
    default:
      return e.title;
  }
}

/** Days the crop has spent in its current stage (stage logs → planting fallback). */
export function daysInStage(
  crop: { plantingDate?: string },
  stageLogs: { trackingId: string; date: string }[],
  cropId: string, now: Date = today(),
): number | null {
  const dates = stageLogs
    .filter(s => s.trackingId === cropId)
    .map(s => parseDate(s.date))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime());
  const anchor = dates.length ? dates[dates.length - 1] : parseDate(crop.plantingDate ?? '');
  if (!anchor) return null;
  return Math.max(0, daysBetween(anchor, now));
}

/** "Tomato (#A3F9) is 4 days into fruiting." */
export function cropStatusLine(
  crop: CropRef,
  stageLogs: { trackingId: string; date: string }[],
  now: Date = today(),
): string | null {
  const d = daysInStage(crop, stageLogs, crop.id, now);
  if (d === null) return null;
  const stage = (crop.plantStage ?? '').toLowerCase() || 'growth';
  return `${crop.cropName} (${shortCropId(crop.id)}) is ${d} day${d === 1 ? '' : 's'} into ${stage}.`;
}

/** "12 days since the watermelon (#B2C1) was pollinated (tag #3)." */
export function trackingStatusLine(
  t: { cropName: string; label: string; tagNumber?: string; startDate: string; status: string; cropId?: string },
  now: Date = today(),
): string | null {
  if (t.status !== 'active') return null;
  const start = parseDate(t.startDate);
  if (!start) return null;
  const d = Math.max(0, daysBetween(start, now));
  const tagNo = t.tagNumber ? ` (tag #${t.tagNumber})` : '';
  const idBit = t.cropId ? ` (${shortCropId(t.cropId)})` : '';
  return `${d} day${d === 1 ? '' : 's'} since the ${t.cropName || t.label}${idBit} was tracked${tagNo}.`;
}

/**
 * Planting line for a crop created on this day, e.g:
 * "Planted Hot Pepper of the Scotch Bonnet variety, in Seed Tray
 *  (128-cell x 3 trays), crop id #A3F9."
 */
export function plantingLine(crop: CropRef): string {
  const method = crop.plantingMethod || 'field';
  const container = containerOf(crop);
  const where = container ? `, in ${method} (${container})` : `, in ${method}`;
  return `Planted ${named(crop.cropName, crop.variety)}${where}, ${tag(crop.id)}.`;
}
