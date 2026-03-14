import { Router, type IRouter } from "express";
import healthRouter from "./health";
import syncRouter from "./sync";
import dataRouter from "./data";

const router: IRouter = Router();

router.use("/healthz", healthRouter);
router.use("/sync", syncRouter);
router.use("/data", dataRouter);

export default router;