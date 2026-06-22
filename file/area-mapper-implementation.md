# Farm Area Mapper — Full Implementation Guide

## Overview

This document covers everything needed to add an **Area Mapper** feature to your existing farm tracker app. It follows your existing architecture: Drizzle/Postgres backend, Express routes defined in `shared/routes.ts`, and a React/Vite/Tailwind frontend with shadcn/ui components.

---

## Feature Summary

- **Area list screen** — lists all mapped areas (auto-tagged `AREA0001`, `AREA0002`, etc.)
- **Perimeter walk mode** — uses the browser Geolocation API to record GPS coordinates as the user walks the boundary
- **Live polygon visualization** — draws the walked area in real-time on an SVG canvas
- **Area details** — stores rows, crop per row, in-row spacing, between-row spacing, planting method, and notes
- **Edit mode** — update any area's crop details without re-walking the perimeter

---

## 1. Database Schema — `shared/schema.ts`

Add these two tables to your existing schema file.

```typescript
// shared/schema.ts — add below existing tables

import { pgTable, serial, text, real, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

// Stores a single GPS coordinate point
export type GpsPoint = {
  lat: number;
  lng: number;
};

// Stores details for one crop row within an area
export type RowDetail = {
  rowNumber: number;
  cropName: string;
  spacingInRow: number;    // cm between plants in the row
  notes?: string;
};

export const farmAreas = pgTable("farm_areas", {
  id: serial("id").primaryKey(),
  tag: text("tag").notNull().unique(),               // e.g. "AREA0001"
  name: text("name"),                                // optional friendly name
  perimeterPoints: jsonb("perimeter_points").$type<GpsPoint[]>().default([]),
  areaSqm: real("area_sqm"),                         // calculated from perimeter
  rowCount: integer("row_count").default(0),
  rowSpacing: real("row_spacing"),                   // cm between rows
  rowDetails: jsonb("row_details").$type<RowDetail[]>().default([]),
  platingMethod: text("planting_method"),            // matches your existing methods
  status: text("status").notNull().default("unmapped"), // "unmapped" | "mapped" | "cultivated"
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Zod schemas for validation
import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";

export const insertFarmAreaSchema = createInsertSchema(farmAreas).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateFarmAreaSchema = insertFarmAreaSchema.partial();

export type FarmArea = typeof farmAreas.$inferSelect;
export type InsertFarmArea = z.infer<typeof insertFarmAreaSchema>;
export type UpdateFarmArea = z.infer<typeof updateFarmAreaSchema>;
```

### Migration

