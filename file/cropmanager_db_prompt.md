# CropManager PWA — Implement Crop Database & Fertilizer Database Screens

## Context

This is a React + TypeScript PWA located at `artifacts/cropmanager-pwa/`. It uses Vite, Dexie (IndexedDB), The project stores data offline-first. State management uses a custom `useAppStore` hook. Navigation uses a bottom nav bar with 4 tabs: Dashboard, Crops, Props, More. The **More** tab leads to a `MoreScreen` that hosts sub-screens as slide-in panels.

Two JSON files live at the project root (or in `public/`) and act as the **static reference databases**:
- `crop_database.json` — crop growth definitions
- `fertilizer_schedule.json` — 5-tea organic fertilizer mixing guide per crop per stage

Both of these files are already complete and correct. **Do NOT modify or rewrite them.** They must be loaded as-is and displayed/edited through the UI.

---

## File Locations to Create / Modify

```
artifacts/cropmanager-pwa/
  src/
    components/
      CropDatabaseScreen.tsx      ← CREATE THIS
      FertilizerDatabaseScreen.tsx ← CREATE THIS
    lib/
      cropDb.ts                   ← CREATE THIS  (typed loader for crop_database.json)
      fertDb.ts                   ← CREATE THIS  (typed loader for fertilizer_schedule.json)
      types.ts                    ← MODIFY — add CropDbEntry, FertDbEntry interfaces
  public/
    crop_database.json            ← ALREADY EXISTS — do not modify
    fertilizer_schedule.json      ← ALREADY EXISTS — do not modify
```

The screens are rendered inside `MoreScreen.tsx`. Find the existing placeholder for `CropDatabaseScreen` and `FertilizerDatabaseScreen` and replace the placeholder content with the real components.

---

## Step 1 — TypeScript Types (`src/lib/types.ts`)

Add the following interfaces. Do not remove anything already in this file.

```typescript
// ─── crop_database.json ───────────────────────────────────────────────────────

export interface CropDbEntry {
  display_name: string;
  varieties: string[];
  plant_type: string;
  number_of_weeks_harvest: number;
  growing_time_days: number;
  transplant_days: number | null;
  growing_from_transplant: number | null;
  harvest_interval: number;
  batch_offset_days: number;
  germination_days_min: number;
  germination_days_max: number;
  fungus_spray_days: number[];
  pest_spray_days: number[];
  planting_method: string;
  diseases: string[];
  pests: string[];
}

export interface CropDbAlias {
  alias: string;
}

export type CropDbRecord = CropDbEntry | CropDbAlias;

export interface CropDatabase {
  [key: string]: CropDbRecord;
}

// ─── fertilizer_schedule.json ─────────────────────────────────────────────────

export interface FertMix {
  mix_parts: {
    cow_manure_tea: number;
    chicken_manure_tea: number;
    plant_based_tea: number;
    wood_ash_tea: number;
  };
  final_dilution: number;
  yeast_tsp_per_litre?: number;
  yeast_tbsp_per_5L?: number;
  mixing_example: string;
  note: string;
}

export interface FertStage {
  description: string;
  foliar: FertMix;
  drench: FertMix;
}

export interface FertCropEntry {
  display_name: string;
  plant_type: string;
  fert_profile: string;
  stages: {
    seedling: FertStage;
    mid_vegetative: FertStage;
    flowering: FertStage;
    fruiting: FertStage;
  };
}

export interface FertMeta {
  version: string;
  description: string;
  teas: Record<string, string>;
  yeast_preparation: string;
  yeast_dosing: { foliar_spray: string; soil_drench: string };
  thyme_oil_mosquito_control: string;
  application_tips: string[];
  dilution_note: string;
}

export interface FertDatabase {
  _meta: FertMeta;
  crops: Record<string, FertCropEntry>;
}
```

---

## Step 2 — Data Loaders (`src/lib/cropDb.ts` and `src/lib/fertDb.ts`)

### `src/lib/cropDb.ts`

