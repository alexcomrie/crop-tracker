import Dexie, { type Table } from 'dexie';
import type {
  Crop, Propagation, Reminder, StageLog, HarvestLog,
  TreatmentLog, CropDbAdjustment, PropDbAdjustment,
  BatchPlantingLog, CropSearchLog
} from '../types';

export class CropManagerDB extends Dexie {
  crops!: Table<Crop>;
  propagations!: Table<Propagation>;
  reminders!: Table<Reminder>;
  stageLogs!: Table<StageLog>;
  harvestLogs!: Table<HarvestLog>;
  treatmentLogs!: Table<TreatmentLog>;
  cropDbAdjustments!: Table<CropDbAdjustment>;
  propDbAdjustments!: Table<PropDbAdjustment>;
  batchPlantingLogs!: Table<BatchPlantingLog>;
  cropSearchLogs!: Table<CropSearchLog>;
  successionGaps!: Table<{ id: string; data: any; updatedAt: number }>;

  constructor() {
    super('CropManagerDB');
    this.version(2).stores({
      crops: 'id, cropName, variety, status, plantStage, isContinuous, parentCropId, updatedAt',
  propagations: 'id, plantName, status, updatedAt',
  reminders: 'id, type, trackingId, sendDate, sent, updatedAt',
  stageLogs: 'id, trackingId, date, updatedAt',
  harvestLogs: 'id, cropTrackingId, harvestDate, updatedAt',
  treatmentLogs: 'id, cropId, date, updatedAt',
  cropDbAdjustments: 'id, cropKey, variety, field, updatedAt',
  propDbAdjustments: 'id, plantKey, method, updatedAt',
  batchPlantingLogs: 'id, cropTrackingId, status, updatedAt',
  cropSearchLogs: 'id, cropKey, updatedAt',
      successionGaps: 'id, updatedAt',
    });
  }
}
