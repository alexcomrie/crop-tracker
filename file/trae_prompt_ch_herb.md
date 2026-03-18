## Overview

You are adding two fully functional screens to the existing CropManager React PWA. Both screens already exist and work in a standalone HTML prototype. Your job is to port them exactly into the PWA — same logic, same layout, same CSS, same data structures, same behaviour. Do not redesign, simplify, or change anything. Match the prototype exactly.

The prototype file is `cropmanager_ch.html`. Every component, style, and function described below is taken directly from that file.

---

## Design System (do not deviate)

All colours and styles must use these exact values:

```
--green: #2d6a2d
--green-light: #3d8b3d
--green-pale: #e8f5e8
--green-mid: #c2e0c2
--amber: #d97706
--amber-pale: #fef3c7
--red: #dc2626
--red-pale: #fee2e2
--blue: #1d4ed8
--blue-pale: #dbeafe
--purple: #7c3aed
--purple-pale: #ede9fe
--text: #1a1a1a
--text-2: #555
--text-3: #888
--border: #e0e0e0
--border-2: #d0d0d0
--bg: #f5f5f0
--surface: #ffffff
--surface-2: #f9f9f6
--radius: 12px
teal icon background: #e0fdf4
```

Fonts: `DM Sans` (weights 300, 400, 500, 600) and `DM Mono` (weights 400, 500).

Panel pattern: `position: absolute; inset: 0; background: var(--bg); display: flex; flex-direction: column; z-index: 50; transform: translateX(100%); transition: transform 0.28s cubic-bezier(0.4,0,0.2,1);` — add class `open` to set `transform: translateX(0)`.

---

## Part 1 — More Screen: Add Two New Menu Buttons

In `MoreScreen.tsx` (or wherever the More page menu buttons are defined), add these two buttons in the **exact positions** shown:

### Position in the More menu:

Current menu order:
1. Databases section: Crop Database, Fertilizer Database
2. Herbicide Schedule ← **this already has a placeholder — replace it with the real button below**
3. Reminders
4. **NEW "Planning" section** with C-H Calculator button
5. Schedule section: Calendar

### 1a. Herbicide Schedule button (replace existing placeholder)

```
Icon: 🌿 on red background (#fee2e2)
Title: "Herbicide Schedule"
Subtitle: "Manage herbicide application timing"
onClick: opens panel-herb (slide-in panel)
```

### 1b. C-H Calculator button (new — under "Planning" section label)

```
Icon: ♻️ on teal background (#e0fdf4)
Title: "C-H Calculator"
Subtitle: "Plan plots for continuous weekly harvests"
onClick: opens panel-ch-calc (slide-in panel)
```

The "Planning" section label uses the same style as all other section labels in the More menu.

---

## Part 2 — Herbicide Schedule Screen

### File to create: `HerbicideScreen.tsx`

This screen is a slide-in panel opened from the More menu. It has **three internal views** that swap in and out — list view, form view, and detail view. Only one is visible at a time.

### Data model

Each herbicide log entry has this exact TypeScript shape:

```typescript
interface HerbEntry {
  id: string;
  product: string;
  ingredient: string;
  mode: string;
  rate: number | null;
  volume: number | null;
  area: string;
  target: string;
  dateApplied: string;       // ISO date YYYY-MM-DD
  timeApplied: string;       // HH:MM or empty string
  weather: string;
  reentry: number | null;
  daysExpected: number;
  reminderDays: number;
  notes: string;
  outcome: string | null;    // 'effective' | 'partial' | 'retreated' | 'no-effect' | null
  outcomeDate: string | null;
  outcomeNotes: string;
}
```

### Initial seed data (two example entries, always present on first load)

```typescript
const HERB_SEED: HerbEntry[] = [
  {
    id: 'h1',
    product: 'Gramoxone (Paraquat)',
    ingredient: 'Paraquat dichloride',
    mode: 'Contact (burns on contact)',
    rate: 15, volume: 10,
    area: 'Back field walkways',
    target: 'Nut grass, general broadleaf',
    dateApplied: '2026-03-05', timeApplied: '07:30',
    weather: 'Sunny, dry',
    reentry: 24, daysExpected: 3, reminderDays: 7,
    notes: 'Applied along fence line and between beds. Strong knockdown.',
    outcome: 'effective', outcomeDate: '2026-03-10',
    outcomeNotes: 'Nut grass browned off within 3 days. 90% kill rate.'
  },
  {
    id: 'h2',
    product: 'Roundup (Glyphosate 360)',
    ingredient: 'Glyphosate',
    mode: 'Systemic (absorbed, translocated)',
    rate: 20, volume: 5,
    area: 'Pepper bed perimeter',
    target: 'Nut grass, Guinea grass',
    dateApplied: '2026-03-01', timeApplied: '08:00',
    weather: 'Partly cloudy',
    reentry: 48, daysExpected: 14, reminderDays: 14,
    notes: 'Careful around pepper roots. Targeted spray only.',
    outcome: null, outcomeDate: null, outcomeNotes: ''
  }
];
```

