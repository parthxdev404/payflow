import { z } from "zod";
import { OrderStatus } from "../../generated/prisma/client";

export const listAdminOrdersSchema = z.object({
  page: z
    .string()
    .regex(/^[1-9]\d*$/, "Page must be a positive integer")
    .transform(Number)
    .refine(Number.isSafeInteger, "Page is too large")
    .default(1),

  limit: z
    .string()
    .regex(/^[1-9]\d*$/, "Limit must be a positive integer")
    .transform(Number)
    .refine(Number.isSafeInteger, "Limit is too large")
    .default(10)
    .refine((value) => value <= 100, "Limit cannot exceed 100"),

  status: z.nativeEnum(OrderStatus).optional(),
});

export const adminOrderParamsSchema = z.object({
  orderId: z
    .string()
    .regex(/^[1-9]\d*$/, "Order ID must be a positive integer")
    .transform(Number)
    .refine(Number.isSafeInteger, "Order ID is too large"),
});
