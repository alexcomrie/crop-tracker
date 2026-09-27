import React from 'react';
import { ROUTES } from './routes';
import { Database, Beaker, BarChart2, FlaskConical, Bell, MapPin, BookOpen, Calendar, Calculator, Receipt, Home, Sprout, Settings } from 'lucide-react';

export interface NavItem { label: string; title?: string; subtitle?: string; icon: React.ReactNode; path: string; iconColor?: string; }

export interface NavSection { title: string; items: NavItem[]; }

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Dashboard', title: 'Dashboard', subtitle: 'Overview & today', icon: React.createElement(Home, { className: 'w-5 h-5' }), path: ROUTES.DASHBOARD },
      { label: 'Crops', title: 'Crops & Propagations', subtitle: 'Manage crops and cuttings', icon: React.createElement(Sprout, { className: 'w-5 h-5' }), path: ROUTES.CROPS },
    ],
  },
  {
    title: 'Databases',
    items: [
      { label: 'Crop Database', title: 'Crop Database', subtitle: 'View and edit crop timings, varieties, sprays', icon: React.createElement(Database, { className: 'w-6 h-6 text-green-600' }), path: ROUTES.MORE_CROP_DB, iconColor: 'bg-green-50' },
      { label: 'Fertilizer Database', title: 'Fertilizer Database', subtitle: 'Edit 5-tea mix ratios per crop & stage', icon: React.createElement(Beaker, { className: 'w-6 h-6 text-amber-600' }), path: ROUTES.MORE_FERT_DB, iconColor: 'bg-amber-50' },
      { label: 'Crop Analysis', title: 'Crop Analysis', subtitle: 'Stage durations, yield, seasons, learning', icon: React.createElement(BarChart2, { className: 'w-6 h-6 text-blue-600' }), path: ROUTES.MORE_HISTORY, iconColor: 'bg-blue-50' },
      { label: 'Treatment App Rates', title: 'Treatment App Rates', subtitle: 'Calculate fungicide/insecticide application rates', icon: React.createElement(FlaskConical, { className: 'w-6 h-6 text-cyan-600' }), path: ROUTES.MORE_TREATMENT_RATES, iconColor: 'bg-cyan-50' },
      { label: 'Reminders', title: 'Reminders', subtitle: 'View and manage queued Telegram reminders', icon: React.createElement(Bell, { className: 'w-6 h-6 text-purple-600' }), path: ROUTES.REMINDERS, iconColor: 'bg-purple-50' },
      { label: 'Activity Log', title: 'Activity Log', subtitle: 'Record and track field activities', icon: React.createElement('span', null, '📋'), path: ROUTES.MORE_ACTIVITY, iconColor: 'bg-orange-50' },
    ],
  },
  {
    title: 'Planning',
    items: [
      { label: 'Calculator', title: 'Calculator', subtitle: 'Farm calculators + regular calculator', icon: React.createElement(Calculator, { className: 'w-6 h-6 text-indigo-600' }), path: ROUTES.MORE_CALCULATOR, iconColor: 'bg-indigo-50' },
      { label: 'C-H Calculator', title: 'C-H Calculator', subtitle: 'Plan plots for continuous weekly harvests', icon: React.createElement('span', null, '♻️'), path: ROUTES.MORE_CH_CALC, iconColor: 'bg-[#e0fdf4]' },
      { label: 'Succession Gaps', title: 'Succession Gaps', subtitle: '12-week harvest coverage, Tinygpt-adjusted', icon: React.createElement('span', null, '📅'), path: ROUTES.MORE_SUCCESSION, iconColor: 'bg-green-50' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Farm Ledger', title: 'Farm Ledger', subtitle: 'Expenses, sales, inventory, treatments, P&L', icon: React.createElement('span', null, '📊'), path: ROUTES.MORE_LEDGER, iconColor: 'bg-emerald-50' },
      { label: 'Point of Sale', title: 'Point of Sale', subtitle: 'Sell crops, print receipts, track sales', icon: React.createElement(Receipt, { className: 'w-6 h-6 text-indigo-600' }), path: ROUTES.MORE_POS, iconColor: 'bg-indigo-50' },
    ],
  },
  {
    title: 'Schedule',
    items: [
      { label: 'Calendar', title: 'Calendar', subtitle: 'View all upcoming events and tasks', icon: React.createElement(Calendar, { className: 'w-6 h-6 text-green-600' }), path: ROUTES.CALENDAR, iconColor: 'bg-green-50' },
      { label: 'Area Mapper', title: 'Area Mapper', subtitle: 'GPS walk or manual points to map farm areas', icon: React.createElement(MapPin, { className: 'w-6 h-6 text-rose-600' }), path: ROUTES.MORE_AREA_MAPPER, iconColor: 'bg-rose-50' },
    ],
  },
  {
    title: 'Tracking',
    items: [
      { label: 'Diary', title: 'Diary', subtitle: 'Auto-logged timeline of all crop activities', icon: React.createElement(BookOpen, { className: 'w-6 h-6 text-amber-600' }), path: ROUTES.MORE_DIARY, iconColor: 'bg-amber-50' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'Settings', title: 'Settings', subtitle: 'App settings', icon: React.createElement(Settings, { className: 'w-5 h-5' }), path: ROUTES.SETTINGS, iconColor: 'bg-gray-50' },
    ],
  },
];
