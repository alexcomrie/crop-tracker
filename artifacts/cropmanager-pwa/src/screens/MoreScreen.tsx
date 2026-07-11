import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../lib/routes';
import { Database, Beaker, BarChart2, FlaskConical, Bell, MapPin, BookOpen, Calendar, Calculator, Receipt, ChevronRight } from 'lucide-react';

interface MoreItemProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconColor: string;
  path: string;
}

function MoreItem({ title, subtitle, icon, iconColor, path }: MoreItemProps) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(path)}
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
  return (
    <div className="pb-24 pt-4 px-4 space-y-6 overflow-y-auto">
      <section>
        <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Databases</h2>
        <div className="space-y-3">
          <MoreItem
            title="Crop Database"
            subtitle="View and edit crop timings, varieties, sprays"
            icon={<Database className="w-6 h-6 text-green-600" />}
            iconColor="bg-green-50"
            path={ROUTES.MORE_CROP_DB}
          />
          <MoreItem
            title="Fertilizer Database"
            subtitle="Edit 5-tea mix ratios per crop & stage"
            icon={<Beaker className="w-6 h-6 text-amber-600" />}
            iconColor="bg-amber-50"
            path={ROUTES.MORE_FERT_DB}
          />
          <MoreItem
            title="Crop Analysis"
            subtitle="Stage durations, yield, seasons, learning"
            icon={<BarChart2 className="w-6 h-6 text-blue-600" />}
            iconColor="bg-blue-50"
            path={ROUTES.MORE_HISTORY}
          />
          <MoreItem
            title="Treatment App Rates"
            subtitle="Calculate fungicide/insecticide application rates"
            icon={<FlaskConical className="w-6 h-6 text-cyan-600" />}
            iconColor="bg-cyan-50"
            path={ROUTES.MORE_TREATMENT_RATES}
          />
          <MoreItem
            title="Reminders"
            subtitle="View and manage queued Telegram reminders"
            icon={<Bell className="w-6 h-6 text-purple-600" />}
            iconColor="bg-purple-50"
            path={ROUTES.REMINDERS}
          />
          <MoreItem
            title="Activity Log"
            subtitle="Record and track field activities"
            icon={<span className="text-lg">📋</span>}
            iconColor="bg-orange-50"
            path={ROUTES.MORE_ACTIVITY}
          />
        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Planning</h2>
        <div className="space-y-3">
          <MoreItem
            title="Calculator"
            subtitle="Farm calculators + regular calculator"
            icon={<Calculator className="w-6 h-6 text-indigo-600" />}
            iconColor="bg-indigo-50"
            path={ROUTES.MORE_CALCULATOR}
          />
          <MoreItem
            title="C-H Calculator"
            subtitle="Plan plots for continuous weekly harvests"
            icon={<span className="text-lg">♻️</span>}
            iconColor="bg-[#e0fdf4]"
            path={ROUTES.MORE_CH_CALC}
          />
        </div>
      </section>
      <section>
        <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Finance</h2>
        <div className="space-y-3">
          <MoreItem
            title="Farm Ledger"
            subtitle="Expenses, sales, inventory, treatments, P&L"
            icon={<span className="text-lg">📊</span>}
            iconColor="bg-emerald-50"
            path={ROUTES.MORE_LEDGER}
          />
          <MoreItem
            title="Point of Sale"
            subtitle="Sell crops, print receipts, track sales"
            icon={<Receipt className="w-6 h-6 text-indigo-600" />}
            iconColor="bg-indigo-50"
            path={ROUTES.MORE_POS}
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
            path={ROUTES.CALENDAR}
          />
          <MoreItem
            title="Area Mapper"
            subtitle="GPS walk or manual points to map farm areas"
            icon={<MapPin className="w-6 h-6 text-rose-600" />}
            iconColor="bg-rose-50"
            path={ROUTES.MORE_AREA_MAPPER}
          />
        </div>
      </section>
      <section>
        <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Tracking</h2>
        <div className="space-y-3">
          <MoreItem
            title="Diary"
            subtitle="Auto-logged timeline of all crop activities"
            icon={<BookOpen className="w-6 h-6 text-amber-600" />}
            iconColor="bg-amber-50"
            path={ROUTES.MORE_DIARY}
          />
        </div>
      </section>
    </div>
  );
}
