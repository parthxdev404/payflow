import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(150),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(180)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(5000).optional(),
  priceInPaise: z.number().int().positive(),
  stock: z.number().int().nonnegative().default(0),
});

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),

  limit: z.coerce.number().int().min(1).max(50).default(10),

  search: z.string().trim().max(100).optional(),

  sortBy: z.enum(["createdAt", "price"]).default("createdAt"),

  order: z.enum(["asc", "desc"]).default("desc"),
});

export const productIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const updateProductSchema = createProductSchema
  .extend({
    stock: z.number().int().nonnegative().optional(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type ProductIdParams = z.infer<typeof productIdSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
