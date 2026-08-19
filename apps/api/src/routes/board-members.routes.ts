import { UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import { uploadBoardMemberImage } from "../middlewares/upload";
import {
  buildPaginatedResponse,
  optionalString,
  parsePaginationInput,
  requireString,
} from "../utils/request-parsers";
import { resolveUploadedImageUrl } from "../utils/upload-helpers";

const boardMemberOrderBy = [{ displayOrder: "asc" as const }, { name: "asc" as const }];

export const boardMembersRouter = Router();

boardMembersRouter.get(
  "/public",
  asyncHandler(async (_request, response) => {
    const boardMembers = await prisma.boardMember.findMany({
      orderBy: boardMemberOrderBy,
    });

    response.json(boardMembers.map(serializeBoardMember));
  }),
);

boardMembersRouter.use(authenticateRequest, authorizeRoles(UserRole.ADMIN));

boardMembersRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const pagination = parsePaginationInput(request.query);
    const [boardMembers, total] = await Promise.all([
      prisma.boardMember.findMany({
        orderBy: boardMemberOrderBy,
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.boardMember.count(),
    ]);

    response.json(buildPaginatedResponse(boardMembers.map(serializeBoardMember), total, pagination));
  }),
);

boardMembersRouter.post(
  "/",
  uploadBoardMemberImage,
  asyncHandler(async (request, response) => {
    const name = requireString(request.body.name, "name");
    const position = requireString(request.body.position, "position");
    const imageUrl = await resolveRequiredBoardMemberImageUrl(
      request.file,
      `Board member ${name} image`,
      request.body.imageUrl,
    );
    const displayOrder = parseOptionalDisplayOrderInput(request.body.displayOrder);

    const boardMember = await prisma.boardMember.create({
      data: {
        name,
        position,
        imageUrl,
        displayOrder: displayOrder ?? 0,
      },
    });

    response.status(201).json(serializeBoardMember(boardMember));
  }),
);

boardMembersRouter.patch(
  "/:id",
  uploadBoardMemberImage,
  asyncHandler(async (request, response) => {
    const boardMemberId = requireString(request.params.id, "id");
    const existingBoardMember = await prisma.boardMember.findUnique({
      where: {
        id: boardMemberId,
      },
    });

    if (!existingBoardMember) {
      throw new AppError("Član uprave nije pronađen.", 404);
    }

    const nextName = optionalString(request.body.name);
    const displayOrder =
      request.body.displayOrder !== undefined
        ? parseOptionalDisplayOrderInput(request.body.displayOrder)
        : undefined;
    const imageUrl = request.file || request.body.imageUrl
      ? await resolveRequiredBoardMemberImageUrl(
          request.file,
          `Board member ${nextName ?? existingBoardMember.name} image`,
          request.body.imageUrl,
        )
      : undefined;

    const boardMember = await prisma.boardMember.update({
      where: {
        id: boardMemberId,
      },
      data: {
        name: nextName ?? undefined,
        position:
          request.body.position !== undefined
            ? requireString(request.body.position, "position")
            : undefined,
        imageUrl,
        displayOrder,
      },
    });

    response.json(serializeBoardMember(boardMember));
  }),
);

boardMembersRouter.delete(
  "/:id",
  asyncHandler(async (request, response) => {
    const boardMemberId = requireString(request.params.id, "id");

    await prisma.boardMember.delete({
      where: {
        id: boardMemberId,
      },
    });

    response.status(204).send();
  }),
);

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

async function resolveRequiredBoardMemberImageUrl(
  file: Express.Multer.File | undefined,
  title: string,
  fallbackValue?: unknown,
) {
  const imageUrl = await resolveUploadedImageUrl(file, title, fallbackValue);

  if (!imageUrl) {
    throw new AppError("Slika člana uprave je obavezna.", 400);
  }

  return imageUrl;
}

function serializeBoardMember(boardMember: {
  id: string;
  name: string;
  position: string;
  imageUrl: string;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: boardMember.id,
    name: boardMember.name,
    position: boardMember.position,
    imageUrl: boardMember.imageUrl,
    displayOrder: boardMember.displayOrder,
    createdAt: boardMember.createdAt.toISOString(),
    updatedAt: boardMember.updatedAt.toISOString(),
  };
}
