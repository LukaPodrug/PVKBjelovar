import { UserRole } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";

export function authorizeRoles(...allowedRoles: UserRole[]) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.auth) {
      next(new AppError("Autentikacija je obavezna.", 401));
      return;
    }

    if (!allowedRoles.includes(request.auth.role)) {
      next(new AppError("Nemate ovlasti za pristup ovom resursu.", 403));
      return;
    }

    next();
  };
}

/**
 * Parent features are keyed off the parent profile rather than the primary role, because a coach or
 * admin whose child joins the club is given a parent profile while keeping their original role.
 */
export const authorizeParentAccess = asyncHandler(async (request, _response, next) => {
  if (!request.auth) {
    next(new AppError("Autentikacija je obavezna.", 401));
    return;
  }

  if (request.auth.role === UserRole.PARENT) {
    next();
    return;
  }

  const parent = await prisma.parent.findUnique({
    where: { userId: request.auth.userId },
    select: { id: true },
  });

  if (!parent) {
    next(new AppError("Nemate ovlasti za pristup ovom resursu.", 403));
    return;
  }

  next();
});