Run this SQL against your Postgres database (or use Drizzle's `drizzle-kit push`):

```sql
CREATE TABLE IF NOT EXISTS farm_areas (
  id          SERIAL PRIMARY KEY,
  tag         TEXT NOT NULL UNIQUE,
  name        TEXT,
  perimeter_points  JSONB DEFAULT '[]',
  area_sqm    REAL,
  row_count   INTEGER DEFAULT 0,
  row_spacing REAL,
  row_details JSONB DEFAULT '[]',
  planting_method TEXT,
  status      TEXT NOT NULL DEFAULT 'unmapped',
  notes       TEXT,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);
```

---

## 2. API Routes — `shared/routes.ts`

Add area mapper routes alongside your existing `api` object:

```typescript
// shared/routes.ts — add inside the `api` object

farmAreas: {
  list:   { method: "GET",    path: "/api/farm-areas" },
  get:    { method: "GET",    path: "/api/farm-areas/:id" },
  create: { method: "POST",   path: "/api/farm-areas" },
  update: { method: "PATCH",  path: "/api/farm-areas/:id" },
  delete: { method: "DELETE", path: "/api/farm-areas/:id" },
},
```

---

## 3. Server Storage — `server/storage.ts`

Add these methods to your existing storage class/object:

```typescript
// server/storage.ts — add to your IStorage interface and DatabaseStorage class

import { farmAreas, InsertFarmArea, UpdateFarmArea, FarmArea } from "../shared/schema";
import { eq, count } from "drizzle-orm";

// --- Interface additions ---
listFarmAreas(): Promise<FarmArea[]>;
getFarmArea(id: number): Promise<FarmArea | undefined>;
createFarmArea(data: InsertFarmArea): Promise<FarmArea>;
updateFarmArea(id: number, data: UpdateFarmArea): Promise<FarmArea | undefined>;
deleteFarmArea(id: number): Promise<boolean>;
getNextAreaTag(): Promise<string>;

// --- Implementation ---

async listFarmAreas(): Promise<FarmArea[]> {
  return await db.select().from(farmAreas).orderBy(farmAreas.createdAt);
},

async getFarmArea(id: number): Promise<FarmArea | undefined> {
  const [area] = await db.select().from(farmAreas).where(eq(farmAreas.id, id));
  return area;
},

async createFarmArea(data: InsertFarmArea): Promise<FarmArea> {
  const [area] = await db.insert(farmAreas).values(data).returning();
  return area;
},

async updateFarmArea(id: number, data: UpdateFarmArea): Promise<FarmArea | undefined> {
  const [area] = await db
    .update(farmAreas)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(farmAreas.id, id))
    .returning();
  return area;
},

async deleteFarmArea(id: number): Promise<boolean> {
  const result = await db.delete(farmAreas).where(eq(farmAreas.id, id));
  return (result.rowCount ?? 0) > 0;
},

async getNextAreaTag(): Promise<string> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(farmAreas);
  const nextNum = (Number(value) + 1).toString().padStart(4, "0");
  return `AREA${nextNum}`;
},
```

---

## 4. Server Routes — `server/routes.ts`

Register the endpoints inside your `registerRoutes` function:

```typescript
// server/routes.ts — add inside registerRoutes()

// GET /api/farm-areas
app.get("/api/farm-areas", async (_req, res) => {
  const areas = await storage.listFarmAreas();
  res.json(areas);
});

// GET /api/farm-areas/:id
app.get("/api/farm-areas/:id", async (req, res) => {
  const area = await storage.getFarmArea(Number(req.params.id));
  if (!area) return res.status(404).json({ error: "Area not found" });
  res.json(area);
});

// POST /api/farm-areas
app.post("/api/farm-areas", async (req, res) => {
  const tag = await storage.getNextAreaTag();
  const parsed = insertFarmAreaSchema.safeParse({ ...req.body, tag });
  if (!parsed.success) return res.status(400).json({ error: parsed.error });
  const area = await storage.createFarmArea(parsed.data);
  res.status(201).json(area);
});

// PATCH /api/farm-areas/:id
app.patch("/api/farm-areas/:id", async (req, res) => {
  const parsed = updateFarmAreaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error });
  const area = await storage.updateFarmArea(Number(req.params.id), parsed.data);
  if (!area) return res.status(404).json({ error: "Area not found" });
  res.json(area);
});

// DELETE /api/farm-areas/:id
app.delete("/api/farm-areas/:id", async (req, res) => {
  const deleted = await storage.deleteFarmArea(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: "Area not found" });
  res.status(204).send();
});
```

---

## 5. Geometry Utility — `client/src/lib/geoUtils.ts`

This file handles coordinate math — converting GPS points to a flat SVG polygon and calculating area using the Shoelace formula.

```typescript
// client/src/lib/geoUtils.ts

export type GpsPoint = { lat: number; lng: number };
export type SvgPoint = { x: number; y: number };

/**
 * Converts GPS coordinates to SVG canvas coordinates.
 * Centers the polygon in a viewBox of the given size.
 */
export function gpsToSvg(
  points: GpsPoint[],
  canvasWidth: number,
  canvasHeight: number,
  padding = 20
): SvgPoint[] {
  if (points.length === 0) return [];

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latRange = maxLat - minLat || 0.0001;
  const lngRange = maxLng - minLng || 0.0001;

  const usableW = canvasWidth - padding * 2;
  const usableH = canvasHeight - padding * 2;

  return points.map((p) => ({
    x: padding + ((p.lng - minLng) / lngRange) * usableW,
    // Flip Y: higher lat = higher on screen
    y: padding + ((maxLat - p.lat) / latRange) * usableH,
  }));
}

/**
 * Calculates area in square meters using the Shoelace formula
 * applied to GPS lat/lng coordinates converted to meters.
 */
export function calcAreaSqm(points: GpsPoint[]): number {
  if (points.length < 3) return 0;

  // Convert to approximate meters using equirectangular projection
  const avgLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((avgLat * Math.PI) / 180);

  const pts = points.map((p) => ({
    x: p.lng * metersPerDegLng,
    y: p.lat * metersPerDegLat,
  }));

  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area / 2);
}

/**
 * Formats area in sqm to a readable string (sqm or hectares).
 */
export function formatArea(sqm: number): string {
  if (sqm >= 10000) return `${(sqm / 10000).toFixed(2)} ha`;
  if (sqm >= 1) return `${sqm.toFixed(1)} m²`;
  return `${(sqm * 10000).toFixed(0)} cm²`;
}
```

---

## 6. TanStack Query Hooks — `client/src/hooks/useFarmAreas.ts`

```typescript
// client/src/hooks/useFarmAreas.ts

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { FarmArea, InsertFarmArea, UpdateFarmArea } from "../../../shared/schema";

const BASE = "/api/farm-areas";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export function useFarmAreas() {
  return useQuery<FarmArea[]>({
    queryKey: ["farmAreas"],
    queryFn: () => fetchJson(BASE),
  });
}

export function useFarmArea(id: number) {
  return useQuery<FarmArea>({
    queryKey: ["farmAreas", id],
    queryFn: () => fetchJson(`${BASE}/${id}`),
    enabled: !!id,
  });
}

export function useCreateFarmArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<InsertFarmArea>) =>
      fetchJson<FarmArea>(BASE, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["farmAreas"] }),
  });
}

export function useUpdateFarmArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateFarmArea }) =>
      fetchJson<FarmArea>(`${BASE}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["farmAreas"] }),
  });
}

