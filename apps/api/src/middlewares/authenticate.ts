import { AccountStatus, UserRole } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { prisma } from "../lib/prisma";
import { verifyAuthToken } from "../services/token.service";
import { listUserProfiles } from "../services/user-profile.service";

export async function authenticateRequest(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader?.startsWith("Bearer ")) {
    next(new AppError("Autentikacijski token je obavezan.", 401));
    return;
  }

  const token = authorizationHeader.slice("Bearer ".length);
  const payload = verifyAuthToken(token);

  const user = await prisma.user.findUnique({
    where: {
      id: payload.sub,
    },
    select: {
      id: true,
      role: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      profileImageUrl: true,
      accountStatus: true,
      mustChangePassword: true,
      coach: { select: { id: true } },
      parent: { select: { id: true } },
      player: { select: { id: true, archivedAt: true } },
    },
  });

  if (!user) {
    next(new AppError("Prijavljeni korisnik više ne postoji.", 401));
    return;
  }

  if (user.accountStatus !== AccountStatus.ACTIVE) {
    next(new AppError("Ovaj račun nije aktivan.", 403));
    return;
  }

  const profiles = listUserProfiles(user);

  request.auth = {
    userId: user.id,
    role: resolveActingRole(request.headers["x-acting-role"], user.role, profiles),
    primaryRole: user.role,
    profiles,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
    mustChangePassword: user.mustChangePassword,
  };

  next();
}

/**
 * A user with several profiles (e.g. a coach who also plays for the veterans) picks which one the
 * mobile app is showing with the X-Acting-Role header. Every role check then sees that role, but
 * only one the user actually holds; anything else falls back to the primary role.
 */
function resolveActingRole(header: unknown, primaryRole: UserRole, profiles: UserRole[]): UserRole {
  const requested = typeof header === "string" ? header.trim().toUpperCase() : "";

  return profiles.find((role) => role === requested) ?? primaryRole;
}
