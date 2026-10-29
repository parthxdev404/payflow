import type { UserRole, UserStatus } from "../generated/prisma/enums";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        name: string;
        email: string;
        role: UserRole;
        status: UserStatus;
      };
    }
  }
}

export {};