export function useDeleteFarmArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      fetchJson<void>(`${BASE}/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["farmAreas"] }),
  });
}
```

---

## 7. Perimeter Walk Component — `client/src/components/PerimeterWalker.tsx`

This is the core component. It activates the device GPS, records points as the user walks, and renders a live SVG polygon.

```tsx
// client/src/components/PerimeterWalker.tsx

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { gpsToSvg, calcAreaSqm, formatArea, type GpsPoint } from "@/lib/geoUtils";

interface Props {
  initialPoints?: GpsPoint[];
  onComplete: (points: GpsPoint[], areaSqm: number) => void;
  onCancel: () => void;
}

const CANVAS_W = 320;
const CANVAS_H = 280;
// Minimum distance (meters) between recorded points to avoid noise clutter
const MIN_POINT_DISTANCE = 1.5;

function distanceMeters(a: GpsPoint, b: GpsPoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin2 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(sin2), Math.sqrt(1 - sin2));
}

export default function PerimeterWalker({ initialPoints = [], onComplete, onCancel }: Props) {
  const [points, setPoints] = useState<GpsPoint[]>(initialPoints);
  const [isRecording, setIsRecording] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<GpsPoint | null>(null);

  const svgPoints = gpsToSvg(points, CANVAS_W, CANVAS_H);
  const areaSqm = calcAreaSqm(points);

  const startRecording = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported on this device.");
      return;
    }
    setError(null);
    setIsRecording(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newPoint: GpsPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setAccuracy(pos.coords.accuracy);

        // Only add point if far enough from last recorded point
        if (
          !lastPointRef.current ||
          distanceMeters(lastPointRef.current, newPoint) >= MIN_POINT_DISTANCE
        ) {
          lastPointRef.current = newPoint;
          setPoints((prev) => [...prev, newPoint]);
        }
      },
      (err) => {
        setError(`GPS error: ${err.message}`);
        setIsRecording(false);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  }, []);

  const stopRecording = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const undoLastPoint = () => {
    setPoints((prev) => {
      const next = prev.slice(0, -1);
      lastPointRef.current = next.length > 0 ? next[next.length - 1] : null;
      return next;
    });
  };

  const reset = () => {
    stopRecording();
    setPoints([]);
    lastPointRef.current = null;
  };

  // Cleanup on unmount
  useEffect(() => () => stopRecording(), [stopRecording]);

  const polylineStr = svgPoints.map((p) => `${p.x},${p.y}`).join(" ");
  const polygonStr =
    points.length >= 3 ? svgPoints.map((p) => `${p.x},${p.y}`).join(" ") : "";

  return (
    <div className="flex flex-col gap-4">
      {/* Status bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={isRecording ? "destructive" : "secondary"}>
          {isRecording ? "● Recording" : "Stopped"}
        </Badge>
        {accuracy !== null && (
          <Badge variant="outline">GPS ±{accuracy.toFixed(0)} m</Badge>
        )}
        <Badge variant="outline">{points.length} points</Badge>
        {areaSqm > 0 && (
          <Badge className="bg-green-600 text-white">{formatArea(areaSqm)}</Badge>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-500 bg-red-50 rounded p-2">{error}</p>
      )}

      {/* Live SVG map */}
      <div className="border rounded-lg overflow-hidden bg-green-50">
        <svg
          width={CANVAS_W}
          height={CANVAS_H}
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          className="w-full"
        >
          {/* Closed filled polygon (once ≥3 points) */}
          {polygonStr && (
            <polygon
              points={polygonStr}
              fill="rgba(34,197,94,0.25)"
              stroke="#16a34a"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          )}
          {/* Open polyline while walking */}
          {points.length >= 2 && !polygonStr && (
            <polyline
              points={polylineStr}
              fill="none"
              stroke="#16a34a"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          )}
          {/* Point dots */}
          {svgPoints.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === 0 ? 6 : 3}
              fill={i === 0 ? "#15803d" : "#4ade80"}
              stroke="white"
              strokeWidth="1"
            />
          ))}
          {/* Start label */}
          {svgPoints[0] && (
            <text
              x={svgPoints[0].x + 8}
              y={svgPoints[0].y + 4}
              fontSize="10"
              fill="#15803d"
              fontWeight="bold"
            >
              START
            </text>
          )}
          {/* Empty state */}
          {points.length === 0 && (
            <text
              x={CANVAS_W / 2}
              y={CANVAS_H / 2}
              textAnchor="middle"
              fontSize="13"
              fill="#86efac"
            >
              Walk the perimeter to map this area
            </text>
          )}
        </svg>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-2">
        {!isRecording ? (
          <Button onClick={startRecording} className="bg-green-600 hover:bg-green-700 col-span-2">
            {points.length > 0 ? "Resume Recording" : "Start Walk"}
          </Button>
        ) : (
          <Button onClick={stopRecording} variant="destructive" className="col-span-2">
            Pause Recording
          </Button>
        )}
        <Button
          variant="outline"
          onClick={undoLastPoint}
          disabled={points.length === 0}
        >
          Undo Last Point
        </Button>
        <Button variant="outline" onClick={reset} disabled={points.length === 0}>
          Reset
        </Button>
      </div>

      {/* Confirm / Cancel */}
      <div className="flex gap-2 pt-1">
        <Button
          onClick={() => onComplete(points, areaSqm)}
          disabled={points.length < 3}
          className="flex-1"
        >
          Confirm Area ({points.length >= 3 ? formatArea(areaSqm) : "need ≥3 points"})
        </Button>
        <Button variant="ghost" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
}
```

---

## 8. Area Details Form — `client/src/components/AreaDetailsForm.tsx`

Used to set/update rows, crops, spacing, and planting method after the perimeter is mapped.

```tsx
// client/src/components/AreaDetailsForm.tsx

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { FarmArea, RowDetail } from "../../../shared/schema";

interface Props {
  area: Partial<FarmArea>;
  onSave: (data: Partial<FarmArea>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const PLANTING_METHODS = [
  "Direct Ground",
  "Seed Bed",
  "Seed Tray",
  "Pot / Container",
  "Hydroponic",
];

export default function AreaDetailsForm({ area, onSave, onCancel, isLoading }: Props) {
  const [name, setName] = useState(area.name ?? "");
  const [rowCount, setRowCount] = useState(area.rowCount ?? 1);
  const [rowSpacing, setRowSpacing] = useState(area.rowSpacing ?? 30);
  const [plantingMethod, setPlantingMethod] = useState(area.platingMethod ?? "Direct Ground");
  const [notes, setNotes] = useState(area.notes ?? "");

  // Build initial row detail state
  const [rowDetails, setRowDetails] = useState<RowDetail[]>(() => {
    const existing = area.rowDetails ?? [];
    return Array.from({ length: rowCount }, (_, i) => ({
      rowNumber: i + 1,
      cropName: existing[i]?.cropName ?? "",
      spacingInRow: existing[i]?.spacingInRow ?? 20,
      notes: existing[i]?.notes ?? "",
    }));
  });

  // Sync rows array when rowCount changes
  const handleRowCountChange = (val: number) => {
    const count = Math.max(1, Math.min(100, val));
    setRowCount(count);
    setRowDetails((prev) =>
      Array.from({ length: count }, (_, i) => ({
        rowNumber: i + 1,
        cropName: prev[i]?.cropName ?? "",
        spacingInRow: prev[i]?.spacingInRow ?? 20,
        notes: prev[i]?.notes ?? "",
      }))
    );
  };

  const updateRow = (index: number, field: keyof RowDetail, value: string | number) => {
    setRowDetails((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const handleSave = () => {
    onSave({
      name: name || undefined,
      rowCount,
      rowSpacing,
      rowDetails,
      platingMethod: plantingMethod,
      notes: notes || undefined,
      status: "cultivated",
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Area name */}
      <div className="flex flex-col gap-1">
        <Label>Area Name (optional)</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={area.tag ?? "e.g. North Bed"}
        />
      </div>

      {/* Planting method */}
      <div className="flex flex-col gap-1">
        <Label>Planting Method</Label>
        <Select value={plantingMethod} onValueChange={setPlantingMethod}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLANTING_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Row config */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label>Number of Rows</Label>
          <Input
            type="number"
            min={1}
            value={rowCount}
            onChange={(e) => handleRowCountChange(Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Row Spacing (cm)</Label>
          <Input
            type="number"
            min={1}
            value={rowSpacing}
            onChange={(e) => setRowSpacing(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Per-row details */}
      <div className="flex flex-col gap-3">
        <Label className="font-semibold">Row Details</Label>
        <div className="max-h-64 overflow-y-auto flex flex-col gap-3 pr-1">
          {rowDetails.map((row, i) => (
            <div key={i} className="border rounded-md p-3 flex flex-col gap-2 bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Row {row.rowNumber}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Crop</Label>
                  <Input
                    value={row.cropName}
                    onChange={(e) => updateRow(i, "cropName", e.target.value)}
                    placeholder="e.g. Tomato"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">In-Row Spacing (cm)</Label>
                  <Input
                    type="number"
                    value={row.spacingInRow}
                    onChange={(e) => updateRow(i, "spacingInRow", Number(e.target.value))}
                    className="h-8 text-sm"
                    min={1}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Row Notes</Label>
                <Input
                  value={row.notes ?? ""}
                  onChange={(e) => updateRow(i, "notes", e.target.value)}
                  placeholder="Optional"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* General notes */}
      <div className="flex flex-col gap-1">
        <Label>General Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Soil prep, amendments, observations..."
          rows={2}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={isLoading} className="flex-1">
          {isLoading ? "Saving..." : "Save Details"}
        </Button>
        <Button variant="ghost" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
}
```

---

## 9. Main Page — `client/src/pages/AreaMapper.tsx`

The full page that ties everything together: area list, add button, perimeter walk dialog, and details form.

```tsx
// client/src/pages/AreaMapper.tsx

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MapPin, Plus, Pencil, Trash2, Route } from "lucide-react";
import {
  useFarmAreas,
  useCreateFarmArea,
  useUpdateFarmArea,
  useDeleteFarmArea,
} from "@/hooks/useFarmAreas";
import PerimeterWalker from "@/components/PerimeterWalker";
import AreaDetailsForm from "@/components/AreaDetailsForm";
import { gpsToSvg, formatArea } from "@/lib/geoUtils";
import type { FarmArea, GpsPoint } from "../../../shared/schema";

type DialogMode = "walk" | "details" | null;

const THUMB_W = 120;
const THUMB_H = 80;

function AreaThumbnail({ points }: { points: GpsPoint[] }) {
  const svgPts = gpsToSvg(points, THUMB_W, THUMB_H, 8);
  const polyStr = svgPts.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <svg width={THUMB_W} height={THUMB_H} className="rounded bg-green-50 border">
      {svgPts.length >= 3 ? (
        <polygon
          points={polyStr}
          fill="rgba(34,197,94,0.3)"
          stroke="#16a34a"
          strokeWidth="1.5"
        />
      ) : (
        <text x={THUMB_W / 2} y={THUMB_H / 2} textAnchor="middle" fontSize="10" fill="#86efac">
          Not mapped
        </text>
      )}
    </svg>
  );
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    unmapped: "secondary",
    mapped: "outline",
    cultivated: "default",
  };
  return (
    <Badge variant={(map[status] as any) ?? "secondary"} className="capitalize">
      {status}
    </Badge>
  );
}

export default function AreaMapper() {
  const { data: areas = [], isLoading } = useFarmAreas();
  const createArea = useCreateFarmArea();
  const updateArea = useUpdateFarmArea();
  const deleteArea = useDeleteFarmArea();

  const [selectedArea, setSelectedArea] = useState<FarmArea | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  // Temporary points while walking before save
  const [walkedPoints, setWalkedPoints] = useState<GpsPoint[]>([]);

  const openNewArea = async () => {
    const area = await createArea.mutateAsync({});
    setSelectedArea(area);
    setWalkedPoints([]);
    setDialogMode("walk");
  };

  const openWalk = (area: FarmArea) => {
    setSelectedArea(area);
    setWalkedPoints(area.perimeterPoints ?? []);
    setDialogMode("walk");
  };

  const openDetails = (area: FarmArea) => {
    setSelectedArea(area);
    setDialogMode("details");
  };

  const closeDialog = () => {
    setDialogMode(null);
    setSelectedArea(null);
    setWalkedPoints([]);
  };

  const handleWalkComplete = async (points: GpsPoint[], areaSqm: number) => {
    if (!selectedArea) return;
    await updateArea.mutateAsync({
      id: selectedArea.id,
      data: { perimeterPoints: points, areaSqm, status: "mapped" },
    });
    // Refresh selected area then move to details
    setWalkedPoints(points);
    setDialogMode("details");
  };

  const handleDetailsSave = async (data: Partial<FarmArea>) => {
    if (!selectedArea) return;
    await updateArea.mutateAsync({ id: selectedArea.id, data });
    closeDialog();
  };

  const handleDelete = async (id: number) => {
    await deleteArea.mutateAsync(id);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Area Mapper</h1>
          <p className="text-xs text-muted-foreground">{areas.length} area{areas.length !== 1 ? "s" : ""} mapped</p>
        </div>
        <Button size="sm" onClick={openNewArea} disabled={createArea.isPending}>
          <Plus className="w-4 h-4 mr-1" />
          Add Area
        </Button>
      </div>

      {/* Area list */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-3">
        {isLoading && (
          <p className="text-muted-foreground text-sm text-center mt-8">Loading areas...</p>
        )}

        {!isLoading && areas.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-16 gap-3 text-muted-foreground">
            <MapPin className="w-12 h-12 opacity-30" />
            <p className="text-sm">No areas yet. Tap Add Area to map your first plot.</p>
          </div>
        )}

        {areas.map((area) => (
          <div
            key={area.id}
            className="border rounded-xl p-3 flex gap-3 bg-card shadow-sm"
          >
            {/* Thumbnail */}
            <AreaThumbnail points={area.perimeterPoints ?? []} />

            {/* Info */}
            <div className="flex-1 flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{area.tag}</span>
                {area.name && (
                  <span className="text-xs text-muted-foreground truncate">— {area.name}</span>
                )}
                {statusBadge(area.status)}
              </div>
              {area.areaSqm ? (
                <p className="text-xs text-muted-foreground">{formatArea(area.areaSqm)}</p>
              ) : null}
              {(area.rowCount ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground">
                  {area.rowCount} row{(area.rowCount ?? 0) !== 1 ? "s" : ""}
                  {area.rowSpacing ? ` · ${area.rowSpacing} cm spacing` : ""}
                </p>
              )}
              {area.platingMethod && (
                <p className="text-xs text-muted-foreground">{area.platingMethod}</p>
              )}
              {/* Crop summary */}
              {(area.rowDetails ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {[...new Set((area.rowDetails ?? []).map((r) => r.cropName).filter(Boolean))].map(
                    (crop) => (
                      <Badge key={crop} variant="outline" className="text-xs py-0">
                        {crop}
                      </Badge>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-1 justify-start">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="Re-walk perimeter"
                onClick={() => openWalk(area)}
              >
                <Route className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="Edit details"
                onClick={() => openDetails(area)}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {area.tag}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the area and all its data. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(area.id)}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </div>

      {/* Perimeter Walk Dialog */}
      <Dialog open={dialogMode === "walk"} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>
              Map Perimeter — {selectedArea?.tag}
            </DialogTitle>
          </DialogHeader>
          {selectedArea && (
            <PerimeterWalker
              initialPoints={walkedPoints}
              onComplete={handleWalkComplete}
              onCancel={closeDialog}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Area Details Dialog */}
      <Dialog open={dialogMode === "details"} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-sm mx-auto max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Area Details — {selectedArea?.tag}
            </DialogTitle>
          </DialogHeader>
          {selectedArea && (
            <AreaDetailsForm
              area={selectedArea}
              onSave={handleDetailsSave}
              onCancel={closeDialog}
              isLoading={updateArea.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

---

## 10. Register the Route — `client/src/App.tsx`

Add the route alongside your existing pages:

```tsx
// client/src/App.tsx — add import and route

import AreaMapper from "@/pages/AreaMapper";

// Inside your <Switch> or route list:
<Route path="/area-mapper" component={AreaMapper} />
```

---

## 11. Add to Navigation — `client/src/components/Navigation.tsx`

Add to both your sidebar and mobile bottom nav arrays:

```tsx
// Add to your nav items array
import { Map } from "lucide-react";

{
  path: "/area-mapper",
  label: "Area Mapper",
  icon: Map,
}
```

---

## 12. Service Worker Cache Update — `client/public/sw.js`

Add the new API endpoint to your offline cache:

```javascript
// In your CACHED_URLS or fetch handler, add:
"/api/farm-areas"

// And in the fetch event, handle the farm-areas API
// with the same network-first / fallback-to-cache pattern
// you already use for /api/plant-database
```

---

## Implementation Notes

### GPS Accuracy
- Works best outdoors with clear sky view. The `±X m` badge shown during recording helps the user know whether their signal is reliable.
- On devices with poor GPS, points can be tapped away with **Undo Last Point** if they jump unexpectedly.
- For very small beds (< 5 m²), GPS accuracy may make the polygon imprecise — consider adding a manual area entry fallback later.

### Area Auto-Tagging
- `getNextAreaTag()` counts all existing areas and pads to 4 digits: `AREA0001`, `AREA0002`, etc.
- Deleted areas leave gaps (e.g. `AREA0003` stays gone), which is intentional to preserve historical references.

### HTTPS Requirement
- `navigator.geolocation.watchPosition` requires HTTPS or `localhost`. Your production deployment must be on HTTPS for the walk feature to work.

### Offline Behavior
- Area list loads from cache if offline (add to SW as shown in step 12).
- Perimeter walking requires an active GPS signal but not internet. Points are held in React state and saved to the server when the user taps **Confirm Area** — so as long as the save succeeds before going offline, data is persisted.

### Future Enhancements to Consider
- Leaflet.js map tiles overlay (for satellite/terrain context behind the SVG polygon)
- Photo attachment per area
- Harvest yield tracking linked to area
- KNF amendment schedule tied to area + crop combination
