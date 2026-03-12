import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { formatDateShort, today } from '../lib/dates';

export function useDueReminders() {
  return useLiveQuery(async () => {
    const todayStr = formatDateShort(today());
    return db.reminders.where('sent').equals(0).filter(r => r.sendDate <= todayStr).toArray();
  }, []);
}

export function useTodayReminders() {
  return useLiveQuery(async () => {
    const todayStr = formatDateShort(today());
    return db.reminders.where('sendDate').equals(todayStr).filter(r => !r.sent).toArray();
  }, []);
}

export function useCropReminders(cropId: string) {
  return useLiveQuery(() => db.reminders.where('trackingId').equals(cropId).toArray(), [cropId]);
}

export async function markReminderDone(id: string) {
  await db.reminders.where('id').equals(id).modify({ sent: true, syncStatus: 'pending', updatedAt: Date.now() });
}
