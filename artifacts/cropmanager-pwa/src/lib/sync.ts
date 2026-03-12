import type { AppSettings } from '../types';
import db from '../db/db';

export async function buildSyncPayload() {
  const [crops, propagations, reminders, stageLogs, harvestLogs, treatmentLogs, cropDbAdjustments, propDbAdjustments, batchPlantingLogs, cropSearchLogs] = await Promise.all([
    db.crops.where('syncStatus').equals('pending').toArray(),
    db.propagations.where('syncStatus').equals('pending').toArray(),
    db.reminders.where('syncStatus').equals('pending').toArray(),
    db.stageLogs.where('syncStatus').equals('pending').toArray(),
    db.harvestLogs.where('syncStatus').equals('pending').toArray(),
    db.treatmentLogs.where('syncStatus').equals('pending').toArray(),
    db.cropDbAdjustments.where('syncStatus').equals('pending').toArray(),
    db.propDbAdjustments.where('syncStatus').equals('pending').toArray(),
    db.batchPlantingLogs.where('syncStatus').equals('pending').toArray(),
    db.cropSearchLogs.where('syncStatus').equals('pending').toArray(),
  ]);

  return {
    crops: crops.map(c => [c.id, c.cropName, c.variety, c.plantingMethod, c.plantStage, c.plantingDate, c.transplantDateScheduled, c.transplantDateActual, c.germinationDate, c.harvestDateEstimated, c.harvestDateActual, c.nextConsistentPlanting, c.batchNumber, c.fungusSprayDates, c.pestSprayDates, c.status, c.notes, c.daysSeedGerm, c.daysGermTransplant, c.daysTransplantHarvest, c.telegramChatId]),
    propagations: propagations.map(p => [p.id, p.plantName, p.propagationDate, p.propagationMethod, p.notes, p.expectedRootingStart, p.expectedRootingEnd, p.actualRootingDate, p.daysToRootActual, p.status, p.telegramChatId]),
    reminders: reminders.map(r => [r.id, r.type, r.cropPlantName, r.trackingId, r.sendDate, r.subject, r.body, r.sent, r.chatId]),
    stageLogs: stageLogs.map(s => [s.trackingId, s.cropName, s.variety, s.stageFrom, s.stageTo, s.date, s.daysElapsed, s.method, s.notes]),
    harvestLogs: harvestLogs.map(h => [h.cropTrackingId, h.cropName, h.harvestNumber, h.harvestDate, h.daysFromPlanting, h.deviationFromDb, h.notes]),
    treatmentLogs: treatmentLogs.map(t => [t.cropId, t.cropName, t.date, t.daysFromPlanting, t.type, t.product, t.notes]),
    cropDbAdjustments: cropDbAdjustments.map(a => [a.cropKey, a.variety, a.field, a.databaseDefault, a.yourAverage, a.sampleCount, a.useCustom, a.lastUpdated]),
    propDbAdjustments: propDbAdjustments.map(a => [a.plantKey, a.method, a.dbDefaultRootingDays, a.yourAverage, a.sampleCount, a.useCustom, a.lastUpdated]),
    batchPlantingLogs: batchPlantingLogs.map(b => [b.cropTrackingId, b.cropName, b.batchNumber, b.batchPlantingDate, b.confirmedPlantedDate, b.nextBatchDate, b.status, b.notes]),
    cropSearchLogs: cropSearchLogs.map(c => [c.cropKey, c.searchDate, c.growingTimeFound, c.germinationDaysMin, c.germinationDaysMax, c.sourceSummary, c.appliedToTracker]),
  };
}

export async function getPendingCount(): Promise<number> {
  const counts = await Promise.all([
    db.crops.where('syncStatus').equals('pending').count(),
    db.propagations.where('syncStatus').equals('pending').count(),
    db.reminders.where('syncStatus').equals('pending').count(),
    db.stageLogs.where('syncStatus').equals('pending').count(),
    db.harvestLogs.where('syncStatus').equals('pending').count(),
    db.treatmentLogs.where('syncStatus').equals('pending').count(),
  ]);
  return counts.reduce((a, b) => a + b, 0);
}

