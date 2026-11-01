import type { AppSettings } from '../types';

/** Rolling window for farmer name changes. */
export const NAME_CHANGE_WINDOW_DAYS = 30;
/** How many name changes are allowed inside that window. */
export const NAME_CHANGE_LIMIT = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

function randomCode(): string {
  // Crockford-style base36, upper case, no ambiguous characters.
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Permanent farmer ID. Generated once per install and then never changed,
 * even when the display name changes — it is the stable key for a farmer.
 */
export function generateFarmerId(): string {
  const year = new Date().getFullYear();
  return `FM-${year}-${randomCode()}`;
}

/** Ensure the settings object has a farmer ID, mutating via updateSettings. */
export function ensureFarmerId(settings: AppSettings): string {
  return settings.farmerId || generateFarmerId();
}

function history(settings: AppSettings): number[] {
  return Array.isArray(settings.farmerNameHistory) ? settings.farmerNameHistory : [];
}

/** Name changes still inside the rolling window, oldest first. */
export function changesInWindow(settings: AppSettings, now = Date.now()): number[] {
  const cutoff = now - NAME_CHANGE_WINDOW_DAYS * DAY_MS;
  return history(settings).filter(ts => ts > cutoff);
}

export function remainingNameChanges(settings: AppSettings, now = Date.now()): number {
  return Math.max(0, NAME_CHANGE_LIMIT - changesInWindow(settings, now).length);
}

/** Milliseconds until the next name change becomes available (0 if allowed). */
export function nameChangeAvailableIn(settings: AppSettings, now = Date.now()): number {
  const inWindow = changesInWindow(settings, now);
  if (inWindow.length < NAME_CHANGE_LIMIT) return 0;
  // The oldest change inside the window has to age out before another is allowed.
  const oldest = Math.min(...inWindow);
  return Math.max(0, oldest + NAME_CHANGE_WINDOW_DAYS * DAY_MS - now);
}

export function canChangeName(settings: AppSettings, now = Date.now()): boolean {
  return remainingNameChanges(settings, now) > 0;
}

export function formatWait(ms: number): string {
  if (ms <= 0) return 'now';
  const days = Math.ceil(ms / DAY_MS);
  if (days <= 1) {
    const hours = Math.ceil(ms / (60 * 60 * 1000));
    return hours <= 1 ? 'in under an hour' : `in about ${hours} hours`;
  }
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

/** Return the settings patch for a name change, or null when the limit is hit. */
export function recordNameChange(
  settings: AppSettings,
  newName: string,
  now = Date.now(),
): Partial<AppSettings> | null {
  const trimmed = newName.trim();
  if (!trimmed) return null;
  if (trimmed === (settings.farmerName ?? '').trim()) return {};
  if (!canChangeName(settings, now)) return null;
  return {
    farmerName: trimmed,
    farmerNameHistory: [...changesInWindow(settings, now), now],
  };
}

export function farmerDisplayName(settings: AppSettings): string {
  return settings.farmerName?.trim() || 'Farmer';
}
