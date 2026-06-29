import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResultCard, ResultGrid, CalcSection } from '../ResultCard';
import { num } from '@/lib/calcUtils';

const PRESETS = [
  { name: 'FPJ (Fermented Plant Juice)', rateMlPerSqm: 0.5, dilution: '1:500' },
  { name: 'FFJ (Fermented Fruit Juice)', rateMlPerSqm: 0.5, dilution: '1:500' },
  { name: 'WCA/WCP (Calcium Extract)', rateMlPerSqm: 1.0, dilution: '1:1000' },
  { name: 'OHN (Oriental Herbal Nutrient)', rateMlPerSqm: 0.2, dilution: '1:1000' },
  { name: 'Fish Amino Acid (FAA)', rateMlPerSqm: 0.5, dilution: '1:500' },
  { name: 'Sea Water / Sea Salt', rateMlPerSqm: 2.0, dilution: '1:30' },
  { name: 'Compost Tea', rateMlPerSqm: 10.0, dilution: '1:10' },
  { name: 'Custom', rateMlPerSqm: 1.0, dilution: '' },
];

export default function FertilizerCalc() {
  const [areaSqm, setArea] = useState(50);
  const [preset, setPreset] = useState(PRESETS[0].name);
  const [rateMlPerSqm, setRate] = useState(PRESETS[0].rateMlPerSqm);
  const [dilutionStr, setDilution] = useState(PRESETS[0].dilution);
  const [applications, setApps] = useState(1);

  const handlePreset = (name: string) => {
    const p = PRESETS.find((x) => x.name === name);
    if (p) { setRate(p.rateMlPerSqm); setDilution(p.dilution); }
    setPreset(name);
  };

  const result = useMemo(() => {
    const concentrateMl = rateMlPerSqm * areaSqm * applications;
    const dilutionParts = parseInt(dilutionStr.split(':')[1] ?? '1') || 1;
    const waterMl = concentrateMl * dilutionParts;
    const totalMl = concentrateMl + waterMl;
    return {
      concentrateMl,
      waterMl,
      totalMl,
      totalL: totalMl / 1000,
      concentrateL: concentrateMl / 1000,
    };
  }, [rateMlPerSqm, areaSqm, dilutionStr, applications]);

  return (
    <CalcSection title="Fertilizer / Amendment Calculator">
      <p className="text-sm text-gray-500">
        Calculate how much concentrate and water to mix for your area and application rate.
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label>Product / Amendment</Label>
          <Select value={preset} onValueChange={handlePreset}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label>Area (m²)</Label>
            <Input type="number" value={areaSqm} onChange={(e) => setArea(Number(e.target.value))} min={0.1} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Applications</Label>
            <Input type="number" value={applications} onChange={(e) => setApps(Number(e.target.value))} min={1} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Rate (ml per m²)</Label>
            <Input type="number" value={rateMlPerSqm} onChange={(e) => setRate(Number(e.target.value))} min={0} step={0.1} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Dilution Ratio</Label>
            <Input value={dilutionStr} onChange={(e) => setDilution(e.target.value)} placeholder="e.g. 1:500" />
          </div>
        </div>
      </div>
      <ResultCard
        label="Concentrate needed"
        value={result.concentrateMl >= 1000 ? `${num(result.concentrateL, 2)} L` : `${num(result.concentrateMl, 0)} ml`}
        sub={`For ${areaSqm} m² × ${applications} application${applications > 1 ? 's' : ''}`}
        highlight
      />
      <ResultGrid>
        <ResultCard label="Water to add" value={result.waterMl >= 1000 ? `${num(result.waterMl / 1000, 2)} L` : `${num(result.waterMl, 0)} ml`} />
        <ResultCard label="Total mix volume" value={`${num(result.totalL, 2)} L`} sub="Concentrate + water" />
      </ResultGrid>
    </CalcSection>
  );
}
