import { AccountStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { hashPassword, validatePasswordStrength, verifyPassword } from "../services/password.service";
import { signAuthToken } from "../services/token.service";
import { normalizeLoginIdentifier, parseUsernameInput } from "../services/username.service";
import { optionalString, requireString } from "../utils/request-parsers";

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncHandler(async (request, response) => {
    const identifier =
      normalizeLoginIdentifier(request.body.identifier) ??
      normalizeLoginIdentifier(request.body.email) ??
      normalizeLoginIdentifier(request.body.username);
    const password = requireString(request.body.password, "password");

    if (!identifier) {
      throw new AppError("Prijava je obavezna.", 400);
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
      select: {
        id: true,
        role: true,
        email: true,
        username: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        accountStatus: true,
        mustChangePassword: true,
      },
    });

    if (!user?.passwordHash) {
      throw new AppError("Neispravna prijava ili lozinka.", 401);
    }

    if (user.accountStatus !== AccountStatus.ACTIVE) {
      throw new AppError("Ovaj račun nije aktivan.", 403);
    }

    const passwordMatches = await verifyPassword(password, user.passwordHash);

    if (!passwordMatches) {
      throw new AppError("Neispravna prijava ili lozinka.", 401);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
      },
    });

    const token = signAuthToken({
      sub: user.id,
      role: user.role,
      email: user.email,
      username: user.username,
    });

    response.json({
      token,
      user: {
        userId: user.id,
        role: user.role,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        mustChangePassword: user.mustChangePassword,
      },
    });
  }),
);

authRouter.patch(
  "/change-password",
  authenticateRequest,
  asyncHandler(async (request, response) => {
    const currentPassword = requireString(request.body.currentPassword, "currentPassword");
    const newPassword = requireString(request.body.newPassword, "newPassword");
    const confirmNewPassword = requireString(request.body.confirmNewPassword, "confirmNewPassword");

    if (newPassword !== confirmNewPassword) {
      throw new AppError("Potvrda nove lozinke se ne podudara.", 400);
    }

    validatePasswordStrength(newPassword);

    const user = await prisma.user.findUnique({
      where: { id: request.auth!.userId },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!user?.passwordHash) {
      throw new AppError("Ovaj račun nema postavljenu lokalnu lozinku.", 400);
    }

    const passwordMatches = await verifyPassword(currentPassword, user.passwordHash);

    if (!passwordMatches) {
      throw new AppError("Trenutna lozinka nije ispravna.", 401);
    }

    const nextPasswordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: nextPasswordHash,
        mustChangePassword: false,
      },
    });

    response.json({
      message: "Lozinka je uspješno ažurirana.",
    });
  }),
);

authRouter.patch(
  "/profile",
  authenticateRequest,
  asyncHandler(async (request, response) => {
    const usernameInput = optionalString(request.body.username);

    if (!usernameInput) {
      throw new AppError("Nema podataka za ažuriranje profila.", 400);
    }

    if (request.auth!.role !== UserRole.PLAYER) {
      throw new AppError("Samo igrači trenutno mogu mijenjati korisničko ime kroz mobilnu aplikaciju.", 403);
    }

    const username = parseUsernameInput(usernameInput);
    const existingUser = await prisma.user.findUnique({
      where: {
        username,
      },
      select: {
        id: true,
      },
    });

    if (existingUser && existingUser.id !== request.auth!.userId) {
      throw new AppError("Odabrano korisničko ime je zauzeto.", 409);
    }

    const user = await prisma.user.update({
      where: {
        id: request.auth!.userId,
      },
      data: {
        username,
      },
      select: {
        id: true,
        role: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        mustChangePassword: true,
      },
    });

    response.json({
      user: {
        userId: user.id,
        role: user.role,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        mustChangePassword: user.mustChangePassword,
      },
    });
  }),
);
