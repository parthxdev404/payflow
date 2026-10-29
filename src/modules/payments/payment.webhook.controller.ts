import type { Request, Response, NextFunction } from "express";
import {
  parseRazorpayWebhook,
  processRazorpayWebhook,
} from "./payment.webhook.service";

export async function razorpayWebhookController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    // express.raw() must give us the original body.
    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({
        success: false,
        message: "Expected a raw webhook body",
      });
    }

    const signature = req.get("x-razorpay-signature");
    const providerEventId = req.get("x-razorpay-event-id");

    if (!providerEventId) {
      return res.status(400).json({
        success: false,
        message: "Missing Razorpay event ID",
      });
    }

    const event = parseRazorpayWebhook(req.body, signature);
    const result = await processRazorpayWebhook(providerEventId, event);

    return res.status(200).json({
      success: true,
      received: true,
      duplicate: result.duplicate,
      processed: result.processed,
    });
  } catch (error) {
    next(error);
  }
}
