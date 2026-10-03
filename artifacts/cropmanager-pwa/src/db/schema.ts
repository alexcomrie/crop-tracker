import Dexie, { type Table } from 'dexie';
import type {
  Crop, Propagation, Reminder, StageLog, HarvestLog,
  TreatmentLog, CropDbAdjustment, PropDbAdjustment,
  BatchPlantingLog, CropSearchLog, LedgerEntry, FarmArea, FarmLand,
  DiaryEntry, PosSale, PosCustomer, PosSettings, PosInventoryItem,
  PosOrder, PosHeldReceipt, ObservationLog, PersonalCropData, Tracking,
  TrackingEntry, ObservationEntry, QuickNote
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
  diaryEntries!: Table<DiaryEntry>;
  posSales!: Table<PosSale>;
  posCustomers!: Table<PosCustomer>;
  posSettings!: Table<PosSettings>;
  posInventory!: Table<PosInventoryItem>;
  posOrders!: Table<PosOrder>;
  posHeldReceipts!: Table<PosHeldReceipt>;
  microModels!: Table<{ id: string; serialized: Record<string, number[][]>; config: unknown; itos: string[]; finalLoss: number; steps: number; docsCount: number; createdAt: number; updatedAt: number }>;
  observationLogs!: Table<ObservationLog>;
  personalCropDb!: Table<PersonalCropData>;
  trackings!: Table<Tracking>;
  trackingEntries!: Table<TrackingEntry>;
  observationEntries!: Table<ObservationEntry>;
  quickNotes!: Table<QuickNote>;

  constructor() {
    // v4: removed ALL boolean/nullable fields from indexes (IndexedDB rejects booleans/null as keys).
    // Fresh DB name guarantees no stale boolean-indexed schema lingers in any browser.
    super('CropManagerDB_v4');
    this.version(1).stores({
      crops: 'id, cropName, variety, status, plantStage, parentCropId, updatedAt',
      propagations: 'id, plantName, status, updatedAt',
      reminders: 'id, type, trackingId, sendDate, updatedAt',
      stageLogs: 'id, trackingId, date, updatedAt',
      harvestLogs: 'id, cropTrackingId, harvestDate, updatedAt',
      treatmentLogs: 'id, cropId, date, updatedAt',
      cropDbAdjustments: 'id, cropKey, variety, field, updatedAt',
      propDbAdjustments: 'id, plantKey, method, updatedAt',
      batchPlantingLogs: 'id, cropTrackingId, status, updatedAt',
      cropSearchLogs: 'id, cropKey, updatedAt',
      successionGaps: 'id, updatedAt',
      activities: 'id, date, type, updatedAt',
      ledgerEntries: 'id, type, date, category, updatedAt',
      farmLands: 'id, name, updatedAt',
      farmAreas: 'id, landId, name, updatedAt',
      diaryEntries: 'id, cropName, entryType, updatedAt',
      posSales: 'id, date, receiptNumber, createdAt',
      posCustomers: 'id, name, phone, createdAt',
      posSettings: 'id',
      posInventory: 'id, name, category, updatedAt',
      posOrders: 'id, customerName, status, createdAt',
      posHeldReceipts: 'id, name, createdAt',
      microModels: 'id, updatedAt',
      observationLogs: 'id, cropId, date, updatedAt',
      personalCropDb: 'key, updatedAt',
    });
    // v2: fruit/crop growth trackings (additive — existing tables unchanged)
    this.version(2).stores({
      crops: 'id, cropName, variety, status, plantStage, parentCropId, updatedAt',
      propagations: 'id, plantName, status, updatedAt',
      reminders: 'id, type, trackingId, sendDate, updatedAt',
      stageLogs: 'id, trackingId, date, updatedAt',
      harvestLogs: 'id, cropTrackingId, harvestDate, updatedAt',
      treatmentLogs: 'id, cropId, date, updatedAt',
      cropDbAdjustments: 'id, cropKey, variety, field, updatedAt',
      propDbAdjustments: 'id, plantKey, method, updatedAt',
      batchPlantingLogs: 'id, cropTrackingId, status, updatedAt',
      cropSearchLogs: 'id, cropKey, updatedAt',
      successionGaps: 'id, updatedAt',
      activities: 'id, date, type, updatedAt',
      ledgerEntries: 'id, type, date, category, updatedAt',
      farmLands: 'id, name, updatedAt',
      farmAreas: 'id, landId, name, updatedAt',
      diaryEntries: 'id, cropName, entryType, updatedAt',
      posSales: 'id, date, receiptNumber, createdAt',
      posCustomers: 'id, name, phone, createdAt',
      posSettings: 'id',
      posInventory: 'id, name, category, updatedAt',
      posOrders: 'id, customerName, status, createdAt',
      posHeldReceipts: 'id, name, createdAt',
      microModels: 'id, updatedAt',
      observationLogs: 'id, cropId, date, updatedAt',
      personalCropDb: 'key, updatedAt',
      trackings: 'id, cropId, status, startDate, updatedAt',
    });
    // v3: per-tracking journal entries (additive — existing tables unchanged)
    this.version(3).stores({
      crops: 'id, cropName, variety, status, plantStage, parentCropId, updatedAt',
      propagations: 'id, plantName, status, updatedAt',
      reminders: 'id, type, trackingId, sendDate, updatedAt',
      stageLogs: 'id, trackingId, date, updatedAt',
      harvestLogs: 'id, cropTrackingId, harvestDate, updatedAt',
      treatmentLogs: 'id, cropId, date, updatedAt',
      cropDbAdjustments: 'id, cropKey, variety, field, updatedAt',
      propDbAdjustments: 'id, plantKey, method, updatedAt',
      batchPlantingLogs: 'id, cropTrackingId, status, updatedAt',
      cropSearchLogs: 'id, cropKey, updatedAt',
      successionGaps: 'id, updatedAt',
      activities: 'id, date, type, updatedAt',
      ledgerEntries: 'id, type, date, category, updatedAt',
      farmLands: 'id, name, updatedAt',
      farmAreas: 'id, landId, name, updatedAt',
      diaryEntries: 'id, cropName, entryType, updatedAt',
      posSales: 'id, date, receiptNumber, createdAt',
      posCustomers: 'id, name, phone, createdAt',
      posSettings: 'id',
      posInventory: 'id, name, category, updatedAt',
      posOrders: 'id, customerName, status, createdAt',
      posHeldReceipts: 'id, name, createdAt',
      microModels: 'id, updatedAt',
      observationLogs: 'id, cropId, date, updatedAt',
      personalCropDb: 'key, updatedAt',
      trackings: 'id, cropId, status, startDate, updatedAt',
      trackingEntries: 'id, trackingId, date, updatedAt',
    });
    // v4: per-observation follow-up entries (additive — existing tables unchanged)
    this.version(4).stores({
      crops: 'id, cropName, variety, status, plantStage, parentCropId, updatedAt',
      propagations: 'id, plantName, status, updatedAt',
      reminders: 'id, type, trackingId, sendDate, updatedAt',
      stageLogs: 'id, trackingId, date, updatedAt',
      harvestLogs: 'id, cropTrackingId, harvestDate, updatedAt',
      treatmentLogs: 'id, cropId, date, updatedAt',
      cropDbAdjustments: 'id, cropKey, variety, field, updatedAt',
      propDbAdjustments: 'id, plantKey, method, updatedAt',
      batchPlantingLogs: 'id, cropTrackingId, status, updatedAt',
      cropSearchLogs: 'id, cropKey, updatedAt',
      successionGaps: 'id, updatedAt',
      activities: 'id, date, type, updatedAt',
      ledgerEntries: 'id, type, date, category, updatedAt',
      farmLands: 'id, name, updatedAt',
      farmAreas: 'id, landId, name, updatedAt',
      diaryEntries: 'id, cropName, entryType, updatedAt',
      posSales: 'id, date, receiptNumber, createdAt',
      posCustomers: 'id, name, phone, createdAt',
      posSettings: 'id',
      posInventory: 'id, name, category, updatedAt',
      posOrders: 'id, customerName, status, createdAt',
      posHeldReceipts: 'id, name, createdAt',
      microModels: 'id, updatedAt',
      observationLogs: 'id, cropId, date, updatedAt',
      personalCropDb: 'key, updatedAt',
      trackings: 'id, cropId, status, startDate, updatedAt',
      trackingEntries: 'id, trackingId, date, updatedAt',
      observationEntries: 'id, observationId, date, updatedAt',
      quickNotes: 'id, updatedAt',
    });
  }
}