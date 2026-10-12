import { DayOfWeek } from "@prisma/client";

/**
 * PUBLIC programs (e.g. open days) run on weekly slots in local Croatian time and take one-off
 * signups for the next practice day only. This module works out that day and builds the bank
 * transfer data parents pay with.
 */

const clubTimeZone = "Europe/Zagreb";
const lookAheadDays = 21;

const dayOfWeekByIndex: DayOfWeek[] = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

export interface ProgramSlotInput {
  id: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
}

export interface ProgramScheduleInput {
  signupCloseDaysBefore: number | null;
  signupCloseTime: string | null;
  programSlots: ProgramSlotInput[];
}

export interface NextProgramSession {
  /** Practice day as YYYY-MM-DD in club time. */
  date: string;
  closesAt: Date;
  slots: Array<{ id: string; startTime: string; endTime: string }>;
}

/**
 * The earliest practice day whose signups are still open, or null when the program has no slots.
 * Signups for a day close `signupCloseDaysBefore` days ahead at `signupCloseTime` (e.g. 1 day before
 * at 22:00 closes Saturday's practice on Friday at 22:00); without a deadline they close when the
 * day's first slot starts.
 */
export function findNextProgramSession(
  program: ProgramScheduleInput,
  now = new Date(),
): NextProgramSession | null {
  if (program.programSlots.length === 0) {
    return null;
  }

  const today = getClubDateParts(now);

  for (let offset = 0; offset <= lookAheadDays; offset += 1) {
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const slots = program.programSlots
      .filter((slot) => slot.dayOfWeek === dayOfWeekByIndex[day.getUTCDay()])
      .sort((left, right) => left.startTime.localeCompare(right.startTime));

    if (slots.length === 0) {
      continue;
    }

    const hasDeadline =
      program.signupCloseDaysBefore !== null && Boolean(program.signupCloseTime);
    const closesAt = hasDeadline
      ? clubTimeToUtc(
          new Date(day.getTime() - program.signupCloseDaysBefore! * 86_400_000),
          program.signupCloseTime!,
        )
      : clubTimeToUtc(day, slots[0]!.startTime);

    if (now < closesAt) {
      return {
        date: day.toISOString().slice(0, 10),
        closesAt,
        slots: slots.map((slot) => ({
          id: slot.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
        })),
      };
    }
  }

  return null;
}

/** Converts a club-time wall clock ("HH:MM" on the given UTC-midnight date) into an instant. */
function clubTimeToUtc(day: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const wallClock = Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    hours ?? 0,
    minutes ?? 0,
  );
  // Correct by the zone offset, then once more in case the first guess sat across a DST switch.
  const firstGuess = wallClock - getClubOffsetMs(new Date(wallClock));
  return new Date(wallClock - getClubOffsetMs(new Date(firstGuess)));
}

function getClubOffsetMs(instant: Date) {
  const parts = getClubDateParts(instant);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return asUtc - Math.floor(instant.getTime() / 60_000) * 60_000;
}

function getClubDateParts(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: clubTimeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  };
}

export function isValidClockTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export interface ProgramPaymentInput {
  referenceNumber: number;
  sessionDate: Date;
  startTime: string;
  priceCents: number;
  programName: string;
  childFirstName: string;
  childLastName: string;
  parentFirstName: string;
  parentLastName: string;
}

export interface ClubBankDetails {
  bankRecipient: string | null;
  bankIban: string | null;
  bankName: string | null;
  bankRecipientAddress: string | null;
  bankRecipientCity: string | null;
}

/**
 * Bank transfer details for one practice signup, plus the two scannable payloads: the Croatian HUB3
 * PDF417 barcode that local mobile banking reads, and the European EPC QR code. Returns null when
 * the club has not filled in its bank details yet.
 */
export function buildProgramPayment(input: ProgramPaymentInput, bank: ClubBankDetails) {
  if (!bank.bankIban || !bank.bankRecipient) {
    return null;
  }

  const iban = bank.bankIban.replace(/\s+/g, "").toUpperCase();
  const [, month, day] = input.sessionDate.toISOString().slice(0, 10).split("-");
  const model = paymentModel;
  const reference = buildPaymentReference(input.referenceNumber, input.sessionDate);
  // HUB3 allows 35 characters: the child and practice matter most for matching payments, so the
  // program name only fills whatever room is left.
  const description = truncate(
    `${input.childFirstName} ${input.childLastName} ${day}.${month}. ${input.startTime} ${input.programName}`,
    35,
  );
  const amount = (input.priceCents / 100).toFixed(2);
  const payerName = `${input.parentFirstName} ${input.parentLastName}`;

  const hub3Text = [
    "HRVHUB30",
    "EUR",
    String(input.priceCents).padStart(15, "0"),
    truncate(toHub3Text(payerName), 30),
    "",
    "",
    truncate(toHub3Text(bank.bankRecipient), 25),
    truncate(toHub3Text(bank.bankRecipientAddress ?? ""), 25),
    truncate(toHub3Text(bank.bankRecipientCity ?? ""), 27),
    iban,
    model,
    reference,
    "OTHR",
    toHub3Text(description),
  ].join("\n");

  const epcQrText = [
    "BCD",
    "002",
    "1",
    "SCT",
    "",
    truncate(bank.bankRecipient, 70),
    iban,
    `EUR${amount}`,
    "",
    "",
    truncate(`${model} ${reference} ${description}`, 140),
  ].join("\n");

  return {
    amount,
    currency: "EUR",
    recipient: bank.bankRecipient,
    recipientAddress: bank.bankRecipientAddress,
    recipientCity: bank.bankRecipientCity,
    iban,
    bankName: bank.bankName,
    model,
    reference,
    description,
    hub3Text,
    epcQrText,
  };
}

const paymentModel = "HR00";

/** "Poziv na broj" for a signup: its running number and the practice date, e.g. 17-20261017. */
export function buildPaymentReference(referenceNumber: number, sessionDate: Date) {
  return `${referenceNumber}-${sessionDate.toISOString().slice(0, 10).replace(/-/g, "")}`;
}

export function formatPaymentReference(referenceNumber: number, sessionDate: Date) {
  return `${paymentModel} ${buildPaymentReference(referenceNumber, sessionDate)}`;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength).trimEnd() : value;
}

/** HUB3 barcodes are read as ISO 8859-2 by some banks; plain ASCII scans reliably everywhere. */
function toHub3Text(value: string) {
  return value
    .replace(/[đĐ]/g, (letter) => (letter === "đ" ? "d" : "D"))
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}
