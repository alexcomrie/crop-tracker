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
  remindersEnabled: true,
  reminderSound: true,
  reminderTone: 'chime',
  reminderVibrate: true,
  reminderBadge: true,
  reminderKinds: {},
};

/** Merge stored settings over defaults (old installs lack the newer keys). */
export function withReminderDefaults(s: AppSettings): Required<Pick<AppSettings,
  'remindersEnabled' | 'reminderSound' | 'reminderTone' | 'reminderVibrate' | 'reminderBadge'>> & { reminderKinds: Record<string, boolean> } {
  return {
    remindersEnabled: s.remindersEnabled ?? true,
    reminderSound: s.reminderSound ?? true,
    reminderTone: s.reminderTone ?? 'chime',
    reminderVibrate: s.reminderVibrate ?? true,
    reminderBadge: s.reminderBadge ?? true,
    reminderKinds: s.reminderKinds ?? {},
  };
}

/** True unless the user disabled this reminder type in Settings. */
export function isReminderKindAllowed(s: AppSettings, type: string): boolean {
  const kinds = s.reminderKinds ?? {};
  return kinds[type] ?? true;
}

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
