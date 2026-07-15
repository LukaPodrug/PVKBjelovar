import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { useMemo, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { api } from "../core/api";
import { formatDate } from "../core/date";
import type {
  CoachRecord,
  PaginatedResponse,
  PlayerRecord,
  PracticeType,
  ScheduleAttendanceDetail,
  ScheduleCalendarItem,
} from "../core/types";
import { EntityDrawer } from "../layout/entity-drawer";
import { FeedbackToast } from "../ui/feedback-toast";
import { PaginationControls } from "../ui/pagination-controls";
import { SearchMultiSelectPanel } from "../ui/search-multi-select-panel";
import { TimePicker } from "../ui/time-picker";
import { PracticeWeekBoard } from "../schedules/practice-week-board";
import { DashboardScheduleLoadingBoard } from "./dashboard-schedule-loading-board";

interface FeedbackState {
  tone: "success" | "error";
  message: string;
}

interface PracticeFormState {
  date: string;
  practiceType: PracticeType;
  startTime: string;
  endTime: string;
  notes: string;
  coachIds: string[];
}

const attendancePageSize = 30;

export function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [weekStartDate, setWeekStartDate] = useState(() => getCurrentWeekStartDateKey());
  const [selectedPracticeId, setSelectedPracticeId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [practiceForm, setPracticeForm] = useState<PracticeFormState>(emptyPracticeForm);
  const [attendancePlayerIds, setAttendancePlayerIds] = useState<string[]>([]);
  const [attendancePlayersPage, setAttendancePlayersPage] = useState(1);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

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

  const coachesQuery = useQuery({
    queryKey: ["coaches", "dashboard-options"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CoachRecord>>("/coaches", {
        params: { page: 1, pageSize: 100 },
      });
      return response.data.items;
    },
  });

  const schedules = schedulesQuery.data ?? [];
  const visibleSchedules = user
    ? schedules.filter((schedule) =>
        schedule.coaches.some((assignment) => assignment.coach.user.id === user.userId),
      )
    : [];
  const selectedPractice =
    visibleSchedules.find((practice) => practice.id === selectedPracticeId) ?? null;
  const selectedPracticeIsWeeklyOccurrence =
    selectedPractice?.sourceType === "WEEKLY_TEMPLATE";
  const canShowAttendanceWidget = selectedPractice
    ? Date.now() >= new Date(selectedPractice.startTime).getTime() - 60 * 60 * 1000
    : false;
  const coachSearchItems = (coachesQuery.data ?? []).map((coach) => ({
    id: coach.id,
    label: `${coach.user.firstName} ${coach.user.lastName}`,
    meta: coach.isConditioningCoach ? "Kondicijski trener" : "Trener",
  }));

  const attendancePlayersQuery = useQuery({
    queryKey: [
      "players",
      "dashboard-attendance-roster",
      selectedPractice?.category.id ?? null,
      attendancePlayersPage,
    ],
    enabled: isDrawerOpen && selectedPractice !== null && canShowAttendanceWidget,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlayerRecord>>("/players", {
        params: {
          page: attendancePlayersPage,
          pageSize: attendancePageSize,
          categoryId: selectedPractice?.category.id,
        },
      });
      return response.data;
    },
  });

  const attendanceQuery = useQuery({
    queryKey: [
      "schedule-attendance",
      selectedPractice?.scheduleId ?? null,
      selectedPractice?.occurrenceDate ?? null,
    ],
    enabled: isDrawerOpen && selectedPractice !== null && canShowAttendanceWidget,
    queryFn: async () => {
      const response = await api.get<ScheduleAttendanceDetail>(
        `/schedules/${selectedPractice?.scheduleId}/attendance`,
        {
          params: {
            occurrenceDate: selectedPractice?.occurrenceDate,
          },
        },
      );
      setAttendancePlayerIds(response.data.presentPlayerIds);
      return response.data;
    },
  });

  const sortedAttendancePlayers = useMemo(() => {
    const players = attendancePlayersQuery.data?.items ?? [];
    return [...players].sort((left, right) => {
      const lastNameComparison = left.user.lastName.localeCompare(right.user.lastName, "hr-HR");

      if (lastNameComparison !== 0) {
        return lastNameComparison;
      }

      return left.user.firstName.localeCompare(right.user.firstName, "hr-HR");
    });
  }, [attendancePlayersQuery.data?.items]);

  const updatePracticeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPractice) {
        throw new Error("Termin nije odabran.");
      }

      if (selectedPracticeIsWeeklyOccurrence) {
        const response = await api.patch<ScheduleCalendarItem>(
          `/schedules/${selectedPractice.scheduleId}/occurrence`,
          buildOccurrencePayload(practiceForm),
        );
        return response.data;
      }

      const response = await api.patch(
        `/schedules/${selectedPractice.scheduleId}`,
        buildSpecialPracticePayload(selectedPractice, practiceForm),
      );
      return response.data;
    },
    onSuccess: () => {
      setFeedback({
        tone: "success",
        message: "Detalji treninga uspješno su spremljeni.",
      });
      void invalidateDashboardScheduleQueries(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Spremanje detalja treninga nije uspjelo.",
      });
    },
  });

  const attendanceMutation = useMutation({
    mutationFn: async ({
      occurrenceDate,
      presentPlayerIds,
      isCancelled,
    }: {
      occurrenceDate: string;
      presentPlayerIds: string[];
      isCancelled: boolean;
    }) => {
      if (!selectedPractice) {
        throw new Error("Termin nije odabran.");
      }

      const response = await api.put<ScheduleAttendanceDetail>(
        `/schedules/${selectedPractice.scheduleId}/attendance`,
        {
          occurrenceDate,
          presentPlayerIds,
          isCancelled,
        },
      );
      return response.data;
    },
    onSuccess: (result) => {
      setAttendancePlayerIds(result.presentPlayerIds);
      setFeedback({
        tone: "success",
        message: result.isCancelled ? "Termin je otkazan." : "Dolazak je spremljen.",
      });
      void invalidateDashboardScheduleQueries(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Spremanje dolaska nije uspjelo.",
      });
    },
  });

  const isBusy = updatePracticeMutation.isPending || attendanceMutation.isPending;

  const openPracticeDrawer = (practice: ScheduleCalendarItem) => {
    setFeedback(null);
    setSelectedPracticeId(practice.id);
    setPracticeForm(createPracticeForm(practice));
    setAttendancePlayerIds([]);
    setAttendancePlayersPage(1);
    setIsDrawerOpen(true);
  };

  return (
    <section className="space-y-6">
      <FeedbackToast feedback={feedback} onClose={() => setFeedback(null)} />

      {schedulesQuery.isLoading ? (
        <DashboardScheduleLoadingBoard weekStartDate={weekStartDate} />
      ) : schedulesQuery.isError ? (
        <div className="border-2 border-line bg-signal px-5 py-4 text-sm font-medium text-surface">
          Raspored trenutno nije moguće učitati.
        </div>
      ) : (
        <PracticeWeekBoard
          items={visibleSchedules}
          weekStartDate={weekStartDate}
          selectedItemId={selectedPracticeId}
          showSidebar={false}
          compactEventContent
          emptyMessage="Nema treninga dodijeljenih prijavljenom treneru u odabranom tjednu."
          onWeekStartChange={setWeekStartDate}
          onSelectItem={openPracticeDrawer}
        />
      )}

      <EntityDrawer
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        eyebrow={
          selectedPracticeIsWeeklyOccurrence ? "Stvarni trening iz rasporeda" : "Posebni termin"
        }
        title={
          selectedPractice
            ? `${selectedPractice.category.name} · ${formatDate(selectedPractice.occurrenceDate)}`
            : "Pregled termina"
        }
      >
        {selectedPractice ? (
          <section className="space-y-4">
            <section className="schedule-drawer-surface">
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  setFeedback(null);
                  updatePracticeMutation.mutate();
                }}
              >
                <fieldset className="schedule-widget">
                  <legend className="schedule-widget-title">Detalji treninga</legend>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Početak
                      </span>
                      <TimePicker
                        className="w-full rounded-[18px] border border-line bg-surface px-4 py-3 outline-none transition focus:bg-bg"
                        value={practiceForm.startTime}
                        onChange={(value) =>
                          setPracticeForm((current) => ({
                            ...current,
                            startTime: value,
                          }))
                        }
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Kraj
                      </span>
                      <TimePicker
                        className="w-full rounded-[18px] border border-line bg-surface px-4 py-3 outline-none transition focus:bg-bg"
                        value={practiceForm.endTime}
                        onChange={(value) =>
                          setPracticeForm((current) => ({
                            ...current,
                            endTime: value,
                          }))
                        }
                      />
                    </label>

                    <label className="block lg:col-span-2">
                      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Opis
                      </span>
                      <textarea
                        className="min-h-24 w-full rounded-[18px] border border-line bg-surface px-4 py-3 outline-none transition focus:bg-bg"
                        value={practiceForm.notes}
                        onChange={(event) =>
                          setPracticeForm((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                        placeholder="Opis ili napomena za ovaj trening."
                      />
                    </label>
                  </div>
                </fieldset>

                <fieldset className="schedule-widget">
                  <legend className="schedule-widget-title">Treneri</legend>
                  <SearchMultiSelectPanel
                    title="Treneri termina"
                    searchPlaceholder="Pretraga trenera"
                    noResultsLabel="Nema trenera koji odgovaraju pretrazi."
                    items={coachSearchItems}
                    selectedIds={practiceForm.coachIds}
                    isSearching={coachesQuery.isFetching}
                    onToggle={(coachId) =>
                      setPracticeForm((current) => ({
                        ...current,
                        coachIds: current.coachIds.includes(coachId)
                          ? current.coachIds.filter((id) => id !== coachId)
                          : [...current.coachIds, coachId],
                      }))
                    }
                  />
                </fieldset>

                <div className="schedule-actions">
                  <button
                    className="ui-pill ui-pill-button ui-pill--accent"
                    type="submit"
                    disabled={isBusy}
                  >
                    {updatePracticeMutation.isPending ? "Spremanje..." : "Spremi detalje"}
                  </button>
                </div>
              </form>
            </section>

            {canShowAttendanceWidget ? (
              <fieldset className="schedule-widget">
                <legend className="schedule-widget-title">Prisutnost igrača</legend>
                <div className="space-y-5 p-4">
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`ui-pill ${
                        attendanceQuery.data?.isCancelled ? "ui-pill--signal" : "ui-pill--success"
                      }`}
                    >
                      {attendanceQuery.data?.isCancelled ? "Termin otkazan" : "Termin aktivan"}
                    </span>
                    <span className="ui-pill ui-pill--panel">
                      Prisutni <strong>{attendancePlayerIds.length}</strong>
                    </span>
                  </div>

                  {attendanceQuery.isLoading || attendancePlayersQuery.isLoading ? (
                    <div className="h-48 animate-pulse rounded-[24px] border border-line bg-panel" />
                  ) : attendanceQuery.isError || attendancePlayersQuery.isError ? (
                    <div className="rounded-[24px] border border-line bg-signal px-5 py-4 text-sm font-medium text-surface">
                      Dolazak za odabrani termin nije moguće učitati.
                    </div>
                  ) : (
                    <>
                      <AttendanceRoster
                        players={sortedAttendancePlayers}
                        selectedIds={attendancePlayerIds}
                        disabled={Boolean(attendanceQuery.data?.isCancelled)}
                        onSelectAll={() =>
                          setAttendancePlayerIds((current) =>
                            Array.from(
                              new Set([
                                ...current,
                                ...sortedAttendancePlayers.map((player) => player.id),
                              ]),
                            ),
                          )
                        }
                        onClearAll={() =>
                          setAttendancePlayerIds((current) =>
                            current.filter(
                              (id) => !sortedAttendancePlayers.some((player) => player.id === id),
                            ),
                          )
                        }
                        onToggle={(playerId) =>
                          setAttendancePlayerIds((current) =>
                            current.includes(playerId)
                              ? current.filter((id) => id !== playerId)
                              : [...current, playerId],
                          )
                        }
                      />

                      {attendancePlayersQuery.data ? (
                        <PaginationControls
                          page={attendancePlayersQuery.data.page}
                          pageSize={attendancePlayersQuery.data.pageSize}
                          total={attendancePlayersQuery.data.total}
                          totalPages={attendancePlayersQuery.data.totalPages}
                          onPageChange={setAttendancePlayersPage}
                        />
                      ) : null}

                      <div className="schedule-actions">
                        <button
                          className="ui-pill ui-pill-button ui-pill--accent"
                          type="button"
                          disabled={attendanceQuery.data?.isCancelled || attendanceMutation.isPending}
                          onClick={() =>
                            attendanceMutation.mutate({
                              occurrenceDate: selectedPractice.occurrenceDate,
                              presentPlayerIds: attendancePlayerIds,
                              isCancelled: false,
                            })
                          }
                        >
                          {attendanceMutation.isPending ? "Spremanje..." : "Spremi dolazak"}
                        </button>
                        <button
                          className="ui-pill ui-pill-button ui-pill--outline"
                          type="button"
                          disabled={!attendanceQuery.data || attendanceMutation.isPending}
                          onClick={() =>
                            setAttendancePlayerIds(attendanceQuery.data?.presentPlayerIds ?? [])
                          }
                        >
                          Vrati zadnje spremljeno
                        </button>
                        <button
                          className={`ui-pill ui-pill-button ${
                            attendanceQuery.data?.isCancelled ? "ui-pill--success" : "ui-pill--signal"
                          }`}
                          type="button"
                          disabled={attendanceMutation.isPending}
                          onClick={() =>
                            attendanceMutation.mutate({
                              occurrenceDate: selectedPractice.occurrenceDate,
                              presentPlayerIds: attendancePlayerIds,
                              isCancelled: !attendanceQuery.data?.isCancelled,
                            })
                          }
                        >
                          {attendanceMutation.isPending
                            ? "Spremanje..."
                            : attendanceQuery.data?.isCancelled
                              ? "Vrati termin"
                              : "Otkaži termin"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </fieldset>
            ) : null}
          </section>
        ) : null}
      </EntityDrawer>
    </section>
  );
}

const emptyPracticeForm: PracticeFormState = {
  date: "",
  practiceType: "WATER",
  startTime: "",
  endTime: "",
  notes: "",
  coachIds: [],
};

function createPracticeForm(practice: ScheduleCalendarItem): PracticeFormState {
  return {
    date: practice.startTime.slice(0, 10),
    practiceType: practice.practiceType,
    startTime: toTimeInputValue(practice.startTime),
    endTime: toTimeInputValue(practice.endTime),
    notes: practice.notes ?? "",
    coachIds: practice.coaches.map((assignment) => assignment.coachId),
  };
}

function buildOccurrencePayload(form: PracticeFormState) {
  return {
    occurrenceDate: form.date,
    startTime: new Date(`${form.date}T${form.startTime}`).toISOString(),
    endTime: new Date(`${form.date}T${form.endTime}`).toISOString(),
    notes: form.notes || undefined,
    coachIds: form.coachIds,
  };
}

function buildSpecialPracticePayload(practice: ScheduleCalendarItem, form: PracticeFormState) {
  return {
    categoryId: practice.category.id,
    practiceType: form.practiceType,
    startTime: new Date(`${form.date}T${form.startTime}`).toISOString(),
    endTime: new Date(`${form.date}T${form.endTime}`).toISOString(),
    notes: form.notes || undefined,
    coachIds: form.coachIds,
  };
}

function AttendanceRoster({
  players,
  selectedIds,
  disabled,
  onSelectAll,
  onClearAll,
  onToggle,
}: {
  players: PlayerRecord[];
  selectedIds: string[];
  disabled: boolean;
  onSelectAll: () => void;
  onClearAll: () => void;
  onToggle: (playerId: string) => void;
}) {
  return (
    <div className={`overflow-hidden rounded-[24px] border border-line bg-white ${disabled ? "opacity-75" : ""}`}>
      <div className="flex flex-col gap-3 border-b border-line bg-bg px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
            Popis igrača kategorije
          </p>
          <p className="mt-2 text-sm text-muted">
            Označite prisutne igrače za ovaj trening.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="ui-pill ui-pill--panel">
            Ukupno <strong>{players.length}</strong>
          </span>
          <span className="ui-pill ui-pill--success">
            Označeno <strong>{selectedIds.length}</strong>
          </span>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {players.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-line bg-bg px-4 py-5 text-sm leading-7 text-muted">
            Ova kategorija trenutno nema nijednog igrača.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <button
                className="ui-pill ui-pill-button ui-pill--panel"
                type="button"
                disabled={disabled}
                onClick={onSelectAll}
              >
                Označi sve
              </button>
              <button
                className="ui-pill ui-pill-button ui-pill--outline"
                type="button"
                disabled={disabled || selectedIds.length === 0}
                onClick={onClearAll}
              >
                Makni sve
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {players.map((player) => {
                const isChecked = selectedIds.includes(player.id);

                return (
                  <label
                    key={player.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-[20px] border border-line px-3 py-3 ${
                      isChecked ? "bg-panel" : "bg-white"
                    } ${disabled ? "cursor-not-allowed" : ""}`}
                  >
                    <input
                      className="h-4 w-4 accent-accent"
                      type="checkbox"
                      checked={isChecked}
                      disabled={disabled}
                      onChange={() => onToggle(player.id)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold uppercase">
                        {player.user.firstName} {player.user.lastName}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function toTimeInputValue(dateIso: string) {
  const date = new Date(dateIso);
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

async function invalidateDashboardScheduleQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["dashboard", "calendar"] }),
    queryClient.invalidateQueries({ queryKey: ["schedule-attendance"] }),
  ]);
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
