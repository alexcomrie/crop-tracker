import Papa from 'papaparse';
import type { 
  Crop, Propagation, Reminder, StageLog, HarvestLog, 
  TreatmentLog, CropDbAdjustment, PropDbAdjustment,
  BatchPlantingLog, CropSearchLog
} from '../types';

export async function fetchCsv<T>(url: string, mapper: (row: any[]) => T): Promise<T[]> {
  if (!url) return [];
  
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch CSV from ${url}`);
  const csvText = await response.text();
  
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        // Skip header row
        const data = results.data.slice(1).map(row => mapper(row as any[]));
        resolve(data);
      },
      error: (error: Error) => reject(error)
    });
  });
}

export const mappers = {
  crop: (r: any[]): Crop => ({
    id: r[0], 
    cropName: r[1] ?? '', 
    variety: r[2] ?? '', 
    plantingMethod: r[3] ?? '', 
    plantStage: r[4] ?? '', 
    plantingDate: r[5] ?? '', 
    transplantDateScheduled: r[6] ?? '', 
    transplantDateActual: r[7] ?? '', 
    germinationDate: r[8] ?? '', 
    harvestDateEstimated: r[9] ?? '', 
    harvestDateActual: r[10] ?? '', 
    isContinuous: String(r[11]).toLowerCase() === 'true' || r[11] === 'yes' || r[11] === '1' || r[11] === 1,
    nextConsistentPlanting: r[12] ?? '', 
    batchNumber: Number(r[13] || 0), 
    fungusSprayDates: r[14] ?? '', 
    pestSprayDates: r[15] ?? '', 
    status: r[16] ?? 'Active', 
    notes: r[17] ?? '', 
    daysSeedGerm: Number(r[18] || 0), 
    daysGermTransplant: Number(r[19] || 0), 
    daysTransplantHarvest: Number(r[20] || 0), 
    telegramChatId: r[21] ?? '', 
    updatedAt: Date.now()
  }),
  
  propagation: (r: any[]): Propagation => ({
    id: r[0], 
    plantName: r[1] ?? '', 
    propagationDate: r[2] ?? '', 
    propagationMethod: r[3] ?? '', 
    notes: r[4] ?? '', 
    expectedRootingStart: r[5] ?? '', 
    expectedRootingEnd: r[6] ?? '', 
    actualRootingDate: r[7] ?? '', 
    daysToRootActual: Number(r[8] || 0), 
    status: r[9] ?? 'Propagating', 
    telegramChatId: r[10] ?? '', 
    updatedAt: Date.now()
  }),
  
  reminder: (r: any[]): Reminder => ({
    id: r[0], 
    type: r[1] ?? '', 
    cropPlantName: r[2] ?? '', 
    trackingId: r[3] ?? '', 
    sendDate: r[4] ?? '', 
    subject: r[5] ?? '', 
    body: r[6] ?? '', 
    sent: String(r[7]).toLowerCase() === 'true' || r[7] === '1' || r[7] === 1, 
    chatId: r[8] ?? '', 
    updatedAt: Date.now()
  }),
  
  stageLog: (r: any[]): StageLog => ({
    id: `${r[0]}:${r[5] ?? ''}:${r[3]}->${r[4]}`, 
    trackingId: r[0] ?? '', 
    cropName: r[1] ?? '', 
    variety: r[2] ?? '', 
    stageFrom: r[3] ?? '', 
    stageTo: r[4] ?? '', 
    date: r[5] ?? '', 
    daysElapsed: Number(r[6] || 0), 
    method: r[7] ?? '', 
    notes: r[8] ?? '', 
    updatedAt: Date.now()
  }),
  
  harvestLog: (r: any[]): HarvestLog => ({
    id: `${r[0]}:${r[2] ?? 0}`, 
    cropTrackingId: r[0] ?? '', 
    cropName: r[1] ?? '', 
    harvestNumber: Number(r[2] || 0), 
    harvestDate: r[3] ?? '', 
    daysFromPlanting: Number(r[4] || 0), 
    deviationFromDb: Number(r[5] || 0), 
    notes: r[6] ?? '', 
    updatedAt: Date.now()
  }),
  
  treatmentLog: (r: any[]): TreatmentLog => ({
    id: `${r[0]}:${r[2] ?? ''}:${r[4] ?? ''}`, 
    cropId: r[0] ?? '', 
    cropName: r[1] ?? '', 
    date: r[2] ?? '', 
    daysFromPlanting: Number(r[3] || 0), 
    type: r[4] ?? '', 
    product: r[5] ?? '', 
    notes: r[6] ?? '', 
    updatedAt: Date.now()
  }),
  
  cropDbAdjustment: (r: any[]): CropDbAdjustment => ({
    id: `${r[0]}::${r[1] ?? ''}::${r[2] ?? ''}`, 
    cropKey: r[0] ?? '', 
    variety: r[1] ?? '', 
    field: r[2] ?? '', 
    databaseDefault: Number(r[3] || 0), 
    yourAverage: Number(r[4] || 0), 
    sampleCount: Number(r[5] || 0), 
    useCustom: String(r[6] ?? ''), 
    lastUpdated: String(r[7] ?? ''), 
    updatedAt: Date.now()
  }),
  
  propDbAdjustment: (r: any[]): PropDbAdjustment => ({
    id: `${r[0]}::${r[1] ?? ''}`, 
    plantKey: r[0] ?? '', 
    method: r[1] ?? '', 
    dbDefaultRootingDays: Number(r[2] || 0), 
    yourAverage: Number(r[3] || 0), 
    sampleCount: Number(r[4] || 0), 
    useCustom: String(r[5] ?? ''), 
    lastUpdated: String(r[6] ?? ''), 
    updatedAt: Date.now()
  }),
  
  batchPlantingLog: (r: any[]): BatchPlantingLog => ({
    id: `${r[0]}:${r[2] ?? 0}`, 
    cropTrackingId: r[0] ?? '', 
    cropName: r[1] ?? '', 
    batchNumber: Number(r[2] || 1), 
    batchPlantingDate: r[3] ?? '', 
    confirmedPlantedDate: r[4] ?? '', 
    nextBatchDate: r[5] ?? '', 
    status: r[6] ?? '', 
    notes: r[7] ?? '', 
    updatedAt: Date.now()
  }),
  
  cropSearchLog: (r: any[]): CropSearchLog => ({
    id: `${r[0]}:${r[1] ?? ''}`, 
    cropKey: r[0] ?? '', 
    searchDate: r[1] ?? '', 
    growingTimeFound: Number(r[2] || 0), 
    germinationDaysMin: Number(r[3] || 0), 
    germinationDaysMax: Number(r[4] || 0), 
    sourceSummary: r[5] ?? '', 
    appliedToTracker: String(r[6]).toLowerCase() === 'true' || r[6] === '1' || r[6] === 1 || String(r[6]).toLowerCase() === 'yes', 
    updatedAt: Date.now()
  })
};
