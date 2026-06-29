import React, { useState } from 'react';
import { Calculator, DollarSign, Scale, Sprout, FlaskConical, Ruler, TrendingUp, Calendar, Droplets } from 'lucide-react';
import RevenueGoalCalc from './modules/RevenueGoalCalc';
import BreakEvenCalc from './modules/BreakEvenCalc';
import SeedCalc from './modules/SeedCalc';
import FertilizerCalc from './modules/FertilizerCalc';
import SpacingYieldCalc from './modules/SpacingYieldCalc';
import ProfitMarginCalc from './modules/ProfitMarginCalc';
import HarvestWindowCalc from './modules/HarvestWindowCalc';
import WaterCalc from './modules/WaterCalc';
import RegularCalc from './modules/RegularCalc';

const MODULES = [
  { id: 'regular',    label: 'Regular',     icon: <Calculator className="w-5 h-5" /> },
  { id: 'revenue',    label: 'Revenue Goal', icon: <DollarSign className="w-5 h-5" /> },
  { id: 'breakeven',  label: 'Break-Even',   icon: <Scale className="w-5 h-5" /> },
  { id: 'seed',       label: 'Seed Need',    icon: <Sprout className="w-5 h-5" /> },
  { id: 'fertilizer', label: 'Fertilizer',   icon: <FlaskConical className="w-5 h-5" /> },
  { id: 'spacing',    label: 'Spacing & Yield', icon: <Ruler className="w-5 h-5" /> },
  { id: 'profit',     label: 'Profit Margin', icon: <TrendingUp className="w-5 h-5" /> },
  { id: 'harvest',    label: 'Harvest Window', icon: <Calendar className="w-5 h-5" /> },
  { id: 'water',      label: 'Water Need',   icon: <Droplets className="w-5 h-5" /> },
];

export default function FarmCalculatorScreen() {
  const [active, setActive] = useState('regular');

  return (
    <div className="flex flex-col pb-24">
      {/* Horizontal scrollable module picker */}
      <div className="overflow-x-auto border-b px-2 py-2">
        <div className="flex gap-2 min-w-max px-2">
          {MODULES.map((m) => (
            <button
              key={m.id}
              onClick={() => setActive(m.id)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                active === m.id
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span className={active === m.id ? 'text-white' : 'text-gray-500'}>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Active calculator module */}
      <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">
        {active === 'regular'    && <RegularCalc />}
        {active === 'revenue'    && <RevenueGoalCalc />}
        {active === 'breakeven'  && <BreakEvenCalc />}
        {active === 'seed'       && <SeedCalc />}
        {active === 'fertilizer' && <FertilizerCalc />}
        {active === 'spacing'    && <SpacingYieldCalc />}
        {active === 'profit'     && <ProfitMarginCalc />}
        {active === 'harvest'    && <HarvestWindowCalc />}
        {active === 'water'      && <WaterCalc />}
      </div>
    </div>
  );
}
