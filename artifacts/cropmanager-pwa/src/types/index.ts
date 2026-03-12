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
  syncStatus: 'clean' | 'pending';
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
  syncStatus: 'clean' | 'pending';
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
  chatId: string;
  syncStatus: 'clean' | 'pending';
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
  syncStatus: 'clean' | 'pending';
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
  syncStatus: 'clean' | 'pending';
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
  syncStatus: 'clean' | 'pending';
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
  syncStatus: 'clean' | 'pending';
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
  syncStatus: 'clean' | 'pending';
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
  syncStatus: 'clean' | 'pending';
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
  syncStatus: 'clean' | 'pending';
  updatedAt: number;
}

export interface AppSettings {
  spreadsheetId: string;
  gasWebAppUrl: string;
  syncToken: string;
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

export interface CropData {
  display_name: string;
  varieties?: string[];
  germination_days_min: number;
  germination_days_max: number;
  growing_time_days: number;
  transplant_days?: number;
  growing_from_transplant?: number;
  batch_offset_days?: number;
  fungus_spray_days: number[];
  pest_spray_days: number[];
  consistent_harvest: boolean;
  number_of_weeks_harvest?: number;
  diseases?: string[];
  pests?: string[];
}

export interface CropDatabase {
  [key: string]: CropData;
}

export interface FertStage {
  foliar?: {
    mix_parts?: Record<string, string | number>;
    dilution?: string;
    final_dilution?: string;
    frequency?: string;
    notes?: string;
    mixing_example?: string;
  };
  drench?: {
    mix_parts?: Record<string, string | number>;
    dilution?: string;
    final_dilution?: string;
    frequency?: string;
    notes?: string;
    mixing_example?: string;
  };
}

export interface FertProfile {
  seedling?: FertStage;
  mid_vegetative?: FertStage;
  flowering?: FertStage;
  fruiting?: FertStage;
  _meta?: {
    teas?: Record<string, string>;
    yeast_preparation?: string;
    yeast_dosing?: string;
    dilution_note?: string;
    thyme_oil_mosquito_control?: string;
    application_tips?: string[];
  };
}

export interface FertDatabase {
  [key: string]: FertProfile;
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
