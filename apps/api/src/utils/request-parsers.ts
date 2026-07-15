import { AccountStatus, DayOfWeek, PracticeType } from "@prisma/client";
import { AppError } from "../errors/app-error";

function ensureString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function requireString(value: unknown, fieldName: string): string {
  const parsed = ensureString(value);

  if (!parsed) {
    throw new AppError(`Polje ${fieldName} je obavezno.`, 400);
  }

  return parsed;
}

export function optionalString(value: unknown): string | null {
  return ensureString(value);
}

export function parseDateInput(value: unknown, fieldName: string): Date {
  const parsed = requireString(value, fieldName);
  const date = new Date(parsed);

  if (Number.isNaN(date.getTime())) {
    throw new AppError(`Polje ${fieldName} mora sadržavati ispravan datum.`, 400);
  }

  return date;
}

export function parseOptionalDateInput(value: unknown): Date | null {
  const parsed = optionalString(value);

  if (!parsed) {
    return null;
  }

  const date = new Date(parsed);

  if (Number.isNaN(date.getTime())) {
    throw new AppError("Neispravna vrijednost datuma.", 400);
  }

  return date;
}

export function parseOptionalPositiveIntegerInput(
  value: unknown,
  fieldName: string,
): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(String(value));

  if (!Number.isInteger(numericValue) || numericValue < 1) {
    throw new AppError(`Polje ${fieldName} mora biti pozitivan cijeli broj.`, 400);
  }

  return numericValue;
}

export function parseBooleanInput(value: unknown, fieldName: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }
  }

  throw new AppError(`Polje ${fieldName} mora biti boolean vrijednost.`, 400);
}

export function parseOptionalBooleanInput(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return parseBooleanInput(value, "boolean vrijednost");
}

export function parseStringArrayInput(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith("[")) {
      const parsed = JSON.parse(trimmed) as unknown;

      if (!Array.isArray(parsed)) {
        throw new AppError("Očekivan je unos u obliku polja.", 400);
      }

      return parsed
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean);
    }

    return trimmed
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

export function parseAccountStatusInput(value: unknown): AccountStatus {
  const parsed = requireString(value, "accountStatus").toUpperCase();

  if (!Object.values(AccountStatus).includes(parsed as AccountStatus)) {
    throw new AppError("accountStatus mora biti PENDING, ACTIVE ili SUSPENDED.", 400);
  }

  return parsed as AccountStatus;
}

export function parseOptionalAccountStatusInput(value: unknown): AccountStatus | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return parseAccountStatusInput(value);
}

export function parseDayOfWeekInput(value: unknown): DayOfWeek {
  const parsed = requireString(value, "dayOfWeek").toUpperCase();

  if (!Object.values(DayOfWeek).includes(parsed as DayOfWeek)) {
    throw new AppError("dayOfWeek nije ispravan.", 400);
  }

  return parsed as DayOfWeek;
}

export function parsePracticeTypeInput(value: unknown): PracticeType {
  const parsed = requireString(value, "practiceType").toUpperCase();

  if (!Object.values(PracticeType).includes(parsed as PracticeType)) {
    throw new AppError("practiceType mora biti WATER ili DRYLAND.", 400);
  }

  return parsed as PracticeType;
}

export function normalizeEmail(value: unknown, fieldName: string): string {
  return requireString(value, fieldName).toLowerCase();
}

export interface PaginationInput {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

function parsePositiveInteger(value: unknown, fieldName: string, fallback: number): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const numericValue = typeof value === "number" ? value : Number(String(value));

  if (!Number.isInteger(numericValue) || numericValue < 1) {
    throw new AppError(`Polje ${fieldName} mora biti pozitivan cijeli broj.`, 400);
  }

  return numericValue;
}

export function parsePaginationInput(
  query: { page?: unknown; pageSize?: unknown; limit?: unknown },
  options: { defaultPageSize?: number; maxPageSize?: number } = {},
): PaginationInput {
  const defaultPageSize = options.defaultPageSize ?? 25;
  const maxPageSize = options.maxPageSize ?? 100;
  const page = parsePositiveInteger(query.page, "page", 1);
  const requestedPageSize = parsePositiveInteger(
    query.pageSize ?? query.limit,
    "pageSize",
    defaultPageSize,
  );
  const pageSize = Math.min(requestedPageSize, maxPageSize);

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function buildPaginatedResponse<T>(
  items: T[],
  total: number,
  pagination: PaginationInput,
) {
  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
  };
}

function parseDateKeyBoundary(value: unknown, fieldName: string, endOfDay: boolean): Date | undefined {
  const parsed = optionalString(value);

  if (!parsed) {
    return undefined;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
    throw new AppError(`Polje ${fieldName} mora biti u formatu YYYY-MM-DD.`, 400);
  }

  const [year, month, day] = parsed.split("-").map(Number);
  const time = endOfDay ? [23, 59, 59, 999] : [0, 0, 0, 0];
  return new Date(
    Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, time[0], time[1], time[2], time[3]),
  );
}

/**
 * Parses inclusive `from`/`to` date-key query params (YYYY-MM-DD) into a UTC range. `from` snaps to
 * the start of its day and `to` to the end, so both boundary dates are included. Either may be
 * omitted (all-time before / up to now).
 */
export function parseLeaderboardWindow(query: {
  from?: unknown;
  to?: unknown;
}): { from?: Date; to?: Date } {
  const from = parseDateKeyBoundary(query.from, "from", false);
  const to = parseDateKeyBoundary(query.to, "to", true);

  if (from && to && to < from) {
    throw new AppError("Datum 'to' mora biti nakon datuma 'from'.", 400);
  }

  return { from, to };
}
