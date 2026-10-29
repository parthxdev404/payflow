import type { Request, Response, NextFunction } from "express";
import {
  getVendorOrderItems,
  updateVendorOrderItemStatus,
} from "./vendor.service";

export async function getVendorOrderItemsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const vendorId = req.user!.id;
    const orderItems = await getVendorOrderItems(vendorId);

    res.status(200).json({
      success: true,
      data: {
        orderItems,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateVendorOrderItemStatusController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const vendorId = req.user!.id;

    // The validate middleware stores transformed route parameters
    // in res.locals.validatedParams.
    const { orderItemId } = res.locals.validatedParams as {
      orderItemId: number;
    };

    const { status } = req.body;

    const result = await updateVendorOrderItemStatus(
      vendorId,
      orderItemId,
      status,
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
