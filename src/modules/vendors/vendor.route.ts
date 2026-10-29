import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validate } from "../../middlewares/validate";

import {
  getVendorOrderItemsController,
  updateVendorOrderItemStatusController,
} from "./vendor.controller";

import {
  updateVendorOrderItemStatusSchema,
  vendorOrderItemParamsSchema,
} from "./vendor.schema";

const vendorRouter = Router();

// Every route in this router requires an authenticated vendor.
vendorRouter.use(authenticate, authorize("VENDOR"));

// GET /api/vendors/order-items
// List only the authenticated vendor's order items.
vendorRouter.get("/order-items", getVendorOrderItemsController);

// PATCH /api/vendors/order-items/:orderItemId/status
// Update fulfillment status for an order item owned by this vendor.
vendorRouter.patch(
  "/order-items/:orderItemId/status",
  validate(vendorOrderItemParamsSchema, "params"),
  validate(updateVendorOrderItemStatusSchema),
  updateVendorOrderItemStatusController,
);

export default vendorRouter;
