import Dexie, { type Table } from 'dexie';
import type {
  Crop, Propagation, Reminder, StageLog, HarvestLog,
  TreatmentLog, CropDbAdjustment, PropDbAdjustment,
  BatchPlantingLog, CropSearchLog, LedgerEntry, FarmArea, FarmLand,
  DiaryEntry, PosSale, PosCustomer, PosSettings, PosInventoryItem,
  PosOrder, PosHeldReceipt
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
    this.version(6).stores({
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
      diaryEntries: 'id, cropName, entryType, updatedAt',
    }).upgrade(async tx => {
      const existing = await tx.table('diaryEntries').count();
      if (existing > 0) return;
      const stageLogs = await tx.table('stageLogs').toArray();
      const crops = await tx.table('crops').toArray();
      const cropMap = new Map(crops.map(c => [c.id, c]));
      const entries: any[] = [];
      for (const sl of stageLogs) {
        const crop = cropMap.get(sl.trackingId);
        if (crop) {
          entries.push({
            id: `DE_${sl.id}`,
            date: sl.date ? sl.date.split('T')[0] : '',
            entryType: 'stage_change',
            cropId: sl.trackingId,
            cropName: crop.cropName,
            variety: crop.variety || '',
            description: `Stage changed: ${sl.stageFrom || '?'} → ${sl.stageTo || '?'}`,
            details: '',
            updatedAt: sl.updatedAt || Date.now(),
          });
        }
      }
      const harvestLogs = await tx.table('harvestLogs').toArray();
      for (const hl of harvestLogs) {
        const crop = cropMap.get(hl.cropTrackingId);
        if (crop) {
          entries.push({
            id: `DE_${hl.id}`,
            date: hl.harvestDate ? hl.harvestDate.split('T')[0] : '',
            entryType: 'harvest',
            cropId: hl.cropTrackingId,
            cropName: crop.cropName,
            variety: crop.variety || '',
            description: `Harvest #${hl.harvestNumber || 1}: ${crop.cropName}`,
            details: hl.daysFromPlanting ? `Days from planting: ${hl.daysFromPlanting}d` : '',
            updatedAt: hl.updatedAt || Date.now(),
          });
        }
      }
      const treatmentLogs = await tx.table('treatmentLogs').toArray();
      for (const tl of treatmentLogs) {
        const crop = cropMap.get(tl.cropId);
        if (crop) {
          entries.push({
            id: `DE_${tl.id}`,
            date: tl.date ? tl.date.split('T')[0] : '',
            entryType: 'treatment',
            cropId: tl.cropId,
            cropName: crop.cropName,
            variety: crop.variety || '',
            description: tl.product ? `${tl.type}: ${tl.product}` : `Treatment: ${tl.type}`,
            details: tl.notes || '',
            updatedAt: tl.updatedAt || Date.now(),
          });
        }
      }
      if (entries.length > 0) {
        await tx.table('diaryEntries').bulkAdd(entries);
      }
    });
    this.version(7).stores({
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
      diaryEntries: 'id, cropName, entryType, updatedAt',
      posSales: 'id, date, receiptNumber, customerId, createdAt',
      posCustomers: 'id, name, phone, createdAt',
      posSettings: 'id',
    });
    this.version(8).stores({
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
      diaryEntries: 'id, cropName, entryType, updatedAt',
      posSales: 'id, date, receiptNumber, customerId, createdAt',
      posCustomers: 'id, name, phone, createdAt',
      posSettings: 'id',
      posInventory: 'id, name, category, isActive, updatedAt',
    }).upgrade(async tx => {
      const customers = await tx.table('posCustomers').toArray();
      for (const c of customers) {
        if ((c as any).pointsBalance === undefined) {
          await tx.table('posCustomers').update(c.id, { pointsBalance: 0, pointsLifetime: 0 });
        }
      }
    });
    this.version(9).stores({
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
      diaryEntries: 'id, cropName, entryType, updatedAt',
      posSales: 'id, date, receiptNumber, customerId, createdAt',
      posCustomers: 'id, name, phone, createdAt',
      posSettings: 'id',
      posInventory: 'id, name, category, isActive, updatedAt',
      posOrders: 'id, customerName, status, createdAt, deliveredAt',
      posHeldReceipts: 'id, name, createdAt',
    }).upgrade(async tx => {
      const settings = await tx.table('posSettings').toArray();
      for (const s of settings) {
        if ((s as any).testMode === undefined) {
          await tx.table('posSettings').update(s.id, { testMode: false });
        }
      }
    });
  }
}