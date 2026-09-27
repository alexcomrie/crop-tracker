# Codebase Analysis

This document provides an analysis of the Crop Manager application codebase.

## Overall Architecture

The project is a monorepo managed with pnpm workspaces. It consists of a frontend Progressive Web App (PWA) and a backend synchronization layer powered by Google Apps Script.

## Monorepo Structure

-   `artifacts/`:
    -   `api-server/`: (Legacy) Express.js backend, now deprecated in favor of direct GAS sync.
    -   `cropmanager-pwa/`: The main React PWA.
-   `lib/`: Shared type definitions and utilities.
-   `netlify/`: (Deprecated) Netlify Functions for sync proxying.

## Data Flow & Synchronization

The application follows a direct **offline-first** strategy.
1.  **Local Storage:** Data is stored in **Dexie (IndexedDB)** within the browser. Each record has a `syncStatus` ('pending' or 'clean').
2.  **Change Tracking:** When a user adds or edits data, the `syncStatus` is set to 'pending'.
3.  **Sync Process:**
    -   **Push:** The app collects all 'pending' records and sends them directly to the **GAS Web App** via `POST` with `application/x-www-form-urlencoded` to avoid CORS issues.
    -   **Pull:** The app fetches all data directly from the **GAS Web App** via `GET`.
4.  **Sync Security:** A hardcoded `SYNC_TOKEN` is used for basic authorization between the PWA and the GAS script.

## Summary

The Crop Manager application is a well-architected, modern web application. The frontend is a feature-rich PWA with offline capabilities and a direct synchronization mechanism with Google Apps Script. The architecture has been simplified to remove intermediary backend proxies, improving reliability and reducing configuration complexity.

# Recent Changes