### State

```typescript
const [herbLog, setHerbLog] = useState<HerbEntry[]>(HERB_SEED);
const [filterMode, setFilterMode] = useState<'all'|'active'|'done'>('all');
const [view, setView] = useState<'list'|'form'|'detail'>('list');
const [editingId, setEditingId] = useState<string|null>(null);
const [viewingId, setViewingId] = useState<string|null>(null);
let herbIdCounter = useRef(10);
```

### Status calculation function

```typescript
function herbStatus(h: HerbEntry): 'active' | 'check' | 'done' | 'unknown' {
  if (!h.dateApplied) return 'unknown';
  if (h.outcome) return 'done';
  const applied = new Date(h.dateApplied);
  const today = new Date();
  const daysSince = Math.floor((today.getTime() - applied.getTime()) / 86400000);
  if (daysSince >= h.daysExpected) return 'check';
  return 'active';
}
```

### Panel header

- Back button (‹) `onclick: closePanel` — returns to More menu
- Title: "🌿 Herbicide Schedule"
- Right side: "+ Log" primary button `onclick: openHerbForm()`

### View 1 — List view (default)

**Filter tab bar** (3 tabs, horizontal, below header):
- "All" (default active), "Active", "Completed"
- Tab style: `background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 8px 4px; font-size: 11px; font-weight: 600; color: var(--text-3)`
- Active tab: `background: var(--green-pale); border-color: var(--green); color: var(--green)`
- Clicking a tab updates `filterMode` and re-renders the list

**List rendering:**

Filter logic:
- `all`: show everything
- `active`: show entries where `herbStatus(h) !== 'done'`
- `done`: show entries where `herbStatus(h) === 'done'`
- Sort: newest `dateApplied` first (descending)

Empty state (when no items):
```
🌿  icon (font-size 36px)
"No applications logged. Tap + Log to record one."
```

Each entry renders as a **herb-card**:

```
Card styles:
  background: var(--surface)
  border: 1px solid var(--border)
  border-radius: 12px
  padding: 14px 16px
  cursor: pointer
  :active { transform: scale(0.985) }
  onclick: openHerbDetail(h.id)
```

**Card header row** (flex, space-between, gap 10px):
- Left: title "🌿 {h.product}" (14px, font-weight 600) + subtitle "{h.area} · {fmtDate(h.dateApplied)}" (12px, var(--text-3))
- Right: status chip

