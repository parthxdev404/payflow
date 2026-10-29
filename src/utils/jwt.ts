import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type AccessTokenPayload = {
  sub: string;
  role: "CUSTOMER" | "VENDOR" | "ADMIN";
};

export const signAccessToken = (user: {
  id: number;
  role: "CUSTOMER" | "VENDOR" | "ADMIN";
}): string => {
  return jwt.sign(
    {
      role: user.role,
    },
    env.JWT_ACCESS_SECRET,
    {
      subject: String(user.id),
      expiresIn: "15m",
      algorithm: "HS256",
    },
  );
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
  });

  if (
    typeof payload === "string" ||
    typeof payload.sub !== "string" ||
    !["CUSTOMER", "VENDOR", "ADMIN"].includes(String(payload.role))
  ) {
    throw new Error("Invalid access token payload");
  }

  return {
    sub: payload.sub,
    role: payload.role as AccessTokenPayload["role"],
  };
};
