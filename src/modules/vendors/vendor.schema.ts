import { z } from "zod";

export const updateVendorOrderItemStatusSchema = z.object({
  status: z.enum(["PROCESSING", "SHIPPED", "DELIVERED"]),
});

export const vendorOrderItemParamsSchema = z.object({
  orderItemId: z
    .string()
    .regex(/^[1-9]\d*$/, "Order item ID must be a positive integer")
    .transform(Number)
    .refine(Number.isSafeInteger, "Order item ID is too large"),
});
