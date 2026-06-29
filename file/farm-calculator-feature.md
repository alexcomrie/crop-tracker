# Farm Calculator — Full Feature Implementation Guide

A multi-function calculator built specifically for farm planning, revenue goals, and production decisions. Not a generic calculator — every function is framed around a farming outcome.

---

## Overview

The calculator lives as its own page (`/calculator`) in the nav. It is organized into **calculator modules** — each one solves a specific farm math problem. The user picks a module, fills in the inputs, and gets an instant result with a breakdown explanation.

All calculations are **client-side only** — no new DB tables or API routes are needed. Results can optionally be saved to localStorage for quick reference.

---

## Page Structure

```tsx
// client/src/pages/FarmCalculator.tsx — shell

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RevenueGoalCalc from "@/components/calculators/RevenueGoalCalc";
import BreakEvenCalc from "@/components/calculators/BreakEvenCalc";
import SeedCalc from "@/components/calculators/SeedCalc";
import FertilizerCalc from "@/components/calculators/FertilizerCalc";
import SpacingYieldCalc from "@/components/calculators/SpacingYieldCalc";
import ProfitMarginCalc from "@/components/calculators/ProfitMarginCalc";
import HarvestWindowCalc from "@/components/calculators/HarvestWindowCalc";
import WaterCalc from "@/components/calculators/WaterCalc";

const MODULES = [
  { id: "revenue",    label: "Revenue Goal",    icon: "💰" },
  { id: "breakeven",  label: "Break-Even",       icon: "⚖️" },
  { id: "seed",       label: "Seed Need",        icon: "🌱" },
  { id: "fertilizer", label: "Fertilizer",       icon: "🧪" },
  { id: "spacing",    label: "Spacing & Yield",  icon: "📐" },
  { id: "profit",     label: "Profit Margin",    icon: "📈" },
  { id: "harvest",    label: "Harvest Window",   icon: "📅" },
  { id: "water",      label: "Water Need",       icon: "💧" },
];

export default function FarmCalculator() {
  const [active, setActive] = useState("revenue");

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <h1 className="text-xl font-bold">Farm Calculator</h1>
        <p className="text-xs text-muted-foreground">Plan production and revenue goals</p>
      </div>

      {/* Horizontal scrollable module picker */}
      <div className="overflow-x-auto border-b px-2 py-2">
        <div className="flex gap-2 min-w-max px-2">
          {MODULES.map((m) => (
            <button
              key={m.id}
              onClick={() => setActive(m.id)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-colors
                ${active === m.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
            >
              <span className="text-lg">{m.icon}</span>
              <span className="whitespace-nowrap">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Active calculator module */}
      <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">
        {active === "revenue"    && <RevenueGoalCalc />}
        {active === "breakeven"  && <BreakEvenCalc />}
        {active === "seed"       && <SeedCalc />}
        {active === "fertilizer" && <FertilizerCalc />}
        {active === "spacing"    && <SpacingYieldCalc />}
        {active === "profit"     && <ProfitMarginCalc />}
        {active === "harvest"    && <HarvestWindowCalc />}
        {active === "water"      && <WaterCalc />}
      </div>
    </div>
  );
}
```

---

## Shared Utility

```typescript
// client/src/lib/calcUtils.ts

/** Format a number as currency */
export const currency = (n: number, symbol = "$") =>
  `${symbol}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Format a number with commas */
export const num = (n: number, decimals = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Round to N decimal places */
export const round = (n: number, places = 2) =>
  Math.round(n * 10 ** places) / 10 ** places;
```

### Shared Result Card Component

```tsx
// client/src/components/calculators/ResultCard.tsx

interface ResultCardProps {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}

export function ResultCard({ label, value, sub, highlight }: ResultCardProps) {
  return (
    <div className={`rounded-xl p-4 flex flex-col gap-1 ${highlight ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${highlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
        {label}
      </p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className={`text-xs ${highlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{sub}</p>}
    </div>
  );
}

export function ResultGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

export function CalcSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </div>
  );
}
```

---

## Module 1 — Revenue Goal Calculator 💰

**Question it answers:** "I want to make $20,000. How much crop do I need to sell?"

This is the flagship module. The user sets a revenue target and enters the price per unit — the calculator works backwards to tell them exactly how much to produce and sell.

```tsx
// client/src/components/calculators/RevenueGoalCalc.tsx

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ResultCard, ResultGrid, CalcSection } from "./ResultCard";
import { currency, num, round } from "@/lib/calcUtils";

