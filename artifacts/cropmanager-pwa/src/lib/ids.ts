export type IdPrefix = 'CROP' | 'PROP' | 'REM' | 'SL' | 'HL' | 'TL' | 'BL' | 'CA' | 'PA' | 'CS' | 'CT';

export function generateId(prefix: IdPrefix): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}
