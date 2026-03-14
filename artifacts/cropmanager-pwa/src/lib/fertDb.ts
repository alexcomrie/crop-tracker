import type { FertDatabase, FertCropEntry } from '../types';

let _cache: FertDatabase | null = null;

export async function loadFertDatabase(): Promise<FertDatabase> {
  if (_cache) return _cache;
  const res = await fetch('/data/fertilizer_schedule.json');
  if (!res.ok) throw new Error('Failed to load fertilizer_schedule.json');
  _cache = await res.json();
  return _cache!;
}

/** Returns all crop entries sorted by display_name */
export function getFertCrops(db: FertDatabase): Array<{ key: string; entry: FertCropEntry }> {
  return Object.entries(db.crops)
    .map(([key, entry]) => ({ key, entry }))
    .sort((a, b) => a.entry.display_name.localeCompare(b.entry.display_name));
}
