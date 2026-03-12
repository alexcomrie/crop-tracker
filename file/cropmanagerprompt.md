🌱 CropManager PWA
Trae.ai Implementation Prompt
Wire crop_database.json + fertilizer_schedule.json  ·  Local-first IndexedDB  ·  GAS sync
Full port of CropManager v9.13  ·  217 functions  ·  7,997 lines of GAS logic
CONTEXT — What Trae.ai Is Working With
You are working in a monorepo called Crop-Manager. The project already has a React + Vite + TypeScript PWA scaffold, an Express.js backend, and the two JSON database files downloaded and sitting in the database/ folder. Your job is to wire everything together into a fully self-contained app.

Current Project Structure
Crop-Manager/
├── artifacts/
│   ├── api-server/            Express.js backend  (port 6001)
│   └── cropmanager-pwa/       React + Vite + TypeScript PWA  (port 6000)
│       ├── gas/               ← GAS sync API goes here
│       ├── public/
│       ├── src/
│       └── vite.config.ts
├── lib/
│   ├── api-client-react/
│   ├── api-spec/
│   ├── api-zod/
│   └── db/                    Drizzle ORM schema
├── database/
│   ├── crop_database.json     ← 50 crops — ALREADY PRESENT
│   └── fertilizer_schedule.json ← 50 crops, 4 stages each — ALREADY PRESENT
├── scripts/
└── pnpm-workspace.yaml


⚠️  Both JSON files already exist in database/. Do NOT fetch them from any URL or GAS. Bundle them as PWA static assets.


MISSION
Transform this PWA scaffold into a fully self-contained crop management app that captures the complete essence of CropManager v9.13 (a 7,997-line Google Apps Script Telegram bot with 217 functions):

Bundle crop_database.json and fertilizer_schedule.json as static PWA assets — no network fetch, no GAS, no Google Drive for these files
Store ALL user data in IndexedDB (Dexie.js) — the app works 100% offline
Implement every feature from the original GAS bot as a native PWA mobile experience
Sync to Google Sheets once per day via a GAS Web App API endpoint — optional, the app works without it
Never lose data — IndexedDB is the source of truth; GAS/Sheets is only a backup

STEP 1 — Wire the JSON Databases

1a. Copy JSON files into the PWA static assets folder
# Run from project root:
cp database/crop_database.json artifacts/cropmanager-pwa/public/data/crop_database.json
cp database/fertilizer_schedule.json artifacts/cropmanager-pwa/public/data/fertilizer_schedule.json


1b. Install Dexie.js for IndexedDB
cd artifacts/cropmanager-pwa
pnpm add dexie dexie-react-hooks zustand


1c. Create src/types/database.ts — TypeScript types for both JSON files
These types exactly match the JSON structures in crop_database.json and fertilizer_schedule.json:

crop_database.json entry fields (CropEntry interface)
display_name        string    e.g. 'Tomato'
plant_type          string    e.g. 'Fruiting Vegetable'
number_of_harvests  number    total harvests expected (use >1 to default consistent harvest ON)
growing_time_days   number    seed to harvest, direct ground
transplant_days     number|null  days in seed tray before transplant
growing_from_transplant number|null  days from transplant to harvest
harvest_interval    number    days between successive harvests
batch_offset_days   number    days between succession plantings
germination_days_min  number
germination_days_max  number
fungus_spray_days   number[]  days-from-planting for each fungus spray
pest_spray_days     number[]  days-from-planting for each pest spray
planting_method     string    recommended method string
diseases            string[]
pests               string[]
varieties?          string[]  optional


fertilizer_schedule.json entry fields (FertCropEntry interface)
display_name  string
plant_type    string
fert_profile  string   'fruiting'|'cucurbit'|'brassica'|'leafy'|'root'|'legume'|'herb'|'allium'|'grain'|'tuber'
stages: {
  seedling, mid_vegetative, flowering, fruiting: {
    description     string
    foliar: {
      mix_parts: { cow_manure_tea, chicken_manure_tea, plant_based_tea, wood_ash_tea: number }
      final_dilution        number   (1:N — e.g. 25 means 1 cup tea per 25 cups water)
      yeast_tsp_per_litre?  number
      yeast_tbsp_per_5L?    number
      mixing_example        string   e.g. 'Per 1L spray bottle: 20ml cow...'
      note                  string
    }
    drench: { same structure as foliar }
  }
}


fertilizer_schedule.json _meta fields (FertDbMeta interface)
_meta: {
  teas: { cow_manure_tea, chicken_manure_tea, plant_based_tea, wood_ash_tea, yeast_fertilizer: string }
  yeast_preparation    string   full preparation instructions
  yeast_dosing: { foliar_spray, soil_drench: string }
  thyme_oil_mosquito_control  string
  application_tips     string[]   7 rules
  dilution_note        string
}


1d. Create src/lib/database.ts — loader with in-memory cache
// Loads both JSONs once at startup. Serves from memory after that.
// These are static files bundled with the PWA — no network call to GAS needed.


