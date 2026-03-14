import type { FertDatabase, FertCropEntry } from '../types';

let _cache: FertDatabase | null = null;
const LS_FERT_DB_KEY = 'fert_db_override_v1';

export async function loadFertDatabase(): Promise<FertDatabase> {
  if (_cache) return _cache;
  const res = await fetch('/data/fertilizer_schedule.json');
  if (!res.ok) throw new Error('Failed to load fertilizer_schedule.json');
  const base = await res.json();
  try {
    const raw = localStorage.getItem(LS_FERT_DB_KEY);
    if (raw) {
      const override = JSON.parse(raw);
      _cache = override;
      return _cache!;
    }
  } catch {}
  _cache = base;
  return _cache!;
}

/** Returns all crop entries sorted by display_name */
export function getFertCrops(db: FertDatabase): Array<{ key: string; entry: FertCropEntry }> {
  return Object.entries(db.crops)
    .map(([key, entry]) => ({ key, entry }))
    .sort((a, b) => a.entry.display_name.localeCompare(b.entry.display_name));
}

export function saveFertDatabaseOverride(db: FertDatabase) {
  localStorage.setItem(LS_FERT_DB_KEY, JSON.stringify(db));
  _cache = db;
}

export function clearFertDatabaseOverride() {
  localStorage.removeItem(LS_FERT_DB_KEY);
  _cache = null;
}
