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

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      res.status(409).json({
        success: false,
        message: "A record with this unique value already exists",
      });
      return;
    }
  }

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
}
