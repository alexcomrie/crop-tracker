import { ALL_PRODUCTS, type TreatmentProduct } from '../components/treatment/treatment-data';
import { TREATMENT_GUIDES, fallbackGuide, type TreatmentGuide } from '../components/treatment/treatment-guides';

export interface TreatmentEntry extends TreatmentProduct, TreatmentGuide {
  source?: 'builtin' | 'sheet' | 'custom';
  updatedAt?: number;
}

export interface TreatmentDatabase {
  version: number;
  updatedAt: string;
  /** Where the sheet lives, shown in the sync banner. */
  source?: string;
  entries: TreatmentEntry[];
}

export interface LoadedTreatmentDb {
  database: TreatmentDatabase;
  fromCache: boolean;
  error: string | null;
}

const CACHE_KEY = 'cropmanager_treatment_db_v1';
const CACHE_TTL = 24 * 60 * 60 * 1000; // daily sync
const FETCH_TIMEOUT = 15000;

interface CacheShape {
  database: TreatmentDatabase;
  fetchedAt: number;
}

function baseUrl(): string {
  const base = (import.meta.env.BASE_URL as string | undefined) || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

export function builtinTreatmentEntries(): TreatmentEntry[] {
  return ALL_PRODUCTS.map(product => ({
    ...product,
    ...(TREATMENT_GUIDES[product.id] ?? fallbackGuide(product.category)),
    source: 'builtin' as const,
  }));
}

/** Accept sheet rows with slightly different column names. */
function normaliseEntry(raw: unknown): TreatmentEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = String(r.name ?? r.product ?? r.Product ?? '').trim();
  if (!name) return null;

  const categoryRaw = String(r.category ?? r.type ?? 'Other');
  const category: TreatmentProduct['category'] =
    /fung/i.test(categoryRaw) ? 'Fungicide'
      : /insect/i.test(categoryRaw) ? 'Insecticide'
        : /herb/i.test(categoryRaw) ? 'Herbicide'
          : /fert/i.test(categoryRaw) ? 'Fertilizer'
            : 'Other';

  const classRaw = String(r.classification ?? r['mode of action'] ?? r.mode ?? 'Contact');
  const classification: TreatmentProduct['classification'] =
    /system/i.test(classRaw) ? 'Systemic' : /both/i.test(classRaw) ? 'Both' : 'Contact';

  const rawRates = Array.isArray(r.rates) ? r.rates : [];
  const rates: TreatmentProduct['rates'] = rawRates
    .map((rate): TreatmentProduct['rates'][number] | null => {
      if (!rate || typeof rate !== 'object') return null;
      const x = rate as Record<string, unknown>;
      const min = Number(x.min ?? x.rateMin ?? 0);
      const max = Number(x.max ?? x.rateMax ?? min);
      if (!Number.isFinite(min) || min <= 0) return null;
      const unitRaw = String(x.unit ?? 'mL');
      const unit: 'mL' | 'g' | 'L' = unitRaw === 'g' ? 'g' : unitRaw === 'L' ? 'L' : 'mL';
      const perVolume = Number(x.perVolume ?? x.per ?? 3.8);
      const pvRaw = String(x.perVolumeUnit ?? x.perUnit ?? 'L');
      const perVolumeUnit: 'L' | 'gal' | 'ha' = pvRaw === 'gal' ? 'gal' : pvRaw === 'ha' ? 'ha' : 'L';
      return {
        label: String(x.label ?? 'Standard'),
        min,
        max: Number.isFinite(max) && max >= min ? max : min,
        unit,
        perVolume: Number.isFinite(perVolume) && perVolume > 0 ? perVolume : 3.8,
        perVolumeUnit,
        notes: x.notes ? String(x.notes) : undefined,
      };
    })
    .filter((x): x is TreatmentProduct['rates'][number] => x !== null);

  if (rates.length === 0) return null;

  const split = (v: unknown): string[] | undefined => {
    if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
    if (typeof v === 'string' && v.trim()) return v.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
    return undefined;
  };

  const asNumber = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  return {
    id: String(r.id ?? `sheet_${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`),
    name,
    category,
    classification,
    rates,
    activeIngredient: r.activeIngredient ? String(r.activeIngredient) : undefined,
    crops: split(r.crops),
    targets: split(r.targets ?? r.pests ?? r.diseases),
    reiHours: asNumber(r.reiHours ?? r.rei),
    phiDays: asNumber(r.phiDays ?? r.phi),
    guide: r.guide ? String(r.guide) : r.usage ? String(r.usage) : undefined,
    warnings: r.warnings ? String(r.warnings) : r.safety ? String(r.safety) : undefined,
    imageUrl: r.imageUrl ? String(r.imageUrl) : undefined,
    notes: r.notes ? String(r.notes) : undefined,
    source: 'sheet',
    updatedAt: asNumber(r.updatedAt) ?? Date.now(),
  };
}

