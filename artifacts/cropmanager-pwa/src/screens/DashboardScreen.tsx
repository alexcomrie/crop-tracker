import React, { useState } from 'react';
import { WeatherWidget } from '../components/shared/WeatherWidget';
import { useDueReminders } from '../hooks/useReminders';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db/db';
import { formatDateShort, today, parseDate } from '../lib/dates';
import { markReminderDone } from '../hooks/useReminders';
import { CropForm } from '../components/crops/CropForm';
import { PropForm } from '../components/props/PropForm';
import { BottomSheet } from '../components/shared/BottomSheet';

const TYPE_EMOJI: Record<string, string> = {
  harvest: '🥬',
  transplant: '🌱',
  spray_fungus: '🍄',
  spray_pest: '🐛',
  next_planting: '📅',
  germination_check: '🌱',
  rooting_check: '🌿',
  true_leaf_check: '🍃',
  fert_application: '💧',
};

export function DashboardScreen() {
  const dueReminders = useDueReminders() ?? [];
  const todayStr = formatDateShort(today());

  const harvestReady = useLiveQuery(async () => {
    const all = await db.crops.where('status').equals('Active').toArray();
    return all.filter(c => c.harvestDateEstimated === todayStr || parseDate(c.harvestDateEstimated) && parseDate(c.harvestDateEstimated)! <= today());
  }, [todayStr]) ?? [];

  const transplantDue = useLiveQuery(async () => {
    const all = await db.crops.where('status').equals('Active').toArray();
    return all.filter(c => c.transplantDateScheduled === todayStr);
  }, [todayStr]) ?? [];

  const [showFAB, setShowFAB] = useState(false);
  const [fabDate, setFabDate] = useState(today());
  const [showCropForm, setShowCropForm] = useState(false);
  const [showPropForm, setShowPropForm] = useState(false);

  const isEmpty = dueReminders.length === 0 && harvestReady.length === 0 && transplantDue.length === 0;

  return (
    <div className="pb-24 pt-2 px-4 space-y-4">
      <WeatherWidget />

      {/* Due Reminders */}
      {dueReminders.length > 0 && (
        <div>
          <h2 className="font-semibold text-sm text-muted-foreground uppercase mb-2">Due Today</h2>
          <div className="space-y-2">
            {dueReminders.slice(0, 10).map(r => (
              <div key={r.id} className="bg-white rounded-xl border p-3 flex items-start gap-3">
                <span className="text-2xl">{TYPE_EMOJI[r.type] ?? '📌'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{r.subject}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.cropPlantName}</p>
                </div>
                <button
                  onClick={() => markReminderDone(r.id)}
                  className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-lg font-medium shrink-0"
                >
                  Done ✓
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Harvest Ready */}
      {harvestReady.length > 0 && (
        <div>
          <h2 className="font-semibold text-sm text-amber-600 uppercase mb-2">🥬 Ready to Harvest</h2>
          <div className="space-y-2">
            {harvestReady.map(c => (
              <div key={c.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
                <span className="text-xl">🥬</span>
                <div className="flex-1">
                  <p className="font-medium">{c.cropName}</p>
                  <p className="text-xs text-muted-foreground">{c.variety}</p>
                </div>
                <span className="text-xs text-amber-700 font-semibold">Harvest now!</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transplant Due */}
      {transplantDue.length > 0 && (
        <div>
          <h2 className="font-semibold text-sm text-blue-600 uppercase mb-2">🌱 Transplant Due Today</h2>
          <div className="space-y-2">
            {transplantDue.map(c => (
              <div key={c.id} className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="font-medium">{c.cropName}</p>
                <p className="text-xs text-muted-foreground">{c.plantingMethod}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-4xl mb-3">✅</p>
          <p className="font-semibold text-lg">Nothing due today.</p>
          <p className="text-muted-foreground text-sm">Your crops are happy!</p>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setShowFAB(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-amber-500 text-white rounded-full shadow-lg flex items-center justify-center text-2xl z-40 hover:bg-amber-600 active:scale-95 transition-all"
      >
        +
      </button>

      {/* FAB Sheet */}
      <BottomSheet open={showFAB} onClose={() => setShowFAB(false)} title="Quick Add" position="center">
        <div className="pt-2 space-y-3">
          <p className="text-sm text-muted-foreground text-center">Date: {formatDateShort(fabDate)}</p>
          <div className="flex gap-3">
            <button
              onClick={() => { setShowFAB(false); setShowCropForm(true); }}
              className="flex-1 bg-green-50 border border-green-200 rounded-xl p-4 text-center"
            >
              <p className="text-3xl mb-1">🌱</p>
              <p className="font-semibold text-green-700">Crop</p>
            </button>
            <button
              onClick={() => { setShowFAB(false); setShowPropForm(true); }}
              className="flex-1 bg-blue-50 border border-blue-200 rounded-xl p-4 text-center"
            >
              <p className="text-3xl mb-1">🌿</p>
              <p className="font-semibold text-blue-700">Propagation</p>
            </button>
          </div>
        </div>
      </BottomSheet>

      <CropForm open={showCropForm} onClose={() => setShowCropForm(false)} date={fabDate} />
      <PropForm open={showPropForm} onClose={() => setShowPropForm(false)} date={fabDate} />
    </div>
  );
}
