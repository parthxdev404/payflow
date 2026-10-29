import { type Request, type Response, type NextFunction } from "express";
import { prisma } from "../config/database.js";
import { ACCESS_TOKEN_COOKIE } from "../config/cookie.js";
import { verifyAccessToken } from "../utils/jwt.js";

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.cookies?.[ACCESS_TOKEN_COOKIE];

    // 1. Stop immediately if the cookie is missing.
    if (!token) {
      res.status(401).json({
        success: false,
        message: "Authentication Required",
      });
      return;
    }

    const payload = verifyAccessToken(token);
    const userId = Number(payload.sub);

    // 2. Reject invalid user IDs.
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      res.status(401).json({
        success: false,
        message: "Invalid authentication token",
      });
      return;
    }

    // 3. Fetch the current user from the database.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
      },
    });

    if (!user || user.status !== "ACTIVE") {
      res.status(401).json({
        success: false,
        message: "Authentication Required",
      });
      return;
    }

    // 4. Attach the authenticated user and continue.
    req.user = user;
    next();
  } catch (error) {
    if (
      error instanceof Error &&
      ["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(
        error.name,
      )
    ) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired authentication token",
      });
      return;
    }

    next(error);
  }
};
