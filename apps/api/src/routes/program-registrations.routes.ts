import { CategoryKind, ProgramAudience, UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import {
  buildProgramPayment,
  findNextProgramSession,
  formatPaymentReference,
} from "../services/public-program.service";
import {
  normalizeEmail,
  parseBooleanInput,
  parseDateInput,
  requireString,
} from "../utils/request-parsers";

/**
 * One-off practice signups for PUBLIC programs (e.g. open days). No accounts are created: the
 * family signs up for a slot of the next practice day and pays by bank transfer.
 */
export const programRegistrationsRouter = Router();

const maxListedRegistrations = 500;

programRegistrationsRouter.post(
  "/",
  asyncHandler(async (request, response) => {
    const categoryId = requireString(request.body.categoryId, "categoryId");
    const slotId = requireString(request.body.slotId, "slotId");

    if (!parseBooleanInput(request.body.gdprConsent, "gdprConsent")) {
      throw new AppError("Za prijavu je potrebna GDPR suglasnost.", 400);
    }

    const [program, clubSettings] = await Promise.all([
      prisma.category.findFirst({
        where: { id: categoryId, kind: CategoryKind.PROGRAM, audience: ProgramAudience.PUBLIC },
        include: { programSlots: true },
      }),
      prisma.clubSettings.findUnique({ where: { id: "club-settings" } }),
    ]);

    if (!program || program.pricePerPracticeCents === null) {
      throw new AppError("Odabrani program nije pronađen.", 404);
    }

    // Only the next practice day is open, and its signups close at the program's deadline.
    const session = findNextProgramSession(program);
    const slot = session?.slots.find((entry) => entry.id === slotId);

    if (!session || !slot) {
      throw new AppError("Prijave za odabrani termin su zatvorene. Osvježite stranicu i odaberite novi termin.", 409);
    }

    const registration = await prisma.programRegistration.create({
      data: {
        categoryId: program.id,
        sessionDate: new Date(`${session.date}T00:00:00.000Z`),
        startTime: slot.startTime,
        endTime: slot.endTime,
        childFirstName: requireString(request.body.childFirstName, "childFirstName"),
        childLastName: requireString(request.body.childLastName, "childLastName"),
        childDateOfBirth: parseDateInput(request.body.childDateOfBirth, "childDateOfBirth"),
        parentFirstName: requireString(request.body.parentFirstName, "parentFirstName"),
        parentLastName: requireString(request.body.parentLastName, "parentLastName"),
        parentEmail: normalizeEmail(request.body.parentEmail, "parentEmail"),
        parentPhone: requireString(request.body.parentPhone, "parentPhone"),
        gdprConsent: true,
        priceCents: program.pricePerPracticeCents,
      },
    });

    const payment = buildProgramPayment(
      { ...registration, programName: program.name },
      {
        bankRecipient: clubSettings?.bankRecipient ?? null,
        bankIban: clubSettings?.bankIban ?? null,
        bankName: clubSettings?.bankName ?? null,
        bankRecipientAddress: clubSettings?.bankRecipientAddress ?? null,
        bankRecipientCity: clubSettings?.bankRecipientCity ?? null,
      },
    );

    response.status(201).json({
      message: "Prijava je zaprimljena.",
      registration: {
        id: registration.id,
        programName: program.name,
        sessionDate: session.date,
        startTime: registration.startTime,
        endTime: registration.endTime,
        childFirstName: registration.childFirstName,
        childLastName: registration.childLastName,
        priceCents: registration.priceCents,
      },
      payment,
    });
  }),
);

programRegistrationsRouter.use(authenticateRequest, authorizeRoles(UserRole.ADMIN));

programRegistrationsRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const categoryId = requireString(request.query.categoryId, "categoryId");
    const registrations = await prisma.programRegistration.findMany({
      where: { categoryId },
      orderBy: [{ sessionDate: "desc" }, { startTime: "asc" }, { createdAt: "asc" }],
      take: maxListedRegistrations,
    });

    response.json(
      registrations.map((registration) => ({
        ...registration,
        sessionDate: registration.sessionDate.toISOString().slice(0, 10),
        paymentReference: formatPaymentReference(registration.referenceNumber, registration.sessionDate),
      })),
    );
  }),
);

programRegistrationsRouter.delete(
  "/:id",
  asyncHandler(async (request, response) => {
    const registrationId = requireString(request.params.id, "id");
    await prisma.programRegistration.delete({ where: { id: registrationId } });

    response.status(204).send();
  }),
);
