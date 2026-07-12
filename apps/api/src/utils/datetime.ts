/**
 * Formatters for user-facing Croatian notification copy. Practice times are stored as UTC wall-clock
 * values (the app keys everything by UTC date), so we format in UTC to preserve the intended time.
 */
export function formatDateHr(value: Date): string {
  return new Intl.DateTimeFormat("hr-HR", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export function formatTimeRangeHr(start: Date, end: Date): string {
  const formatter = new Intl.DateTimeFormat("hr-HR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}
