import { z } from "zod";

export const checkOutSchema = z.object({}).strict();

export type CheckOutInput = z.infer<typeof checkOutSchema>;
