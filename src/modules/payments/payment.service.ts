import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "../../config/database";
import { razorpay } from "../../config/razorpay";
import { env } from "../../config/env";

type VerifyPaymentInput = {
  userId: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
};

function createPaymentError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

function isValidRazorpaySignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string,
): boolean {
  // Razorpay checkout signatures are 64 hexadecimal characters.
  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }

  // Use the validated configuration instead of accessing process.env directly.
  const expectedSignature = createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  const expected = Buffer.from(expectedSignature, "hex");
  const received = Buffer.from(signature, "hex");

  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

export async function initiatePayment(userId: number, orderId: number) {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      userId,
    },
    select: {
      id: true,
      status: true,
      totalInPaise: true,
    },
  });

  if (!order) {
    const error = new Error("Order not found");
    Object.assign(error, { statusCode: 404 });
    throw error;
  }

  if (order.status !== "PENDING") {
    const error = new Error("Payment can only be initiated for pending orders");
    Object.assign(error, { statusCode: 409 });
    throw error;
  }

  if (order.totalInPaise <= 0) {
    const error = new Error("Order amount must be positive");
    Object.assign(error, { statusCode: 400 });
    throw error;
  }

  const existingPayment = await prisma.payment.findFirst({
    where: {
      orderId: order.id,
      status: "PENDING",
      providerOrderId: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existingPayment?.providerOrderId) {
    return {
      paymentId: existingPayment.id,
      razorpayOrderId: existingPayment.providerOrderId,
      amount: existingPayment.amountInPaise,
      currency: existingPayment.currency,
      keyId: env.RAZORPAY_KEY_ID,
    };
  }

  const razorpayOrder = await razorpay.orders.create({
    amount: order.totalInPaise,
    currency: "INR",
    receipt: `pf-${order.id}-${Date.now()}`,
    notes: {
      payflowOrderId: String(order.id),
      payflowUserId: String(userId),
    },
  });

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      amountInPaise: order.totalInPaise,
      currency: "INR",
      status: "PENDING",
      providerOrderId: razorpayOrder.id,
    },
    select: {
      id: true,
      amountInPaise: true,
      currency: true,
      providerOrderId: true,
    },
  });

  return {
    paymentId: payment.id,
    razorpayOrderId: payment.providerOrderId,
    amount: payment.amountInPaise,
    currency: payment.currency,
    keyId: env.RAZORPAY_KEY_ID,
  };
}

