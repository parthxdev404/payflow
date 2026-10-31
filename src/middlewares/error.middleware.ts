
import type { Request, Response, NextFunction } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { logger } from "../config/logger.js";

export function errorMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (res.headersSent) {
    return next(error);
  }

  // Handle known Prisma database errors.
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    logger.warn(
      {
        err: error,
        code: error.code,
        method: req.method,
        path: req.originalUrl,
      },
      "Prisma database error"
    );

    switch (error.code) {
      case "P2002":
        return res.status(409).json({
          success: false,
          message: "A record with this unique value already exists",
        });

      case "P2003":
        return res.status(409).json({
          success: false,
          message: "This operation conflicts with an existing relationship",
        });

      case "P2025":
        return res.status(404).json({
          success: false,
          message: "Requested record was not found",
        });

      case "P2014":
        return res.status(409).json({
          success: false,
          message: "This operation violates a required relationship",
        });

      default:
        return res.status(500).json({
          success: false,
          message: "Database operation failed",
        });
    }
  }

  // Handle custom application errors.
  if (error instanceof Error) {
    const statusCode = (
      error as Error & { statusCode?: number }
    ).statusCode;

    if (
      typeof statusCode === "number" &&
      statusCode >= 400 &&
      statusCode <= 599
    ) {
      logger.warn(
        {
          err: error,
          method: req.method,
          path: req.originalUrl,
          statusCode,
        },
        "Application error"
      );

      return res.status(statusCode).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Handle unexpected errors.
  logger.error(
    {
      err: error,
      method: req.method,
      path: req.originalUrl,
    },
    "Unhandled application error"
  );

  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
}
