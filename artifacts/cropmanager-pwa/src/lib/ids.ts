export type IdPrefix = 'CROP' | 'PROP' | 'REM' | 'SL' | 'HL' | 'TL' | 'BL' | 'CA' | 'PA' | 'CS' | 'CT' | 'ACT' | 'LED' | 'FA' | 'LD' | 'DE' | 'INV' | 'TR';

export function generateId(prefix: IdPrefix): string {
  // Large random suffix: bulkAdd creates many records within the same millisecond,
  // and a small range (e.g. 0-999) risks duplicate primary keys → BulkError.
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}
