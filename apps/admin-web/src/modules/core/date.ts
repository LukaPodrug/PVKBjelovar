import type { DayKey } from "./types";

export const orderedDays: Array<{ key: DayKey; label: string; shortLabel: string }> = [
  { key: "MONDAY", label: "Ponedjeljak", shortLabel: "Pon" },
  { key: "TUESDAY", label: "Utorak", shortLabel: "Uto" },
  { key: "WEDNESDAY", label: "Srijeda", shortLabel: "Sri" },
  { key: "THURSDAY", label: "Četvrtak", shortLabel: "Čet" },
  { key: "FRIDAY", label: "Petak", shortLabel: "Pet" },
  { key: "SATURDAY", label: "Subota", shortLabel: "Sub" },
  { key: "SUNDAY", label: "Nedjelja", shortLabel: "Ned" },
];

export function formatTimeRange(startIso: string, endIso: string) {
  const formatter = new Intl.DateTimeFormat("hr-HR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${formatter.format(new Date(startIso))} - ${formatter.format(new Date(endIso))}`;
}

export function formatLongDate(dateIso: string) {
  const date = new Date(dateIso);
  const weekday = new Intl.DateTimeFormat("hr-HR", { weekday: "short" }).format(date);
  return `${weekday} ${formatDate(dateIso)}`;
}

export function formatDate(dateIso: string) {
  return formatNumericDate(new Date(dateIso));
}

export function formatDateTime(dateIso: string) {
  const date = new Date(dateIso);
  const time = new Intl.DateTimeFormat("hr-HR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  return `${formatNumericDate(date)} ${time}`;
}

function formatNumericDate(date: Date) {
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const year = date.getFullYear();

  return `${day}.${month}.${year}.`;
}

export function toDateInputValue(dateIso: string) {
  return dateIso.slice(0, 10);
}

export function toDateTimeLocalInputValue(dateIso: string) {
  const date = new Date(dateIso);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function toIsoDateTimeValue(dateTimeLocal: string) {
  return new Date(dateTimeLocal).toISOString();
}

export function getDayKeyFromDate(dateIso: string): DayKey {
  const day = new Date(dateIso).getDay();
  const map: DayKey[] = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
  ];

  return map[day] ?? "MONDAY";
}
