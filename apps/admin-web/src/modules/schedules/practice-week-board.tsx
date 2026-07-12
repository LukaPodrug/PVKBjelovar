import React, { type CSSProperties, useEffect, useState } from "react";
import {
  formatLongDate,
  formatTimeRange,
  getDayKeyFromDate,
  orderedDays,
} from "../core/date";
import type { DayKey, ScheduleCalendarItem } from "../core/types";

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
  items: ScheduleCalendarItem[];
  weekStartDate: string;
  selectedItemId?: string | null;
  showToolbar?: boolean;
  showSidebar?: boolean;
  compactEventContent?: boolean;
  cardContentMode?: "default" | "coachOnly";
  showCategoryName?: boolean;
  showScheduleName?: boolean;
  showPracticeTypeText?: boolean;
  showPracticeTypeLegend?: boolean;
  toneMode?: "category" | "practiceType";
  fixedStartHour?: number;
  fixedEndHourExclusive?: number;
  hourHeight?: number;
  minimumCardHeight?: number;
  emptyMessage?: string;
  onWeekStartChange: (nextWeekStartDate: string) => void;
  onSelectItem?: (item: ScheduleCalendarItem) => void;
}

const tonePalette: Tone[] = [
  { accent: "#1d4f91", soft: "#edf4ff", text: "#173d71" },
  { accent: "#0f766e", soft: "#e7f6f3", text: "#115e59" },
  { accent: "#9a6b2f", soft: "#fbf2e3", text: "#8b5e22" },
  { accent: "#7c3a8d", soft: "#f5ebfb", text: "#6b2f7c" },
  { accent: "#b45309", soft: "#fff3e8", text: "#9a3412" },
];

const practiceTypeToneMap: Record<ScheduleCalendarItem["practiceType"], Tone> = {
  WATER: { accent: "#1d4f91", soft: "#edf4ff", text: "#173d71" },
  DRYLAND: { accent: "#a16207", soft: "#fff7e8", text: "#8a4d00" },
};

const desktopHourHeight = 84;
const minimumEventHeight = 78;

