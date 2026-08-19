import { UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import { uploadSponsorLogo } from "../middlewares/upload";
import {
  buildPaginatedResponse,
  optionalString,
  parsePaginationInput,
  requireString,
} from "../utils/request-parsers";
import { resolveUploadedImageUrl } from "../utils/upload-helpers";

const sponsorOrderBy = [{ displayOrder: "asc" as const }, { name: "asc" as const }];

export const sponsorsRouter = Router();

sponsorsRouter.get(
  "/public",
  asyncHandler(async (_request, response) => {
    const sponsors = await prisma.sponsor.findMany({
      orderBy: sponsorOrderBy,
    });

    response.json(sponsors.map(serializeSponsor));
  }),
);

sponsorsRouter.use(authenticateRequest, authorizeRoles(UserRole.ADMIN));

sponsorsRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const pagination = parsePaginationInput(request.query);
    const [sponsors, total] = await Promise.all([
      prisma.sponsor.findMany({
        orderBy: sponsorOrderBy,
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.sponsor.count(),
    ]);

    response.json(buildPaginatedResponse(sponsors.map(serializeSponsor), total, pagination));
  }),
);

sponsorsRouter.post(
  "/",
  uploadSponsorLogo,
  asyncHandler(async (request, response) => {
    const name = requireString(request.body.name, "name");
    const websiteUrl = normalizeWebsiteUrl(request.body.websiteUrl);
    const logoUrl = await resolveUploadedImageUrl(
      request.file,
      `Sponsor ${name} logo`,
      request.body.logoUrl,
    );
    const displayOrder = parseOptionalDisplayOrderInput(request.body.displayOrder);

    if (!logoUrl) {
      throw new AppError("Logo sponzora je obavezan.", 400);
    }

    const sponsor = await prisma.sponsor.create({
      data: {
        name,
        websiteUrl,
        logoUrl,
        displayOrder: displayOrder ?? 0,
      },
    });

    response.status(201).json(serializeSponsor(sponsor));
  }),
);

sponsorsRouter.patch(
  "/:id",
  uploadSponsorLogo,
  asyncHandler(async (request, response) => {
    const sponsorId = requireString(request.params.id, "id");
    const existingSponsor = await prisma.sponsor.findUnique({
      where: {
        id: sponsorId,
      },
    });

    if (!existingSponsor) {
      throw new AppError("Sponzor nije pronađen.", 404);
    }

    const nextName = optionalString(request.body.name);
    const displayOrder =
      request.body.displayOrder !== undefined
        ? parseOptionalDisplayOrderInput(request.body.displayOrder)
        : undefined;
    const logoUrl = request.file || request.body.logoUrl
      ? await resolveRequiredSponsorLogoUrl(
          request.file,
          `Sponsor ${nextName ?? existingSponsor.name} logo`,
          request.body.logoUrl,
        )
      : undefined;

    const sponsor = await prisma.sponsor.update({
      where: {
        id: sponsorId,
      },
      data: {
        name: nextName ?? undefined,
        websiteUrl:
          request.body.websiteUrl !== undefined
            ? normalizeWebsiteUrl(request.body.websiteUrl)
            : undefined,
        logoUrl,
        displayOrder,
      },
    });

    response.json(serializeSponsor(sponsor));
  }),
);

sponsorsRouter.delete(
  "/:id",
  asyncHandler(async (request, response) => {
    const sponsorId = requireString(request.params.id, "id");

    await prisma.sponsor.delete({
      where: {
        id: sponsorId,
      },
    });

    response.status(204).send();
  }),
);

function normalizeWebsiteUrl(value: unknown) {
  const rawValue = requireString(value, "websiteUrl");
  const urlValue = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;

  try {
    const parsedUrl = new URL(urlValue);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }

    return parsedUrl.toString();
  } catch {
    throw new AppError("URL sponzora nije ispravan.", 400);
  }
}

function parseOptionalDisplayOrderInput(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numericValue = typeof value === "number" ? value : Number(String(value));

  if (!Number.isInteger(numericValue) || numericValue < 0) {
    throw new AppError("Redoslijed mora biti cijeli broj veći ili jednak 0.", 400);
  }

  return numericValue;
}

async function resolveRequiredSponsorLogoUrl(
  file: Express.Multer.File | undefined,
  title: string,
  fallbackValue?: unknown,
) {
  const logoUrl = await resolveUploadedImageUrl(file, title, fallbackValue);

  if (!logoUrl) {
    throw new AppError("Logo sponzora je obavezan.", 400);
  }

  return logoUrl;
}

function serializeSponsor(sponsor: {
  id: string;
  name: string;
  logoUrl: string;
  websiteUrl: string;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: sponsor.id,
    name: sponsor.name,
    logoUrl: sponsor.logoUrl,
    websiteUrl: sponsor.websiteUrl,
    displayOrder: sponsor.displayOrder,
    createdAt: sponsor.createdAt.toISOString(),
    updatedAt: sponsor.updatedAt.toISOString(),
  };
}
