const { randomBytes, scrypt: nodeScrypt } = require("node:crypto");
const { promisify } = require("node:util");
const { AccountStatus, PrismaClient, UserRole } = require("@prisma/client");

const scrypt = promisify(nodeScrypt);
const prisma = new PrismaClient();

async function hashPassword(password) {
  if (!password || password.length < 8) {
    throw new Error("Password must have at least 8 characters.");
  }

  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, 64);

  return `${salt}:${derivedKey.toString("hex")}`;
}

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  if (!email) {
    throw new Error("ADMIN_EMAIL is required.");
  }

  if (!password) {
    throw new Error("ADMIN_PASSWORD is required.");
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      role: UserRole.ADMIN,
      email,
      passwordHash,
      firstName: "Alen",
      lastName: "Kuten",
      accountStatus: AccountStatus.ACTIVE,
      mustChangePassword: false,
    },
    update: {
      role: UserRole.ADMIN,
      passwordHash,
      firstName: "Alen",
      lastName: "Kuten",
      accountStatus: AccountStatus.ACTIVE,
      mustChangePassword: false,
    },
    select: {
      id: true,
      email: true,
      role: true,
      accountStatus: true,
      mustChangePassword: true,
      updatedAt: true,
    },
  });

  console.log(JSON.stringify(user, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
