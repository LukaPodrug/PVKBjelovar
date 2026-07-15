import React, { type CSSProperties, useEffect, useState } from "react";
import { formatLongDate, formatTimeRange, getDayKeyFromDate, orderedDays } from "../core/date";
import type { DayKey, ScheduleItem } from "../core/types";

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

interface WeeklyScheduleBoardProps {
  schedules: ScheduleItem[];
  selectedScheduleId?: string | null;
  onSelectSchedule?: (schedule: ScheduleItem, occurrenceDate: string) => void;
  showSidebar?: boolean;
  compactEventContent?: boolean;
}

const tonePalette: Tone[] = [
  { accent: "#1d4f91", soft: "#edf4ff", text: "#173d71" },
  { accent: "#0f766e", soft: "#e7f6f3", text: "#115e59" },
  { accent: "#9a6b2f", soft: "#fbf2e3", text: "#8b5e22" },
  { accent: "#7c3a8d", soft: "#f5ebfb", text: "#6b2f7c" },
  { accent: "#b45309", soft: "#fff3e8", text: "#9a3412" },
];

const desktopHourHeight = 84;
const minimumEventHeight = 78;

export function WeeklyScheduleBoard({
  schedules,
  selectedScheduleId = null,
  onSelectSchedule,
  showSidebar = true,
  compactEventContent = false,
}: WeeklyScheduleBoardProps) {
  const today = new Date();
  const todayKey = getDayKeyFromDate(today.toISOString());
  const currentWeekStart = getWeekStart(today);
  const selectedSchedule = schedules.find((schedule) => schedule.id === selectedScheduleId) ?? null;
  const [selectedDay, setSelectedDay] = useState<DayKey>(
    selectedSchedule ? getScheduleDayKey(selectedSchedule) : todayKey,
  );
  const [visibleWeekStart, setVisibleWeekStart] = useState<Date>(() =>
    getWeekStart(selectedSchedule ? new Date(selectedSchedule.startTime) : today),
  );

  const weekDays = buildWeekDays(visibleWeekStart);
  const currentDayMeta = weekDays.find((day) => day.key === selectedDay) ?? weekDays[0];
  const weeklySchedules = schedules.filter((schedule) => schedule.isWeeklyTemplate);
  const specialSchedules = schedules
    .filter((schedule) => !schedule.isWeeklyTemplate)
    .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime());
  const visibleWeekEnd = getWeekEnd(visibleWeekStart);
  const visibleWeekSpecialSchedules = specialSchedules.filter((schedule) =>
    isDateWithinRange(new Date(schedule.startTime), visibleWeekStart, visibleWeekEnd),
  );
  const groupedSchedules = buildVisibleWeekGroupedSchedules(weeklySchedules, weekDays);
  const currentDaySchedules = buildCombinedDaySchedules(
    currentDayMeta.key,
    groupedSchedules[currentDayMeta.key] ?? [],
    visibleWeekSpecialSchedules,
  );
  const timeWindow = buildTimeWindow(weeklySchedules);
  const timeSlots = buildTimeSlots(timeWindow.startHour, timeWindow.endHourExclusive);
  const weekRangeLabel = formatWeekRange(weekDays[0].date, weekDays[weekDays.length - 1].date);
  const monthLabel = formatMonthLabel(weekDays[0].date);
  const monthCalendar = buildMonthCalendar(visibleWeekStart, currentDayMeta.date);
  const categoryCount = new Set(
    [...weeklySchedules, ...visibleWeekSpecialSchedules].map((schedule) => schedule.category.id),
  ).size;
  const totalGridHeight = timeSlots.length * desktopHourHeight;
  const isCurrentWeek = isSameDate(visibleWeekStart, currentWeekStart);

  useEffect(() => {
    if (!selectedSchedule) {
      return;
    }

    setSelectedDay(getScheduleDayKey(selectedSchedule));
    setVisibleWeekStart(getWeekStart(new Date(selectedSchedule.startTime)));
  }, [selectedSchedule]);

  const handleSelectSchedule = (schedule: ScheduleItem, occurrenceDate?: string) => {
    const targetDate = occurrenceDate
      ? getDateFromDateKey(occurrenceDate)
      : new Date(schedule.startTime);

    setVisibleWeekStart(getWeekStart(targetDate));
    setSelectedDay(getDayKeyFromDate(targetDate.toISOString()));
    onSelectSchedule?.(
      schedule,
      occurrenceDate ?? getOccurrenceDateKey(schedule.isWeeklyTemplate ? targetDate : schedule.startTime),
    );
  };

  const moveVisibleWeek = (offsetDays: number) => {
    setVisibleWeekStart((current) => shiftDate(current, offsetDays));
  };

  const resetToCurrentWeek = () => {
    setVisibleWeekStart(currentWeekStart);
    setSelectedDay(todayKey);
  };

  const moveSelectedDay = (offsetDays: number) => {
    const nextDate = shiftDate(currentDayMeta.date, offsetDays);
    setVisibleWeekStart(getWeekStart(nextDate));
    setSelectedDay(getDayKeyFromDate(nextDate.toISOString()));
  };

  const selectCalendarDate = (date: Date) => {
    setVisibleWeekStart(getWeekStart(date));
    setSelectedDay(getDayKeyFromDate(date.toISOString()));
  };

  return (
    <div className="schedule-board-shell border-2 border-line bg-surface">
      <div className="schedule-board-toolbar border-b-2 border-line">
        <div>
          <p className="ui-kicker text-muted">Pregled rasporeda</p>
          <h3 className="mt-2 text-3xl">Tjedni predlošci i stvarni termini</h3>
          <p className="ui-copy mt-3 max-w-3xl text-sm">
            Tjedni predlošci ostaju u glavnoj mreži, a stvarni termini i instance tih predložaka
            pratite po odabranom tjednu kako bi pregled ostao brz i jasan na svim ekranima.
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
            Predlošci <strong>{weeklySchedules.length}</strong>
          </span>
          <span className="schedule-pill">
            Stvarni termini <strong>{visibleWeekSpecialSchedules.length}</strong>
          </span>
          <span className="schedule-pill">
            Kategorije <strong>{categoryCount}</strong>
          </span>
        </div>
      </div>

      <div className={`schedule-board-layout ${showSidebar ? "" : "schedule-board-layout-compact"}`}>
        <div className="schedule-board-main">
          <div className="schedule-desktop-view">
            {weeklySchedules.length === 0 ? (
              <div className="schedule-empty-state">
                Tjedni predlošci još nisu definirani. Stvarni termini ostaju dostupni u sažetku
                sa strane.
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

                      {groupedSchedules[day.key].length === 0 ? (
                        <div className="schedule-day-empty">Bez redovnog termina</div>
                      ) : null}

                      {groupedSchedules[day.key].map((schedule) => {
                        const position = getSchedulePosition(schedule, timeWindow.startHour);
                        const tone = getToneForValue(schedule.category.id || schedule.category.name);
                        const isSelected = selectedScheduleId === schedule.id;
                        const occurrenceDate = getOccurrenceDateKey(day.date);

                        if (onSelectSchedule) {
                          return (
                            <button
                              key={schedule.id}
                              className={`schedule-event schedule-event-button ${isSelected ? "is-selected" : ""}`}
                              style={{
                                top: position.top,
                                height: position.height,
                                "--schedule-accent": tone.accent,
                                "--schedule-soft": tone.soft,
                                "--schedule-text": tone.text,
                              } as CSSProperties}
                              type="button"
                              onClick={() => handleSelectSchedule(schedule, occurrenceDate)}
                            >
                              <p className="schedule-event-time">
                                {formatTimeRange(schedule.startTime, schedule.endTime)}
                              </p>
                              <h5 className="schedule-event-title">{schedule.category.name}</h5>
                              {!compactEventContent && schedule.notes ? (
                                <p className="schedule-event-note">{schedule.notes}</p>
                              ) : null}
                              {!compactEventContent ? (
                                <p className="schedule-event-meta">{getCoachSummary(schedule)}</p>
                              ) : null}
                            </button>
                          );
                        }

                        return (
                          <article
                            key={schedule.id}
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
                              {formatTimeRange(schedule.startTime, schedule.endTime)}
                            </p>
                            <h5 className="schedule-event-title">{schedule.category.name}</h5>
                            {!compactEventContent && schedule.notes ? (
                              <p className="schedule-event-note">{schedule.notes}</p>
                            ) : null}
                            {!compactEventContent ? (
                              <p className="schedule-event-meta">{getCoachSummary(schedule)}</p>
                            ) : null}
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
                  <p className="ui-kicker text-muted">Odabrani dan</p>
                  <h4 className="mt-2 text-2xl">{currentDayMeta.label}</h4>
                  <p className="mt-2 text-sm text-muted">{formatLongDate(currentDayMeta.date.toISOString())}</p>
                </div>

                <div className="schedule-mobile-header-actions">
                  <span className="schedule-pill">
                    {currentDaySchedules.length > 0
                      ? `${currentDaySchedules.length} termina`
                      : "Bez termina"}
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
                {currentDaySchedules.length === 0 ? (
                  <div className="schedule-empty-state schedule-empty-state-mobile">
                    Nema redovnog ni posebnog termina za odabrani dan.
                  </div>
                ) : (
                  currentDaySchedules.map((schedule) => {
                    const tone = getToneForValue(schedule.category.id || schedule.category.name);
                    const isSelected = selectedScheduleId === schedule.id;
                    const occurrenceDate = schedule.isWeeklyTemplate
                      ? getOccurrenceDateKey(currentDayMeta.date)
                      : getOccurrenceDateKey(schedule.startTime);

                    if (onSelectSchedule) {
                      return (
                        <button
                          key={schedule.id}
                          className={`schedule-mobile-card schedule-event-button ${isSelected ? "is-selected" : ""}`}
                          style={{
                            "--schedule-accent": tone.accent,
                            "--schedule-soft": tone.soft,
                            "--schedule-text": tone.text,
                          } as CSSProperties}
                          type="button"
                          onClick={() => handleSelectSchedule(schedule, occurrenceDate)}
                        >
                          <div className="schedule-mobile-card-top">
                            <p className="schedule-event-time">
                              {formatTimeRange(schedule.startTime, schedule.endTime)}
                            </p>
                            {!compactEventContent ? (
                              <span className="schedule-pill">
                                {schedule.isWeeklyTemplate ? "Predložak" : "Stvarni termin"}
                              </span>
                            ) : null}
                          </div>
                          <h5 className="schedule-event-title">{schedule.category.name}</h5>
                          {!compactEventContent && schedule.notes ? (
                            <p className="schedule-event-note">{schedule.notes}</p>
                          ) : null}
                          {!compactEventContent ? (
                            <p className="schedule-event-meta">{getCoachSummary(schedule)}</p>
                          ) : null}
                        </button>
                      );
                    }

                    return (
                      <article
                        key={schedule.id}
                        className="schedule-mobile-card"
                        style={{
                          "--schedule-accent": tone.accent,
                          "--schedule-soft": tone.soft,
                          "--schedule-text": tone.text,
                        } as CSSProperties}
                      >
                        <div className="schedule-mobile-card-top">
                          <p className="schedule-event-time">
                            {formatTimeRange(schedule.startTime, schedule.endTime)}
                          </p>
                          {!compactEventContent ? (
                            <span className="schedule-pill">
                              {schedule.isWeeklyTemplate ? "Predložak" : "Stvarni termin"}
                            </span>
                          ) : null}
                        </div>
                        <h5 className="schedule-event-title">{schedule.category.name}</h5>
                        {!compactEventContent && schedule.notes ? (
                          <p className="schedule-event-note">{schedule.notes}</p>
                        ) : null}
                        {!compactEventContent ? (
                          <p className="schedule-event-meta">{getCoachSummary(schedule)}</p>
                        ) : null}
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          </div>

        </div>

        {showSidebar ? (
          <aside className="schedule-board-sidebar">
            <section className="schedule-side-card">
              <div className="schedule-side-card-header">
                <p className="ui-kicker text-muted">Mini kalendar</p>
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
                    onClick={() => selectCalendarDate(calendarDay.date)}
                  >
                    {calendarDay.date.getDate()}
                  </button>
                ))}
              </div>
            </section>

            <section className="schedule-side-card">
              <div className="schedule-side-card-header">
                <p className="ui-kicker text-muted">Sažetak</p>
                <h4 className="mt-2 text-2xl">Ključni pokazatelji</h4>
              </div>

              <div className="schedule-summary-grid">
                <div>
                  <span>Predlošci</span>
                  <strong>{weeklySchedules.length}</strong>
                </div>
                <div>
                  <span>Stvarni termini</span>
                  <strong>{visibleWeekSpecialSchedules.length}</strong>
                </div>
                <div>
                  <span>Kategorije</span>
                  <strong>{categoryCount}</strong>
                </div>
                <div>
                  <span>Raspon satnice</span>
                  <strong>
                    {formatHourLabel(timeWindow.startHour)} - {formatHourLabel(timeWindow.endHourExclusive)}
                  </strong>
                </div>
              </div>
            </section>

            <section className="schedule-side-card">
              <div className="schedule-side-card-header">
                <p className="ui-kicker text-muted">Stvarni termini</p>
                <h4 className="mt-2 text-2xl">Jednokratni treninzi i događaji</h4>
              </div>

              <div className="schedule-side-list">
                {visibleWeekSpecialSchedules.length === 0 ? (
                  <div className="schedule-empty-state schedule-empty-state-mobile">
                    Trenutno nema posebnih termina u vidljivom tjednu.
                  </div>
                ) : (
                  visibleWeekSpecialSchedules.map((schedule) =>
                    renderSpecialScheduleCard(
                      schedule,
                      selectedScheduleId,
                      handleSelectSchedule,
                      compactEventContent,
                    ),
                  )
                )}
              </div>
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function renderSpecialScheduleCard(
  schedule: ScheduleItem,
  selectedScheduleId: string | null,
  onSelectSchedule?: (schedule: ScheduleItem, occurrenceDate: string) => void,
  compactEventContent = false,
) {
  const tone = getToneForValue(schedule.category.id || schedule.category.name);
  const isSelected = selectedScheduleId === schedule.id;
  const occurrenceDate = getOccurrenceDateKey(schedule.startTime);

  if (onSelectSchedule) {
    return (
      <button
        key={schedule.id}
        className={`schedule-side-list-item schedule-event-button ${isSelected ? "is-selected" : ""}`}
        style={{
          "--schedule-accent": tone.accent,
          "--schedule-soft": tone.soft,
          "--schedule-text": tone.text,
        } as CSSProperties}
        type="button"
        onClick={() => onSelectSchedule(schedule, occurrenceDate)}
      >
        <p className="schedule-event-time">
          {formatLongDate(schedule.startTime)} · {formatTimeRange(schedule.startTime, schedule.endTime)}
        </p>
        <h5 className="schedule-event-title">{schedule.category.name}</h5>
        {!compactEventContent && schedule.notes ? (
          <p className="schedule-event-note">{schedule.notes}</p>
        ) : null}
        {!compactEventContent ? (
          <p className="schedule-event-meta">{getCoachSummary(schedule)}</p>
        ) : null}
      </button>
    );
  }

  return (
    <article
      key={schedule.id}
      className="schedule-side-list-item"
      style={{
        "--schedule-accent": tone.accent,
        "--schedule-soft": tone.soft,
        "--schedule-text": tone.text,
      } as CSSProperties}
    >
      <p className="schedule-event-time">
        {formatLongDate(schedule.startTime)} · {formatTimeRange(schedule.startTime, schedule.endTime)}
      </p>
      <h5 className="schedule-event-title">{schedule.category.name}</h5>
      {!compactEventContent && schedule.notes ? <p className="schedule-event-note">{schedule.notes}</p> : null}
      {!compactEventContent ? <p className="schedule-event-meta">{getCoachSummary(schedule)}</p> : null}
    </article>
  );
}

function buildVisibleWeekGroupedSchedules(schedules: ScheduleItem[], weekDays: WeekDayMeta[]) {
  const groups = orderedDays.reduce<Record<DayKey, ScheduleItem[]>>((accumulator, day) => {
    accumulator[day.key] = [];
    return accumulator;
  }, {} as Record<DayKey, ScheduleItem[]>);

  for (const day of weekDays) {
    groups[day.key] = schedules
      .filter((schedule) => getScheduleDayKey(schedule) === day.key)
      .filter((schedule) => !isScheduleCancelledOnDate(schedule, day.date))
      .sort(
        (left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime(),
      );
  }

  return groups;
}

function buildCombinedDaySchedules(
  dayKey: DayKey,
  weeklySchedules: ScheduleItem[],
  specialSchedules: ScheduleItem[],
) {
  const daySpecialSchedules = specialSchedules.filter(
    (schedule) => getDayKeyFromDate(schedule.startTime) === dayKey,
  );

  return [...weeklySchedules, ...daySpecialSchedules].sort((left, right) => {
    const timeDifference =
      getMinutesSinceMidnight(left.startTime) - getMinutesSinceMidnight(right.startTime);

    if (timeDifference !== 0) {
      return timeDifference;
    }

    return Number(left.isWeeklyTemplate) - Number(right.isWeeklyTemplate);
  });
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

function buildTimeWindow(schedules: ScheduleItem[]) {
  if (schedules.length === 0) {
    return {
      startHour: 16,
      endHourExclusive: 22,
    };
  }

  let minimumMinutes = Number.POSITIVE_INFINITY;
  let maximumMinutes = 0;

  for (const schedule of schedules) {
    minimumMinutes = Math.min(minimumMinutes, getMinutesSinceMidnight(schedule.startTime));
    maximumMinutes = Math.max(maximumMinutes, getMinutesSinceMidnight(schedule.endTime));
  }

  const startHour = Math.max(6, Math.floor(minimumMinutes / 60) - 1);
  const endHourExclusive = Math.min(
    23,
    Math.max(startHour + 5, Math.ceil(maximumMinutes / 60) + 1),
  );

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

function getSchedulePosition(schedule: ScheduleItem, startHour: number) {
  const startMinutes = getMinutesSinceMidnight(schedule.startTime);
  const endMinutes = getMinutesSinceMidnight(schedule.endTime);
  const top = ((startMinutes - startHour * 60) / 60) * desktopHourHeight;
  const height = Math.max(
    ((endMinutes - startMinutes) / 60) * desktopHourHeight,
    minimumEventHeight,
  );

  return {
    top,
    height,
  };
}

function getMinutesSinceMidnight(dateIso: string) {
  const date = new Date(dateIso);
  return date.getHours() * 60 + date.getMinutes();
}

function getScheduleDayKey(schedule: ScheduleItem) {
  return schedule.dayOfWeek ?? getDayKeyFromDate(schedule.startTime);
}

function isScheduleCancelledOnDate(schedule: ScheduleItem, date: Date) {
  const targetDate = getOccurrenceDateKey(date);

  return schedule.occurrences.some(
    (occurrence) =>
      occurrence.isCancelled && getOccurrenceDateKey(occurrence.occurrenceDate) === targetDate,
  );
}

function getOccurrenceDateKey(value: Date | string) {
  if (value instanceof Date) {
    return [
      value.getFullYear(),
      `${value.getMonth() + 1}`.padStart(2, "0"),
      `${value.getDate()}`.padStart(2, "0"),
    ].join("-");
  }

  return value.slice(0, 10);
}

function getDateFromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
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

function getCoachSummary(schedule: ScheduleItem) {
  if (schedule.coaches.length === 0) {
    return "Treneri će biti potvrđeni naknadno";
  }

  return schedule.coaches
    .map(
      (assignment) => `${assignment.coach.user.firstName} ${assignment.coach.user.lastName}`,
    )
    .join(", ");
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

function isSameDate(left: Date, right: Date) {
  return left.toDateString() === right.toDateString();
}

function isDateWithinRange(date: Date, start: Date, end: Date) {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}
