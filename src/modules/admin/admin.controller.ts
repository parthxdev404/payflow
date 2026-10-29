import type { Request, Response, NextFunction } from "express";
import {
  getAdminDashboardStats,
  getAdminOrders,
  getAdminOrderById,
  cancelAdminOrder,
} from "./admin.service";
import type { OrderStatus } from "../../generated/prisma/client";

// GET /api/admin/dashboard
export async function getAdminDashboardStatsController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const stats = await getAdminDashboardStats();

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/orders?page=1&limit=10&status=PENDING
export async function getAdminOrdersController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = res.locals.validatedQuery as {
      page: number;
      limit: number;
      status?: OrderStatus;
    };

    const result = await getAdminOrders(query.page, query.limit, query.status);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/orders/:orderId
export async function getAdminOrderByIdController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { orderId } = res.locals.validatedParams as {
      orderId: number;
    };

    const order = await getAdminOrderById(orderId);

    res.status(200).json({
      success: true,
      data: { order },
    });
  } catch (error) {
    next(error);
  }
}

// PATCH /api/admin/orders/:orderId/cancel
export async function cancelAdminOrderController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { orderId } = res.locals.validatedParams as {
      orderId: number;
    };

    const order = await cancelAdminOrder(orderId);

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      data: { order },
    });
  } catch (error) {
    next(error);
  }
}
