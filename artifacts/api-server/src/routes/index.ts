import { Router, type IRouter } from "express";
import healthRouter from "./health";
import syncRouter from "./sync";
import dataRouter from "./data";
import treatmentRouter from "./treatment";

const router: IRouter = Router();

router.use("/healthz", healthRouter);
router.use("/sync", syncRouter);
router.use("/data", dataRouter);
router.use("/treatment-db", treatmentRouter);

export default router;