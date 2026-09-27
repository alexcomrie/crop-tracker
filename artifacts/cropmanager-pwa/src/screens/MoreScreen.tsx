import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { NAV_SECTIONS } from '../lib/navConfig';

function MoreItem({ title, subtitle, icon, iconColor, path }: { title: string; subtitle: string; icon: React.ReactNode; iconColor?: string; path: string }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(path)} className="w-full bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4 active:scale-[0.98] transition-all text-left">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${iconColor ?? 'bg-gray-50'}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 truncate">{title}</h3>
        <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
    </button>
  );
}

export function MoreScreen() {
  return (
    <div className="min-h-screen bg-gray-50 pb-24 pt-4 px-4 space-y-6 overflow-y-auto">
      {NAV_SECTIONS.filter(s=> s.title!=='Main' && s.title!=='Settings').map(section=> (
        <section key={section.title}>
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">{section.title}</h2>
          <div className="space-y-3">
            {section.items.map(item=> (
              <MoreItem key={item.path} title={item.title ?? item.label} subtitle={item.subtitle ?? ''} icon={item.icon} iconColor={item.iconColor} path={item.path} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
