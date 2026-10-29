import { z } from "zod";

export const addCartItemsSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(100),
});

export const updateCartItemsSchema = z.object({
  quantity: z.number().int().min(1).max(100),
});

export const cartItemsIdSchema = z.object({
  itemId: z.coerce.number().int().positive(),
});

export type AddCartItemInput = z.infer<typeof addCartItemsSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemsSchema>;
export type CartItemIdParams = z.infer<typeof cartItemsIdSchema>;
