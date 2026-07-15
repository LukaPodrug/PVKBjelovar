import React, { type CSSProperties, useState } from "react";
import type { PublicScheduleCalendarItem } from "../lib/public-api";

type DayKey =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

interface WeekDayMeta {
  key: DayKey;
  label: string;
  shortLabel: string;
  date: Date;
  isToday: boolean;
}

interface MonthCalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isInVisibleWeek: boolean;
  isSelectedDay: boolean;
}

interface Tone {
  accent: string;
  soft: string;
  text: string;
}

interface PracticeWeekBoardProps {
  items: PublicScheduleCalendarItem[];
  weekStartDate: string;
  onWeekStartChange: (nextWeekStartDate: string) => void;
}

const orderedDays: Array<{ key: DayKey; label: string; shortLabel: string }> = [
  { key: "MONDAY", label: "Ponedjeljak", shortLabel: "Pon" },
  { key: "TUESDAY", label: "Utorak", shortLabel: "Uto" },
  { key: "WEDNESDAY", label: "Srijeda", shortLabel: "Sri" },
  { key: "THURSDAY", label: "Četvrtak", shortLabel: "Čet" },
  { key: "FRIDAY", label: "Petak", shortLabel: "Pet" },
  { key: "SATURDAY", label: "Subota", shortLabel: "Sub" },
  { key: "SUNDAY", label: "Nedjelja", shortLabel: "Ned" },
];

const tonePalette: Tone[] = [
  { accent: "#1d4f91", soft: "#edf4ff", text: "#173d71" },
  { accent: "#0f766e", soft: "#e7f6f3", text: "#115e59" },
  { accent: "#9a6b2f", soft: "#fbf2e3", text: "#8b5e22" },
  { accent: "#7c3a8d", soft: "#f5ebfb", text: "#6b2f7c" },
  { accent: "#b45309", soft: "#fff3e8", text: "#9a3412" },
];

const desktopHourHeight = 84;
const minimumEventHeight = 78;

