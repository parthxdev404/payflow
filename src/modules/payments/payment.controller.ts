import type { Request, Response, NextFunction } from "express";
import {
  initiatePayment,
  reconcilePaymentAttempts,
  verifyPayment,
} from "./payment.service";

export async function initiatePaymentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user!.id;
    const orderId = req.body.orderId as number;
    const payment = await initiatePayment(userId, orderId);

    res.status(201).json({
      success: true,
      message: "Payment order created successfully",
      data: payment,
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyPaymentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user!.id;

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    const result = await verifyPayment({
      userId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function reconcilePaymentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await reconcilePaymentAttempts(
      req.user!.id,
      req.body.razorpayOrderId,
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