let _cropDb: Record<string, CropEntry> | null = null;
let _fertDb: FertDb | null = null;


export async function loadCropDb(): Promise<Record<string, CropEntry>> {
  if (_cropDb) return _cropDb;
  const res = await fetch('/data/crop_database.json');
  _cropDb = await res.json();
  return _cropDb!;
}


export async function loadFertDb(): Promise<FertDb> {
  if (_fertDb) return _fertDb;
  const res = await fetch('/data/fertilizer_schedule.json');
  _fertDb = await res.json();
  return _fertDb!;
}


/** Exact match then partial match. Mirrors GAS _lookupCrop(). */
export function lookupCrop(name: string): CropEntry | null {
  if (!_cropDb || !name) return null;
  const key = name.trim().toLowerCase();
  if (_cropDb[key]) return _cropDb[key];
  for (const k of Object.keys(_cropDb)) {
    if (k.includes(key) || key.includes(k)) return _cropDb[k];
  }
  return null;
}


/** Exact match then partial match. Mirrors GAS _lookupFertCrop(). */
export function lookupFertCrop(cropName: string) {
  if (!_fertDb || !cropName) return null;
  const key = cropName.toLowerCase().trim();
  if (_fertDb.crops[key]) return _fertDb.crops[key];
  for (const k of Object.keys(_fertDb.crops)) {
    if (key.includes(k) || k.includes(key)) return _fertDb.crops[k];
  }
  return null;
}


export const getCropDb = () => _cropDb!;
export const getFertDb = () => _fertDb!;


1e. Load both databases at app startup before rendering
// In main.tsx:
Promise.all([loadCropDb(), loadFertDb()]).then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><App /></React.StrictMode>
  );
});


STEP 2 — IndexedDB Schema (Dexie.js)
Create src/db/schema.ts. Every table mirrors a GAS Google Sheet. Every record has syncStatus: 'clean' | 'pending' and updatedAt: number (local-only fields, never sent to GAS).

Table: crops  (mirrors CropTracking sheet — 21 columns)
id                       string  PK   CROP_timestamp_rand
cropName                 string
variety                  string
plantingMethod           string   'Seed tray'|'Direct ground'|'Direct bed'|'Cutting'|'Division'|'Grafted'
plantStage               string   'Seed'|'Germinated'|'Seedling'|'Vegetative'|'Flowering'|'Fruiting'|'Transplanted'|'Harvested'|'Deleted'
plantingDate             string   'DD-Mon-YYYY'
transplantDateScheduled  string
transplantDateActual     string
germinationDate          string
harvestDateEstimated     string
harvestDateActual        string
nextConsistentPlanting   string
batchNumber              number
fungusSprayDates         string   comma-separated
pestSprayDates           string   comma-separated
status                   string   'Active'|'Harvested'|'Deleted'
notes                    string
daysSeedGerm             number
daysGermTransplant       number
daysTransplantHarvest    number
telegramChatId           string
syncStatus               'clean'|'pending'   ← local only
updatedAt                number              ← local only


Table: propagations  (mirrors PropagationTracking sheet)
id                   string  PK   PROP_timestamp_rand
plantName            string
propagationDate      string
propagationMethod    string   'Cutting'|'Seed'|'Division'|'Layering'|'Grafting'
notes                string
expectedRootingStart string
expectedRootingEnd   string
actualRootingDate    string
daysToRootActual     number
status               string   'Propagating'|'Rooted'|'Transplanted'|'Failed'
telegramChatId       string
syncStatus / updatedAt


Table: reminders  (mirrors ReminderQueue sheet)
id              string  PK  REM_timestamp_rand
type            string  'harvest'|'transplant'|'spray_fungus'|'spray_pest'|
                        'next_planting'|'germination_check'|'rooting_check'|
                        'true_leaf_check'|'fert_application'
cropPlantName   string
trackingId      string  FK
sendDate        string  'DD-Mon-YYYY'
subject         string
body            string
sent            boolean
chatId          string
syncStatus / updatedAt


Tables: stageLogs, harvestLogs, treatmentLogs, cropDbAdjustments, propDbAdjustments, batchPlantingLogs
stageLogs:          id, trackingId, cropName, variety, stageFrom, stageTo, date, daysElapsed, method, notes
harvestLogs:        id, cropTrackingId, cropName, harvestNumber, harvestDate, daysFromPlanting, deviationFromDb, notes
treatmentLogs:      id, cropId, cropName, date, daysFromPlanting, type, product, notes
cropDbAdjustments:  id(`key::variety::field`), cropKey, variety, field, databaseDefault, yourAverage, sampleCount, useCustom, lastUpdated
propDbAdjustments:  id(`plantKey::method`), plantKey, method, dbDefaultRootingDays, yourAverage, sampleCount, useCustom, lastUpdated
batchPlantingLogs:  id, cropTrackingId, cropName, batchNumber, batchPlantingDate, confirmedPlantedDate, nextBatchDate, status, notes

