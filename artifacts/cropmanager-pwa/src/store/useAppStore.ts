import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings, CropDatabase, FertDatabase } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  spreadsheetId: import.meta.env.VITE_SPREADSHEET_ID || '1TGpt9rvRUeQwnSxo6n8X271VeZW2m4m4nYwsi8iHBx8',
  gasWebAppUrl: import.meta.env.VITE_GAS_URL || 'https://script.google.com/macros/s/AKfycbzSZhdgpaO_AAv6zWJxRKtIOWlzI4mqRzFP7jKSp_8-9PkT-qwCoHJT7qaEMG-5sFlLEA/exec',
  syncToken: import.meta.env.VITE_SYNC_TOKEN || 'CropMgr_Alex_2026',
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