**Status chip values:**
- `status === 'active'`: amber background (#fef3c7), amber text (#d97706), text = "⏳ Working — day {daysSince}/{h.daysExpected}"
- `status === 'check'`: purple background (#ede9fe), purple text (#7c3aed), text = "🔍 Check outcome"
- `status === 'done'`: green background (#e8f5e8), green text (#2d6a2d), text = "✅ {outcome === 'effective' ? 'Effective' : outcome === 'partial' ? 'Partial' : 'Retreated'}"

**Card body** (margin-top 10px):

Row of info chips (flex, gap 8px, flex-wrap):
```
chip style: font-size 11px, font-weight 500, padding 2px 8px, border-radius 6px,
            background: var(--bg), color: var(--text-2)
```
- Chip 1: `{h.ingredient}`
- Chip 2: `Target: {h.target}`

**Progress bar** (only shown when `status !== 'done'`):
```
Container: margin-top 6px
Label row: flex space-between, font-size 11px, var(--text-3)
  left: "Effectiveness progress"
  right: "{pct}% · Day {daysSince} of {h.daysExpected}"
Bar container: height 6px, background var(--border), border-radius 4px, overflow hidden
Bar fill: height 100%, border-radius 4px, background var(--green) (or var(--amber) if pct >= 100)
  width: {pct}% where pct = min(100, round(daysSince / h.daysExpected * 100))
```

When `status === 'done'`: show `{h.outcomeNotes || 'Completed'}` in font-size 12px, var(--text-3).

### View 2 — Form view (add/edit)

Shown when `view === 'form'`. Replaces the list view entirely.

**Sub-header** (height 48px, white background, border-bottom):
- Back button (‹, 28×28px) — goes back to list (or detail if editing from detail)
- Title: "Log Herbicide Application" (new) or "Edit Application" (editing)

**Scrollable form body** (padding 16px, gap 14px):

**Section 1 — "🌿 Herbicide Details"**

Fields:
- Product Name (text input) — placeholder "e.g. Roundup, Gramoxone, Karmex" — id: `herb-product`
- Two-column row:
  - Active Ingredient (text) — placeholder "e.g. Glyphosate" — id: `herb-ingredient`
  - Mode of Action (select) — id: `herb-mode`
    - Options: `""` (Select…), "Contact (burns on contact)", "Systemic (absorbed, translocated)", "Pre-emergent (prevents germination)", "Post-emergent (kills existing weeds)", "Selective (targets specific weeds)", "Non-selective (kills all vegetation)"
- Two-column row:
  - Mix Rate (ml/L) (number) — placeholder "e.g. 10" — id: `herb-rate`
  - Total Volume Applied (L) (number) — placeholder "e.g. 5" — id: `herb-volume`

**Section 2 — "📍 Application Info"**

Fields:
- Target Area / Crop Block (text) — placeholder "e.g. Back field, Pepper bed, Entire garden" — id: `herb-area`
- Target Weeds (text) — placeholder "e.g. Nut grass, Broadleaf, General weeds" — id: `herb-target`
- Two-column row:
  - Date Applied (date input) — default: today — id: `herb-date-applied`
  - Time Applied (time input) — id: `herb-time-applied`
- Two-column row:
  - Weather at Time (select) — id: `herb-weather`
    - Options: `""` (Select…), "Sunny, dry", "Partly cloudy", "Overcast, dry", "Light rain after", "Windy"
  - Re-entry Interval (hrs) (number) — placeholder "e.g. 24" — id: `herb-reentry`

**Section 3 — "⏱ Effectiveness Tracking"**

Fields:
- Two-column row:
  - Expected Days to Work (number) — placeholder "e.g. 7" — id: `herb-days-expected`
  - Check-back Reminder (days) (number) — placeholder "e.g. 10" — id: `herb-reminder-days`
- Notes (textarea, min-height 70px) — placeholder "Any observations, dilution notes, areas to re-treat…" — id: `herb-notes`

**Bottom buttons** (flex row, gap 10px, padding-bottom 24px):
- "💾 Save Application" (btn-primary, flex:1) — calls `saveHerbEntry()`
- "Cancel" (btn-secondary) — calls `closeHerbForm()`

**Section card styles** (used throughout all forms in the app):
```
.detail-section: background white, border 1px solid var(--border), border-radius 12px, overflow hidden
.detail-section-header: padding 12px 14px, border-bottom 1px solid var(--border), font-size 13px, font-weight 600
.detail-section-body: padding 14px, flex column, gap 10px
.field label: font-size 11px, font-weight 600, color var(--text-3), uppercase, letter-spacing 0.5px
.field input/select/textarea: background white, border 1px solid var(--border), border-radius 8px,
  padding 9px 11px, font-size 13px, outline none; focus: border-color var(--green)
.field-row: display grid, grid-template-columns 1fr 1fr, gap 10px
```

### Save logic — `saveHerbEntry()`

Validates: product must not be empty, dateApplied must not be empty (show toast on fail).

New entry:
```typescript
const data: HerbEntry = {
  product,
  ingredient, mode,
  rate: parseFloat(rate) || null,
  volume: parseFloat(volume) || null,
  area, target, dateApplied, timeApplied, weather,
  reentry: parseInt(reentry) || null,
  daysExpected: parseInt(daysExpected) || 7,
  reminderDays: parseInt(reminderDays) || 10,
  notes,
  outcome: null, outcomeDate: null, outcomeNotes: '',
  id: 'h' + (++herbIdCounter.current)
};
setHerbLog(prev => [...prev, data]);
showToast('✅', 'Application logged — ' + product);
```

Edit: replace existing entry at same id, show toast "Application updated".

After save: call `closeHerbForm()`, re-render list.

### Close form logic — `closeHerbForm()`

```typescript
if (editingId && viewingId) {
  setEditingId(null);
  setView('detail'); // return to detail view
} else {
  setEditingId(null);
  setView('list');
}
```

### View 3 — Detail view

Shown when `view === 'detail'`. Displays full record for `viewingId`.

**Sub-header** (height 48px):
- Back (‹) `onclick: closeHerbDetail()` — returns to list
- Title: `{h.product}` (14px, font-weight 600)
- Right side: "Edit" (btn-secondary, 12px) `onclick: editHerbEntry()`

**Scrollable body** (padding 16px, gap 14px):

**Section "🌿 Product":**
- Large product name (font-size 16px, font-weight 600)
- Subtitle: `{h.ingredient} · {h.mode}` (13px, var(--text-3))
- 2-column stat grid (gap 8px, margin-top 12px):
  - Left card (bg var(--bg), border-radius 8px, padding 10px, text-center):
    - Big number: `{h.rate || '—'}` (20px, font-weight 600, var(--green))
    - Label: "ml/L mix rate" (11px, var(--text-3))
  - Right card: same style with `{h.volume || '—'}` and "litres applied"

**Section "📍 Application":**
- `Area: {h.area}` (13px, var(--text-2))
- `Target weeds: {h.target}`
- `Applied: {fmtDate(h.dateApplied)}{h.timeApplied ? ' at ' + h.timeApplied : ''}` 
- `Weather: {h.weather || 'Not recorded'}`
- `Re-entry interval: {h.reentry || '—'} hours`
- If h.notes: notes block in var(--bg) background, border-radius 8px, padding 10px

**Section "⏱ Effectiveness":**
- Progress label row (flex space-between, 12px, var(--text-3)): `"Day {daysSince} of {h.daysExpected} expected"` and `"{pct}%"`
- Progress bar (height 8px): same calculation as list card. Bar is amber (`var(--amber)`) if `pct >= 100 && !h.outcome`, otherwise green.

**Outcome sub-section:**
- Label: "Outcome" (12px, font-weight 600, var(--text-3), uppercase, margin-bottom 8px)
- Outcome buttons row (flex, gap 8px, flex-wrap):
  - 4 buttons: "✅ Effective", "⚡ Partially effective", "🔁 Needed re-treatment", "❌ No effect"
  - Button style: `background var(--bg), border 1px solid var(--border), border-radius 8px, padding 7px 12px, font-size 12px, font-weight 500`
  - Selected style: `background var(--green-pale), border-color var(--green), color var(--green), font-weight 600`
  - `onclick: setHerbOutcome(h.id, outcomeKey, this)` — sets `h.outcome` and marks button selected, shows outcome notes wrap
- Outcome notes wrap (hidden until outcome selected):
  - Label "Outcome Notes" + textarea (min-height 60px, pre-filled with `h.outcomeNotes`)
  - "Save Outcome" primary button (full width, margin-top 8px) `onclick: saveHerbOutcome(h.id)`

**Bottom buttons** (flex row, gap 10px, padding-bottom 24px):
- "✏️ Edit" (btn-secondary, flex:1) `onclick: editHerbEntry()`
- "🗑 Delete" (btn-danger) `onclick: deleteHerbEntry(h.id)` — shows `confirm('Delete this herbicide record?')` first

### `saveHerbOutcome(id)`
```typescript
const h = herbLog.find(x => x.id === id);
if (!h) return;
h.outcomeDate = todayISO();
h.outcomeNotes = outcomeNotesInput.value.trim();
setHerbLog([...herbLog]); // trigger re-render
renderHerbDetailBody(h);
renderHerbList();
showToast('✅', 'Outcome saved');
```

### `deleteHerbEntry(id)`
```typescript
setHerbLog(prev => prev.filter(h => h.id !== id));
closeHerbDetail();
renderHerbList();
showToast('🗑', 'Record deleted');
```

### `closeHerbDetail()`
```typescript
setViewingId(null);
setView('list');
```

### Helper: `fmtDate(iso: string): string`
```typescript
function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return names[dt.getDay()] + ' ' + Number(d) + ' ' + months[Number(m) - 1] + ' ' + y;
}
```

### Helper: `todayISO(): string`
```typescript
function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}
```

---

## Part 3 — C-H (Continuous Harvest) Calculator Screen

### File to create: `CHCalculatorScreen.tsx`

This is a two-step screen: first the user selects a crop, then they configure and see the result.

### Data source

Reads directly from the existing `cropDB` (the same in-memory crop database used throughout the app). No separate data file. The calculator reads these fields from each crop entry:

```typescript
growing_time_days: number
number_of_weeks_harvest: number
harvest_interval: number
batch_offset_days: number
planting_method: string
transplant_days: number | null
display_name: string
plant_type: string
```

### State

```typescript
const [step, setStep] = useState<'select'|'result'>('select');
const [selectedKey, setSelectedKey] = useState<string|null>(null);
const [searchQuery, setSearchQuery] = useState('');
const [typeFilter, setTypeFilter] = useState<''|'single'|'multi'>('');
const [freqDays, setFreqDays] = useState(7);
const [plotArea, setPlotArea] = useState(400);
const [startDate, setStartDate] = useState(todayISO());
const [resultHtml, setResultHtml] = useState<string|null>(null);
```

### Panel header

- Back button (‹) `onclick: closePanel`
- Title: "♻️ C-H Calculator"
- Right: empty (no action buttons in main header)

### Step 1 — Crop selection

**Search + filter bar** (padding 10px 16px, white background, border-bottom, flex, gap 8px):

Left: search input
```
width: flex:1
background: var(--bg)
border: 1px solid var(--border)
border-radius: 9px
padding: 9px 12px 9px 34px  (with 🔍 icon at left:10px)
font-size: 14px
oninput: setSearchQuery(e.target.value) → triggers re-filter
```

Right: type filter dropdown
```
<select> with options: "" (All crops), "single" (Single harvest), "multi" (Multi harvest)
background: var(--bg), border: 1px solid var(--border), border-radius: 9px
padding: 9px 10px, font-size: 13px
onchange: setTypeFilter(e.target.value)
```

**Crop list** (scrollable, padding 12px 16px, flex column, gap 8px):

Filter logic:
- Exclude alias entries (`val.alias` truthy)
- Filter by `searchQuery` (case-insensitive match on `display_name` or key)
- Filter by `typeFilter`: `single` = `number_of_weeks_harvest <= 1`, `multi` = `> 1`
- Sort alphabetically by `display_name`

Crop emoji map (used for avatars):
```typescript
const CROP_EMOJIS: Record<string, string> = {
  'Leafy Greens': '🥬', 'Brassica': '🥦', 'Fruiting Vegetable': '🍅',
  'Vine / Fruiting Vegetable': '🥒', 'Vine Crop': '🎃', 'Root Crop': '🥕',
  'Grain': '🌽', 'Legume': '🫘', 'Herb': '🌿', 'Bulb': '🧅',
  'Rhizome': '🫚', 'Tuber': '🍠', 'default': '🌱'
};
```

Each entry renders as a **ch-crop-card**:
```
background: var(--surface)
border: 1px solid var(--border)
border-radius: 12px
padding: 13px 15px
cursor: pointer
display: flex, align-items: center, gap: 12px
:active { transform: scale(0.985) }
onclick: selectCrop(key)
```

Inside the card:
- **Avatar** (38×38px, border-radius 9px, background var(--green-pale), font-size 18px): emoji from map
- **Info** (flex:1):
  - Crop name (13px, font-weight 600)
  - Subtitle: `{plant_type} · {growing_time_days}d grow · {number_of_weeks_harvest}wk harvest` (11px, var(--text-3))
- **Badge** (right, flex-shrink 0, white-space nowrap):
  - Single: background `#fef3c7` (amber-pale), color `#d97706`, text "Single"
  - Multi: background `#e8f5e8` (green-pale), color `#2d6a2d`, text "Multi"
  - Style: font-size 11px, font-weight 600, padding 2px 7px, border-radius 6px

### `selectCrop(key: string)`

```typescript
setSelectedKey(key);
const val = cropDB[key];
const isMulti = (val.number_of_weeks_harvest || 1) > 1;
// Update badge in result header
// Clear previous results
setResultHtml(null);
setStep('result');
```

### Step 2 — Configuration + Results

Shown when `step === 'result'`.

**Sub-header** (white background, border-bottom, padding 10px 16px, flex, align-items center, gap 10px, height ~50px):
- Back button (‹, 28×28px) `onclick: setStep('select')` + `chRenderCropList()`
- Crop name (14px, font-weight 600, flex:1)
- Badge (same style as crop list badge, showing "Multi harvest" or "Single harvest")

**Inputs bar** (`.ch-inputs`: white background, border-bottom, padding 12px 16px, flex column, gap 10px, flex-shrink 0):

**Harvest frequency label** (11px, font-weight 600, var(--text-3), uppercase, letter-spacing 0.5px, margin-bottom 6px):
"Desired harvest frequency"

**Frequency buttons row** (`.ch-freq-row`: flex, gap 6px, overflow-x auto, no-wrap):
4 buttons with `data-days` attribute:
- "Every week" — data-days="7" (default active)
- "Every 2 wks" — data-days="14"
- "Every 3 wks" — data-days="21"
- "Monthly" — data-days="28"

Button style (`.ch-freq-btn`):
```
flex: 0 0 auto
background: var(--bg)
border: 1px solid var(--border)
border-radius: 8px
padding: 8px 10px
font-size: 12px, font-weight: 500
cursor: pointer
```
Active (`.ch-freq-btn.active`):
```
background: var(--green-pale)
border-color: var(--green)
color: var(--green)
font-weight: 600
```
`onclick: setFreqDays(parseInt(btn.dataset.days))`

**Two-column input row** (`.ch-input-row: display grid; grid-template-columns: 1fr 1fr; gap: 10px`):
- Left `.ch-field`:
  - Label "Plot area (sq ft)" (11px, uppercase, var(--text-3))
  - Number input, default 400, min 1, DM Mono font
- Right `.ch-field`:
  - Label "Start date"
  - Date input, default today

**Calculate button** (`.ch-calc-btn`):
```
width: 100%
background: var(--green)
color: #fff
border: none
border-radius: 9px
padding: 11px
font-size: 14px, font-weight: 600
cursor: pointer
:hover { background: var(--green-light) }
text: "📐 Calculate my planting plan"
onclick: chCalculate()
```

**Results scroll area** (`.ch-result-scroll`: flex:1, overflow-y auto, padding 14px 16px, flex column, gap 14px):

Initial state (before Calculate is tapped):
```
Empty state card: 📐 icon (36px), text "Set your harvest frequency and plot size above, then tap Calculate."
```

After Calculate:

### Core calculation logic — `chCalculate()`

```typescript
function chCalculate() {
  const val = cropDB[selectedKey!];
  const growDays    = val.growing_time_days || 60;
  const harvestWks  = val.number_of_weeks_harvest || 1;
  const harvestDays = harvestWks * 7;
  const harvestIntv = val.harvest_interval || 7;
  const isMulti     = harvestWks > 1;

  // Batch offset calculation
  let batchOffset: number;
  if (!isMulti) {
    batchOffset = freqDays;
  } else {
    const naturalOffset = Math.max(harvestDays - harvestIntv, harvestIntv);
    batchOffset = Math.max(naturalOffset, freqDays);
  }

  // Number of batches/plots
  let numBatches: number;
  if (!isMulti) {
    numBatches = Math.ceil(growDays / batchOffset);
  } else {
    numBatches = Math.max(2, Math.ceil(harvestDays / batchOffset));
  }

  const subplotArea  = Math.round((plotArea / numBatches) * 10) / 10;
  const cycleDays    = isMulti ? growDays + harvestDays : growDays;
  const startDateObj = new Date(startDate + 'T00:00:00');
  const firstHarvestDate = new Date(startDateObj.getTime() + growDays * 86400000);
  const waitWeeks    = Math.ceil(growDays / 7);

  // Build visual calendar grid
  const GRID_WEEKS = Math.min(40, Math.ceil((growDays + harvestDays + batchOffset * numBatches) / 7) + 2);
  const gridData: string[][] = [];
  for (let b = 0; b < numBatches; b++) {
    const plantWeek   = Math.floor((b * batchOffset) / 7);
    const harvestWeek = Math.floor((b * batchOffset + growDays) / 7);
    const endWeek     = isMulti ? Math.floor((b * batchOffset + cycleDays) / 7) : harvestWeek + 1;
    const row: string[] = [];
    for (let w = 0; w < GRID_WEEKS; w++) {
      if (w < plantWeek)        row.push('empty');
      else if (w === plantWeek) row.push('plant');
      else if (w < harvestWeek) row.push('grow');
      else if (w < endWeek)     row.push('harvest');
      else                       row.push('empty');
    }
    gridData.push(row);
  }

  // ... build result HTML (see below)
}
```

### Result sections rendered (in order)

**1. Summary cards** (2×2 grid, gap 10px):

```
Card style: background white, border 1px solid var(--border), border-radius 12px, padding 13px 12px, text-center
Big number: font-size 28px, font-weight 600, color var(--green), line-height 1
Unit line: font-size 11px, color var(--text-3), margin-top 2px
Label line: font-size 12px, font-weight 500, color var(--text-2), margin-top 4px
```

4 cards:
1. `{numBatches}` / "plots / batches" / "to maintain the cycle"
2. `{Math.round(subplotArea)}` / "sq ft per plot" / "from {plotArea} sq ft total"
3. `{batchOffset}` / "days between plantings" / "planting interval"
4. `{waitWeeks}` / "weeks wait" / "until first harvest"

**2. Crop data card** (`.ch-info-card` — all info cards use this):
```
Card style: background white, border 1px solid var(--border), border-radius 12px, overflow hidden
Header (.ch-info-header): padding 11px 14px, border-bottom 1px solid var(--border), font-size 13px, font-weight 600
Body (.ch-info-body): padding 13px 14px, flex column, gap 8px
Row (.ch-info-row): flex, justify-content space-between, align-items center
Label (.ch-info-label): font-size 12px, color var(--text-3)
Value (.ch-info-value): font-size 13px, font-weight 600, color var(--text), DM Mono font
```

Header: "🌱 Crop data used"
Rows:
- Growing time: `{growDays} days`
- Harvest duration: `{harvestWks} week(s) ({harvestDays}d)`
- Harvest interval: `every {harvestIntv} days`
- Planting method: `{val.planting_method || '—'}` (font-family inherit, 12px, text-align right, max-width 55%)
- Transplant at: `{val.transplant_days} days` (only if `val.transplant_days` is truthy)
- Batch offset (DB): `{val.batch_offset_days} days`
- Batch offset (used): `{batchOffset} days` (value colour: var(--green))

**3. How the numbers work card**

Header: "🧮 How the numbers work"
Body (gap 6px):
- Formula explanation (13px, var(--text-2), line-height 1.6):
  - Single: `"You chose to harvest every {freqDays} days. Each new batch is planted every {batchOffset} days. With {growDays} days to grow, you need {numBatches} batches always in rotation."`
  - Multi: `"Offset = harvest duration ({harvestDays}d) − harvest interval ({harvestIntv}d) = {harvestDays - harvestIntv}d. Adjusted to match your {freqDays}-day frequency → {batchOffset}d."`
- Land division text (13px, var(--text-2), line-height 1.6):
  `"Divide your {plotArea} sq ft into {numBatches} plots of ~{Math.round(subplotArea)} sq ft each. Plant one plot every {batchOffset} days. After {waitWeeks} weeks, Plot 1 is ready and you harvest it, then replant it immediately — the cycle repeats indefinitely."`
- Multi-harvest note (if isMulti, 12px, var(--text-3), line-height 1.5):
  `"For multi-harvest crops, each plot keeps producing for {harvestWks} weeks. When Plot 1 starts slowing down, Plot 2 is already in peak harvest — no gap in supply."`

**4. Planting schedule card**

Header: "📅 Planting schedule"
Body: padding 0 (items touch the card edges)

For each batch `b` (0 to numBatches-1):
```typescript
const plantDay  = b * batchOffset;
const plantDate = new Date(startDateObj.getTime() + plantDay * 86400000);
const harvDate  = new Date(plantDate.getTime() + growDays * 86400000);
```

Each item (`.ch-tl-item`):
```
display: flex, gap 12px, align-items flex-start, padding 8px 0, border-bottom 1px solid var(--border)
last item: border-bottom none
First item: padding-top 13px
Last item: padding-bottom 13px
margin: 0 14px
```
Left col (`.ch-tl-dot-wrap`: flex column, align-items center, padding-top 3px, flex-shrink 0, width 16px):
- Dot (`.ch-tl-dot`: 10×10px, border-radius 50%, background `#2d6a2d`)

Right col (`.ch-tl-content`, flex:1):
- Week label (`.ch-tl-week`: 10px, font-weight 700, var(--text-3), letter-spacing 0.4px, uppercase):
  `"Plot {b+1} · Day {plantDay} · {fmtShort(plantDate)}"`
- Action (`.ch-tl-action`: 13px, font-weight 500, var(--text)):
  `"Plant batch {b+1}{b === 0 ? ' — starting today' : ''}"`
- Note (`.ch-tl-note`: 11px, var(--text-3), line-height 1.4):
  `"Ready to harvest: {fmtShort(harvDate)} (day {plantDay + growDays}){isMulti ? ' · harvesting for ' + harvestWks + ' weeks' : ''}"`

After all batches, append **First harvest row** (special styling):
```
padding: 10px 14px
background: var(--amber-pale) (#fef3c7)
border-radius: 0 0 12px 12px
border-top: 1px solid var(--border)
```
- Dot: background `#d97706`
- Week label (color var(--amber)):
  `"First harvest · Day {growDays} · {fmt(firstHarvestDate)}"`
- Action: `"🥬 Harvest Plot 1 — then replant immediately"`
- Note: `"From here on, harvest every {batchOffset} days continuously."`

**Helper: `fmtShort(d: Date): string`**
```typescript
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
return d.getDate() + ' ' + months[d.getMonth()];
```

**Helper: `fmt(d: Date): string`**
```typescript
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
```

**5. Visual planting calendar card**

Header: "📊 Visual planting calendar" + right-side muted note "first {showWeeks} weeks" (11px, font-weight 400, var(--text-3))

Body: overflow-x auto wrapper containing an HTML `<table>`.

```
showWeeks = Math.min(GRID_WEEKS, 28)
table style: border-collapse separate, border-spacing 2px, font-size 10px
```

**Header row:**
- First cell: "Plot" label (width 46px, var(--text-3), 10px, font-weight 600)
- Week cells (for w = 0 to showWeeks-1):
  - width 18px, text-center, var(--text-3), 9px
  - Label: if w % 4 === 0: `"{month+1}/{day}"` (from startDate + w weeks), else `"{w+1}"`

**Data rows** (for b = 0 to numBatches-1):
- First cell: "P{b+1}" (var(--text-2), 11px, font-weight 600)
- Week cells: 18×16px each, border-radius 2px, background from colour map:
  ```
  plant:   #2d6a2d
  grow:    #c2e0c2
  harvest: #d97706
  empty:   #e8e8e4
  ```

**Legend row** (flex, gap 12px, flex-wrap, margin-top 6px):
4 items, each:
```
display flex, align-items center, gap 5px, font-size 11px, color var(--text-3)
Square dot: 10×10px, border-radius 2px
```
- `#2d6a2d` → "Plant"
- `#c2e0c2` → "Growing"
- `#d97706` → "Harvest"
- `#e8e8e4` → "Empty/replanted"

**6. Practical tips card**

Header: `"💡 Practical tips for {val.display_name}"`

Body (gap 8px), all items 13px, var(--text-2), line-height 1.6:
1. `"🔄 Label each plot — mark them P1 to P{numBatches} so you always know which is next to plant and which is next to harvest."`
2. `"🌱 Replant immediately after harvesting each plot. The replanted plot joins the back of the rotation — your cycle stays tight."`
3. (Only if `val.transplant_days`) `"🪴 Transplant at day {val.transplant_days} — start seeds in a tray first to save plot space during germination."`
4. `"📦 At full rotation you'll harvest approximately {Math.floor(plotArea / numBatches)} sq ft of {val.display_name} every {batchOffset} days."`
5. If `!isMulti`: `"⚡ {val.display_name} is a single-harvest crop — once you cut it, that plot needs to be replanted. Keep all {numBatches} plots staggered and you'll never miss a week."`
   If `isMulti`: `"♻️ {val.display_name} keeps producing for {harvestWks} weeks per batch — you only need {numBatches} large plots, not {numBatches * 4}+ tiny ones."`

Last card has `margin-bottom: 4px`.

---

## Part 4 — openPanel() Updates

In the function (or wherever panels are opened), add these two cases:

```typescript
if (id === 'panel-herb') renderHerbList();
if (id === 'panel-ch-calc') chOpen();
```

`chOpen()` initialises the calculator:
```typescript
function chOpen() {
  setStep('select');
  setSelectedKey(null);
  setSearchQuery('');
  setTypeFilter('');
  setResultHtml(null);
  setStartDate(todayISO());
  setFreqDays(7);
  // re-render crop list
}
```

---

## Part 5 — Init / Render on Mount

In the app's init logic (or `useEffect` on the relevant screens):
```typescript
renderReminderList();  // already exists
renderHerbList();      // ADD THIS
```

---

## Part 6 — Do Not Touch

- Do not modify `crop_database.json` or `fertilizer_schedule.json`
- Do not change any existing sync logic (`sync.ts`, `sheets.ts`)
- Do not change the existing Crop Database, Fertilizer Database, Reminders, or Calendar panels
- Do not add a router — use the existing slide-in panel pattern
- Do not change the Dexie schema or `useAppStore`
- Keep all existing state variables intact

---

## Summary of Files

| File | Action |
|------|--------|
| `MoreScreen.tsx` | Add Herbicide Schedule button (replace placeholder) + add "Planning" section + C-H Calculator button |
| `HerbicideScreen.tsx` | Create — full 3-view panel (list, form, detail) |
| `CHCalculatorScreen.tsx` | Create — full 2-step panel (crop select, result) |
| App panel open handler | Add `panel-herb` and `panel-ch-calc` init calls |
