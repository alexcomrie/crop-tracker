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

  constructor() {
    super('CropManagerDB');
    this.version(1).stores({
      crops: 'id, cropName, status, plantStage, syncStatus, updatedAt',
      propagations: 'id, plantName, status, syncStatus, updatedAt',
      reminders: 'id, trackingId, type, sendDate, sent, syncStatus, updatedAt',
      stageLogs: 'id, trackingId, date, syncStatus, updatedAt',
      harvestLogs: 'id, cropTrackingId, harvestDate, syncStatus, updatedAt',
      treatmentLogs: 'id, cropId, date, type, syncStatus, updatedAt',
      cropDbAdjustments: 'id, cropKey, field, syncStatus, updatedAt',
      propDbAdjustments: 'id, plantKey, method, syncStatus, updatedAt',
      batchPlantingLogs: 'id, cropTrackingId, batchPlantingDate, syncStatus, updatedAt',
      cropSearchLogs: 'id, cropKey, searchDate, syncStatus, updatedAt',
    });
  }
}
