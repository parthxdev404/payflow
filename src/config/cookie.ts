import { env } from "./env";

export const ACCESS_TOKEN_COOKIE = "payflow_access";
export const REFRESH_TOKEN_COOKIE = "payflow_refresh";

export const accessCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV == "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 15 * 60 * 1000,
};

export const refreshCookieOption = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
