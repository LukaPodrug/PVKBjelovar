import type { UserRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        /** The role this request acts as: the primary role or another profile the user holds. */
        role: UserRole;
        primaryRole: UserRole;
        profiles: UserRole[];
        email: string | null;
        username: string | null;
        firstName: string;
        lastName: string;
        profileImageUrl: string | null;
        mustChangePassword: boolean;
      };
    }
  }
}

export {};