export function PracticeWeekBoard({
  items,
  weekStartDate,
  selectedItemId = null,
  showToolbar = true,
  showSidebar = true,
  compactEventContent = false,
  cardContentMode = "default",
  showCategoryName = true,
  showScheduleName = true,
  showPracticeTypeText = true,
  showPracticeTypeLegend = false,
  toneMode = "category",
  fixedStartHour,
  fixedEndHourExclusive,
  hourHeight = desktopHourHeight,
  minimumCardHeight = minimumEventHeight,
  emptyMessage = "Nema termina u odabranom tjednu.",
  onWeekStartChange,
  onSelectItem,
}: PracticeWeekBoardProps) {
  const today = new Date();
  const todayKey = getDayKeyFromDate(today.toISOString());
  const visibleWeekStart = getDateFromDateKey(weekStartDate);
  const currentWeekStart = getWeekStart(today);
  const [selectedDay, setSelectedDay] = useState<DayKey>(() => {
    if (items.length > 0) {
      return getDayKeyFromDate(items[0].startTime);
    }

    return isDateWithinRange(today, visibleWeekStart, getWeekEnd(visibleWeekStart))
      ? todayKey
      : "MONDAY";
  });

  const weekDays = buildWeekDays(visibleWeekStart);
  const currentDayMeta = weekDays.find((day) => day.key === selectedDay) ?? weekDays[0];
  const groupedItems = buildVisibleWeekGroupedItems(items, weekDays);
  const currentDayItems = groupedItems[currentDayMeta.key] ?? [];
  const timeWindow = buildTimeWindow(items, fixedStartHour, fixedEndHourExclusive);
  const timeSlots = buildTimeSlots(timeWindow.startHour, timeWindow.endHourExclusive);
  const weekRangeLabel = formatWeekRange(weekDays[0].date, weekDays[weekDays.length - 1].date);
  const monthLabel = formatMonthLabel(weekDays[0].date);
  const monthCalendar = buildMonthCalendar(visibleWeekStart, currentDayMeta.date);
  const totalGridHeight = timeSlots.length * hourHeight;
  const categoryCount = new Set(items.map((item) => item.category.id)).size;
  const cancelledCount = items.filter((item) => item.isCancelled).length;
  const isCurrentWeek = isSameDate(visibleWeekStart, currentWeekStart);

  useEffect(() => {
    const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;

    if (selectedItem) {
      setSelectedDay(getDayKeyFromDate(selectedItem.startTime));
      return;
    }

    if (groupedItems[selectedDay]?.length === 0 && groupedItems.MONDAY.length > 0) {
      setSelectedDay("MONDAY");
    }
  }, [groupedItems, items, selectedDay, selectedItemId]);

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

  const selectCalendarDate = (date: Date) => {
    onWeekStartChange(getDateKey(getWeekStart(date)));
    setSelectedDay(getDayKeyFromDate(date.toISOString()));
  };

  return (
    <div className="schedule-board-shell border-2 border-line bg-surface">
      {showToolbar ? (
        <div className="schedule-board-toolbar border-b-2 border-line">
          <div>
            <p className="ui-kicker text-muted">Tjedni pregled</p>
            <h3 className="mt-2 text-3xl">Stvarni termini i treninzi</h3>
            <p className="ui-copy mt-3 max-w-3xl text-sm">
              Pregled prikazuje samo stvarne termine u odabranom tjednu, uključujući aktivirane
              rasporede i pojedinačne posebne treninge.
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
              Kategorije <strong>{categoryCount}</strong>
            </span>
            <span className="schedule-pill">
              Otkazani <strong>{cancelledCount}</strong>
            </span>
          </div>
        </div>
      ) : null}

      <div className={`schedule-board-layout ${showSidebar ? "" : "schedule-board-layout-compact"}`}>
        <div className="schedule-board-main">
          <div className="schedule-desktop-view">
            {items.length === 0 ? (
              <div className="schedule-empty-state">{emptyMessage}</div>
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
                        style={{ height: hourHeight }}
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
                      <div className="schedule-day-track-cells">
                        {timeSlots.map((slot) => (
                          <div
                            key={`${day.key}-${slot}`}
                            className="schedule-day-cell"
                            style={{ height: hourHeight }}
                          />
                        ))}
                      </div>

                      {groupedItems[day.key].map((item) => {
                        const position = getItemPosition(
                          item,
                          timeWindow.startHour,
                          hourHeight,
                          minimumCardHeight,
                        );
                        const tone = getToneForItem(item, toneMode);
                        const isSelected = selectedItemId === item.id;
                        const eventTitle = getEventTitle(item, showCategoryName, showPracticeTypeText);
                        const eventSubtitle = getEventSubtitle(
                          item,
                          showCategoryName,
                          showScheduleName,
                          showPracticeTypeText,
                        );

                        if (onSelectItem) {
                          return (
                            <button
                              key={item.id}
                              className={`schedule-event schedule-event-button ${
                                cardContentMode === "coachOnly" ? "schedule-event--coach-only " : ""
                              }${isSelected ? "is-selected " : ""}${
                                item.isCancelled ? "opacity-70" : ""
                              }`}
                              style={{
                                top: position.top,
                                height: position.height,
                                "--schedule-accent": tone.accent,
                                "--schedule-soft": tone.soft,
                                "--schedule-text": tone.text,
                              } as CSSProperties}
                              type="button"
                              onClick={() => onSelectItem(item)}
                            >
                              {cardContentMode === "coachOnly" ? (
                                <h5 className="schedule-event-title schedule-event-title--coach-only">
                                  {getCoachSummary(item)}
                                </h5>
                              ) : (
                                <>
                                  <p className="schedule-event-time">
                                    {formatTimeRange(item.startTime, item.endTime)}
                                  </p>
                                  {eventTitle ? (
                                    <h5 className="schedule-event-title">{eventTitle}</h5>
                                  ) : null}
                                  {!compactEventContent && eventSubtitle ? (
                                    <p className="schedule-event-note">{eventSubtitle}</p>
                                  ) : null}
                                  {!compactEventContent ? (
                                    <p className="schedule-event-meta">{getCoachSummary(item)}</p>
                                  ) : null}
                                  {item.isCancelled ? (
                                    <span className="mt-3 inline-flex w-fit rounded-full bg-white/70 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-signal">
                                      Otkazano
                                    </span>
                                  ) : null}
                                </>
                              )}
                            </button>
                          );
                        }

                        return (
                          <article
                            key={item.id}
                            className={`schedule-event ${
                              cardContentMode === "coachOnly" ? "schedule-event--coach-only " : ""
                            }${item.isCancelled ? "opacity-70" : ""}`}
                            style={{
                              top: position.top,
                              height: position.height,
                              "--schedule-accent": tone.accent,
                              "--schedule-soft": tone.soft,
                              "--schedule-text": tone.text,
                            } as CSSProperties}
                          >
                            {cardContentMode === "coachOnly" ? (
                              <h5 className="schedule-event-title schedule-event-title--coach-only">
                                {getCoachSummary(item)}
                              </h5>
                            ) : (
                              <>
                                <p className="schedule-event-time">
                                  {formatTimeRange(item.startTime, item.endTime)}
                                </p>
                                {eventTitle ? (
                                  <h5 className="schedule-event-title">{eventTitle}</h5>
                                ) : null}
                                {!compactEventContent && eventSubtitle ? (
                                  <p className="schedule-event-note">{eventSubtitle}</p>
                                ) : null}
                                {!compactEventContent ? (
                                  <p className="schedule-event-meta">{getCoachSummary(item)}</p>
                                ) : null}
                              </>
                            )}
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
                {currentDayItems.map((item) => {
                    const tone = getToneForItem(item, toneMode);
                    const isSelected = selectedItemId === item.id;
                    const eventTitle = getEventTitle(item, showCategoryName, showPracticeTypeText);
                    const eventSubtitle = getEventSubtitle(
                      item,
                      showCategoryName,
                      showScheduleName,
                      showPracticeTypeText,
                    );

                    if (onSelectItem) {
                      return (
                        <button
                          key={item.id}
                          className={`schedule-mobile-card schedule-event-button ${
                            cardContentMode === "coachOnly" ? "schedule-mobile-card--coach-only " : ""
                          }${isSelected ? "is-selected" : ""}`}
                          style={{
                            "--schedule-accent": tone.accent,
                            "--schedule-soft": tone.soft,
                            "--schedule-text": tone.text,
                          } as CSSProperties}
                          type="button"
                          onClick={() => onSelectItem(item)}
                          >
                          {cardContentMode === "coachOnly" ? (
                            <h5 className="schedule-event-title schedule-event-title--coach-only">
                              {getCoachSummary(item)}
                            </h5>
                          ) : (
                            <>
                              <div className="schedule-mobile-card-top">
                                <p className="schedule-event-time">
                                {formatTimeRange(item.startTime, item.endTime)}
                              </p>
                              <span className="schedule-pill">
                                  {item.sourceType === "WEEKLY_TEMPLATE" ? "Raspored" : "Posebni"}
                                </span>
                              </div>
                            {eventTitle ? <h5 className="schedule-event-title">{eventTitle}</h5> : null}
                            {eventSubtitle && !compactEventContent ? (
                              <p className="schedule-event-note">{eventSubtitle}</p>
                            ) : null}
                            {!compactEventContent ? (
                              <p className="schedule-event-meta">{getCoachSummary(item)}</p>
                            ) : null}
                            {item.isCancelled ? (
                              <span className="mt-3 inline-flex w-fit rounded-full bg-white/70 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-signal">
                                Otkazano
                              </span>
                            ) : null}
                            </>
                          )}
                        </button>
                      );
                    }

                    return (
                      <article
                        key={item.id}
                        className={`schedule-mobile-card ${
                          cardContentMode === "coachOnly" ? "schedule-mobile-card--coach-only" : ""
                        }`}
                        style={{
                          "--schedule-accent": tone.accent,
                          "--schedule-soft": tone.soft,
                          "--schedule-text": tone.text,
                        } as CSSProperties}
                      >
                        {cardContentMode === "coachOnly" ? (
                          <h5 className="schedule-event-title schedule-event-title--coach-only">
                            {getCoachSummary(item)}
                          </h5>
                        ) : (
                          <>
                            <div className="schedule-mobile-card-top">
                              <p className="schedule-event-time">
                                {formatTimeRange(item.startTime, item.endTime)}
                              </p>
                              <span className="schedule-pill">
                                {item.sourceType === "WEEKLY_TEMPLATE" ? "Raspored" : "Posebni"}
                              </span>
                            </div>
                            {eventTitle ? <h5 className="schedule-event-title">{eventTitle}</h5> : null}
                            {eventSubtitle && !compactEventContent ? (
                              <p className="schedule-event-note">{eventSubtitle}</p>
                            ) : null}
                            {!compactEventContent ? (
                              <p className="schedule-event-meta">{getCoachSummary(item)}</p>
                            ) : null}
                          </>
                        )}
                      </article>
                    );
                  })}
              </div>
            </div>
          </div>

          {showPracticeTypeLegend ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[20px] border border-line bg-white px-4 py-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                Legenda
              </span>
              {([
                ["WATER", "Trening u vodi"],
                ["DRYLAND", "Suhi trening"],
              ] as const).map(([practiceType, label]) => {
                const tone = practiceTypeToneMap[practiceType];

                return (
                  <span
                    key={practiceType}
                    className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-2 text-xs font-semibold text-ink"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: tone.accent }}
                    />
                    {label}
                  </span>
                );
              })}
            </div>
          ) : null}
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
                <h4 className="mt-2 text-2xl">Odabrani tjedan</h4>
              </div>

              <div className="schedule-summary-grid">
                <div>
                  <span>Ukupno</span>
                  <strong>{items.length}</strong>
                </div>
                <div>
                  <span>Kategorije</span>
                  <strong>{categoryCount}</strong>
                </div>
                <div>
                  <span>Otkazani</span>
                  <strong>{cancelledCount}</strong>
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
        ) : null}
      </div>
    </div>
  );
}

function buildVisibleWeekGroupedItems(items: ScheduleCalendarItem[], weekDays: WeekDayMeta[]) {
  const groups = orderedDays.reduce<Record<DayKey, ScheduleCalendarItem[]>>((accumulator, day) => {
    accumulator[day.key] = [];
    return accumulator;
  }, {} as Record<DayKey, ScheduleCalendarItem[]>);

  for (const day of weekDays) {
    groups[day.key] = items
      .filter((item) => getDayKeyFromDate(item.startTime) === day.key)
      .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime());
  }

  return groups;
}

function buildTimeWindow(
  items: ScheduleCalendarItem[],
  fixedStartHour?: number,
  fixedEndHourExclusive?: number,
) {
  if (fixedStartHour !== undefined && fixedEndHourExclusive !== undefined) {
    return {
      startHour: fixedStartHour,
      endHourExclusive: Math.max(fixedEndHourExclusive, fixedStartHour + 1),
    };
  }

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

function getItemPosition(
  item: ScheduleCalendarItem,
  startHour: number,
  hourHeight: number,
  minimumCardHeight: number,
) {
  const startMinutes = getMinutesSinceMidnight(item.startTime);
  const endMinutes = getMinutesSinceMidnight(item.endTime);
  const top = ((startMinutes - startHour * 60) / 60) * hourHeight;
  const height = Math.max(((endMinutes - startMinutes) / 60) * hourHeight, minimumCardHeight);

  return {
    top,
    height,
  };
}

function buildTimeSlots(startHour: number, endHourExclusive: number) {
  return Array.from(
    { length: Math.max(endHourExclusive - startHour, 1) },
    (_, index) => startHour + index,
  );
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

function formatDayDate(date: Date) {
  return new Intl.DateTimeFormat("hr-HR", {
    day: "numeric",
    month: "numeric",
  }).format(date);
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("hr-HR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatWeekRange(startDate: Date, endDate: Date) {
  const startLabel = new Intl.DateTimeFormat("hr-HR", {
    day: "numeric",
    month: "short",
  }).format(startDate);
  const endLabel = new Intl.DateTimeFormat("hr-HR", {
    day: "numeric",
    month: "short",
  }).format(endDate);

  return `${startLabel} - ${endLabel}`;
}

function formatHourLabel(hour: number) {
  return `${`${hour}`.padStart(2, "0")}:00`;
}

function getCoachSummary(item: ScheduleCalendarItem) {
  if (item.coaches.length === 0) {
    return "Trener će biti potvrđen naknadno";
  }

  return item.coaches
    .map((assignment) => `${assignment.coach.user.firstName} ${assignment.coach.user.lastName}`)
    .join(", ");
}

function getEventTitle(
  item: ScheduleCalendarItem,
  showCategoryName: boolean,
  showPracticeTypeText: boolean,
) {
  if (showCategoryName) {
    return item.category.name;
  }

  return showPracticeTypeText ? formatPracticeType(item.practiceType) : null;
}

function getEventSubtitle(
  item: ScheduleCalendarItem,
  showCategoryName: boolean,
  showScheduleName: boolean,
  showPracticeTypeText: boolean,
) {
  const parts: string[] = [];

  if (showCategoryName && showPracticeTypeText) {
    parts.push(formatPracticeType(item.practiceType));
  }

  if (showScheduleName && item.weeklyScheduleName) {
    parts.push(item.weeklyScheduleName);
  }

  if (parts.length > 0) {
    return parts.join(" · ");
  }

  if (showScheduleName && item.sourceType === "SPECIAL_PRACTICE") {
    return "Pojedinačni termin";
  }

  return null;
}

function formatPracticeType(practiceType: ScheduleCalendarItem["practiceType"]) {
  return practiceType === "DRYLAND" ? "Suhi trening" : "Trening u vodi";
}

function getToneForItem(item: ScheduleCalendarItem, toneMode: "category" | "practiceType") {
  if (toneMode === "practiceType") {
    return practiceTypeToneMap[item.practiceType];
  }

  return getToneForValue(item.category.id || item.category.name);
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
