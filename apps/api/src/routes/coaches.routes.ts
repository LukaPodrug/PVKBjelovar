import { AccountStatus, Prisma, UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import { uploadProfileImage } from "../middlewares/upload";
import { emailService } from "../services/email.service";
import { generateTemporaryPassword, hashPassword } from "../services/password.service";
import {
  buildPaginatedResponse,
  normalizeEmail,
  optionalString,
  parseOptionalAccountStatusInput,
  parseOptionalBooleanInput,
  parsePaginationInput,
  parseStringArrayInput,
  requireString,
} from "../utils/request-parsers";
import { resolveUploadedImageUrl } from "../utils/upload-helpers";

const coachInclude = {
  user: true,
  categories: {
    include: {
      category: true,
    },
  },
} as const;

export const coachesRouter = Router();

coachesRouter.use(authenticateRequest, authorizeRoles(UserRole.ADMIN, UserRole.COACH));

coachesRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const pagination = parsePaginationInput(request.query);
    const search = optionalString(request.query.search ?? request.query.q);
    const where: Prisma.CoachWhereInput = search
      ? {
          OR: [
            { user: { firstName: { contains: search, mode: "insensitive" } } },
            { user: { lastName: { contains: search, mode: "insensitive" } } },
            { user: { email: { contains: search, mode: "insensitive" } } },
            { user: { phone: { contains: search, mode: "insensitive" } } },
            {
              categories: {
                some: { category: { name: { contains: search, mode: "insensitive" } } },
              },
            },
          ],
        }
      : {};
    const [coaches, total] = await prisma.$transaction([
      prisma.coach.findMany({
        where,
        include: coachInclude,
        orderBy: {
          createdAt: "desc",
        },
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.coach.count({ where }),
    ]);

    response.json(buildPaginatedResponse(coaches, total, pagination));
  }),
);

coachesRouter.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const coachId = requireString(request.params.id, "id");
    const coach = await prisma.coach.findUnique({
      where: { id: coachId },
      include: coachInclude,
    });

    if (!coach) {
      throw new AppError("Trener nije pronađen.", 404);
    }

    response.json(coach);
  }),
);

coachesRouter.post(
  "/",
  authorizeRoles(UserRole.ADMIN),
  uploadProfileImage,
  asyncHandler(async (request, response) => {
    const categoryIds = parseStringArrayInput(request.body.categoryIds);
    const isConditioningCoach = parseOptionalBooleanInput(request.body.isConditioningCoach) ?? false;
    const email = normalizeEmail(request.body.email, "email");
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const profileImageUrl = await resolveUploadedImageUrl(
      request.file,
      `Coach ${email} profile image`,
      request.body.profileImageUrl,
    );

    const coach = await prisma.coach.create({
      data: {
        isConditioningCoach,
        user: {
          create: {
            role: UserRole.COACH,
            email,
            passwordHash,
            firstName: requireString(request.body.firstName, "firstName"),
            lastName: requireString(request.body.lastName, "lastName"),
            phone: optionalString(request.body.phone),
            profileImageUrl,
            accountStatus:
              parseOptionalAccountStatusInput(request.body.accountStatus) ?? AccountStatus.ACTIVE,
            mustChangePassword: true,
          },
        },
        categories:
          !isConditioningCoach && categoryIds.length > 0
            ? {
                create: categoryIds.map((categoryId) => ({
                  category: {
                    connect: { id: categoryId },
                  },
                })),
              }
            : undefined,
      },
      include: coachInclude,
    });

    const clubSettings = await prisma.clubSettings.findUnique({
      where: { id: "club-settings" },
      select: { clubName: true },
    });

    const emailSent = await emailService.sendCredentialsEmail({
      to: email,
      firstName: coach.user.firstName,
      clubName: clubSettings?.clubName ?? "PVK Mladost Bjelovar",
      login: email,
      password: temporaryPassword,
    });

    response.status(201).json({
      coach,
      emailSent,
      developmentCredentials:
        process.env.NODE_ENV === "production"
          ? undefined
          : {
              email,
              password: temporaryPassword,
            },
    });
  }),
);

coachesRouter.patch(
  "/:id",
  authorizeRoles(UserRole.ADMIN),
  uploadProfileImage,
  asyncHandler(async (request, response) => {
    const coachId = requireString(request.params.id, "id");
    const categoryIds = parseStringArrayInput(request.body.categoryIds);

    const existingCoach = await prisma.coach.findUnique({
      where: { id: coachId },
      include: { user: true },
    });

    if (!existingCoach) {
      response.status(404).json({ message: "Trener nije pronađen." });
      return;
    }

    const requestedIsConditioningCoach = parseOptionalBooleanInput(request.body.isConditioningCoach);
    const nextIsConditioningCoach =
      requestedIsConditioningCoach ?? existingCoach.isConditioningCoach;

    const coach = await prisma.coach.update({
      where: { id: coachId },
      data: {
        isConditioningCoach: requestedIsConditioningCoach,
        user: {
          update: {
            firstName: request.body.firstName ? requireString(request.body.firstName, "firstName") : undefined,
            lastName: request.body.lastName ? requireString(request.body.lastName, "lastName") : undefined,
            email: request.body.email ? normalizeEmail(request.body.email, "email") : undefined,
            phone: request.body.phone !== undefined ? optionalString(request.body.phone) : undefined,
            profileImageUrl:
              request.file || request.body.profileImageUrl
                ? await resolveUploadedImageUrl(
                    request.file,
                    `Coach ${coachId} profile image`,
                    request.body.profileImageUrl,
                  )
                : undefined,
            accountStatus: parseOptionalAccountStatusInput(request.body.accountStatus),
          },
        },
        categories:
          nextIsConditioningCoach
            ? {
                deleteMany: {},
              }
            : categoryIds.length > 0 || request.body.categoryIds
            ? {
                deleteMany: {},
                create: categoryIds.map((categoryId) => ({
                  category: {
                    connect: { id: categoryId },
                  },
                })),
              }
            : undefined,
      },
      include: coachInclude,
    });

    response.json(coach);
  }),
);

coachesRouter.delete(
  "/:id",
  authorizeRoles(UserRole.ADMIN),
  asyncHandler(async (request, response) => {
    const coachId = requireString(request.params.id, "id");
    const coach = await prisma.coach.findUnique({
      where: { id: coachId },
      select: { userId: true },
    });

    if (!coach) {
      response.status(404).json({ message: "Trener nije pronađen." });
      return;
    }

    await prisma.user.delete({
      where: {
        id: coach.userId,
      },
    });

    response.status(204).send();
  }),
);
