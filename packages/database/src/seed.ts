import { randomBytes, scrypt as nodeScrypt } from "node:crypto";
import { promisify } from "node:util";
import {
  AccountStatus,
  DayOfWeek,
  PrismaClient,
  SignupStatus,
  UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();
const scrypt = promisify(nodeScrypt);
const assetBaseUrl = "http://127.0.0.1:4000/assets";
const playerFirstNames = [
  "Luka",
  "Niko",
  "Toma",
  "David",
  "Jan",
  "Petar",
  "Roko",
  "Noa",
  "Toni",
  "Matej",
  "Filip",
  "Vito",
  "Leo",
  "Lovro",
  "Mia",
  "Ema",
  "Sara",
  "Lea",
  "Lucija",
  "Nika",
  "Petra",
  "Dora",
  "Marta",
  "Iva",
];
const playerLastNames = [
  "Horvat",
  "Kovacevic",
  "Babic",
  "Maric",
  "Novak",
  "Peric",
  "Juric",
  "Matic",
  "Kovacic",
  "Tomic",
  "Pavic",
  "Boric",
  "Sesar",
  "Balen",
  "Vidakovic",
  "Jovic",
];
const primaryParentFirstNames = [
  "Ana",
  "Martina",
  "Petra",
  "Ivana",
  "Marija",
  "Nikolina",
  "Matea",
  "Katarina",
  "Tihana",
  "Jelena",
  "Lucija",
  "Dora",
];
const secondaryParentFirstNames = [
  "Ivan",
  "Marko",
  "Tomislav",
  "Karlo",
  "Josip",
  "Dario",
  "Petar",
  "Filip",
  "Mario",
  "Luka",
  "Mislav",
  "Antonio",
];
const categoryRosterPlans = [
  { categoryIndex: 0, playersCount: 30, birthYears: [2016, 2017] },
  { categoryIndex: 1, playersCount: 30, birthYears: [2014, 2015] },
  { categoryIndex: 2, playersCount: 30, birthYears: [2012, 2013] },
  { categoryIndex: 3, playersCount: 30, birthYears: [2007, 2008, 2009, 2010, 2011] },
  { categoryIndex: 4, playersCount: 30, birthYears: [1996, 1997, 1998, 1999, 2000] },
] as const;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

function normalizeUsername(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function buildSeedPlayerUsername(firstName: string, lastName: string, oib: string) {
  const base = normalizeUsername(`${firstName}-${lastName}`) || "igrac";
  const suffix = oib.slice(-4);
  const maxBaseLength = Math.max(3, 31 - suffix.length);
  const trimmedBase = base.slice(0, maxBaseLength).replace(/-+$/g, "") || "igrac";

  return `${trimmedBase}-${suffix}`;
}

function nextWeekdayAt(dayOfWeek: DayOfWeek, hour: number, minute: number): Date {
  const now = new Date();
  const target = new Date(now);
  target.setUTCSeconds(0, 0);
  target.setUTCHours(hour, minute, 0, 0);

  const weekdayMap: Record<DayOfWeek, number> = {
    [DayOfWeek.MONDAY]: 1,
    [DayOfWeek.TUESDAY]: 2,
    [DayOfWeek.WEDNESDAY]: 3,
    [DayOfWeek.THURSDAY]: 4,
    [DayOfWeek.FRIDAY]: 5,
    [DayOfWeek.SATURDAY]: 6,
    [DayOfWeek.SUNDAY]: 0,
  };

  const today = target.getUTCDay();
  const targetDay = weekdayMap[dayOfWeek];
  const delta = (targetDay - today + 7) % 7 || 7;
  target.setUTCDate(target.getUTCDate() + delta);

  return target;
}

function getWeekStart(date: Date): Date {
  const start = new Date(date);
  const day = start.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + offset);
  return start;
}

function getDayOffset(dayOfWeek: DayOfWeek): number {
  const mapping: Record<DayOfWeek, number> = {
    [DayOfWeek.MONDAY]: 0,
    [DayOfWeek.TUESDAY]: 1,
    [DayOfWeek.WEDNESDAY]: 2,
    [DayOfWeek.THURSDAY]: 3,
    [DayOfWeek.FRIDAY]: 4,
    [DayOfWeek.SATURDAY]: 5,
    [DayOfWeek.SUNDAY]: 6,
  };

  return mapping[dayOfWeek];
}

function buildOccurrenceDateForWeek(weekStartDate: Date, dayOfWeek: DayOfWeek): Date {
  const occurrenceDate = new Date(weekStartDate);
  occurrenceDate.setUTCHours(12, 0, 0, 0);
  occurrenceDate.setUTCDate(occurrenceDate.getUTCDate() + getDayOffset(dayOfWeek));
  return occurrenceDate;
}

function copyTimeOfDay(targetDate: Date, referenceTime: Date): Date {
  return new Date(
    Date.UTC(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth(),
      targetDate.getUTCDate(),
      referenceTime.getUTCHours(),
      referenceTime.getUTCMinutes(),
      referenceTime.getUTCSeconds(),
      referenceTime.getUTCMilliseconds(),
    ),
  );
}

function pickValue(values: readonly string[], index: number) {
  return values[index % values.length] ?? values[0] ?? "";
}

function buildDateOfBirth(years: readonly number[], index: number): Date {
  const year = years[index % years.length] ?? years[0] ?? 2010;
  const month = (index * 3) % 12;
  const day = ((index * 7) % 27) + 1;

  return new Date(Date.UTC(year, month, day));
}

function buildMembershipExpiry(index: number): Date {
  return new Date(Date.UTC(2027, (index * 2) % 12, ((index * 5) % 27) + 1));
}

function formatSeedNumber(value: number, width = 3): string {
  return String(value).padStart(width, "0");
}

function slugifySeedLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

async function main() {
  const adminPassword = "Admin12345!";
  const coachPassword = "Coach12345!";
  const parentPassword = "Parent12345!";
  const playerPassword = "Player12345!";

  await prisma.scheduleAttendance.deleteMany();
  await prisma.scheduleOccurrenceCoach.deleteMany();
  await prisma.scheduleOccurrence.deleteMany();
  await prisma.scheduleCoach.deleteMany();
  await prisma.weeklyScheduleActivation.deleteMany();
  await prisma.weeklySchedule.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.parentPlayer.deleteMany();
  await prisma.playerCategory.deleteMany();
  await prisma.coachCategory.deleteMany();
  await prisma.signupRequest.deleteMany();
  await prisma.player.deleteMany();
  await prisma.parent.deleteMany();
  await prisma.coach.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();

  await prisma.clubSettings.upsert({
    where: { id: "club-settings" },
    update: {
      clubName: "PVK Mladost Bjelovar",
      clubSubtitle: "Plivački vaterpolski klub",
      logoUrl: `${assetBaseUrl}/branding/pvk-mladost-bjelovar-logo.png`,
      contactEmail: "info@mladostbjelovar.test",
      contactPhone: "+385911112222",
      facebookUrl: null,
      instagramUrl: null,
      youtubeUrl: null,
      bankRecipient: "PVK Mladost Bjelovar",
      bankIban: null,
      bankName: null,
    },
    create: {
      id: "club-settings",
      clubName: "PVK Mladost Bjelovar",
      clubSubtitle: "Plivački vaterpolski klub",
      logoUrl: `${assetBaseUrl}/branding/pvk-mladost-bjelovar-logo.png`,
      contactEmail: "info@mladostbjelovar.test",
      contactPhone: "+385911112222",
      facebookUrl: null,
      instagramUrl: null,
      youtubeUrl: null,
      bankRecipient: "PVK Mladost Bjelovar",
      bankIban: null,
      bankName: null,
    },
  });

  const adminPasswordHash = await hashPassword(adminPassword);
  const coachPasswordHash = await hashPassword(coachPassword);
  const parentPasswordHash = await hashPassword(parentPassword);
  const playerPasswordHash = await hashPassword(playerPassword);

  await prisma.user.create({
    data: {
      role: UserRole.ADMIN,
      email: "master.admin@adriaticwaves.test",
      passwordHash: adminPasswordHash,
      firstName: "Marta",
      lastName: "Kovac",
      phone: "+385911110001",
      accountStatus: AccountStatus.ACTIVE,
      mustChangePassword: false,
    },
  });

  const categories = await Promise.all([
    prisma.category.create({
      data: {
        name: "U10",
        logoUrl: `${assetBaseUrl}/categories/category-u10.svg`,
        endDateOfBirth: new Date("2017-12-31T00:00:00.000Z"),
      },
    }),
    prisma.category.create({
      data: {
        name: "U12",
        logoUrl: `${assetBaseUrl}/categories/category-u12.svg`,
        endDateOfBirth: new Date("2015-12-31T00:00:00.000Z"),
      },
    }),
    prisma.category.create({
      data: {
        name: "U14",
        logoUrl: `${assetBaseUrl}/categories/category-u14.svg`,
        endDateOfBirth: new Date("2013-12-31T00:00:00.000Z"),
      },
    }),
    prisma.category.create({
      data: {
        name: "U16",
        logoUrl: `${assetBaseUrl}/categories/category-u16.svg`,
        endDateOfBirth: new Date("2011-12-31T00:00:00.000Z"),
      },
    }),
    prisma.category.create({
      data: {
        name: "Senior Team",
        logoUrl: `${assetBaseUrl}/categories/category-senior-team.svg`,
        endDateOfBirth: new Date("2000-12-31T00:00:00.000Z"),
      },
    }),
  ]);

  const coachRecords = await Promise.all([
    prisma.coach.create({
      data: {
        user: {
          create: {
            role: UserRole.COACH,
            email: "iva.juric@adriaticwaves.test",
            passwordHash: coachPasswordHash,
            firstName: "Iva",
            lastName: "Juric",
            phone: "+385911110101",
            accountStatus: AccountStatus.ACTIVE,
          },
        },
      },
      include: { user: true },
    }),
    prisma.coach.create({
      data: {
        user: {
          create: {
            role: UserRole.COACH,
            email: "marko.peric@adriaticwaves.test",
            passwordHash: coachPasswordHash,
            firstName: "Marko",
            lastName: "Peric",
            phone: "+385911110102",
            accountStatus: AccountStatus.ACTIVE,
          },
        },
      },
      include: { user: true },
    }),
    prisma.coach.create({
      data: {
        user: {
          create: {
            role: UserRole.COACH,
            email: "nina.radic@adriaticwaves.test",
            passwordHash: coachPasswordHash,
            firstName: "Nina",
            lastName: "Radic",
            phone: "+385911110103",
            accountStatus: AccountStatus.ACTIVE,
          },
        },
      },
      include: { user: true },
    }),
  ]);

  await prisma.coachCategory.createMany({
    data: [
      { coachId: coachRecords[0].id, categoryId: categories[0].id },
      { coachId: coachRecords[0].id, categoryId: categories[1].id },
      { coachId: coachRecords[1].id, categoryId: categories[2].id },
      { coachId: coachRecords[1].id, categoryId: categories[3].id },
      { coachId: coachRecords[2].id, categoryId: categories[4].id },
      { coachId: coachRecords[2].id, categoryId: categories[3].id },
    ],
  });

  const playerCategoryAssignments: Array<{ playerId: string; categoryId: string }> = [];
  const parentPlayerAssignments: Array<{
    parentId: string;
    playerId: string;
    isPrimaryContact: boolean;
  }> = [];
  let generatedPlayerCount = 0;
  let generatedParentCount = 0;

  for (const plan of categoryRosterPlans) {
    const category = categories[plan.categoryIndex];
    const categorySlug = slugifySeedLabel(category.name);

    for (let playerIndex = 0; playerIndex < plan.playersCount; playerIndex += 1) {
      const serial = generatedPlayerCount + 1;
      const serialLabel = formatSeedNumber(serial);
      const childFirstName = pickValue(playerFirstNames, serial + plan.categoryIndex);
      const childLastName = pickValue(playerLastNames, serial * 2 + plan.categoryIndex);
      const primaryParentFirstName = pickValue(primaryParentFirstNames, serial + playerIndex);
      const secondaryParentFirstName = pickValue(
        secondaryParentFirstNames,
        serial + plan.categoryIndex,
      );
      const dateOfBirth = buildDateOfBirth(plan.birthYears, playerIndex);
      const oib = String(70000000000 + serial);
      const player = await prisma.player.create({
        data: {
          dateOfBirth,
          oib,
          gdprConsent: true,
          membershipExpiresAt: buildMembershipExpiry(serial),
          user: {
            create: {
              role: UserRole.PLAYER,
              username: buildSeedPlayerUsername(childFirstName, childLastName, oib),
              passwordHash: playerPasswordHash,
              firstName: childFirstName,
              lastName: childLastName,
              accountStatus: AccountStatus.ACTIVE,
              mustChangePassword: false,
            },
          },
        },
        select: {
          id: true,
        },
      });
      const primaryParent = await prisma.parent.create({
        data: {
          user: {
            create: {
              role: UserRole.PARENT,
              email: `roditelj1.${categorySlug}.${serialLabel}@family.test`,
              passwordHash: parentPasswordHash,
              firstName: primaryParentFirstName,
              lastName: childLastName,
              phone: `+38591${formatSeedNumber(400000 + serial, 6)}`,
              accountStatus: AccountStatus.ACTIVE,
            },
          },
        },
        select: {
          id: true,
        },
      });

      generatedPlayerCount += 1;
      generatedParentCount += 1;
      playerCategoryAssignments.push({
        playerId: player.id,
        categoryId: category.id,
      });
      parentPlayerAssignments.push({
        parentId: primaryParent.id,
        playerId: player.id,
        isPrimaryContact: true,
      });

      if (playerIndex % 2 === 0) {
        const secondaryParent = await prisma.parent.create({
          data: {
            user: {
              create: {
                role: UserRole.PARENT,
                email: `roditelj2.${categorySlug}.${serialLabel}@family.test`,
                passwordHash: parentPasswordHash,
                firstName: secondaryParentFirstName,
                lastName: childLastName,
                phone: `+38591${formatSeedNumber(500000 + serial, 6)}`,
                accountStatus: AccountStatus.ACTIVE,
              },
            },
          },
          select: {
            id: true,
          },
        });

        generatedParentCount += 1;
        parentPlayerAssignments.push({
          parentId: secondaryParent.id,
          playerId: player.id,
          isPrimaryContact: false,
        });
      }
    }
  }

  await prisma.playerCategory.createMany({
    data: playerCategoryAssignments,
  });

  await prisma.parentPlayer.createMany({
    data: parentPlayerAssignments,
  });

  const weeklyScheduleDefinitions = [
    {
      categoryId: categories[0].id,
      name: "U10 početni raspored",
      description: "Uvodni ritam za najmlađe skupine.",
      activateThisWeek: true,
      slots: [
        {
          dayOfWeek: DayOfWeek.MONDAY,
          startTime: nextWeekdayAt(DayOfWeek.MONDAY, 17, 0),
          endTime: nextWeekdayAt(DayOfWeek.MONDAY, 18, 0),
          notes: "Tehnika i sigurnost u vodi",
          coachIds: [coachRecords[0].id],
        },
      ],
    },
    {
      categoryId: categories[1].id,
      name: "U12 zimski raspored",
      description: "Gušći raspored rada kroz hladniji dio sezone.",
      activateThisWeek: false,
      slots: [
        {
          dayOfWeek: DayOfWeek.MONDAY,
          startTime: nextWeekdayAt(DayOfWeek.MONDAY, 18, 0),
          endTime: nextWeekdayAt(DayOfWeek.MONDAY, 19, 15),
          notes: "Tehnika, plivačka baza i rad s loptom",
          coachIds: [coachRecords[0].id],
        },
        {
          dayOfWeek: DayOfWeek.WEDNESDAY,
          startTime: nextWeekdayAt(DayOfWeek.WEDNESDAY, 18, 0),
          endTime: nextWeekdayAt(DayOfWeek.WEDNESDAY, 19, 15),
          notes: "Dodavanja i povratak u obranu",
          coachIds: [coachRecords[0].id],
        },
        {
          dayOfWeek: DayOfWeek.FRIDAY,
          startTime: nextWeekdayAt(DayOfWeek.FRIDAY, 17, 45),
          endTime: nextWeekdayAt(DayOfWeek.FRIDAY, 19, 0),
          notes: "Igra u malom prostoru i završnica",
          coachIds: [coachRecords[0].id],
        },
      ],
    },
    {
      categoryId: categories[1].id,
      name: "U12 ljetni raspored",
      description: "Raspored za topliji dio sezone s većim razmakom između treninga.",
      activateThisWeek: true,
      slots: [
        {
          dayOfWeek: DayOfWeek.TUESDAY,
          startTime: nextWeekdayAt(DayOfWeek.TUESDAY, 18, 0),
          endTime: nextWeekdayAt(DayOfWeek.TUESDAY, 19, 15),
          notes: "Rad na osnovama i ulazak u tranziciju",
          coachIds: [coachRecords[0].id],
        },
        {
          dayOfWeek: DayOfWeek.THURSDAY,
          startTime: nextWeekdayAt(DayOfWeek.THURSDAY, 18, 0),
          endTime: nextWeekdayAt(DayOfWeek.THURSDAY, 19, 15),
          notes: "Tehnika šuta i završna igra",
          coachIds: [coachRecords[0].id],
        },
      ],
    },
    {
      categoryId: categories[2].id,
      name: "U14 zimski raspored",
      description: "Natjecateljski ciklus za U14.",
      activateThisWeek: true,
      slots: [
        {
          dayOfWeek: DayOfWeek.TUESDAY,
          startTime: nextWeekdayAt(DayOfWeek.TUESDAY, 18, 30),
          endTime: nextWeekdayAt(DayOfWeek.TUESDAY, 20, 0),
          notes: "Obrambene rotacije i igra s igračem manje",
          coachIds: [coachRecords[1].id],
        },
        {
          dayOfWeek: DayOfWeek.THURSDAY,
          startTime: nextWeekdayAt(DayOfWeek.THURSDAY, 18, 30),
          endTime: nextWeekdayAt(DayOfWeek.THURSDAY, 20, 0),
          notes: "Pozicijski napad i realizacija",
          coachIds: [coachRecords[1].id],
        },
      ],
    },
    {
      categoryId: categories[3].id,
      name: "U16 kombinirani raspored",
      description: "Kombinira bazen i jači kondicijski blok.",
      activateThisWeek: true,
      slots: [
        {
          dayOfWeek: DayOfWeek.MONDAY,
          startTime: nextWeekdayAt(DayOfWeek.MONDAY, 19, 0),
          endTime: nextWeekdayAt(DayOfWeek.MONDAY, 20, 30),
          notes: "Plivačka baza i prijenos lopte",
          coachIds: [coachRecords[1].id, coachRecords[2].id],
        },
        {
          dayOfWeek: DayOfWeek.WEDNESDAY,
          startTime: nextWeekdayAt(DayOfWeek.WEDNESDAY, 19, 0),
          endTime: nextWeekdayAt(DayOfWeek.WEDNESDAY, 20, 30),
          notes: "Snaga i tranzicija",
          coachIds: [coachRecords[1].id, coachRecords[2].id],
        },
        {
          dayOfWeek: DayOfWeek.FRIDAY,
          startTime: nextWeekdayAt(DayOfWeek.FRIDAY, 19, 0),
          endTime: nextWeekdayAt(DayOfWeek.FRIDAY, 20, 30),
          notes: "Taktička utakmica",
          coachIds: [coachRecords[1].id, coachRecords[2].id],
        },
      ],
    },
    {
      categoryId: categories[4].id,
      name: "Senior natjecateljski tjedan",
      description: "Uobičajeni seniorski radni tjedan.",
      activateThisWeek: true,
      slots: [
        {
          dayOfWeek: DayOfWeek.TUESDAY,
          startTime: nextWeekdayAt(DayOfWeek.TUESDAY, 20, 0),
          endTime: nextWeekdayAt(DayOfWeek.TUESDAY, 21, 30),
          notes: "Natjecateljski blok i igra s igračem više",
          coachIds: [coachRecords[2].id],
        },
        {
          dayOfWeek: DayOfWeek.THURSDAY,
          startTime: nextWeekdayAt(DayOfWeek.THURSDAY, 20, 0),
          endTime: nextWeekdayAt(DayOfWeek.THURSDAY, 21, 30),
          notes: "Taktička priprema i presing",
          coachIds: [coachRecords[2].id],
        },
        {
          dayOfWeek: DayOfWeek.FRIDAY,
          startTime: nextWeekdayAt(DayOfWeek.FRIDAY, 20, 0),
          endTime: nextWeekdayAt(DayOfWeek.FRIDAY, 21, 30),
          notes: "Kontrolna utakmica",
          coachIds: [coachRecords[2].id],
        },
      ],
    },
  ];

  const currentWeekStart = getWeekStart(new Date());

  for (const definition of weeklyScheduleDefinitions) {
    const weeklySchedule = await prisma.weeklySchedule.create({
      data: {
        categoryId: definition.categoryId,
        name: definition.name,
        description: definition.description,
      },
    });

    const createdSlots = [];

    for (const slot of definition.slots) {
      const createdSlot = await prisma.schedule.create({
        data: {
          categoryId: definition.categoryId,
          weeklyScheduleId: weeklySchedule.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          notes: slot.notes,
          isWeeklyTemplate: true,
          dayOfWeek: slot.dayOfWeek,
        },
      });

      await prisma.scheduleCoach.createMany({
        data: slot.coachIds.map((coachId) => ({
          scheduleId: createdSlot.id,
          coachId,
        })),
      });

      createdSlots.push({
        ...slot,
        id: createdSlot.id,
      });
    }

    if (definition.activateThisWeek) {
      const activation = await prisma.weeklyScheduleActivation.create({
        data: {
          weeklyScheduleId: weeklySchedule.id,
          weekStartDate: currentWeekStart,
        },
      });

      for (const slot of createdSlots) {
        const occurrenceDate = buildOccurrenceDateForWeek(currentWeekStart, slot.dayOfWeek);
        const occurrence = await prisma.scheduleOccurrence.create({
          data: {
            scheduleId: slot.id,
            activationId: activation.id,
            occurrenceDate,
            startTime: copyTimeOfDay(occurrenceDate, slot.startTime),
            endTime: copyTimeOfDay(occurrenceDate, slot.endTime),
            notes: slot.notes,
          },
        });

        await prisma.scheduleOccurrenceCoach.createMany({
          data: slot.coachIds.map((coachId) => ({
            occurrenceId: occurrence.id,
            coachId,
          })),
        });
      }
    }
  }

  const tournamentSchedule = await prisma.schedule.create({
    data: {
      categoryId: categories[2].id,
      startTime: new Date("2026-07-11T08:30:00.000Z"),
      endTime: new Date("2026-07-11T10:00:00.000Z"),
      notes: "Friendly tournament warm-up block",
      isWeeklyTemplate: false,
    },
  });

  await prisma.scheduleCoach.createMany({
    data: [
      { scheduleId: tournamentSchedule.id, coachId: coachRecords[1].id },
      { scheduleId: tournamentSchedule.id, coachId: coachRecords[2].id },
    ],
  });

  await prisma.signupRequest.createMany({
    data: [
      {
        status: SignupStatus.PENDING,
        parentOneFirstName: "Sandra",
        parentOneLastName: "Boric",
        parentOneEmail: "sandra.boric@example.com",
        parentOnePhone: "+385911119001",
        parentTwoFirstName: "Davor",
        parentTwoLastName: "Boric",
        parentTwoEmail: "davor.boric@example.com",
        parentTwoPhone: "+385911119002",
        childFirstName: "Ema",
        childLastName: "Boric",
        childDateOfBirth: new Date("2016-05-20T00:00:00.000Z"),
        childOib: "66666666666",
        gdprConsent: true,
        suggestedCategoryId: categories[1].id,
      },
      {
        status: SignupStatus.PENDING,
        parentOneFirstName: "Maja",
        parentOneLastName: "Jovic",
        parentOneEmail: "maja.jovic@example.com",
        parentOnePhone: "+385911119003",
        childFirstName: "Jakov",
        childLastName: "Jovic",
        childDateOfBirth: new Date("2014-02-11T00:00:00.000Z"),
        childOib: "66666666667",
        gdprConsent: true,
        suggestedCategoryId: categories[2].id,
      },
      {
        status: SignupStatus.PENDING,
        parentOneFirstName: "Karla",
        parentOneLastName: "Sesar",
        parentOneEmail: "karla.sesar@example.com",
        parentOnePhone: "+385911119004",
        parentTwoFirstName: "Bruno",
        parentTwoLastName: "Sesar",
        parentTwoEmail: "bruno.sesar@example.com",
        parentTwoPhone: "+385911119005",
        childFirstName: "Nika",
        childLastName: "Sesar",
        childDateOfBirth: new Date("2017-09-09T00:00:00.000Z"),
        childOib: "66666666668",
        gdprConsent: true,
        suggestedCategoryId: categories[0].id,
      },
      {
        status: SignupStatus.PENDING,
        parentOneFirstName: "Tena",
        parentOneLastName: "Pavic",
        parentOneEmail: "tena.pavic@example.com",
        parentOnePhone: "+385911119006",
        childFirstName: "Lovro",
        childLastName: "Pavic",
        childDateOfBirth: new Date("2011-03-03T00:00:00.000Z"),
        childOib: "66666666669",
        gdprConsent: true,
        suggestedCategoryId: categories[3].id,
      },
    ],
  });

  console.log("Seed complete.");
  console.log(`Master admin: master.admin@adriaticwaves.test / ${adminPassword}`);
  console.log("Coach seed password:", coachPassword);
  console.log("Parent seed password:", parentPassword);
  console.log("Player seed password:", playerPassword);
  console.log("Player username format:", "ime-prezime-1234");
  console.log("Generated players:", generatedPlayerCount);
  console.log("Generated parents:", generatedParentCount);
}

main()
  .catch((error) => {
    console.error("Seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
