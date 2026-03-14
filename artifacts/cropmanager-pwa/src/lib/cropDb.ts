import type { CropDatabase, CropData } from '../types';

let _cache: CropDatabase | null = null;

export async function loadCropDatabase(): Promise<CropDatabase> {
  if (_cache) return _cache;
  const res = await fetch('/data/crop_database.json');
  if (!res.ok) throw new Error('Failed to load crop_database.json');
  _cache = await res.json();
  return _cache!;
}

/** Returns only non-alias entries, sorted alphabetically by display_name */
export function getNonAliasCrops(db: CropDatabase): Array<{ key: string; entry: CropData }> {
  return Object.entries(db)
    .filter(([, v]) => !('alias' in v))
    .map(([key, entry]) => ({ key, entry: entry as CropData }))
    .sort((a, b) => a.entry.display_name.localeCompare(b.entry.display_name));
}

/** Returns alias entries */
export function getAliases(db: CropDatabase): Array<{ key: string; target: string }> {
  return Object.entries(db)
    .filter(([, v]) => 'alias' in v)
    .map(([key, v]) => ({ key, target: (v as { alias: string }).alias }));
}

export function isAlias(record: unknown): record is { alias: string } {
  return typeof record === 'object' && record !== null && 'alias' in record;
}

/** Resolves a key (potentially an alias) to its actual CropData */
export function resolveCropData(db: CropDatabase, key: string): CropData | null {
  const record = db[key.toLowerCase()];
  if (!record) return null;
  if (isAlias(record)) {
    return resolveCropData(db, record.alias);
  }
  return record as CropData;
}
