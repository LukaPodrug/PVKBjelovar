import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { api } from "../core/api";
import {
  formatDate,
  formatLongDate,
  formatTimeRange,
  orderedDays,
} from "../core/date";
import type {
  CategoryRecord,
  CoachRecord,
  DayKey,
  PaginatedResponse,
  PlayerRecord,
  PracticeType,
  ScheduleAttendanceDetail,
  ScheduleCalendarItem,
  WeeklyScheduleRecord,
} from "../core/types";
import { EntityDrawer } from "../layout/entity-drawer";
import { PaginationControls } from "../ui/pagination-controls";
import { SearchMultiSelectPanel } from "../ui/search-multi-select-panel";
import { PracticeWeekBoard } from "./practice-week-board";

interface FeedbackState {
  tone: "success" | "error";
  message: string;
}

interface WeeklyScheduleSlotFormState {
  id?: string;
  dayOfWeek: DayKey;
  practiceType: PracticeType;
  startTime: string;
  endTime: string;
  notes: string;
  coachIds: string[];
}

interface WeeklyScheduleFormState {
  categoryId: string;
  name: string;
  description: string;
  slots: WeeklyScheduleSlotFormState[];
}

interface SpecialPracticeFormState {
  categoryId: string;
  date: string;
  practiceType: PracticeType;
  startTime: string;
  endTime: string;
  notes: string;
  coachIds: string[];
}

type DrawerMode =
  | "weekly-create"
  | "weekly-edit"
  | "practice-create"
  | "practice-edit";

const allCategoriesFallbackTab = "";
const attendancePageSize = 30;
const optionPageSize = 100;
const practiceTypeOptions: Array<{ value: PracticeType; label: string }> = [
  { value: "WATER", label: "Trening u vodi" },
  { value: "DRYLAND", label: "Suhi trening" },
];

