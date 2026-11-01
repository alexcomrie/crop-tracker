import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { DEFAULT_PRINT_SETTINGS, type PrintSettings } from './receiptPrinter';

/** Currency symbol from POS settings (falls back to $). */
export function usePosCurrency(): string {
  const rows = useLiveQuery(() => db.posSettings.toArray(), []);
  const cur = rows?.[0]?.currency;
  return typeof cur === 'string' && cur ? cur : '$';
}

/** Print settings for receipt previews, with defaults for new installs. */
export function usePosPrintSettings(): PrintSettings {
  const rows = useLiveQuery(() => db.posSettings.toArray(), []);
  const saved = rows?.[0];
  if (!saved) return DEFAULT_PRINT_SETTINGS;
  return {
    businessName: saved.businessName || DEFAULT_PRINT_SETTINGS.businessName,
    businessAddress: saved.businessAddress || '',
    businessPhone: saved.businessPhone || '',
    businessEmail: saved.businessEmail || '',
    taxLabel: saved.taxLabel || DEFAULT_PRINT_SETTINGS.taxLabel,
    taxRate: Number.isFinite(saved.taxRate) ? saved.taxRate : 0,
    currency: saved.currency || '$',
    receiptFooter: saved.receiptFooter || DEFAULT_PRINT_SETTINGS.receiptFooter,
    logoDataUrl: saved.logoDataUrl || '',
    showLogo: saved.showLogo ?? true,
    showTax: saved.showTax ?? true,
    showCustomer: saved.showCustomer ?? true,
    printWidth: saved.printWidth || DEFAULT_PRINT_SETTINGS.printWidth,
    printCharPerLine: saved.printCharPerLine || DEFAULT_PRINT_SETTINGS.printCharPerLine,
  };
}

/** Format money with the POS currency, e.g. fmtMoney(8, 'J$') → "J$8.00". */
export function fmtMoney(n: number, cur = '$'): string {
  const v = Number(n);
  const safe = Number.isFinite(v) ? v : 0;
  return `${cur}${safe.toFixed(2)}`;
}
