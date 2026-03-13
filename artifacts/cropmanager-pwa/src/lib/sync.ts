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
  onProgress?.('Uploading records...');
  try {
    const res = await fetch('/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: settings.syncToken, payload }),
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
  try {
    const res = await fetch('/api/sync/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: settings.syncToken }),
    });
    const data = await res.json();
    if (!data.success) return { success: false, error: data.error };

    const now = Date.now();
    await db.transaction('rw', [db.crops, db.propagations, db.reminders, db.stageLogs, db.harvestLogs, db.treatmentLogs, db.cropDbAdjustments, db.propDbAdjustments, db.batchPlantingLogs, db.cropSearchLogs], async () => {
      await Promise.all([db.crops.clear(), db.propagations.clear(), db.reminders.clear(), db.stageLogs.clear(), db.harvestLogs.clear(), db.treatmentLogs.clear(), db.cropDbAdjustments.clear(), db.propDbAdjustments.clear(), db.batchPlantingLogs.clear(), db.cropSearchLogs.clear()]);
      const d = data.data;
      if (d.crops) await db.crops.bulkAdd(d.crops.map((r: any[]) => ({ id: r[0], cropName: r[1] ?? '', variety: r[2] ?? '', plantingMethod: r[3] ?? '', plantStage: r[4] ?? '', plantingDate: r[5] ?? '', transplantDateScheduled: r[6] ?? '', transplantDateActual: r[7] ?? '', germinationDate: r[8] ?? '', harvestDateEstimated: r[9] ?? '', harvestDateActual: r[10] ?? '', nextConsistentPlanting: r[11] ?? '', batchNumber: r[12] ?? 0, fungusSprayDates: r[13] ?? '', pestSprayDates: r[14] ?? '', status: r[15] ?? 'Active', notes: r[16] ?? '', daysSeedGerm: r[17] ?? 0, daysGermTransplant: r[18] ?? 0, daysTransplantHarvest: r[19] ?? 0, telegramChatId: r[20] ?? '', syncStatus: 'clean', updatedAt: now })));
      if (d.propagations) await db.propagations.bulkAdd(d.propagations.map((r: any[]) => ({ id: r[0], plantName: r[1] ?? '', propagationDate: r[2] ?? '', propagationMethod: r[3] ?? '', notes: r[4] ?? '', expectedRootingStart: r[5] ?? '', expectedRootingEnd: r[6] ?? '', actualRootingDate: r[7] ?? '', daysToRootActual: r[8] ?? 0, status: r[9] ?? 'Propagating', telegramChatId: r[10] ?? '', syncStatus: 'clean', updatedAt: now })));
      if (d.reminders) await db.reminders.bulkAdd(d.reminders.map((r: any[]) => ({ id: r[0], type: r[1] ?? '', cropPlantName: r[2] ?? '', trackingId: r[3] ?? '', sendDate: r[4] ?? '', subject: r[5] ?? '', body: r[6] ?? '', sent: Boolean(r[7]), chatId: r[8] ?? '', syncStatus: 'clean', updatedAt: now })));
      if (d.stageLogs) await db.stageLogs.bulkAdd(d.stageLogs.map((r: any[]) => ({ id: `${r[0]}:${r[5] ?? ''}:${r[3]}->${r[4]}`, trackingId: r[0] ?? '', cropName: r[1] ?? '', variety: r[2] ?? '', stageFrom: r[3] ?? '', stageTo: r[4] ?? '', date: r[5] ?? '', daysElapsed: r[6] ?? 0, method: r[7] ?? '', notes: r[8] ?? '', syncStatus: 'clean', updatedAt: now })));
      if (d.harvestLogs) await db.harvestLogs.bulkAdd(d.harvestLogs.map((r: any[]) => ({ id: `${r[0]}:${r[2] ?? 0}`, cropTrackingId: r[0] ?? '', cropName: r[1] ?? '', harvestNumber: r[2] ?? 0, harvestDate: r[3] ?? '', daysFromPlanting: r[4] ?? 0, deviationFromDb: r[5] ?? 0, notes: r[6] ?? '', syncStatus: 'clean', updatedAt: now })));
      if (d.treatmentLogs) await db.treatmentLogs.bulkAdd(d.treatmentLogs.map((r: any[]) => ({ id: `${r[0]}:${r[2] ?? ''}:${r[4] ?? ''}`, cropId: r[0] ?? '', cropName: r[1] ?? '', date: r[2] ?? '', daysFromPlanting: r[3] ?? 0, type: r[4] ?? '', product: r[5] ?? '', notes: r[6] ?? '', syncStatus: 'clean', updatedAt: now })));
      if (d.cropDbAdjustments) await db.cropDbAdjustments.bulkAdd(d.cropDbAdjustments.map((r: any[]) => ({ id: `${r[0]}::${r[1] ?? ''}::${r[2] ?? ''}`, cropKey: r[0] ?? '', variety: r[1] ?? '', field: r[2] ?? '', databaseDefault: r[3] ?? 0, yourAverage: r[4] ?? 0, sampleCount: r[5] ?? 0, useCustom: String(r[6] ?? ''), lastUpdated: String(r[7] ?? ''), syncStatus: 'clean', updatedAt: now })));
      if (d.propDbAdjustments) await db.propDbAdjustments.bulkAdd(d.propDbAdjustments.map((r: any[]) => ({ id: `${r[0]}::${r[1] ?? ''}`, plantKey: r[0] ?? '', method: r[1] ?? '', dbDefaultRootingDays: r[2] ?? 0, yourAverage: r[3] ?? 0, sampleCount: r[4] ?? 0, useCustom: String(r[5] ?? ''), lastUpdated: String(r[6] ?? ''), syncStatus: 'clean', updatedAt: now })));
      if (d.batchPlantingLogs) await db.batchPlantingLogs.bulkAdd(d.batchPlantingLogs.map((r: any[]) => ({ id: `${r[0]}:${r[2] ?? 0}`, cropTrackingId: r[0] ?? '', cropName: r[1] ?? '', batchNumber: r[2] ?? 1, batchPlantingDate: r[3] ?? '', confirmedPlantedDate: r[4] ?? '', nextBatchDate: r[5] ?? '', status: r[6] ?? '', notes: r[7] ?? '', syncStatus: 'clean', updatedAt: now })));
      if (d.cropSearchLogs) await db.cropSearchLogs.bulkAdd(d.cropSearchLogs.map((r: any[]) => ({ id: `${r[0]}:${r[1] ?? ''}`, cropKey: r[0] ?? '', searchDate: r[1] ?? '', growingTimeFound: r[2] ?? 0, germinationDaysMin: r[3] ?? 0, germinationDaysMax: r[4] ?? 0, sourceSummary: r[5] ?? '', appliedToTracker: Boolean(r[6]), syncStatus: 'clean', updatedAt: now })));
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

export async function checkSyncHealth(): Promise<{ success: boolean; status?: string; error?: string }> {
  try {
    const res = await fetch('/api/sync/health');
    const data = await res.json();
    return { success: res.ok, status: data.status, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
