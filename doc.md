
# Codebase Analysis

This document provides an analysis of the Crop Manager application codebase.

## Overall Architecture

The project is a monorepo managed with pnpm workspaces. It consists of a frontend Progressive Web App (PWA), a backend API server, and several shared libraries. The codebase is well-structured and follows modern development practices.

## Monorepo Structure

The monorepo is organized as follows:

-   `artifacts/`: Contains the deployable applications.
    -   `api-server/`: The backend Express.js application.
    -   `cropmanager-pwa/`: The frontend React PWA.
    -   `mockup-sandbox/`: A sandbox for UI component development.
-   `lib/`: Contains shared libraries used by the applications.
    -   `api-client-react/`: A React Query-based API client generated from the OpenAPI specification.
    -   `api-spec/`: The OpenAPI specification for the backend API.
    -   `api-zod/`: Zod schemas generated from the OpenAPI specification.
    -   `db/`: The database schema, defined using Drizzle ORM.
-   `scripts/`: Contains various scripts for the project.

## Backend (`api-server`)

The backend is an Express.js application written in TypeScript.

-   **Framework:** Express.js
-   **Dependencies:**
    -   `drizzle-orm`: A TypeScript ORM for database access.
    -   `@workspace/db`: The local database schema package (currently empty).
    -   `@workspace/api-zod`: The local Zod schemas package for API validation.
    -   `cors`, `cookie-parser`: Standard Express middleware.
-   **API:**
    -   The API is prefixed with `/api`.
    -   It currently has a single health check endpoint at `GET /api/healthz`.
-   **Build:** The application is built using a custom `build.ts` script and run with `tsx`.

## Frontend (`cropmanager-pwa`)

The frontend is a Progressive Web App (PWA) built with React and Vite.

-   **Framework:** React, Vite
-   **UI:**
    -   **Radix UI:** For unstyled, accessible components.
    -   **Tailwind CSS:** For styling.
    -   `lucide-react`: For icons.
-   **State Management:**
    -   **Zustand:** For global state management and persistent settings.
    -   **TanStack Query:** For managing server state.
    -   **Dexie (IndexedDB):** For local data storage, enabling offline functionality.
-   **Forms:**
    -   **React Hook Form:** For form management.
    -   **Zod:** For form validation.
-   **Routing:** **Wouter** (for simple routing) and **React Router Dom**.
-   **PWA:** The application is configured as a PWA using `vite-plugin-pwa`, allowing for offline functionality and installation on user devices.
-   **API Client:** It uses a generated React Query client from the `@workspace/api-client-react` package to communicate with the backend.
-   **Synchronization:**
    -   The app features a robust sync logic with a Google Apps Script (GAS) web app.
    -   It builds payloads from local Dexie data and pushes them to GAS, or pulls updates from GAS to refresh the local database.
-   **Offline Storage:** Extensively uses `dexie` for storing crops, propagations, reminders, and logs.

## Shared Libraries

The shared libraries promote code reuse and consistency between the frontend and backend.

-   **`api-spec`:**
    -   Defines the API contract using the **OpenAPI 3.1.0** specification.
    -   This file is the single source of truth for the API design.
-   **`orval.config.ts`:**
    -   Uses **Orval** to generate code from the OpenAPI specification.
    -   Generates a React Query-based API client (`api-client-react`).
    -   Generates Zod schemas for validation (`api-zod`).
-   **`db`:**
    -   Defines the database schema using **Drizzle ORM**.
    -   The schema is currently a placeholder and needs to be defined to support backend storage.

## Summary

The Crop Manager application is a well-architected, modern web application. The use of a monorepo, OpenAPI, and code generation tools like Orval demonstrates a commitment to code quality, maintainability, and developer efficiency. The frontend is a feature-rich PWA with offline capabilities and a sophisticated synchronization mechanism with Google Apps Script. The backend is a solid foundation for a scalable API, currently awaiting database schema implementation to complement the frontend's capabilities.

# Changes

