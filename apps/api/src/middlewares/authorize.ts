import type { UserRole } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";

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
