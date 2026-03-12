import { addDays, formatDateShort } from './dates';

export function calcSprayDates(plantingDate: Date, sprayDaysArray: number[]): Date[] {
  return sprayDaysArray.map(days => addDays(plantingDate, days));
}

export function formatSprayDates(dates: Date[]): string {
  return dates.map(d => formatDateShort(d)).join(', ');
}

export function nextSprayDate(datesStr: string, after: Date = new Date()): string {
  if (!datesStr) return '';
  const parts = datesStr.split(',').map(s => s.trim()).filter(Boolean);
  const future = parts.find(s => {
    const [d, m, y] = s.split('-');
    const date = new Date(+y, ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(m), +d);
    return date >= after;
  });
  return future || parts[parts.length - 1] || '';
}
