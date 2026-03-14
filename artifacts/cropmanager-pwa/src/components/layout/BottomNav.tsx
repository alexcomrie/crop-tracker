import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';

const TABS = [
  { id: 'dashboard', emoji: '🏠', label: 'Dashboard' },
  { id: 'crops', emoji: '🌱', label: 'Crops' },
  { id: 'propagations', emoji: '🌿', label: 'Props' },
  { id: 'more', emoji: '⋯', label: 'More' },
  { id: 'settings', emoji: '⚙️', label: 'Settings' },
];

export function BottomNav() {
  const { activeTab, setActiveTab } = useAppStore();
  const { pendingCount } = useSyncStore();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-bottom">
      <div className="flex">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] relative transition-colors ${activeTab === tab.id ? 'text-green-700' : 'text-gray-500'}`}
          >
            <span className="text-xl leading-none">{tab.emoji}</span>
            <span className={`text-xs leading-none ${activeTab === tab.id ? 'font-semibold' : ''}`}>{tab.label}</span>
            {tab.id === 'settings' && pendingCount > 0 && (
              <span className="absolute top-1 right-2 bg-amber-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
