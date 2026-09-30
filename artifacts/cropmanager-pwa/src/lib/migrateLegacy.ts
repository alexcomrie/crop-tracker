/**
 * Legacy database migration.
 *
 * Older app versions stored everything in IndexedDB databases named
 * `CropManagerDB` (all released versions), `CropManagerDB_v2` or
 * `CropManagerDB_v3` (intermediate builds). The current code opens
 * `CropManagerDB_v4`, so without this step an update would strand all
 * existing data in the old database and start empty.
 *
 * Runs once per device (localStorage flag): copies every known table from
 * each legacy database via the native IndexedDB API (no schema knowledge
 * needed, works across all old Dexie versions), normalizes records to the
 * current format, upserts them into the new tables, verifies row counts,
 * and only then deletes the legacy database.
 */
import Dexie from 'dexie';
import db from '../db/db';

const FLAG = 'cropmanager_legacy_migrated_v4';

// Oldest first so newer data wins on id conflicts (bulkPut overwrites).
const LEGACY_DB_NAMES = ['CropManagerDB', 'CropManagerDB_v2', 'CropManagerDB_v3'];

// Tables in the current schema. Legacy DBs simply won't contain the newer ones.
const TABLES = [
  'crops', 'propagations', 'reminders', 'stageLogs', 'harvestLogs', 'treatmentLogs',
  'cropDbAdjustments', 'propDbAdjustments', 'batchPlantingLogs', 'cropSearchLogs',
  'successionGaps', 'activities', 'ledgerEntries', 'farmLands', 'farmAreas', 'diaryEntries',
  'posSales', 'posCustomers', 'posSettings', 'posInventory', 'posOrders', 'posHeldReceipts',
  'microModels', 'observationLogs', 'personalCropDb', 'trackings', 'trackingEntries',
] as const;

type Row = Record<string, unknown>;

const str = (v: unknown, fb = ''): string => (typeof v === 'string' ? v : fb);
const num = (v: unknown, fb: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
const bool = (v: unknown): boolean => v === true || v === 1;

function readStoreNative(dbName: string, storeName: string): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(dbName);
    } catch (e) {
      reject(e);
      return;
    }
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error(`Database ${dbName} is blocked (open in another tab?)`));
    req.onsuccess = () => {
      const idb = req.result;
      try {
        if (!idb.objectStoreNames.contains(storeName)) {
          idb.close();
          resolve([]);
          return;
        }
        const tx = idb.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const getAll = store.getAll();
        getAll.onsuccess = () => {
          const rows = (getAll.result as Row[]) ?? [];
          idb.close();
          resolve(rows);
        };
        getAll.onerror = () => {
          idb.close();
          reject(getAll.error);
        };
      } catch (e) {
        try { idb.close(); } catch { /* ignore */ }
        reject(e);
      }
    };
  });
}

