import React, { useState } from 'react';
import { WeatherWidget } from '../components/shared/WeatherWidget';
import { useDueReminders } from '../hooks/useReminders';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { formatDateShort, today, parseDate, formatDateDisplay } from '../lib/dates';
import { markReminderDone } from '../hooks/useReminders';
import { CropForm } from '../components/crops/CropForm';
import { PropForm } from '../components/props/PropForm';
import { BottomSheet } from '../components/shared/BottomSheet';
import { SuccessionGapReport } from '../components/reports/SuccessionGapReport';
import { Bell, Calendar, Database, CheckCircle2, ChevronRight, LayoutDashboard, Sprout } from 'lucide-react';

const TYPE_EMOJI: Record<string, string> = {
  harvest: 'Ready',
  transplant: 'Trans',
  spray_fungus: 'Fung',
  spray_pest: 'Pest',
  next_batch_planting: 'Batch',
  germination_check: 'Germ',
  rooting_check: 'Root',
  fert_application: 'Fert',
};

const TYPE_DOT: Record<string, string> = {
  harvest: 'bg-red-500',
  transplant: 'bg-blue-500',
  spray_fungus: 'bg-purple-500',
  spray_pest: 'bg-orange-500',
  next_batch_planting: 'bg-amber-500',
  germination_check: 'bg-amber-600',
  rooting_check: 'bg-teal-500',
  fert_application: 'bg-green-600',
};

const TYPE_TAG: Record<string, string> = {
  harvest: 'bg-red-50 text-red-600',
  transplant: 'bg-blue-50 text-blue-600',
  spray_fungus: 'bg-purple-50 text-purple-600',
  spray_pest: 'bg-orange-50 text-orange-600',
  next_batch_planting: 'bg-amber-50 text-amber-600',
  germination_check: 'bg-amber-50 text-amber-700',
  rooting_check: 'bg-teal-50 text-teal-600',
  fert_application: 'bg-green-50 text-green-700',
};

