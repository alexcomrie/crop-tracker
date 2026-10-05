export type IdPrefix = 'CROP' | 'PROP' | 'REM' | 'SL' | 'HL' | 'TL' | 'BL' | 'CA' | 'PA' | 'CS' | 'CT' | 'ACT' | 'LED' | 'FA' | 'LD' | 'DE' | 'INV' | 'TR';

export function generateId(prefix: IdPrefix): string {
  // Large random suffix: bulkAdd creates many records within the same millisecond,
  // and a small range (e.g. 0-999) risks duplicate primary keys → BulkError.
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}

/**
 * Short human-friendly crop code derived from the long Dexie id.
 * Stable per crop (uses the random suffix tail), e.g. CT_..._123456 → #3456.
 * No schema migration needed — computed on read.
 */
export function shortCropId(id: string): string {
  if (!id) return '#—';
  const tail = id.split('_').pop() ?? id;
  const clean = tail.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (clean.length <= 4) return `#${clean}`;
  return `#${clean.slice(-4)}`;
}
