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
