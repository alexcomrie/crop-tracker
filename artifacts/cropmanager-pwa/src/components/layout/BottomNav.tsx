import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../lib/routes';
import { showBottomNav } from '../../lib/routes';

const TABS = [
  { id: 'dashboard', path: ROUTES.DASHBOARD, emoji: '🏠', label: 'Dashboard' },
  { id: 'crops', path: ROUTES.CROPS, emoji: '🌱', label: 'Crops' },
  { id: 'propagations', path: ROUTES.PROPAGATIONS, emoji: '🌿', label: 'Props' },
  { id: 'more', path: ROUTES.MORE, emoji: '⋯', label: 'More' },
  { id: 'settings', path: ROUTES.SETTINGS, emoji: '⚙️', label: 'Settings' },
];

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  if (!showBottomNav(location.pathname)) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-bottom">
      <div className="flex">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => navigate(tab.path)}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] relative transition-colors ${location.pathname === tab.path ? 'text-green-700' : 'text-gray-500'}`}
          >
            <span className="text-xl leading-none">{tab.emoji}</span>
            <span className={`text-xs leading-none ${location.pathname === tab.path ? 'font-semibold' : ''}`}>{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
