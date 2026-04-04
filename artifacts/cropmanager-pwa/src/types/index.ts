// ─── crop_database.json ───────────────────────────────────────────────────────

export interface CropData {
  display_name: string;
  varieties: string[];
  plant_type: string;
  number_of_weeks_harvest: number;
  growing_time_days: number;
  transplant_days: number | null;
  growing_from_transplant: number | null;
  harvest_interval: number;
  batch_offset_days: number;
  germination_days_min: number;
  germination_days_max: number;
  fungus_spray_days: number[];
  pest_spray_days: number[];
  planting_method: string;
  diseases: string[];
  pests: string[];
  consistent_harvest: boolean;
}

export interface CropDbAlias {
  alias: string;
}

export type CropDbRecord = CropData | CropDbAlias;

export interface CropDatabase {
  [key: string]: CropDbRecord;
}

// ─── fertilizer_schedule.json ─────────────────────────────────────────────────

export interface FertMix {
  mix_parts?: {
    cow_manure_tea?: number;
    chicken_manure_tea?: number;
    plant_based_tea?: number;
    wood_ash_tea?: number;
    [key: string]: number | undefined;
  };
  final_dilution: number | string;
  yeast_tsp_per_litre?: number;
  yeast_tbsp_per_5L?: number;
  mixing_example?: string;
  note?: string;
  frequency?: string;
}

export interface FertStage {
  description?: string;
  foliar?: FertMix;
  drench?: FertMix;
}

export interface FertCropEntry {
  display_name: string;
  plant_type: string;
  fert_profile: string;
  stages: {
    seedling: FertStage;
    mid_vegetative: FertStage;
    flowering: FertStage;
    fruiting: FertStage;
  };
}

export interface FertMeta {
  version: string;
  description: string;
  teas: Record<string, string>;
  yeast_preparation: string;
  yeast_dosing: { foliar_spray: string; soil_drench: string };
  thyme_oil_mosquito_control: string;
  application_tips: string[];
  dilution_note: string;
}

export interface FertDatabase {
  _meta: FertMeta;
  crops: Record<string, FertCropEntry>;
  [key: string]: any; // To support older lookups
}

// Support for older code
export type FertProfile = FertCropEntry | {
  seedling?: FertStage;
  mid_vegetative?: FertStage;
  flowering?: FertStage;
  fruiting?: FertStage;
  _meta?: Partial<FertMeta>;
};

export interface Crop {
  id: string;
  cropName: string;
  variety: string;
  plantingMethod: string;
  plantStage: string;
  plantingDate: string;
  transplantDateScheduled: string;
  transplantDateActual: string;
  germinationDate: string;
  harvestDateEstimated: string;
  harvestDateActual: string;
  isContinuous: boolean;
  harvestFrequency?: number; // Days between harvests
  numPlots?: number;         // Calculated number of plots
  batchOffset?: number;      // Days between plantings
  parentCropId?: string;     // Link to the original crop for C-H promotion
  nextConsistentPlanting: string;
  batchNumber: number;
  fungusSprayDates: string;
  pestSprayDates: string;
  status: string;
  notes: string;
  daysSeedGerm: number;
  daysGermTransplant: number;
  daysTransplantHarvest: number;
  telegramChatId: string;
  updatedAt: number;
}

export interface Propagation {
  id: string;
  plantName: string;
  propagationDate: string;
  propagationMethod: string;
  notes: string;
  expectedRootingStart: string;
  expectedRootingEnd: string;
  actualRootingDate: string;
  daysToRootActual: number;
  status: string;
  telegramChatId: string;
  updatedAt: number;
}

export interface Reminder {
  id: string;
  type: string;
  cropPlantName: string;
  trackingId: string;
  sendDate: string;
  subject: string;
  body: string;
  sent: boolean;
  telegramSent?: boolean;
  chatId: string;
  updatedAt: number;
}

export interface StageLog {
  id: string;
  trackingId: string;
  cropName: string;
  variety: string;
  stageFrom: string;
  stageTo: string;
  date: string;
  daysElapsed: number;
  method: string;
  notes: string;
  updatedAt: number;
}

export interface HarvestLog {
  id: string;
  cropTrackingId: string;
  cropName: string;
  harvestNumber: number;
  harvestDate: string;
  daysFromPlanting: number;
  deviationFromDb: number;
  notes: string;
  updatedAt: number;
}

export interface TreatmentLog {
  id: string;
  cropId: string;
  cropName: string;
  date: string;
  daysFromPlanting: number;
  type: string;
  product: string;
  notes: string;
  updatedAt: number;
}

export interface CropDbAdjustment {
  id: string;
  cropKey: string;
  variety: string;
  field: string;
  databaseDefault: number;
  yourAverage: number;
  sampleCount: number;
  useCustom: string;
  lastUpdated: string;
  updatedAt: number;
}

export interface PropDbAdjustment {
  id: string;
  plantKey: string;
  method: string;
  dbDefaultRootingDays: number;
  yourAverage: number;
  sampleCount: number;
  useCustom: string;
  lastUpdated: string;
  updatedAt: number;
}

export interface BatchPlantingLog {
  id: string;
  cropTrackingId: string;
  cropName: string;
  batchNumber: number;
  batchPlantingDate: string;
  confirmedPlantedDate: string;
  nextBatchDate: string;
  status: string;
  notes: string;
  updatedAt: number;
}

export interface CropSearchLog {
  id: string;
  cropKey: string;
  searchDate: string;
  growingTimeFound: number;
  germinationDaysMin: number;
  germinationDaysMax: number;
  sourceSummary: string;
  appliedToTracker: boolean;
  updatedAt: number;
}

export interface AppSettings {
  cropsSheetUrl: string;
  propagationsSheetUrl: string;
  remindersSheetUrl: string;
  stageLogsSheetUrl: string;
  harvestLogsSheetUrl: string;
  treatmentLogsSheetUrl: string;
  cropDbAdjustmentSheetUrl: string;
  propDbAdjustmentSheetUrl: string;
  batchPlantingLogSheetUrl: string;
  cropSearchLogSheetUrl: string;
  telegramToken: string;
  telegramChatId: string;
  weatherLat: number;
  weatherLon: number;
  weatherLocation: string;
  rainThresholdMm: number;
  learningThreshold: number;
  monthsOfPlantingDates: number;
  lastSyncAt: number;
  syncEnabled: boolean;
  autoSyncHour: number;
}

export interface DayForecast {
  date: string;
  tempMax: number;
  tempMin: number;
  precipMm: number;
  weatherCode: number;
  label: string;
  emoji: string;
}

export interface FertScheduleStage {
  key: string;
  label: string;
  foliarStr: string;
  foliarMixExample: string;
  drenchStr: string;
  drenchMixExample: string;
  frequency: string;
  note: string;
}

export interface FertScheduleData {
  teas: { name: string; description: string }[];
  yeastPrep: string;
  yeastDosing: string;
  dilutionNote: string;
  thymeOilTip: string;
  stages: FertScheduleStage[];
  applicationRules: string[];
  currentActiveStageKey: string;
}
