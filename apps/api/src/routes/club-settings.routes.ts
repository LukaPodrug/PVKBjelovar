import { UserRole } from "@prisma/client";
import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import { uploadClubLogo } from "../middlewares/upload";
import { optionalString, parseOptionalBooleanInput } from "../utils/request-parsers";
import { resolveUploadedImageUrl } from "../utils/upload-helpers";

export const clubSettingsRouter = Router();

const clubSettingsId = "club-settings";
const defaultClubSettings = {
  id: clubSettingsId,
  clubName: null,
  clubSubtitle: null,
  logoUrl: null,
  contactEmail: null,
  contactPhone: null,
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
        clubName: optionalString(request.body.clubName),
        clubSubtitle: optionalString(request.body.clubSubtitle),
        contactEmail: optionalString(request.body.contactEmail),
        contactPhone: optionalString(request.body.contactPhone),
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
        clubName: optionalString(request.body.clubName),
        clubSubtitle: optionalString(request.body.clubSubtitle),
        contactEmail: optionalString(request.body.contactEmail),
        contactPhone: optionalString(request.body.contactPhone),
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
    const removeLogo = parseOptionalBooleanInput(request.body.removeLogo) ?? false;
    const hasLogoInput = Boolean(removeLogo || request.file || request.body.logoUrl);
    const logoUrl = removeLogo
      ? null
      : hasLogoInput
      ? await resolveUploadedImageUrl(request.file, "Club settings logo", request.body.logoUrl)
      : undefined;

    const settings = await prisma.clubSettings.upsert({
      where: { id: clubSettingsId },
      update: {
        clubName: readOptionalBodyString(request.body, "clubName"),
        contactEmail: readOptionalBodyString(request.body, "contactEmail"),
        contactPhone: readOptionalBodyString(request.body, "contactPhone"),
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
        clubName: readOptionalBodyString(request.body, "clubName") ?? null,
        contactEmail: readOptionalBodyString(request.body, "contactEmail") ?? null,
        contactPhone: readOptionalBodyString(request.body, "contactPhone") ?? null,
        clubSubtitle: readOptionalBodyString(request.body, "clubSubtitle") ?? null,
        facebookUrl: readOptionalBodyString(request.body, "facebookUrl") ?? null,
        instagramUrl: readOptionalBodyString(request.body, "instagramUrl") ?? null,
        youtubeUrl: readOptionalBodyString(request.body, "youtubeUrl") ?? null,
        bankRecipient: readOptionalBodyString(request.body, "bankRecipient") ?? null,
        bankIban: readOptionalBodyString(request.body, "bankIban") ?? null,
        bankName: readOptionalBodyString(request.body, "bankName") ?? null,
        logoUrl: hasLogoInput ? (logoUrl ?? null) : defaultClubSettings.logoUrl,
      },
    });

    response.json(settings);
  }),
);
