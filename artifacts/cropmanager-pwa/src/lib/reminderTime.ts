import { addDays, formatDateShort, today } from './dates';

/**
 * Smart wait-duration model. Stored as plain total days; displayed stepped:
 * days → weeks+days (1w 3d) → months+weeks+days (1m 1w 2d).
 * Uses 7d = 1w and 4w = 1m so the picker stays compact.
 */
export interface DurationParts { months: number; weeks: number; days: number }

export function daysToParts(total: number): DurationParts {
  const t = Math.max(0, Math.round(total));
  const months = Math.floor(t / 28);
  const weeks = Math.floor((t % 28) / 7);
  const days = t % 7;
  return { months, weeks, days };
}

export function partsToDays(p: DurationParts): number {
  return (
    Math.max(0, Math.floor(p.months)) * 28 +
    Math.max(0, Math.floor(p.weeks)) * 7 +
    Math.max(0, Math.floor(p.days))
  );
}

/** Compact label: "2d", "1w 3d", "1m", "1m 1w 2d". Zero → "today". */
export function formatDuration(total: number): string {
  const t = Math.max(0, Math.round(total));
  if (t === 0) return 'today';
  const { months, weeks, days } = daysToParts(t);
  const bits: string[] = [];
  if (months) bits.push(`${months}m`);
  if (weeks) bits.push(`${weeks}w`);
  if (days || bits.length === 0) bits.push(`${days}d`);
  return bits.join(' ');
}

/** Target date string for "in N days" from today. */
export function durationToDate(total: number): string {
  return formatDateShort(addDays(today(), Math.max(0, Math.round(total))));
}
