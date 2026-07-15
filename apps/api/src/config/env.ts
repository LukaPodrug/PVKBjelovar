import path from "node:path";
import dotenv from "dotenv";

for (const envPath of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "apps/api/.env"),
  path.resolve(__dirname, "../../../../.env"),
  path.resolve(__dirname, "../../.env"),
]) {
  dotenv.config({ path: envPath, override: false });
}

function requireString(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readNumber(name: string, fallback: number): number {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }

  return parsed;
}

function readStringList(...names: string[]): string[] {
  for (const name of names) {
    const value = process.env[name];

    if (!value) {
      continue;
    }

    const entries = value
      .split(",")
      .map((entry) => entry.trim().replace(/^['"]+|['"]+$/g, ""))
      .filter(Boolean);

    if (entries.length > 0) {
      return entries;
    }
  }

  return [];
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: readNumber("PORT", 4000),
  databaseUrl: requireString("DATABASE_URL"),
  jwtSecret: requireString("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
  frontendUrls: (() => {
    const values = readStringList("FRONTEND_URLS", "FRONTEND_URL");
    return values.length > 0 ? values : ["http://localhost:5173"];
  })(),
  contentfulManagementToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN ?? "",
  contentfulSpaceId: process.env.CONTENTFUL_SPACE_ID ?? "",
  contentfulEnvironment: process.env.CONTENTFUL_ENVIRONMENT ?? "master",
  contentfulLocale: process.env.CONTENTFUL_LOCALE ?? "en-US",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: readNumber("SMTP_PORT", 587),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  mailFrom: process.env.MAIL_FROM ?? "noreply@example.com",
  defaultClubName: process.env.DEFAULT_CLUB_NAME ?? "PVK Mladost Bjelovar",
  maxUploadSizeMb: readNumber("MAX_UPLOAD_SIZE_MB", 8),
} as const;

export function isProduction(): boolean {
  return env.nodeEnv === "production";
}
