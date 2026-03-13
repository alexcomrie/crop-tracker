import { Router, type IRouter } from "express";
import healthRouter from "./health";
import syncRouter from "./sync";

const router: IRouter = Router();

router.use("/healthz", healthRouter);
router.use("/sync", syncRouter);

export default router;