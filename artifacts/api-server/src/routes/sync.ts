import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const GAS_SYNC_URL = process.env["GAS_SYNC_URL"] || "";
const GAS_SYNC_TOKEN = process.env["GAS_SYNC_TOKEN"] || "";
const GAS_TIMEOUT_MS = 15000;

async function fetchGasJson(url: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GAS_TIMEOUT_MS);
  try {
    const gasRes = await fetch(url, { ...init, signal: controller.signal });
    const text = await gasRes.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`GAS returned non-JSON response (status ${gasRes.status})`);
    }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`GAS request timed out after ${GAS_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /api/sync/health
 * Proxies the GAS health check so the PWA can confirm the endpoint is live.
 */
router.get("/health", async (_req: Request, res: Response) => {
  if (!GAS_SYNC_URL) {
    res.status(503).json({ success: false, error: "GAS_SYNC_URL not configured on server" });
    return;
  }
  try {
    const data = await fetchGasJson(GAS_SYNC_URL, { method: "GET" });
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, error: "GAS unhealthy: " + err.message });
  }
});

/**
 * POST /api/sync/push
 * Body: { token: string, payload: { crops: [], reminders: [], ... } }
 * Validates the token, then forwards the payload to GAS as a push action.
 * The server makes the GAS call — no CORS issue.
 */
router.post("/push", async (req: Request, res: Response) => {
  if (!GAS_SYNC_URL || !GAS_SYNC_TOKEN) {
    res.status(503).json({ success: false, error: "GAS_SYNC_URL or GAS_SYNC_TOKEN not configured on server" });
    return;
  }

  const { token, payload } = req.body;

  if (!token || token !== GAS_SYNC_TOKEN) {
    res.status(401).json({ success: false, error: "Unauthorized — invalid token" });
    return;
  }

  if (payload !== undefined && (typeof payload !== "object" || payload === null)) {
    res.status(400).json({ success: false, error: "Payload must be an object" });
    return;
  }

  try {
    const data = await fetchGasJson(GAS_SYNC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: GAS_SYNC_TOKEN, action: "push", payload }),
    });
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, error: "GAS push failed: " + err.message });
  }
});

/**
 * POST /api/sync/pull
 * Body: { token: string }
 * Pulls all sheet data from GAS and returns it to the PWA.
 */
router.post("/pull", async (req: Request, res: Response) => {
  if (!GAS_SYNC_URL || !GAS_SYNC_TOKEN) {
    res.status(503).json({ success: false, error: "GAS_SYNC_URL or GAS_SYNC_TOKEN not configured on server" });
    return;
  }

  const { token } = req.body;

  if (!token || token !== GAS_SYNC_TOKEN) {
    res.status(401).json({ success: false, error: "Unauthorized — invalid token" });
    return;
  }

  try {
    const data = await fetchGasJson(GAS_SYNC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: GAS_SYNC_TOKEN, action: "pull" }),
    });
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, error: "GAS pull failed: " + err.message });
  }
});

export default router;
