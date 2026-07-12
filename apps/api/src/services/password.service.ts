import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { AppError } from "../errors/app-error";

const scrypt = promisify(nodeScrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  validatePasswordStrength(password);

  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;

  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, key] = storedHash.split(":");

  if (!salt || !key) {
    return false;
  }

  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  const storedKey = Buffer.from(key, "hex");

  if (storedKey.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedKey, derivedKey);
}

export function generateTemporaryPassword(length = 14): string {
  const raw = randomBytes(length).toString("base64url");
  return `Wp!${raw.slice(0, Math.max(length, 10))}`;
}

export function validatePasswordStrength(password: string) {
  if (password.length < 8) {
    throw new AppError("Lozinka mora imati najmanje 8 znakova.", 400);
  }
}
