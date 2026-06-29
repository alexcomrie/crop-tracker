import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResultCard, ResultGrid, CalcSection } from '../ResultCard';
import { currency, num } from '@/lib/calcUtils';

export default function ProfitMarginCalc() {
  const [sellingPrice, setSell] = useState(5.00);
  const [costToGrow, setCost] = useState(2.50);
  const [packagingCost, setPack] = useState(0.25);
  const [labourCost, setLabour] = useState(0.50);
  const [marketFeePct, setFee] = useState(10);
  const [units, setUnits] = useState(1000);

  const result = useMemo(() => {
    const feeAmt = sellingPrice * (marketFeePct / 100);
    const totalCostPerUnit = costToGrow + packagingCost + labourCost + feeAmt;
    const profitPerUnit = sellingPrice - totalCostPerUnit;
    const marginPct = sellingPrice > 0 ? (profitPerUnit / sellingPrice) * 100 : 0;
    const totalProfit = profitPerUnit * units;
    const totalRevenue = sellingPrice * units;
    const roi = totalCostPerUnit > 0 ? (profitPerUnit / totalCostPerUnit) * 100 : 0;
    return { feeAmt, totalCostPerUnit, profitPerUnit, marginPct, totalProfit, totalRevenue, roi };
  }, [sellingPrice, costToGrow, packagingCost, labourCost, marketFeePct, units]);

  return (
    <CalcSection title="Profit Margin Calculator">
      <p className="text-sm text-gray-500">
        See your real profit per unit and total after every cost is accounted for.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label>Selling Price / unit ($)</Label>
          <Input type="number" value={sellingPrice} onChange={(e) => setSell(Number(e.target.value))} min={0} step={0.01} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Units to sell</Label>
          <Input type="number" value={units} onChange={(e) => setUnits(Number(e.target.value))} min={1} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Grow cost / unit ($)</Label>
          <Input type="number" value={costToGrow} onChange={(e) => setCost(Number(e.target.value))} min={0} step={0.01} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Packaging / unit ($)</Label>
          <Input type="number" value={packagingCost} onChange={(e) => setPack(Number(e.target.value))} min={0} step={0.01} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Labour / unit ($)</Label>
          <Input type="number" value={labourCost} onChange={(e) => setLabour(Number(e.target.value))} min={0} step={0.01} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Market / platform fee (%)</Label>
          <Input type="number" value={marketFeePct} onChange={(e) => setFee(Number(e.target.value))} min={0} max={100} step={0.5} />
          <p className="text-xs text-gray-500">= {currency(result.feeAmt)} / unit</p>
        </div>
      </div>
      <ResultCard label="Profit per unit" value={currency(result.profitPerUnit)} sub={`After ${currency(result.totalCostPerUnit)} total cost per unit`} highlight />
      <ResultGrid>
        <ResultCard label="Profit margin" value={`${num(result.marginPct, 1)}%`} />
        <ResultCard label="ROI" value={`${num(result.roi, 1)}%`} sub="Return on cost" />
        <ResultCard label="Total revenue" value={currency(result.totalRevenue)} sub={`${units} units`} />
        <ResultCard label="Total profit" value={currency(result.totalProfit)} />
      </ResultGrid>
    </CalcSection>
  );
}
