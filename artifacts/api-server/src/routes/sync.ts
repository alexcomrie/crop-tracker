import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const GAS_SYNC_URL = process.env["GAS_SYNC_URL"] || "";
const GAS_SYNC_TOKEN = process.env["GAS_SYNC_TOKEN"] || "";

/**
 * GET /api/sync/health
 * Proxies the GAS health check so the PWA can confirm the endpoint is live.
 */
router.get("/sync/health", async (_req: Request, res: Response) => {
  if (!GAS_SYNC_URL) {
    res.status(503).json({ success: false, error: "GAS_SYNC_URL not configured on server" });
    return;
  }
  try {
    const gasRes = await fetch(GAS_SYNC_URL, { method: "GET" });
    const data = await gasRes.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, error: "GAS unreachable: " + err.message });
  }
});

/**
 * POST /api/sync/push
 * Body: { token: string, payload: { crops: [], reminders: [], ... } }
 * Validates the token, then forwards the payload to GAS as a push action.
 * The server makes the GAS call — no CORS issue.
 */
router.post("/sync/push", async (req: Request, res: Response) => {
  if (!GAS_SYNC_URL || !GAS_SYNC_TOKEN) {
    res.status(503).json({ success: false, error: "GAS_SYNC_URL or GAS_SYNC_TOKEN not configured on server" });
    return;
  }

  const { token, payload } = req.body;

  if (!token || token !== GAS_SYNC_TOKEN) {
    res.status(401).json({ success: false, error: "Unauthorized — invalid token" });
    return;
  }

  try {
    const gasRes = await fetch(GAS_SYNC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: GAS_SYNC_TOKEN, action: "push", payload }),
    });
    const data = await gasRes.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, error: "GAS unreachable: " + err.message });
  }
});

/**
 * POST /api/sync/pull
 * Body: { token: string }
 * Pulls all sheet data from GAS and returns it to the PWA.
 */
router.post("/sync/pull", async (req: Request, res: Response) => {
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
    const gasRes = await fetch(GAS_SYNC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: GAS_SYNC_TOKEN, action: "pull" }),
    });
    const data = await gasRes.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ success: false, error: "GAS unreachable: " + err.message });
  }
});

export default router;