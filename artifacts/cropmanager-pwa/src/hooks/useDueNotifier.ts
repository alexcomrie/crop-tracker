import { useEffect, useRef } from 'react';
import db from '../db/db';
import { parseDate, today } from '../lib/dates';
import { useAppStore, withReminderDefaults, isReminderKindAllowed } from '../store/useAppStore';
import { showSystemNotice, playTone, setAppBadge, clearAppBadge } from '../lib/notify';
import { loadDismissedIds, markDismissed } from '../lib/reminderNotifications';

/**
 * Due-reminder sweeper: on launch and every minute, posts system
 * notifications (status-bar icon included) for unsent reminders whose date
 * has arrived, honours Settings (master switch + per-type), and keeps the
 * app-icon badge in sync with the due count.
 *
 * Dismissals persist in localStorage by reminder id (see
 * lib/reminderNotifications) so pull-to-refresh / re-opening the app can't
 * resurrect a cleared reminder. Old backlog is badged but never re-alerted.
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
        const all = await db.reminders.where('sendDate').above('').toArray().catch((): import('../types').Reminder[] => []);
        // One row per reminder "slot" so duplicate generated rows can't stack
        // alerts or inflate the badge.
        const seen = new Set<string>();
        const due = all.filter(r => {
          if (r.sent) return false;
          const ts = r.sendDate ? parseDate(r.sendDate)?.getTime() ?? null : null;
          if (ts === null || ts > now) return false;
          const key = `${r.type}|${r.trackingId}|${r.subject}|${r.sendDate}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Badge always reflects the due count (or cleared).
        if (prefs.reminderBadge && prefs.remindersEnabled) {
          if (due.length > 0) await setAppBadge(due.length);
          else await clearAppBadge();
        } else {
          await clearAppBadge();
        }

        if (!prefs.remindersEnabled || due.length === 0) return;
        // Only alert for items due within the last 30 days so old schedules
        // can't flood the shade; they stay badged + listed in Reminders.
        const cutoff = now - 30 * 86400000;
        const dismissed = loadDismissedIds();
        const fresh = due.filter(r => {
          if (dismissed.has(r.id) || !isReminderKindAllowed(settings, r.type)) return false;
          const ts = r.sendDate ? parseDate(r.sendDate)?.getTime() ?? 0 : 0;
          return ts >= cutoff;
        });
        if (fresh.length === 0) return;

        // Cap: 3 individual alerts + one summary, never a wall of popups.
        const MAX_ALERTS = 3;
        const shown = fresh.slice(0, MAX_ALERTS);
        let sounded = false;
        for (const r of shown) {
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
        if (fresh.length > MAX_ALERTS && !stopped) {
          await showSystemNotice(
            { id: 'more', title: `🔔 ${fresh.length - MAX_ALERTS} more reminders due`, body: 'Open Reminders to review them.' },
            { silent: !prefs.reminderSound, vibrate: false },
          );
        }
        // Remember even the capped-out ids: the summary covers them, and they
        // must not individually pop later.
        markDismissed(shown.map(r => r.id));
        if (fresh.length > MAX_ALERTS) markDismissed(fresh.map(r => r.id));
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
