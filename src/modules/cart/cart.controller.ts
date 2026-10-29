import type { Request, Response, NextFunction } from "express";
import type { AddCartItemInput, UpdateCartItemInput } from "./cart.schema.js";

import {
  addCartItem,
  getCart,
  removeCartItem,
  updateCartItem,
} from "./cart.service.js";

export const getCartController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const cart = await getCart(req.user!.id);

    res.status(200).json({
      success: true,
      data: cart,
    });
  } catch (error) {
    next(error);
  }
};

export const addCartItemController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const input = req.body as AddCartItemInput;

    const item = await addCartItem(req.user!.id, input);

    res.status(201).json({
      success: true,
      message: "Item added to cart successfully",
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCartItemController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const parsedItemId = Number(req.params.itemId);
    const input = req.body as UpdateCartItemInput;

    const item = await updateCartItem(req.user!.id, parsedItemId, input);

    res.status(200).json({
      success: true,
      message: "Cart item updated successfully",
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

export const removeCartItemController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const parsedItemId = Number(req.params.itemId);

    const result = await removeCartItem(req.user!.id, parsedItemId);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};
