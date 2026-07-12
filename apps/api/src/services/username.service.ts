import { AppError } from "../errors/app-error";

export const attendanceQrTokenPrefix = "pvk-mladost-attendance:";

function slugifyUsernamePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeUsername(value: string) {
  return slugifyUsernamePart(value).slice(0, 32);
}

export function parseUsernameInput(value: unknown, fieldName = "username") {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AppError(`Polje ${fieldName} je obavezno.`, 400);
  }

  const username = normalizeUsername(value);

  if (username.length < 3) {
    throw new AppError("Korisničko ime mora imati barem 3 znaka.", 400);
  }

  return username;
}

export function buildDefaultPlayerUsername(firstName: string, lastName: string, oib: string) {
  const base = normalizeUsername(`${firstName}-${lastName}`) || "igrac";
  const suffix = oib.slice(-4);
  const maxBaseLength = Math.max(3, 31 - suffix.length);
  const trimmedBase = base.slice(0, maxBaseLength).replace(/-+$/g, "") || "igrac";

  return `${trimmedBase}-${suffix}`;
}

export function normalizeLoginIdentifier(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

export function parseAttendanceQrToken(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AppError("QR kod nije ispravan.", 400);
  }

  const trimmed = value.trim();

  if (trimmed.startsWith(attendanceQrTokenPrefix)) {
    return trimmed.slice(attendanceQrTokenPrefix.length);
  }

  return trimmed;
}
