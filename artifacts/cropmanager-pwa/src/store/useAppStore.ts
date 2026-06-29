import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings, CropDatabase, FertDatabase } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  telegramToken: '',
  telegramChatId: '',
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
  lastSyncAt: number;
  drawerOpen: boolean;
  updateSettings: (patch: Partial<AppSettings>) => void;
  setCropDb: (db: CropDatabase) => void;
  setFertDb: (db: FertDatabase) => void;
  setLastSyncAt: (ts: number) => void;
  setDrawerOpen: (open: boolean) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      cropDb: {},
      fertDb: {
        _meta: {
          version: '1.0',
          description: '',
          teas: {},
          yeast_preparation: '',
          yeast_dosing: { foliar_spray: '', soil_drench: '' },
          thyme_oil_mosquito_control: '',
          application_tips: [],
          dilution_note: ''
        },
        crops: {}
      },
      lastSyncAt: 0,
      drawerOpen: false,
      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      setCropDb: (db) => set({ cropDb: db }),
      setFertDb: (db) => set({ fertDb: db }),
      setLastSyncAt: (ts) => set({ lastSyncAt: ts }),
      setDrawerOpen: (open) => set({ drawerOpen: open }),
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
