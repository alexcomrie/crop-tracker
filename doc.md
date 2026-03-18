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
