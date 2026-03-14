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