const UNITS = ["lb", "kg", "oz", "box (10 lb)", "bunch", "crate (25 lb)", "bag (5 lb)"];

// Weight in lbs for unit conversion (for reference)
const UNIT_LB: Record<string, number> = {
  "lb": 1, "kg": 2.205, "oz": 0.0625,
  "box (10 lb)": 10, "bunch": 0.5,
  "crate (25 lb)": 25, "bag (5 lb)": 5,
};

export default function RevenueGoalCalc() {
  const [goal, setGoal]           = useState(20000);
  const [pricePerUnit, setPrice]  = useState(100);
  const [unit, setUnit]           = useState("lb");
  const [wastePct, setWaste]      = useState(10);    // % post-harvest loss
  const [cropName, setCrop]       = useState("");

  const result = useMemo(() => {
    if (!pricePerUnit || !goal) return null;
    const unitsNeededToSell = goal / pricePerUnit;
    // Account for waste: must harvest MORE than you sell
    const unitsToHarvest = unitsNeededToSell / (1 - wastePct / 100);
    const lbsToHarvest = unitsToHarvest * (UNIT_LB[unit] ?? 1);
    const revenuePerLb = pricePerUnit / (UNIT_LB[unit] ?? 1);

    return {
      unitsToSell: round(unitsNeededToSell),
      unitsToHarvest: round(unitsToHarvest),
      lbsToHarvest: round(lbsToHarvest),
      kgToHarvest: round(lbsToHarvest / 2.205),
      wasteUnits: round(unitsToHarvest - unitsNeededToSell),
      revenuePerLb: round(revenuePerLb, 4),
    };
  }, [goal, pricePerUnit, unit, wastePct]);

  return (
    <CalcSection title="Revenue Goal Calculator">
      <p className="text-sm text-muted-foreground">
        Set a revenue target and selling price. The calculator tells you exactly how much to grow and sell.
      </p>

      {/* Inputs */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label>Crop Name (optional)</Label>
          <Input value={cropName} onChange={(e) => setCrop(e.target.value)} placeholder="e.g. Tomatoes" />
        </div>

        <div className="flex flex-col gap-1">
          <Label>Revenue Goal ($)</Label>
          <Input type="number" value={goal} onChange={(e) => setGoal(Number(e.target.value))} min={0} />
        </div>

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
          <p className="text-xs text-muted-foreground">Accounts for culls, damage, and unsold produce</p>
        </div>
      </div>

      <Separator />

      {/* Results */}
      {result && (
        <div className="flex flex-col gap-3">
          <ResultCard
            label={`${cropName || "Crop"} to sell`}
            value={`${num(result.unitsToSell, 1)} ${unit}`}
            sub={`At ${currency(pricePerUnit)} per ${unit} = ${currency(goal)} revenue`}
            highlight
          />
          <ResultGrid>
            <ResultCard
              label="Must harvest"
              value={`${num(result.unitsToHarvest, 1)} ${unit}`}
              sub={`Includes ${wastePct}% waste buffer`}
            />
            <ResultCard
              label="Expected waste"
              value={`${num(result.wasteUnits, 1)} ${unit}`}
              sub="Culls + unsold"
            />
            <ResultCard
              label="Total weight (lbs)"
              value={`${num(result.lbsToHarvest, 0)} lb`}
            />
            <ResultCard
              label="Total weight (kg)"
              value={`${num(result.kgToHarvest, 0)} kg`}
            />
          </ResultGrid>

          {/* Scenario table */}
          <div className="rounded-xl border overflow-hidden">
            <p className="text-xs font-semibold px-3 py-2 bg-muted border-b">Price scenarios to reach {currency(goal)}</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2">Price / {unit}</th>
                  <th className="text-right px-3 py-2">Units to sell</th>
                  <th className="text-right px-3 py-2">Must harvest</th>
                </tr>
              </thead>
              <tbody>
                {[pricePerUnit * 0.5, pricePerUnit * 0.75, pricePerUnit, pricePerUnit * 1.25, pricePerUnit * 1.5]
                  .map((p) => {
                    const sell = goal / p;
                    const harvest = sell / (1 - wastePct / 100);
                    return (
                      <tr key={p} className={`border-b ${p === pricePerUnit ? "bg-primary/5 font-semibold" : ""}`}>
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
    </CalcSection>
  );
}
```

---

## Module 2 — Break-Even Calculator ⚖️

**Question it answers:** "How much do I need to sell just to cover my costs?"

The user enters their total costs (seeds, amendments, labour, water, packaging, transport) and selling price. The calculator returns the break-even quantity and the profit at various sales volumes.

```tsx
// client/src/components/calculators/BreakEvenCalc.tsx

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { ResultCard, ResultGrid, CalcSection } from "./ResultCard";
import { currency, num } from "@/lib/calcUtils";

type CostLine = { label: string; amount: number };

const DEFAULT_COSTS: CostLine[] = [
  { label: "Seeds / seedlings",    amount: 0 },
  { label: "Soil amendments",      amount: 0 },
  { label: "Labour",               amount: 0 },
  { label: "Packaging",            amount: 0 },
  { label: "Transport / market",   amount: 0 },
  { label: "Water",                amount: 0 },
];

export default function BreakEvenCalc() {
  const [costs, setCosts]         = useState<CostLine[]>(DEFAULT_COSTS);
  const [pricePerUnit, setPrice]  = useState(100);
  const [unit, setUnit]           = useState("lb");
  const [targetUnits, setTarget]  = useState(200);

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
      <p className="text-sm text-muted-foreground">
        Enter all your costs to find out how much you must sell before you start profiting.
      </p>

      {/* Cost lines */}
      <div className="flex flex-col gap-2">
        <Label>Cost Breakdown</Label>
        {costs.map((cost, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
            <Input
              value={cost.label}
              onChange={(e) => updateCost(i, "label", e.target.value)}
              placeholder="Cost item"
              className="h-8 text-sm"
            />
            <Input
              type="number"
              value={cost.amount || ""}
              onChange={(e) => updateCost(i, "amount", Number(e.target.value))}
              placeholder="$"
              className="h-8 text-sm w-24"
              min={0}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive"
              onClick={() => setCosts((p) => p.filter((_, idx) => idx !== i))}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setCosts((p) => [...p, { label: "", amount: 0 }])}
        >
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
          <ResultCard
            label="Break-even point"
            value={`${num(result.breakEvenUnits, 1)} ${unit}`}
            sub={`Sell this much just to cover ${currency(totalCost)} in costs`}
            highlight
          />
          <ResultGrid>
            <ResultCard
              label="Projected revenue"
              value={currency(result.projectedRevenue)}
              sub={`${num(targetUnits, 0)} ${unit} × ${currency(pricePerUnit)}`}
            />
            <ResultCard
              label="Projected profit"
              value={currency(result.projectedProfit)}
              sub={result.projectedProfit >= 0 ? "✅ Profitable" : "❌ At a loss"}
            />
            <ResultCard
              label="Profit margin"
              value={`${num(result.marginPct, 1)}%`}
            />
            <ResultCard
              label={result.projectedProfit >= 0 ? "Above break-even by" : "Below break-even by"}
              value={`${num(Math.abs(targetUnits - result.breakEvenUnits), 1)} ${unit}`}
            />
          </ResultGrid>
        </div>
      )}
    </CalcSection>
  );
}
```

---

## Module 3 — Seed Quantity Calculator 🌱

**Question it answers:** "How many seeds do I need for my bed, and how many packs should I buy?"

```tsx
// client/src/components/calculators/SeedCalc.tsx

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResultCard, ResultGrid, CalcSection } from "./ResultCard";
import { num } from "@/lib/calcUtils";

export default function SeedCalc() {
  const [bedLengthM, setBedLength]      = useState(10);    // metres
  const [rowCount, setRowCount]         = useState(4);
  const [spacingCm, setSpacing]         = useState(30);    // cm between plants
  const [germinationPct, setGerm]       = useState(80);    // % germination rate
  const [seedsPerPack, setPackSize]     = useState(100);
  const [pricePerPack, setPackPrice]    = useState(5);
  const [successionWeeks, setSucc]      = useState(1);     // how many succession plantings

  const result = useMemo(() => {
    const plantsPerRow = Math.ceil((bedLengthM * 100) / spacingCm);
    const plantsNeeded = plantsPerRow * rowCount * successionWeeks;
    // Extra seeds to account for germination failure
    const seedsNeeded = Math.ceil(plantsNeeded / (germinationPct / 100));
    const packsNeeded = Math.ceil(seedsNeeded / seedsPerPack);
    const totalCost = packsNeeded * pricePerPack;
    return { plantsPerRow, plantsNeeded, seedsNeeded, packsNeeded, totalCost };
  }, [bedLengthM, rowCount, spacingCm, germinationPct, seedsPerPack, pricePerPack, successionWeeks]);

  return (
    <CalcSection title="Seed Quantity Calculator">
      <p className="text-sm text-muted-foreground">
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
          <p className="text-xs text-muted-foreground">Number of planting rounds (e.g. 3 = stagger over 3 periods)</p>
        </div>
      </div>
      <ResultCard label="Seeds to buy" value={`${num(result.seedsNeeded, 0)} seeds`} highlight sub={`${result.plantsNeeded} plants needed + germination buffer`} />
      <ResultGrid>
        <ResultCard label="Packs to buy" value={`${result.packsNeeded} pack${result.packsNeeded !== 1 ? "s" : ""}`} />
        <ResultCard label="Seed cost" value={`$${num(result.totalCost, 2)}`} />
        <ResultCard label="Plants per row" value={num(result.plantsPerRow, 0)} />
        <ResultCard label="Total plants" value={num(result.plantsNeeded, 0)} />
      </ResultGrid>
    </CalcSection>
  );
}
```

---

## Module 4 — Fertilizer / Amendment Calculator 🧪

**Question it answers:** "How much fertilizer do I need for this area at this dilution rate?"

This module is the companion to the Soil Amendment Tracker in the Area Mapper. The user enters area size (or pulls it from a mapped area) and the recommended application rate, and gets the total volume to mix.

```tsx
// client/src/components/calculators/FertilizerCalc.tsx

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResultCard, ResultGrid, CalcSection } from "./ResultCard";
import { num } from "@/lib/calcUtils";

// Common KNF / organic products with typical rates
const PRESETS = [
  { name: "FPJ (Fermented Plant Juice)",        rateMlPerSqm: 0.5,  dilution: "1:500"  },
  { name: "FFJ (Fermented Fruit Juice)",         rateMlPerSqm: 0.5,  dilution: "1:500"  },
  { name: "WCA/WCP (Calcium Extract)",           rateMlPerSqm: 1.0,  dilution: "1:1000" },
  { name: "OHN (Oriental Herbal Nutrient)",      rateMlPerSqm: 0.2,  dilution: "1:1000" },
  { name: "Fish Amino Acid (FAA)",               rateMlPerSqm: 0.5,  dilution: "1:500"  },
  { name: "Sea Water / Sea Salt",                rateMlPerSqm: 2.0,  dilution: "1:30"   },
  { name: "Compost Tea",                         rateMlPerSqm: 10.0, dilution: "1:10"   },
  { name: "Custom",                              rateMlPerSqm: 1.0,  dilution: ""       },
];

export default function FertilizerCalc() {
  const [areaSqm, setArea]          = useState(50);
  const [preset, setPreset]         = useState(PRESETS[0].name);
  const [rateMlPerSqm, setRate]     = useState(PRESETS[0].rateMlPerSqm);
  const [dilutionStr, setDilution]  = useState(PRESETS[0].dilution);  // e.g. "1:500"
  const [applications, setApps]     = useState(1);

  const handlePreset = (name: string) => {
    const p = PRESETS.find((x) => x.name === name);
    if (p) { setRate(p.rateMlPerSqm); setDilution(p.dilution); }
    setPreset(name);
  };

  const result = useMemo(() => {
    // Total concentrate needed (ml)
    const concentrateMl = rateMlPerSqm * areaSqm * applications;
    // Parse dilution ratio — "1:500" means 1 part concentrate per 500 parts water
    const dilutionParts = parseInt(dilutionStr.split(":")[1] ?? "1") || 1;
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
      <p className="text-sm text-muted-foreground">
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
        sub={`For ${areaSqm} m² × ${applications} application${applications > 1 ? "s" : ""}`}
        highlight
      />
      <ResultGrid>
        <ResultCard label="Water to add" value={result.waterMl >= 1000 ? `${num(result.waterMl / 1000, 2)} L` : `${num(result.waterMl, 0)} ml`} />
        <ResultCard label="Total mix volume" value={`${num(result.totalL, 2)} L`} sub="Concentrate + water" />
      </ResultGrid>
    </CalcSection>
  );
}
```

---

## Module 5 — Spacing & Yield Estimator 📐

**Question it answers:** "Given my bed dimensions and plant spacing, how many plants fit and what yield can I expect?"

```tsx
// client/src/components/calculators/SpacingYieldCalc.tsx

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResultCard, ResultGrid, CalcSection } from "./ResultCard";
import { num, currency } from "@/lib/calcUtils";

export default function SpacingYieldCalc() {
  const [bedLengthM, setLength]     = useState(10);
  const [bedWidthM, setWidth]       = useState(1.2);
  const [rowSpacingCm, setRowSp]    = useState(40);
  const [plantSpacingCm, setPlSp]   = useState(30);
  const [yieldKgPerPlant, setYield] = useState(2);    // expected kg per plant
  const [pricePerKg, setPrice]      = useState(5);

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
      <p className="text-sm text-muted-foreground">
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
```

---

## Module 6 — Profit Margin Calculator 📈

**Question it answers:** "What is my actual profit per unit after all costs?"

```tsx
// client/src/components/calculators/ProfitMarginCalc.tsx

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResultCard, ResultGrid, CalcSection } from "./ResultCard";
import { currency, num } from "@/lib/calcUtils";

export default function ProfitMarginCalc() {
  const [sellingPrice, setSell]     = useState(5.00);
  const [costToGrow, setCost]       = useState(2.50);   // per unit
  const [packagingCost, setPack]    = useState(0.25);
  const [labourCost, setLabour]     = useState(0.50);
  const [marketFeePct, setFee]      = useState(10);     // % of selling price
  const [units, setUnits]           = useState(1000);

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
      <p className="text-sm text-muted-foreground">
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
          <p className="text-xs text-muted-foreground">= {currency(result.feeAmt)} / unit</p>
        </div>
      </div>
      <ResultCard
        label="Profit per unit"
        value={currency(result.profitPerUnit)}
        sub={`After ${currency(result.totalCostPerUnit)} total cost per unit`}
        highlight
      />
      <ResultGrid>
        <ResultCard label="Profit margin" value={`${num(result.marginPct, 1)}%`} />
        <ResultCard label="ROI" value={`${num(result.roi, 1)}%`} sub="Return on cost" />
        <ResultCard label="Total revenue" value={currency(result.totalRevenue)} sub={`${units} units`} />
        <ResultCard label="Total profit" value={currency(result.totalProfit)} />
      </ResultGrid>
    </CalcSection>
  );
}
```

---

## Module 7 — Harvest Window Calculator 📅

**Question it answers:** "When will my crop be ready to harvest based on planting date and days-to-maturity?"

Also calculates succession planting schedules so the user can stagger plantings to have a continuous harvest.

```tsx
// client/src/components/calculators/HarvestWindowCalc.tsx

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResultCard, CalcSection } from "./ResultCard";

// Format a Date as "Mon DD, YYYY"
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

export default function HarvestWindowCalc() {
  const today = new Date().toISOString().slice(0, 10);
  const [plantDate, setPlant]       = useState(today);
  const [daysToMaturity, setDTM]    = useState(75);
  const [harvestWindowDays, setWin] = useState(14);   // how many days harvest lasts
  const [successionDays, setSucc]   = useState(14);   // days between successions
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
      <p className="text-sm text-muted-foreground">
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
      <ResultCard
        label="First harvest"
        value={fmtDate(result.firstHarvest)}
        sub={`Harvest window closes ${fmtDate(result.lastHarvest)}`}
        highlight
      />
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Succession Schedule</p>
        {result.successions.map((s, i) => (
          <div key={i} className="border rounded-lg px-3 py-2 flex justify-between items-center text-sm">
            <div>
              <p className="font-medium">Planting {i + 1}</p>
              <p className="text-xs text-muted-foreground">Plant: {fmtDate(s.plant)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-green-700">Harvest: {fmtDate(s.start)}</p>
              <p className="text-xs text-muted-foreground">Until: {fmtDate(s.end)}</p>
            </div>
          </div>
        ))}
      </div>
    </CalcSection>
  );
}
```

---

## Module 8 — Water Requirement Calculator 💧

**Question it answers:** "How much water does my area need per day / per week?"

```tsx
// client/src/components/calculators/WaterCalc.tsx

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResultCard, ResultGrid, CalcSection } from "./ResultCard";
import { num } from "@/lib/calcUtils";

const CROP_NEEDS: Record<string, number> = {
  "Tomato":     5.0,  // mm/day (approximate)
  "Lettuce":    3.0,
  "Pepper":     4.5,
  "Cucumber":   5.5,
  "Carrot":     3.5,
  "Kale":       3.0,
  "Bean":       4.0,
  "Corn":       5.0,
  "Cabbage":    4.0,
  "Custom":     4.0,
};

export default function WaterCalc() {
  const [areaSqm, setArea]          = useState(50);
  const [crop, setCrop]             = useState("Tomato");
  const [mmPerDay, setMm]           = useState(CROP_NEEDS["Tomato"]);
  const [dripEfficiency, setEff]    = useState(90);  // % — drip system is ~90% efficient
  const [daysPerWeek, setDays]      = useState(7);

  const handleCrop = (name: string) => {
    setCrop(name);
    if (CROP_NEEDS[name]) setMm(CROP_NEEDS[name]);
  };

  const result = useMemo(() => {
    // mm/day × m² = litres/day (1mm on 1m² = 1 litre)
    const rawLitresPerDay = mmPerDay * areaSqm;
    // Adjust for irrigation efficiency
    const appliedLitresPerDay = rawLitresPerDay / (dripEfficiency / 100);
    const litresPerWeek = appliedLitresPerDay * daysPerWeek;
    const litresPerMonth = appliedLitresPerDay * daysPerWeek * 4.33;
    const gallonsPerDay = appliedLitresPerDay * 0.264;
    return { appliedLitresPerDay, litresPerWeek, litresPerMonth, gallonsPerDay };
  }, [areaSqm, mmPerDay, dripEfficiency, daysPerWeek]);

  return (
    <CalcSection title="Water Requirement Calculator">
      <p className="text-sm text-muted-foreground">
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
            <p className="text-xs text-muted-foreground">Drip ≈90%, Sprinkler ≈75%, Flood ≈60%</p>
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
```

---

## Register the Route & Nav Entry

```tsx
// client/src/App.tsx
import FarmCalculator from "@/pages/FarmCalculator";
<Route path="/calculator" component={FarmCalculator} />

// client/src/components/Navigation.tsx
import { Calculator } from "lucide-react";
{ path: "/calculator", label: "Calculator", icon: Calculator }
```

---

## Integration with Area Mapper

The Area Mapper's walked area size (`areaSqm`) can be passed into the Fertilizer Calculator and Water Calculator so the user never has to type the area size manually.

```tsx
// On the area detail screen, add a shortcut button:
<Button
  size="sm"
  variant="outline"
  onClick={() => navigate(`/calculator?area=${area.areaSqm}&tab=fertilizer`)}
>
  <Calculator className="w-3 h-3 mr-1" />
  Open in Calculator
</Button>

// In FarmCalculator.tsx — read the URL param on mount:
import { useSearchParams } from "react-router-dom"; // or your router equivalent

const [params] = useSearchParams();
useEffect(() => {
  const area = params.get("area");
  const tab = params.get("tab");
  if (area) setPrefilledArea(Number(area));
  if (tab) setActive(tab);
}, []);
```

---

## Summary of All 8 Modules

| Module | Core Question Answered | Key Output |
|--------|----------------------|------------|
| **Revenue Goal** | How much must I sell to hit my target? | Units to harvest & sell |
| **Break-Even** | How much covers all my costs? | Break-even quantity + profit at target volume |
| **Seed Quantity** | How many seeds/packs do I buy? | Seed count, pack count, cost |
| **Fertilizer** | How much concentrate and water do I mix? | ml/L of concentrate + total mix volume |
| **Spacing & Yield** | How many plants fit and what's my expected harvest? | Plant count, yield kg/lb, revenue estimate |
| **Profit Margin** | What is my real profit after every cost? | Profit/unit, margin %, ROI, total profit |
| **Harvest Window** | When will it be ready? When should I stagger plantings? | Harvest date + succession schedule |
| **Water Requirement** | How much water does my area need? | Litres per day / week / month |