export function normaliseTreatmentDatabase(raw: unknown): TreatmentDatabase | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const list = Array.isArray(r.entries) ? r.entries : Array.isArray(r.products) ? r.products : Array.isArray(raw) ? raw : null;
  if (!list) return null;
  const entries = list.map(normaliseEntry).filter((e): e is TreatmentEntry => e !== null);
  if (entries.length === 0) return null;
  return {
    version: Number(r.version ?? 1) || 1,
    updatedAt: String(r.updatedAt ?? r.updated_at ?? new Date().toISOString()),
    source: r.source ? String(r.source) : undefined,
    entries,
  };
}

function readCache(): CacheShape | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (!parsed?.database?.entries?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getCachedTreatmentDatabase(): TreatmentDatabase | null {
  return readCache()?.database ?? null;
}

export function treatmentCacheAge(): number | null {
  const cache = readCache();
  if (!cache) return null;
  return Date.now() - cache.fetchedAt;
}

function writeCache(database: TreatmentDatabase) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ database, fetchedAt: Date.now() } satisfies CacheShape));
  } catch {
    // Storage full — the in-memory result still works for this session.
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Loads the shared treatment database. Tries the API server first (which can
 * proxy the Google Sheet/GAS endpoint), then the bundled static file.
 * The result is cached for 24 hours so the daily sync is one small request.
 */
export async function loadTreatmentDatabase(opts?: { force?: boolean }): Promise<LoadedTreatmentDb> {
  const cache = readCache();
  if (cache && !opts?.force && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return { database: cache.database, fromCache: true, error: null };
  }

  const candidates = ['/api/treatment-db', `${baseUrl()}data/treatment_database.json`];
  let lastError: string | null = null;

  for (const url of candidates) {
    try {
      const raw = await fetchJson(url);
      const payload = raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)
        ? (raw as Record<string, unknown>).data
        : raw;
      const database = normaliseTreatmentDatabase(payload);
      if (!database) throw new Error('response did not contain products');
      writeCache(database);
      return { database, fromCache: false, error: null };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  // Offline / all endpoints failed: use stale cache if present, else built-ins.
  if (cache) return { database: cache.database, fromCache: true, error: lastError };
  const database: TreatmentDatabase = {
    version: 1,
    updatedAt: new Date().toISOString(),
    source: 'built-in',
    entries: builtinTreatmentEntries(),
  };
  return { database, fromCache: false, error: lastError };
}

export function clearTreatmentCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

/** Merge products the user added manually with the shared database. */
export function mergeCustomProducts(entries: TreatmentEntry[], custom: TreatmentProduct[]): TreatmentEntry[] {
  const byId = new Map(entries.map(e => [e.id, e]));
  for (const product of custom) {
    byId.set(product.id, {
      ...product,
      ...fallbackGuide(product.category),
      source: 'custom',
      updatedAt: Date.now(),
    });
  }
  return Array.from(byId.values());
}