```typescript
import type { CropDatabase, CropDbEntry } from './types';

let _cache: CropDatabase | null = null;

export async function loadCropDatabase(): Promise<CropDatabase> {
  if (_cache) return _cache;
  const res = await fetch('/crop_database.json');
  if (!res.ok) throw new Error('Failed to load crop_database.json');
  _cache = await res.json();
  return _cache!;
}

/** Returns only non-alias entries, sorted alphabetically by display_name */
export function getNonAliasCrops(db: CropDatabase): Array<{ key: string; entry: CropDbEntry }> {
  return Object.entries(db)
    .filter(([, v]) => !('alias' in v))
    .map(([key, entry]) => ({ key, entry: entry as CropDbEntry }))
    .sort((a, b) => a.entry.display_name.localeCompare(b.entry.display_name));
}

/** Returns alias entries */
export function getAliases(db: CropDatabase): Array<{ key: string; target: string }> {
  return Object.entries(db)
    .filter(([, v]) => 'alias' in v)
    .map(([key, v]) => ({ key, target: (v as { alias: string }).alias }));
}

export function isAlias(record: unknown): record is { alias: string } {
  return typeof record === 'object' && record !== null && 'alias' in record;
}
```

### `src/lib/fertDb.ts`

```typescript
import type { FertDatabase, FertCropEntry } from './types';

let _cache: FertDatabase | null = null;

export async function loadFertDatabase(): Promise<FertDatabase> {
  if (_cache) return _cache;
  const res = await fetch('/fertilizer_schedule.json');
  if (!res.ok) throw new Error('Failed to load fertilizer_schedule.json');
  _cache = await res.json();
  return _cache!;
}

/** Returns all crop entries sorted by display_name */
export function getFertCrops(db: FertDatabase): Array<{ key: string; entry: FertCropEntry }> {
  return Object.entries(db.crops)
    .sort(([, a], [, b]) => a.display_name.localeCompare(b.display_name));
}
```

---

## Step 3 — Crop Database Screen (`src/components/CropDatabaseScreen.tsx`)

### Exact behaviour to implement:

**Layout — two-column on tablet, stacked on mobile:**
- Left sidebar (fixed width ~140px on desktop, full width list on mobile) shows all non-alias crops as a scrollable list. Each list item shows `display_name` and `plant_type`. Tapping selects it and highlights it green.
- A search input at the top of the sidebar filters the list in real-time (case-insensitive match on `display_name` or key).
- A small "Aliases" toggle button shows/hides alias entries in the list. Aliases are shown with an arrow icon and the target name; tapping an alias selects the target crop.
- Right panel (or full screen on mobile after selecting) shows the detail editor for the selected crop.
- An **"+ Add Crop"** button in the panel header opens a blank new-crop form.

**Detail editor — sections:**

1. **Basic Info**
   - `display_name` — text input
   - `plant_type` — dropdown with these options exactly:
     `Leafy Greens`, `Brassica`, `Fruiting Vegetable`, `Vine / Fruiting Vegetable`, `Vine Crop`, `Root Crop`, `Grain`, `Legume`, `Herb`, `Bulb`, `Rhizome`, `Tuber`
   - `planting_method` — text input
   - `varieties` — tag input (comma-separated or Enter to add, × to remove each tag)

2. **Timing**
   - `growing_time_days` — number input
   - `number_of_weeks_harvest` — number input
   - `germination_days_min` — number input
   - `germination_days_max` — number input
   - `transplant_days` — number input, nullable (empty = null)
   - `growing_from_transplant` — number input, nullable (empty = null)
   - `harvest_interval` — number input (days between harvest picks)
   - `batch_offset_days` — number input (days between batch plantings)
   - **Continuous Harvest toggle** — derived from `number_of_weeks_harvest > 1`; toggling it sets `number_of_weeks_harvest` to 1 (off) or 4 (on as default)

3. **Spray Schedule**
   - `fungus_spray_days` — list of day-numbers as removable chips; "Add day" number input + button
   - `pest_spray_days` — same pattern

