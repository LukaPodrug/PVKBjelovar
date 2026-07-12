import { UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import { uploadClubLogo } from "../middlewares/upload";
import { requireString } from "../utils/request-parsers";
import { resolveUploadedImageUrl } from "../utils/upload-helpers";

export const clubSettingsRouter = Router();

clubSettingsRouter.get(
  "/",
  asyncHandler(async (_request, response) => {
    const settings = await prisma.clubSettings.findUnique({
      where: { id: "club-settings" },
    });

    if (!settings) {
      throw new AppError("Postavke kluba nisu inicijalizirane.", 404);
    }

    response.json(settings);
  }),
);

clubSettingsRouter.post(
  "/",
  authenticateRequest,
  authorizeRoles(UserRole.ADMIN),
  uploadClubLogo,
  asyncHandler(async (request, response) => {
    const logoUrl = await resolveUploadedImageUrl(
      request.file,
      "Club settings logo",
      request.body.logoUrl,
    );

    const settings = await prisma.clubSettings.upsert({
      where: { id: "club-settings" },
      update: {
        clubName: requireString(request.body.clubName, "clubName"),
        contactEmail: requireString(request.body.contactEmail, "contactEmail"),
        contactPhone: requireString(request.body.contactPhone, "contactPhone"),
        logoUrl,
      },
      create: {
        id: "club-settings",
        clubName: requireString(request.body.clubName, "clubName"),
        contactEmail: requireString(request.body.contactEmail, "contactEmail"),
        contactPhone: requireString(request.body.contactPhone, "contactPhone"),
        logoUrl,
      },
    });

    response.status(201).json(settings);
  }),
);

clubSettingsRouter.patch(
  "/",
  authenticateRequest,
  authorizeRoles(UserRole.ADMIN),
  uploadClubLogo,
  asyncHandler(async (request, response) => {
    const current = await prisma.clubSettings.findUnique({
      where: { id: "club-settings" },
    });

    if (!current) {
      throw new AppError("Postavke kluba nisu inicijalizirane.", 404);
    }

    const settings = await prisma.clubSettings.update({
      where: { id: "club-settings" },
      data: {
        clubName: request.body.clubName ? requireString(request.body.clubName, "clubName") : undefined,
        contactEmail: request.body.contactEmail
          ? requireString(request.body.contactEmail, "contactEmail")
          : undefined,
        contactPhone: request.body.contactPhone
          ? requireString(request.body.contactPhone, "contactPhone")
          : undefined,
        logoUrl:
          request.file || request.body.logoUrl
            ? await resolveUploadedImageUrl(request.file, "Club settings logo", request.body.logoUrl)
            : undefined,
      },
    });

    response.json(settings);
  }),
);
