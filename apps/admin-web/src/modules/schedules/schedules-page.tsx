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
import { CategoryFilterDropdown, SingleSelectDropdown } from "../ui/category-filter-chips";
import { DatePicker } from "../ui/date-picker";
import { FeedbackToast } from "../ui/feedback-toast";
import { PaginationControls } from "../ui/pagination-controls";
import { SearchMultiSelectPanel } from "../ui/search-multi-select-panel";
import { TimePicker } from "../ui/time-picker";
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

const attendancePageSize = 30;
const optionPageSize = 100;
const allCategoriesOptionId = "__all_categories__";
const practiceTypeOptions: Array<{ value: PracticeType; label: string }> = [
  { value: "WATER", label: "Trening u vodi" },
  { value: "DRYLAND", label: "Suhi trening" },
];

export function SchedulesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [weekStartDate, setWeekStartDate] = useState(() => getCurrentWeekStartDateKey());
  const [selectedCategoryFilterIds, setSelectedCategoryFilterIds] = useState<string[]>([]);
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
    setSelectedCategoryFilterIds((current) =>
      current.filter((categoryId) =>
        accessibleCategories.some((category) => category.id === categoryId),
      ),
    );
  }, [accessibleCategories]);

  const weeklySchedulesQuery = useQuery({
    queryKey: ["weekly-schedules"],
    enabled: accessibleCategories.length > 0,
    queryFn: async () => {
      const response = await api.get<WeeklyScheduleRecord[]>("/schedules/weekly-schedules");
      return response.data;
    },
  });

  const calendarQuery = useQuery({
    queryKey: ["schedules", "calendar", weekStartDate],
    enabled: accessibleCategories.length > 0,
    queryFn: async () => {
      const response = await api.get<ScheduleCalendarItem[]>("/schedules/calendar", {
        params: {
          weekStart: weekStartDate,
        },
      });
      return response.data;
    },
  });

  const weeklySchedules = filterBySelectedCategories(
    weeklySchedulesQuery.data ?? [],
    selectedCategoryFilterIds,
  );
  const calendarItems = filterBySelectedCategories(
    calendarQuery.data ?? [],
    selectedCategoryFilterIds,
  );
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
          ...(selectedPractice?.category.id ? { categoryId: selectedPractice.category.id } : {}),
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

  const updateOccurrenceMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPractice) {
        throw new Error("Termin nije odabran.");
      }

      const response = await api.patch<ScheduleCalendarItem>(
        `/schedules/${selectedPractice.scheduleId}/occurrence`,
        buildOccurrencePayload(practiceForm),
      );

      return response.data;
    },
    onSuccess: (updatedPractice) => {
      setFeedback({
        tone: "success",
        message: "Detalji treninga uspješno su spremljeni.",
      });
      setSelectedPracticeId(updatedPractice.id);
      setPracticeForm(createSpecialPracticeForm(updatedPractice, accessibleCategories));
      void invalidateScheduleWorkspace(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Spremanje detalja treninga nije uspjelo.",
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
    updateOccurrenceMutation.isPending ||
    deletePracticeMutation.isPending ||
    attendanceMutation.isPending;

  const toggleCategoryFilter = (categoryId: string) => {
    setSelectedCategoryFilterIds((current) =>
      current.includes(categoryId)
        ? current.filter((selectedCategoryId) => selectedCategoryId !== categoryId)
        : [...current, categoryId],
    );
  };

  const getDefaultFilteredCategoryId = () =>
    selectedCategoryFilterIds.find((categoryId) =>
      accessibleCategories.some((category) => category.id === categoryId),
    ) ?? accessibleCategories[0]?.id ?? "";

  const openWeeklyCreateDrawer = () => {
    const defaultCategoryId = getDefaultFilteredCategoryId();

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
    const defaultCategoryId = getDefaultFilteredCategoryId();

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
  const categorySelectOptions = accessibleCategories.map((category) => ({
    id: category.id,
    name: category.name,
  }));
  const specialPracticeCategorySelectOptions = [
    { id: allCategoriesOptionId, name: "Sve kategorije" },
    ...categorySelectOptions,
  ];
  const daySelectOptions = orderedDays.map((day) => ({
    id: day.key,
    name: day.label,
  }));
  const practiceTypeSelectOptions = practiceTypeOptions.map((option) => ({
    id: option.value,
    name: option.label,
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
  const canShowAttendanceWidget = selectedPractice
    ? Date.now() >= new Date(selectedPractice.startTime).getTime() - 60 * 60 * 1000
    : false;
  const attendanceSelectionDisabled =
    attendanceQuery.data?.isCancelled ||
    (!selectedPracticeIsWeeklyOccurrence &&
      getSpecialPracticePayloadCategoryId(practiceForm.categoryId) !== selectedPractice?.category.id);

  return (
    <section className="space-y-6">
      <FeedbackToast feedback={feedback} onClose={() => setFeedback(null)} />

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
        <div className="schedule-workspace">
          <section className="schedule-workspace-panel schedule-workspace-panel--top bg-surface">
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

            <div className="relative z-30 border-b-2 border-line bg-white px-4 py-4">
              <div className="max-w-[420px]">
                <CategoryFilterDropdown
                  categories={accessibleCategories}
                  selectedIds={selectedCategoryFilterIds}
                  onToggle={toggleCategoryFilter}
                  onClear={() => setSelectedCategoryFilterIds([])}
                />
              </div>
            </div>
          </section>

          <section className="schedule-workspace-panel schedule-workspace-panel--middle bg-surface">
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
                    <div
                      key={index}
                      className="h-52 animate-pulse rounded-[24px] border border-line bg-panel"
                    />
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
                        className="cursor-pointer rounded-[24px] border border-line bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)] transition hover:border-accent/35 hover:bg-bg hover:shadow-[0_22px_55px_rgba(15,23,42,0.1)]"
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
                        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4">
                          <div className="flex min-w-0 flex-wrap items-center gap-3">
                            <h4 className="min-w-0 text-base font-bold uppercase leading-tight">
                              {weeklySchedule.name}
                            </h4>
                            <span className="ui-pill ui-pill--panel">
                              {weeklySchedule.category.name}
                            </span>
                          </div>

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

          <section className="schedule-workspace-calendar">
            {calendarQuery.isLoading ? (
              <div className="h-[720px] animate-pulse rounded-b-[32px] border border-line bg-panel" />
            ) : calendarQuery.isError ? (
              <div className="border-2 border-line bg-signal px-5 py-4 text-sm font-medium text-surface">
                Kalendar stvarnih termina nije moguće učitati.
              </div>
            ) : (
              <PracticeWeekBoard
                items={calendarItems}
                weekStartDate={weekStartDate}
                selectedItemId={selectedPracticeId}
                showSidebar={false}
                compactEventContent
                emptyMessage="U odabranom tjednu nema stvarnih termina za ovu kategoriju."
                onWeekStartChange={(nextWeekStartDate) =>
                  setWeekStartDate(normaliseWeekStartDateKey(nextWeekStartDate))
                }
                onSelectItem={openPracticeEditDrawer}
              />
            )}
          </section>
        </div>
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
          <section className="schedule-drawer-surface">
            <form
              className="space-y-5"
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
              <fieldset className="schedule-widget">
                <legend className="schedule-widget-title">Osnovni podaci</legend>
                <div className="grid gap-4 lg:grid-cols-2">
                  <SingleSelectDropdown
                    label="Kategorija"
                    options={categorySelectOptions}
                    selectedId={weeklyForm.categoryId}
                    placeholder="Odaberite kategoriju"
                    disabled={drawerMode === "weekly-edit"}
                    onChange={(categoryId) =>
                      setWeeklyForm((current) => ({
                        ...current,
                        categoryId,
                        slots: current.slots.map((slot) => ({
                          ...slot,
                          coachIds: getDefaultCoachIds(categoryId, accessibleCategories),
                        })),
                      }))
                    }
                  />

                  <label className="block">
                    <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                      Naziv rasporeda
                    </span>
                    <input
                      className="w-full rounded-[18px] border border-line bg-surface px-4 py-3 outline-none transition focus:bg-bg"
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
                      className="min-h-24 w-full rounded-[18px] border border-line bg-surface px-4 py-3 outline-none transition focus:bg-bg"
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
              </fieldset>

              <fieldset className="schedule-widget">
                <legend className="schedule-widget-title">Termini</legend>
                <div className="space-y-4">
                {weeklyForm.slots.map((slot, index) => (
                  <section
                    key={slot.id ?? `${slot.dayOfWeek}-${index}`}
                    className="overflow-hidden rounded-[22px] border border-line bg-white"
                  >
                    <div className="flex flex-col gap-3 border-b border-line bg-bg px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Termin {index + 1}
                        </p>
                        <p className="mt-2 text-sm text-muted">
                          {formatPracticeType(slot.practiceType)} · {getDayLabel(slot.dayOfWeek)} · {slot.startTime} - {slot.endTime}
                        </p>
                      </div>

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
                        <SingleSelectDropdown
                          label="Dan u tjednu"
                          options={daySelectOptions}
                          selectedId={slot.dayOfWeek}
                          onChange={(dayOfWeek) =>
                            setWeeklyForm((current) => ({
                              ...current,
                              slots: current.slots.map((entry, slotIndex) =>
                                slotIndex === index
                                  ? { ...entry, dayOfWeek: dayOfWeek as DayKey }
                                  : entry,
                              ),
                            }))
                          }
                        />

                        <SingleSelectDropdown
                          label="Vrsta treninga"
                          options={practiceTypeSelectOptions}
                          selectedId={slot.practiceType}
                          onChange={(practiceType) =>
                            setWeeklyForm((current) => ({
                              ...current,
                              slots: current.slots.map((entry, slotIndex) =>
                                slotIndex === index
                                  ? { ...entry, practiceType: practiceType as PracticeType }
                                  : entry,
                              ),
                            }))
                          }
                        />

                        <label className="block">
                          <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                            Početak
                          </span>
                          <TimePicker
                            className="w-full rounded-[18px] border border-line bg-surface px-4 py-3 outline-none transition focus:bg-bg"
                            value={slot.startTime}
                            onChange={(value) =>
                              setWeeklyForm((current) => ({
                                ...current,
                                slots: current.slots.map((entry, slotIndex) =>
                                  slotIndex === index
                                    ? { ...entry, startTime: value }
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
                          <TimePicker
                            className="w-full rounded-[18px] border border-line bg-surface px-4 py-3 outline-none transition focus:bg-bg"
                            value={slot.endTime}
                            onChange={(value) =>
                              setWeeklyForm((current) => ({
                                ...current,
                                slots: current.slots.map((entry, slotIndex) =>
                                  slotIndex === index
                                    ? { ...entry, endTime: value }
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
                            className="min-h-24 w-full rounded-[18px] border border-line bg-surface px-4 py-3 outline-none transition focus:bg-bg"
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
              </fieldset>

              <div className="schedule-actions">
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
            <section className="schedule-drawer-surface">
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  setFeedback(null);

                  if (drawerMode === "practice-create") {
                    createPracticeMutation.mutate();
                    return;
                  }

                  if (selectedPracticeIsWeeklyOccurrence) {
                    updateOccurrenceMutation.mutate();
                    return;
                  }

                  updatePracticeMutation.mutate();
                }}
              >
                {selectedPracticeIsWeeklyOccurrence && selectedPractice ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <fieldset className="schedule-widget">
                      <legend className="schedule-widget-title">Podaci o terminu</legend>
                      <div className="grid gap-4 lg:grid-cols-2">
                    <SingleSelectDropdown
                      label="Kategorija"
                      options={specialPracticeCategorySelectOptions}
                      selectedId={practiceForm.categoryId}
                      placeholder="Odaberite kategoriju"
                      onChange={(categoryId) =>
                        setPracticeForm((current) => ({
                          ...current,
                          categoryId,
                          coachIds: getDefaultCoachIds(categoryId, accessibleCategories),
                        }))
                      }
                    />

                    <label className="block">
                      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Datum
                      </span>
                      <DatePicker
                        className="w-full rounded-[18px] border border-line bg-surface px-4 py-3 outline-none transition focus:bg-bg"
                        value={practiceForm.date}
                        onChange={(value) =>
                          setPracticeForm((current) => ({ ...current, date: value }))
                        }
                      />
                    </label>

                    <SingleSelectDropdown
                      label="Vrsta treninga"
                      options={practiceTypeSelectOptions}
                      selectedId={practiceForm.practiceType}
                      onChange={(practiceType) =>
                        setPracticeForm((current) => ({
                          ...current,
                          practiceType: practiceType as PracticeType,
                        }))
                      }
                    />

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
                        Napomena
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
                        placeholder="Opcionalna napomena za posebni termin."
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
                  </>
                )}

                <div className="schedule-actions">
                  <button
                    className="ui-pill ui-pill-button ui-pill--accent"
                    type="submit"
                    disabled={isBusy}
                  >
                    {drawerMode === "practice-create"
                      ? createPracticeMutation.isPending
                        ? "Kreiranje..."
                        : "Kreiraj termin"
                      : selectedPracticeIsWeeklyOccurrence
                        ? updateOccurrenceMutation.isPending
                          ? "Spremanje..."
                          : "Spremi detalje"
                        : updatePracticeMutation.isPending
                          ? "Spremanje..."
                          : "Spremi termin"}
                  </button>
                  {drawerMode === "practice-edit" && !selectedPracticeIsWeeklyOccurrence ? (
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
              </form>
            </section>

            {drawerMode === "practice-edit" && selectedPractice && canShowAttendanceWidget ? (
              <fieldset className="schedule-widget">
                <legend className="schedule-widget-title">Prisutnost igrača</legend>

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
              </fieldset>
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
    categoryId: practice.category.id ?? allCategoriesOptionId,
    date: practice.startTime.slice(0, 10),
    practiceType: practice.practiceType,
    startTime: toTimeInputValue(practice.startTime),
    endTime: toTimeInputValue(practice.endTime),
    notes: practice.notes ?? "",
    coachIds:
      practice.coaches.length > 0
        ? practice.coaches.map((assignment) => assignment.coachId)
        : getDefaultCoachIds(practice.category.id ?? allCategoriesOptionId, categories),
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
    categoryId: getSpecialPracticePayloadCategoryId(form.categoryId),
    practiceType: form.practiceType,
    startTime: new Date(`${form.date}T${form.startTime}`).toISOString(),
    endTime: new Date(`${form.date}T${form.endTime}`).toISOString(),
    notes: form.notes || undefined,
    coachIds: form.coachIds,
  };
}

function getSpecialPracticePayloadCategoryId(categoryId: string) {
  return categoryId === allCategoriesOptionId ? null : categoryId;
}

function buildOccurrencePayload(form: SpecialPracticeFormState) {
  return {
    occurrenceDate: form.date,
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
  if (categoryId === allCategoriesOptionId) {
    return [];
  }

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

function filterBySelectedCategories<
  TItem extends {
    category: {
      id: string | null;
    };
  },
>(items: TItem[], selectedCategoryIds: string[]) {
  if (selectedCategoryIds.length === 0) {
    return items;
  }

  return items.filter(
    (item) => item.category.id === null || selectedCategoryIds.includes(item.category.id),
  );
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

async function invalidateScheduleWorkspace(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["weekly-schedules"] }),
    queryClient.invalidateQueries({ queryKey: ["schedules", "calendar"] }),
    queryClient.invalidateQueries({ queryKey: ["schedule-attendance"] }),
  ]);
}
