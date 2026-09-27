import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { X } from 'lucide-react';
import { NAV_SECTIONS } from '../../lib/navConfig';

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
      <div className="fixed inset-0 bg-black/40 z-[70]" onClick={() => setDrawerOpen(false)} />
      <div className="fixed top-0 left-0 bottom-0 w-72 bg-white z-[71] shadow-xl flex flex-col safe-top">
        <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100">
          <span className="font-bold text-lg text-green-700">CropManager</span>
          <button onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto pb-6">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="px-3 pt-4">
              <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-3 mb-2">{section.title}</h3>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <button key={item.path} onClick={() => handleNavigate(item.path)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive ? 'bg-green-50 text-green-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}>
                      <span className={isActive ? 'text-green-600' : 'text-gray-400'}>{item.icon}</span>
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
