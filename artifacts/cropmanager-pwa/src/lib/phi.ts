import { parseDate, daysBetween, today, formatDateShort, addDays } from './dates';
import { normalizeStage } from './stages';
import type { TreatmentLog } from '../types';

/** Fixed pre-harvest interval (days) for all products — per user request. */
export const PHI_DAYS = 7;

const PHI_TYPES = new Set(['fungus', 'pest', 'fungicide', 'pesticide']);

export interface PhiStatus {
  /** Most recent fungus/pest spray date (stored format). */
  sprayDate: string;
  /** PHI expiry date (stored format). */
  expiresDate: string;
  /** Whole days remaining including today. 7 on spray day → 1 on last day. */
  daysLeft: number;
  /** Which trigger types were found on the latest spray date. */
  types: string[];
}

/**
 * Pre-Harvest Interval warning: active only when the crop is in the Fruiting
 * stage and a fungus/pest treatment was logged within the last PHI_DAYS.
 * The clock starts on the log date and the latest spray resets it.
 */
export function getPhiStatus(
  plantStage: string,
  treatmentLogs: Pick<TreatmentLog, 'date' | 'type'>[],
  now: Date = today()
): PhiStatus | null {
  if (normalizeStage(plantStage) !== 'Fruiting') return null;
  let latest: Date | null = null;
  let latestStr = '';
  for (const t of treatmentLogs ?? []) {
    if (!PHI_TYPES.has((t.type ?? '').toLowerCase())) continue;
    const d = parseDate(t.date);
    if (!d) continue;
    if (!latest || d.getTime() > latest.getTime()) {
      latest = d;
      latestStr = t.date;
    }
  }
  if (!latest) return null;
  const daysSince = daysBetween(latest, now);
  // Future-dated spray (backdated entry error) → treat as full window.
  const daysLeft = daysSince < 0 ? PHI_DAYS : PHI_DAYS - daysSince;
  if (daysLeft <= 0) return null;
  const types = [...new Set(
    (treatmentLogs ?? [])
      .filter(t => t.date === latestStr && PHI_TYPES.has((t.type ?? '').toLowerCase()))
      .map(t => t.type)
  )];
  return {
    sprayDate: latestStr,
    expiresDate: formatDateShort(addDays(latest, PHI_DAYS)),
    daysLeft,
    types,
  };
}
