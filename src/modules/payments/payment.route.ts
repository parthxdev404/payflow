import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validate } from "../../middlewares/validate";
import {
  initiatePaymentController,
  reconcilePaymentController,
  verifyPaymentController,
} from "./payment.controller";
import {
  initiatePaymentSchema,
  reconcilePaymentSchema,
  verifyPaymentSchema,
} from "./payment.schema";
import { razorpayWebhookController } from "./payment.webhook.controller";

const paymentRouter = Router();

paymentRouter.post(
  "/initiate",
  authenticate,
  authorize("CUSTOMER"),
  validate(initiatePaymentSchema),
  initiatePaymentController,
);

paymentRouter.post(
  "/verify",
  authenticate,
  authorize("CUSTOMER"),
  validate(verifyPaymentSchema),
  verifyPaymentController,
);

paymentRouter.post("/webhook", razorpayWebhookController);
paymentRouter.post(
  "/reconcile",
  authenticate,
  authorize("CUSTOMER"),
  validate(reconcilePaymentSchema),
  reconcilePaymentController,
);

export default paymentRouter;
