import type { Request, Response, NextFunction } from "express";
import {
  checkOutOrder,
  getMyOrders,
  getMyOrderById,
  cancelMyOrder,
} from "./order.service.js";

export const checkout = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const order = await checkOutOrder(req.user!.id);

    res.status(201).json({
      success: true,
      message: "Order placed successfully",
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

export const getOrders = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orders = await getMyOrders(req.user!.id);

    res.status(200).json({
      success: true,
      message: "Orders retrieved successfully",
      data: orders,
    });
  } catch (error) {
    next(error);
  }
};

export const getOrderById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderId = Number(req.params.orderId);

    const order = await getMyOrderById(req.user!.id, orderId);

    res.status(200).json({
      success: true,
      message: "Order retrieved successfully",
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

export const cancelOrder = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderId = Number(req.params.orderId);

    const order = await cancelMyOrder(req.user!.id, orderId);

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      data: order,
    });
  } catch (error) {
    next(error);
  }
};
