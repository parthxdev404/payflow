import { Request, Response, NextFunction } from "express";
import {
  loginUser,
  registerUser,
  rotateRefreshSession,
} from "./auth.service.js";
import {
  ACCESS_TOKEN_COOKIE,
  accessCookieOptions,
  REFRESH_TOKEN_COOKIE,
  refreshCookieOption,
} from "../../config/cookie.js";
import { prisma } from "../../config/database.js";
import { hashRefreshToken } from "../../utils/refresh-token.js";

export const registerController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { name, email, password } = req.body;

    const user = await registerUser(name, email, password);

    res.status(201).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

export const loginController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = req.body;
    const result = await loginUser(email, password);

    res.cookie(ACCESS_TOKEN_COOKIE, result.accessToken, accessCookieOptions);
    res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, refreshCookieOption);
    res.status(200).json({
      success: true,
      data: {
        user: result.user,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getMeController = (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication Required",
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
};

export const refreshController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!rawToken || typeof rawToken !== "string") {
      res.status(401).json({
        success: false,
        message: "Refresh Token Required",
      });
      return;
    }
    const result = await rotateRefreshSession(rawToken);
    if (!result) {
      res.clearCookie(ACCESS_TOKEN_COOKIE, {
        ...accessCookieOptions,
        maxAge: undefined,
      });
      res.clearCookie(REFRESH_TOKEN_COOKIE, {
        ...refreshCookieOption,
        maxAge: undefined,
      });

      res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token.Please log in again",
      });
      return;
    }

    res.cookie(ACCESS_TOKEN_COOKIE, result.accessToken, accessCookieOptions);
    res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, refreshCookieOption);

    res.status(200).json({
      success: true,
      message: "Session refreshed successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const logOutController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (typeof rawToken === "string" && rawToken.length > 0) {
      const tokenHash = hashRefreshToken(rawToken);
      const session = await prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: {
          familyId: true,
        },
      });
      if (session) {
        await prisma.refreshToken.updateMany({
          where: {
            familyId: session.familyId,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });
      }
    }
    const { maxAge: _accessMaxAge, ...accessClearOption } = accessCookieOptions;
    const { maxAge: _refreshMaxAge, ...refreshClearOption } =
      accessCookieOptions;

    res.clearCookie(ACCESS_TOKEN_COOKIE, accessClearOption);
    res.clearCookie(REFRESH_TOKEN_COOKIE, refreshClearOption);
    res.status(200).json({
      success: true,
      message: "LogOut Successful",
    });
  } catch (error) {
    next(error);
  }
};
