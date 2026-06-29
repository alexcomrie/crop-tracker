import db from '../db/db';

export async function exportJsonBackup(): Promise<string> {
  const [crops, propagations, reminders, stageLogs, harvestLogs, treatmentLogs,
    cropDbAdjustments, propDbAdjustments, batchPlantingLogs, cropSearchLogs,
    successionGaps, activities, ledgerEntries, farmLands, farmAreas, diaryEntries] = await Promise.all([
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
  ]);
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    version: 6,
    crops, propagations, reminders, stageLogs, harvestLogs, treatmentLogs,
    cropDbAdjustments, propDbAdjustments, batchPlantingLogs, cropSearchLogs,
    successionGaps, activities, ledgerEntries, farmLands, farmAreas, diaryEntries,
  }, null, 2);
}

type BackupPayload = {
  exportedAt?: string;
  version?: number;
  crops?: any[];
  propagations?: any[];
  reminders?: any[];
  stageLogs?: any[];
  harvestLogs?: any[];
  treatmentLogs?: any[];
  cropDbAdjustments?: any[];
  propDbAdjustments?: any[];
  batchPlantingLogs?: any[];
  cropSearchLogs?: any[];
  successionGaps?: any[];
  activities?: any[];
  ledgerEntries?: any[];
  farmLands?: any[];
  farmAreas?: any[];
  diaryEntries?: any[];
};

const TABLES: { key: keyof BackupPayload; name: string; clear: () => Promise<void>; add: (items: any[]) => Promise<void> }[] = [
  { key: 'crops', name: 'crops', clear: () => db.crops.clear(), add: items => db.crops.bulkAdd(items) },
  { key: 'propagations', name: 'propagations', clear: () => db.propagations.clear(), add: items => db.propagations.bulkAdd(items) },
  { key: 'reminders', name: 'reminders', clear: () => db.reminders.clear(), add: items => db.reminders.bulkAdd(items) },
  { key: 'stageLogs', name: 'stageLogs', clear: () => db.stageLogs.clear(), add: items => db.stageLogs.bulkAdd(items) },
  { key: 'harvestLogs', name: 'harvestLogs', clear: () => db.harvestLogs.clear(), add: items => db.harvestLogs.bulkAdd(items) },
  { key: 'treatmentLogs', name: 'treatmentLogs', clear: () => db.treatmentLogs.clear(), add: items => db.treatmentLogs.bulkAdd(items) },
  { key: 'cropDbAdjustments', name: 'cropDbAdjustments', clear: () => db.cropDbAdjustments.clear(), add: items => db.cropDbAdjustments.bulkAdd(items) },
  { key: 'propDbAdjustments', name: 'propDbAdjustments', clear: () => db.propDbAdjustments.clear(), add: items => db.propDbAdjustments.bulkAdd(items) },
  { key: 'batchPlantingLogs', name: 'batchPlantingLogs', clear: () => db.batchPlantingLogs.clear(), add: items => db.batchPlantingLogs.bulkAdd(items) },
  { key: 'cropSearchLogs', name: 'cropSearchLogs', clear: () => db.cropSearchLogs.clear(), add: items => db.cropSearchLogs.bulkAdd(items) },
  { key: 'successionGaps', name: 'successionGaps', clear: () => db.successionGaps.clear(), add: items => db.successionGaps.bulkAdd(items) },
  { key: 'activities', name: 'activities', clear: () => db.activities.clear(), add: items => db.activities.bulkAdd(items) },
  { key: 'ledgerEntries', name: 'ledgerEntries', clear: () => db.ledgerEntries.clear(), add: items => db.ledgerEntries.bulkAdd(items) },
  { key: 'farmLands', name: 'farmLands', clear: () => db.farmLands.clear(), add: items => db.farmLands.bulkAdd(items) },
  { key: 'farmAreas', name: 'farmAreas', clear: () => db.farmAreas.clear(), add: items => db.farmAreas.bulkAdd(items) },
  { key: 'diaryEntries', name: 'diaryEntries', clear: () => db.diaryEntries.clear(), add: items => db.diaryEntries.bulkAdd(items) },
];

export async function importJsonBackupFromString(json: string): Promise<{ counts: Record<string, number> }> {
  let data: BackupPayload;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON in backup file');
  }
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const items = data[table.key];
    if (Array.isArray(items) && items.length > 0) {
      await table.clear();
      await table.add(items);
      counts[table.name] = items.length;
    }
  }
  return { counts };
}

export async function importJsonBackupFromFile(file: File): Promise<{ counts: Record<string, number> }> {
  const text = await file.text();
  return importJsonBackupFromString(text);
}