ALL tables include: syncStatus: 'clean'|'pending'  and  updatedAt: number


// Dexie index definitions:
crops:              '&id, status, plantStage, syncStatus, updatedAt'
propagations:       '&id, status, syncStatus, updatedAt'
reminders:          '&id, trackingId, type, sent, sendDate, syncStatus'
stageLogs:          '&id, trackingId, syncStatus'
harvestLogs:        '&id, cropTrackingId, syncStatus'
treatmentLogs:      '&id, cropId, syncStatus'
cropDbAdjustments:  '&id, cropKey, syncStatus'
propDbAdjustments:  '&id, plantKey, syncStatus'
batchPlantingLogs:  '&id, cropTrackingId, syncStatus'


STEP 3 — Business Logic (src/lib/)
All functions are pure TypeScript — no GAS, no Sheets, no network. Each mirrors a named GAS function.

3a. src/lib/utils.ts — IDs, dates, arithmetic
Functions to implement
generateId(prefix) → 'CROP_${Date.now()}_${rand}'   mirrors GAS _generateID()
parseDate(str)      handles: 'DD-Mon-YYYY', ISO, 'today', 'yesterday', 'Mar 12', 'DD-MM-YYYY'
                    mirrors GAS _parseDate()
formatDate(date)  → 'DD-Mon-YYYY'  e.g. '12-Mar-2026'  mirrors GAS _formatDateShort()
formatDateDisplay → 'Thu 12 Mar 2026'
addDays(date, n)    mirrors GAS _addDays()
daysBetween(a, b)   returns integer number of days


3b. src/lib/harvest.ts — Date calculations  (mirrors _processCropEmail harvest logic)
getAdjustedValue(cropKey, field, defaultVal, variety, adjustments, threshold):
  → finds matching CropDbAdjustment where useCustom='Yes' and sampleCount >= threshold
  → returns yourAverage if found, else defaultVal


calculateTransplantDate(plantingDate, cropData, variety, adjustments):
  → addDays(plantingDate, getAdjustedValue('transplant_days'))
  → returns null if cropData.transplant_days is null


calculateHarvestDate(plantingDate, transplantActual, transplantScheduled, cropData, variety, adjustments):
  transplantBase = transplantActual ?? transplantScheduled
  if transplantBase && growing_from_transplant:
    → addDays(transplantBase, getAdjustedValue('growing_from_transplant'))
  else:
    → addDays(plantingDate, getAdjustedValue('growing_time_days'))


3c. src/lib/reminders.ts — All reminder generation  (mirrors _queueReminder + _processCropEmail)
generateCropReminders(trackingId, cropName, cropData, plantingDate, transplantDate, harvestDate, fungusSprayDates, pestSprayDates, consistentDates, chatId, adjustments) returns Reminder[]:
germination_check → plantingDate + germMin days
transplant → transplantDate - 1 day  (only if transplant method)
harvest → harvestDate - 2 days
spray_fungus → one reminder per fungusSprayDate, sent 1 day before each
spray_pest → one reminder per pestSprayDate, sent 1 day before each
next_planting → one per consistent batch date, sent 3 days before each

generateTrueLeafCheckReminder(trackingId, cropName, germinationDate, chatId): queued after germination confirmed, fires 12 days later  (mirrors GAS _queueTrueLeafCheck)

generatePropReminders(propId, plantName, propagationDate, method, rootingMin, rootingMax, chatId): rooting_check reminder at rootingMin days after propagationDate

3d. src/lib/succession.ts — Batch planting dates  (mirrors _getConsistentPlantingDates)
getConsistentPlantingDates(cropData, plantingDate, monthsAhead, variety, adjustments):
  offset = getAdjustedValue('batch_offset_days', cropData.batch_offset_days)
  cutoff = addDays(plantingDate, monthsAhead * 30)
  while next <= cutoff: dates.push(next); next = addDays(next, offset)


shouldDefaultConsistentHarvest(cropData):
  return cropData.number_of_harvests > 1
  NOTE: crop_database.json uses 'number_of_harvests' not 'number_of_weeks_harvest'
  This is the ONLY field name difference between the JSON and GAS code.


buildSuccessionGapData(crops, weekCount=12):
  12-week calendar, each week shows which crops have harvest coverage
  mirrors GAS _sendSuccessionGapAnalysis()


3e. src/lib/propagation.ts — Rooting windows  (mirrors _getPropagationRootingDays)
PROPAGATION_DEFAULTS = {
  Cutting:  { min: 14, max: 28 },
  Seed:     { min: 5,  max: 14 },
  Division: { min: 7,  max: 14 },
  Layering: { min: 21, max: 42 },
  Grafting: { min: 14, max: 28 },
}


getRootingDays(plantKey, method, propAdjustments):
  check propAdjustments for match with useCustom='Yes', use yourAverage ± 20%
  else return PROPAGATION_DEFAULTS[method]


