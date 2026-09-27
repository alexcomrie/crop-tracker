import { Router, type IRouter, type Request, type Response } from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router: IRouter = Router();

// Paths to the JSON files in the PWA's public/data directory
// Note: In a production monorepo, these would be absolute or relative to the workspace root
const PWA_DATA_DIR = path.resolve(__dirname, "../../../cropmanager-pwa/public/data");
const CROP_DB_PATH = path.join(PWA_DATA_DIR, "crop_database.json");
const FERT_DB_PATH = path.join(PWA_DATA_DIR, "fertilizer_schedule.json");

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpPath, filePath);
}

/**
 * POST /api/data/crop-db
 * Updates the crop_database.json file
 */
router.post("/crop-db", async (req: Request, res: Response) => {
  try {
    const data = req.body;
    if (!isJsonObject(data)) {
      res.status(400).json({ success: false, error: "Body must be a JSON object" });
      return;
    }
    await atomicWriteJson(CROP_DB_PATH, data);
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
    if (!isJsonObject(data)) {
      res.status(400).json({ success: false, error: "Body must be a JSON object" });
      return;
    }
    await atomicWriteJson(FERT_DB_PATH, data);
    res.json({ success: true, message: "Fertilizer database updated" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
