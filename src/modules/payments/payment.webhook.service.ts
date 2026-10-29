import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env";
import { prisma } from "../../config/database";

type RazorpayWebhookEvent = {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        status?: string;
      };
    };
  };
};

/**
 * Verify Razorpay's signature against the exact raw request body.
 *
 * The raw body must be the Buffer produced by express.raw().
 * Never parse and re-serialize the body before this check.
 */
function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const expectedSignature = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  // Reject malformed signatures before timing-safe comparison.
  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(expectedSignature, "hex"),
    Buffer.from(signature, "hex"),
  );
}

/**
 * Validate the signature before trusting the event payload.
 */
export function parseRazorpayWebhook(
  rawBody: Buffer,
  signature: string | undefined,
): RazorpayWebhookEvent {
  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    throw Object.assign(new Error("Invalid Razorpay webhook signature"), {
      statusCode: 400,
    });
  }

  let event: unknown;

  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw Object.assign(new Error("Invalid webhook JSON payload"), {
      statusCode: 400,
    });
  }

  if (
    typeof event !== "object" ||
    event === null ||
    !("event" in event) ||
    typeof event.event !== "string"
  ) {
    throw Object.assign(new Error("Invalid Razorpay webhook event"), {
      statusCode: 400,
    });
  }

  return event as RazorpayWebhookEvent;
}

export async function processRazorpayWebhook(
  providerEventId: string,
  event: RazorpayWebhookEvent,
): Promise<{ duplicate: boolean; processed: boolean }> {
  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Claim this event. The unique constraint prevents duplicate processing.
      await tx.razorpayWebhookEvent.create({
        data: {
          providerEventId,
          eventType: event.event,
        },
      });

      // 2. We currently process captured payments.
      // Other valid event types are recorded and safely ignored.
      if (event.event !== "payment.captured") {
        await tx.razorpayWebhookEvent.update({
          where: { providerEventId },
          data: { processedAt: new Date() },
        });

        return { duplicate: false, processed: false };
      }

      // 3. Validate the payment information in the signed payload.
      const paymentEntity = event.payload?.payment?.entity;

      if (
        !paymentEntity?.id ||
        !paymentEntity.order_id ||
        !Number.isSafeInteger(paymentEntity.amount) ||
        paymentEntity.amount! <= 0 ||
        paymentEntity.currency !== "INR" ||
        paymentEntity.status !== "captured"
      ) {
        throw new Error("Invalid payment.captured payload");
      }

      // 4. Find the local payment using Razorpay's order ID.
      const payment = await tx.payment.findUnique({
        where: {
          providerOrderId: paymentEntity.order_id,
        },
        include: {
          order: true,
        },
      });

      if (!payment) {
        throw new Error("No local payment found for the Razorpay order");
      }

      // 5. Never trust the webhook payload's amount alone.
      if (
        payment.amountInPaise !== paymentEntity.amount ||
        payment.currency !== paymentEntity.currency
      ) {
        throw new Error("Payment amount or currency mismatch");
      }

      // 6. The browser verification endpoint may have completed first.
      // Accept the same payment, but never overwrite a different payment.
      if (payment.status === "SUCCESS") {
        if (payment.providerPaymentId !== paymentEntity.id) {
          throw new Error(
            "Payment already succeeded with a different provider payment ID",
          );
        }

        await tx.razorpayWebhookEvent.update({
          where: { providerEventId },
          data: { processedAt: new Date() },
        });

        return { duplicate: false, processed: true };
      }

      if (payment.status !== "PENDING" || payment.order.status !== "PENDING") {
        throw new Error("Payment or order is not in a payable state");
      }

      // 7. Update payment and order atomically.
      const paymentUpdate = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: "PENDING",
        },
        data: {
          status: "SUCCESS",
          providerPaymentId: paymentEntity.id,
        },
      });

      if (paymentUpdate.count !== 1) {
        throw new Error("Payment state changed during processing");
      }

      const orderUpdate = await tx.order.updateMany({
        where: {
          id: payment.orderId,
          status: "PENDING",
        },
        data: {
          status: "CONFIRMED",
        },
      });

      if (orderUpdate.count !== 1) {
        throw new Error("Order state changed during processing");
      }

      // 8. Mark the event processed in the same transaction.
      await tx.razorpayWebhookEvent.update({
        where: { providerEventId },
        data: { processedAt: new Date() },
      });

      return { duplicate: false, processed: true };
    });
  } catch (error: unknown) {
    // Prisma P2002 means a unique constraint was violated.
    // Only treat it as a duplicate if THIS event ID already exists.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      const existingEvent = await prisma.razorpayWebhookEvent.findUnique({
        where: { providerEventId },
      });

      if (existingEvent) {
        return { duplicate: true, processed: true };
      }
    }

    throw error;
  }
}
