import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { formatDateShort, parseDate, today } from '../lib/dates';

function sendDateTs(sendDate: string | undefined | null): number | null {
  if (!sendDate) return null;
  const d = parseDate(sendDate);
  return d ? d.getTime() : null;
}

export function useDueReminders() {
  return useLiveQuery(async () => {
    const todayTs = today().getTime();
    const all = await db.reminders.where('sendDate').above('').toArray();
    return all.filter(r => {
      const ts = sendDateTs(r.sendDate);
      return ts !== null && ts <= todayTs;
    });
  }, []);
}

export function useTodayReminders() {
  return useLiveQuery(async () => {
    const todayStr = formatDateShort(today());
    const all = await db.reminders.where('sendDate').above('').toArray();
    return all.filter(r => r.sendDate === todayStr && !r.sent);
  }, []);
}

export function useCropReminders(cropId: string) {
  return useLiveQuery(() => db.reminders.where('trackingId').equals(cropId).toArray(), [cropId]);
}

export async function markReminderDone(id: string) {
  try {
    await db.reminders.where('id').equals(id).modify({ sent: true, updatedAt: Date.now() });
  } catch (e) {
    console.error('[reminders] mark done failed', { id, e });
    throw e;
  }
}