export function SchedulesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [weekStartDate, setWeekStartDate] = useState(() => getCurrentWeekStartDateKey());
  const [activeCategoryId, setActiveCategoryId] = useState<string>(allCategoriesFallbackTab);
  const [selectedWeeklyScheduleId, setSelectedWeeklyScheduleId] = useState<string | null>(null);
  const [selectedPracticeId, setSelectedPracticeId] = useState<string | null>(null);
  const [attendancePlayerIds, setAttendancePlayerIds] = useState<string[]>([]);
  const [attendancePlayersPage, setAttendancePlayersPage] = useState(1);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("weekly-create");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [expandedWeeklySlotIndexes, setExpandedWeeklySlotIndexes] = useState<number[]>([]);
  const [weeklyForm, setWeeklyForm] = useState<WeeklyScheduleFormState>({
    categoryId: "",
    name: "",
    description: "",
    slots: [],
  });
  const [practiceForm, setPracticeForm] = useState<SpecialPracticeFormState>({
    categoryId: "",
    date: "",
    practiceType: "WATER",
    startTime: "",
    endTime: "",
    notes: "",
    coachIds: [],
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", "schedule-management"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CategoryRecord>>("/categories", {
        params: { page: 1, pageSize: optionPageSize },
      });
      return response.data.items;
    },
  });

  const coachesQuery = useQuery({
    queryKey: ["coaches", "schedule-management"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CoachRecord>>("/coaches", {
        params: { page: 1, pageSize: optionPageSize },
      });
      return response.data.items;
    },
  });

  const categories = categoriesQuery.data ?? [];
  const coaches = coachesQuery.data ?? [];

  const accessibleCategories = useMemo(() => {
    if (user?.role === "ADMIN") {
      return categories;
    }

    return categories.filter((category) =>
      category.coaches.some((assignment) => assignment.coach.user.id === user?.userId),
    );
  }, [categories, user?.role, user?.userId]);

  useEffect(() => {
    if (accessibleCategories.length === 0) {
      if (activeCategoryId !== allCategoriesFallbackTab) {
        setActiveCategoryId(allCategoriesFallbackTab);
      }
      return;
    }

    if (!accessibleCategories.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId(accessibleCategories[0].id);
    }
  }, [accessibleCategories, activeCategoryId]);

  const weeklySchedulesQuery = useQuery({
    queryKey: ["weekly-schedules", activeCategoryId],
    enabled: Boolean(activeCategoryId),
    queryFn: async () => {
      const response = await api.get<WeeklyScheduleRecord[]>("/schedules/weekly-schedules", {
        params: {
          categoryId: activeCategoryId,
        },
      });
      return response.data;
    },
  });

  const calendarQuery = useQuery({
    queryKey: ["schedules", "calendar", activeCategoryId, weekStartDate],
    enabled: Boolean(activeCategoryId),
    queryFn: async () => {
      const response = await api.get<ScheduleCalendarItem[]>("/schedules/calendar", {
        params: {
          categoryId: activeCategoryId,
          weekStart: weekStartDate,
        },
      });
      return response.data;
    },
  });

  const weeklySchedules = weeklySchedulesQuery.data ?? [];
  const calendarItems = calendarQuery.data ?? [];
  const currentWeekStartDateKey = getCurrentWeekStartDateKey();
  const visibleWeekRangeLabel = formatWeekRangeLabel(weekStartDate);
  const visibleWeekMonthLabel = formatWeekMonthLabel(weekStartDate);
  const isCurrentVisibleWeek = weekStartDate === currentWeekStartDateKey;
  const selectedWeeklySchedule =
    weeklySchedules.find((weeklySchedule) => weeklySchedule.id === selectedWeeklyScheduleId) ?? null;
  const selectedPractice =
    calendarItems.find((practice) => practice.id === selectedPracticeId) ?? null;
  const attendancePlayersQuery = useQuery({
    queryKey: [
      "players",
      "attendance-roster",
      selectedPractice?.category.id ?? null,
      attendancePlayersPage,
    ],
    enabled: selectedPractice !== null,
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
  const attendancePlayersPageData = attendancePlayersQuery.data;
  const attendancePlayers = attendancePlayersPageData?.items ?? [];
  const sortedAttendancePlayers = useMemo(
    () =>
      [...attendancePlayers].sort((left, right) => {
        const lastNameComparison = left.user.lastName.localeCompare(right.user.lastName, "hr-HR");

        if (lastNameComparison !== 0) {
          return lastNameComparison;
        }

        return left.user.firstName.localeCompare(right.user.firstName, "hr-HR");
      }),
    [attendancePlayers],
  );

  useEffect(() => {
    setAttendancePlayersPage(1);
  }, [selectedPractice?.category.id]);

  const attendanceQuery = useQuery({
    queryKey: [
      "schedule-attendance",
      selectedPractice?.scheduleId ?? null,
      selectedPractice?.occurrenceDate ?? null,
    ],
    enabled:
      isDrawerOpen &&
      drawerMode === "practice-edit" &&
      selectedPractice !== null,
    queryFn: async () => {
      const response = await api.get<ScheduleAttendanceDetail>(
        `/schedules/${selectedPractice?.scheduleId}/attendance`,
        {
          params: {
            occurrenceDate: selectedPractice?.occurrenceDate,
          },
        },
      );
      return response.data;
    },
  });

  useEffect(() => {
    if (!attendanceQuery.data) {
      setAttendancePlayerIds([]);
      return;
    }

    setAttendancePlayerIds(attendanceQuery.data.presentPlayerIds);
  }, [attendanceQuery.data]);

  const selectedCategory =
    accessibleCategories.find((category) => category.id === activeCategoryId) ?? null;

  const createWeeklyScheduleMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<WeeklyScheduleRecord>(
        "/schedules/weekly-schedules",
        buildWeeklySchedulePayload(weeklyForm),
      );
      return response.data;
    },
    onSuccess: (createdWeeklySchedule) => {
      setFeedback({
        tone: "success",
        message: `Tjedni raspored ${createdWeeklySchedule.name} uspješno je kreiran.`,
      });
      setIsDrawerOpen(false);
      setSelectedWeeklyScheduleId(createdWeeklySchedule.id);
      void invalidateScheduleWorkspace(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Kreiranje tjednog rasporeda nije uspjelo.",
      });
    },
  });

  const updateWeeklyScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWeeklySchedule) {
        throw new Error("Tjedni raspored nije odabran.");
      }

      const response = await api.patch<WeeklyScheduleRecord>(
        `/schedules/weekly-schedules/${selectedWeeklySchedule.id}`,
        buildWeeklySchedulePayload(weeklyForm),
      );
      return response.data;
    },
    onSuccess: (updatedWeeklySchedule) => {
      setFeedback({
        tone: "success",
        message: `Tjedni raspored ${updatedWeeklySchedule.name} uspješno je spremljen.`,
      });
      setIsDrawerOpen(false);
      void invalidateScheduleWorkspace(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Spremanje tjednog rasporeda nije uspjelo.",
      });
    },
  });

  const deleteWeeklyScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWeeklySchedule) {
        throw new Error("Tjedni raspored nije odabran.");
      }

      await api.delete(`/schedules/weekly-schedules/${selectedWeeklySchedule.id}`);
    },
    onSuccess: () => {
      setFeedback({
        tone: "success",
        message: "Tjedni raspored uspješno je obrisan.",
      });
      setSelectedWeeklyScheduleId(null);
      setIsDrawerOpen(false);
      void invalidateScheduleWorkspace(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Brisanje tjednog rasporeda nije uspjelo.",
      });
    },
  });

  const activateWeeklyScheduleMutation = useMutation({
    mutationFn: async (weeklyScheduleId: string) => {
      const response = await api.post<WeeklyScheduleRecord>(
        `/schedules/weekly-schedules/${weeklyScheduleId}/activate`,
        {
          weekStartDate,
        },
      );
      return response.data;
    },
    onSuccess: (weeklySchedule) => {
      setFeedback({
        tone: "success",
        message: `Raspored ${weeklySchedule.name} aktiviran je za tjedan ${formatDate(weekStartDate)}.`,
      });
      void invalidateScheduleWorkspace(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Aktivacija tjednog rasporeda nije uspjela.",
      });
    },
  });

  const createPracticeMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post("/schedules", buildSpecialPracticePayload(practiceForm));
      return response.data;
    },
    onSuccess: () => {
      setFeedback({
        tone: "success",
        message: "Posebni termin uspješno je kreiran.",
      });
      setIsDrawerOpen(false);
      void invalidateScheduleWorkspace(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Kreiranje posebnog termina nije uspjelo.",
      });
    },
  });

  const updatePracticeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPractice) {
        throw new Error("Termin nije odabran.");
      }

      const response = await api.patch(
        `/schedules/${selectedPractice.scheduleId}`,
        buildSpecialPracticePayload(practiceForm),
      );
      return response.data;
    },
    onSuccess: () => {
      setFeedback({
        tone: "success",
        message: "Posebni termin uspješno je spremljen.",
      });
      setSelectedPracticeId(null);
      setIsDrawerOpen(false);
      void invalidateScheduleWorkspace(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Spremanje posebnog termina nije uspjelo.",
      });
    },
  });

  const deletePracticeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPractice) {
        throw new Error("Termin nije odabran.");
      }

      await api.delete(`/schedules/${selectedPractice.scheduleId}`);
    },
    onSuccess: () => {
      setFeedback({
        tone: "success",
        message: "Posebni termin uspješno je obrisan.",
      });
      setSelectedPracticeId(null);
      setIsDrawerOpen(false);
      void invalidateScheduleWorkspace(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Brisanje posebnog termina nije uspjelo.",
      });
    },
  });

  const attendanceMutation = useMutation({
    mutationFn: async (payload: {
      occurrenceDate: string;
      presentPlayerIds: string[];
      isCancelled: boolean;
    }) => {
      if (!selectedPractice) {
        throw new Error("Termin nije odabran.");
      }

      const response = await api.put<ScheduleAttendanceDetail>(
        `/schedules/${selectedPractice.scheduleId}/attendance`,
        payload,
      );
      return response.data;
    },
    onSuccess: (result) => {
      setAttendancePlayerIds(result.presentPlayerIds);
      setFeedback({
        tone: "success",
        message: result.isCancelled
          ? "Termin je označen kao otkazan za odabrani datum."
          : "Dolazak igrača uspješno je spremljen.",
      });
      void invalidateScheduleWorkspace(queryClient);
      void queryClient.invalidateQueries({
        queryKey: [
          "schedule-attendance",
          selectedPractice?.scheduleId ?? null,
          selectedPractice?.occurrenceDate ?? null,
        ],
      });
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Spremanje dolaska nije uspjelo.",
      });
    },
  });

  const isBusy =
    createWeeklyScheduleMutation.isPending ||
    updateWeeklyScheduleMutation.isPending ||
    deleteWeeklyScheduleMutation.isPending ||
    activateWeeklyScheduleMutation.isPending ||
    createPracticeMutation.isPending ||
    updatePracticeMutation.isPending ||
    deletePracticeMutation.isPending ||
    attendanceMutation.isPending;

  const openWeeklyCreateDrawer = () => {
    const defaultCategoryId = activeCategoryId || accessibleCategories[0]?.id || "";

    setFeedback(null);
    setSelectedWeeklyScheduleId(null);
    setDrawerMode("weekly-create");
    setExpandedWeeklySlotIndexes([]);
    setWeeklyForm(createEmptyWeeklyScheduleForm(defaultCategoryId, accessibleCategories));
    setIsDrawerOpen(true);
  };

  const openWeeklyEditDrawer = (weeklySchedule: WeeklyScheduleRecord) => {
    setFeedback(null);
    setSelectedWeeklyScheduleId(weeklySchedule.id);
    setDrawerMode("weekly-edit");
    setExpandedWeeklySlotIndexes([]);
    setWeeklyForm(createWeeklyScheduleForm(weeklySchedule));
    setIsDrawerOpen(true);
  };

  const openPracticeCreateDrawer = () => {
    const defaultCategoryId = activeCategoryId || accessibleCategories[0]?.id || "";

    setFeedback(null);
    setSelectedPracticeId(null);
    setDrawerMode("practice-create");
    setPracticeForm(createEmptySpecialPracticeForm(defaultCategoryId, accessibleCategories, weekStartDate));
    setAttendancePlayerIds([]);
    setIsDrawerOpen(true);
  };

  const openPracticeEditDrawer = (practice: ScheduleCalendarItem) => {
    setFeedback(null);
    setSelectedPracticeId(practice.id);
    setDrawerMode("practice-edit");
    setPracticeForm(createSpecialPracticeForm(practice, accessibleCategories));
    setAttendancePlayerIds([]);
    setIsDrawerOpen(true);
  };

  const coachSearchItems = coaches.map((coach) => ({
    id: coach.id,
    label: `${coach.user.firstName} ${coach.user.lastName}`,
    meta: getCoachSearchMeta(coach),
  }));

  const toggleWeeklySlotExpanded = (index: number) => {
    setExpandedWeeklySlotIndexes((current) =>
      current.includes(index)
        ? current.filter((entry) => entry !== index)
        : [...current, index],
    );
  };

  const removeWeeklySlotAtIndex = (index: number) => {
    setWeeklyForm((current) => ({
      ...current,
      slots:
        current.slots.length === 1
          ? current.slots
          : current.slots.filter((_, slotIndex) => slotIndex !== index),
    }));
    setExpandedWeeklySlotIndexes((current) =>
      current
        .filter((entry) => entry !== index)
        .map((entry) => (entry > index ? entry - 1 : entry)),
    );
  };

  const selectedPracticeIsWeeklyOccurrence =
    selectedPractice?.sourceType === "WEEKLY_TEMPLATE";
  const attendanceSelectionDisabled =
    attendanceQuery.data?.isCancelled ||
    (!selectedPracticeIsWeeklyOccurrence &&
      practiceForm.categoryId !== selectedPractice?.category.id);

  return (
    <section className="space-y-6">
      {feedback ? (
        <div
          className={`border-2 border-line px-5 py-4 text-sm font-medium ${
            feedback.tone === "success" ? "bg-success text-surface" : "bg-signal text-surface"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      {categoriesQuery.isLoading || coachesQuery.isLoading ? (
        <div className="space-y-4">
          <div className="h-36 animate-pulse border-2 border-line bg-panel" />
          <div className="h-64 animate-pulse border-2 border-line bg-panel" />
          <div className="h-[720px] animate-pulse border-2 border-line bg-panel" />
        </div>
      ) : categoriesQuery.isError || coachesQuery.isError ? (
        <div className="border-2 border-line bg-signal px-5 py-4 text-sm font-medium text-surface">
          Raspored trenutno nije moguće učitati.
        </div>
      ) : accessibleCategories.length === 0 ? (
        <div className="border-2 border-line bg-white px-5 py-6 text-sm leading-7 text-muted">
          Trenutni račun nema dodijeljenu nijednu kategoriju za upravljanje rasporedima.
        </div>
      ) : (
        <>
          <section className="border-2 border-line bg-surface">
            <div className="flex flex-col gap-4 border-b-2 border-line bg-panel px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  Kategorije
                </p>
                <h3 className="mt-2 text-xl font-bold uppercase">Raspored treninga</h3>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  className="ui-pill ui-pill-button ui-pill--panel"
                  type="button"
                  onClick={openWeeklyCreateDrawer}
                >
                  Novi tjedni raspored
                </button>
                <button
                  className="ui-pill ui-pill-button ui-pill--accent"
                  type="button"
                  onClick={openPracticeCreateDrawer}
                >
                  Novi posebni termin
                </button>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto border-b-2 border-line bg-white px-4 py-3">
              {accessibleCategories.map((category) => (
                <button
                  key={category.id}
                  className={`ui-pill ui-pill-button ${
                    activeCategoryId === category.id ? "ui-pill--accent" : "ui-pill--outline"
                  }`}
                  type="button"
                  onClick={() => setActiveCategoryId(category.id)}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </section>

          <section className="border-2 border-line bg-surface">
            <div className="flex flex-col gap-4 bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  Vidljivi i aktivni tjedan
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-bold uppercase">{visibleWeekRangeLabel}</h3>
                  <span className="ui-pill ui-pill--panel">{visibleWeekMonthLabel}</span>
                  {isCurrentVisibleWeek ? (
                    <span className="ui-pill ui-pill--success">Ovaj tjedan</span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm text-muted">
                  Ovaj odabir vrijedi i za aktivaciju tjednih rasporeda i za prikaz stvarnih
                  termina.
                </p>
              </div>

              <div className="flex flex-col gap-3 lg:min-w-[420px] lg:items-end">
                <div className="flex flex-wrap gap-2">
                  <button
                    className="ui-pill ui-pill-button ui-pill--outline"
                    type="button"
                    onClick={() =>
                      setWeekStartDate((current) => shiftWeekStartDateKey(current, -7))
                    }
                  >
                    Prethodni tjedan
                  </button>
                  <button
                    className="ui-pill ui-pill-button ui-pill--panel"
                    type="button"
                    onClick={() => setWeekStartDate(currentWeekStartDateKey)}
                  >
                    Ovaj tjedan
                  </button>
                  <button
                    className="ui-pill ui-pill-button ui-pill--outline"
                    type="button"
                    onClick={() =>
                      setWeekStartDate((current) => shiftWeekStartDateKey(current, 7))
                    }
                  >
                    Sljedeći tjedan
                  </button>
                </div>

                <label className="block w-full max-w-[260px]">
                  <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    Odaberi ponedjeljak tjedna
                  </span>
                  <input
                    className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                    type="date"
                    value={weekStartDate}
                    onChange={(event) =>
                      setWeekStartDate(normaliseWeekStartDateKey(event.target.value))
                    }
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="border-2 border-line bg-surface">
            <div className="border-b-2 border-line bg-panel px-4 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                Tjedni rasporedi
              </p>
              <h3 className="mt-2 text-xl font-bold uppercase">Varijante po kategoriji</h3>
            </div>

            <div className="p-4">
              {weeklySchedulesQuery.isLoading ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-52 animate-pulse border-2 border-line bg-panel" />
                  ))}
                </div>
              ) : weeklySchedulesQuery.isError ? (
                <div className="border-2 border-line bg-signal px-5 py-4 text-sm font-medium text-surface">
                  Tjedne rasporede nije moguće učitati.
                </div>
              ) : weeklySchedules.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-line bg-bg px-5 py-6 text-sm leading-7 text-muted">
                  Ova kategorija još nema nijedan definirani tjedni raspored.
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {weeklySchedules.map((weeklySchedule) => {
                    const visibleWeekActivation = weeklySchedule.activations.find(
                      (activation) => activation.weekStartDate.slice(0, 10) === weekStartDate,
                    );

                    return (
                      <article
                        key={weeklySchedule.id}
                        className="cursor-pointer border-2 border-line bg-white transition hover:border-accent/35 hover:bg-bg"
                        role="button"
                        tabIndex={0}
                        onClick={() => openWeeklyEditDrawer(weeklySchedule)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openWeeklyEditDrawer(weeklySchedule);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between gap-4 px-4 py-4">
                          <h4 className="min-w-0 text-lg font-bold uppercase">
                            {weeklySchedule.name}
                          </h4>

                          <button
                            className={`ui-pill ui-pill-button ${
                              visibleWeekActivation ? "ui-pill--success" : "ui-pill--accent"
                            }`}
                            type="button"
                            disabled={Boolean(visibleWeekActivation) || activateWeeklyScheduleMutation.isPending}
                            onClick={(event) => {
                              event.stopPropagation();
                              setFeedback(null);
                              activateWeeklyScheduleMutation.mutate(weeklySchedule.id);
                            }}
                          >
                            {visibleWeekActivation ? "Već aktivan" : "Aktiviraj"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="border-2 border-line bg-surface">
            <div className="flex flex-col gap-4 border-b-2 border-line bg-panel px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  Stvarni termini
                </p>
                <h3 className="mt-2 text-xl font-bold uppercase">Aktivni tjedan</h3>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  className="ui-pill ui-pill-button ui-pill--accent"
                  type="button"
                  onClick={openPracticeCreateDrawer}
                >
                  Dodaj posebni termin
                </button>
              </div>
            </div>

            <div className="p-4">
              {calendarQuery.isLoading ? (
                <div className="h-[720px] animate-pulse border-2 border-line bg-panel" />
              ) : calendarQuery.isError ? (
                <div className="border-2 border-line bg-signal px-5 py-4 text-sm font-medium text-surface">
                  Kalendar stvarnih termina nije moguće učitati.
                </div>
              ) : (
                <PracticeWeekBoard
                  items={calendarItems}
                  weekStartDate={weekStartDate}
                  selectedItemId={selectedPracticeId}
                  showToolbar={false}
                  showSidebar={false}
                  cardContentMode="coachOnly"
                  showCategoryName={false}
                  showScheduleName={false}
                  showPracticeTypeText={false}
                  showPracticeTypeLegend
                  toneMode="practiceType"
                  fixedStartHour={6}
                  fixedEndHourExclusive={23}
                  hourHeight={28}
                  minimumCardHeight={28}
                  emptyMessage="U odabranom tjednu nema stvarnih termina za ovu kategoriju."
                  onWeekStartChange={(nextWeekStartDate) =>
                    setWeekStartDate(normaliseWeekStartDateKey(nextWeekStartDate))
                  }
                  onSelectItem={openPracticeEditDrawer}
                />
              )}
            </div>
          </section>
        </>
      )}

      <EntityDrawer
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        eyebrow={
          drawerMode === "weekly-create"
            ? "Novi tjedni raspored"
            : drawerMode === "weekly-edit"
              ? "Uredi tjedni raspored"
              : drawerMode === "practice-create"
                ? "Novi posebni termin"
                : selectedPracticeIsWeeklyOccurrence
                  ? "Stvarni trening iz rasporeda"
                  : "Posebni termin"
        }
        title={
          drawerMode === "weekly-create"
            ? "Novi tjedni raspored"
            : drawerMode === "weekly-edit"
              ? selectedWeeklySchedule?.name ?? "Uredi tjedni raspored"
              : drawerMode === "practice-create"
                ? "Novi posebni termin"
                : selectedPractice
                  ? `${selectedPractice.category.name} · ${formatDate(selectedPractice.occurrenceDate)}`
                  : "Pregled termina"
        }
      >
        {drawerMode === "weekly-create" || drawerMode === "weekly-edit" ? (
          <section className="border-2 border-line bg-surface">
            <div className="border-b-2 border-line bg-panel px-4 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                Predložak kategorije
              </p>
              <h3 className="mt-2 text-xl font-bold uppercase">
                {drawerMode === "weekly-create" ? "Sastavi novi raspored" : "Uredi raspored"}
              </h3>
            </div>

            <form
              className="space-y-5 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                setFeedback(null);

                if (drawerMode === "weekly-create") {
                  createWeeklyScheduleMutation.mutate();
                  return;
                }

                updateWeeklyScheduleMutation.mutate();
              }}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    Kategorija
                  </span>
                  <select
                    className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                    value={weeklyForm.categoryId}
                    disabled={drawerMode === "weekly-edit"}
                    onChange={(event) =>
                      setWeeklyForm((current) => ({
                        ...current,
                        categoryId: event.target.value,
                        slots: current.slots.map((slot) => ({
                          ...slot,
                          coachIds: getDefaultCoachIds(event.target.value, accessibleCategories),
                        })),
                      }))
                    }
                  >
                    <option value="" disabled>
                      Odaberite kategoriju
                    </option>
                    {accessibleCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    Naziv rasporeda
                  </span>
                  <input
                    className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                    type="text"
                    value={weeklyForm.name}
                    onChange={(event) =>
                      setWeeklyForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Npr. U12 ljetni raspored"
                  />
                </label>

                <label className="block lg:col-span-2">
                  <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    Opis
                  </span>
                  <textarea
                    className="min-h-24 w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                    value={weeklyForm.description}
                    onChange={(event) =>
                      setWeeklyForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Kratki opis kada i zašto koristite ovu varijantu rasporeda."
                  />
                </label>
              </div>

              <div className="space-y-4">
                {weeklyForm.slots.map((slot, index) => (
                  <section key={slot.id ?? `${slot.dayOfWeek}-${index}`} className="border-2 border-line bg-white">
                    <div className="flex flex-col gap-3 border-b-2 border-line bg-bg px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        className="min-w-0 flex-1 text-left"
                        type="button"
                        onClick={() => toggleWeeklySlotExpanded(index)}
                      >
                        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Termin {index + 1}
                        </p>
                        <p className="mt-2 text-sm text-muted">
                          {formatPracticeType(slot.practiceType)} · {getDayLabel(slot.dayOfWeek)} · {slot.startTime} - {slot.endTime}
                        </p>
                        <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.25em] text-muted">
                          {expandedWeeklySlotIndexes.includes(index) ? "Sakrij detalje" : "Prikaži detalje"}
                        </p>
                      </button>

                      <div className="flex flex-wrap gap-2">
                        <button
                          className="ui-pill ui-pill-button ui-pill--panel"
                          type="button"
                          onClick={() => toggleWeeklySlotExpanded(index)}
                        >
                          {expandedWeeklySlotIndexes.includes(index) ? "Sakrij" : "Detalji"}
                        </button>
                        <button
                          className="ui-pill ui-pill-button ui-pill--signal"
                          type="button"
                          disabled={weeklyForm.slots.length === 1}
                          onClick={() => removeWeeklySlotAtIndex(index)}
                        >
                          Ukloni termin
                        </button>
                      </div>
                    </div>

                    {expandedWeeklySlotIndexes.includes(index) ? (
                      <div className="grid gap-4 p-4 lg:grid-cols-2">
                        <label className="block">
                          <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                            Dan u tjednu
                          </span>
                          <select
                            className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                            value={slot.dayOfWeek}
                            onChange={(event) =>
                              setWeeklyForm((current) => ({
                                ...current,
                                slots: current.slots.map((entry, slotIndex) =>
                                  slotIndex === index
                                    ? { ...entry, dayOfWeek: event.target.value as DayKey }
                                    : entry,
                                ),
                              }))
                            }
                          >
                            {orderedDays.map((day) => (
                              <option key={day.key} value={day.key}>
                                {day.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                            Vrsta treninga
                          </span>
                          <select
                            className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                            value={slot.practiceType}
                            onChange={(event) =>
                              setWeeklyForm((current) => ({
                                ...current,
                                slots: current.slots.map((entry, slotIndex) =>
                                  slotIndex === index
                                    ? { ...entry, practiceType: event.target.value as PracticeType }
                                    : entry,
                                ),
                              }))
                            }
                          >
                            {practiceTypeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                            Početak
                          </span>
                          <input
                            className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                            type="time"
                            value={slot.startTime}
                            onChange={(event) =>
                              setWeeklyForm((current) => ({
                                ...current,
                                slots: current.slots.map((entry, slotIndex) =>
                                  slotIndex === index
                                    ? { ...entry, startTime: event.target.value }
                                    : entry,
                                ),
                              }))
                            }
                          />
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                            Kraj
                          </span>
                          <input
                            className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                            type="time"
                            value={slot.endTime}
                            onChange={(event) =>
                              setWeeklyForm((current) => ({
                                ...current,
                                slots: current.slots.map((entry, slotIndex) =>
                                  slotIndex === index
                                    ? { ...entry, endTime: event.target.value }
                                    : entry,
                                ),
                              }))
                            }
                          />
                        </label>

                        <label className="block lg:col-span-2">
                          <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                            Napomena
                          </span>
                          <textarea
                            className="min-h-24 w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                            value={slot.notes}
                            onChange={(event) =>
                              setWeeklyForm((current) => ({
                                ...current,
                                slots: current.slots.map((entry, slotIndex) =>
                                  slotIndex === index
                                    ? { ...entry, notes: event.target.value }
                                    : entry,
                                ),
                              }))
                            }
                            placeholder="Opcionalna napomena za ovaj tjedni termin."
                          />
                        </label>

                        <div className="lg:col-span-2">
                          <SearchMultiSelectPanel
                            title="Treneri termina"
                            searchPlaceholder="Pretraga trenera"
                            noResultsLabel="Nema trenera koji odgovaraju pretrazi."
                            items={coachSearchItems}
                            selectedIds={slot.coachIds}
                            onToggle={(coachId) =>
                              setWeeklyForm((current) => ({
                                ...current,
                                slots: current.slots.map((entry, slotIndex) =>
                                  slotIndex === index
                                    ? {
                                        ...entry,
                                        coachIds: entry.coachIds.includes(coachId)
                                          ? entry.coachIds.filter((id) => id !== coachId)
                                          : [...entry.coachIds, coachId],
                                      }
                                    : entry,
                                ),
                              }))
                            }
                          />
                        </div>
                      </div>
                    ) : null}
                  </section>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                  <button
                  className="ui-pill ui-pill-button ui-pill--panel"
                  type="button"
                  onClick={() => {
                    const nextSlotIndex = weeklyForm.slots.length;
                    setWeeklyForm((current) => ({
                      ...current,
                      slots: [
                        ...current.slots,
                        createEmptyWeeklyScheduleSlot(
                          current.categoryId,
                          accessibleCategories,
                          getNextDayKey(current.slots),
                        ),
                      ],
                    }));
                    setExpandedWeeklySlotIndexes((current) => [...current, nextSlotIndex]);
                  }}
                >
                  Dodaj termin
                </button>
                <button
                  className="ui-pill ui-pill-button ui-pill--accent"
                  type="submit"
                  disabled={isBusy}
                >
                  {drawerMode === "weekly-create"
                    ? createWeeklyScheduleMutation.isPending
                      ? "Kreiranje..."
                      : "Kreiraj raspored"
                    : updateWeeklyScheduleMutation.isPending
                      ? "Spremanje..."
                      : "Spremi raspored"}
                </button>
                {drawerMode === "weekly-edit" ? (
                  <button
                    className="ui-pill ui-pill-button ui-pill--signal"
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setFeedback(null);
                      deleteWeeklyScheduleMutation.mutate();
                    }}
                  >
                    {deleteWeeklyScheduleMutation.isPending ? "Brisanje..." : "Obriši raspored"}
                  </button>
                ) : null}
              </div>
            </form>
          </section>
        ) : (
          <section className="space-y-4">
            <section className="border-2 border-line bg-surface">
              <div className="border-b-2 border-line bg-panel px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  {drawerMode === "practice-create"
                    ? "Posebni termin"
                    : selectedPracticeIsWeeklyOccurrence
                      ? "Stvarni trening"
                      : "Posebni termin"}
                </p>
                <h3 className="mt-2 text-xl font-bold uppercase">
                  {drawerMode === "practice-create"
                    ? "Novi posebni termin"
                    : selectedPracticeIsWeeklyOccurrence
                      ? `${selectedPractice?.category.name ?? "Trening"} · stvarna instanca`
                      : "Uredi posebni termin"}
                </h3>
              </div>

              <form
                className="space-y-5 p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  setFeedback(null);

                  if (drawerMode === "practice-create") {
                    createPracticeMutation.mutate();
                    return;
                  }

                  if (selectedPracticeIsWeeklyOccurrence) {
                    return;
                  }

                  updatePracticeMutation.mutate();
                }}
              >
                {selectedPracticeIsWeeklyOccurrence && selectedPractice ? (
                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-line bg-white px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <span className="ui-pill ui-pill--outline">
                          {formatPracticeType(selectedPractice.practiceType)}
                        </span>
                        <span className="ui-pill ui-pill--panel">
                          {selectedPractice.weeklyScheduleName ?? "Aktivirani raspored"}
                        </span>
                        <span className="ui-pill ui-pill--outline">
                          {formatDate(selectedPractice.occurrenceDate)}
                        </span>
                        <span className="ui-pill ui-pill--outline">
                          {formatTimeRange(selectedPractice.startTime, selectedPractice.endTime)}
                        </span>
                        {selectedPractice.isCancelled ? (
                          <span className="ui-pill ui-pill--signal">Otkazano</span>
                        ) : (
                          <span className="ui-pill ui-pill--success">Aktivno</span>
                        )}
                      </div>
                      {selectedPractice.notes ? (
                        <p className="mt-4 text-sm leading-7 text-muted">{selectedPractice.notes}</p>
                      ) : null}
                      <p className="mt-4 text-sm text-muted">
                        {selectedPractice.coaches.length > 0
                          ? selectedPractice.coaches
                              .map(
                                (assignment) =>
                                  `${assignment.coach.user.firstName} ${assignment.coach.user.lastName}`,
                              )
                              .join(", ")
                          : "Trener nije dodijeljen."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Kategorija
                      </span>
                      <select
                        className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                        value={practiceForm.categoryId}
                        onChange={(event) =>
                          setPracticeForm((current) => ({
                            ...current,
                            categoryId: event.target.value,
                            coachIds: getDefaultCoachIds(event.target.value, accessibleCategories),
                          }))
                        }
                      >
                        <option value="" disabled>
                          Odaberite kategoriju
                        </option>
                        {accessibleCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Datum
                      </span>
                      <input
                        className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                        type="date"
                        value={practiceForm.date}
                        onChange={(event) =>
                          setPracticeForm((current) => ({ ...current, date: event.target.value }))
                        }
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Vrsta treninga
                      </span>
                      <select
                        className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                        value={practiceForm.practiceType}
                        onChange={(event) =>
                          setPracticeForm((current) => ({
                            ...current,
                            practiceType: event.target.value as PracticeType,
                          }))
                        }
                      >
                        {practiceTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Početak
                      </span>
                      <input
                        className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                        type="time"
                        value={practiceForm.startTime}
                        onChange={(event) =>
                          setPracticeForm((current) => ({
                            ...current,
                            startTime: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Kraj
                      </span>
                      <input
                        className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                        type="time"
                        value={practiceForm.endTime}
                        onChange={(event) =>
                          setPracticeForm((current) => ({
                            ...current,
                            endTime: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label className="block lg:col-span-2">
                      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Napomena
                      </span>
                      <textarea
                        className="min-h-24 w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                        value={practiceForm.notes}
                        onChange={(event) =>
                          setPracticeForm((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                        placeholder="Opcionalna napomena za posebni termin."
                      />
                    </label>

                    <div className="lg:col-span-2">
                      <SearchMultiSelectPanel
                        title="Treneri termina"
                        searchPlaceholder="Pretraga trenera"
                        noResultsLabel="Nema trenera koji odgovaraju pretrazi."
                        items={coachSearchItems}
                        selectedIds={practiceForm.coachIds}
                        onToggle={(coachId) =>
                          setPracticeForm((current) => ({
                            ...current,
                            coachIds: current.coachIds.includes(coachId)
                              ? current.coachIds.filter((id) => id !== coachId)
                              : [...current.coachIds, coachId],
                          }))
                        }
                      />
                    </div>
                  </div>
                )}

                {!selectedPracticeIsWeeklyOccurrence ? (
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="ui-pill ui-pill-button ui-pill--accent"
                      type="submit"
                      disabled={isBusy}
                    >
                      {drawerMode === "practice-create"
                        ? createPracticeMutation.isPending
                          ? "Kreiranje..."
                          : "Kreiraj termin"
                        : updatePracticeMutation.isPending
                          ? "Spremanje..."
                          : "Spremi termin"}
                    </button>
                    {drawerMode === "practice-edit" ? (
                      <button
                        className="ui-pill ui-pill-button ui-pill--signal"
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setFeedback(null);
                          deletePracticeMutation.mutate();
                        }}
                      >
                        {deletePracticeMutation.isPending ? "Brisanje..." : "Obriši termin"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </form>
            </section>

            {drawerMode === "practice-edit" && selectedPractice ? (
              <section className="border-2 border-line bg-surface">
                <div className="border-b-2 border-line bg-panel px-4 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    Dolazak i status
                  </p>
                  <h3 className="mt-2 text-xl font-bold uppercase">Prisutnost igrača</h3>
                </div>

                <div className="space-y-5 p-4">
                  <div className="flex flex-wrap gap-2">
                    <span className="ui-pill ui-pill--outline">
                      {formatPracticeType(selectedPractice.practiceType)}
                    </span>
                    <span className="ui-pill ui-pill--outline">
                      {selectedPractice.sourceType === "WEEKLY_TEMPLATE"
                        ? "Instanca rasporeda"
                        : "Posebni termin"}
                    </span>
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
                    <div className="h-48 animate-pulse border-2 border-line bg-panel" />
                  ) : attendanceQuery.isError || attendancePlayersQuery.isError ? (
                    <div className="border-2 border-line bg-signal px-5 py-4 text-sm font-medium text-surface">
                      Dolazak za odabrani termin nije moguće učitati.
                    </div>
                  ) : (
                    <>
                      <AttendanceRoster
                        players={sortedAttendancePlayers}
                        selectedIds={attendancePlayerIds}
                        disabled={Boolean(attendanceSelectionDisabled)}
                        onSelectAll={() =>
                          setAttendancePlayerIds((current) =>
                            Array.from(
                              new Set([
                                ...current,
                                ...sortedAttendancePlayers.map((player) => player.id),
                              ]),
                            )
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

                      {attendancePlayersPageData ? (
                        <PaginationControls
                          page={attendancePlayersPageData.page}
                          pageSize={attendancePlayersPageData.pageSize}
                          total={attendancePlayersPageData.total}
                          totalPages={attendancePlayersPageData.totalPages}
                          onPageChange={setAttendancePlayersPage}
                        />
                      ) : null}

                      <div className="flex flex-wrap gap-3">
                        <button
                          className="ui-pill ui-pill-button ui-pill--accent"
                          type="button"
                          disabled={
                            attendanceSelectionDisabled ||
                            attendanceMutation.isPending
                          }
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
              </section>
            ) : null}
          </section>
        )}
      </EntityDrawer>
    </section>
  );
}

function createEmptyWeeklyScheduleForm(categoryId: string, categories: CategoryRecord[]): WeeklyScheduleFormState {
  return {
    categoryId,
    name: "",
    description: "",
    slots: [createEmptyWeeklyScheduleSlot(categoryId, categories, "MONDAY")],
  };
}

function createEmptyWeeklyScheduleSlot(
  categoryId: string,
  categories: CategoryRecord[],
  dayOfWeek: DayKey,
): WeeklyScheduleSlotFormState {
  return {
    dayOfWeek,
    practiceType: "WATER",
    startTime: "18:00",
    endTime: "19:15",
    notes: "",
    coachIds: getDefaultCoachIds(categoryId, categories),
  };
}

function createWeeklyScheduleForm(weeklySchedule: WeeklyScheduleRecord): WeeklyScheduleFormState {
  return {
    categoryId: weeklySchedule.category.id,
    name: weeklySchedule.name,
    description: weeklySchedule.description ?? "",
    slots: weeklySchedule.schedules.map((slot) => ({
      id: slot.id,
      dayOfWeek: slot.dayOfWeek ?? "MONDAY",
      practiceType: slot.practiceType,
      startTime: toTimeInputValue(slot.startTime),
      endTime: toTimeInputValue(slot.endTime),
      notes: slot.notes ?? "",
      coachIds: slot.coaches.map((assignment) => assignment.coachId),
    })),
  };
}

function createEmptySpecialPracticeForm(
  categoryId: string,
  categories: CategoryRecord[],
  weekStartDate: string,
): SpecialPracticeFormState {
  return {
    categoryId,
    date: weekStartDate,
    practiceType: "WATER",
    startTime: "18:00",
    endTime: "19:15",
    notes: "",
    coachIds: getDefaultCoachIds(categoryId, categories),
  };
}

function createSpecialPracticeForm(
  practice: ScheduleCalendarItem,
  categories: CategoryRecord[],
): SpecialPracticeFormState {
  return {
    categoryId: practice.category.id,
    date: practice.startTime.slice(0, 10),
    practiceType: practice.practiceType,
    startTime: toTimeInputValue(practice.startTime),
    endTime: toTimeInputValue(practice.endTime),
    notes: practice.notes ?? "",
    coachIds:
      practice.coaches.length > 0
        ? practice.coaches.map((assignment) => assignment.coachId)
        : getDefaultCoachIds(practice.category.id, categories),
  };
}

function buildWeeklySchedulePayload(form: WeeklyScheduleFormState) {
  return {
    categoryId: form.categoryId,
    name: form.name,
    description: form.description || undefined,
    slots: form.slots.map((slot) => ({
      id: slot.id,
      dayOfWeek: slot.dayOfWeek,
      practiceType: slot.practiceType,
      startTime: buildReferenceIso(slot.dayOfWeek, slot.startTime),
      endTime: buildReferenceIso(slot.dayOfWeek, slot.endTime),
      notes: slot.notes || undefined,
      coachIds: slot.coachIds,
    })),
  };
}

function buildSpecialPracticePayload(form: SpecialPracticeFormState) {
  return {
    categoryId: form.categoryId,
    practiceType: form.practiceType,
    startTime: new Date(`${form.date}T${form.startTime}`).toISOString(),
    endTime: new Date(`${form.date}T${form.endTime}`).toISOString(),
    notes: form.notes || undefined,
    coachIds: form.coachIds,
  };
}

function buildReferenceIso(dayOfWeek: DayKey, timeValue: string) {
  const [hour, minute] = timeValue.split(":").map(Number);
  const referenceMonday = new Date(2026, 0, 5, hour ?? 0, minute ?? 0, 0, 0);
  referenceMonday.setDate(referenceMonday.getDate() + getDayOffset(dayOfWeek));
  return referenceMonday.toISOString();
}

function getDayOffset(dayOfWeek: DayKey) {
  const mapping: Record<DayKey, number> = {
    MONDAY: 0,
    TUESDAY: 1,
    WEDNESDAY: 2,
    THURSDAY: 3,
    FRIDAY: 4,
    SATURDAY: 5,
    SUNDAY: 6,
  };

  return mapping[dayOfWeek];
}

function getDefaultCoachIds(categoryId: string, categories: CategoryRecord[]) {
  const category = categories.find((entry) => entry.id === categoryId);
  return category?.coaches.map((assignment) => assignment.coachId) ?? [];
}

function getCoachSearchMeta(coach: CoachRecord) {
  const metaParts: string[] = [];

  if (coach.user.email) {
    metaParts.push(coach.user.email);
  }

  if (coach.isConditioningCoach) {
    metaParts.push("Kondicijski trener");
  } else {
    const categoryNames = coach.categories?.map((assignment) => assignment.category.name) ?? [];

    if (categoryNames.length > 0) {
      metaParts.push(categoryNames.join(", "));
    }
  }

  return metaParts.join(" · ") || "Trener";
}

function formatPracticeType(practiceType: PracticeType) {
  return practiceType === "DRYLAND" ? "Suhi trening" : "Trening u vodi";
}

function getCurrentWeekStartDateKey() {
  return normaliseWeekStartDateKey(
    [
      new Date().getFullYear(),
      `${new Date().getMonth() + 1}`.padStart(2, "0"),
      `${new Date().getDate()}`.padStart(2, "0"),
    ].join("-"),
  );
}

function formatWeekRangeLabel(dateKey: string) {
  const start = new Date(`${dateKey}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const formatter = new Intl.DateTimeFormat("hr-HR", {
    day: "numeric",
    month: "short",
  });

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function formatWeekMonthLabel(dateKey: string) {
  const start = new Date(`${dateKey}T12:00:00`);

  return new Intl.DateTimeFormat("hr-HR", {
    month: "long",
    year: "numeric",
  }).format(start);
}

function shiftWeekStartDateKey(dateKey: string, offsetDays: number) {
  const current = new Date(`${dateKey}T12:00:00`);
  current.setDate(current.getDate() + offsetDays);
  return normaliseWeekStartDateKey(
    [
      current.getFullYear(),
      `${current.getMonth() + 1}`.padStart(2, "0"),
      `${current.getDate()}`.padStart(2, "0"),
    ].join("-"),
  );
}

function normaliseWeekStartDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  const current = new Date(date);
  const day = current.getDay();
  const offset = day === 0 ? 6 : day - 1;
  current.setDate(current.getDate() - offset);

  return [
    current.getFullYear(),
    `${current.getMonth() + 1}`.padStart(2, "0"),
    `${current.getDate()}`.padStart(2, "0"),
  ].join("-");
}

function toTimeInputValue(dateIso: string) {
  const date = new Date(dateIso);
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getNextDayKey(slots: WeeklyScheduleSlotFormState[]) {
  const lastSlot = slots[slots.length - 1];
  const lastIndex = orderedDays.findIndex((day) => day.key === lastSlot?.dayOfWeek);
  return orderedDays[(lastIndex + 1) % orderedDays.length]?.key ?? "MONDAY";
}

function getDayLabel(dayKey: DayKey) {
  return orderedDays.find((day) => day.key === dayKey)?.label ?? "Ponedjeljak";
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
    <div className={`border-2 border-line bg-white ${disabled ? "opacity-75" : ""}`}>
      <div className="flex flex-col gap-3 border-b-2 border-line bg-bg px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
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
                    className={`flex cursor-pointer items-start gap-3 border-2 border-line px-3 py-3 ${
                      isChecked ? "bg-panel" : "bg-white"
                    } ${disabled ? "cursor-not-allowed" : ""}`}
                  >
                    <input
                      className="mt-1 h-4 w-4 accent-accent"
                      type="checkbox"
                      checked={isChecked}
                      disabled={disabled}
                      onChange={() => onToggle(player.id)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold uppercase">
                        {player.user.firstName} {player.user.lastName}
                      </span>
                      <span className="mt-1 block text-[11px] uppercase tracking-[0.2em] text-muted">
                        {formatDate(player.dateOfBirth)} · OIB {player.oib}
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

async function invalidateScheduleWorkspace(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["weekly-schedules"] }),
    queryClient.invalidateQueries({ queryKey: ["schedules", "calendar"] }),
    queryClient.invalidateQueries({ queryKey: ["schedule-attendance"] }),
  ]);
}