export async function reconcilePaymentAttempts(
  userId: number,
  razorpayOrderId: string,
) {
  // 1. Find the PayFlow payment and verify that its order belongs
  //    to the authenticated user.
  const payment = await prisma.payment.findFirst({
    where: {
      providerOrderId: razorpayOrderId,
      order: { userId },
    },
    include: {
      order: {
        select: {
          id: true,
          status: true,
          totalInPaise: true,
        },
      },
    },
  });

  if (!payment) {
    throw createPaymentError("Payment not found", 404);
  }

  // 2. Fetch all payment attempts recorded by Razorpay
  //    for this Razorpay order.
  const providerPayments = await razorpay.orders.fetchPayments(razorpayOrderId);

  let failedAttemptsProcessed = 0;
  let capturedAttemptsProcessed = 0;
  let capturedAttemptsNeedingReview = 0;

  // 3. Process each provider payment attempt.
  for (const attempt of providerPayments.items) {
    // Accept only attempts matching the expected order, amount,
    // and currency. Never trust an unrelated provider record.
    if (
      attempt.order_id !== razorpayOrderId ||
      Number(attempt.amount) !== payment.amountInPaise ||
      attempt.currency !== payment.currency
    ) {
      continue;
    }

    // We only reconcile terminal states handled by this function.
    if (attempt.status !== "failed" && attempt.status !== "captured") {
      continue;
    }

    // =========================================================
    // A. HANDLE FAILED PAYMENT ATTEMPTS
    // =========================================================
    if (attempt.status === "failed") {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.paymentAttempt.findUnique({
          where: {
            providerPaymentId: attempt.id,
          },
        });

        // A Razorpay payment ID must never belong to a different
        // PayFlow payment.
        if (existing && existing.paymentId !== payment.id) {
          throw createPaymentError(
            "Provider payment ID is already linked to another PayFlow payment",
            409,
          );
        }

        // Never downgrade a previously successful attempt.
        if (existing?.status === "SUCCESS") {
          return;
        }

        // Record the failed attempt or refresh its failure details.
        await tx.paymentAttempt.upsert({
          where: {
            providerPaymentId: attempt.id,
          },
          create: {
            paymentId: payment.id,
            providerPaymentId: attempt.id,
            status: "FAILED",
            amountInPaise: payment.amountInPaise,
            currency: payment.currency,
            method: attempt.method ?? null,
            failureCode: attempt.error_code ?? null,
            failureDescription: attempt.error_description ?? null,
          },
          update: {
            status: "FAILED",
            method: attempt.method ?? null,
            failureCode: attempt.error_code ?? null,
            failureDescription: attempt.error_description ?? null,
          },
        });
      });

      failedAttemptsProcessed++;
      continue;
    }

    // =========================================================
    // B. HANDLE CAPTURED PAYMENT ATTEMPTS
    // =========================================================
    const outcome = await prisma.$transaction(async (tx) => {
      // Re-read the current payment and order state inside the
      // transaction instead of relying on an earlier snapshot.
      const currentPayment = await tx.payment.findUnique({
        where: {
          id: payment.id,
        },
        include: {
          order: {
            select: {
              status: true,
              totalInPaise: true,
            },
          },
        },
      });

      if (!currentPayment) {
        throw createPaymentError("Payment not found", 404);
      }

      const existingAttempt = await tx.paymentAttempt.findUnique({
        where: {
          providerPaymentId: attempt.id,
        },
      });

      // Prevent a provider payment ID from being reassigned
      // to a different PayFlow payment.
      if (existingAttempt && existingAttempt.paymentId !== payment.id) {
        throw createPaymentError(
          "Provider payment ID is already linked to another PayFlow payment",
          409,
        );
      }

      // Record the captured provider attempt before deciding
      // whether it can automatically confirm this order.
      if (existingAttempt?.status !== "SUCCESS") {
        await tx.paymentAttempt.upsert({
          where: {
            providerPaymentId: attempt.id,
          },
          create: {
            paymentId: payment.id,
            providerPaymentId: attempt.id,
            status: "SUCCESS",
            amountInPaise: payment.amountInPaise,
            currency: payment.currency,
            method: attempt.method ?? null,
          },
          update: {
            status: "SUCCESS",
            method: attempt.method ?? null,
            failureCode: null,
            failureDescription: null,
          },
        });
      }

      // If the payment already succeeded, only the same provider
      // payment ID is considered an idempotent repeat.
      if (currentPayment.status === "SUCCESS") {
        if (currentPayment.providerPaymentId === attempt.id) {
          return "already-confirmed" as const;
        }

        // A different captured payment may represent a duplicate
        // charge. Record it for manual investigation.
        await tx.paymentAttempt.update({
          where: {
            providerPaymentId: attempt.id,
          },
          data: {
            needsReview: true,
            reviewReason:
              "Additional captured payment detected after another payment succeeded.",
          },
        });

        return "review" as const;
      }

      // A captured payment cannot automatically confirm an order
      // that is no longer eligible for confirmation.
      if (
        currentPayment.status !== "PENDING" ||
        currentPayment.order.status !== "PENDING" ||
        currentPayment.order.totalInPaise !== payment.amountInPaise
      ) {
        await tx.paymentAttempt.update({
          where: {
            providerPaymentId: attempt.id,
          },
          data: {
            needsReview: true,
            reviewReason:
              "Captured payment cannot be automatically applied to the current order state.",
          },
        });

        return "review" as const;
      }

      // Conditionally transition the local payment from PENDING
      // to SUCCESS. The condition protects against concurrent updates.
      const paymentUpdate = await tx.payment.updateMany({
        where: {
          id: currentPayment.id,
          status: "PENDING",
          providerOrderId: razorpayOrderId,
        },
        data: {
          status: "SUCCESS",
          providerPaymentId: attempt.id,
        },
      });

      if (paymentUpdate.count !== 1) {
        throw createPaymentError(
          "Payment changed during reconciliation; retry",
          409,
        );
      }

      // Confirm the order in the same transaction. If this fails,
      // throwing an error rolls back the payment update as well.
      const orderUpdate = await tx.order.updateMany({
        where: {
          id: currentPayment.orderId,
          userId,
          status: "PENDING",
          totalInPaise: payment.amountInPaise,
        },
        data: {
          status: "CONFIRMED",
        },
      });

      if (orderUpdate.count !== 1) {
        throw createPaymentError(
          "Order could not be confirmed; reconciliation rolled back",
          409,
        );
      }

      return "confirmed" as const;
    });

    // Count captured attempts handled during this reconciliation.
    capturedAttemptsProcessed++;

    if (outcome === "review") {
      capturedAttemptsNeedingReview++;
    }
  }

  // 4. Return a summary for the controller/API response.
  return {
    paymentId: payment.id,
    failedAttemptsProcessed,
    capturedAttemptsProcessed,
    capturedAttemptsNeedingReview,
    message: "Payment attempts reconciled",
  };
}

