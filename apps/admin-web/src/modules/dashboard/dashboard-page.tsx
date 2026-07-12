import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../auth/auth-context";
import { api } from "../core/api";
import type { ScheduleCalendarItem } from "../core/types";
import { PracticeWeekBoard } from "../schedules/practice-week-board";

export function DashboardPage() {
  const { user } = useAuth();
  const [weekStartDate, setWeekStartDate] = useState(() => getCurrentWeekStartDateKey());
  const schedulesQuery = useQuery({
    queryKey: ["dashboard", "calendar", weekStartDate],
    queryFn: async () => {
      const response = await api.get<ScheduleCalendarItem[]>("/schedules/calendar", {
        params: {
          weekStart: weekStartDate,
          includeCancelled: "false",
          assignedOnly: "true",
        },
      });
      return response.data;
    },
  });

  const schedules = schedulesQuery.data ?? [];
  const visibleSchedules = user
    ? schedules.filter((schedule) =>
        schedule.coaches.some((assignment) => assignment.coach.user.id === user.userId),
      )
    : [];

  return (
    <section className="space-y-6">
      {schedulesQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-40 animate-pulse border-2 border-line bg-panel"
            />
          ))}
        </div>
      ) : schedulesQuery.isError ? (
        <div className="border-2 border-line bg-signal px-5 py-4 text-sm font-medium text-surface">
          Raspored trenutno nije moguće učitati.
        </div>
      ) : (
        <PracticeWeekBoard
          items={visibleSchedules}
          weekStartDate={weekStartDate}
          showSidebar={false}
          compactEventContent
          emptyMessage="Nema treninga dodijeljenih prijavljenom treneru u odabranom tjednu."
          onWeekStartChange={setWeekStartDate}
        />
      )}
    </section>
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
