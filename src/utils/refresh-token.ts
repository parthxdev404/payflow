import { createHash, randomBytes, randomUUID } from "node:crypto";
export const REFRESH_TOKE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const generateRefreshToken = (): string => {
  return randomBytes(32).toString("hex");
};

export const hashRefreshToken = (token: string): string => {
  return createHash("sha256").update(token).digest("hex");
};

export const generateRefreshTokenFamilyId = (): string => {
  return randomUUID();
};
