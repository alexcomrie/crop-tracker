import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { ResultCard, ResultGrid, CalcSection } from '../ResultCard';
import { currency, num } from '@/lib/calcUtils';

type CostLine = { label: string; amount: number };

const DEFAULT_COSTS: CostLine[] = [
  { label: 'Seeds / seedlings', amount: 0 },
  { label: 'Soil amendments', amount: 0 },
  { label: 'Labour', amount: 0 },
  { label: 'Packaging', amount: 0 },
  { label: 'Transport / market', amount: 0 },
  { label: 'Water', amount: 0 },
];

export default function BreakEvenCalc() {
  const [costs, setCosts] = useState<CostLine[]>(DEFAULT_COSTS);
  const [pricePerUnit, setPrice] = useState(100);
  const [unit, setUnit] = useState('lb');
  const [targetUnits, setTarget] = useState(200);

  const totalCost = costs.reduce((s, c) => s + (c.amount || 0), 0);

  const result = useMemo(() => {
    if (!pricePerUnit) return null;
    const breakEvenUnits = totalCost / pricePerUnit;
    const projectedRevenue = targetUnits * pricePerUnit;
    const projectedProfit = projectedRevenue - totalCost;
    const marginPct = projectedRevenue > 0 ? (projectedProfit / projectedRevenue) * 100 : 0;
    return { breakEvenUnits, projectedRevenue, projectedProfit, marginPct };
  }, [totalCost, pricePerUnit, targetUnits]);

  const updateCost = (i: number, field: keyof CostLine, val: string | number) =>
    setCosts((prev) => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c));

  return (
    <CalcSection title="Break-Even Calculator">
      <p className="text-sm text-gray-500">
        Enter all your costs to find out how much you must sell before you start profiting.
      </p>
      <div className="flex flex-col gap-2">
        <Label>Cost Breakdown</Label>
        {costs.map((cost, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
            <Input value={cost.label} onChange={(e) => updateCost(i, 'label', e.target.value)} placeholder="Cost item" className="h-8 text-sm" />
            <Input type="number" value={cost.amount || ''} onChange={(e) => updateCost(i, 'amount', Number(e.target.value))} placeholder="$" className="h-8 text-sm w-24" min={0} />
            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => setCosts((p) => p.filter((_, idx) => idx !== i))}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setCosts((p) => [...p, { label: '', amount: 0 }])}>
          <Plus className="w-3 h-3 mr-1" /> Add Cost
        </Button>
        <div className="flex justify-between text-sm font-semibold border-t pt-2">
          <span>Total Costs</span>
          <span>{currency(totalCost)}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label>Selling Price / {unit}</Label>
          <Input type="number" value={pricePerUnit} onChange={(e) => setPrice(Number(e.target.value))} min={0} step={0.01} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Expected Sales ({unit})</Label>
          <Input type="number" value={targetUnits} onChange={(e) => setTarget(Number(e.target.value))} min={0} />
        </div>
      </div>
      {result && (
        <div className="flex flex-col gap-3">
          <ResultCard label="Break-even point" value={`${num(result.breakEvenUnits, 1)} ${unit}`} sub={`Sell this much just to cover ${currency(totalCost)} in costs`} highlight />
          <ResultGrid>
            <ResultCard label="Projected revenue" value={currency(result.projectedRevenue)} sub={`${num(targetUnits, 0)} ${unit} × ${currency(pricePerUnit)}`} />
            <ResultCard label="Projected profit" value={currency(result.projectedProfit)} sub={result.projectedProfit >= 0 ? '✅ Profitable' : '❌ At a loss'} />
            <ResultCard label="Profit margin" value={`${num(result.marginPct, 1)}%`} />
            <ResultCard label={result.projectedProfit >= 0 ? 'Above break-even by' : 'Below break-even by'} value={`${num(Math.abs(targetUnits - result.breakEvenUnits), 1)} ${unit}`} />
          </ResultGrid>
        </div>
      )}
    </CalcSection>
  );
}
