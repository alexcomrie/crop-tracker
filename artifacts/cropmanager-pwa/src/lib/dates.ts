import { format, parse, addDays as dfAddDays, differenceInDays, parseISO, isValid } from 'date-fns';

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

export function parseDate(str: string): Date | null {
  if (!str || str === '' || str === 'N/A') return null;
  const s = str.trim().toLowerCase();
  if (s === 'today') return new Date();
  if (s === 'yesterday') { const d = new Date(); d.setDate(d.getDate() - 1); return d; }

  // DD-Mon-YYYY
  const ddMonYYYY = /^(\d{1,2})-([a-z]{3})-(\d{4})$/i.exec(str);
  if (ddMonYYYY) {
    const mo = MONTHS[ddMonYYYY[2].toLowerCase()];
    if (mo !== undefined) return new Date(+ddMonYYYY[3], mo, +ddMonYYYY[1]);
  }

  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = parseISO(str);
    if (isValid(d)) return d;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const ddmm = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(str);
  if (ddmm) return new Date(+ddmm[3], +ddmm[2] - 1, +ddmm[1]);

  // Mon DD or DD Mon
  const monParts = s.split(/[\s,]+/);
  if (monParts.length === 2) {
    let mo = -1, day = -1;
    for (const p of monParts) {
      const num = parseInt(p);
      if (!isNaN(num)) day = num;
      else if (MONTHS[p] !== undefined) mo = MONTHS[p];
    }
    if (mo >= 0 && day > 0) return new Date(new Date().getFullYear(), mo, day);
  }

  try {
    const d = new Date(str);
    if (isValid(d)) return d;
  } catch { /* ignore */ }
  return null;
}

export function formatDateShort(date: Date): string {
  return format(date, 'dd-MMM-yyyy');
}

export function formatDateDisplay(date: Date): string {
  return format(date, 'EEE dd MMM yyyy');
}

export function addDays(date: Date, days: number): Date {
  return dfAddDays(date, days);
}

export function daysBetween(a: Date, b: Date): number {
  return differenceInDays(b, a);
}

export function toIsoDateStr(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return toIsoDateStr(a) === toIsoDateStr(b);
}
