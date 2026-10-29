import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validate } from "../../middlewares/validate";
import { adminOrderParamsSchema, listAdminOrdersSchema } from "./admin.schema";
import {
  getAdminDashboardStatsController,
  getAdminOrdersController,
  getAdminOrderByIdController,
  cancelAdminOrderController,
} from "./admin.controller";

const adminRouter = Router();

// All admin endpoints require authentication and the ADMIN role.
adminRouter.use(authenticate, authorize("ADMIN"));

adminRouter.get("/dashboard", getAdminDashboardStatsController);

adminRouter.get(
  "/orders",
  validate(listAdminOrdersSchema, "query"),
  getAdminOrdersController,
);

adminRouter.get(
  "/orders/:orderId",
  validate(adminOrderParamsSchema, "params"),
  getAdminOrderByIdController,
);

adminRouter.patch(
  "/orders/:orderId/cancel",
  validate(adminOrderParamsSchema, "params"),
  cancelAdminOrderController,
);

export default adminRouter;
