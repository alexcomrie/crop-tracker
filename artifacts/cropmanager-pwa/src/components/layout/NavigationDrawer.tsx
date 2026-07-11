import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { ROUTES } from '../../lib/routes';
import { X, Database, Beaker, BarChart2, FlaskConical, Bell, MapPin, BookOpen, Calendar, Settings, Home, Sprout, Leaf, Calculator, Receipt } from 'lucide-react';

interface DrawerSection {
  title: string;
  items: { label: string; icon: React.ReactNode; path: string }[];
}

const SECTIONS: DrawerSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Dashboard', icon: <Home className="w-5 h-5" />, path: ROUTES.DASHBOARD },
      { label: 'Crops', icon: <Sprout className="w-5 h-5" />, path: ROUTES.CROPS },
      { label: 'Propagations', icon: <Leaf className="w-5 h-5" />, path: ROUTES.PROPAGATIONS },
    ],
  },
  {
    title: 'Databases',
    items: [
      { label: 'Crop Database', icon: <Database className="w-5 h-5" />, path: ROUTES.MORE_CROP_DB },
      { label: 'Fertilizer Database', icon: <Beaker className="w-5 h-5" />, path: ROUTES.MORE_FERT_DB },
    ],
  },
  {
    title: 'Planning',
    items: [
      { label: 'Calculator', icon: <Calculator className="w-5 h-5" />, path: ROUTES.MORE_CALCULATOR },
      { label: 'Crop Analysis', icon: <BarChart2 className="w-5 h-5" />, path: ROUTES.MORE_HISTORY },
      { label: 'C-H Calculator', icon: <BarChart2 className="w-5 h-5" />, path: ROUTES.MORE_CH_CALC },
      { label: 'Treatment App Rates', icon: <FlaskConical className="w-5 h-5" />, path: ROUTES.MORE_TREATMENT_RATES },
    ],
  },
  {
    title: 'Schedule',
    items: [
      { label: 'Calendar', icon: <Calendar className="w-5 h-5" />, path: ROUTES.CALENDAR },
      { label: 'Area Mapper', icon: <MapPin className="w-5 h-5" />, path: ROUTES.MORE_AREA_MAPPER },
    ],
  },
  {
    title: 'Tracking',
    items: [
      { label: 'Activity Log', icon: <span className="text-lg">📋</span>, path: ROUTES.MORE_ACTIVITY },
      { label: 'Farm Ledger', icon: <span className="text-lg">📊</span>, path: ROUTES.MORE_LEDGER },
      { label: 'Point of Sale', icon: <Receipt className="w-5 h-5" />, path: ROUTES.MORE_POS },
      { label: 'Diary', icon: <BookOpen className="w-5 h-5" />, path: ROUTES.MORE_DIARY },
      { label: 'Reminders', icon: <Bell className="w-5 h-5" />, path: ROUTES.REMINDERS },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'Settings', icon: <Settings className="w-5 h-5" />, path: ROUTES.SETTINGS },
    ],
  },
];

export function NavigationDrawer() {
  const { drawerOpen, setDrawerOpen } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();

  function handleNavigate(path: string) {
    setDrawerOpen(false);
    navigate(path);
  }

  if (!drawerOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-[70]"
        onClick={() => setDrawerOpen(false)}
      />
      <div className="fixed top-0 left-0 bottom-0 w-72 bg-white z-[71] shadow-xl flex flex-col safe-top">
        <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100">
          <span className="font-bold text-lg text-green-700">CropManager</span>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-1.5 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-6">
          {SECTIONS.map((section) => (
            <div key={section.title} className="px-3 pt-4">
              <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-3 mb-2">
                {section.title}
              </h3>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => handleNavigate(item.path)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        isActive
                          ? 'bg-green-50 text-green-700 font-semibold'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className={isActive ? 'text-green-600' : 'text-gray-400'}>
                        {item.icon}
                      </span>
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
