import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';

/** Currency symbol from POS settings (falls back to $). */
export function usePosCurrency(): string {
  const rows = useLiveQuery(() => db.posSettings.toArray(), []);
  const cur = rows?.[0]?.currency;
  return typeof cur === 'string' && cur ? cur : '$';
}

/** Format money with the POS currency, e.g. fmtMoney(8, 'J$') → "J$8.00". */
export function fmtMoney(n: number, cur = '$'): string {
  const v = Number(n);
  const safe = Number.isFinite(v) ? v : 0;
  return `${cur}${safe.toFixed(2)}`;
}
