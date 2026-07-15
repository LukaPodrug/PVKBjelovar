import { env, isProduction } from "../config/env";
import { AppError } from "../errors/app-error";
import { prisma } from "../lib/prisma";
import { emailService } from "./email.service";
import { generateTemporaryPassword, hashPassword } from "./password.service";

export interface CredentialDeliveryResult {
  emailSent: boolean;
  login: string;
  password: string;
  recipients: string[];
}

export function buildDevelopmentCredentials(result: CredentialDeliveryResult) {
  if (isProduction()) {
    return undefined;
  }

  return {
    login: result.login,
    password: result.password,
    recipients: result.recipients,
  };
}

export async function resetCoachCredentials(coachId: string): Promise<CredentialDeliveryResult> {
  const coach = await prisma.coach.findUnique({
    where: { id: coachId },
    include: { user: true },
  });

  if (!coach) {
    throw new AppError("Trener nije pronađen.", 404);
  }

  if (!coach.user.email) {
    throw new AppError("Trener nema e-adresu za slanje pristupnih podataka.", 400);
  }

  const password = generateTemporaryPassword();
  await updateUserPassword(coach.userId, password);

  return sendCoachCredentials(coachId, password);
}

export async function sendCoachCredentials(
  coachId: string,
  password: string,
): Promise<CredentialDeliveryResult> {
  const coach = await prisma.coach.findUnique({
    where: { id: coachId },
    include: { user: true },
  });

  if (!coach) {
    throw new AppError("Trener nije pronađen.", 404);
  }

  if (!coach.user.email) {
    throw new AppError("Trener nema e-adresu za slanje pristupnih podataka.", 400);
  }

  const clubName = await getClubName();
  const emailSent = await emailService.sendCredentialsEmail({
    to: coach.user.email,
    firstName: coach.user.firstName,
    clubName,
    login: coach.user.email,
    password,
  });

  return {
    emailSent,
    login: coach.user.email,
    password,
    recipients: [coach.user.email],
  };
}

export async function resetParentCredentials(parentId: string): Promise<CredentialDeliveryResult> {
  const parent = await prisma.parent.findUnique({
    where: { id: parentId },
    include: { user: true },
  });

  if (!parent) {
    throw new AppError("Roditelj nije pronađen.", 404);
  }

  const password = generateTemporaryPassword();
  await updateUserPassword(parent.userId, password);

  return sendParentCredentials(parentId, password);
}

export async function resetPlayerCredentials(playerId: string): Promise<CredentialDeliveryResult> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: { user: true },
  });

  if (!player) {
    throw new AppError("Igrač nije pronađen.", 404);
  }

  const password = generateTemporaryPassword();
  await updateUserPassword(player.userId, password);

  return sendPlayerCredentials(playerId, password);
}

export async function sendPlayerCredentials(
  playerId: string,
  password: string,
): Promise<CredentialDeliveryResult> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: { user: true },
  });

  if (!player) {
    throw new AppError("Igrač nije pronađen.", 404);
  }

  if (!player.user.email) {
    return sendPlayerCredentialsToParents(playerId, password);
  }

  const clubName = await getClubName();
  const login = player.user.email;
  const emailSent = await emailService.sendCredentialsEmail({
    to: player.user.email,
    firstName: player.user.firstName,
    clubName,
    login,
    password,
  });

  return {
    emailSent,
    login,
    password,
    recipients: [player.user.email],
  };
}

export async function sendParentCredentials(
  parentId: string,
  password: string,
): Promise<CredentialDeliveryResult> {
  const parent = await prisma.parent.findUnique({
    where: { id: parentId },
    include: { user: true },
  });

  if (!parent) {
    throw new AppError("Roditelj nije pronađen.", 404);
  }

  if (!parent.user.email) {
    throw new AppError("Roditelj nema e-adresu za slanje pristupnih podataka.", 400);
  }

  const clubName = await getClubName();
  const emailSent = await emailService.sendCredentialsEmail({
    to: parent.user.email,
    firstName: parent.user.firstName,
    clubName,
    login: parent.user.email,
    password,
  });

  return {
    emailSent,
    login: parent.user.email,
    password,
    recipients: [parent.user.email],
  };
}

export async function sendPlayerCredentialsToParents(
  playerId: string,
  password: string,
): Promise<CredentialDeliveryResult> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: {
      user: true,
      parents: {
        include: {
          parent: {
            include: {
              user: true,
            },
          },
        },
      },
    },
  });

  if (!player) {
    throw new AppError("Igrač nije pronađen.", 404);
  }

  if (!player.user.username) {
    throw new AppError("Igrač nema korisničko ime za prijavu.", 400);
  }

  const recipients = Array.from(
    new Map(
      player.parents
        .map((assignment) => assignment.parent.user)
        .filter((user) => Boolean(user.email))
        .map((user) => [user.email?.toLowerCase(), user] as const),
    ).values(),
  );

  if (recipients.length === 0) {
    throw new AppError(
      "Igrač nema povezanog roditelja s e-adresom za slanje pristupnih podataka.",
      400,
    );
  }

  const clubName = await getClubName();
  const emailResults = await Promise.all(
    recipients.map((recipient) =>
      emailService.sendCredentialsEmail({
        to: recipient.email ?? "",
        firstName: recipient.firstName,
        clubName,
        login: player.user.username ?? "",
        password,
      }),
    ),
  );

  return {
    emailSent: emailResults.some(Boolean),
    login: player.user.username,
    password,
    recipients: recipients.map((recipient) => recipient.email ?? ""),
  };
}

async function updateUserPassword(userId: string, password: string) {
  const passwordHash = await hashPassword(password);

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: true,
    },
  });
}

async function getClubName() {
  const clubSettings = await prisma.clubSettings.findUnique({
    where: { id: "club-settings" },
    select: { clubName: true },
  });

  return clubSettings?.clubName ?? env.defaultClubName;
}