3f. src/lib/learning.ts — Running average learning system  (mirrors _logDeviation)
logDeviation(cropKey, field, dbDefault, actualValue, variety, existing, threshold):
  → finds existing CropDbAdjustment by cropKey+variety+field
  → if found: increment sampleCount, recalculate running average
              if sampleCount reaches threshold: set useCustom = 'Yes'
  → if not found: create new record with sampleCount=1, useCustom='No'
  → always set syncStatus='pending'


logPropDeviation(plantKey, method, daysToRoot, existing):
  → same pattern for PropDbAdjustment
  → mirrors GAS _updatePropDatabase()


Fields subject to learning (crop): germination_days_min, germination_days_max,
  growing_time_days, transplant_days, growing_from_transplant, batch_offset_days


3g. src/lib/fertilizer.ts — Full fertilizer profile system  (mirrors _getFertProfile + _buildFertScheduleMsg + _scheduleFertReminders)

⚠️  CRITICAL FIELD MAPPING: fertilizer_schedule.json uses 'mid_vegetative' as stage key. GAS uses 'midVeg'. Always convert with GAS_TO_JSON / JSON_TO_GAS maps.


CROP_FERT_TYPE: Record<string, FertProfileKey> = {
  // 34 crops mapped to 10 profile keys:
  tomato→fruiting, tomatoes→fruiting, hot pepper→fruiting, scotch bonnet→fruiting,
  chili→fruiting, sweet pepper→fruiting, bell pepper→fruiting, pepper→fruiting,
  eggplant→fruiting, aubergine→fruiting, okra→fruiting,
  cucumber→cucurbit, cucumbers→cucurbit, pumpkin→cucurbit,
  squash→cucurbit, zucchini→cucurbit, butternut→cucurbit, watermelon→cucurbit,
  broccoli→brassica, cabbage→brassica, cauliflower→brassica,
  callaloo→leafy, pak choi→leafy, bok choy→leafy, lettuce→leafy,
  spinach→leafy, kale→leafy, mustard greens→leafy,
  carrot→root, beetroot→root, beet→root, radish→root, sweet potato→root,
  red peas→legume, kidney beans→legume, gungo peas→legume,
  pigeon peas→legume, string beans→legume, green beans→legume,
  thyme→herb, basil→herb, lemongrass→herb, fever grass→herb, scallion→herb,
  onion→allium, garlic→allium,
  corn→grain, maize→grain,
  cassava→tuber, ginger→tuber
}


TRUE_LEAF_THRESHOLDS = {
  fruiting:4, cucurbit:2, brassica:2, leafy:2, root:2,
  legume:1, herb:2, allium:3, grain:3, tuber:2
}


GAS_TO_JSON = { seedling:'seedling', midVeg:'mid_vegetative', flowering:'flowering', fruiting:'fruiting' }
JSON_TO_GAS = { seedling:'seedling', mid_vegetative:'midVeg', flowering:'flowering', fruiting:'fruiting' }


buildMixString(half): string
  active = mix_parts entries where value > 0
  names: { cow_manure_tea→'Cow', chicken_manure_tea→'Chicken',
           plant_based_tea→'Plant', wood_ash_tea→'Wood Ash' }
  str = active names joined by ' + '
  str += ' (1:' + final_dilution + ')'
  if yeast_tsp_per_litre: str += ' + Yeast (N tsp/L)'
  if yeast_tbsp_per_5L:   str += ' + Yeast (N tbsp/5L)'
  if all zero: return 'Plain water only'


getFertFreqDays(gasStageKey, profileKey): number
  seedling:  fruiting=7, cucurbit=7, brassica=7, leafy=7, root=7,  legume=10, herb=10, allium=7,  grain=7,  tuber=8
  midVeg:    fruiting=10,cucurbit=10,brassica=10,leafy=10,root=12, legume=12, herb=14, allium=10, grain=10, tuber=12
  flowering: fruiting=10,cucurbit=10,brassica=10,leafy=12,root=14, legume=14, herb=17, allium=12, grain=10, tuber=14
  fruiting:  fruiting=12,cucurbit=12,brassica=14,leafy=14,root=17, legume=14, herb=21, allium=14, grain=14, tuber=21


getFertProfile(cropName, fertDb):
  1. Try exact match in fertDb.crops, then partial match
  2. If found: profileKey = entry.fert_profile
  3. If not found: profileKey = CROP_FERT_TYPE[cropName] || 'fruiting'
  returns: { fromJson, profileKey, entry, trueLeafThreshold }


buildFertScheduleData(cropName, fertDb):
  returns structured object with: teas, yeastPrep, yeastDosing, dilutionNote,
  thymeOilTip, applicationRules, trueLeafThreshold, profileKey, and:
  stages[]: { key(gasKey), label, foliarStr, foliarMixExample,
              drenchStr, drenchMixExample, frequency, freqDays, note }
  → This is what the FertScheduleView component renders


