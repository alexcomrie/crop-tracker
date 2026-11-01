# Google Sheet setup for CropManager

CropManager keeps its shared data (treatment database, community) in a Google
Sheet that is served through a Google Apps Script (GAS) web app. The PWA and the
Express API server both talk to that single GAS endpoint.

## 1. Create the spreadsheet

1. Go to <https://sheets.google.com> and create a new blank spreadsheet.
2. Name it **CropManager Data** (or anything you like).
3. Create the following tabs (sheet names are case-sensitive and must match the
   GAS code):

   | Tab name            | Purpose                                                |
   |---------------------|--------------------------------------------------------|
   | `Treatments`        | Shared treatment / product database                    |
   | `CommunityPosts`    | Community posts                                        |
   | `CommunityComments` | Comments and replies                                   |
   | `CommunityLikes`    | Like counts per post                                   |
   | `Farmers`           | Optional farmer directory (name, ID, farm)             |

4. In `Treatments`, add a header row with these columns (order does not matter,
   the GAS normaliser reads by header name):

   `id, name, category, classification, activeIngredient, crops, targets, reiHours, phiDays, guide, warnings, imageUrl, rates, notes, updatedAt`

   `rates` is a JSON array, e.g.
   `[{"label":"Standard","min":10,"max":20,"unit":"mL","perVolume":3.8,"perVolumeUnit":"L"}]`

   `crops` and `targets` are comma-separated lists.

## 2. Deploy the Apps Script

1. In the spreadsheet choose **Extensions → Apps Script**.
2. Replace the default `Code.gs` with the implementation in
   `docs/the-hub-gas-implementation.md`.
3. Set the script properties (Project Settings → Script properties):
   - `ADMIN_TOKEN` — a long random string. This is the same value you put in
     `TREATMENT_ADMIN_TOKEN` / `GAS_SYNC_TOKEN` on the server.
4. Deploy as a web app:
   - **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (the PWA calls it without a Google login)
   - Copy the **Web app URL** — this is your `GAS_SYNC_URL` / `TREATMENT_DB_URL`.

## 3. Point CropManager at it

In `artifacts/api-server/.env`:

```
GAS_SYNC_URL=https://script.google.com/macros/s/XXXX/exec
GAS_SYNC_TOKEN=your-admin-token
TREATMENT_DB_URL=https://script.google.com/macros/s/XXXX/exec?action=treatments
TREATMENT_ADMIN_TOKEN=your-admin-token
COMMUNITY_API_URL=https://script.google.com/macros/s/XXXX/exec
```

The PWA reads `VITE_COMMUNITY_API_URL` (set in the PWA env) for the community
endpoint and `VITE_TREATMENT_API` for the treatment endpoint.

## 4. Daily sync

- Treatment database: cached for 24 h on both the server (`/api/treatment-db`)
  and in the browser. Tap **Refresh** in the Treatment Database screen to force
  a sync.
- Community: posts/comments/likes are read live from the sheet on each screen
  load; the GAS endpoint enforces the weekly posting limits server-side.

## 5. Images (Google Drive)

Product photos are stored in Google Drive and referenced by a direct link in the
`imageUrl` column:

```
https://drive.google.com/uc?export=view&id=FILE_ID
```

The PWA caches them through the service worker (CacheFirst, 30 days) so they
keep working offline.
