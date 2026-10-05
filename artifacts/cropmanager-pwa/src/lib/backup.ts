import db from '../db/db';

const BACKUP_VERSION = 10;

/**
 * App's own backup sections beyond Dexie rows: settings + localStorage
 * overrides (crop/fert DB edits, treatment presets/history/customs) so a
 * restore on a new device brings back behavior AND learning, not just rows.
 */
const LS_KEYS = [
  'cropmanager_settings',
  'crop_db_override_v1',
  'fert_db_override_v1',
  'tar_presets',
  'tar_history',
  'tar_custom',
] as const;

function readLocalStorage(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const k of LS_KEYS) {
      const v = localStorage.getItem(k);
      if (v !== null) out[k] = v;
    }
  } catch { /* private mode */ }
  return out;
}

function writeLocalStorage(section: unknown): number {
  if (typeof section !== 'object' || section === null) return 0;
  let n = 0;
  try {
    for (const [k, v] of Object.entries(section as Record<string, unknown>)) {
      if (!(LS_KEYS as readonly string[]).includes(k) || typeof v !== 'string') continue;
      localStorage.setItem(k, v);
      n++;
    }
  } catch { /* quota/private mode */ }
  return n;
}

export async function exportJsonBackup(): Promise<string> {
  const [
    crops, propagations, reminders, stageLogs, harvestLogs, treatmentLogs,
    cropDbAdjustments, propDbAdjustments, batchPlantingLogs, cropSearchLogs,
    successionGaps, activities, ledgerEntries, farmLands, farmAreas, diaryEntries,
    posSales, posCustomers, posSettings, posInventory, posOrders, posHeldReceipts,
    microModels, observationLogs, personalCropDb, trackings, trackingEntries, observationEntries, quickNotes,
  ] = await Promise.all([
    db.crops.toArray(),
    db.propagations.toArray(),
    db.reminders.toArray(),
    db.stageLogs.toArray(),
    db.harvestLogs.toArray(),
    db.treatmentLogs.toArray(),
    db.cropDbAdjustments.toArray(),
    db.propDbAdjustments.toArray(),
    db.batchPlantingLogs.toArray(),
    db.cropSearchLogs.toArray(),
    db.successionGaps.toArray(),
    db.activities.toArray(),
    db.ledgerEntries.toArray(),
    db.farmLands.toArray(),
    db.farmAreas.toArray(),
    db.diaryEntries.toArray(),
    db.posSales.toArray(),
    db.posCustomers.toArray(),
    db.posSettings.toArray(),
    db.posInventory.toArray(),
    db.posOrders.toArray(),
    db.posHeldReceipts.toArray(),
    db.microModels.toArray(),
    db.observationLogs.toArray(),
    db.personalCropDb.toArray(),
    db.trackings.toArray(),
    db.trackingEntries.toArray(),
    db.observationEntries.toArray(),
    db.quickNotes.toArray(),
  ]);
  const localStorageSection = readLocalStorage();
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    version: BACKUP_VERSION,
    app: 'cropmanager',
    crops, propagations, reminders, stageLogs, harvestLogs, treatmentLogs,
    cropDbAdjustments, propDbAdjustments, batchPlantingLogs, cropSearchLogs,
    successionGaps, activities, ledgerEntries, farmLands, farmAreas, diaryEntries,
    posSales, posCustomers, posSettings, posInventory, posOrders, posHeldReceipts,
    microModels, observationLogs, personalCropDb, trackings, trackingEntries, observationEntries, quickNotes,
    localStorage: localStorageSection,
  }, null, 2);
}

type BackupPayload = {
  exportedAt?: string;
  version?: number;
  [key: string]: unknown;
};

const TABLE_NAMES = [
  'crops', 'propagations', 'reminders', 'stageLogs', 'harvestLogs', 'treatmentLogs',
  'cropDbAdjustments', 'propDbAdjustments', 'batchPlantingLogs', 'cropSearchLogs',
  'successionGaps', 'activities', 'ledgerEntries', 'farmLands', 'farmAreas', 'diaryEntries',
  'posSales', 'posCustomers', 'posSettings', 'posInventory', 'posOrders', 'posHeldReceipts',
  'microModels', 'observationLogs', 'personalCropDb', 'trackings', 'trackingEntries', 'observationEntries', 'quickNotes',
] as const;

function getTable(name: (typeof TABLE_NAMES)[number]) {
  return (db as unknown as Record<string, { clear: () => Promise<void>; bulkPut: (items: unknown[]) => Promise<unknown> } | undefined>)[name];
}

function rowKey(row: unknown): string | number | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  const id = r['id'] ?? r['key'];
  return typeof id === 'string' || typeof id === 'number' ? id : null;
}

export async function importJsonBackupFromString(json: string): Promise<{ counts: Record<string, number>; skipped: number; localStorageRestored: number }> {
  let data: BackupPayload;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON in backup file');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Invalid backup payload');
  }
  if (data.version !== undefined && ![6, 7, 8, 9, BACKUP_VERSION].includes(data.version)) {
    throw new Error(`Unsupported backup version ${String(data.version)} (expected 6-9 or ${BACKUP_VERSION})`);
  }
  const counts: Record<string, number> = {};
  let skipped = 0;
  const tables = TABLE_NAMES.map(name => getTable(name)).filter((t): t is NonNullable<typeof t> => !!t);
  // Single transaction: all-or-nothing restore. Tables present in the backup
  // are mirrored (cleared then re-added, so empty arrays clear stale rows);
  // tables absent from the backup are left untouched. bulkPut (upsert) is used
  // so duplicate ids merge instead of throwing BulkError.
  await db.transaction('rw', tables as never, async () => {
    for (const name of TABLE_NAMES) {
      const table = getTable(name);
      if (!table) continue;
      const raw = data[name];
      if (!Array.isArray(raw)) continue; // table absent from backup → leave local rows alone
      const items = raw.filter(r => {
        const keep = rowKey(r) !== null;
        if (!keep) skipped++;
        return keep;
      }).map(r => {
        // personalCropDb keys are lowercase lookups — normalize legacy casing.
        if (name === 'personalCropDb' && typeof r === 'object' && r !== null) {
          const rec = r as Record<string, unknown>;
          if (typeof rec['key'] === 'string') return { ...rec, key: (rec['key'] as string).toLowerCase() };
        }
        return r;
      });
      await table.clear();
      if (items.length > 0) {
        // bulkPut (upsert) inside the transaction: duplicate ids merge instead of throwing BulkError
        await table.bulkPut(items);
      }
      counts[name] = items.length;
    }
  });
  const localStorageRestored = writeLocalStorage(data['localStorage']);
  return { counts, skipped, localStorageRestored };
}

export async function importJsonBackupFromFile(file: File): Promise<{ counts: Record<string, number>; skipped: number; localStorageRestored: number }> {
  const text = await file.text();
  return importJsonBackupFromString(text);
}
