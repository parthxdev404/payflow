import { z } from "zod";

export const initiatePaymentSchema = z
  .object({
    orderId: z.coerce.number().int().positive(),
  })
  .strict();

export const verifyPaymentSchema = z
  .object({
    razorpayOrderId: z.string().min(1).max(100),
    razorpayPaymentId: z.string().min(1).max(100),
    razorpaySignature: z
      .string()
      .regex(/^[a-f0-9]{64}$/i, "Invalid signature format"),
  })
  .strict();

export const reconcilePaymentSchema = z.object({
  razorpayOrderId: z.string().min(1, "Razorpay order ID is required"),
});