export function PracticeWeekBoard({
  items,
  weekStartDate,
  onWeekStartChange,
}: PracticeWeekBoardProps) {
  const today = new Date();
  const todayKey = getDayKeyFromDate(today.toISOString());
  const visibleWeekStart = getDateFromDateKey(weekStartDate);
  const currentWeekStart = getWeekStart(today);
  const [selectedDay, setSelectedDay] = useState<DayKey>(
    isDateWithinRange(today, visibleWeekStart, getWeekEnd(visibleWeekStart)) ? todayKey : "MONDAY",
  );

  const weekDays = buildWeekDays(visibleWeekStart);
  const currentDayMeta = weekDays.find((day) => day.key === selectedDay) ?? weekDays[0];
  const groupedItems = buildVisibleWeekGroupedItems(items, weekDays);
  const currentDayItems = groupedItems[currentDayMeta.key] ?? [];
  const timeWindow = buildTimeWindow(items);
  const timeSlots = buildTimeSlots(timeWindow.startHour, timeWindow.endHourExclusive);
  const weekRangeLabel = formatWeekRange(weekDays[0].date, weekDays[weekDays.length - 1].date);
  const monthLabel = formatMonthLabel(weekDays[0].date);
  const monthCalendar = buildMonthCalendar(visibleWeekStart, currentDayMeta.date);
  const totalGridHeight = timeSlots.length * desktopHourHeight;
  const categoryCount = new Set(items.map((item) => item.category.id)).size;
  const specialCount = items.filter((item) => item.sourceType === "SPECIAL_PRACTICE").length;
  const isCurrentWeek = isSameDate(visibleWeekStart, currentWeekStart);

  const moveVisibleWeek = (offsetDays: number) => {
    onWeekStartChange(getDateKey(shiftDate(visibleWeekStart, offsetDays)));
  };

  const resetToCurrentWeek = () => {
    onWeekStartChange(getDateKey(currentWeekStart));
    setSelectedDay(todayKey);
  };

  const moveSelectedDay = (offsetDays: number) => {
    const nextDate = shiftDate(currentDayMeta.date, offsetDays);
    onWeekStartChange(getDateKey(getWeekStart(nextDate)));
    setSelectedDay(getDayKeyFromDate(nextDate.toISOString()));
  };

  return (
    <div className="schedule-board-shell border-2 border-line bg-surface">
      <div className="schedule-board-toolbar border-b-2 border-line">
        <div>
          <p className="landing-kicker text-muted">Tjedni raspored</p>
          <h3 className="mt-2 text-3xl">Stvarni termini u odabranom tjednu</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
            Kalendar prikazuje samo stvarne treninge i posebne termine koji su aktivni u
            odabranom tjednu.
          </p>
        </div>

        <div className="schedule-week-controls">
          <div className="schedule-week-nav">
            <button
              className="schedule-week-nav-button"
              type="button"
              aria-label="Prikaži prethodni tjedan"
              onClick={() => moveVisibleWeek(-7)}
            >
              {"<"}
            </button>
            <div className="schedule-week-nav-summary">
              <span>{isCurrentWeek ? "Ovaj tjedan" : "Vidljivi tjedan"}</span>
              <strong>{weekRangeLabel}</strong>
              <em>{monthLabel}</em>
            </div>
            <button
              className="schedule-week-nav-button"
              type="button"
              aria-label="Prikaži sljedeći tjedan"
              onClick={() => moveVisibleWeek(7)}
            >
              {">"}
            </button>
          </div>

          <button
            className="schedule-week-today-button"
            type="button"
            onClick={resetToCurrentWeek}
            disabled={isCurrentWeek}
          >
            Ovaj tjedan
          </button>
        </div>

        <div className="schedule-board-pills">
          <span className="schedule-pill">
            Termini <strong>{items.length}</strong>
          </span>
          <span className="schedule-pill">
            Posebni <strong>{specialCount}</strong>
          </span>
          <span className="schedule-pill">
            Kategorije <strong>{categoryCount}</strong>
          </span>
        </div>
      </div>

      <div className="schedule-board-layout">
        <div className="schedule-board-main">
          <div className="schedule-desktop-view">
            {items.length === 0 ? (
              <div className="schedule-empty-state">
                U odabranom tjednu trenutno nema objavljenih termina.
              </div>
            ) : (
              <div className="schedule-grid-shell">
                <div
                  className="schedule-grid-header"
                  style={{ gridTemplateColumns: "88px repeat(7, minmax(0, 1fr))" }}
                >
                  <div className="schedule-grid-corner">Vrijeme</div>
                  {weekDays.map((day) => (
                    <div
                      key={day.key}
                      className={`schedule-day-header ${day.isToday ? "is-today" : ""}`}
                    >
                      <p>{day.shortLabel}</p>
                      <h4>{day.label}</h4>
                      <span>{formatDayDate(day.date)}</span>
                    </div>
                  ))}
                </div>

                <div
                  className="schedule-grid-body"
                  style={{ gridTemplateColumns: "88px repeat(7, minmax(0, 1fr))" }}
                >
                  <div className="schedule-time-rail">
                    {timeSlots.map((slot) => (
                      <div
                        key={slot}
                        className="schedule-time-slot"
                        style={{ height: desktopHourHeight }}
                      >
                        {formatHourLabel(slot)}
                      </div>
                    ))}
                  </div>

                  {weekDays.map((day) => (
                    <div
                      key={day.key}
                      className={`schedule-day-track ${day.isToday ? "is-today" : ""}`}
                      style={{ height: totalGridHeight }}
                    >
                      {timeSlots.map((slot, index) => (
                        <div
                          key={`${day.key}-${slot}`}
                          className="schedule-hour-line"
                          style={{ top: index * desktopHourHeight }}
                        />
                      ))}

                      {groupedItems[day.key].length === 0 ? (
                        <div className="schedule-day-empty">Bez termina</div>
                      ) : null}

                      {groupedItems[day.key].map((item) => {
                        const position = getItemPosition(item, timeWindow.startHour);
                        const tone = getToneForValue(item.category.id || item.category.name);

                        return (
                          <article
                            key={item.id}
                            className="schedule-event"
                            style={{
                              top: position.top,
                              height: position.height,
                              "--schedule-accent": tone.accent,
                              "--schedule-soft": tone.soft,
                              "--schedule-text": tone.text,
                            } as CSSProperties}
                          >
                            <p className="schedule-event-time">
                              {formatTimeRange(item.startTime, item.endTime)}
                            </p>
                            <h5 className="schedule-event-title">{item.category.name}</h5>
                            <p className="schedule-event-note">{getPracticeNote(item)}</p>
                            <p className="schedule-event-meta">{getCoachSummary(item)}</p>
                          </article>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="schedule-mobile-view">
            <div className="schedule-mobile-days">
              {weekDays.map((day) => (
                <button
                  key={day.key}
                  className={`schedule-mobile-day-button ${selectedDay === day.key ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setSelectedDay(day.key)}
                >
                  <span>{day.shortLabel}</span>
                  <strong>{day.label}</strong>
                  <em>{formatDayDate(day.date)}</em>
                </button>
              ))}
            </div>

            <div className="schedule-mobile-panel">
              <div className="schedule-mobile-panel-header">
                <div>
                  <p className="landing-kicker text-muted">Odabrani dan</p>
                  <h4 className="mt-2 text-2xl">{currentDayMeta.label}</h4>
                  <p className="mt-2 text-sm text-muted">
                    {formatLongDate(currentDayMeta.date.toISOString())}
                  </p>
                </div>

                <div className="schedule-mobile-header-actions">
                  <span className="schedule-pill">
                    {currentDayItems.length > 0 ? `${currentDayItems.length} termina` : "Bez termina"}
                  </span>
                  <div className="schedule-mobile-day-nav">
                    <button
                      className="schedule-week-nav-button"
                      type="button"
                      aria-label="Prikaži prethodni dan"
                      onClick={() => moveSelectedDay(-1)}
                    >
                      {"<"}
                    </button>
                    <button
                      className="schedule-week-nav-button"
                      type="button"
                      aria-label="Prikaži sljedeći dan"
                      onClick={() => moveSelectedDay(1)}
                    >
                      {">"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="schedule-mobile-list">
                {currentDayItems.length === 0 ? (
                  <div className="schedule-empty-state schedule-empty-state-mobile">
                    Nema termina za odabrani dan.
                  </div>
                ) : (
                  currentDayItems.map((item) => {
                    const tone = getToneForValue(item.category.id || item.category.name);

                    return (
                      <article
                        key={item.id}
                        className="schedule-mobile-card"
                        style={{
                          "--schedule-accent": tone.accent,
                          "--schedule-soft": tone.soft,
                          "--schedule-text": tone.text,
                        } as CSSProperties}
                      >
                        <div className="schedule-mobile-card-top">
                          <p className="schedule-event-time">
                            {formatTimeRange(item.startTime, item.endTime)}
                          </p>
                          <span className="schedule-pill">
                            {item.sourceType === "WEEKLY_TEMPLATE" ? "Raspored" : "Posebni"}
                          </span>
                        </div>
                        <h5 className="schedule-event-title">{item.category.name}</h5>
                        <p className="schedule-event-note">{getPracticeNote(item)}</p>
                        <p className="schedule-event-meta">{getCoachSummary(item)}</p>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <aside className="schedule-board-sidebar">
          <section className="schedule-side-card">
            <div className="schedule-side-card-header">
              <p className="landing-kicker text-muted">Mini kalendar</p>
              <h4 className="mt-2 text-2xl">{monthLabel}</h4>
            </div>

            <div className="schedule-mini-calendar">
              {orderedDays.map((day) => (
                <span key={day.key} className="schedule-mini-calendar-label">
                  {day.shortLabel}
                </span>
              ))}

              {monthCalendar.map((calendarDay) => (
                <button
                  key={calendarDay.date.toISOString()}
                  className={`schedule-mini-calendar-day schedule-mini-calendar-day-button ${
                    calendarDay.isCurrentMonth ? "" : "is-outside"
                  } ${calendarDay.isToday ? "is-today" : ""} ${
                    calendarDay.isInVisibleWeek ? "is-in-week" : ""
                  } ${calendarDay.isSelectedDay ? "is-selected" : ""}`}
                  type="button"
                  onClick={() => {
                    onWeekStartChange(getDateKey(getWeekStart(calendarDay.date)));
                    setSelectedDay(getDayKeyFromDate(calendarDay.date.toISOString()));
                  }}
                >
                  {calendarDay.date.getDate()}
                </button>
              ))}
            </div>
          </section>

          <section className="schedule-side-card">
            <div className="schedule-side-card-header">
              <p className="landing-kicker text-muted">Sažetak</p>
              <h4 className="mt-2 text-2xl">Objavljeni termini</h4>
            </div>

            <div className="schedule-summary-grid">
              <div>
                <span>Ukupno</span>
                <strong>{items.length}</strong>
              </div>
              <div>
                <span>Posebni</span>
                <strong>{specialCount}</strong>
              </div>
              <div>
                <span>Kategorije</span>
                <strong>{categoryCount}</strong>
              </div>
              <div>
                <span>Satnica</span>
                <strong>
                  {formatHourLabel(timeWindow.startHour)} - {formatHourLabel(timeWindow.endHourExclusive)}
                </strong>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function buildVisibleWeekGroupedItems(items: PublicScheduleCalendarItem[], weekDays: WeekDayMeta[]) {
  const groups = orderedDays.reduce<Record<DayKey, PublicScheduleCalendarItem[]>>((accumulator, day) => {
    accumulator[day.key] = [];
    return accumulator;
  }, {} as Record<DayKey, PublicScheduleCalendarItem[]>);

  for (const day of weekDays) {
    groups[day.key] = items
      .filter((item) => getDayKeyFromDate(item.startTime) === day.key)
      .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime());
  }

  return groups;
}

function buildTimeWindow(items: PublicScheduleCalendarItem[]) {
  if (items.length === 0) {
    return {
      startHour: 16,
      endHourExclusive: 22,
    };
  }

  let minimumMinutes = Number.POSITIVE_INFINITY;
  let maximumMinutes = 0;

  for (const item of items) {
    minimumMinutes = Math.min(minimumMinutes, getMinutesSinceMidnight(item.startTime));
    maximumMinutes = Math.max(maximumMinutes, getMinutesSinceMidnight(item.endTime));
  }

  const startHour = Math.max(6, Math.floor(minimumMinutes / 60) - 1);
  const endHourExclusive = Math.min(23, Math.max(startHour + 5, Math.ceil(maximumMinutes / 60) + 1));

  return {
    startHour,
    endHourExclusive,
  };
}

function buildTimeSlots(startHour: number, endHourExclusive: number) {
  return Array.from(
    { length: Math.max(endHourExclusive - startHour, 1) },
    (_, index) => startHour + index,
  );
}

function getItemPosition(item: PublicScheduleCalendarItem, startHour: number) {
  const startMinutes = getMinutesSinceMidnight(item.startTime);
  const endMinutes = getMinutesSinceMidnight(item.endTime);
  const top = ((startMinutes - startHour * 60) / 60) * desktopHourHeight;
  const height = Math.max(((endMinutes - startMinutes) / 60) * desktopHourHeight, minimumEventHeight);

  return {
    top,
    height,
  };
}

function buildWeekDays(referenceDate: Date) {
  const today = new Date();
  const weekStart = getWeekStart(referenceDate);

  return orderedDays.map((day, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);

    return {
      ...day,
      date,
      isToday: isSameDate(date, today),
    } satisfies WeekDayMeta;
  });
}

function buildMonthCalendar(referenceDate: Date, selectedDate: Date) {
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
  const gridStart = getWeekStart(monthStart);
  const gridEnd = getWeekEnd(monthEnd);
  const visibleWeekStart = getWeekStart(referenceDate);
  const visibleWeekEnd = getWeekEnd(referenceDate);
  const days: MonthCalendarDay[] = [];
  const cursor = new Date(gridStart);

  while (cursor <= gridEnd) {
    const nextDate = new Date(cursor);
    days.push({
      date: nextDate,
      isCurrentMonth: nextDate.getMonth() === referenceDate.getMonth(),
      isToday: isSameDate(nextDate, new Date()),
      isInVisibleWeek: isDateWithinRange(nextDate, visibleWeekStart, visibleWeekEnd),
      isSelectedDay: isSameDate(nextDate, selectedDate),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function getMinutesSinceMidnight(dateIso: string) {
  const date = new Date(dateIso);
  return date.getHours() * 60 + date.getMinutes();
}

function getWeekStart(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const offset = day === 0 ? 6 : day - 1;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - offset);
  return start;
}

function getWeekEnd(date: Date) {
  const end = getWeekStart(date);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function shiftDate(date: Date, offsetDays: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + offsetDays);
  return nextDate;
}

function formatTimeRange(startIso: string, endIso: string) {
  const formatter = new Intl.DateTimeFormat("hr-HR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${formatter.format(new Date(startIso))} - ${formatter.format(new Date(endIso))}`;
}

function formatLongDate(dateIso: string) {
  const date = new Date(dateIso);
  const weekday = new Intl.DateTimeFormat("hr-HR", { weekday: "short" }).format(date);
  return `${weekday} ${formatNumericDate(date)}`;
}

function formatDayDate(date: Date) {
  return formatNumericDate(date);
}

function formatMonthLabel(date: Date) {
  return `${`${date.getMonth() + 1}`.padStart(2, "0")}.${date.getFullYear()}.`;
}

function formatWeekRange(startDate: Date, endDate: Date) {
  return `${formatNumericDate(startDate)} - ${formatNumericDate(endDate)}`;
}

function formatNumericDate(date: Date) {
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const year = date.getFullYear();

  return `${day}.${month}.${year}.`;
}

function formatHourLabel(hour: number) {
  return `${`${hour}`.padStart(2, "0")}:00`;
}

function getDayKeyFromDate(dateIso: string): DayKey {
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

function getCoachSummary(item: PublicScheduleCalendarItem) {
  if (item.coaches.length === 0) {
    return "Trener će biti potvrđen naknadno";
  }

  return item.coaches
    .map((assignment) => `${assignment.coach.user.firstName} ${assignment.coach.user.lastName}`)
    .join(", ");
}

function getPracticeNote(item: PublicScheduleCalendarItem) {
  const parts = [formatPracticeType(item.practiceType)];

  if (item.weeklyScheduleName) {
    parts.push(item.weeklyScheduleName);
  }

  return parts.join(" · ");
}

function formatPracticeType(practiceType: PublicScheduleCalendarItem["practiceType"]) {
  return practiceType === "DRYLAND" ? "Suhi trening" : "Trening u vodi";
}

function getToneForValue(value: string) {
  return tonePalette[hashString(value) % tonePalette.length];
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getDateFromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
}

function getDateKey(date: Date) {
  return [
    date.getFullYear(),
    `${date.getMonth() + 1}`.padStart(2, "0"),
    `${date.getDate()}`.padStart(2, "0"),
  ].join("-");
}

function isSameDate(left: Date, right: Date) {
  return left.toDateString() === right.toDateString();
}

function isDateWithinRange(date: Date, start: Date, end: Date) {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}
