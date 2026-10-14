import type { ReminderTone } from '../types';

export async function setAppBadge(count: number) {
  const anyNav = navigator as any;
  try {
    if (typeof anyNav.setAppBadge === 'function') {
      await anyNav.setAppBadge(count);
    }
  } catch {}
}

export async function clearAppBadge() {
  const anyNav = navigator as any;
  try {
    if (typeof anyNav.clearAppBadge === 'function') {
      await anyNav.clearAppBadge();
    }
  } catch {}
}

function beep(freq: number, at: number, dur: number, ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.value = 0.0001;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + at);
  gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
  osc.stop(ctx.currentTime + at + dur + 0.05);
}

/** Built-in reminder tones (WebAudio — no files needed). */
export async function playTone(tone: ReminderTone = 'chime') {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (tone === 'chime') beep(880, 0, 0.3, ctx);
    else if (tone === 'double') { beep(660, 0, 0.2, ctx); beep(880, 0.22, 0.3, ctx); }
    else { beep(440, 0, 0.4, ctx); }
    setTimeout(() => ctx.close(), 900);
  } catch {}
}

/** Backwards-compatible single beep. */
export async function playAlert() {
  return playTone('chime');
}

export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function notifyPermission(): NotifyPermission {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission as NotifyPermission;
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    return (await Notification.requestPermission()) as NotifyPermission;
  } catch {
    return Notification.permission as NotifyPermission;
  }
}

function iconUrl(): string {
  const base = (import.meta.env.BASE_URL as string | undefined) || '/';
  return `${base.endsWith('/') ? base : `${base}/`}icons/icon-192.png`;
}

export interface DueNotice {
  id: string;
  title: string;
  body: string;
}

/**
 * System notification via the registered service worker — this is what puts
 * the app icon in the status bar / notification shade. Falls back to a plain
 * Notification when no service worker is active. Resolves false when blocked.
 */
export async function showSystemNotice(n: DueNotice, opts?: { silent?: boolean; vibrate?: boolean }): Promise<boolean> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const icon = iconUrl();
  const init: NotificationOptions & { vibrate?: number[] } = {
    body: n.body,
    icon,
    badge: icon,
    tag: `reminder-${n.id}`,
    silent: opts?.silent ?? false,
    vibrate: opts?.vibrate === false ? undefined : [200, 100, 200],
  };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(n.title, init);
      return true;
    }
    // eslint-disable-next-line no-new
    new Notification(n.title, init);
    return true;
  } catch {
    return false;
  }
}
