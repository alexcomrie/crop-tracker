/**
 * Dataset builder — converts Dexie crop histories into string docs
 * for micro-crop sequence learning. Each doc is a compact textual
 * encoding of a single harvest episode.
 */
import type { Crop, HarvestLog, StageLog, CropData } from '../../types';
import { resolveCropData } from '../cropDb';
import { daysBetween, parseDate } from '../dates';

export interface CropDocContext {
  cropKey: string;
  variety: string;
  method: string;
  monthBucket: string; // jan|feb...
  plantType: string;
}

export function monthBucket(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return 'unk';
  return ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'][d.getMonth()];
}

export function deltaBucket(days: number): string {
  // bucketize deviation into single char for char-level model
  // -30..+30 mapped to a-z, clamp
  const clamped = Math.max(-13, Math.min(13, Math.round(days / 2)));
  return String.fromCharCode(97 + clamped + 13); // a..z
}

export function durationBucket(days: number): string {
  if (days <= 0) return '0';
  if (days <= 7) return '1';
  if (days <= 14) return '2';
  if (days <= 21) return '3';
  if (days <= 35) return '4';
  if (days <= 60) return '5';
  if (days <= 90) return '6';
  return '7';
}

// Encode a single crop episode as a doc
export function encodeCropDoc(
  crop: Crop,
  harvestLog: HarvestLog,
  stageLogs: StageLog[],
  cropData: CropData | null
): string {
  const key = crop.cropName.toLowerCase().replace(/\s+/g, '_').slice(0, 12);
  const varCode = (crop.variety || 'std').toLowerCase().replace(/\s+/g, '_').slice(0, 8);
  const meth = (crop.plantingMethod || 'direct').toLowerCase().replace(/\s+/g, '_').slice(0, 6);
  const ptype = (cropData?.plant_type || 'other').slice(0, 4);
  const mon = monthBucket(crop.plantingDate);
  const dbDays = cropData?.growing_time_days ?? 60;
  const actualDays = harvestLog.daysFromPlanting;
  const delta = actualDays - dbDays;
  const germToTransplant = crop.daysGermTransplant || 0;

  // Stage sequence shorthand
  const seq = stageLogs
    .filter(sl => sl.trackingId === crop.id)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(sl => sl.stageTo.charAt(0)) // S G V F etc
    .join('');

  // format: key|var|meth:mon/ptype db~actual Δ bucket seq
  // e.g. tomato|roma|tray:mar/veg 60~68+b VegF
  const doc = `${key}|${varCode}|${meth}:${mon}/${ptype} ${dbDays}~${actualDays}${deltaBucket(delta)}${durationBucket(germToTransplant)}${seq}`;
  return doc;
}

export function buildDocsFromDexie(
  crops: Crop[],
  harvestLogs: HarvestLog[],
  stageLogs: StageLog[],
  cropDb: Record<string, unknown>
): string[] {
  const harvestByCrop = new Map<string, HarvestLog[]>();
  for (const hl of harvestLogs) {
    const arr = harvestByCrop.get(hl.cropTrackingId) ?? [];
    arr.push(hl);
    harvestByCrop.set(hl.cropTrackingId, arr);
  }
  const docs: string[] = [];
  // Hoist cropDb lookups: one resolve per crop name instead of per harvest log
  const cropDataCache = new Map<string, CropData | null>();
  const dataFor = (cropName: string): CropData | null => {
    const k = cropName.toLowerCase();
    if (!cropDataCache.has(k)) {
      cropDataCache.set(k, resolveCropData(cropDb as never, cropName) as CropData | null);
    }
    return cropDataCache.get(k) ?? null;
  };
  for (const c of crops) {
    const logs = harvestByCrop.get(c.id);
    if (!logs || logs.length === 0) continue;
    // Use the first harvest log per crop as primary episode; additional logs become separate docs with same crop context
    for (const hl of logs) {
      docs.push(encodeCropDoc(c, hl, stageLogs, dataFor(c.cropName)));
    }
  }
  // Also synthesize docs from stageLogs alone for germination learning (even without harvest)
  // Only if we have few harvest docs
  if (docs.length < 10) {
    for (const c of crops) {
      if (harvestByCrop.has(c.id)) continue;
      if (!c.germinationDate || !c.plantingDate) continue;
      const cd = dataFor(c.cropName);
      const planted = parseDate(c.plantingDate);
      const germ = parseDate(c.germinationDate);
      if (!planted || !germ) continue;
      const germDays = daysBetween(planted, germ);
      const fakeHl: HarvestLog = {
        id: `syn_${c.id}`,
        cropTrackingId: c.id,
        cropName: c.cropName,
        harvestNumber: 0,
        harvestDate: c.germinationDate,
        daysFromPlanting: germDays,
        deviationFromDb: 0,
        notes: 'synthetic_germ',
        updatedAt: Date.now(),
      };
      docs.push(encodeCropDoc(c, fakeHl, stageLogs, cd));
    }
  }
  return docs;
}
