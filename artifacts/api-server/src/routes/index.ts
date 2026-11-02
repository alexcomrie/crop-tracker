import { Router, type IRouter } from "express";
import healthRouter from "./health";
import syncRouter from "./sync";
import dataRouter from "./data";
import treatmentRouter from "./treatment";
import communityRouter from "./community";
import gasMockRouter from "./gasMock";

const router: IRouter = Router();

router.use("/healthz", healthRouter);
router.use("/sync", syncRouter);
router.use("/data", dataRouter);
router.use("/treatment-db", treatmentRouter);
router.use("/community", communityRouter);
router.use("/gas-mock", gasMockRouter);

export default router;