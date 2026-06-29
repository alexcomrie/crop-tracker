import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ResultCard, ResultGrid, CalcSection } from '../ResultCard';
import { currency, num, round } from '@/lib/calcUtils';

const UNITS = ['lb', 'kg', 'oz', 'dozen', 'half-dozen', 'each', 'bunch', 'box (10 lb)', 'crate (25 lb)', 'bag (5 lb)', 'tray', 'per plant', 'per head'];

const UNIT_LB: Record<string, number> = {
  'lb': 1, 'kg': 2.205, 'oz': 0.0625,
  'box (10 lb)': 10, 'bunch': 0.5,
  'crate (25 lb)': 25, 'bag (5 lb)': 5,
  'dozen': 0, 'half-dozen': 0, 'each': 0,
  'tray': 0, 'per plant': 0, 'per head': 0,
};

export default function RevenueGoalCalc() {
  const [mode, setMode] = useState<'forward' | 'reverse'>('forward');
  const [goal, setGoal] = useState(20000);
  const [pricePerUnit, setPrice] = useState(100);
  const [unit, setUnit] = useState('lb');
  const [wastePct, setWaste] = useState(10);
  const [cropName, setCrop] = useState('');
  const [quantity, setQuantity] = useState(100);

  const forwardResult = useMemo(() => {
    if (!pricePerUnit || !goal) return null;
    const unitsNeededToSell = goal / pricePerUnit;
    const unitsToHarvest = unitsNeededToSell / (1 - wastePct / 100);
    const lbsToHarvest = unitsToHarvest * (UNIT_LB[unit] ?? 1);
    return {
      unitsToSell: round(unitsNeededToSell),
      unitsToHarvest: round(unitsToHarvest),
      lbsToHarvest: round(lbsToHarvest),
      kgToHarvest: round(lbsToHarvest / 2.205),
      wasteUnits: round(unitsToHarvest - unitsNeededToSell),
      revenuePerLb: round(goal / lbsToHarvest, 4),
    };
  }, [goal, pricePerUnit, unit, wastePct]);

  const reverseResult = useMemo(() => {
    if (!pricePerUnit || !quantity) return null;
    const totalRevenue = quantity * pricePerUnit;
    const wasteUnits = quantity * (wastePct / 100);
    const harvestQty = quantity + wasteUnits;
    const lbsTotal = harvestQty * (UNIT_LB[unit] ?? 1);
    return {
      totalRevenue: round(totalRevenue),
      harvestQty: round(harvestQty),
      wasteUnits: round(wasteUnits),
      lbsTotal: round(lbsTotal),
      kgTotal: round(lbsTotal / 2.205),
    };
  }, [pricePerUnit, quantity, wastePct, unit]);

  return (
    <CalcSection title="Revenue Goal Calculator">
      <p className="text-sm text-gray-500">
        Forward: set a revenue target to see how much to grow. Reverse: enter your quantity to calculate revenue.
      </p>
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        <button onClick={() => setMode('forward')} className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${mode === 'forward' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500'}`}>Forward — Goal → Units</button>
        <button onClick={() => setMode('reverse')} className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${mode === 'reverse' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500'}`}>Reverse — Units → Revenue</button>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label>Crop Name (optional)</Label>
          <Input value={cropName} onChange={(e) => setCrop(e.target.value)} placeholder="e.g. Tomatoes" />
        </div>
        {mode === 'forward' ? (
          <div className="flex flex-col gap-1">
            <Label>Revenue Goal ($)</Label>
            <Input type="number" value={goal} onChange={(e) => setGoal(Number(e.target.value))} min={0} />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <Label>Quantity to Sell</Label>
            <Input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} min={0} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label>Price per Unit ($)</Label>
            <Input type="number" value={pricePerUnit} onChange={(e) => setPrice(Number(e.target.value))} min={0} step={0.01} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Selling Unit</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Post-Harvest Loss / Waste (%)</Label>
          <Input type="number" value={wastePct} onChange={(e) => setWaste(Number(e.target.value))} min={0} max={99} />
          <p className="text-xs text-gray-500">Accounts for culls, damage, and unsold produce</p>
        </div>
      </div>
      <Separator />
      {mode === 'forward' && forwardResult && (
        <div className="flex flex-col gap-3">
          <ResultCard label={`${cropName || 'Crop'} to sell`} value={`${num(forwardResult.unitsToSell, 1)} ${unit}`} sub={`At ${currency(pricePerUnit)} per ${unit} = ${currency(goal)} revenue`} highlight />
          <ResultGrid>
            <ResultCard label="Must harvest" value={`${num(forwardResult.unitsToHarvest, 1)} ${unit}`} sub={`Includes ${wastePct}% waste buffer`} />
            <ResultCard label="Expected waste" value={`${num(forwardResult.wasteUnits, 1)} ${unit}`} sub="Culls + unsold" />
            <ResultCard label="Total weight (lbs)" value={`${num(forwardResult.lbsToHarvest, 0)} lb`} />
            <ResultCard label="Total weight (kg)" value={`${num(forwardResult.kgToHarvest, 0)} kg`} />
          </ResultGrid>
          <div className="rounded-xl border overflow-hidden">
            <p className="text-xs font-semibold px-3 py-2 bg-gray-100 border-b">Price scenarios to reach {currency(goal)}</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-3 py-2">Price / {unit}</th>
                  <th className="text-right px-3 py-2">Units to sell</th>
                  <th className="text-right px-3 py-2">Must harvest</th>
                </tr>
              </thead>
              <tbody>
                {[pricePerUnit * 0.5, pricePerUnit * 0.75, pricePerUnit, pricePerUnit * 1.25, pricePerUnit * 1.5].map((p) => {
                  const sell = goal / p;
                  const harvest = sell / (1 - wastePct / 100);
                  return (
                    <tr key={p} className={`border-b ${p === pricePerUnit ? 'bg-green-50 font-semibold' : ''}`}>
                      <td className="px-3 py-2">{currency(p)}</td>
                      <td className="px-3 py-2 text-right">{num(sell, 1)}</td>
                      <td className="px-3 py-2 text-right">{num(harvest, 1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {mode === 'reverse' && reverseResult && (
        <div className="flex flex-col gap-3">
          <ResultCard label={`Total Revenue`} value={currency(reverseResult.totalRevenue)} sub={`${num(quantity, 1)} ${unit} × ${currency(pricePerUnit)}`} highlight />
          <ResultGrid>
            <ResultCard label="Must harvest" value={`${num(reverseResult.harvestQty, 1)} ${unit}`} sub={`Includes ${wastePct}% waste buffer`} />
            <ResultCard label="Expected waste" value={`${num(reverseResult.wasteUnits, 1)} ${unit}`} sub="Culls + unsold" />
            <ResultCard label="Total weight (lbs)" value={`${num(reverseResult.lbsTotal, 0)} lb`} />
            <ResultCard label="Total weight (kg)" value={`${num(reverseResult.kgTotal, 0)} kg`} />
          </ResultGrid>
          <div className="rounded-xl border overflow-hidden">
            <p className="text-xs font-semibold px-3 py-2 bg-gray-100 border-b">Volume scenarios</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-3 py-2">Quantity ({unit})</th>
                  <th className="text-right px-3 py-2">Revenue</th>
                  <th className="text-right px-3 py-2">Must harvest</th>
                </tr>
              </thead>
              <tbody>
                {[quantity * 0.5, quantity * 0.75, quantity, quantity * 1.25, quantity * 1.5].map((q) => {
                  const rev = q * pricePerUnit;
                  const harvest = q / (1 - wastePct / 100);
                  return (
                    <tr key={q} className={`border-b ${q === quantity ? 'bg-green-50 font-semibold' : ''}`}>
                      <td className="px-3 py-2">{num(q, 1)}</td>
                      <td className="px-3 py-2 text-right">{currency(rev)}</td>
                      <td className="px-3 py-2 text-right">{num(harvest, 1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </CalcSection>
  );
}
