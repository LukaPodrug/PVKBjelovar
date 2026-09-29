import { SignupStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import { uploadSignupImages } from "../middlewares/upload";
import { suggestCategoryIdForDateOfBirth } from "../services/category.service";
import {
  approveSignupRequest,
  declineSignupRequest,
  reopenSignupRequest,
} from "../services/signup.service";
import {
  normalizeEmail,
  buildPaginatedResponse,
  parseBooleanInput,
  parseDateInput,
  parsePaginationInput,
  requireString,
} from "../utils/request-parsers";
import {
  buildPersonImageTitle,
  getUploadedFileMap,
  resolveUploadedImageUrl,
} from "../utils/upload-helpers";

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

/**
 * Parses the parent and child fields shared by the public signup form and the admin edit of a
 * pending or declined signup. Images and GDPR consent are handled by the callers.
 */
function parseSignupDetails(body: Record<string, unknown>) {
  const hasSecondParent = Boolean(
    body.parentTwoFirstName || body.parentTwoLastName || body.parentTwoEmail || body.parentTwoPhone,
  );
  const parentOneEmail = normalizeEmail(body.parentOneEmail, "parentOneEmail");
  const parentTwoEmail = hasSecondParent ? normalizeEmail(body.parentTwoEmail, "parentTwoEmail") : null;

  if (parentTwoEmail && parentTwoEmail === parentOneEmail) {
    throw new AppError("Roditelji moraju imati različite e-adrese.", 400);
  }

  return {
    parentOneFirstName: requireString(body.parentOneFirstName, "parentOneFirstName"),
    parentOneLastName: requireString(body.parentOneLastName, "parentOneLastName"),
    parentOneEmail,
    parentOnePhone: requireString(body.parentOnePhone, "parentOnePhone"),
    parentTwoFirstName: hasSecondParent ? requireString(body.parentTwoFirstName, "parentTwoFirstName") : null,
    parentTwoLastName: hasSecondParent ? requireString(body.parentTwoLastName, "parentTwoLastName") : null,
    parentTwoEmail,
    parentTwoPhone: hasSecondParent ? requireString(body.parentTwoPhone, "parentTwoPhone") : null,
    childFirstName: requireString(body.childFirstName, "childFirstName"),
    childLastName: requireString(body.childLastName, "childLastName"),
    childDateOfBirth: parseDateInput(body.childDateOfBirth, "childDateOfBirth"),
    childOib: requireString(body.childOib, "childOib"),
    childAddress: requireString(body.childAddress, "childAddress"),
  };
}

signupsRouter.post(
  "/",
  uploadSignupImages,
  asyncHandler(async (request, response) => {
    const files = getUploadedFileMap(request.files);

    const details = parseSignupDetails(request.body);
    const suggestedCategoryId = await suggestCategoryIdForDateOfBirth(details.childDateOfBirth);

    const signupRequest = await prisma.signupRequest.create({
      data: {
        ...details,
        parentOneProfileImageUrl: await resolveUploadedImageUrl(
          files.parentOneProfileImage?.[0],
          buildPersonImageTitle(details.parentOneFirstName, details.parentOneLastName),
          request.body.parentOneProfileImageUrl,
        ),
        parentTwoProfileImageUrl: details.parentTwoFirstName
          ? await resolveUploadedImageUrl(
              files.parentTwoProfileImage?.[0],
              buildPersonImageTitle(details.parentTwoFirstName, details.parentTwoLastName!),
              request.body.parentTwoProfileImageUrl,
            )
          : null,
        childProfileImageUrl: await resolveUploadedImageUrl(
          files.childProfileImage?.[0],
          buildPersonImageTitle(details.childFirstName, details.childLastName),
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

signupsRouter.patch(
  "/:id",
  asyncHandler(async (request, response) => {
    const signupRequestId = requireString(request.params.id, "id");
    const signup = await prisma.signupRequest.findUnique({
      where: { id: signupRequestId },
    });

    if (!signup) {
      throw new AppError("Zahtjev za prijavu nije pronađen.", 404);
    }

    if (signup.status === SignupStatus.APPROVED) {
      throw new AppError("Odobrenu prijavu nije moguće uređivati.", 400);
    }

    const details = parseSignupDetails(request.body);
    const updatedSignup = await prisma.signupRequest.update({
      where: { id: signup.id },
      data: {
        ...details,
        // A removed second parent takes their photo with them.
        parentTwoProfileImageUrl: details.parentTwoFirstName ? signup.parentTwoProfileImageUrl : null,
        suggestedCategoryId: await suggestCategoryIdForDateOfBirth(details.childDateOfBirth),
      },
      include: signupInclude,
    });

    response.json(updatedSignup);
  }),
);

signupsRouter.patch(
  "/:id/reopen",
  asyncHandler(async (request, response) => {
    const signupRequestId = requireString(request.params.id, "id");
    const result = await reopenSignupRequest(signupRequestId);

    response.json(result);
  }),
);
