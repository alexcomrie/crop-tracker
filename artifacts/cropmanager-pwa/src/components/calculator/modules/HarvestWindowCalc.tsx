import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResultCard, CalcSection } from '../ResultCard';

const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

export default function HarvestWindowCalc() {
  const today = new Date().toISOString().slice(0, 10);
  const [plantDate, setPlant] = useState(today);
  const [daysToMaturity, setDTM] = useState(75);
  const [harvestWindowDays, setWin] = useState(14);
  const [successionDays, setSucc] = useState(14);
  const [successionCount, setCount] = useState(3);

  const result = useMemo(() => {
    const planted = new Date(plantDate);
    const firstHarvest = addDays(planted, daysToMaturity);
    const lastHarvest = addDays(firstHarvest, harvestWindowDays);
    const successions = Array.from({ length: successionCount }, (_, i) => {
      const sPlant = addDays(planted, i * successionDays);
      const sHarvest = addDays(sPlant, daysToMaturity);
      const sEnd = addDays(sHarvest, harvestWindowDays);
      return { plant: sPlant, start: sHarvest, end: sEnd };
    });
    return { firstHarvest, lastHarvest, successions };
  }, [plantDate, daysToMaturity, harvestWindowDays, successionDays, successionCount]);

  return (
    <CalcSection title="Harvest Window Calculator">
      <p className="text-sm text-gray-500">
        Find your harvest dates and plan succession plantings for continuous supply.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 col-span-2">
          <Label>Planting Date</Label>
          <Input type="date" value={plantDate} onChange={(e) => setPlant(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Days to Maturity</Label>
          <Input type="number" value={daysToMaturity} onChange={(e) => setDTM(Number(e.target.value))} min={1} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Harvest Window (days)</Label>
          <Input type="number" value={harvestWindowDays} onChange={(e) => setWin(Number(e.target.value))} min={1} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Succession Interval (days)</Label>
          <Input type="number" value={successionDays} onChange={(e) => setSucc(Number(e.target.value))} min={1} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Number of Successions</Label>
          <Input type="number" value={successionCount} onChange={(e) => setCount(Number(e.target.value))} min={1} max={10} />
        </div>
      </div>
      <ResultCard label="First harvest" value={fmtDate(result.firstHarvest)} sub={`Harvest window closes ${fmtDate(result.lastHarvest)}`} highlight />
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase text-gray-500 tracking-wide">Succession Schedule</p>
        {result.successions.map((s, i) => (
          <div key={i} className="border rounded-lg px-3 py-2 flex justify-between items-center text-sm">
            <div>
              <p className="font-medium">Planting {i + 1}</p>
              <p className="text-xs text-gray-500">Plant: {fmtDate(s.plant)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-green-700">Harvest: {fmtDate(s.start)}</p>
              <p className="text-xs text-gray-500">Until: {fmtDate(s.end)}</p>
            </div>
          </div>
        ))}
      </div>
    </CalcSection>
  );
}
