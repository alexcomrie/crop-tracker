// netlify/functions/sync.mts
// Proxies /api/sync/* requests from the PWA to GAS.
// Same domain as croptrac.netlify.app → zero CORS.
// GAS is called server-side → zero CORS on that side too.

import type { Context } from "@netlify/functions";

const GAS_URL   = process.env["GAS_SYNC_URL"]   ?? "";
const GAS_TOKEN = process.env["GAS_SYNC_TOKEN"] ?? "";

export default async function handler(req: Request, _ctx: Context): Promise<Response> {
  const cors = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type":                 "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (!GAS_URL || !GAS_TOKEN) {
    return new Response(
      JSON.stringify({ success: false, error: "GAS_SYNC_URL / GAS_SYNC_TOKEN not set in Netlify env vars" }),
      { status: 503, headers: cors }
    );
  }

  // ── GET → health check ──────────────────────────────────────────────────
  if (req.method === "GET") {
    try {
      const gasRes = await fetch(GAS_URL);
      const text   = await gasRes.text();
      return new Response(text, { status: 200, headers: cors });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, error: "GAS unreachable: " + err.message }),
        { status: 502, headers: cors }
      );
    }
  }

  // ── POST → push or pull ─────────────────────────────────────────────────
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: cors }
    );
  }

  let body: { token?: string; action?: string; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid JSON body" }),
      { status: 400, headers: cors }
    );
  }

  // Validate token against our env var
  if (!body.token || body.token !== GAS_TOKEN) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized — invalid token" }),
      { status: 401, headers: cors }
    );
  }

  // Forward to GAS
  try {
    const gasRes = await fetch(GAS_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        token:   GAS_TOKEN,
        action:  body.action,   // "push" or "pull"
        payload: body.payload,  // present for push, undefined for pull
      }),
    });
    const text = await gasRes.text();
    return new Response(text, { status: 200, headers: cors });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: "GAS unreachable: " + err.message }),
      { status: 502, headers: cors }
    );
  }
}

// Matches all three PWA calls:
//   GET  /api/sync/health  → health check
//   POST /api/sync/push    → push pending records
//   POST /api/sync/pull    → pull all sheet data
export const config = {
  path: ["/api/sync", "/api/sync/*"],
};
