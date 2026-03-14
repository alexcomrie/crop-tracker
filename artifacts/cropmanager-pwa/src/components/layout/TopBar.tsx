import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { CloudOff } from 'lucide-react';

const TITLES: Record<string, string> = {
  dashboard: 'CropManager',
  crops: '🌱 Crops',
  propagations: '🌿 Propagations',
  calendar: '📅 Calendar',
  settings: '⚙️ Settings',
};

export function TopBar() {
  const { activeTab } = useAppStore();
  const isOnline = navigator.onLine;

  return (
    <header className="fixed top-0 left-0 right-0 bg-green-700 text-white z-40 safe-top">
      <div className="flex items-center justify-between px-4 h-14">
        <h1 className="font-bold text-lg">{TITLES[activeTab] ?? 'CropManager'}</h1>
        <div className="flex items-center gap-3">
          {!isOnline && <CloudOff className="w-4 h-4 text-orange-300" />}
        </div>
      </div>
    </header>
  );
}
