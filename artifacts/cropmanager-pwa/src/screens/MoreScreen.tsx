import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Calendar, Database, Beaker, ShieldAlert, Bell, ChevronRight } from 'lucide-react';
import { CropDatabaseScreen } from '../components/CropDatabaseScreen';
import { FertilizerDatabaseScreen } from '../components/FertilizerDatabaseScreen';

interface MoreItemProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconColor: string;
  onClick: () => void;
}

function MoreItem({ title, subtitle, icon, iconColor, onClick }: MoreItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4 active:scale-[0.98] transition-all text-left"
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${iconColor}`}>
        {icon}
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-300" />
    </button>
  );
}

export function MoreScreen() {
  const { setActiveTab } = useAppStore();
  const [activePanel, setActivePanel] = useState<'crop-db' | 'fert-db' | null>(null);

  return (
    <div className="relative h-full overflow-hidden">
      <div className="pb-24 pt-4 px-4 space-y-6 overflow-y-auto h-full">
        <section>
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Databases</h2>
          <div className="space-y-3">
            <MoreItem
              title="Crop Database"
              subtitle="View and edit crop timings, varieties, sprays"
              icon={<Database className="w-6 h-6 text-green-600" />}
              iconColor="bg-green-50"
              onClick={() => setActivePanel('crop-db')}
            />
            <MoreItem
              title="Fertilizer Database"
              subtitle="Edit 5-tea mix ratios per crop & stage"
              icon={<Beaker className="w-6 h-6 text-amber-600" />}
              iconColor="bg-amber-50"
              onClick={() => setActivePanel('fert-db')}
            />
            <MoreItem
              title="Herbicide Schedule"
              subtitle="Manage herbicide application timing"
              icon={<ShieldAlert className="w-6 h-6 text-red-600" />}
              iconColor="bg-red-50"
              onClick={() => setActiveTab('herb-schedule')}
            />
            <MoreItem
              title="Reminders"
              subtitle="View and manage queued Telegram reminders"
              icon={<Bell className="w-6 h-6 text-purple-600" />}
              iconColor="bg-purple-50"
              onClick={() => setActiveTab('reminders')}
            />
          </div>
        </section>

        <section>
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Schedule</h2>
          <div className="space-y-3">
            <MoreItem
              title="Calendar"
              subtitle="View all upcoming events and tasks"
              icon={<Calendar className="w-6 h-6 text-green-600" />}
              iconColor="bg-green-50"
              onClick={() => setActiveTab('calendar')}
            />
          </div>
        </section>
      </div>

      {/* Slide-in Panels */}
      {activePanel === 'crop-db' && (
        <div className="fixed inset-0 z-[60] bg-white">
          <CropDatabaseScreen onClose={() => setActivePanel(null)} />
        </div>
      )}
      {activePanel === 'fert-db' && (
        <div className="fixed inset-0 z-[60] bg-white">
          <FertilizerDatabaseScreen onClose={() => setActivePanel(null)} />
        </div>
      )}
    </div>
  );
}