export async function verifyPayment(input: VerifyPaymentInput) {
  const { userId, razorpayOrderId, razorpayPaymentId, razorpaySignature } =
    input;

  const payment = await prisma.payment.findFirst({
    where: {
      providerOrderId: razorpayOrderId,
      order: { userId },
    },
    include: {
      order: {
        select: {
          id: true,
          userId: true,
          status: true,
          totalInPaise: true,
        },
      },
    },
  });

  if (!payment) {
    throw createPaymentError("Payment not found", 404);
  }

  if (
    !isValidRazorpaySignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    )
  ) {
    throw createPaymentError("Invalid payment signature", 400);
  }

  const providerPayment = await razorpay.payments.fetch(razorpayPaymentId);
  if (
    providerPayment.order_id !== razorpayOrderId ||
    providerPayment.amount !== payment.amountInPaise ||
    providerPayment.currency !== payment.currency
  ) {
    throw createPaymentError(
      "Payment details do not match the payflow order",
      400,
    );
  }

  if (providerPayment.status !== "captured") {
    throw createPaymentError("Payment has not been captured yet", 409);
  }

  if (payment.status === "SUCCESS") {
    if (payment.providerPaymentId !== razorpayPaymentId) {
      throw createPaymentError(
        "A different payment is already associated with this order",
        409,
      );
    }

    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      paymentStatus: payment.status,
      orderStatus: payment.order.status,
    };
  }

  if (payment.status !== "PENDING") {
    throw createPaymentError(
      "This payment cannot be verified in its current state",
      409,
    );
  }

  if (
    payment.order.status !== "PENDING" ||
    payment.order.totalInPaise !== payment.amountInPaise
  ) {
    throw createPaymentError(
      "The PayFlow order is not eligible for payment confirmation",
      409,
    );
  }

  return prisma.$transaction(async (tx) => {
    const paymentUpdate = await tx.payment.updateMany({
      where: {
        id: payment.id,
        status: "PENDING",
        providerOrderId: razorpayOrderId,
      },
      data: {
        status: "SUCCESS",
        providerPaymentId: razorpayPaymentId,
      },
    });

    if (paymentUpdate.count !== 1) {
      throw createPaymentError(
        "Payment was already processed; reload its status",
        409,
      );
    }
    await tx.paymentAttempt.create({
      data: {
        paymentId: payment.id,
        providerPaymentId: razorpayPaymentId,
        status: "SUCCESS",
        amountInPaise: payment.amountInPaise,
        currency: providerPayment.currency,
        method: providerPayment.method ?? null,
      },
    });

    const orderUpdate = await tx.order.updateMany({
      where: {
        id: payment.orderId,
        userId,
        status: "PENDING",
        totalInPaise: payment.amountInPaise,
      },
      data: {
        status: "CONFIRMED",
      },
    });

    if (orderUpdate.count !== 1) {
      throw createPaymentError("Order could not be confirmed", 409);
    }

    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      paymentStatus: "SUCCESS",
      orderStatus: "CONFIRMED",
    };
  });
}
