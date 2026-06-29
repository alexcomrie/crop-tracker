import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResultCard, ResultGrid, CalcSection } from '../ResultCard';
import { num } from '@/lib/calcUtils';

export default function SeedCalc() {
  const [bedLengthM, setBedLength] = useState(10);
  const [rowCount, setRowCount] = useState(4);
  const [spacingCm, setSpacing] = useState(30);
  const [germinationPct, setGerm] = useState(80);
  const [seedsPerPack, setPackSize] = useState(100);
  const [pricePerPack, setPackPrice] = useState(5);
  const [successionWeeks, setSucc] = useState(1);

  const result = useMemo(() => {
    const plantsPerRow = Math.ceil((bedLengthM * 100) / spacingCm);
    const plantsNeeded = plantsPerRow * rowCount * successionWeeks;
    const seedsNeeded = Math.ceil(plantsNeeded / (germinationPct / 100));
    const packsNeeded = Math.ceil(seedsNeeded / seedsPerPack);
    const totalCost = packsNeeded * pricePerPack;
    return { plantsPerRow, plantsNeeded, seedsNeeded, packsNeeded, totalCost };
  }, [bedLengthM, rowCount, spacingCm, germinationPct, seedsPerPack, pricePerPack, successionWeeks]);

  return (
    <CalcSection title="Seed Quantity Calculator">
      <p className="text-sm text-gray-500">
        Calculate how many seeds to buy based on your bed size and plant spacing.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label>Bed Length (m)</Label>
          <Input type="number" value={bedLengthM} onChange={(e) => setBedLength(Number(e.target.value))} min={0.1} step={0.5} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Number of Rows</Label>
          <Input type="number" value={rowCount} onChange={(e) => setRowCount(Number(e.target.value))} min={1} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Plant Spacing (cm)</Label>
          <Input type="number" value={spacingCm} onChange={(e) => setSpacing(Number(e.target.value))} min={1} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Germination Rate (%)</Label>
          <Input type="number" value={germinationPct} onChange={(e) => setGerm(Number(e.target.value))} min={1} max={100} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Seeds per Pack</Label>
          <Input type="number" value={seedsPerPack} onChange={(e) => setPackSize(Number(e.target.value))} min={1} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Price per Pack ($)</Label>
          <Input type="number" value={pricePerPack} onChange={(e) => setPackPrice(Number(e.target.value))} min={0} step={0.01} />
        </div>
        <div className="flex flex-col gap-1 col-span-2">
          <Label>Succession Plantings</Label>
          <Input type="number" value={successionWeeks} onChange={(e) => setSucc(Number(e.target.value))} min={1} />
          <p className="text-xs text-gray-500">Number of planting rounds (e.g. 3 = stagger over 3 periods)</p>
        </div>
      </div>
      <ResultCard label="Seeds to buy" value={`${num(result.seedsNeeded, 0)} seeds`} highlight sub={`${result.plantsNeeded} plants needed + germination buffer`} />
      <ResultGrid>
        <ResultCard label="Packs to buy" value={`${result.packsNeeded} pack${result.packsNeeded !== 1 ? 's' : ''}`} />
        <ResultCard label="Seed cost" value={`$${num(result.totalCost, 2)}`} />
        <ResultCard label="Plants per row" value={num(result.plantsPerRow, 0)} />
        <ResultCard label="Total plants" value={num(result.plantsNeeded, 0)} />
      </ResultGrid>
    </CalcSection>
  );
}
