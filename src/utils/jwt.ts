
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const JWT_ISSUER = "payflow-api";
const JWT_AUDIENCE = "payflow-client";

export type AccessTokenPayload = {
  sub: string;
  role: "CUSTOMER" | "VENDOR" | "ADMIN";
};

const isValidRole = (
  role: unknown
): role is AccessTokenPayload["role"] => {
  return (
    role === "CUSTOMER" ||
    role === "VENDOR" ||
    role === "ADMIN"
  );
};

export const signAccessToken = (user: {
  id: number;
  role: AccessTokenPayload["role"];
}): string => {
  return jwt.sign(
    { role: user.role },
    env.JWT_ACCESS_SECRET,
    {
      subject: String(user.id),
      expiresIn: "15m",
      algorithm: "HS256",
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );
};

export const verifyAccessToken = (
  token: string
): AccessTokenPayload => {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  if (
    typeof payload === "string" ||
    typeof payload.sub !== "string" ||
    !/^[1-9]\d*$/.test(payload.sub) ||
    !isValidRole(payload.role)
  ) {
    throw new Error("Invalid access token payload");
  }

  return {
    sub: payload.sub,
    role: payload.role,
  };
};