scheduleFertReminders(trackingId, cropName, variety, germDate, cropData, fertDb, chatId):
  Calculates 4 stage windows from germDate + cropData timing:
    transDate   = addDays(germDate, transplantDays)
    midVegStart = addDays(transDate, -5)
    flowerDate  = addDays(transDate, round(growFromTransplant * 0.35))
    fruitDate   = addDays(transDate, round(growFromTransplant * 0.60))
    harvestDate = addDays(germDate, growTotal)
  For each window: queue one fert_application reminder every freqDays
  Subject: '🌱 Fert 1/~4 • Seedling — CropName (variety)'
  Returns: Reminder[]  (can be 8–20 reminders per crop)


3h. src/lib/stages.ts — Stage transitions  (mirrors _processGerminationConfirm, _processTransplantConfirm, _processHarvestConfirm)
processGermination(crop, germinationDate, cropData, adjustments):
  → daysSeedGerm = daysBetween(plantingDate, germinationDate)
  → if seed tray method: recalculate harvestDateEstimated from germinationDate
  → updates: germinationDate, plantStage='Germinated', daysSeedGerm
  → creates StageLog entry
  → returns { updatedCrop, stageLog }


processTransplant(crop, transplantDate, cropData, adjustments):
  → daysGermTransplant = daysBetween(germinationDate || plantingDate, transplantDate)
  → recalculates harvestDateEstimated using transplant as base
  → updates: transplantDateActual, plantStage='Transplanted', daysGermTransplant, harvestDateEstimated
  → creates StageLog entry
  → returns { updatedCrop, stageLog }


processHarvest(crop, harvestDate, harvestNumber, cropData, adjustments, learningThreshold):
  → daysFromPlanting = daysBetween(plantingDate, harvestDate)
  → deviation = daysBetween(harvestDateEstimated, harvestDate)  (negative=early)
  → updates: harvestDateActual, status='Harvested', daysTransplantHarvest
  → creates HarvestLog entry with deviation
  → calls logDeviation('growing_time_days', daysFromPlanting) → updates CropDbAdjustment
  → returns { updatedCrop, stageLog, harvestLog, adjustmentUpdate }


3i. src/lib/weather.ts — Open-Meteo weather  (mirrors _fetchWeather)
fetchWeather(lat, lon, days=7): Promise<DayForecast[]|null>
  GET https://api.open-meteo.com/v1/forecast
     ?latitude={lat}&longitude={lon}
     &daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode
     &timezone=America%2FJamaica&forecast_days={days}
  Cache result in localStorage for 1 hour
  Show 'Updated X hours ago' label when serving from cache


weatherCodeLabel(code): string   (0=Clear, <=3=Partly cloudy, <=49=Foggy,
  <=59=Drizzle, <=69=Rain, <=79=Snow, <=82=Rain showers, <=99=Thunderstorm)
weatherCodeEmoji(code): string   (0=☀️, <=2=🌤️, 3=☁️, <=49=🌫️, <=59=🌦️,
  <=69=🌧️, <=82=🌦️, <=99=⛈️)


getSprayWeatherWarnings(forecast, sprayReminders, rainThresholdMm):
  → find spray reminders whose sendDate falls on a rainy forecast day
  → mirrors GAS _getSprayWeatherWarnings()


3j. src/lib/sync.ts — GAS sync engine
buildSyncPayload(): collects all 'pending' records from every Dexie table
  converts each to a flat array in EXACT Google Sheets column order
  returns { pendingCount, payload, allIds }


pushToGAS(settings): POST to gasWebAppUrl with token + action='push'
  on success: mark all sent records syncStatus='clean', save lastSyncAt
  on failure: keep syncStatus='pending', return error


pullFromGAS(settings): POST with action='pull'
  on success: clear all Dexie tables, re-populate from GAS response


COLUMN ORDER for push (must match GAS sheet exactly):
  crops row:     [id, cropName, variety, plantingMethod, plantStage, plantingDate,
                  transplantDateScheduled, transplantDateActual, germinationDate,
                  harvestDateEstimated, harvestDateActual, nextConsistentPlanting,
                  batchNumber, fungusSprayDates, pestSprayDates, status, notes,
                  daysSeedGerm, daysGermTransplant, daysTransplantHarvest, telegramChatId]
  reminders row: [id, type, cropPlantName, trackingId, sendDate, subject, body,
                  sent?'Yes':'No', chatId]


STEP 4 — App Settings Store
Create src/store/useSettings.ts using Zustand with persist middleware (saves to localStorage key 'cropmanager_settings'):
gasWebAppUrl          string   GAS Web App deployment URL
syncToken             string   matches SYNC_TOKEN in GAS PropertiesService
telegramChatId        string   default: '5837914244'
weatherLat            number   default: 18.4358
weatherLon            number   default: -77.2010
weatherLocation       string   default: "Saint Ann's Bay"
rainThresholdMm       number   default: 5
learningThreshold     number   default: 3
monthsOfPlantingDates number   default: 3
autoSyncHour          number   default: 23  (11 PM)
syncEnabled           boolean  default: true


STEP 5 — Screens & UI (Mobile-First, 390px)
5-tab bottom navigation. All forms use bottom sheets (slide-up panels, 90vh max) — never full-page navigation for data entry. Minimum touch target 44×44px. Theme colour #2d6a2d (deep forest green).

