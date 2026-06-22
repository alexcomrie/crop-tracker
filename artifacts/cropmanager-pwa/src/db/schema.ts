import Dexie, { type Table } from 'dexie';
import type {
  Crop, Propagation, Reminder, StageLog, HarvestLog,
  TreatmentLog, CropDbAdjustment, PropDbAdjustment,
  BatchPlantingLog, CropSearchLog, LedgerEntry, FarmArea, FarmLand
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
  activities!: Table<{
    id: string;
    date: string;
    type: string;
    product: string;
    notes: string;
    reminderDays: number | null;
    reminderDate: string | null;
    cropIds: string[];
    updatedAt: number;
  }>;
  ledgerEntries!: Table<LedgerEntry>;
  farmLands!: Table<FarmLand>;
  farmAreas!: Table<FarmArea>;

  constructor() {
    super('CropManagerDB');
    this.version(3).stores({
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
      activities: 'id, date, type, reminderDate, updatedAt',
      ledgerEntries: 'id, type, date, category, updatedAt',
    });
    this.version(4).stores({
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
      activities: 'id, date, type, reminderDate, updatedAt',
      ledgerEntries: 'id, type, date, category, updatedAt',
      farmAreas: 'id, name, updatedAt',
    });
    this.version(5).stores({
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
      activities: 'id, date, type, reminderDate, updatedAt',
      ledgerEntries: 'id, type, date, category, updatedAt',
      farmLands: 'id, name, updatedAt',
      farmAreas: 'id, landId, name, updatedAt',
    });
  }
}