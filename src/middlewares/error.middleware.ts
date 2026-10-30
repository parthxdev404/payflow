import type { Request, Response, NextFunction } from "express";
import { Prisma } from "../generated/prisma/client.js";

export function errorMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  // Handle Prisma database errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      res.status(409).json({
        success: false,
        message: "A record with this unique value already exists",
      });
      return;
    }
  }

  // Handle custom application errors
  if (error instanceof Error) {
    const statusCode = (error as Error & { statusCode?: number }).statusCode;

    if (
      typeof statusCode === "number" &&
      statusCode >= 400 &&
      statusCode <= 599
    ) {
      res.status(statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }
  }

  // Handle unexpected errors
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
}