export async function pushToGAS(
  payload: Awaited<ReturnType<typeof buildSyncPayload>>,
  settings: AppSettings,
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; written?: Record<string, number>; error?: string }> {
  if (!settings.gasWebAppUrl) return { success: false, error: 'GAS Web App URL not configured' };
  onProgress?.('Uploading records...');
  try {
    const res = await fetch(settings.gasWebAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: settings.syncToken, action: 'push', payload }),
    });
    const data = await res.json();
    if (data.success) {
      // Mark all as clean
      await Promise.all([
        db.crops.where('syncStatus').equals('pending').modify({ syncStatus: 'clean' }),
        db.propagations.where('syncStatus').equals('pending').modify({ syncStatus: 'clean' }),
        db.reminders.where('syncStatus').equals('pending').modify({ syncStatus: 'clean' }),
        db.stageLogs.where('syncStatus').equals('pending').modify({ syncStatus: 'clean' }),
        db.harvestLogs.where('syncStatus').equals('pending').modify({ syncStatus: 'clean' }),
        db.treatmentLogs.where('syncStatus').equals('pending').modify({ syncStatus: 'clean' }),
        db.cropDbAdjustments.where('syncStatus').equals('pending').modify({ syncStatus: 'clean' }),
        db.propDbAdjustments.where('syncStatus').equals('pending').modify({ syncStatus: 'clean' }),
        db.batchPlantingLogs.where('syncStatus').equals('pending').modify({ syncStatus: 'clean' }),
        db.cropSearchLogs.where('syncStatus').equals('pending').modify({ syncStatus: 'clean' }),
      ]);
      return { success: true, written: data.written };
    }
    return { success: false, error: data.error ?? 'Unknown GAS error' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function pullFromGAS(settings: AppSettings): Promise<{ success: boolean; count?: number; error?: string }> {
  if (!settings.gasWebAppUrl) return { success: false, error: 'GAS Web App URL not configured' };
  try {
    const res = await fetch(settings.gasWebAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: settings.syncToken, action: 'pull', since: 0 }),
    });
    const data = await res.json();
    if (!data.success) return { success: false, error: data.error };

    const now = Date.now();
    await db.transaction('rw', [db.crops, db.propagations, db.reminders, db.stageLogs, db.harvestLogs, db.treatmentLogs, db.cropDbAdjustments, db.propDbAdjustments, db.batchPlantingLogs, db.cropSearchLogs], async () => {
      await Promise.all([db.crops.clear(), db.propagations.clear(), db.reminders.clear(), db.stageLogs.clear(), db.harvestLogs.clear(), db.treatmentLogs.clear(), db.cropDbAdjustments.clear(), db.propDbAdjustments.clear(), db.batchPlantingLogs.clear(), db.cropSearchLogs.clear()]);
      const d = data.data;
      if (d.crops) await db.crops.bulkAdd(d.crops.map((r: any[]) => ({ id: r[0], cropName: r[1] ?? '', variety: r[2] ?? '', plantingMethod: r[3] ?? '', plantStage: r[4] ?? '', plantingDate: r[5] ?? '', transplantDateScheduled: r[6] ?? '', transplantDateActual: r[7] ?? '', germinationDate: r[8] ?? '', harvestDateEstimated: r[9] ?? '', harvestDateActual: r[10] ?? '', nextConsistentPlanting: r[11] ?? '', batchNumber: r[12] ?? 0, fungusSprayDates: r[13] ?? '', pestSprayDates: r[14] ?? '', status: r[15] ?? 'Active', notes: r[16] ?? '', daysSeedGerm: r[17] ?? 0, daysGermTransplant: r[18] ?? 0, daysTransplantHarvest: r[19] ?? 0, telegramChatId: r[20] ?? '', syncStatus: 'clean', updatedAt: now })));
      if (d.propagations) await db.propagations.bulkAdd(d.propagations.map((r: any[]) => ({ id: r[0], plantName: r[1] ?? '', propagationDate: r[2] ?? '', propagationMethod: r[3] ?? '', notes: r[4] ?? '', expectedRootingStart: r[5] ?? '', expectedRootingEnd: r[6] ?? '', actualRootingDate: r[7] ?? '', daysToRootActual: r[8] ?? 0, status: r[9] ?? 'Propagating', telegramChatId: r[10] ?? '', syncStatus: 'clean', updatedAt: now })));
    });

    let count = 0;
    if (data.data.crops) count += data.data.crops.length;
    if (data.data.propagations) count += data.data.propagations.length;
    return { success: true, count };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function exportJsonBackup(): Promise<string> {
  const [crops, propagations, reminders, stageLogs, harvestLogs, treatmentLogs] = await Promise.all([
    db.crops.toArray(),
    db.propagations.toArray(),
    db.reminders.toArray(),
    db.stageLogs.toArray(),
    db.harvestLogs.toArray(),
    db.treatmentLogs.toArray(),
  ]);
  return JSON.stringify({ exportedAt: new Date().toISOString(), crops, propagations, reminders, stageLogs, harvestLogs, treatmentLogs }, null, 2);
}