export function DashboardScreen() {
  const dueReminders = useDueReminders() ?? [];
  const todayStr = formatDateShort(today());

  const upcomingReminders = useLiveQuery(async () => {
    const all = await db.reminders.where('sent').equals(0).toArray();
    return all
      .filter(r => r.sendDate !== todayStr && parseDate(r.sendDate) && parseDate(r.sendDate)! > today())
      .sort((a, b) => (parseDate(a.sendDate)?.getTime() || 0) - (parseDate(b.sendDate)?.getTime() || 0))
      .slice(0, 5);
  }, [todayStr]) ?? [];

  const activeCropsCount = useLiveQuery(() => db.crops.where('status').equals('Active').count()) ?? 0;
  const dbEntriesCount = 34; // Constant as requested in prompt

  const [showFAB, setShowFAB] = useState(false);
  const [fabDate, setFabDate] = useState(today());
  const [showCropForm, setShowCropForm] = useState(false);
  const [showPropForm, setShowPropForm] = useState(false);
  const [showSuccession, setShowSuccession] = useState(false);

  return (
    <div className="pb-24 pt-2 bg-[#f5f5f0] min-h-screen">
      <div className="px-4 space-y-6">
        <WeatherWidget />

        {/* Today's Tasks */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em]">
              Today — {formatDateDisplay(today())}
            </h2>
          </div>
          
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {dueReminders.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium text-gray-400">All tasks completed for today</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {dueReminders.map(r => (
                  <div 
                    key={r.id} 
                    className="p-4 flex items-center gap-3 active:bg-gray-50 transition-colors"
                    onClick={() => markReminderDone(r.id)}
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${TYPE_DOT[r.type] || 'bg-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[13px] text-gray-900 truncate">
                        {r.subject.split(':').pop()?.trim()} — {r.cropPlantName}
                      </p>
                    </div>
                    <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${TYPE_TAG[r.type] || 'bg-gray-100 text-gray-500'}`}>
                      {TYPE_EMOJI[r.type] || 'Task'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Overview Stats */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em]">
              Overview
            </h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-gray-200 rounded-2xl p-4 text-center shadow-sm">
              <p className="text-3xl font-bold text-[#2d6a2d]">{activeCropsCount}</p>
              <p className="text-[11px] text-gray-500 font-medium mt-1">Active crops</p>
            </div>
            <button 
              onClick={() => setShowSuccession(true)}
              className="bg-white border border-gray-200 rounded-2xl p-4 text-center shadow-sm active:scale-95 transition-transform group"
            >
              <div className="text-xl font-bold text-[#2d6a2d] group-hover:scale-110 transition-transform flex justify-center"><LayoutDashboard className="w-6 h-6" /></div>
              <p className="text-[11px] text-gray-500 font-medium mt-1">Succession</p>
            </button>
            <div className="bg-white border border-gray-200 rounded-2xl p-4 text-center shadow-sm">
              <p className="text-3xl font-bold text-[#2d6a2d]">{dbEntriesCount}</p>
              <p className="text-[11px] text-gray-500 font-medium mt-1">DB entries</p>
            </div>
          </div>
        </section>

        {/* Upcoming */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em]">
              Upcoming
            </h2>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {upcomingReminders.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400 italic">No upcoming tasks scheduled</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {upcomingReminders.map(r => (
                  <div key={r.id} className="p-4 flex items-center gap-3 opacity-80">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${TYPE_DOT[r.type] || 'bg-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[13px] text-gray-900 truncate">
                        <span className="text-[#2d6a2d] font-bold mr-2 text-[11px]">{formatDateDisplay(parseDate(r.sendDate)!).split(',')[0]}</span>
                        {r.subject.split(':').pop()?.trim()} — {r.cropPlantName}
                      </p>
                    </div>
                    <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${TYPE_TAG[r.type] || 'bg-gray-100 text-gray-500'}`}>
                      {TYPE_EMOJI[r.type] || 'Task'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowFAB(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-green-700 text-white rounded-full shadow-xl flex items-center justify-center text-2xl z-40 hover:bg-green-800 active:scale-90 transition-all border-4 border-white"
      >
        <Sprout className="w-6 h-6" />
      </button>

      {/* Quick Add Sheet */}
      <BottomSheet open={showFAB} onClose={() => setShowFAB(false)} title="Quick Add Action" position="center">
        <div className="pt-2 space-y-4">
          <div className="flex gap-3">
            <button
              onClick={() => { setShowFAB(false); setShowCropForm(true); }}
              className="flex-1 bg-green-50 border border-green-100 rounded-2xl p-6 text-center hover:bg-green-100 transition-colors"
            >
              <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center text-white mx-auto mb-3 shadow-lg shadow-green-200">
                <Sprout className="w-6 h-6" />
              </div>
              <p className="font-bold text-green-900">Track Crop</p>
              <p className="text-[10px] text-green-700 uppercase font-bold mt-1">Start Logging</p>
            </button>
            <button
              onClick={() => { setShowFAB(false); setShowPropForm(true); }}
              className="flex-1 bg-blue-50 border border-blue-100 rounded-2xl p-6 text-center hover:bg-blue-100 transition-colors"
            >
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white mx-auto mb-3 shadow-lg shadow-blue-200">
                <Database className="w-6 h-6" />
              </div>
              <p className="font-bold text-blue-900">Propagation</p>
              <p className="text-[10px] text-blue-700 uppercase font-bold mt-1">Cuttings/Seeds</p>
            </button>
          </div>
        </div>
      </BottomSheet>

      <CropForm open={showCropForm} onClose={() => setShowCropForm(false)} date={fabDate} />
      <PropForm open={showPropForm} onClose={() => setShowPropForm(false)} date={fabDate} />

      <BottomSheet open={showSuccession} onClose={() => setShowSuccession(false)} title="Succession Gap Analysis" position="center">
        <SuccessionGapReport />
      </BottomSheet>
    </div>
  );
}