4. **Diseases** — tag chip list, Enter or comma to add, × to remove

5. **Pests** — same as diseases

**Saving:** "Save Changes" button calls `updateCropDbEntry(key, updatedEntry)` (defined below). Show a toast confirmation. The in-memory database is updated immediately (no full page reload).

**Deleting:** A "Delete" button (red) removes the crop from the in-memory DB and clears the selection. Show a confirmation dialog first.

**Adding a new crop:** Minimal form — key (slug, lowercase, spaces allowed), display_name, plant_type. Pre-fills all numeric fields with sensible defaults (growing_time_days: 60, germination_days_min: 5, germination_days_max: 10, harvest_interval: 7, batch_offset_days: 14, number_of_weeks_harvest: 1, all spray arrays empty). After saving, the new crop is selected in the sidebar.

**Alias entries:** When selected, show a read-only info card: "This is an alias for [target]." with a button "Go to [target]" that selects the real entry. A "Delete alias" button removes it.

**Export:** A "⬇ Export JSON" button in the panel header triggers a download of the current in-memory database as `crop_database.json`.

### State management inside the component:

```typescript
const [db, setDb] = useState<CropDatabase | null>(null);
const [selectedKey, setSelectedKey] = useState<string | null>(null);
const [searchQuery, setSearchQuery] = useState('');
const [showAliases, setShowAliases] = useState(false);
const [isDirty, setIsDirty] = useState(false); // true when unsaved changes

function updateCropDbEntry(key: string, updated: CropDbEntry) {
  setDb(prev => prev ? { ...prev, [key]: updated } : prev);
  setIsDirty(false);
}

function deleteCropEntry(key: string) {
  setDb(prev => {
    if (!prev) return prev;
    const next = { ...prev };
    delete next[key];
    return next;
  });
  setSelectedKey(null);
}

function exportJson() {
  const json = JSON.stringify(db, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'crop_database.json';
  a.click();
  URL.revokeObjectURL(url);
}
```

Load the database with `useEffect` calling `loadCropDatabase()` on mount. Show a spinner while loading.

---

## Step 4 — Fertilizer Database Screen (`src/components/FertilizerDatabaseScreen.tsx`)

### Exact behaviour to implement:

**Top-level layout:**
- A scrollable list of all crops from `fertilizer_schedule.json` (50 entries). Each card shows `display_name`, `plant_type`, and `fert_profile`.
- A search input at the top filters by display_name.
- Tapping a crop slides to the crop's **Fertilizer Detail view**.

**Fertilizer Detail view** (replaces the list, back button returns to list):

- Header: crop name + fert_profile badge + Save button

- **Stage tabs** — four tabs: `🌱 Seedling`, `🌿 Mid-Veg`, `🌸 Flowering`, `🍅 Fruiting`
  (keys: `seedling`, `mid_vegetative`, `flowering`, `fruiting`)

- Active stage shows:
  - Stage description (editable text input)
  
  - **Foliar Spray** section:
    - 4 mix part inputs (one per tea): `cow_manure_tea`, `chicken_manure_tea`, `plant_based_tea`, `wood_ash_tea` — each is a number input (0–5 range, step 0.5)
    - Visual mix bar: 4 colour-coded bars proportional to their values (only show teas with value > 0)
    - `final_dilution` — number input labelled "Final dilution (1:X water)"
    - `yeast_tsp_per_litre` — number input
    - `mixing_example` — read-only italic text (auto-calculated — see below)
    - `note` — textarea

  - **Soil Drench** section — identical structure:
    - 4 mix part inputs
    - Visual mix bars
    - `final_dilution`
    - `yeast_tbsp_per_5L`
    - `mixing_example` — read-only (auto-calculated)
    - `note`

**Auto-calculate `mixing_example`:**

For **foliar (1L spray bottle)**:
```
totalParts = sum of all mix_parts values that are > 0
mlPerTea = (1000 / final_dilution) / totalParts  (rounded to nearest 0.5)
waterMl = 1000 - (mlPerTea * totalParts * totalParts)  — correct: 1000 - (1000/final_dilution) = water
```

