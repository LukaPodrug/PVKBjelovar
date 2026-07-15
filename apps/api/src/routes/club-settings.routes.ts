import { UserRole } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import { uploadClubLogo } from "../middlewares/upload";
import { optionalString, requireString } from "../utils/request-parsers";
import { resolveUploadedImageUrl } from "../utils/upload-helpers";

export const clubSettingsRouter = Router();

const clubSettingsId = "club-settings";
const defaultClubSettings = {
  id: clubSettingsId,
  clubName: "PVK Bjelovar",
  clubSubtitle: "Plivački vaterpolski klub",
  logoUrl: null,
  contactEmail: "info@pvkbjelovar.com",
  contactPhone: "+385",
  facebookUrl: null,
  instagramUrl: null,
  youtubeUrl: null,
  bankRecipient: null,
  bankIban: null,
  bankName: null,
};

function hasBodyField(body: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, field);
}

function readOptionalBodyString(body: Record<string, unknown>, field: string): string | null | undefined {
  return hasBodyField(body, field) ? optionalString(body[field]) : undefined;
}

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
        clubSubtitle: optionalString(request.body.clubSubtitle),
        contactEmail: requireString(request.body.contactEmail, "contactEmail"),
        contactPhone: requireString(request.body.contactPhone, "contactPhone"),
        facebookUrl: optionalString(request.body.facebookUrl),
        instagramUrl: optionalString(request.body.instagramUrl),
        youtubeUrl: optionalString(request.body.youtubeUrl),
        bankRecipient: optionalString(request.body.bankRecipient),
        bankIban: optionalString(request.body.bankIban),
        bankName: optionalString(request.body.bankName),
        logoUrl,
      },
      create: {
        id: clubSettingsId,
        clubName: requireString(request.body.clubName, "clubName"),
        clubSubtitle: optionalString(request.body.clubSubtitle),
        contactEmail: requireString(request.body.contactEmail, "contactEmail"),
        contactPhone: requireString(request.body.contactPhone, "contactPhone"),
        facebookUrl: optionalString(request.body.facebookUrl),
        instagramUrl: optionalString(request.body.instagramUrl),
        youtubeUrl: optionalString(request.body.youtubeUrl),
        bankRecipient: optionalString(request.body.bankRecipient),
        bankIban: optionalString(request.body.bankIban),
        bankName: optionalString(request.body.bankName),
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
        clubSubtitle: readOptionalBodyString(request.body, "clubSubtitle"),
        facebookUrl: readOptionalBodyString(request.body, "facebookUrl"),
        instagramUrl: readOptionalBodyString(request.body, "instagramUrl"),
        youtubeUrl: readOptionalBodyString(request.body, "youtubeUrl"),
        bankRecipient: readOptionalBodyString(request.body, "bankRecipient"),
        bankIban: readOptionalBodyString(request.body, "bankIban"),
        bankName: readOptionalBodyString(request.body, "bankName"),
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
        clubSubtitle: readOptionalBodyString(request.body, "clubSubtitle") ?? defaultClubSettings.clubSubtitle,
        facebookUrl: readOptionalBodyString(request.body, "facebookUrl") ?? defaultClubSettings.facebookUrl,
        instagramUrl: readOptionalBodyString(request.body, "instagramUrl") ?? defaultClubSettings.instagramUrl,
        youtubeUrl: readOptionalBodyString(request.body, "youtubeUrl") ?? defaultClubSettings.youtubeUrl,
        bankRecipient: readOptionalBodyString(request.body, "bankRecipient") ?? defaultClubSettings.bankRecipient,
        bankIban: readOptionalBodyString(request.body, "bankIban") ?? defaultClubSettings.bankIban,
        bankName: readOptionalBodyString(request.body, "bankName") ?? defaultClubSettings.bankName,
        logoUrl: hasLogoInput ? (logoUrl ?? null) : defaultClubSettings.logoUrl,
      },
    });

    response.json(settings);
  }),
);
