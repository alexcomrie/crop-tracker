import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { useAppStore } from '../store/useAppStore';
import { sendTelegramMessage } from '../lib/telegram';
import { formatDateShort, today } from '../lib/dates';

export function useTelegramReminders() {
  const { settings } = useAppStore();
  const todayStr = formatDateShort(today());

  const dueReminders = useLiveQuery(async () => {
    return await db.reminders
      .where('sendDate')
      .equals(todayStr)
      .and(r => !r.telegramSent)
      .toArray();
  }, [todayStr]);

  useEffect(() => {
    if (!settings.telegramToken || !settings.telegramChatId || !dueReminders?.length) return;

    const sendPending = async () => {
      for (const reminder of dueReminders) {
        const text = `🔔 <b>${reminder.subject}</b>\n\n${reminder.body}`;
        const success = await sendTelegramMessage(settings.telegramToken, settings.telegramChatId, text);
        
        if (success) {
          await db.reminders.update(reminder.id, { 
            telegramSent: true,
            updatedAt: Date.now() 
          });
        }
      }
    };

    sendPending();
  }, [dueReminders, settings.telegramToken, settings.telegramChatId]);
}
