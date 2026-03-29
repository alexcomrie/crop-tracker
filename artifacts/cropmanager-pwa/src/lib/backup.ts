import db from '../db/db';

export async function exportJsonBackup(): Promise<string> {
  const [crops, propagations, reminders, stageLogs, harvestLogs, treatmentLogs] = await Promise.all([
    db.crops.toArray(),
    db.propagations.toArray(),
    db.reminders.toArray(),
    db.stageLogs.toArray(),
    db.harvestLogs.toArray(),
    db.treatmentLogs.toArray(),
  ]);
  return JSON.stringify({ 
    exportedAt: new Date().toISOString(), 
    crops, 
    propagations, 
    reminders, 
    stageLogs, 
    harvestLogs, 
    treatmentLogs 
  }, null, 2);
}

type BackupPayload = {
  crops?: any[];
  propagations?: any[];
  reminders?: any[];
  stageLogs?: any[];
  harvestLogs?: any[];
  treatmentLogs?: any[];
};

export async function importJsonBackupFromString(json: string): Promise<{ counts: Record<string, number> }> {
  const data: BackupPayload = JSON.parse(json);
  const counts: Record<string, number> = {};
  if (Array.isArray(data.crops)) {
    await db.crops.clear();
    await db.crops.bulkAdd(data.crops);
    counts.crops = data.crops.length;
  }
  if (Array.isArray(data.propagations)) {
    await db.propagations.clear();
    await db.propagations.bulkAdd(data.propagations);
    counts.propagations = data.propagations.length;
  }
  if (Array.isArray(data.reminders)) {
    await db.reminders.clear();
    await db.reminders.bulkAdd(data.reminders);
    counts.reminders = data.reminders.length;
  }
  if (Array.isArray(data.stageLogs)) {
    await db.stageLogs.clear();
    await db.stageLogs.bulkAdd(data.stageLogs);
    counts.stageLogs = data.stageLogs.length;
  }
  if (Array.isArray(data.harvestLogs)) {
    await db.harvestLogs.clear();
    await db.harvestLogs.bulkAdd(data.harvestLogs);
    counts.harvestLogs = data.harvestLogs.length;
  }
  if (Array.isArray(data.treatmentLogs)) {
    await db.treatmentLogs.clear();
    await db.treatmentLogs.bulkAdd(data.treatmentLogs);
    counts.treatmentLogs = data.treatmentLogs.length;
  }
  return { counts };
}

export async function importJsonBackupFromFile(file: File): Promise<{ counts: Record<string, number> }> {
  const text = await file.text();
  return importJsonBackupFromString(text);
}
