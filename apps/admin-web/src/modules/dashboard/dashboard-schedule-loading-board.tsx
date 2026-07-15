import { formatDate, orderedDays } from "../core/date";

interface DashboardScheduleLoadingBoardProps {
  weekStartDate: string;
}

interface LoadingWeekDay {
  key: string;
  label: string;
  shortLabel: string;
  date: Date;
  isToday: boolean;
}

export function DashboardScheduleLoadingBoard({
  weekStartDate,
}: DashboardScheduleLoadingBoardProps) {
  const weekDays = buildLoadingWeekDays(weekStartDate);
  const isCurrentWeek = weekStartDate === getCurrentWeekStartDateKey();

  return (
    <div
      className="schedule-board-shell border-2 border-line bg-surface"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Učitavanje rasporeda za odabrani tjedan"
    >
      <div className="schedule-board-toolbar border-b-2 border-line">
        <div>
          <p className="ui-kicker text-muted">Tjedni pregled</p>
          <h3 className="mt-2 text-xl font-bold uppercase">Raspored treninga</h3>
        </div>

        <div className="schedule-week-controls">
          <div className="schedule-week-nav" aria-hidden="true">
            <span className="schedule-week-nav-button pointer-events-none opacity-60">{"<"}</span>
            <div className="schedule-week-nav-summary">
              <span>{isCurrentWeek ? "Ovaj tjedan" : "Vidljivi tjedan"}</span>
              <strong>{formatWeekRangeLabel(weekDays[0].date, weekDays[6].date)}</strong>
            </div>
            <span className="schedule-week-nav-button pointer-events-none opacity-60">{">"}</span>
          </div>

          <span className="schedule-week-today-button pointer-events-none opacity-60">
            Ovaj tjedan
          </span>
        </div>
      </div>

      <div className="schedule-board-layout schedule-board-layout-compact">
        <div className="schedule-board-main">
          <div className="dashboard-schedule-loading">
            <span className="admin-loading-spinner" aria-hidden="true" />
            <div>
              <p className="ui-kicker text-muted">Učitavanje</p>
              <p className="mt-2 text-lg font-bold text-ink">Raspored za odabrani tjedan</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildLoadingWeekDays(weekStartDate: string): LoadingWeekDay[] {
  const startDate = parseDateKey(weekStartDate);
  const today = new Date();

  return orderedDays.map((day, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return {
      ...day,
      date,
      isToday: isSameDate(date, today),
    };
  });
}

function formatWeekRangeLabel(startDate: Date, endDate: Date) {
  return `${formatDate(startDate.toISOString())} - ${formatDate(endDate.toISOString())}`;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function isSameDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function getCurrentWeekStartDateKey() {
  const now = new Date();
  const current = new Date(now);
  const day = current.getDay();
  const offset = day === 0 ? 6 : day - 1;
  current.setDate(current.getDate() - offset);

  return [
    current.getFullYear(),
    `${current.getMonth() + 1}`.padStart(2, "0"),
    `${current.getDate()}`.padStart(2, "0"),
  ].join("-");
}
