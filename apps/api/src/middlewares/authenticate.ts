import { AccountStatus } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { prisma } from "../lib/prisma";
import { verifyAuthToken } from "../services/token.service";

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
      accountStatus: true,
      mustChangePassword: true,
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

  request.auth = {
    userId: user.id,
    role: user.role,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    mustChangePassword: user.mustChangePassword,
  };

  next();
}