-   **Architecture Simplification:** Removed the Netlify Function proxy and `api-server` proxy logic. The PWA now communicates directly with the Google Apps Script Web App.
-   **Configuration Hardcoding:** Hardcoded the Spreadsheet ID and GAS URL in `src/lib/config.ts`, removing the need for manual configuration in the Settings screen.
-   **Settings UI Update:** Removed GAS Sync Configuration fields from the Settings screen to simplify the user interface.
-   **Sync Protocol Update:** Updated `sync.ts` to use `application/x-www-form-urlencoded` for `POST` requests and `GET` for pulls, ensuring compatibility with GAS direct calls and avoiding CORS preflight issues.
-   **GAS Script Enhancement:** Updated the primary GAS script (`CropManager_FULL_v9_POLLING (1).gs`) to include a robust sync API with `doGet` and `doPost` handlers.
-   **PWA Icons & Manifest:** Updated icons to use [sprout.png](file:///c:/Users/ALEX/Desktop/Crop-Manager/file/sprout.png) and enhanced PWA manifest for Android installability.
-   **Offline Capabilities:** Implemented Dexie-based local storage and end-of-day auto-sync.
-   **CSV Import:** Added local CSV file import functionality for bulk data loading.
-   **Smart Learning Logic:** Implemented a "Smart Learning" system that tracks deviations between estimated and actual harvest dates. After 3 samples, the system automatically adjusts growth timeframes in the local database to provide more accurate estimates.
-   **Continuous Harvest Implementation:** Added support for crops that yield multiple harvests. Included a "Constant Harvest" toggle in the crop logging form and implemented a rolling batch planting logic that calculates future planting dates for 3 months ahead, complete with automated reminders.
-   **Navigation Restructuring:** Redesigned the main navigation to simplify the user experience. Renamed the "Calendar" tab to "More" and consolidated several advanced views (Crop Database, Fertilizer Database, Herbicide Schedule, and Reminders) into a new "More" menu, while keeping the Calendar accessible from within it.
-   **New Management Screens:** Developed dedicated management screens for the Crop Database (to edit default growth definitions), Fertilizer Database (to view/edit stage-based feeding profiles), and Herbicide Schedule (to log and track herbicide applications).
-   **TypeScript Type Alignment:** Updated `CropData` and `Crop` interfaces to ensure full compatibility with the Google Sheets layout and the local management screens, resolving property access errors.
-   **Telegram Learning Notifications:** Added automated Telegram alerts that notify the user when the Smart Learning engine has gathered enough data to override a crop's default growth timeframe.
-   **CSV Mapping Synchronization:** Updated the `Crop` CSV mapper in [sheets.ts](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/lib/sheets.ts) and the sync payload builder in [sync.ts](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/lib/sync.ts) to include the new `isContinuous` field, ensuring full alignment with the spreadsheet layout and preventing data loss during synchronization.
-   **Enhanced Database Management**: Completely re-implemented the Crop and Fertilizer database screens as high-fidelity slide-in panels within the "More" menu, following the project's native UI patterns.
-   **Direct JSON File Persistence**: Wired the new database screens to a custom API on the backend, enabling direct updates to `crop_database.json` and `fertilizer_schedule.json` from the UI.
-   **Crop Deletion**: Added a deletion feature to the Crop Tracker, allowing users to remove crops along with all their associated logs and reminders.
-   **Type Safety Cleanup**: Consolidated redundant TypeScript interfaces in `src/types/index.ts`, unifying `CropData` and `FertDatabase` structures across the application.
-   **Alias Resolution**: Implemented a `resolveCropData` utility in [cropDb.ts](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/lib/cropDb.ts) to correctly handle crop aliases (e.g. "Pepper" → "Sweet Pepper") in forms and reports.
-   **Robust Database Management**: Fixed over 100 TypeScript errors in the database management screens and tracking forms, ensuring full type safety for complex JSON structures and arithmetic calculations.
-   **Legacy Sync Cleanup**: Removed all references to the old Google Apps Script (GAS) sync, including the `syncStatus` field from all data models (`Crop`, `Propagation`, `Reminder`, etc.) and the "pending" indicator from the UI.
-   **Simplified Navigation**: Deleted `useSync` hook, `useSyncStore`, and `sync.ts` to reduce codebase complexity and remove redundant sync logic.
-   **Linear Crop Lifecycle**: Standardized the crop stage flow to a strict linear sequence: `Seed → Germinated → Seedling → Transplanted → Flowering → Ready to Harvest → Harvested`.
-   **Advanced Propagation Tracking**: Implemented a dedicated four-step lifecycle for cuttings and seeds being propagated: `Propagating → Callusing → Rooted → Potted / Transplanted`.
-   **Dashboard Redesign**: Overhauled the `DashboardScreen.tsx` and `WeatherWidget.tsx` to match the high-fidelity layout and color scheme of the `cropmanager (1).html` prototype, featuring sectioned task lists, overview stats, and a gradient-based weather card.
-   **Backup & Export**: Extracted and moved the JSON backup functionality to a new dedicated utility [backup.ts](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/lib/backup.ts) to ensure local data persistence remains available after removing the sync layer.

## New Updates (Local DB overrides, scheduling, history)

-   Local DB Persistence: Implemented local overrides for the reference databases. The loaders now read device-local overrides if present and fall back to bundled JSON:
    - Loader updates: [cropDb.ts](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/lib/cropDb.ts), [fertDb.ts](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/lib/fertDb.ts)
    - Save locally from UI: [CropDatabaseScreen.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/components/CropDatabaseScreen.tsx#L92-L110), [FertilizerDatabaseScreen.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/components/FertilizerDatabaseScreen.tsx#L103-L150)
    - App initialization uses loaders with overrides: [App.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/App.tsx#L26-L37)

-   Transplant Readjustment: Added automatic readjustment when a scheduled transplant date has passed and no transplant occurred:
    - Helper: [stages.ts](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/lib/stages.ts#L109-L123)
    - Hook usage: [CropsScreen.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/screens/CropsScreen.tsx#L24-L40)

-   Manual Progression Controls: Added tick/untick progression for Germinated / Transplanted / Harvested linked to the update form:
    - UI and logic: [UpdateCropForm.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/components/crops/UpdateCropForm.tsx#L1-L196)

-   History & Averages: New panel aggregates average days between stages per crop and shows average deviation versus database defaults (using stage logs):
    - Screen: [CropHistory.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/components/reports/CropHistory.tsx)
    - Navigation: [MoreScreen.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/screens/MoreScreen.tsx#L33-L101)
    - Calculation: Seed→Germ, Germ→Transplant, Transplant→Harvest from StageLog daysElapsed; deviations vs Crop DB defaults

-   Propagation Learns from Crop: Seed propagation windows now inherit germination min/max from the Crop DB when no custom adjustments exist:
    - Logic: [propagation.ts](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/lib/propagation.ts)
    - Form usage: [PropForm.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/components/props/PropForm.tsx#L44-L74)

-   Overdue Transplant Badge: Added a visible badge on crop cards when a scheduled transplant date is past and not yet done:
    - UI: [CropCard.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/components/crops/CropCard.tsx)

-   Notification Badge & Sound: Shows an app icon badge with today's task count and plays a short alert tone once per day when tasks are due:
    - Logic: [notifications.ts](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/lib/notifications.ts)
    - Integration: [DashboardScreen.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/screens/DashboardScreen.tsx)

-   Dashboard: Kept the original Today and Upcoming cards per the provided layout and removed the newly-added inline sheet views, aligning strictly with the prototype:
    - Integration: [DashboardScreen.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/screens/DashboardScreen.tsx)
    - Today card shows only today's tasks (not past-due backlog), Upcoming card shows future tasks inline

## New Panels (Herbicide & C‑H Calculator)

-   Herbicide Schedule (slide-in panel): Three-view experience (list, form, detail) matching the standalone prototype. Local component state with seed data for quick logging and outcome tracking.
    - Screen: [HerbicideScreen.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/components/herb/HerbicideScreen.tsx)
    - Navigation: [MoreScreen.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/screens/MoreScreen.tsx)
-   C‑H (Continuous Harvest) Calculator (slide-in panel): Two-step calculator reading directly from the in-memory Crop DB to produce batch offsets, plots, schedules, visual grid, and tips.
    - Screen: [CHCalculatorScreen.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/components/ch/CHCalculatorScreen.tsx)
    - Navigation: [MoreScreen.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/screens/MoreScreen.tsx)

### Fixes
-   Made Herbicide and C‑H panels vertically scrollable at the panel container level to prevent overflow on small screens:
    - Updates: [HerbicideScreen.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/components/herb/HerbicideScreen.tsx), [CHCalculatorScreen.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/components/ch/CHCalculatorScreen.tsx)

### Enhancements
-   Herbicide persistence: Herbicide entries now save to local IndexedDB and reload reliably. Storage uses the existing treatmentLogs table with structured metadata embedded in the notes field.
-   Stage updates with date: Stage changes support a user-selected date, not just “today”.
-   History tracker stages: Added a “Tracker Stages” section that lists stage updates for crops currently in the tracker.
-   Continuous harvest confirmation: Added “Confirm” action per upcoming batch in a crop’s detail to track planted batches using batchPlantingLogs without creating new crop records.
-   Refresh timings: Added a “Refresh Timings” action in the Crop Tracker to recompute transplant and harvest estimates for active crops from the current Crop DB.
-   Fail workflow: Added a “Mark as Failed” option in stage updates; failed crops are auto-removed after a few days by a background cleanup.

### Recent Fixes & Enhancements (Batch Confirmation & History)
-   **Refined Batch Confirmation**: The "Confirm" button for continuous harvest batches now only appears for the *next* upcoming batch once its scheduled planting date has arrived. Confirmed batches are clearly marked with a "Confirmed" badge.
-   Active Tracker History: The "Tracker Stages" section in the History & Averages panel now displays the specific number of days taken to reach each stage for all active crops in the tracker, presented in a clean vertical timeline.

### Recent UI/UX Enhancements (Responsive Layouts)
-   **Mobile-Optimized Crop Database**: The Crop Database screen now features a fully responsive design. On mobile portrait mode, the interface intelligently switches between the crop list and the details editor, ensuring a comfortable editing experience on small screens without requiring landscape rotation. Added dedicated "Save" and "Export" actions to the mobile sidebar for easier data management.
-   **Consistent Navigation**: Standardized the header and back-button behavior across all management screens, ensuring a predictable user journey when navigating between lists and detailed views.

### Install & Persistence Enhancements
-   **Single App Across URLs**: Added a stable PWA identity by setting `manifest.id` to a constant value in the Vite PWA config ([vite.config.ts](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/vite.config.ts#L20-L35)). This ensures installs from different web addresses consolidate into one app instance on supported platforms.
-   **Storage Persistence**: The app now requests persistent storage on startup to reduce the risk of the browser evicting local data ([App.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/App.tsx#L30-L44)).
-   **JSON Restore Path**: Added a JSON backup importer in Data Management to restore local data on any installation, even from a different URL origin:
    - Importer: [backup.ts](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/lib/backup.ts)
    - UI: [DataManagement.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/components/settings/DataManagement.tsx)
    - Export remains available to create portable backups

### Continuous Harvest & Grafting Enhancements
- **Enhanced C-H Calculation in Forms**: Integrated the logic from the C-H Calculator directly into the [CropForm.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/components/crops/CropForm.tsx). When "Continuous Production" is enabled, users can now select their desired harvest frequency (7, 14, 21, or 28 days). The form dynamically displays the number of plots needed and the days between plantings based on the specific crop's growing and harvest duration.
- **Dynamic Batch Confirmation & Cloning**: Updated the "Confirm" action in [CropDetail.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/components/crops/CropDetail.tsx) to create a new, independent crop record for each confirmed batch. The new crop is automatically named with its batch number (e.g., "Tomato [Batch 2]") and inherits all relevant properties from the original crop.
- **Batch Promotion Workflow**: Implemented a "Queue-based" promotion system in [stages.ts](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/lib/stages.ts). When the original crop in a continuous series is harvested, it is removed from the tracker, and the next confirmed batch is automatically promoted to be the new "Original" crop, with subsequent batches shifting up in the sequence.
- **C-H Batch Badges**: Added visual badges to [CropCard.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/components/crops/CropCard.tsx) that show which batches have been confirmed for a specific crop series.
- **Grafting & Healing Status**: Added dedicated "Grafting" and "Healing" stages for vine family crops (Watermelon, Melon, Pumpkin, Cucumber, etc.) in [stages.ts](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/lib/stages.ts). When a crop enters the Grafting stage, its status is automatically updated to "Healing" to reflect its recovery period. Fixed an issue where these stages were missing for existing seedling-stage crops and improved vine family detection using both name and plant type.
- **Existing Crop Migration**: Added an automatic migration in [App.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/App.tsx) to ensure existing continuous crops in the tracker are updated with the new `harvestFrequency` and `batchOffset` fields.

### Manual Batch Recovery
- **Clickable Batch Badges**: Added a manual recovery path in [CropDetail.tsx](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/components/crops/CropDetail.tsx). If a batch was confirmed but the clone wasn't created (e.g., due to an error or manual deletion), the batch number in the details card becomes clickable. Clicking it will manually trigger the cloning process.
- **Batch Status Visibility**: Added "Created" badges to the batch schedule list to clearly distinguish between batches that are merely confirmed and those that have active crop records in the tracker.
- **Inherited Batch Metadata**: Batch clones now inherit all C-H attributes (frequency, plot count, offset) from the parent crop, ensuring they maintain the correct continuous harvest schedule.
- **C-H Refresh Trigger**: The "Refresh Timings" button in the Crop Tracker now also recalculates the Continuous Harvest logic for existing crops, allowing legacy records to adopt the latest calculation improvements.

### Stability & Performance
-   **Dexie Schema Optimization**: Updated the [schema.ts](file:///c:/Users/ALEX/Desktop/Crop-Manager/artifacts/cropmanager-pwa/src/db/schema.ts) to version 2, adding `isContinuous` and `parentCropId` to the `crops` table index. This resolved a critical "blank screen" issue caused by calling `.where()` on non-indexed fields, ensuring smooth performance and reliable data retrieval for continuous harvest tracking.

## Overhaul: IndexedDB Crash Fixes, Crop Management Upgrade & Full-App Audit

### IndexedDB crash fixes (root cause: booleans/nullable fields in indexes)
-   IndexedDB rejects booleans, null and undefined as index keys. Three indexed boolean fields caused `DataError: Data provided to an operation does not meet requirements` and `Failed to execute 'bound' on 'IDBKeyRange'` crashes: `reminders.sent`, `posInventory.isActive`, `crops.isContinuous`. All three were removed from their index strings; queries that used them (`where('sent')`, `where('isContinuous')`) were converted to in-memory filters. Boolean `sent`/`isActive`/`isContinuous` values are still stored on records — only the indexes changed.
-   `parentCropId` was queried (`stages.ts promoteNextBatch`) but not indexed (`SchemaError` at runtime) — added to the `crops` index, and the `parentCropId: undefined` write was changed to `''`.
-   Also removed nullable/optional fields from indexes: `activities.reminderDate`, `posSales.customerId`, `posOrders.deliveredAt`.
-   Database renamed to `CropManagerDB_v4` (fresh start, no stale boolean-indexed schema lingers); new `trackings` table added via additive Dexie `version(2)` migration.
-   Reminder `sendDate` queries guard against `undefined` via `.above('')` plus JS-side checks; `makeReminder` coerces invalid dates to `''` so `undefined` never reaches a key range.

### API server hardening (`artifacts/api-server/src`)
-   `routes/data.ts`: request body shape validation (400 on non-objects), `mkdir -p` for the data dir, atomic tmp-file + rename writes (no more interleaved/corrupt JSON on concurrent saves).
-   `routes/sync.ts`: 15s abort timeout on GAS proxy calls; distinct timeout vs non-JSON vs push/pull failure messages; payload shape check on push.
-   `app.ts`: exact-origin CORS matching (plus Netlify deploy-preview pattern) instead of prefix matching; JSON 404 + JSON error envelope middleware.
-   `index.ts`: defaults to port 5001 with a warning instead of crashing when `PORT` is missing.

### Crop details restructuring (`CropDetailsScreen.tsx`)
-   Removed the standalone Notes tab; each of Observations, Treatments and Harvest now has its own Notes editor at the bottom (shared `crop.notes` field, no schema change).
-   Treatments are multi-select (fertilizer/pest/fungus toggles, one log per selected type sharing date/product), with a date selector defaulting to today and a per-entry notes field (previously hardcoded `''`).
-   New Growth Tracking section in Observations: per-fruit maturation trackings with label, physical tag number, start date (defaults today, backdatable) and notes. Cards show start date + elapsed days only — no guessed maturity. Finishing a tracking logs actual days into a `fruit_maturity_days` scalar adjustment; once 2+ fruits are tracked the UI shows the learnt average ("Learned maturity: ~Nd from N fruits").
-   Milestone bar kept scrollable with a scroll-fade affordance; per-crop Manual Hold toggle pauses all automatic writes for hand-entered histories; catch-up hint appears for crops planted >30 days ago with no stage history.
-   All write handlers wrapped in step-labeled try/catch with toasts.

### C-H Calculator autonomy + Succession Gap Tinygpt wiring
-   `CHCalculatorScreen.tsx` now consumes personal DB overrides (≥2 samples), `cropDbAdjustments` averages, and Tinygpt `predictBatchOffsetDays` (micro 4–59d wins, else foundation, else computed). Foundation values stay displayed; schedules/grids use effective values; learned badge + per-source rows shown.
-   `SuccessionGapReport.tsx` rebuilds weeks from hybrid `getPredictedHarvestDate` per crop (micro 70/30 blend with scalar fallback), falling back to stored estimates; Tinygpt-adjusted badge when the model contributes.

### Archive flow
-   Crop list has Archive select mode (checkboxes, count, bottom action bar) writing `status: 'Archived'`; new `/crops/archive` route + `ArchivedCropsScreen` with per-crop Restore; `useCrops('Archived')`; main list and stage filters exclude archived.

### Dashboard overhaul (`DashboardScreen.tsx`)
-   Overview tiles replaced by two badges: 🌱 active-crop count (→ crops list) and 🔔 today+upcoming count (→ reminders).
-   Today + Upcoming merged into one Tasks card (tappable today rows pinned, dated future rows below).
-   Succession moved to a real More → Planning route (`/more/succession`); DB-entries count moved to Settings → Data Management.

### Unified layout + navigation
-   Removed duplicate in-screen back headers (details/create/archive); TopBar owns all navigation with dynamic titles; Herbicide + Reminders moved to `PanelPage`; all screens standardized on `min-h-screen bg-gray-50 pb-24 pt-2`; hardcoded `navigate('/crops…')` strings replaced with `ROUTES.*`; BottomNav/Drawer highlight parent tabs on sub-routes; aria-labels on icon buttons.

### Backup, dates, learning, performance
-   `backup.ts`: exports all 25 tables (was 16), version 7 with validation, single-transaction all-or-nothing restore with `bulkPut` upserts.
-   Fixed "delete diary older than 1 year" (was comparing `dd-MMM-yyyy` against ISO lexicographically — deleted everything); now compares timestamps.
-   New `formatDateStored()` (never emits the `'N/A'` sentinel) used at all DB write sites; `toInputDateStr`/`fromInputDateStr` converters unify all date inputs; reminder comparisons/sorts are chronological (timestamps), not lexicographic.
-   Single learning-threshold constants (`SCALAR_CUSTOM_SAMPLES=3`, `PERSONAL_OVERRIDE_SAMPLES=2`, `MICRO_TRAIN_MIN_DOCS=4`); keep-best-model by `finalLoss`; hybrid model deserialization cached per refresh; dataset cropDb lookups hoisted to a Map; personal-DB key trim mismatch fixed; Data Management clear wipes all tables including learned state.
-   `autoUpdateService` reads the store directly and delegates batch math to canonical `lib/continuous.ts` (also reused by the create wizard); batch promotion runs in one transaction; calendar day cells use an O(1) date map; Diary/Sales/Orders/Receipts/Activity lists capped.
-   Ledger bulk import parses via Papa (quoted CSV safe) with a single `bulkAdd`; `getEffectiveCropData` fallback centralized in `resolveEffectiveCropData()`.

### Forms, mobile, PWA, state, errors
-   Validation toasts replace silent returns/`alert()` in create/details/reminders/props/herbicide/ledger; fixed vanishing custom-variety input; added missing plot-area input; Settings numbers can't become `NaN`.
-   Uniform FAB safe-area offsets; 36px action buttons; pinch-zoom re-enabled; install meta tags; workbox `cacheId` + outdated-cache cleanup; data JSON excluded from precache; manifest scope/start honour `BASE_PATH`.
-   Shared `EmptyState` component; `effectiveData` and personal list are live queries (no stale mirrors); Settings form resyncs from store; step-labeled try/catch on all touched write paths.
-   Removed `// @ts-nocheck` from `CropDetailsScreen`; enabled `strict` + `noUnusedLocals` for the PWA and cleared all resulting errors; deleted dead `CropForm`/`CropDetail`/`UpdateCropForm`/`herb/HerbicideScreen` + 8 dead `ui/*` files; pruned 17 unused deps from `package.json` (run `pnpm install` to prune `node_modules`/lockfile).

### Area Mapper integrity slice
-   Manual sketches anchored to real land GPS bounds (previously persisted fake canvas-degrees → absurd areas + ocean pins); drag-edits recalc area; GPS fixes rougher than ±25m are shown but never recorded, with permission-specific errors; single ref-owned watch (no double-subscribe); navigation confirms before discarding unsaved points; delete resets orphaned selection; plot tags are max+1 (no reuse); spacing standardized to cm; uniform meter-based projection shared between SVG/Leaflet with exact inverse; tap-to-select + vertex drag on touch; pan-end clicks no longer misfire; land GPS re-walk mode wired; GeoJSON import validated with pre-allocated tags + single bulk write; crop linking supports move-between-plots with `updatedAt` and per-row state.

### Update-time legacy migration (`migrateLegacy.ts`)
-   Older app versions stored everything under IndexedDB databases named `CropManagerDB` (all releases), `CropManagerDB_v2` or `CropManagerDB_v3` (intermediate builds); current code opens `CropManagerDB_v4`, so an update would strand existing data. On startup, `migrateLegacyDatabases()` (`src/lib/migrateLegacy.ts`, wired in `App.tsx` before the auto-update service starts) checks each legacy name via `Dexie.exists`, reads every known table through the native IndexedDB API (no old-schema knowledge needed), normalizes each record to the current format, and upserts via `bulkPut` (idempotent, safe to re-run).
-   Normalization per table: crops get a valid status (`Active` fallback), non-empty `plantStage`, `parentCropId: ''` instead of undefined (indexed field), boolean-coerced `isContinuous`; propagations get default status; reminders get string `sendDate` (`''` fallback) and boolean `sent`; all dated logs get string dates; `personalCropDb` keys are lowercased/trimmed with numeric fallbacks; records missing a primary key receive a `MIG_<table>_<ts>_<i>` fallback id instead of being dropped.
-   Runs once per device (`cropmanager_legacy_migrated_v4` flag); verifies per-table row counts and only then deletes the legacy database; never crashes startup (all failures are caught and logged).
