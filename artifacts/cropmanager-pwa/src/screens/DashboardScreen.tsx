import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WeatherWidget } from '../components/shared/WeatherWidget';
import { LandPlotPreview } from '../components/area/LandPlotPreview';
import { useTodayReminders } from '../hooks/useReminders';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { formatDateShort, today, parseDate, formatDateDisplay, daysBetween } from '../lib/dates';
import { markReminderDone } from '../hooks/useReminders';
import { PropForm } from '../components/props/PropForm';
import { AddEntrySheet } from '../components/shared/AddEntrySheet';
import { CheckCircle2, Sprout } from 'lucide-react';
import { setAppBadge, clearAppBadge, playAlert } from '../lib/notifications';
import { TYPE_EMOJI, TYPE_DOT, TYPE_TAG } from '../lib/reminderUi';
import { ROUTES } from '../lib/routes';

export function DashboardScreen() {
  const navigate = useNavigate();
  const todayReminders = useTodayReminders() ?? [];
  const todayStr = formatDateShort(today());

const upcomingData = useLiveQuery(async () => {
    const all = await db.reminders.toArray()
    return all
      .filter(r => !r.sent && r.sendDate && r.sendDate !== todayStr && parseDate(r.sendDate) && parseDate(r.sendDate)! > today())
      .sort((a, b) => (parseDate(a.sendDate)?.getTime() || 0) - (parseDate(b.sendDate)?.getTime() || 0))
      .slice(0, 5)
  }, [todayStr]);
  const upcomingReminders = upcomingData ?? [];
  const upcomingLoading = upcomingData === undefined;

  const activeCropsData = useLiveQuery(() => db.crops.where('status').equals('Active').count());
  const activeCropsCount = activeCropsData ?? 0;
  const countsLoading = activeCropsData === undefined;

  const [showFAB, setShowFAB] = useState(false);
  const [showPropForm, setShowPropForm] = useState(false);

  useEffect(() => {
    const count = todayReminders.length;
    if (count > 0) {
      setAppBadge(count);
      const alertedKey = `alerted_${todayStr}`;
      // keep only today + yesterday, clean older keys (prevent leak)
      try {
        for (let i=0; i<localStorage.length; i++) {
          const k=localStorage.key(i);
          if (k && k.startsWith('alerted_') && k!==alertedKey) {
            // keep yesterday to avoid double alert after midnight, remove older
            const dayPart=k.replace('alerted_','');
            if (dayPart !== todayStr) {
              // if not today, remove if older than 2 days parse attempt
              const d=parseDate(dayPart);
              if (!d || daysBetween(d, today())>1) { localStorage.removeItem(k); i--; }
            }
          }
        }
      } catch {}
      if (!localStorage.getItem(alertedKey)) {
        playAlert();
        try { localStorage.setItem(alertedKey, '1'); } catch {}
      }
    } else {
      clearAppBadge();
    }
  }, [todayReminders, todayStr]);

  return (
    <div className="pb-24 pt-2 bg-[#f5f5f0] min-h-screen">
      <div className="px-4 space-y-6">
        <WeatherWidget />

        {/* Status badges */}
        <div className="flex gap-2">
          <button
            onClick={() => navigate(ROUTES.CROPS)}
            className="flex-1 bg-white border border-gray-200 rounded-2xl py-2.5 px-3 shadow-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            <span className="text-lg" aria-hidden="true">🌱</span>
            {countsLoading ? (
              <span className="w-5 h-5 border-2 border-[#2d6a2d] border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="text-xl font-bold text-[#2d6a2d]">{activeCropsCount}</span>
            )}
            <span className="text-[11px] text-gray-500 font-medium">crops</span>
          </button>
          <button
            onClick={() => navigate(ROUTES.REMINDERS)}
            className="flex-1 bg-white border border-gray-200 rounded-2xl py-2.5 px-3 shadow-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            <span className="text-lg" aria-hidden="true">🔔</span>
            {upcomingLoading ? (
              <span className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="text-xl font-bold text-amber-600">{todayReminders.length + upcomingReminders.length}</span>
            )}
            <span className="text-[11px] text-gray-500 font-medium">upcoming</span>
          </button>
        </div>

        {/* Tasks — today pinned on top, then upcoming */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em]">
              Tasks — {formatDateDisplay(today())}
            </h2>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {upcomingLoading ? (
              <div className="flex flex-col items-center justify-center py-10">
                <div className="w-8 h-8 border-2 border-[#2d6a2d] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : todayReminders.length === 0 && upcomingReminders.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium text-gray-400">All tasks completed for today</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {todayReminders.map(r => (
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

        {/* Land & Plot Map Preview */}
        <section>
          <LandPlotPreview />
        </section>
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowFAB(true)}
        aria-label="Quick add"
        className="fixed right-4 w-14 h-14 bg-green-700 text-white rounded-full shadow-xl flex items-center justify-center text-2xl z-40 hover:bg-green-800 active:scale-90 transition-all border-4 border-white"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <Sprout className="w-6 h-6" />
      </button>

      {/* Quick Add Sheet (shared with crop list) */}
      <AddEntrySheet
        open={showFAB}
        onClose={() => setShowFAB(false)}
        onSelectCrop={() => { setShowFAB(false); navigate(ROUTES.CROP_CREATE); }}
        onSelectPropagation={() => { setShowFAB(false); setShowPropForm(true); }}
      />

      <PropForm open={showPropForm} onClose={() => setShowPropForm(false)} date={today()} />
    </div>
  );
}
