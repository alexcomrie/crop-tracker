import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResultCard, ResultGrid, CalcSection } from '../ResultCard';
import { num } from '@/lib/calcUtils';

const CROP_NEEDS: Record<string, number> = {
  'Tomato': 5.0,
  'Lettuce': 3.0,
  'Pepper': 4.5,
  'Cucumber': 5.5,
  'Carrot': 3.5,
  'Kale': 3.0,
  'Bean': 4.0,
  'Corn': 5.0,
  'Cabbage': 4.0,
  'Custom': 4.0,
};

export default function WaterCalc() {
  const [areaSqm, setArea] = useState(50);
  const [crop, setCrop] = useState('Tomato');
  const [mmPerDay, setMm] = useState(CROP_NEEDS['Tomato']);
  const [dripEfficiency, setEff] = useState(90);
  const [daysPerWeek, setDays] = useState(7);

  const handleCrop = (name: string) => {
    setCrop(name);
    if (CROP_NEEDS[name]) setMm(CROP_NEEDS[name]);
  };

  const result = useMemo(() => {
    const rawLitresPerDay = mmPerDay * areaSqm;
    const appliedLitresPerDay = rawLitresPerDay / (dripEfficiency / 100);
    const litresPerWeek = appliedLitresPerDay * daysPerWeek;
    const litresPerMonth = appliedLitresPerDay * daysPerWeek * 4.33;
    const gallonsPerDay = appliedLitresPerDay * 0.264;
    return { appliedLitresPerDay, litresPerWeek, litresPerMonth, gallonsPerDay };
  }, [areaSqm, mmPerDay, dripEfficiency, daysPerWeek]);

  return (
    <CalcSection title="Water Requirement Calculator">
      <p className="text-sm text-gray-500">
        Estimate daily and weekly water needs based on crop type, area size, and irrigation efficiency.
      </p>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label>Crop</Label>
            <Select value={crop} onValueChange={handleCrop}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(CROP_NEEDS).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Area (m²)</Label>
            <Input type="number" value={areaSqm} onChange={(e) => setArea(Number(e.target.value))} min={0.1} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Water need (mm / day)</Label>
            <Input type="number" value={mmPerDay} onChange={(e) => setMm(Number(e.target.value))} min={0} step={0.1} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Irrigation efficiency (%)</Label>
            <Input type="number" value={dripEfficiency} onChange={(e) => setEff(Number(e.target.value))} min={1} max={100} />
            <p className="text-xs text-gray-500">Drip ≈90%, Sprinkler ≈75%, Flood ≈60%</p>
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <Label>Watering days per week</Label>
            <Input type="number" value={daysPerWeek} onChange={(e) => setDays(Number(e.target.value))} min={1} max={7} />
          </div>
        </div>
      </div>
      <ResultCard label="Water per day" value={`${num(result.appliedLitresPerDay, 1)} L`} highlight sub={`${num(result.gallonsPerDay, 1)} gallons`} />
      <ResultGrid>
        <ResultCard label="Per week" value={`${num(result.litresPerWeek, 0)} L`} />
        <ResultCard label="Per month" value={`${num(result.litresPerMonth, 0)} L`} />
      </ResultGrid>
    </CalcSection>
  );
}