Exact formula used in the original GAS script:
- `mlEach = Math.round((1000 / final_dilution / totalParts) * 2) / 2`  
- Water = `1000 - (mlEach * totalParts * numberOfActiveTeas)` rounded
- Output string: `"Per 1L spray bottle: {mlEach} ml [tea1], {mlEach} ml [tea2], top up to 1L with water (~{water}ml water)"`

For **drench (5L watering can)**:
- `mlEach = Math.round((5000 / final_dilution / totalParts) * 2) / 2`
- Water = `5000 - (mlEach * numberOfActiveTeas)` rounded
- Output string: `"Per 5L watering can: {mlEach} ml [tea1], {mlEach} ml [tea2], top up to 5L with water (~{water}ml water)"`

Recalculate on every change to mix_parts or final_dilution.

**Saving:** "Save" button updates the in-memory fert database for that crop+stage. Show a toast. An **"⬇ Export JSON"** button in the detail header downloads `fertilizer_schedule.json`.

**Meta panel:** A collapsible "ℹ️ About the 5 Teas" section visible from the list view (not the detail) that shows `_meta.teas`, `_meta.application_tips`, `_meta.yeast_preparation` as read-only formatted text.

### State management inside the component:

```typescript
const [db, setDb] = useState<FertDatabase | null>(null);
const [selectedKey, setSelectedKey] = useState<string | null>(null);
const [activeStage, setActiveStage] = useState<keyof FertCropEntry['stages']>('seedling');
const [searchQuery, setSearchQuery] = useState('');

function updateFertStage(cropKey: string, stage: string, updated: FertStage) {
  setDb(prev => {
    if (!prev) return prev;
    return {
      ...prev,
      crops: {
        ...prev.crops,
        [cropKey]: {
          ...prev.crops[cropKey],
          stages: {
            ...prev.crops[cropKey].stages,
            [stage]: updated,
          },
        },
      },
    };
  });
}

function exportJson() {
  const json = JSON.stringify(db, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fertilizer_schedule.json';
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## Step 5 — Wire into MoreScreen

In `src/components/MoreScreen.tsx` (or wherever the More panel sub-screens are rendered):

1. Import `CropDatabaseScreen` and `FertilizerDatabaseScreen`.
2. Find the existing "Crop Database" button and wire its `onClick` to open `CropDatabaseScreen` as a slide-in panel (using the same slide-in pattern used for Calendar and other sub-screens in this project).
3. Find the existing "Fertilizer Database" button and wire its `onClick` to open `FertilizerDatabaseScreen` similarly.
4. Each screen must have a back button (`‹`) in its header that closes it and returns to the More menu.

The slide-in pattern in this project is: a `div` with `position: absolute; inset: 0; transform: translateX(100%)` that transitions to `translateX(0)` when `isOpen` is true. Use this exact pattern — do not introduce a router or modal.

---

## Step 6 — Styling

Match the existing app aesthetic exactly:
- Green primary: `#2d6a2d` (header, active states, save buttons)
- Font: DM Sans (already loaded)
- Border radius: 12px for cards, 8px for inputs
- All inputs: `background: #f5f5f0; border: 1px solid #e0e0e0; border-radius: 8px; padding: 9px 11px`
- Focused inputs: `border-color: #2d6a2d`
- Tag chips for varieties/diseases/pests: `background: #e8f5e8; color: #2d6a2d; border-radius: 6px; padding: 3px 8px; font-size: 12px`
- Spray day chips: `background: #ede9fe; color: #7c3aed`
- Section cards: `background: white; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden`
- Section card header: `padding: 12px 14px; border-bottom: 1px solid #e0e0e0; font-size: 13px; font-weight: 600`
- Section card body: `padding: 14px; display: flex; flex-direction: column; gap: 10px`
- Stage tabs: active = `background: #e8f5e8; border-color: #2d6a2d; color: #2d6a2d`
- Mix bars: proportional width, green fill for active teas, grey for zero-value teas

