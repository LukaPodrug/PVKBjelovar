import { AccountStatus, Prisma, UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import { uploadProfileImage } from "../middlewares/upload";
import { generateTemporaryPassword, hashPassword } from "../services/password.service";
import {
  buildDevelopmentCredentials,
  resetCoachCredentials,
  sendCoachCredentials,
} from "../services/credentials.service";
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
    const categoryIds = parseStringArrayInput(request.query.categoryIds ?? request.query.categoryId);
    const isConditioningCoachFilter =
      parseOptionalBooleanInput(request.query.isConditioningCoach) ?? false;
    const searchTerms = search?.split(/\s+/).filter(Boolean) ?? [];
    const singleTermFilters: Prisma.CoachWhereInput[] = search
      ? [
          { user: { firstName: { contains: search, mode: "insensitive" } } },
          { user: { lastName: { contains: search, mode: "insensitive" } } },
        ]
      : [];
    const multiTermFilter: Prisma.CoachWhereInput | null =
      searchTerms.length > 1
        ? {
            AND: searchTerms.map((term) => ({
              OR: [
                { user: { firstName: { contains: term, mode: "insensitive" } } },
                { user: { lastName: { contains: term, mode: "insensitive" } } },
              ],
            })),
          }
        : null;
    const filters: Prisma.CoachWhereInput[] = [];

    if (search) {
      filters.push({
        OR: multiTermFilter ? [...singleTermFilters, multiTermFilter] : singleTermFilters,
      });
    }

    if (categoryIds.length > 0 || isConditioningCoachFilter) {
      const categoryFilters: Prisma.CoachWhereInput[] = [];

      if (categoryIds.length > 0) {
        categoryFilters.push({ categories: { some: { categoryId: { in: categoryIds } } } });
      }

      if (isConditioningCoachFilter) {
        categoryFilters.push({ isConditioningCoach: true });
      }

      filters.push({ OR: categoryFilters });
    }

    const where: Prisma.CoachWhereInput = filters.length > 0 ? { AND: filters } : {};
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
    const firstName = requireString(request.body.firstName, "firstName");
    const lastName = requireString(request.body.lastName, "lastName");
    const existingUser = await prisma.user.findUnique({
      where: { email },
      include: { coach: true },
    });

    if (existingUser?.coach) {
      throw new AppError("Ova e-adresa već ima trenerski profil.", 409);
    }

    if (existingUser && existingUser.role !== UserRole.ADMIN) {
      throw new AppError("Ova e-adresa je već zauzeta.", 409);
    }

    const coach = existingUser
      ? await prisma.$transaction(async (transaction) => {
          await transaction.user.update({
            where: { id: existingUser.id },
            data: {
              firstName,
              lastName,
              phone: optionalString(request.body.phone),
              profileImageUrl,
              accountStatus:
                parseOptionalAccountStatusInput(request.body.accountStatus) ?? existingUser.accountStatus,
            },
          });

          return transaction.coach.create({
            data: {
              isConditioningCoach,
              user: {
                connect: { id: existingUser.id },
              },
              categories:
                categoryIds.length > 0
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
        })
      : await prisma.coach.create({
          data: {
            isConditioningCoach,
            user: {
              create: {
                role: UserRole.COACH,
                email,
                passwordHash,
                firstName,
                lastName,
                phone: optionalString(request.body.phone),
                profileImageUrl,
                accountStatus:
                  parseOptionalAccountStatusInput(request.body.accountStatus) ?? AccountStatus.ACTIVE,
                mustChangePassword: true,
              },
            },
            categories:
              categoryIds.length > 0
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

    const credentialDelivery = existingUser
      ? null
      : await sendCoachCredentials(coach.id, temporaryPassword);

    response.status(201).json({
      coach,
      emailSent: credentialDelivery?.emailSent ?? false,
      developmentCredentials: credentialDelivery
        ? buildDevelopmentCredentials(credentialDelivery)
        : undefined,
    });
  }),
);

coachesRouter.post(
  "/:id/resend-credentials",
  authorizeRoles(UserRole.ADMIN),
  asyncHandler(async (request, response) => {
    const coachId = requireString(request.params.id, "id");
    const credentialDelivery = await resetCoachCredentials(coachId);

    response.json({
      message: credentialDelivery.emailSent
        ? "Pristupni podaci trenera su poslani."
        : "Lozinka je resetirana, ali slanje e-pošte nije konfigurirano.",
      emailSent: credentialDelivery.emailSent,
      developmentCredentials: buildDevelopmentCredentials(credentialDelivery),
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
    const removeProfileImage = parseOptionalBooleanInput(request.body.removeProfileImage) ?? false;

    const existingCoach = await prisma.coach.findUnique({
      where: { id: coachId },
      include: { user: true },
    });

    if (!existingCoach) {
      response.status(404).json({ message: "Trener nije pronađen." });
      return;
    }

    const requestedIsConditioningCoach = parseOptionalBooleanInput(request.body.isConditioningCoach);

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
              removeProfileImage
                ? null
                : request.file || request.body.profileImageUrl
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
          categoryIds.length > 0 || request.body.categoryIds
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

    const user = await prisma.user.findUnique({
      where: { id: coach.userId },
      select: { role: true },
    });

    if (user?.role === UserRole.ADMIN) {
      await prisma.coach.delete({
        where: { id: coachId },
      });
    } else {
      await prisma.user.delete({
        where: {
          id: coach.userId,
        },
      });
    }

    response.status(204).send();
  }),
);
