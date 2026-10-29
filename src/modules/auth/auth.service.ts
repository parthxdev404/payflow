import { prisma } from "../../config/database";
import { hashPassword, verifyPassword } from "../../utils/password";
import { signAccessToken } from "../../utils/jwt";
import {
  generateRefreshToken,
  generateRefreshTokenFamilyId,
  hashRefreshToken,
  REFRESH_TOKE_TTL_MS,
} from "../../utils/refresh-token";

export const registerUser = async (
  name: string,
  email: string,
  password: string,
) => {
  const existingUser = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (existingUser) {
    const error = new Error("Email already registered");
    (error as Error & { statusCode?: number }).statusCode = 409;

    throw error;
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
    },
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };
};

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!user) {
    const error = new Error("Invalid Email or Password") as Error & {
      statusCode: number;
    };
    error.statusCode = 401;
    throw error;
  }

  const passwordIsValid = await verifyPassword(password, user.passwordHash);

  if (!passwordIsValid) {
    const error = new Error("Invalid Email or Password") as Error & {
      statusCode: number;
    };
    error.statusCode = 401;
    throw error;
  }

  if (user.status !== "ACTIVE") {
    const error = new Error("Account is inactive") as Error & {
      statusCode: number;
    };
    error.statusCode = 401;
    throw error;
  }

  const accessToken = signAccessToken({
    id: user.id,
    role: user.role,
  });

  const refreshToken = await createRefreshSession(user.id);

  return {
    accessToken,
    refreshToken: refreshToken.token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    },
  };
}

export const createRefreshSession = async (userId: number) => {
  const token = generateRefreshToken();
  const tokenHash = hashRefreshToken(token);
  const familyId = generateRefreshTokenFamilyId();

  const expiresAt = new Date(Date.now() + REFRESH_TOKE_TTL_MS);

  await prisma.refreshToken.create({
    data: { tokenHash, familyId, userId, expiresAt },
  });
  return { token, expiresAt };
};

export const rotateRefreshSession = async (rawToken: string) => {
  const tokenHash = hashRefreshToken(rawToken);
  const now = new Date();

  // Prepare a replacement token . It will only be stored
  // if the current refresh token is valid

  const newToken = generateRefreshToken();
  const newTokenHash = hashRefreshToken(newToken);
  const newExpiresAt = new Date(now.getTime() + REFRESH_TOKE_TTL_MS);

  const outcome = await prisma.$transaction(async (tx) => {
    const current = await tx.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            role: true,
            status: true,
          },
        },
      },
    });

    if (!current) {
      return { kind: "invalid" as const };
    }

    // A previously rotated token has been reused
    // Revoke every token in its family

    if (current.revokedAt) {
      await tx.refreshToken.updateMany({
        where: {
          familyId: current.familyId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      return { kind: "invalid" as const };
    }
    if (current.expiresAt <= now || current.user.status !== "ACTIVE") {
      await tx.refreshToken.updateMany({
        where: {
          familyId: current.familyId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      return { kind: "invalid" as const };
    }
    const consumed = await tx.refreshToken.updateMany({
      where: {
        id: current.id,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        revokedAt: now,
      },
    });

    if (consumed.count !== 1) {
      await tx.refreshToken.updateMany({
        where: {
          familyId: current.familyId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      return { kind: "invalid" as const };
    }

    await tx.refreshToken.create({
      data: {
        tokenHash: newTokenHash,
        familyId: current.familyId,

        userId: current.userId,
        expiresAt: newExpiresAt,
      },
    });
    return {
      kind: "success" as const,
      userId: current.user.id,
      role: current.user.role,
    };
  });

  if (outcome.kind !== "success") {
    return null;
  }

  return {
    accessToken: signAccessToken({
      id: outcome.userId,
      role: outcome.role,
    }),
    refreshToken: newToken,
    expiresAt: newExpiresAt,
  };
};
