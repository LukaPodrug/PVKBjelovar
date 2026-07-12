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
