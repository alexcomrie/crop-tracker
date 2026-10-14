import db from '../db/db';
import { generateId } from './ids';
import { parseDate, addDays, formatDateShort, today } from './dates';
import type { Crop, Reminder, TreatmentLog } from '../types';

/**
 * Per-crop repeat treatment reminders. Each crop carries its own interval
 * (days, 0/off) for pest, fungus and fertilizer — set in the Treatment tab
 * or at creation. Only ONE pending reminder per kind exists at a time:
 * scheduling deletes the old pending one and creates the next from the
 * latest treatment date (or today when nothing logged yet).
 */

export interface TreatmentKind {
  /** treatmentLogs.type value */
  log: 'pest' | 'fungus' | 'fertilizer';
  /** reminders.type value */
  rem: 'pesticide' | 'fungicide' | 'fertilizer';
  label: string;
  icon: string;
}

export const TREATMENT_KINDS: TreatmentKind[] = [
  { log: 'pest', rem: 'pesticide', label: 'Pesticide', icon: '🐛' },
  { log: 'fungus', rem: 'fungicide', label: 'Fungus', icon: '🍄' },
  { log: 'fertilizer', rem: 'fertilizer', label: 'Fertilizer', icon: '🧪' },
];

export const REPEAT_OPTIONS = [
  { label: 'Off', days: 0 },
  { label: 'Weekly', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '3 weeks', days: 21 },
  { label: 'Monthly', days: 30 },
];

function intervalOf(crop: Crop, log: TreatmentKind['log']): number {
  if (log === 'pest') return crop.pestIntervalDays ?? 0;
  if (log === 'fungus') return crop.fungusIntervalDays ?? 0;
  return crop.fertilizerIntervalDays ?? 0;
}

function kindForRem(remType: string): TreatmentKind | null {
  return TREATMENT_KINDS.find(k => k.rem === remType) ?? null;
}

/** Schedule (or reschedule) the next reminder for one kind on a crop. */
export async function scheduleTreatmentReminder(cropId: string, log: TreatmentKind['log']): Promise<void> {
  const crop = await db.crops.get(cropId).catch(() => undefined);
  if (!crop) return;
  const kind = TREATMENT_KINDS.find(k => k.log === log)!;
  const interval = intervalOf(crop, log);

  // Clear stale pending ones of this kind so only the next stands.
  const pending = await db.reminders.where('trackingId').equals(cropId).toArray().catch((): Reminder[] => []);
  await Promise.all(
    pending.filter(r => !r.sent && r.type === kind.rem).map(r => db.reminders.delete(r.id).catch(() => {})),
  );
  if (!interval || interval <= 0) return;

  const logs = await db.treatmentLogs.where('cropId').equals(cropId).toArray().catch((): TreatmentLog[] => []);
  const latest = logs
    .filter(l => (l.type ?? '').toLowerCase() === log)
    .map(l => parseDate(l.date))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())
    .pop();
  const base = latest ?? today();
  const sendDate = formatDateShort(addDays(base, interval));
  await db.reminders.add({
    id: generateId('REM'),
    type: kind.rem,
    cropPlantName: crop.cropName,
    trackingId: crop.id,
    sendDate,
    subject: `${kind.icon} ${kind.label} due: ${crop.cropName}`,
    body: `Reapply ${kind.label.toLowerCase()} every ${interval} days. Last: ${latest ? formatDateShort(latest) : '—'}.`,
    sent: false,
    durationDays: interval,
    chatId: '',
    updatedAt: Date.now(),
  } as never);
}

/** Reschedule all three kinds (used when intervals change). */
export async function rescheduleAllTreatmentReminders(cropId: string): Promise<void> {
  for (const k of TREATMENT_KINDS) {
    try {
      await scheduleTreatmentReminder(cropId, k.log);
    } catch (e) {
      console.error('[treat-rem] reschedule failed', { cropId, kind: k.log, e });
    }
  }
}

/**
 * Called after a reminder is completed: if it was a per-crop treatment
 * repeat with its interval still on, roll the next one forward.
 */
export async function rollTreatmentRepeat(reminderId: string): Promise<void> {
  const r = await db.reminders.get(reminderId).catch(() => undefined);
  if (!r || !r.trackingId || r.trackingId === 'MANUAL') return;
  const kind = kindForRem(r.type);
  if (!kind) return;
  const crop = await db.crops.get(r.trackingId).catch(() => undefined);
  if (!crop) return;
  if (intervalOf(crop, kind.log) > 0) {
    await scheduleTreatmentReminder(crop.id, kind.log);
  }
}

/** Legacy foundation-schedule types — generated, never hand-made. */
export const LEGACY_SCHEDULE_TYPES = ['spray_fungus', 'spray_pest', 'fert_application'];
