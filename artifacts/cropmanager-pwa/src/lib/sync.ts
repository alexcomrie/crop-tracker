import db from '../db/db';
import { fetchCsv, mappers } from './sheets';
import type { AppSettings } from '../types';

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

import { CONFIG } from './config';

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
    crops: crops.map(c => [
      c.id, c.cropName, c.variety, c.plantingMethod, c.plantStage, c.plantingDate, 
      c.transplantDateScheduled, c.transplantDateActual, c.germinationDate, 
      c.harvestDateEstimated, c.harvestDateActual, c.isContinuous, c.nextConsistentPlanting, 
      c.batchNumber, c.fungusSprayDates, c.pestSprayDates, c.status, c.notes, 
      c.daysSeedGerm, c.daysGermTransplant, c.daysTransplantHarvest, c.telegramChatId
    ]),
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

export async function pushToSheets(
  payload: Awaited<ReturnType<typeof buildSyncPayload>>,
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; written?: Record<string, number>; error?: string }> {
  onProgress?.('Uploading records...');
  try {
    const formData = new URLSearchParams();
    formData.append('token', CONFIG.SYNC_TOKEN);
    formData.append('action', 'push');
    formData.append('payload', JSON.stringify(payload));

    const res = await fetch(CONFIG.SYNC_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
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
    return { success: false, error: data.error ?? 'Unknown error' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function pullFromSheets(settings: AppSettings): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const [
      crops, propagations, reminders, stageLogs, harvestLogs, treatmentLogs, 
      cropDbAdjustments, propDbAdjustments, batchPlantingLogs, cropSearchLogs
    ] = await Promise.all([
      fetchCsv(settings.cropsSheetUrl, mappers.crop),
      fetchCsv(settings.propagationsSheetUrl, mappers.propagation),
      fetchCsv(settings.remindersSheetUrl, mappers.reminder),
      fetchCsv(settings.stageLogsSheetUrl, mappers.stageLog),
      fetchCsv(settings.harvestLogsSheetUrl, mappers.harvestLog),
      fetchCsv(settings.treatmentLogsSheetUrl, mappers.treatmentLog),
      fetchCsv(settings.cropDbAdjustmentSheetUrl, mappers.cropDbAdjustment),
      fetchCsv(settings.propDbAdjustmentSheetUrl, mappers.propDbAdjustment),
      fetchCsv(settings.batchPlantingLogSheetUrl, mappers.batchPlantingLog),
      fetchCsv(settings.cropSearchLogSheetUrl, mappers.cropSearchLog),
    ]);

    const now = Date.now();
    await db.transaction('rw', [
      db.crops, db.propagations, db.reminders, db.stageLogs, db.harvestLogs, 
      db.treatmentLogs, db.cropDbAdjustments, db.propDbAdjustments, 
      db.batchPlantingLogs, db.cropSearchLogs
    ], async () => {
      await Promise.all([
        db.crops.clear(), db.propagations.clear(), db.reminders.clear(), 
        db.stageLogs.clear(), db.harvestLogs.clear(), db.treatmentLogs.clear(), 
        db.cropDbAdjustments.clear(), db.propDbAdjustments.clear(), 
        db.batchPlantingLogs.clear(), db.cropSearchLogs.clear()
      ]);
      
      if (crops.length) await db.crops.bulkAdd(crops);
      if (propagations.length) await db.propagations.bulkAdd(propagations);
      if (reminders.length) await db.reminders.bulkAdd(reminders);
      if (stageLogs.length) await db.stageLogs.bulkAdd(stageLogs);
      if (harvestLogs.length) await db.harvestLogs.bulkAdd(harvestLogs);
      if (treatmentLogs.length) await db.treatmentLogs.bulkAdd(treatmentLogs);
      if (cropDbAdjustments.length) await db.cropDbAdjustments.bulkAdd(cropDbAdjustments);
      if (propDbAdjustments.length) await db.propDbAdjustments.bulkAdd(propDbAdjustments);
      if (batchPlantingLogs.length) await db.batchPlantingLogs.bulkAdd(batchPlantingLogs);
      if (cropSearchLogs.length) await db.cropSearchLogs.bulkAdd(cropSearchLogs);
    });

    const total = crops.length + propagations.length + reminders.length + stageLogs.length + harvestLogs.length + treatmentLogs.length;
    return { success: true, count: total };
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

export async function checkSyncHealth(): Promise<{ success: boolean; status?: string; error?: string }> {
  try {
    const params = new URLSearchParams({ action: 'health' });
    const res = await fetch(`${CONFIG.SYNC_WEB_APP_URL}?${params.toString()}`);
    const data = await res.json();
    return { success: res.ok, status: data.status, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