Tab 1 — Dashboard  (mirrors GAS _sendTodayBriefing)
Today's date header
Weather widget: Open-Meteo, max/min temp, condition emoji, rain mm, 1-hour cache
⚠️ Spray Warning banner (amber) if rain > rainThresholdMm in next 48h AND spray reminder is scheduled  (mirrors _getSprayWeatherWarnings)
Due Today: reminder cards from reminders table where sendDate = today and sent=false. Each card: type emoji, crop name, subject, action button
Ready to Harvest: crops where harvestDateEstimated = today
Transplant Due Today: crops where transplantDateScheduled = today and status = 'Active'
Plant New Batch Today: next_planting reminders due today
Empty state: '✅ Nothing due today. Your crops are happy!'
FAB: 56px green circle, fixed bottom-right, opens Date-First Entry bottom sheet

Date-First Entry (FAB flow)  (mirrors GAS v9.13 _startDateEntry + hub)
Opens bottom sheet with formatted date header. Tap date to change (date picker).
Two large buttons: 🌱 Crop  |  🌿 Propagation
Crop → Crop Hub sheet: Log New / Batch / Update Stage / Germinated / Transplanted / Log Harvest / Delete / List Active
Propagation → Prop Hub: Log New / Batch / Mark Rooted / Mark Transplanted
Selected date pre-fills into every subsequent form step — never asked again

Tab 2 — Crops Screen
useLiveQuery: db.crops.where('status').notEqual('Deleted').toArray()
Card view default, List view toggle. Filter chips: All | Active | Seedling | Flowering | Harvested
Stage badge colours: Seed=#9e9e9e  Seedling=#8bc34a  Vegetative=#43a047  Flowering=#ffb300  Fruiting=#e65100  Transplanted=#0288d1  Harvested=#5d4037  Deleted=#bdbdbd
Progress bar: daysBetween(plantingDate, today) / growing_time_days × 100%
Swipe left → Mark Germinated / Transplanted / Log Harvest / Delete
Tap → Crop Detail screen

Crop Detail Screen
Stage timeline dots: Planted → Germinated → Transplanted → Flowering → Fruiting → Harvest
All dates with edit buttons
Spray schedule: next fungus date, next pest date
Fertilizer tab: calls buildFertScheduleData(cropName, fertDb) — renders full 4-stage plan
Treatment log entries, stage log entries, batch planting log
Delete button (red, requires typing crop name to confirm)

New Crop Form — 7 steps in bottom sheet  (mirrors _continueCropOnboarding)
Step 1: Crop name — searchable dropdown from Object.entries(cropDb).map(([k,v])=>v.display_name)
Step 2: Variety — chips from cropData.varieties if present, else free text + Skip
Step 3: Planting method — chips: Seed Tray | Direct Ground | Direct Bed | Cutting | Division | Grafted
Step 4: Tray colour (only if Seed Tray or Grafted) — multi-select chips: Red/Orange/Yellow/Green/Blue/Purple/Pink/White. Stored in notes as '🎨 Tray: Red, Blue'
Step 5: Consistent harvest toggle — default = shouldDefaultConsistentHarvest(cropData)
Step 6: Notes (free text, optional)
Step 7: Review & Confirm — shows all details. On confirm:
  calculateTransplantDate → fungusSprayDates/pestSprayDates from cropData arrays → calculateHarvestDate
  getConsistentPlantingDates if consistent=true → generateCropReminders → all saved to db
  All records set syncStatus='pending' → success toast with tracking ID

Batch Crop Form  (mirrors _continueBatchCropOnboarding)
Same 7 steps as single crop. After step 6: 'Add Another Crop' | 'Done' buttons
Progress indicator: 'Crop 1 of N queued'. Review all before saving in one transaction

Update Crop Form  (mirrors _continueCropUpdateOnboarding)
Mode 1 — Stage Change: chips for valid next stages → processStageChange() → stageLog saved
Mode 2 — Treatment: Type chips (Fungus Spray / Pest Spray / Fertilizer) + product name → TreatmentLog saved
Mode 3 — Notes: append or replace

Quick Events  (mirrors _executeQuickEvent)
Germinated: select crop → confirm date → processGermination() → saves updated crop + stageLog + true_leaf_check reminder
Transplanted: select crop → confirm date → processTransplant() → saves updated crop + stageLog
Harvest: select crop → confirm date → processHarvest() → saves updated crop + stageLog + harvestLog + learning deviation update
Prop Rooted: select prop → confirm date → sets actualRootingDate, daysToRootActual, status='Rooted' → logPropDeviation()
Prop Transplanted: select prop → confirm date → status='Transplanted'

Tab 3 — Propagations Screen
Same card/list layout as Crops. Filter: All | Propagating | Rooted | Transplanted | Failed
Prop card: plant name, method, days since propagation, rooting window start–end, status badge
Overdue indicator if today > expectedRootingEnd
New Prop Form: plant name (autocomplete from past props) → method → date → notes → rooting window calculated from getRootingDays() → generatePropReminders()

