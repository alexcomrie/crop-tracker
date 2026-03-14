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
