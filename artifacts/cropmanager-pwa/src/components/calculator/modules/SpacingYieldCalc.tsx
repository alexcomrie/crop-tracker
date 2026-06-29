import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResultCard, ResultGrid, CalcSection } from '../ResultCard';
import { num, currency } from '@/lib/calcUtils';

export default function SpacingYieldCalc() {
  const [bedLengthM, setLength] = useState(10);
  const [bedWidthM, setWidth] = useState(1.2);
  const [rowSpacingCm, setRowSp] = useState(40);
  const [plantSpacingCm, setPlSp] = useState(30);
  const [yieldKgPerPlant, setYield] = useState(2);
  const [pricePerKg, setPrice] = useState(5);

  const result = useMemo(() => {
    const rows = Math.floor((bedWidthM * 100) / rowSpacingCm);
    const plantsPerRow = Math.floor((bedLengthM * 100) / plantSpacingCm);
    const totalPlants = rows * plantsPerRow;
    const totalYieldKg = totalPlants * yieldKgPerPlant;
    const totalYieldLb = totalYieldKg * 2.205;
    const revenue = totalYieldKg * pricePerKg;
    const areaSqm = bedLengthM * bedWidthM;
    const yieldPerSqm = totalYieldKg / areaSqm;
    return { rows, plantsPerRow, totalPlants, totalYieldKg, totalYieldLb, revenue, areaSqm, yieldPerSqm };
  }, [bedLengthM, bedWidthM, rowSpacingCm, plantSpacingCm, yieldKgPerPlant, pricePerKg]);

  return (
    <CalcSection title="Spacing & Yield Estimator">
      <p className="text-sm text-gray-500">
        Estimate plant count and expected harvest from your bed dimensions and spacing.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label>Bed Length (m)</Label>
          <Input type="number" value={bedLengthM} onChange={(e) => setLength(Number(e.target.value))} min={0.1} step={0.5} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Bed Width (m)</Label>
          <Input type="number" value={bedWidthM} onChange={(e) => setWidth(Number(e.target.value))} min={0.1} step={0.1} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Row Spacing (cm)</Label>
          <Input type="number" value={rowSpacingCm} onChange={(e) => setRowSp(Number(e.target.value))} min={1} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Plant Spacing (cm)</Label>
          <Input type="number" value={plantSpacingCm} onChange={(e) => setPlSp(Number(e.target.value))} min={1} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Yield per Plant (kg)</Label>
          <Input type="number" value={yieldKgPerPlant} onChange={(e) => setYield(Number(e.target.value))} min={0} step={0.1} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Price per kg ($)</Label>
          <Input type="number" value={pricePerKg} onChange={(e) => setPrice(Number(e.target.value))} min={0} step={0.01} />
        </div>
      </div>
      <ResultCard label="Total plants" value={num(result.totalPlants, 0)} highlight sub={`${result.rows} rows × ${result.plantsPerRow} plants per row`} />
      <ResultGrid>
        <ResultCard label="Est. yield (kg)" value={`${num(result.totalYieldKg, 1)} kg`} />
        <ResultCard label="Est. yield (lb)" value={`${num(result.totalYieldLb, 1)} lb`} />
        <ResultCard label="Yield per m²" value={`${num(result.yieldPerSqm, 2)} kg/m²`} />
        <ResultCard label="Est. revenue" value={currency(result.revenue)} />
      </ResultGrid>
    </CalcSection>
  );
}
