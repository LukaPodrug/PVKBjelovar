import { UserRole } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import { uploadClubLogo } from "../middlewares/upload";
import { requireString } from "../utils/request-parsers";
import { resolveUploadedImageUrl } from "../utils/upload-helpers";

export const clubSettingsRouter = Router();

const clubSettingsId = "club-settings";
const defaultClubSettings = {
  id: clubSettingsId,
  clubName: "PVK Bjelovar",
  logoUrl: null,
  contactEmail: "info@pvkbjelovar.com",
  contactPhone: "+385",
};

clubSettingsRouter.get(
  "/",
  asyncHandler(async (_request, response) => {
    const settings = await prisma.clubSettings.upsert({
      where: { id: clubSettingsId },
      update: {},
      create: defaultClubSettings,
    });

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
      where: { id: clubSettingsId },
      update: {
        clubName: requireString(request.body.clubName, "clubName"),
        contactEmail: requireString(request.body.contactEmail, "contactEmail"),
        contactPhone: requireString(request.body.contactPhone, "contactPhone"),
        logoUrl,
      },
      create: {
        id: clubSettingsId,
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
    const hasLogoInput = Boolean(request.file || request.body.logoUrl);
    const logoUrl = hasLogoInput
      ? await resolveUploadedImageUrl(request.file, "Club settings logo", request.body.logoUrl)
      : undefined;

    const settings = await prisma.clubSettings.upsert({
      where: { id: clubSettingsId },
      update: {
        clubName: request.body.clubName
          ? requireString(request.body.clubName, "clubName")
          : undefined,
        contactEmail: request.body.contactEmail
          ? requireString(request.body.contactEmail, "contactEmail")
          : undefined,
        contactPhone: request.body.contactPhone
          ? requireString(request.body.contactPhone, "contactPhone")
          : undefined,
        logoUrl,
      },
      create: {
        ...defaultClubSettings,
        clubName: request.body.clubName
          ? requireString(request.body.clubName, "clubName")
          : defaultClubSettings.clubName,
        contactEmail: request.body.contactEmail
          ? requireString(request.body.contactEmail, "contactEmail")
          : defaultClubSettings.contactEmail,
        contactPhone: request.body.contactPhone
          ? requireString(request.body.contactPhone, "contactPhone")
          : defaultClubSettings.contactPhone,
        logoUrl: hasLogoInput ? (logoUrl ?? null) : defaultClubSettings.logoUrl,
      },
    });

    response.json(settings);
  }),
);
