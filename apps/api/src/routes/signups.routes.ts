import { SignupStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import { uploadSignupImages } from "../middlewares/upload";
import { suggestCategoryIdForDateOfBirth } from "../services/category.service";
import { approveSignupRequest, declineSignupRequest } from "../services/signup.service";
import {
  normalizeEmail,
  buildPaginatedResponse,
  parseBooleanInput,
  parseDateInput,
  parsePaginationInput,
  requireString,
} from "../utils/request-parsers";
import { getUploadedFileMap, resolveUploadedImageUrl } from "../utils/upload-helpers";

const signupInclude = {
  suggestedCategory: true,
  assignedCategory: true,
  reviewedBy: true,
  approvedPrimaryParent: {
    include: {
      user: true,
    },
  },
  approvedSecondaryParent: {
    include: {
      user: true,
    },
  },
  approvedPlayer: {
    include: {
      user: true,
    },
  },
} as const;

export const signupsRouter = Router();

signupsRouter.post(
  "/",
  uploadSignupImages,
  asyncHandler(async (request, response) => {
    const files = getUploadedFileMap(request.files);

    const childDateOfBirth = parseDateInput(request.body.childDateOfBirth, "childDateOfBirth");
    const hasSecondParent = Boolean(
      request.body.parentTwoFirstName ||
        request.body.parentTwoLastName ||
        request.body.parentTwoEmail ||
        request.body.parentTwoPhone,
    );

    if (hasSecondParent) {
      requireString(request.body.parentTwoFirstName, "parentTwoFirstName");
      requireString(request.body.parentTwoLastName, "parentTwoLastName");
      requireString(request.body.parentTwoEmail, "parentTwoEmail");
      requireString(request.body.parentTwoPhone, "parentTwoPhone");
    }

    const suggestedCategoryId = await suggestCategoryIdForDateOfBirth(childDateOfBirth);

    const signupRequest = await prisma.signupRequest.create({
      data: {
        parentOneFirstName: requireString(request.body.parentOneFirstName, "parentOneFirstName"),
        parentOneLastName: requireString(request.body.parentOneLastName, "parentOneLastName"),
        parentOneEmail: normalizeEmail(request.body.parentOneEmail, "parentOneEmail"),
        parentOnePhone: requireString(request.body.parentOnePhone, "parentOnePhone"),
        parentOneProfileImageUrl: await resolveUploadedImageUrl(
          files.parentOneProfileImage?.[0],
          "Signup parent one profile image",
          request.body.parentOneProfileImageUrl,
        ),
        parentTwoFirstName: hasSecondParent ? requireString(request.body.parentTwoFirstName, "parentTwoFirstName") : null,
        parentTwoLastName: hasSecondParent ? requireString(request.body.parentTwoLastName, "parentTwoLastName") : null,
        parentTwoEmail: hasSecondParent ? normalizeEmail(request.body.parentTwoEmail, "parentTwoEmail") : null,
        parentTwoPhone: hasSecondParent ? requireString(request.body.parentTwoPhone, "parentTwoPhone") : null,
        parentTwoProfileImageUrl: hasSecondParent
          ? await resolveUploadedImageUrl(
              files.parentTwoProfileImage?.[0],
              "Signup parent two profile image",
              request.body.parentTwoProfileImageUrl,
            )
          : null,
        childFirstName: requireString(request.body.childFirstName, "childFirstName"),
        childLastName: requireString(request.body.childLastName, "childLastName"),
        childDateOfBirth,
        childOib: requireString(request.body.childOib, "childOib"),
        childProfileImageUrl: await resolveUploadedImageUrl(
          files.childProfileImage?.[0],
          "Signup child profile image",
          request.body.childProfileImageUrl,
        ),
        gdprConsent: parseBooleanInput(request.body.gdprConsent, "gdprConsent"),
        suggestedCategoryId,
      },
      include: signupInclude,
    });

    response.status(201).json({
      message: "Prijava je uspješno zaprimljena.",
      signupRequest,
    });
  }),
);

signupsRouter.use(authenticateRequest, authorizeRoles(UserRole.ADMIN));

signupsRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const status =
      typeof request.query.status === "string"
        ? request.query.status.toUpperCase()
        : undefined;

    if (status && !Object.values(SignupStatus).includes(status as SignupStatus)) {
      throw new AppError("Neispravan filtar statusa prijave.", 400);
    }

    const where = {
      status: status as SignupStatus | undefined,
    };
    const pagination = parsePaginationInput(request.query);
    const [signups, total] = await Promise.all([
      prisma.signupRequest.findMany({
        where,
        include: signupInclude,
        orderBy: {
          createdAt: "desc",
        },
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.signupRequest.count({ where }),
    ]);

    response.json(buildPaginatedResponse(signups, total, pagination));
  }),
);

signupsRouter.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const signupRequestId = requireString(request.params.id, "id");
    const signup = await prisma.signupRequest.findUnique({
      where: { id: signupRequestId },
      include: signupInclude,
    });

    if (!signup) {
      throw new AppError("Zahtjev za prijavu nije pronađen.", 404);
    }

    response.json(signup);
  }),
);

signupsRouter.patch(
  "/:id/approve",
  asyncHandler(async (request, response) => {
    const signupRequestId = requireString(request.params.id, "id");
    const result = await approveSignupRequest({
      signupRequestId,
      reviewerId: request.auth!.userId,
      assignedCategoryId:
        typeof request.body.assignedCategoryId === "string"
          ? request.body.assignedCategoryId
          : undefined,
    });

    response.json(result);
  }),
);

signupsRouter.patch(
  "/:id/decline",
  asyncHandler(async (request, response) => {
    const signupRequestId = requireString(request.params.id, "id");
    const result = await declineSignupRequest({
      signupRequestId,
      reviewerId: request.auth!.userId,
      declineReason:
        typeof request.body.declineReason === "string" ? request.body.declineReason : undefined,
    });

    response.json(result);
  }),
);
