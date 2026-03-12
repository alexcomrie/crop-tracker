import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings, CropDatabase, FertDatabase } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  spreadsheetId: '',
  gasWebAppUrl: '',
  syncToken: '',
  telegramChatId: '5837914224',
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
  updateSettings: (patch: Partial<AppSettings>) => void;
  setCropDb: (db: CropDatabase) => void;
  setFertDb: (db: FertDatabase) => void;
  setActiveTab: (tab: string) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      cropDb: {},
      fertDb: {},
      activeTab: 'dashboard',
      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      setCropDb: (db) => set({ cropDb: db }),
      setFertDb: (db) => set({ fertDb: db }),
      setActiveTab: (tab) => set({ activeTab: tab }),
    }),
    {
      name: 'cropmanager_settings',
      partialize: (s) => ({ settings: s.settings }),
    }
  )
);