- Installed all necessary dependencies using `pnpm install`.
- Configured the backend to run on port 5001 and the frontend on port 5000.
- Updated the frontend proxy to point to the backend on port 5001.
- Added `cross-env` to ensure cross-platform compatibility for setting environment variables.
- Created a `.env` file in the `cropmanager-pwa` directory to set the `PORT` and `BASE_PATH` environment variables.
- Analyzed the PWA synchronization logic with Google Apps Script and local storage using Dexie.
- Verified the monorepo structure and shared library generation workflow.
- Enhanced PWA installability for Android devices by adding meta tags to `index.html`.
- Implemented a custom `usePWAInstall` hook and added an "Install App" button in the Settings screen.
- Configured `netlify.toml` for monorepo PWA deployment, targeting `artifacts/cropmanager-pwa/dist`.
- Pushed all changes to the GitHub repository: `https://github.com/alexcomrie/crop-tracker.git`.
- Resolved a critical TypeScript syntax error in `scripts/src/hello.ts` that was causing Netlify build failures (TS1005).
- Verified that the workspace `pnpm run typecheck` passes successfully after the fix.
- Synchronized local environment with the latest changes from the GitHub repository (`https://github.com/alexcomrie/crop-tracker.git`).
- Resolved merge conflicts in `artifacts/mockup-sandbox/vite.config.ts` to maintain robust build configurations and project structure.
- Successfully performed a full workspace build (`pnpm install && pnpm run build`), confirming that all packages (PWA, API Server, Mockup Sandbox, and Scripts) are building correctly.
- Configured synchronization with Google Apps Script (GAS) by updating the default settings in `useAppStore.ts` and the `.env` file with the provided Spreadsheet ID, Web App URL, and Sync Token.
- Enhanced the `SettingsScreen` to automatically fill the GAS Sync Configuration from environment variables if the fields are empty and added a "Load from Env" button for easy configuration.
- Replaced default PWA icons with the custom [sprout.png](file:///c:/Users/ALEX/Desktop/Crop-Manager/file/sprout.png).
- Implemented an offline-first storage strategy using **Dexie (IndexedDB)** for local device data persistence.
- Added an **End-of-Day Auto-Sync** feature in the `TopBar` that triggers synchronization at the configured hour if the device is online.
- Integrated a status indicator in the `TopBar` showing pending records and offline status for better user awareness.
- Implemented **CSV Data Import** functionality, allowing users to upload local CSV files. The imported data is stored in the local Dexie database and automatically queued for synchronization with Google Apps Script (GAS).
- Fixed a Vite build error by correctly installing `papaparse` and `uuid` as direct dependencies in the `cropmanager-pwa` package.
- Updated PWA synchronization logic in `src/lib/sync.ts` to use local API proxy endpoints (`/api/sync/push`, `/api/sync/pull`, `/api/sync/health`) instead of direct Google Apps Script URL calls, centralizing communication through the Express backend.
- Updated PWA synchronization logic in `src/lib/sync.ts` to use local API proxy endpoints (`/api/sync/push`, `/api/sync/pull`, `/api/sync/health`) instead of direct Google Apps Script URL calls, centralizing communication through the Express backend.
- Configured the backend `api-server` to properly load environment variables using `dotenv`.
- Updated backend route registration to ensure `/api/sync/*` and `/api/healthz` endpoints are correctly exposed and operational.
- Verified that the backend successfully proxies requests to Google Apps Script, resolving initial "Cannot GET" and 503 errors.
- Updated root `netlify.toml` with optimized build configurations for the PWA monorepo, specifying the base directory, build command, and publish directory.
- Configured Netlify redirects to route `/api/sync/*` requests to Netlify Functions and established a SPA fallback to `index.html`.
- Implemented a serverless Netlify Function at `netlify/functions/sync.mts` to proxy synchronization requests from the PWA to Google Apps Script, resolving CORS issues and centralizing sync logic.
- Installed `@netlify/functions` in the workspace root to resolve TypeScript declaration errors in the serverless function.
- Updated root `netlify.toml` with corrected `publish` and `functions` paths relative to the PWA `base` directory, resolving build and deploy directory errors.
- Updated PWA `sync.ts` to include the `action` field in requests, ensuring compatibility with the Netlify Function proxy.
