import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';

const TITLES: Record<string, string> = {
  dashboard: 'CropManager',
  crops: '🌱 Crops',
  propagations: '🌿 Propagations',
  calendar: '📅 Calendar',
  settings: '⚙️ Settings',
};

export function TopBar() {
  const { activeTab } = useAppStore();
  return (
    <header className="fixed top-0 left-0 right-0 bg-green-700 text-white z-40 safe-top">
      <div className="flex items-center justify-between px-4 h-14">
        <h1 className="font-bold text-lg">{TITLES[activeTab] ?? 'CropManager'}</h1>
      </div>
    </header>
  );
}