Tab 4 — Calendar Screen  (mirrors _sendWeekAhead)
7-day view: today + 6 forward. Swipe left/right to navigate weeks
Each day: date label, weather emoji + max temp, list of due reminders with emoji
Reminder type emojis: 🌱 germination/transplant  🥬 harvest  🍄 fungus spray  🐛 pest spray  📅 next planting  🌿 rooting check  🍃 true leaf check  💧 fert application
Tap reminder → opens mark-done / log action sheet

Reports  (top-bar icon, mirrors all GAS report functions)
Status Report: all active crops (name, variety, stage, days since planting, days to harvest) + all active props  →  mirrors _buildStatusText()
Harvest Report: grouped by crop name, harvest count, avg days, avg deviation  →  mirrors _sendHarvestReport()
Succession Gap Analysis: 12-week calendar, green/red weeks  →  mirrors _sendSuccessionGapAnalysis() using buildSuccessionGapData()
Weekly Digest: weather this week, overdue items, week ahead summary  →  mirrors sendWeeklyDigest()

Fertilizer Schedule View  (mirrors _buildFertScheduleMsg in full)
Accessible from Crop Detail and from Crops screen top-right. Call buildFertScheduleData(cropName, fertDb) and render:
YOUR 5 TEAS — descriptions from _meta.teas
YEAST PREP — from _meta.yeast_preparation + _meta.yeast_dosing
HOW TO READ DILUTIONS — from _meta.dilution_note
MOSQUITO CONTROL — from _meta.thyme_oil_mosquito_control
4-STAGE FEEDING PLAN — for each stage: label, foliarStr + mixing_example, drenchStr + mixing_example, frequency, note. Highlight current stage based on crop.plantStage.
APPLICATION RULES — from _meta.application_tips (7 bullet points)
'Log Application' button → TreatmentLog entry prefilled with fert type

Tab 5 — Settings Screen
GAS Web App URL, Sync Token, Telegram Chat ID, Weather config, Rain threshold, Learning threshold
Sync panel: pending count badge, last synced time, Sync Now button (live progress), retry on error
Pull from Sheets button — confirmation dialog — clears + repopulates all IndexedDB from GAS
Export JSON backup — downloads all IndexedDB data as .json
Database Edit — lists CropDbAdjustments + PropDbAdjustments, toggle useCustom, edit yourAverage
Clear all data button — requires typing 'CLEAR' to confirm

STEP 6 — PWA Config & Service Worker

vite.config.ts — vite-plugin-pwa settings
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
    runtimeCaching: [
      { urlPattern: /^\/data\//, handler:'CacheFirst',
        options:{ cacheName:'static-data', expiration:{ maxAgeSeconds: 30*24*3600 } } },
      { urlPattern: /api\.open-meteo\.com/, handler:'NetworkFirst',
        options:{ cacheName:'weather-cache', expiration:{ maxAgeSeconds: 3600 } } }
    ]
  },
  manifest: {
    name: 'CropManager',  short_name: 'CropMgr',
    theme_color: '#2d6a2d',  background_color: '#f0f7f0',
    display: 'standalone',  start_url: '/',
    icons: [
      { src:'/icons/icon-192.png', sizes:'192x192', type:'image/png' },
      { src:'/icons/icon-512.png', sizes:'512x512', type:'image/png' }
    ]
  }
})


Auto-sync trigger in App.tsx
useEffect(() => {
  const checkSync = async () => {
    if (!settings.syncEnabled || !settings.gasWebAppUrl) return;
    const lastSync   = parseInt(localStorage.getItem('cropmanager_last_sync') || '0');
    const hoursSince = (Date.now() - lastSync) / 3600000;
    const hour       = new Date().getHours();
    if (hour >= settings.autoSyncHour && hoursSince > 20) {
      await pushToGAS({ gasWebAppUrl: settings.gasWebAppUrl, syncToken: settings.syncToken });
    }
  };
  window.addEventListener('focus', checkSync);
  const timer = setInterval(checkSync, 30 * 60 * 1000);
  checkSync();
  return () => { window.removeEventListener('focus', checkSync); clearInterval(timer); };
}, [settings.syncEnabled, settings.gasWebAppUrl, settings.autoSyncHour]);


STEP 7 — Critical Field Mapping Notes

⚠️  These are the ONLY places where crop_database.json field names differ from GAS code. Handle these explicitly.


Field name differences: crop_database.json vs GAS code
JSON field               GAS field                  How to handle
─────────────────────────────────────────────────────────────────
number_of_harvests       number_of_weeks_harvest    Use number_of_harvests > 1
                                                    to determine default consistent
                                                    harvest toggle (same logic as GAS)

mid_vegetative (stage)   midVeg (stage)             Always convert via GAS_TO_JSON /
                                                    JSON_TO_GAS maps in fertilizer.ts

