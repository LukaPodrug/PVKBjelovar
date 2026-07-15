import { UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import { parseAccountStatusInput, requireString } from "../utils/request-parsers";

export const usersRouter = Router();

usersRouter.use(authenticateRequest, authorizeRoles(UserRole.ADMIN, UserRole.COACH));

usersRouter.get(
  "/admin-coach-profiles",
  authorizeRoles(UserRole.ADMIN),
  asyncHandler(async (_request, response) => {
    const admins = await prisma.user.findMany({
      where: {
        role: UserRole.ADMIN,
      },
      include: {
        coach: {
          include: {
            categories: {
              include: {
                category: true,
              },
            },
          },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    response.json(admins);
  }),
);

usersRouter.post(
  "/:id/coach-profile",
  authorizeRoles(UserRole.ADMIN),
  asyncHandler(async (request, response) => {
    const targetUserId = requireString(request.params.id, "id");
    const target = await prisma.user.findUnique({
      where: {
        id: targetUserId,
      },
      include: {
        coach: true,
      },
    });

    if (!target) {
      throw new AppError("Korisnik nije pronađen.", 404);
    }

    if (target.role !== UserRole.ADMIN) {
      throw new AppError("Trenerski profil iz postavki moguće je dodati samo administratoru.", 400);
    }

    if (target.coach) {
      throw new AppError("Ovaj administrator već ima trenerski profil.", 409);
    }

    const coach = await prisma.coach.create({
      data: {
        user: {
          connect: {
            id: target.id,
          },
        },
      },
      include: {
        categories: {
          include: {
            category: true,
          },
        },
        user: true,
      },
    });

    response.status(201).json(coach);
  }),
);

usersRouter.delete(
  "/:id/coach-profile",
  authorizeRoles(UserRole.ADMIN),
  asyncHandler(async (request, response) => {
    const targetUserId = requireString(request.params.id, "id");
    const target = await prisma.user.findUnique({
      where: {
        id: targetUserId,
      },
      include: {
        coach: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!target) {
      throw new AppError("Korisnik nije pronađen.", 404);
    }

    if (target.role !== UserRole.ADMIN) {
      throw new AppError("Trenerski profil iz postavki moguće je ukloniti samo administratoru.", 400);
    }

    if (!target.coach) {
      response.status(204).send();
      return;
    }

    await prisma.coach.delete({
      where: {
        id: target.coach.id,
      },
    });

    response.status(204).send();
  }),
);

usersRouter.patch(
  "/:id/status",
  asyncHandler(async (request, response) => {
    const targetUserId = requireString(request.params.id, "id");
    const target = await prisma.user.findUnique({
      where: {
        id: targetUserId,
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (!target) {
      throw new AppError("Korisnik nije pronađen.", 404);
    }

    if (request.auth!.role === UserRole.COACH && target.role !== UserRole.PLAYER) {
      throw new AppError("Treneri mogu mijenjati status samo računima igrača.", 403);
    }

    const accountStatus = parseAccountStatusInput(request.body.accountStatus);

    const user = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        accountStatus,
      },
    });

    response.json(user);
  }),
);
