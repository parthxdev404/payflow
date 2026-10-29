import { Router } from "express";
import {
  checkout,
  getOrders,
  getOrderById,
  cancelOrder,
} from "./order.controller.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { checkOutSchema } from "./order.schema";
import { z } from "zod";

const orderRouter = Router();

const orderIdSchema = z
  .object({
    orderId: z.coerce.number().int().positive(),
  })
  .strict();

// All order routes require authentication.
orderRouter.use(authenticate);

orderRouter.post(
  "/checkout",
  authorize("CUSTOMER"),
  validate(checkOutSchema),
  checkout,
);

// Customers can access only their own orders.
orderRouter.get("/", authorize("CUSTOMER"), getOrders);

orderRouter.get(
  "/:orderId",
  authorize("CUSTOMER"),
  validate(orderIdSchema, "params"),
  getOrderById,
);

orderRouter.post(
  "/:orderId/cancel",
  authorize("CUSTOMER"),
  validate(orderIdSchema, "params"),
  cancelOrder,
);

export default orderRouter;
