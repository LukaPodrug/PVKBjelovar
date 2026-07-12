import type { UserRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: UserRole;
        email: string | null;
        username: string | null;
        firstName: string;
        lastName: string;
        mustChangePassword: boolean;
      };
    }
  }
}

export {};
