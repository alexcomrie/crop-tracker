import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings, CropDatabase, FertDatabase } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  cropsSheetUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR2ozY2amP92pxMxyTIuvJsZYegfd69941Ic-RDTmfl-xi-yADUws_v6Qyyda34vM6jnoOaIrJ-00gH/pub?output=csv',
  propagationsSheetUrl: '',
  remindersSheetUrl: '',
  stageLogsSheetUrl: '',
  harvestLogsSheetUrl: '',
  treatmentLogsSheetUrl: '',
  cropDbAdjustmentSheetUrl: '',
  propDbAdjustmentSheetUrl: '',
  batchPlantingLogSheetUrl: '',
  cropSearchLogSheetUrl: '',
  telegramToken: '8785143281:AAEheLMeADsaHftaPEB9CP8boc0--mHgjLQ',
  telegramChatId: '5837914244',
  weatherLat: 18.4358,
  weatherLon: -77.2010,
  weatherLocation: "Saint Ann's Bay",
  rainThresholdMm: 5,
  learningThreshold: 3,
  monthsOfPlantingDates: 3,
  lastSyncAt: 0,
  syncEnabled: true,
  autoSyncHour: 23,
};

interface AppStore {
  settings: AppSettings;
  cropDb: CropDatabase;
  fertDb: FertDatabase;
  activeTab: string;
  lastSyncAt: number;
  updateSettings: (patch: Partial<AppSettings>) => void;
  setCropDb: (db: CropDatabase) => void;
  setFertDb: (db: FertDatabase) => void;
  setActiveTab: (tab: string) => void;
  setLastSyncAt: (ts: number) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      cropDb: {},
      fertDb: {},
      activeTab: 'dashboard',
      lastSyncAt: 0,
      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      setCropDb: (db) => set({ cropDb: db }),
      setFertDb: (db) => set({ fertDb: db }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setLastSyncAt: (ts) => set({ lastSyncAt: ts }),
    }),
    {
      name: 'cropmanager_settings',
      partialize: (s) => ({ 
        settings: s.settings, 
        lastSyncAt: s.lastSyncAt,
        cropDb: s.cropDb,
        fertDb: s.fertDb
      }),
    }
  )
);
