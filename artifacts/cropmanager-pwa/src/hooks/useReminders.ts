import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { formatDateShort, parseDate, today } from '../lib/dates';
import { markDismissed } from '../lib/reminderNotifications';

function sendDateTs(sendDate: string | undefined | null): number | null {
  if (!sendDate) return null;
  const d = parseDate(sendDate);
  return d ? d.getTime() : null;
}

/** Collapse duplicate generated rows (same slot) to one display/notification task. */
export function dedupeReminders<T extends { id: string; type: string; trackingId: string; subject: string; sendDate: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter(r => {
    const key = `${r.type}|${r.trackingId}|${r.subject}|${r.sendDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function useDueReminders() {
  return useLiveQuery(async () => {
    const todayTs = today().getTime();
    const all = await db.reminders.where('sendDate').above('').toArray();
    return dedupeReminders(all.filter(r => {
      if (r.sent) return false;
      const ts = sendDateTs(r.sendDate);
      return ts !== null && ts <= todayTs;
    }));
  }, []);
}

export function useTodayReminders() {
  return useLiveQuery(async () => {
    const todayStr = formatDateShort(today());
    const all = await db.reminders.where('sendDate').above('').toArray();
    return dedupeReminders(all.filter(r => r.sendDate === todayStr && !r.sent));
  }, []);
}

export function useCropReminders(cropId: string) {
  return useLiveQuery(() => db.reminders.where('trackingId').equals(cropId).toArray(), [cropId]);
}

export async function markReminderDone(id: string) {
  try {
    const reminder = await db.reminders.get(id).catch(() => undefined);
    await db.reminders.where('id').equals(id).modify({ sent: true, updatedAt: Date.now() });
    // Generated schedules can leave duplicate rows for the same slot. Complete
    // them together, otherwise the next duplicate pops back onto the dashboard.
    if (reminder) {
      const siblings = await db.reminders.where('trackingId').equals(reminder.trackingId ?? '').toArray().catch(() => []);
      const dupes = siblings.filter(r =>
        r.id !== id &&
        !r.sent &&
        r.type === reminder.type &&
        r.sendDate === reminder.sendDate &&
        r.subject === reminder.subject,
      );
      await Promise.all(dupes.map(r => db.reminders.update(r.id, { sent: true, updatedAt: Date.now() })));
      markDismissed([id, ...dupes.map(r => r.id)]);
    }
  } catch (e) {
    console.error('[reminders] mark done failed', { id, e });
    throw e;
  }
  // Per-crop treatment repeats roll forward to the next due date.
  try {
    const { rollTreatmentRepeat } = await import('../lib/treatmentReminders');
    await rollTreatmentRepeat(id);
  } catch (e) {
    console.error('[reminders] repeat roll failed', { id, e });
  }
}
