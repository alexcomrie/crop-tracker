import type { CropDatabase, CropData } from '../types';

let _cache: CropDatabase | null = null;
const LS_CROP_DB_KEY = 'crop_db_override_v1';

export async function loadCropDatabase(): Promise<CropDatabase> {
  if (_cache) return _cache;
  const res = await fetch('/data/crop_database.json');
  if (!res.ok) throw new Error('Failed to load crop_database.json');
  const base = await res.json();
  try {
    const raw = localStorage.getItem(LS_CROP_DB_KEY);
    if (raw) {
      const override = JSON.parse(raw);
      _cache = override;
      return _cache!;
    }
  } catch {}
  _cache = base;
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

export function saveCropDatabaseOverride(db: CropDatabase) {
  localStorage.setItem(LS_CROP_DB_KEY, JSON.stringify(db));
  _cache = db;
}

export function clearCropDatabaseOverride() {
  localStorage.removeItem(LS_CROP_DB_KEY);
  _cache = null;
}
