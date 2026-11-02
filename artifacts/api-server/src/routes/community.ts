import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

router.get("/status", (_req: Request, res: Response) => {
  const enabled = (process.env["COMMUNITY_ENABLED"] || "").toLowerCase() === "true";
  res.json({ success: true, data: { communityEnabled: enabled } });
});

export default router;
