import db from '../db/db';
import { parseDate, today } from './dates';
import { clearAppBadge } from './notify';

/**
 * Notification dismissal state.
 *
 * `cropmanager_notified_v1` was day-scoped, so a cleared reminder re-alerted
 * the next morning — and reopening the app resurrected the whole backlog.
 * v2 keys dismissals by reminder id and never expires them: once a reminder
 * has been shown (or cleared), it stays quiet until its record id changes.
 */
const DISMISSED_KEY = 'cropmanager_notified_v2';
const CLEARED_THROUGH_KEY = 'cropmanager_cleared_through_v1';
const MAX_IDS = 500;

export function loadDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    // Accept both the v2 array shape and the legacy {ids:[...]} envelope.
    if (Array.isArray(parsed)) return new Set(parsed.filter((id): id is string => typeof id === 'string'));
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { ids?: unknown }).ids)) {
      return new Set(((parsed as { ids: unknown[] }).ids).filter((id): id is string => typeof id === 'string'));
    }
  } catch { /* private mode / corrupted → no memory */ }
  return new Set();
}

export function markDismissed(ids: Iterable<string>): void {
  const next = loadDismissedIds();
  for (const id of ids) if (id) next.add(id);
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next].slice(-MAX_IDS)));
  } catch { /* private mode → memory only */ }
}

export function clearedThrough(): number {
  try {
    const raw = localStorage.getItem(CLEARED_THROUGH_KEY);
    const ts = raw ? Number(raw) : 0;
    return Number.isFinite(ts) ? ts : 0;
  } catch {
    return 0;
  }
}

/** Close any reminder notifications still sitting in the OS shade. */
export async function closeSystemNotices(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg?.getNotifications) return;
    const notices = await reg.getNotifications();
    for (const notice of notices) {
      if (!notice.tag || notice.tag.startsWith('reminder-')) notice.close();
    }
  } catch { /* unsupported browser → nothing to close */ }
}

/**
 * Explicit "clear all" action: marks every past-due reminder done (so it can
 * never re-alert), remembers the ids, closes system notifications and clears
 * the app badge. Returns how many reminders were cleared.
 */
export async function clearAllDueNotifications(): Promise<number> {
  const now = today().getTime();
  const all = await db.reminders.toArray();
  const due = all.filter(r => {
    if (r.sent || !r.sendDate) return false;
    const ts = parseDate(r.sendDate)?.getTime();
    // Strictly before today: today's tasks stay actionable on the dashboard.
    return ts != null && ts < now;
  });

  await Promise.all(due.map(r => db.reminders.update(r.id, { sent: true, updatedAt: Date.now() })));
  markDismissed(due.map(r => r.id));
  try { localStorage.setItem(CLEARED_THROUGH_KEY, String(now)); } catch { /* ignore */ }
  await closeSystemNotices();
  await clearAppBadge();
  return due.length;
}