**Tea colour coding for mix bars:**
- `cow_manure_tea` → `#92400e` (brown)
- `chicken_manure_tea` → `#d97706` (amber)
- `plant_based_tea` → `#15803d` (green)
- `wood_ash_tea` → `#6b7280` (grey)

---

## Step 7 — Data Integrity Rules

1. **Never save an empty `display_name`** — validate before saving, show inline error.
2. **Spray days must be positive integers** — validate on add.
3. **`growing_time_days` must be > 0** — validate.
4. **`transplant_days` and `growing_from_transplant`** — if one is set, the other should also be set; warn if only one is filled but do not block save.
5. **Mix parts** — all values must be ≥ 0. If all four teas are 0, warn "No teas selected — this stage has no fertilizer."
6. **`final_dilution`** — must be > 0.

---

## Step 8 — Exact Crop List (for verification)

The crop_database.json has exactly **34 real crop entries** (non-alias) and **16 aliases**. The non-alias entries, sorted alphabetically by display_name, are:

```
Basil, Beetroot, Broccoli, Cabbage, Callaloo, Carrot, Cassava (Yuca),
Cauliflower, Corn (Maize), Cucumber, Eggplant (Aubergine), Garlic, Ginger,
Gungo Peas (Pigeon Peas), Hot Pepper (Scotch Bonnet / Chili), Kale,
Lemongrass (Fever Grass), Lettuce, Mustard Greens, Okra, Onion, Pak Choi (Bok Choy),
Pumpkin, Radish, Red Peas (Kidney Beans), Scallion, Spinach, Squash (Butternut / Zucchini),
String Beans (Green Beans), Sweet Pepper (Bell Pepper), Sweet Potato, Thyme,
Tomato, Watermelon
```

The aliases and their targets:
```
bok choy → pak choi
tomatoes → tomato
bell pepper → sweet pepper
pepper → sweet pepper
scotch bonnet → hot pepper
chili → hot pepper
aubergine → eggplant
cucumbers → cucumber
zucchini → squash
butternut → squash
beet → beetroot
maize → corn
kidney beans → red peas
pigeon peas → gungo peas
green beans → string beans
fever grass → lemongrass
```

The sidebar list must show all 34 non-alias crops by default. When "Aliases" toggle is on, show 16 additional alias entries below or interleaved alphabetically.

The fertilizer_schedule.json has exactly **50 crop entries** (it includes alias-named entries like "bok choy", "tomatoes", etc. with full data — these are not flagged as aliases in the fert DB, they have full stage data). Show all 50.

---

## Step 9 — Do Not Break

- Do not change or delete `crop_database.json` or `fertilizer_schedule.json`.
- Do not remove or alter any existing sync logic in `sync.ts` or `sheets.ts`.
- Do not add a router. Use the existing slide-in panel pattern.
- Do not change the existing Dexie schema or `useAppStore`.
- The JSON files are read via `fetch('/crop_database.json')` — make sure they are in `public/` so Vite serves them at the root.
- If they are currently at the project root and not in `public/`, **copy them to `public/`** — do not move or delete the originals.

---

## Summary of Files to Create/Modify

| File | Action |
|------|--------|
| `src/lib/types.ts` | Add `CropDbEntry`, `CropDbAlias`, `CropDatabase`, `FertMix`, `FertStage`, `FertCropEntry`, `FertMeta`, `FertDatabase` |
| `src/lib/cropDb.ts` | Create — fetch + cache loader, helper functions |
| `src/lib/fertDb.ts` | Create — fetch + cache loader, helper functions |
| `src/components/CropDatabaseScreen.tsx` | Create — full two-panel editor |
| `src/components/FertilizerDatabaseScreen.tsx` | Create — list + stage editor |
| `src/components/MoreScreen.tsx` | Modify — wire both screens in as slide-in panels |
| `public/crop_database.json` | Copy from root if not already there |
| `public/fertilizer_schedule.json` | Copy from root if not already there |