function deleteDatabaseNative(dbName: string): Promise<void> {
  return new Promise(resolve => {
    try {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve(); // best effort — stale data is harmless
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

const VALID_STATUSES = new Set(['Active', 'Harvested', 'Deleted', 'Archived']);

/** Normalize one legacy record to the current format. Returns null to skip. */
function normalize(table: string, row: Row, index: number): Row | null {
  if (typeof row !== 'object' || row === null) return null;
  const r: Row = { ...row };
  const now = Date.now();

  // Primary key must exist and be a valid IndexedDB key
  if (table === 'personalCropDb') {
    const key = str(r['key'], '').toLowerCase().trim();
    if (!key) return null;
    r['key'] = key;
    r['growingTimeDays'] = num(r['growingTimeDays'], 60);
    r['sampleCount'] = num(r['sampleCount'], 0);
    r['updatedAt'] = num(r['updatedAt'], now);
    return r;
  }
  if (table === 'posSettings' && (r['id'] === undefined || r['id'] === null)) {
    r['id'] = 'default';
  }
  if (typeof r['id'] !== 'string' && typeof r['id'] !== 'number') {
    // Unqueryable without a key — assign a fallback id rather than drop user data
    r['id'] = `MIG_${table}_${now}_${index}`;
  }
  if (typeof r['updatedAt'] !== 'number') r['updatedAt'] = num(r['updatedAt'], now);

  switch (table) {
    case 'crops':
      r['status'] = VALID_STATUSES.has(r['status'] as string) ? r['status'] : 'Active';
      r['plantStage'] = str(r['plantStage'], 'Seed');
      // Indexed field: never undefined/null (IndexedDB rejects them as keys)
      if (r['parentCropId'] === undefined || r['parentCropId'] === null) r['parentCropId'] = '';
      r['isContinuous'] = bool(r['isContinuous']);
      if (r['archivedFrom'] !== undefined && typeof r['archivedFrom'] !== 'string') delete r['archivedFrom'];
      break;
    case 'propagations':
      r['status'] = str(r['status'], 'Propagating');
      if (r['archivedFrom'] !== undefined && typeof r['archivedFrom'] !== 'string') delete r['archivedFrom'];
      break;
    case 'reminders':
      // Indexed field: undefined/null would crash IDBKeyRange on query
      r['sendDate'] = typeof r['sendDate'] === 'string' ? r['sendDate'] : '';
      r['sent'] = bool(r['sent']);
      r['type'] = str(r['type']);
      r['trackingId'] = str(r['trackingId']);
      break;
    case 'stageLogs':
    case 'treatmentLogs':
    case 'observationLogs':
      r['date'] = str(r['date']);
      break;
    case 'harvestLogs':
      r['harvestDate'] = str(r['harvestDate']);
      break;
    case 'batchPlantingLogs':
      r['status'] = str(r['status']);
      break;
    case 'activities':
      r['date'] = str(r['date']);
      if (!Array.isArray(r['cropIds'])) r['cropIds'] = [];
      break;
    default:
      break;
  }
  return r;
}

export async function migrateLegacyDatabases(): Promise<{ migrated: boolean; tables: number; rows: number }> {
  try {
    if (typeof window === 'undefined' || !('indexedDB' in window)) return { migrated: false, tables: 0, rows: 0 };
    if (localStorage.getItem(FLAG) === '1') return { migrated: false, tables: 0, rows: 0 };
  } catch {
    return { migrated: false, tables: 0, rows: 0 };
  }

  let tables = 0;
  let rows = 0;
  try {
    for (const legacyName of LEGACY_DB_NAMES) {
      let exists = false;
      try {
        exists = await Dexie.exists(legacyName);
      } catch {
        continue;
      }
      if (!exists) continue;

      // Count source rows per table first (for post-import verification)
      const sourceCounts = new Map<string, number>();
      const payload = new Map<string, Row[]>();
      for (const table of TABLES) {
        let raw: Row[] = [];
        try {
          raw = await readStoreNative(legacyName, table);
        } catch (e) {
          console.warn(`[migrate] could not read ${legacyName}.${table}`, e);
          continue;
        }
        if (raw.length === 0) continue;
        const clean = raw
          .map((r, i) => normalize(table, r, i))
          .filter((r): r is Row => r !== null);
        if (clean.length === 0) continue;
        payload.set(table, clean);
        sourceCounts.set(table, clean.length);
      }
      if (payload.size === 0) {
        await deleteDatabaseNative(legacyName);
        continue;
      }

      // Upsert into the new tables (id-keyed: idempotent, safe to re-run)
      for (const [table, clean] of payload) {
        // eslint-disable-next-line no-await-in-loop
        await (db as unknown as Record<string, { bulkPut: (rows: Row[]) => Promise<unknown> }>)[table].bulkPut(clean);
        tables += 1;
        rows += clean.length;
      }

      // Verify before deleting the legacy database
      let verified = true;
      for (const [table, expected] of sourceCounts) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const actual = await (db as unknown as Record<string, { count: () => Promise<number> }>)[table].count();
          if (actual < expected) {
            verified = false;
            console.warn(`[migrate] count mismatch ${table}: source=${expected} dest=${actual}, keeping legacy DB`);
          }
        } catch (e) {
          verified = false;
          console.warn(`[migrate] verify failed for ${table}`, e);
        }
      }
      if (verified) await deleteDatabaseNative(legacyName);
    }
    try {
      localStorage.setItem(FLAG, '1');
    } catch { /* ignore */ }
    if (rows > 0) console.log(`[migrate] legacy migration complete: ${rows} rows across ${tables} tables`);
    return { migrated: rows > 0, tables, rows };
  } catch (e) {
    // Never crash startup: log and continue with whatever is in the new DB
    console.error('[migrate] legacy migration failed (continuing anyway)', e);
    return { migrated: false, tables, rows };
  }
}
