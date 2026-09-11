process.env.DATABASE_URL ??= "postgresql://postgres@127.0.0.1:5433/water_polo_club";

const { NotificationType, PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const demoApiOrigin = process.env.DEMO_API_ORIGIN ?? "http://192.168.1.112:4000";
const assetBaseUrl = `${demoApiOrigin}/assets`;

async function main() {
  await prisma.clubSettings.update({
    where: { id: "club-settings" },
    data: {
      logoUrl: `${assetBaseUrl}/branding/pvk-mladost-bjelovar-logo.png`,
      bankRecipient: "PVK Mladost Bjelovar",
      bankIban: "HR1723600001101234565",
      bankName: "Zagrebacka banka",
    },
  });

  await Promise.all([
    prisma.category.update({
      where: { name: "U10" },
      data: { logoUrl: `${assetBaseUrl}/categories/category-u10.svg` },
    }),
    prisma.category.update({
      where: { name: "U12" },
      data: { logoUrl: `${assetBaseUrl}/categories/category-u12.svg` },
    }),
    prisma.category.update({
      where: { name: "U14" },
      data: { logoUrl: `${assetBaseUrl}/categories/category-u14.svg` },
    }),
    prisma.category.update({
      where: { name: "U16" },
      data: { logoUrl: `${assetBaseUrl}/categories/category-u16.svg` },
    }),
    prisma.category.update({
      where: { name: "Senior Team" },
      data: { logoUrl: `${assetBaseUrl}/categories/category-senior-team.svg` },
    }),
  ]);

  const now = new Date();
  const occurrences = await prisma.scheduleOccurrence.findMany({
    where: {
      isCancelled: false,
      occurrenceDate: { lte: now },
      schedule: { categoryId: { not: null } },
    },
    select: {
      id: true,
      occurrenceDate: true,
      schedule: {
        select: {
          categoryId: true,
        },
      },
    },
    orderBy: [{ occurrenceDate: "asc" }, { id: "asc" }],
  });

  let attendanceCreated = 0;

  for (const occurrence of occurrences) {
    const players = await prisma.player.findMany({
      where: {
        categories: {
          some: {
            categoryId: occurrence.schedule.categoryId,
          },
        },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    const occurrenceDay = occurrence.occurrenceDate.getUTCDate();
    const attendanceRows = players
      .filter((_, index) => (index + occurrenceDay) % 5 !== 0)
      .map((player) => ({
        occurrenceId: occurrence.id,
        playerId: player.id,
      }));

    if (attendanceRows.length > 0) {
      const result = await prisma.scheduleAttendance.createMany({
        data: attendanceRows,
        skipDuplicates: true,
      });
      attendanceCreated += result.count;
    }
  }

  const demoUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: "master.admin@adriaticwaves.test" },
        { email: "iva.juric@adriaticwaves.test" },
        { email: "marko.peric@adriaticwaves.test" },
        { email: "roditelj1.u10.001@family.test" },
        { username: "niko-babic-0001" },
      ],
    },
    select: {
      id: true,
      role: true,
      email: true,
      username: true,
      firstName: true,
    },
  });

  await prisma.notification.deleteMany({
    where: {
      dedupeKey: {
        startsWith: "demo:",
      },
    },
  });

  const notifications = demoUsers.flatMap((user) => {
    const identifier = user.email ?? user.username ?? user.id;

    if (user.role === "PARENT") {
      return [
        {
          userId: user.id,
          type: NotificationType.MEMBERSHIP_EXPIRING,
          title: "Clanarina uskoro istjece",
          body: "Provjerite podatke za uplatu i generirajte QR nalog za clanarinu.",
          data: { demo: true },
          dedupeKey: `demo:membership:${identifier}`,
        },
        {
          userId: user.id,
          type: NotificationType.SCHEDULE_UPDATED,
          title: "Raspored treninga je azuriran",
          body: "U10 grupa ima osvjezen raspored za ovaj tjedan.",
          data: { demo: true },
          dedupeKey: `demo:schedule-parent:${identifier}`,
        },
      ];
    }

    if (user.role === "PLAYER") {
      return [
        {
          userId: user.id,
          type: NotificationType.PRACTICE_CREATED,
          title: "Danas je trening",
          body: "Otvorite skener i evidentirajte dolazak QR kodom trenera.",
          data: { demo: true },
          dedupeKey: `demo:practice-player:${identifier}`,
        },
      ];
    }

    return [
      {
        userId: user.id,
        type: NotificationType.PRACTICE_FINISHED,
        title: "Evidencija dolazaka spremna",
        body: "Otvorite trening, prikazite QR kod i zavrsite termin nakon evidencije.",
        data: { demo: true },
        dedupeKey: `demo:practice-staff:${identifier}`,
      },
    ];
  });

  if (notifications.length > 0) {
    await prisma.notification.createMany({
      data: notifications,
      skipDuplicates: true,
    });
  }

  console.log(
    JSON.stringify(
      {
        bankSettings: "ready",
        assetBaseUrl,
        pastOccurrences: occurrences.length,
        attendanceCreated,
        notificationsCreated: notifications.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