(no consistent_harvest)  consistent_harvest         Derive: number_of_harvests > 1
                                                    This is the single most important
                                                    mapping — it controls whether
                                                    succession reminders are generated


Important: fertilizer_schedule.json ALREADY has 50 crops
Every crop in crop_database.json has a matching entry in fertilizer_schedule.json.
Always try fertDb.crops lookup FIRST for fert data.
Only fall back to CROP_FERT_TYPE + hardcoded FERT_PROFILES if lookup fails.
Both files use the same crop keys (lowercase), so lookupFertCrop and lookupCrop
use the same partial-match logic.


STEP 8 — GAS Sync API to Deploy (gas/sync_api.gs)
This is a NEW file to create alongside the existing CropManager bot. Deploy it separately in the same GAS project as a Web App (Execute as Me, Anyone can access). The existing CropManager_FULL_v9_POLLING.gs is NOT touched.

const SYNC_SHEETS = {
  crops:             { name: 'CropTracking',             idCol: 0 },
  propagations:      { name: 'PropagationTracking',      idCol: 0 },
  reminders:         { name: 'ReminderQueue',            idCol: 0 },
  stageLogs:         { name: 'StageLog',                 idCol: 0 },
  harvestLogs:       { name: 'HarvestLog',               idCol: 0 },
  treatmentLogs:     { name: 'TreatmentLog',             idCol: 0 },
  cropDbAdjustments: { name: 'CropDatabase_Adjustments', idCol: 0 },
  propDbAdjustments: { name: 'PropDatabase_Adjustments', idCol: 0 },
  batchPlantingLogs: { name: 'BatchPlantingLog',         idCol: 0 },
};


function doPost(e) {
  var body  = JSON.parse(e.postData.contents);
  var token = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
  if (body.token !== token) return _res({ error: 'Unauthorized' });
  if (body.action === 'push') return _res(pushHandler(body.payload));
  if (body.action === 'pull') return _res(pullHandler());
  return _res({ error: 'Unknown action' });
}


function doGet(e) {
  return _res({ status: 'CropManager Sync API OK', version: '1.0' });
}


function pushHandler(payload) {
  var ss = SpreadsheetApp.openById('1jA1Fpw27aPoO1wdz6Y0GWRGBgP1xp60wWKjWiMYgV38');
  var written = {}; var errors = [];
  Object.keys(SYNC_SHEETS).forEach(function(key) {
    var records = payload[key] || [];
    var cfg = SYNC_SHEETS[key];
    written[key] = 0;
    records.forEach(function(rec) {
      try { _upsertRow(ss, cfg.name, cfg.idCol, rec); written[key]++; }
      catch(err) { errors.push(cfg.name+':'+rec[0]+':'+err.message); }
    });
  });
  return { success: true, written: written, errors: errors };
}


function pullHandler() {
  var ss = SpreadsheetApp.openById('1jA1Fpw27aPoO1wdz6Y0GWRGBgP1xp60wWKjWiMYgV38');
  var result = {};
  Object.keys(SYNC_SHEETS).forEach(function(key) {
    var sheet = ss.getSheetByName(SYNC_SHEETS[key].name);
    result[key] = sheet ? sheet.getDataRange().getValues().slice(1).filter(function(r){ return r[0]; }) : [];
  });
  return { success: true, data: result };
}


function _upsertRow(ss, sheetName, idCol, rowArr) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(rowArr[idCol])) {
      sheet.getRange(i+1, 1, 1, rowArr.length).setValues([rowArr]);
      return;
    }
  }
  sheet.appendRow(rowArr);
}


function _res(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


⚠️  Set SYNC_TOKEN in GAS Project Settings → Script Properties before deploying. Use the same value in the PWA Settings → Sync Token field.


RESULT — What the App Does When Complete

✅  Loads crop_database.json + fertilizer_schedule.json from /public/data/ — no internet needed after first load
✅  Creates / updates / deletes crops and propagations locally in IndexedDB
✅  Calculates ALL dates: transplant, harvest, spray schedule, germination window, batch succession dates, fert stage windows — all from local JSON
✅  Generates all reminder types: germination check, transplant, harvest, spray×2, next_planting, true_leaf_check, fert_application — stored in IndexedDB
✅  Displays full fertilizer schedule: 4 stages, tea descriptions, mixing examples, yeast prep, thyme oil tip, application rules — all from fertilizer_schedule.json
✅  Runs learning system: logDeviation updates yourAverage, activates custom values after 3 samples
✅  Works 100% offline — service worker caches all assets including JSON databases
✅  Syncs to Google Sheets once a day — push all pending records to GAS Web App endpoint
✅  Telegram bot continues unchanged — reads same Sheet, sends all reminders via Telegram
✅  Weather still live from Open-Meteo with 1-hour localStorage cache

CropManager v9.13  ·  7,997 lines / 217 functions  ·  Spreadsheet ID: 1jA1Fpw27aPoO1wdz6Y0GWRGBgP1xp60wWKjWiMYgV38  ·  Saint Ann's Bay, Jamaica
