import { create } from 'zustand';

interface SyncStore {
  pendingCount: number;
  lastSyncAt: number;
  syncErrors: string[];
  isSyncing: boolean;
  syncProgress: string;
  setPendingCount: (n: number) => void;
  setLastSyncAt: (ts: number) => void;
  addSyncError: (err: string) => void;
  clearSyncErrors: () => void;
  setIsSyncing: (b: boolean) => void;
  setSyncProgress: (s: string) => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  pendingCount: 0,
  lastSyncAt: 0,
  syncErrors: [],
  isSyncing: false,
  syncProgress: '',
  setPendingCount: (n) => set({ pendingCount: n }),
  setLastSyncAt: (ts) => set({ lastSyncAt: ts }),
  addSyncError: (err) => set((s) => ({ syncErrors: [...s.syncErrors.slice(-9), err] })),
  clearSyncErrors: () => set({ syncErrors: [] }),
  setIsSyncing: (b) => set({ isSyncing: b }),
  setSyncProgress: (p) => set({ syncProgress: p }),
}));
