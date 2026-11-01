import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const TREATMENT_DB_URL = process.env["TREATMENT_DB_URL"] || "";
const TREATMENT_ADMIN_TOKEN = process.env["TREATMENT_ADMIN_TOKEN"] || process.env["GAS_SYNC_TOKEN"] || "";
const CACHE_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 15000;

let cache: { data: unknown; fetchedAt: number } | null = null;

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`Remote sheet returned HTTP ${res.status}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Remote sheet did not return JSON");
    }
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error(`Remote sheet timed out after ${TIMEOUT_MS}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /api/treatment-db
 * Returns the shared treatment database from the Google Sheet / GAS endpoint
 * configured in TREATMENT_DB_URL. The server caches for 24 hours, matching the
 * PWA's daily sync, so the sheet is not hit on every app launch.
 */
router.get("/", async (req: Request, res: Response) => {
  if (!TREATMENT_DB_URL) {
    res.status(503).json({
      success: false,
      error: "TREATMENT_DB_URL is not configured. The app will use its bundled treatment_database.json.",
    });
    return;
  }

  const fresh = req.query["fresh"] === "1";
  if (!fresh && cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    res.json({ success: true, cached: true, fetchedAt: cache.fetchedAt, data: cache.data });
    return;
  }

  try {
    const raw = await fetchJson(TREATMENT_DB_URL, { headers: { Accept: "application/json" } });
    const data = raw && typeof raw === "object" && "data" in (raw as Record<string, unknown>)
      ? (raw as Record<string, unknown>).data
      : raw;
    cache = { data, fetchedAt: Date.now() };
    res.json({ success: true, cached: false, fetchedAt: cache.fetchedAt, data });
  } catch (err: any) {
    if (cache) {
      res.json({ success: true, cached: true, stale: true, fetchedAt: cache.fetchedAt, data: cache.data, error: err.message });
      return;
    }
    res.status(502).json({ success: false, error: `Treatment database sync failed: ${err.message}` });
  }
});

/**
 * POST /api/treatment-db
 * Optional admin push to the GAS endpoint. Requires the same token used by the
 * sync route. Body: { token: string, entries: [...] }
 */
router.post("/", async (req: Request, res: Response) => {
  if (!TREATMENT_DB_URL || !TREATMENT_ADMIN_TOKEN) {
    res.status(503).json({ success: false, error: "Treatment database sync is not configured" });
    return;
  }
  const { token, entries } = req.body ?? {};
  if (!token || token !== TREATMENT_ADMIN_TOKEN) {
    res.status(401).json({ success: false, error: "Unauthorized — invalid token" });
    return;
  }
  if (!Array.isArray(entries)) {
    res.status(400).json({ success: false, error: "entries must be an array" });
    return;
  }
  try {
    const data = await fetchJson(TREATMENT_DB_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: TREATMENT_ADMIN_TOKEN, action: "replace", payload: { entries } }),
    });
    cache = null;
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, error: `Treatment database push failed: ${err.message}` });
  }
});

export default router;
