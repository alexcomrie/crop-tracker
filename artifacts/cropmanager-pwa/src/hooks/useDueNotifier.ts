import { useEffect, useRef } from 'react';
import db from '../db/db';
import { parseDate, today } from '../lib/dates';
import { useAppStore, withReminderDefaults, isReminderKindAllowed } from '../store/useAppStore';
import { showSystemNotice, playTone, setAppBadge, clearAppBadge } from '../lib/notify';

// Notified once per app session so a due reminder doesn't re-alert every sweep.
const notifiedThisSession = new Set<string>();

/**
 * Due-reminder sweeper: on launch and every minute, posts system
 * notifications (status-bar icon included) for unsent reminders whose date
 * has arrived, honours Settings (master switch + per-type), and keeps the
 * app-icon badge in sync with the due count.
 *
 * Note: browsers only deliver these while the browser/PWA process is alive
 * (foreground, background, or installed PWA). True closed-app push needs a
 * push server, which this offline-first app doesn't have.
 */
export function useDueNotifier() {
  const settings = useAppStore(s => s.settings);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let stopped = false;

    async function sweep() {
      const prefs = withReminderDefaults(settings);
      try {
        const now = today().getTime();
        const all = await db.reminders.where('sendDate').above('').toArray().catch(() => []);
        const due = all.filter(r => {
          if (r.sent) return false;
          const ts = r.sendDate ? parseDate(r.sendDate)?.getTime() ?? null : null;
          return ts !== null && ts <= now;
        });

        // Badge always reflects the due count (or cleared).
        if (prefs.reminderBadge && prefs.remindersEnabled) {
          if (due.length > 0) await setAppBadge(due.length);
          else await clearAppBadge();
        } else {
          await clearAppBadge();
        }

        if (!prefs.remindersEnabled || due.length === 0) return;
        const fresh = due.filter(r => !notifiedThisSession.has(r.id) && isReminderKindAllowed(settings, r.type));
        if (fresh.length === 0) return;

        let sounded = false;
        for (const r of fresh) {
          notifiedThisSession.add(r.id);
          const ok = await showSystemNotice(
            { id: r.id, title: `🔔 ${r.subject}`, body: `${r.cropPlantName} · due ${r.sendDate}${r.body ? ` — ${r.body}` : ''}` },
            { silent: !prefs.reminderSound, vibrate: prefs.reminderVibrate },
          );
          if (ok && prefs.reminderSound && !sounded) {
            sounded = true;
            await playTone(prefs.reminderTone);
          }
          if (stopped) break;
        }
      } catch (e) {
        console.error('[notify] due sweep failed', { e });
      }
    }

    void sweep();
    timer.current = window.setInterval(sweep, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void sweep(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      if (timer.current !== null) window.clearInterval(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [settings]);
}
