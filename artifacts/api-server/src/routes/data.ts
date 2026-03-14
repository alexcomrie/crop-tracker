import { Router, type IRouter, type Request, type Response } from "express";
import fs from "fs/promises";
import path from "path";

const router: IRouter = Router();

// Paths to the JSON files in the PWA's public/data directory
// Note: In a production monorepo, these would be absolute or relative to the workspace root
const PWA_DATA_DIR = path.resolve(__dirname, "../../../cropmanager-pwa/public/data");
const CROP_DB_PATH = path.join(PWA_DATA_DIR, "crop_database.json");
const FERT_DB_PATH = path.join(PWA_DATA_DIR, "fertilizer_schedule.json");

/**
 * POST /api/data/crop-db
 * Updates the crop_database.json file
 */
router.post("/crop-db", async (req: Request, res: Response) => {
  try {
    const data = req.body;
    await fs.writeFile(CROP_DB_PATH, JSON.stringify(data, null, 2), "utf-8");
    res.json({ success: true, message: "Crop database updated" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/data/fert-db
 * Updates the fertilizer_schedule.json file
 */
router.post("/fert-db", async (req: Request, res: Response) => {
  try {
    const data = req.body;
    await fs.writeFile(FERT_DB_PATH, JSON.stringify(data, null, 2), "utf-8");
    res.json({ success: true, message: "Fertilizer database updated" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
