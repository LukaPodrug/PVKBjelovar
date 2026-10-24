import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { type ChangeEvent, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { api } from "../core/api";
import { formatDate, orderedDays, toDateInputValue } from "../core/date";
import type {
  CategoryKind,
  CategoryPlayerAssignment,
  CategoryRecord,
  CoachRecord,
  PaginatedResponse,
  ParentRecord,
  PlayerRecord,
  ProgramAudience,
  ProgramRegistrationRecord,
  ProgramSlotRecord,
} from "../core/types";
import { EntityDrawer } from "../layout/entity-drawer";
import { DatePicker } from "../ui/date-picker";
import { FeedbackToast } from "../ui/feedback-toast";
import { PaginationControls } from "../ui/pagination-controls";
import { SearchMultiSelectPanel } from "../ui/search-multi-select-panel";
import { TimePicker } from "../ui/time-picker";
import { centsToEuroInput, MembershipPriceField } from "../ui/membership-price-field";
import { downloadCategoryPlayersWorkbook } from "./category-players-xlsx";
import { downloadProgramRegistrationsWorkbook } from "./program-registrations-xlsx";

interface FeedbackState {
  tone: "success" | "error";
  message: string;
}

interface CategoryFormState {
  name: string;
  ageRule: "YOUTH" | "SENIOR" | "VETERAN";
  startDateOfBirth: string;
  endDateOfBirth: string;
  coachIds: string[];
  logoFile: File | null;
  removeLogo: boolean;
  audience: ProgramAudience;
  monthlyPrice: string;
  membershipFreeUntil: string;
  pricePerPractice: string;
  signupCloseDaysBefore: string;
  signupCloseTime: string;
  programSlots: ProgramSlotRecord[];
}

interface ProgramRegistrationDates {
  dates: Array<{ date: string; count: number }>;
  defaultDate: string | null;
}

interface StartNewSeasonResult {
  categoriesUpdated: number;
  playersReassigned: number;
  veteransAdded: number;
}

interface ManagedPlayerFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  oib: string;
  address: string;
  gdprConsent: boolean;
  membershipExpiresAt: string;
  membershipPrice: string;
  categoryIds: string[];
  parentIds: string[];
  primaryParentId: string;
  profileFile: File | null;
  removeProfileImage: boolean;
}

const emptyCategoryForm: CategoryFormState = {
  name: "",
  ageRule: "YOUTH",
  startDateOfBirth: "",
  endDateOfBirth: "",
  coachIds: [],
  logoFile: null,
  removeLogo: false,
  audience: "MEMBERS",
  monthlyPrice: "",
  membershipFreeUntil: "",
  pricePerPractice: "",
  signupCloseDaysBefore: "",
  signupCloseTime: "",
  programSlots: [],
};

const emptyProgramSlot: ProgramSlotRecord = { dayOfWeek: "SATURDAY", startTime: "09:00", endTime: "10:00" };

const emptyManagedPlayerForm: ManagedPlayerFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  oib: "",
  address: "",
  gdprConsent: false,
  membershipExpiresAt: "",
  membershipPrice: "",
  categoryIds: [],
  parentIds: [],
  primaryParentId: "",
  profileFile: null,
  removeProfileImage: false,
};

/**
 * The waterpolo categories page and the programs page share this screen; only the wording, the list
 * filter and the season rollover (waterpolo only) differ.
 */
const pageCopy = {
  REGULAR: {
    listKicker: "Popis kategorija",
    listTitle: "Trenutne skupine",
    columnLabel: "Kategorija",
    createLabel: "Nova kategorija",
    editLabel: "Uredi kategoriju",
    createTitle: "Postavljanje nove kategorije",
    nameLabel: "Naziv kategorije",
    namePlaceholder: "U12",
    submitCreateLabel: "Kreiraj kategoriju",
    deleteLabel: "Obriši kategoriju",
    playersTitle: "Igrači u kategoriji",
    emptyPlayers: "U ovoj kategoriji trenutno nema upisanih igrača.",
    emptyList: "Još nema kategorija.",
    loadError: "Kategorije trenutno nije moguće učitati.",
    created: (name: string) => `Kategorija ${name} uspješno je kreirana.`,
    updated: (name: string) => `Kategorija ${name} uspješno je ažurirana.`,
    deleted: (name: string) => `Kategorija ${name} uspješno je obrisana.`,
    fallbackName: "Kategorija",
  },
  PROGRAM: {
    listKicker: "Posebni programi",
    listTitle: "Trenutni programi",
    columnLabel: "Program",
    createLabel: "Novi program",
    editLabel: "Uredi program",
    createTitle: "Postavljanje novog programa",
    nameLabel: "Naziv programa",
    namePlaceholder: "Igre u vodi",
    submitCreateLabel: "Kreiraj program",
    deleteLabel: "Obriši program",
    playersTitle: "Djeca u programu",
    emptyPlayers: "U ovom programu trenutno nema upisane djece.",
    emptyList:
      "Još nema programa. Svaki program dobiva vlastitu karticu prijave i mjesto u odjeljku programa na web stranici.",
    loadError: "Programe trenutno nije moguće učitati.",
    created: (name: string) => `Program ${name} uspješno je kreiran.`,
    updated: (name: string) => `Program ${name} uspješno je ažuriran.`,
    deleted: (name: string) => `Program ${name} uspješno je obrisan.`,
    fallbackName: "Program",
  },
} as const;

const optionPageSize = 100;
const managementPageSize = 25;
const categoryPlayersPageSize = 10;

export function CategoriesPage({ kind }: { kind: CategoryKind }) {
  const copy = pageCopy[kind];
  const isProgramPage = kind === "PROGRAM";
  // Programs are mostly open to any age, so a new one starts without an age bound.
  const emptyForm: CategoryFormState = isProgramPage
    ? { ...emptyCategoryForm, ageRule: "SENIOR" }
    : emptyCategoryForm;
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const queryClient = useQueryClient();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<CategoryFormState>(emptyForm);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [managedPlayerProfilePreviewUrl, setManagedPlayerProfilePreviewUrl] = useState<
    string | null
  >(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [managedPlayerId, setManagedPlayerId] = useState<string | null>(null);
  const [managedPlayerForm, setManagedPlayerForm] = useState<ManagedPlayerFormState>(
    emptyManagedPlayerForm,
  );
  const [categoriesPage, setCategoriesPage] = useState(1);
  const [categoryPlayersPage, setCategoryPlayersPage] = useState(1);
  const [exportingCategoryId, setExportingCategoryId] = useState<string | null>(null);
  const [moveTargetCategoryId, setMoveTargetCategoryId] = useState("");
  // Practice day picked in a non-member program's drawer; null follows the server's default (latest).
  const [pickedRegistrationDate, setPickedRegistrationDate] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["categories", "management", kind, categoriesPage],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CategoryRecord>>("/categories", {
        params: { kind, page: categoriesPage, pageSize: managementPageSize },
      });
      return response.data;
    },
  });

  const categoryOptionsQuery = useQuery({
    queryKey: ["categories", "player-category-options"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CategoryRecord>>("/categories", {
        params: { page: 1, pageSize: optionPageSize },
      });
      return response.data.items;
    },
  });

  const coachesQuery = useQuery({
    queryKey: ["coaches", "options"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CoachRecord>>("/coaches", {
        params: { page: 1, pageSize: optionPageSize },
      });
      return response.data.items;
    },
  });

  const parentsQuery = useQuery({
    queryKey: ["parents", "player-options"],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<ParentRecord>>("/parents", {
        params: { page: 1, pageSize: optionPageSize },
      });
      return response.data.items;
    },
  });

  const categoryPlayersQuery = useQuery({
    queryKey: ["categories", selectedCategoryId, "players", categoryPlayersPage],
    enabled: Boolean(selectedCategoryId && formMode === "edit" && isDrawerOpen),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CategoryPlayerAssignment>>(
        `/categories/${selectedCategoryId}/players`,
        {
          params: {
            page: categoryPlayersPage,
            pageSize: categoryPlayersPageSize,
          },
        },
      );
      return response.data;
    },
  });

  const isPublicProgramDrawerOpen = Boolean(
    selectedCategoryId && formMode === "edit" && isDrawerOpen && form.audience === "PUBLIC",
  );

  const programRegistrationDatesQuery = useQuery({
    queryKey: ["program-registrations", selectedCategoryId, "dates"],
    enabled: isPublicProgramDrawerOpen,
    queryFn: async () => {
      const response = await api.get<ProgramRegistrationDates>("/program-registrations/dates", {
        params: { categoryId: selectedCategoryId },
      });
      return response.data;
    },
  });

  const registrationDate =
    pickedRegistrationDate ?? programRegistrationDatesQuery.data?.defaultDate ?? null;

  const programRegistrationsQuery = useQuery({
    queryKey: ["program-registrations", selectedCategoryId, "list", registrationDate],
    enabled: isPublicProgramDrawerOpen && registrationDate !== null,
    queryFn: () => fetchProgramRegistrations(selectedCategoryId!, registrationDate!),
  });

  const deleteRegistrationMutation = useMutation({
    mutationFn: async (registration: ProgramRegistrationRecord) => {
      await api.delete(`/program-registrations/${registration.id}`);
      return registration;
    },
    onSuccess: (registration) => {
      setFeedback({
        tone: "success",
        message: `Prijava za ${registration.childFirstName} ${registration.childLastName} je obrisana.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["program-registrations"] });
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: getMutationErrorMessage(error, "Brisanje prijave nije uspjelo."),
      });
    },
  });

  const categoriesPageData = categoriesQuery.data;
  const categories = categoriesPageData?.items ?? [];
  const categoryOptions = categoryOptionsQuery.data ?? [];
  const regularCategoryOptions = categoryOptions.filter((category) => category.kind === "REGULAR");
  // Programs for non-members never hold players, so they are left out of player assignment.
  const playerCategoryOptions = categoryOptions.filter((category) => category.audience !== "PUBLIC");
  const isPublicProgramForm = isProgramPage && form.audience === "PUBLIC";
  const coaches = coachesQuery.data ?? [];
  const parents = parentsQuery.data ?? [];
  const categoriesTotal = categoriesPageData?.total ?? 0;
  const selectedCategory =
    categories.find((category) => category.id === selectedCategoryId) ??
    categoryOptions.find((category) => category.id === selectedCategoryId) ??
    null;
  const categoryPlayersPageData = categoryPlayersQuery.data;
  const categoryPlayers = categoryPlayersPageData?.items ?? [];
  const selectedCategoryPlayerTotal =
    categoryPlayersPageData?.total ?? selectedCategory?.playerCount ?? 0;
  const managedPlayer =
    categoryPlayers.find((assignment) => assignment.playerId === managedPlayerId)?.player ?? null;

  useEffect(() => {
    if (categoriesPageData && categoriesPage > categoriesPageData.totalPages) {
      setCategoriesPage(categoriesPageData.totalPages);
    }
  }, [categoriesPage, categoriesPageData]);

  useEffect(() => {
    if (categoryPlayersPageData && categoryPlayersPage > categoryPlayersPageData.totalPages) {
      setCategoryPlayersPage(categoryPlayersPageData.totalPages);
    }
  }, [categoryPlayersPage, categoryPlayersPageData]);

  useEffect(() => {
    if (!selectedCategoryId && categories.length > 0 && formMode === "edit") {
      const nextCategory = categories[0];
      setSelectedCategoryId(nextCategory.id);
      setForm(createFormFromCategory(nextCategory));
    }
  }, [categories, formMode, selectedCategoryId]);

  useEffect(() => {
    if (!form.logoFile) {
      setLogoPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(form.logoFile);
    setLogoPreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [form.logoFile]);

  useEffect(() => {
    if (!managedPlayer) {
      return;
    }

    setManagedPlayerForm(createManagedPlayerForm(managedPlayer));
  }, [managedPlayer]);

  useEffect(() => {
    setMoveTargetCategoryId("");
  }, [managedPlayerId]);

  useEffect(() => {
    setPickedRegistrationDate(null);
  }, [selectedCategoryId, isDrawerOpen]);

  useEffect(() => {
    if (!managedPlayerForm.profileFile) {
      setManagedPlayerProfilePreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(managedPlayerForm.profileFile);
    setManagedPlayerProfilePreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [managedPlayerForm.profileFile]);

  const updateProgramSlot = (index: number, changes: Partial<ProgramSlotRecord>) =>
    setForm((current) => ({
      ...current,
      programSlots: current.programSlots.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, ...changes } : slot,
      ),
    }));

  const openCreateDrawer = () => {
    setFeedback(null);
    setFormMode("create");
    setSelectedCategoryId(null);
    setManagedPlayerId(null);
    setCategoryPlayersPage(1);
    setForm(emptyForm);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (category: CategoryRecord) => {
    setFeedback(null);
    setFormMode("edit");
    setSelectedCategoryId(category.id);
    setManagedPlayerId(null);
    setCategoryPlayersPage(1);
    setForm(createFormFromCategory(category));
    setIsDrawerOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      ensureCategoryFormIsValid(form);

      const formData = buildCategoryFormData(form, isProgramPage);
      formData.append("kind", kind);

      const response = await api.post<CategoryRecord>("/categories", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return response.data;
    },
    onSuccess: (createdCategory) => {
      setFeedback({
        tone: "success",
        message: copy.created(createdCategory.name),
      });
      setSelectedCategoryId(createdCategory.id);
      setFormMode("edit");
      setForm(createFormFromCategory(createdCategory));
      setIsDrawerOpen(true);
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      void queryClient.invalidateQueries({ queryKey: ["coaches"] });
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: getMutationErrorMessage(error, "Kreiranje kategorije nije uspjelo."),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCategory) {
        throw new Error("Nijedna kategorija nije odabrana.");
      }

      ensureCategoryFormIsValid(form);

      const response = await api.patch<CategoryRecord>(
        `/categories/${selectedCategory.id}`,
        buildCategoryFormData(form, isProgramPage),
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      return response.data;
    },
    onSuccess: (updatedCategory) => {
      setFeedback({
        tone: "success",
        message: copy.updated(updatedCategory.name),
      });
      setSelectedCategoryId(updatedCategory.id);
      setForm(createFormFromCategory(updatedCategory));
      setIsDrawerOpen(true);
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      void queryClient.invalidateQueries({ queryKey: ["coaches"] });
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: getMutationErrorMessage(error, "Ažuriranje kategorije nije uspjelo."),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCategory) {
        throw new Error("Nijedna kategorija nije odabrana.");
      }

      await api.delete(`/categories/${selectedCategory.id}`);
    },
    onSuccess: () => {
      const deletedCategoryName = selectedCategory?.name ?? copy.fallbackName;

      setFeedback({
        tone: "success",
        message: copy.deleted(deletedCategoryName),
      });
      setSelectedCategoryId(null);
      setFormMode("create");
      setForm(emptyForm);
      setIsDrawerOpen(false);

      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      void queryClient.invalidateQueries({ queryKey: ["coaches"] });
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Brisanje kategorije nije uspjelo.",
      });
    },
  });

  const startNewSeasonMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<StartNewSeasonResult>("/categories/start-new-season");
      return response.data;
    },
    onSuccess: async (result) => {
      setFeedback({
        tone: "success",
        message: `Nova sezona je pokrenuta. Ažurirano kategorija: ${result.categoriesUpdated}. Premješteno igrača: ${result.playersReassigned}. Novih veteranskih kategorija: ${result.veteransAdded}.`,
      });
      setSelectedCategoryId(null);
      setFormMode("create");
      setForm(emptyForm);
      setIsDrawerOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      await queryClient.invalidateQueries({ queryKey: ["players"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Pokretanje nove sezone nije uspjelo.",
      });
    },
  });

  const updateManagedPlayerMutation = useMutation({
    mutationFn: async () => {
      if (!managedPlayer) {
        throw new Error("Igrač nije pronađen.");
      }

      ensureManagedPlayerHasParent(managedPlayerForm);

      const response = await api.patch<PlayerRecord>(
        `/players/${managedPlayer.id}`,
        buildManagedPlayerPayload(managedPlayerForm),
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      return response.data;
    },
    onSuccess: async (updatedPlayer) => {
      setFeedback({
        tone: "success",
        message: `Igrač ${updatedPlayer.user.firstName} ${updatedPlayer.user.lastName} uspješno je ažuriran iz prikaza kategorija.`,
      });
      setManagedPlayerForm(createManagedPlayerForm(updatedPlayer));
      await queryClient.invalidateQueries({ queryKey: ["players"] });
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      if (isAdmin) {
        await queryClient.invalidateQueries({ queryKey: ["parents"] });
      }
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: getMutationErrorMessage(error, "Ažuriranje igrača nije uspjelo."),
      });
    },
  });

  const moveFromProgramMutation = useMutation({
    mutationFn: async () => {
      if (!managedPlayer || !selectedCategory) {
        throw new Error("Dijete nije pronađeno.");
      }

      if (!moveTargetCategoryId) {
        throw new Error("Odaberite vaterpolo kategoriju.");
      }

      const response = await api.post<PlayerRecord>(`/players/${managedPlayer.id}/move-from-program`, {
        fromCategoryId: selectedCategory.id,
        toCategoryId: moveTargetCategoryId,
      });

      return response.data;
    },
    onSuccess: async (movedPlayer) => {
      const targetName =
        regularCategoryOptions.find((category) => category.id === moveTargetCategoryId)?.name ??
        "odabranu kategoriju";

      setFeedback({
        tone: "success",
        message: `${movedPlayer.user.firstName} ${movedPlayer.user.lastName} premješten/a je iz programa u kategoriju ${targetName}.`,
      });
      setManagedPlayerId(null);
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      await queryClient.invalidateQueries({ queryKey: ["players"] });
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: getMutationErrorMessage(error, "Premještanje djeteta nije uspjelo."),
      });
    },
  });

  const activeLogoUrl = form.removeLogo
    ? null
    : logoPreviewUrl ?? selectedCategory?.logoUrl ?? null;
  const activeManagedPlayerProfileUrl =
    managedPlayerForm.removeProfileImage
      ? null
      : managedPlayerProfilePreviewUrl ?? managedPlayer?.user.profileImageUrl ?? null;
  const openPlayerFromCategory = (playerId: string) => {
    setManagedPlayerId(playerId);
  };

  /** Exports one practice day; from the list row that is the latest day with signups. */
  const exportProgramRegistrations = async (category: CategoryRecord, sessionDate?: string) => {
    setFeedback(null);
    setExportingCategoryId(category.id);

    try {
      const date =
        sessionDate ??
        (
          await api.get<ProgramRegistrationDates>("/program-registrations/dates", {
            params: { categoryId: category.id },
          })
        ).data.defaultDate;
      const registrations = date ? await fetchProgramRegistrations(category.id, date) : [];

      if (!date || registrations.length === 0) {
        setFeedback({ tone: "error", message: "Za ovaj trening nema prijava za izvoz." });
        return;
      }

      await downloadProgramRegistrationsWorkbook(category.name, date, registrations);
      setFeedback({
        tone: "success",
        message: `Izvezeno prijava za ${formatSessionDay(date)}: ${registrations.length}.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getMutationErrorMessage(error, "Izvoz prijava nije uspio."),
      });
    } finally {
      setExportingCategoryId(null);
    }
  };

  const exportCategoryPlayers = async (category: CategoryRecord) => {
    setFeedback(null);
    setExportingCategoryId(category.id);

    try {
      const assignments = await fetchAllCategoryPlayers(category.id);
      const result = await downloadCategoryPlayersWorkbook(category.name, assignments);
      setFeedback({
        tone: "success",
        message:
          result.failedImageCount > 0
            ? `Izvezeno igrača iz kategorije ${category.name}: ${assignments.length}. Umetnuto slika: ${result.embeddedImageCount}. Slike koje nije moguće učitati: ${result.failedImageCount}.`
            : `Izvezeno igrača iz kategorije ${category.name}: ${assignments.length}. Umetnuto slika: ${result.embeddedImageCount}.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getMutationErrorMessage(error, "Izvoz igrača nije uspio."),
      });
    } finally {
      setExportingCategoryId(null);
    }
  };

  return (
    <section className="space-y-6">
      <FeedbackToast feedback={feedback} onClose={() => setFeedback(null)} />

      {categoriesQuery.isLoading ||
      categoryOptionsQuery.isLoading ||
      coachesQuery.isLoading ||
      (isAdmin && parentsQuery.isLoading) ? (
        <div className="space-y-4">
          <div className="h-[640px] animate-pulse border-2 border-line bg-panel" />
        </div>
      ) : categoriesQuery.isError ||
        categoryOptionsQuery.isError ||
        coachesQuery.isError ||
        (isAdmin && parentsQuery.isError) ? (
        <div className="border-2 border-line bg-signal px-5 py-4 text-sm font-medium text-surface">
          {copy.loadError}
        </div>
      ) : (
        <>
          <section className="border-2 border-line bg-surface">
            <div className="flex flex-col gap-4 border-b-2 border-line bg-panel px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  {copy.listKicker}
                </p>
                <h3 className="mt-2 text-xl font-bold uppercase">{copy.listTitle}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {isAdmin && !isProgramPage ? (
                  <button
                    className="ui-pill ui-pill-button ui-pill--panel"
                    type="button"
                    disabled={categoriesTotal === 0 || startNewSeasonMutation.isPending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Pokrenuti novu sezonu? Svim kategorijama će se pomaknuti godište za jednu godinu, a svi igrači će biti ponovno raspoređeni prema datumu rođenja. Programi i djeca upisana u njih ostaju nepromijenjeni.",
                        )
                      ) {
                        return;
                      }

                      setFeedback(null);
                      startNewSeasonMutation.mutate();
                    }}
                  >
                    {startNewSeasonMutation.isPending ? "Pokretanje..." : "Pokreni novu sezonu"}
                  </button>
                ) : null}

                <button
                  className="ui-pill ui-pill-button ui-pill--accent"
                  type="button"
                  onClick={openCreateDrawer}
                >
                  {copy.createLabel}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead className="bg-bg">
                  <tr className="border-b-2 border-line text-center text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    <th className="px-4 py-4">{copy.columnLabel}</th>
                    <th className="px-4 py-4">Godište</th>
                    <th className="px-4 py-4">Treneri</th>
                    <th className="px-4 py-4">Igrači</th>
                    <th className="px-4 py-4">Izvoz</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-sm text-muted" colSpan={5}>
                        {copy.emptyList}
                      </td>
                    </tr>
                  ) : null}
                  {categories.map((category) => {
                    const isSelected =
                      isDrawerOpen && selectedCategoryId === category.id && formMode === "edit";

                    return (
                      <tr
                        key={category.id}
                        className={`cursor-pointer border-b-2 border-line ${
                          isSelected ? "bg-panel" : "bg-white hover:bg-bg"
                        }`}
                        onClick={() => openEditDrawer(category)}
                      >
                        <td className="px-4 py-4 align-middle text-center">
                          <p className="text-sm font-bold uppercase">{category.name}</p>
                          {isProgramPage ? (
                            <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted">
                              {category.audience === "PUBLIC"
                                ? `Za nečlanove · ${formatEuro(category.pricePerPracticeCents)} po treningu`
                                : "Za članove kluba"}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 align-middle text-center text-sm font-medium">
                          {formatCategoryAgeRule(category)}
                        </td>
                        <td className="px-4 py-4 align-middle text-center text-sm">{category.coaches.length}</td>
                        <td className="px-4 py-4 align-middle text-center text-sm">{category.playerCount}</td>
                        <td className="px-4 py-4 align-middle text-center">
                          <button
                            className="ui-pill ui-pill-button ui-pill--outline inline-flex items-center gap-2"
                            type="button"
                            aria-label={`Izvezi igrače kategorije ${category.name} u Excel`}
                            disabled={
                              (category.audience !== "PUBLIC" && category.playerCount === 0) ||
                              exportingCategoryId !== null
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              void (category.audience === "PUBLIC"
                                ? exportProgramRegistrations(category)
                                : exportCategoryPlayers(category));
                            }}
                          >
                            <DownloadIcon />
                            {exportingCategoryId === category.id ? "Izvoz..." : "Excel"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {categoriesPageData ? (
              <PaginationControls
                page={categoriesPageData.page}
                pageSize={categoriesPageData.pageSize}
                total={categoriesPageData.total}
                totalPages={categoriesPageData.totalPages}
                onPageChange={setCategoriesPage}
              />
            ) : null}
          </section>

          <EntityDrawer
            open={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            eyebrow={formMode === "create" ? copy.createLabel : copy.editLabel}
            title={
              formMode === "create"
                ? copy.createTitle
                : selectedCategory?.name ?? copy.editLabel
            }
          >
            <section className="category-drawer">
              <form
                className="category-drawer-form"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  setFeedback(null);

                  if (formMode === "create") {
                    createMutation.mutate();
                    return;
                  }

                  updateMutation.mutate();
                }}
              >
                {selectedCategory && formMode === "edit" ? (
                  <div className="category-drawer-stats">
                    <span className="ui-pill ui-pill--panel">
                      Treneri <strong>{selectedCategory.coaches.length}</strong>
                    </span>
                    <span className="ui-pill ui-pill--panel">
                      Igrači <strong>{selectedCategoryPlayerTotal}</strong>
                    </span>
                    <span className="ui-pill ui-pill--outline">
                      Dob <strong>{formatCategoryAgeRule(selectedCategory)}</strong>
                    </span>
                  </div>
                ) : null}


                <fieldset className="category-widget">
                  <legend className="category-widget-title">Osnovni podaci</legend>
                  <div className="grid gap-5 lg:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                      {copy.nameLabel}
                    </span>
                    <input
                      className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                      type="text"
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder={copy.namePlaceholder}
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                      Pravilo dobi
                    </span>
                    <select
                      className="w-full rounded-[18px] border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                      value={form.ageRule}
                      onChange={(event) =>
                        setForm((current) => {
                          const ageRule = event.target.value as CategoryFormState["ageRule"];

                          return {
                            ...current,
                            ageRule,
                            startDateOfBirth:
                              ageRule === "YOUTH"
                                ? getYearBoundaryDate(current.startDateOfBirth || current.endDateOfBirth, "start")
                                : "",
                            endDateOfBirth:
                              ageRule === "VETERAN"
                                ? getYearBoundaryDate(current.endDateOfBirth || current.startDateOfBirth, "end")
                                : "",
                          };
                        })
                      }
                    >
                      <option value="YOUTH">Kategorija s početnim godištem</option>
                      <option value="SENIOR">
                        {isProgramPage ? "Bez dobnog ograničenja" : "Seniori bez dobnog ograničenja"}
                      </option>
                      <option value="VETERAN">Kategorija s krajnjim godištem</option>
                    </select>
                  </label>

                  {form.ageRule === "YOUTH" ? (
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Godište od
                      </span>
                      <DatePicker
                        className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                        value={form.startDateOfBirth}
                        boundary="start"
                        onChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            startDateOfBirth: getYearBoundaryDate(value, "start"),
                          }))
                        }
                        placeholder="01.01.gggg."
                        required
                      />
                    </label>
                  ) : null}

                  {form.ageRule === "VETERAN" ? (
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Godište do
                      </span>
                      <DatePicker
                        className="w-full rounded-[18px] border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                        value={form.endDateOfBirth}
                        boundary="end"
                        onChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            endDateOfBirth: getYearBoundaryDate(value, "end"),
                          }))
                        }
                        placeholder="31.12.gggg."
                        required
                      />
                    </label>
                  ) : null}
                  </div>
                </fieldset>

                {isProgramPage ? (
                  <fieldset className="category-widget category-widget--wide">
                    <legend className="category-widget-title">Vrsta programa</legend>
                    <div className="category-audience-options">
                      {(
                        [
                          {
                            value: "MEMBERS",
                            title: "Za članove kluba",
                            text: "Upis kao u vaterpolo: nakon odobrenja dijete i roditelji dobivaju račune.",
                          },
                          {
                            value: "PUBLIC",
                            title: "Za nečlanove",
                            text: "Prijava za pojedini trening i plaćanje po treningu, bez otvaranja računa.",
                          },
                        ] as const
                      ).map((option) => (
                        <label
                          key={option.value}
                          className={`category-check-card ${form.audience === option.value ? "bg-panel" : "bg-white"}`}
                        >
                          <input
                            className="mt-1 h-4 w-4 accent-accent"
                            type="radio"
                            name="program-audience"
                            checked={form.audience === option.value}
                            onChange={() =>
                              setForm((current) => ({
                                ...current,
                                audience: option.value,
                                programSlots:
                                  option.value === "PUBLIC" && current.programSlots.length === 0
                                    ? [emptyProgramSlot]
                                    : current.programSlots,
                              }))
                            }
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-bold uppercase">{option.title}</span>
                            <span className="mt-1 block text-sm text-muted">{option.text}</span>
                          </span>
                        </label>
                      ))}
                    </div>

                  </fieldset>
                ) : null}

                {isPublicProgramForm ? (
                  <fieldset className="category-widget category-widget--wide">
                    <legend className="category-widget-title">Cijena i termini</legend>

                    {selectedCategory?.nextSession && formMode === "edit" ? (
                      <p className="category-next-session">
                        Sljedeći trening: <strong>{formatSessionDay(selectedCategory.nextSession.date)}</strong>
                        {" · "}prijave se zatvaraju{" "}
                        <strong>{formatDateTimeHr(selectedCategory.nextSession.closesAt)}</strong>
                      </p>
                    ) : null}

                    <div className="mt-4 grid gap-5 lg:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Cijena po treningu (€)
                        </span>
                        <input
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          type="text"
                          inputMode="decimal"
                          value={form.pricePerPractice}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, pricePerPractice: event.target.value }))
                          }
                          placeholder="7"
                        />
                      </label>

                      <div className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Zatvaranje prijava
                        </span>
                        <div className="category-close-row">
                          <select
                            className="w-full rounded-[18px] border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                            value={form.signupCloseDaysBefore}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                signupCloseDaysBefore: event.target.value,
                                signupCloseTime: event.target.value
                                  ? current.signupCloseTime || "22:00"
                                  : "",
                              }))
                            }
                            aria-label="Koliko dana prije treninga se zatvaraju prijave"
                          >
                            <option value="">Kad počne prvi termin</option>
                            <option value="0">Na dan treninga u</option>
                            <option value="1">1 dan prije u</option>
                            {[2, 3, 4, 5, 6].map((days) => (
                              <option key={days} value={String(days)}>
                                {days} dana prije u
                              </option>
                            ))}
                          </select>
                          {form.signupCloseDaysBefore ? (
                            <TimePicker
                              className="w-full rounded-[18px] border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                              value={form.signupCloseTime}
                              onChange={(value) =>
                                setForm((current) => ({ ...current, signupCloseTime: value }))
                              }
                            />
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5">
                      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Tjedni termini
                      </span>
                      <div className="grid gap-3">
                        {form.programSlots.map((slot, index) => (
                          <div className="category-slot-row" key={index}>
                            <select
                              className="w-full rounded-[18px] border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                              value={slot.dayOfWeek}
                              onChange={(event) =>
                                updateProgramSlot(index, {
                                  dayOfWeek: event.target.value as ProgramSlotRecord["dayOfWeek"],
                                })
                              }
                              aria-label="Dan treninga"
                            >
                              {orderedDays.map((day) => (
                                <option key={day.key} value={day.key}>
                                  {day.label}
                                </option>
                              ))}
                            </select>
                            <TimePicker
                              className="w-full rounded-[18px] border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                              value={slot.startTime}
                              onChange={(value) => updateProgramSlot(index, { startTime: value })}
                            />
                            <TimePicker
                              className="w-full rounded-[18px] border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                              value={slot.endTime}
                              onChange={(value) => updateProgramSlot(index, { endTime: value })}
                            />
                            <button
                              className="ui-pill ui-pill-button ui-pill--outline"
                              type="button"
                              disabled={form.programSlots.length === 1}
                              onClick={() =>
                                setForm((current) => ({
                                  ...current,
                                  programSlots: current.programSlots.filter((_, slotIndex) => slotIndex !== index),
                                }))
                              }
                            >
                              Ukloni
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        className="ui-pill ui-pill-button ui-pill--panel mt-3"
                        type="button"
                        onClick={() =>
                          setForm((current) => {
                            const lastSlot = current.programSlots[current.programSlots.length - 1];

                            return {
                              ...current,
                              // A new slot follows straight on from the last one, e.g. 10:00-11:00 after 09:00-10:00.
                              programSlots: [
                                ...current.programSlots,
                                lastSlot
                                  ? {
                                      dayOfWeek: lastSlot.dayOfWeek,
                                      startTime: lastSlot.endTime,
                                      endTime: addOneHour(lastSlot.endTime),
                                    }
                                  : emptyProgramSlot,
                              ],
                            };
                          })
                        }
                      >
                        Dodaj termin
                      </button>
                    </div>
                  </fieldset>
                ) : null}

                {!isPublicProgramForm ? (
                  <fieldset className="category-widget category-widget--wide">
                    <legend className="category-widget-title">Članarina</legend>
                    <div className="mt-4 grid gap-5 lg:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Mjesečna članarina (€)
                        </span>
                        <input
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          type="text"
                          inputMode="decimal"
                          value={form.monthlyPrice}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, monthlyPrice: event.target.value }))
                          }
                          placeholder="Članarina kluba"
                        />
                        <span className="mt-2 block text-xs text-muted">
                          {isProgramPage
                            ? "Roditelji djece koja su samo u ovom programu vide ovaj iznos kod plaćanja."
                            : "Unesite 0 za besplatnu kategoriju."}{" "}
                          Prazno: vrijedi članarina kluba i njezino besplatno razdoblje iz Postavki.
                        </span>
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Besplatno do
                        </span>
                        <DatePicker
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          value={form.membershipFreeUntil}
                          onChange={(value) =>
                            setForm((current) => ({ ...current, membershipFreeUntil: value }))
                          }
                        />
                        <span className="mt-2 block text-xs text-muted">
                          Do tog dana (uključivo) članarina se ne naplaćuje, ni djeci s vlastitom
                          članarinom.
                        </span>
                      </label>
                    </div>
                  </fieldset>
                ) : null}

                <fieldset className="category-widget category-widget--wide">
                  <legend className="category-widget-title">Logo i treneri</legend>
                  <div className="category-logo-coaches-grid">
                  <div className="category-logo-card">
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                      Pregled loga
                    </p>
                    {activeLogoUrl ? (
                      <img
                        className="category-logo-preview"
                        src={activeLogoUrl}
                        alt={form.name || "Pregled loga kategorije"}
                      />
                    ) : (
                      <div className="category-logo-placeholder">
                        Učitaj logo
                      </div>
                    )}
                    <input
                      id="category-logo-upload"
                      className="category-logo-input"
                      type="file"
                      accept="image/*"
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        const nextFile = event.target.files?.[0] ?? null;
                        setForm((current) => ({
                          ...current,
                          logoFile: nextFile,
                          removeLogo: false,
                        }));
                      }}
                    />
                    <div className="category-logo-actions">
                      <label className="ui-pill ui-pill-button ui-pill--accent" htmlFor="category-logo-upload">
                        {activeLogoUrl ? "Promijeni logo" : "Odaberi logo"}
                      </label>
                      {activeLogoUrl || form.logoFile ? (
                        <button
                          className="ui-pill ui-pill-button ui-pill--outline"
                          type="button"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              logoFile: null,
                              removeLogo: Boolean(selectedCategory?.logoUrl),
                            }))
                          }
                        >
                          Ukloni logo
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="category-subwidget">
                    <div className="category-subwidget-header">
                      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Dodijeljeni treneri
                      </p>
                    </div>
                    <div className="grid gap-3 p-4 sm:grid-cols-2">
                      {coaches.map((coach) => {
                        const isChecked = form.coachIds.includes(coach.id);

                        return (
                          <label
                            key={coach.id}
                            className={`category-check-card ${
                              isChecked ? "bg-panel" : "bg-white"
                            }`}
                          >
                            <input
                              className="mt-1 h-4 w-4 accent-accent"
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setForm((current) => ({
                                  ...current,
                                  coachIds: isChecked
                                    ? current.coachIds.filter((coachId) => coachId !== coach.id)
                                    : [...current.coachIds, coach.id],
                                }));
                              }}
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-bold uppercase">
                                {coach.user.firstName} {coach.user.lastName}
                              </span>
                              <span className="mt-1 block truncate text-[11px] uppercase tracking-[0.2em] text-muted">
                                {coach.user.email ?? "Bez e-pošte"}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  </div>
                </fieldset>

                {selectedCategory && formMode === "edit" && isPublicProgramForm ? (
                  <fieldset className="category-widget category-widget--wide category-players-widget">
                    <legend className="category-widget-title">Prijave po datumima</legend>
                    {programRegistrationDatesQuery.data?.dates.length ? (
                      <div className="category-inline-action category-registration-picker">
                        <select
                          className="w-full rounded-[18px] border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          value={registrationDate ?? ""}
                          onChange={(event) => setPickedRegistrationDate(event.target.value)}
                          aria-label="Datum treninga"
                        >
                          {programRegistrationDatesQuery.data.dates.map((entry) => (
                            <option key={entry.date} value={entry.date}>
                              {formatSessionDay(entry.date)} · {formatRegistrationCount(entry.count)}
                            </option>
                          ))}
                        </select>
                        <button
                          className="ui-pill ui-pill-button ui-pill--outline inline-flex items-center gap-2"
                          type="button"
                          disabled={
                            !registrationDate ||
                            !programRegistrationsQuery.data?.length ||
                            exportingCategoryId !== null
                          }
                          onClick={() =>
                            selectedCategory && registrationDate
                              ? void exportProgramRegistrations(selectedCategory, registrationDate)
                              : undefined
                          }
                        >
                          <DownloadIcon />
                          {exportingCategoryId === selectedCategory.id ? "Izvoz..." : "Excel"}
                        </button>
                      </div>
                    ) : null}
                    <ProgramRegistrationsList
                      registrations={programRegistrationsQuery.data ?? []}
                      isLoading={programRegistrationDatesQuery.isLoading || programRegistrationsQuery.isLoading}
                      isError={programRegistrationDatesQuery.isError || programRegistrationsQuery.isError}
                      deletingId={
                        deleteRegistrationMutation.isPending
                          ? deleteRegistrationMutation.variables?.id ?? null
                          : null
                      }
                      onDelete={(registration) => {
                        if (
                          window.confirm(
                            `Obrisati prijavu za ${registration.childFirstName} ${registration.childLastName}?`,
                          )
                        ) {
                          setFeedback(null);
                          deleteRegistrationMutation.mutate(registration);
                        }
                      }}
                    />
                  </fieldset>
                ) : null}

                {selectedCategory && formMode === "edit" && !isPublicProgramForm ? (
                  <fieldset className="category-widget category-widget--wide category-players-widget">
                    <legend className="category-widget-title">{copy.playersTitle}</legend>

                    {categoryPlayersQuery.isLoading ? (
                      <div className="category-widget-state">
                        Učitavanje igrača u kategoriji...
                      </div>
                    ) : categoryPlayersQuery.isError ? (
                      <div className="category-widget-state text-signal">
                        Popis igrača trenutno nije moguće učitati.
                      </div>
                    ) : selectedCategoryPlayerTotal === 0 ? (
                      <div className="category-widget-state">
                        {copy.emptyPlayers}
                      </div>
                    ) : (
                      <>
                        <div className="category-player-grid">
                          {categoryPlayers.map((assignment) => (
                            <button
                              key={assignment.playerId}
                              className="category-player-card"
                              type="button"
                              onClick={() => openPlayerFromCategory(assignment.playerId)}
                            >
                              <span className="min-w-0">
                                <span className="block text-sm font-bold uppercase text-ink">
                                  {assignment.player.user.firstName}{" "}
                                  {assignment.player.user.lastName}
                                </span>
                                <span className="mt-1 block text-[11px] uppercase tracking-[0.2em] text-muted">
                                  {formatNumericDate(assignment.player.dateOfBirth)}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>

                        {categoryPlayersPageData ? (
                          <div className="category-widget-footer">
                            <PaginationControls
                              page={categoryPlayersPageData.page}
                              pageSize={categoryPlayersPageData.pageSize}
                              total={categoryPlayersPageData.total}
                              totalPages={categoryPlayersPageData.totalPages}
                              onPageChange={setCategoryPlayersPage}
                            />
                          </div>
                        ) : null}
                      </>
                    )}
                  </fieldset>
                ) : null}

                <div className="category-actions">
                  <button
                    className="ui-pill ui-pill-button ui-pill--accent"
                    type="submit"
                    disabled={
                      createMutation.isPending ||
                      updateMutation.isPending ||
                      deleteMutation.isPending
                    }
                  >
                    {formMode === "create"
                      ? createMutation.isPending
                        ? "Kreiranje..."
                        : copy.submitCreateLabel
                      : updateMutation.isPending
                        ? "Spremanje..."
                        : "Spremi promjene"}
                  </button>
                  <button
                    className="ui-pill ui-pill-button ui-pill--panel"
                    type="button"
                    onClick={() => {
                      setFeedback(null);

                      if (formMode === "edit" && selectedCategory) {
                        setForm(createFormFromCategory(selectedCategory));
                        return;
                      }

                      setForm(emptyForm);
                    }}
                  >
                    Resetiraj obrazac
                  </button>
                  <button
                    className="ui-pill ui-pill-button ui-pill--signal"
                    type="button"
                    disabled={
                      formMode !== "edit" ||
                      !selectedCategory ||
                      createMutation.isPending ||
                      updateMutation.isPending ||
                      deleteMutation.isPending
                    }
                    onClick={() => deleteMutation.mutate()}
                  >
                    {deleteMutation.isPending ? "Brisanje..." : copy.deleteLabel}
                  </button>
                </div>
              </form>
            </section>
          </EntityDrawer>

          <EntityDrawer
            open={managedPlayerId !== null}
            onClose={() => setManagedPlayerId(null)}
            eyebrow="Uredi igrača"
            title={
              managedPlayer
                ? `${managedPlayer.user.firstName} ${managedPlayer.user.lastName}`
                : "Pregled igrača"
            }
          >
            {managedPlayer ? (
              <section className="player-drawer">
                <form
                  className="player-drawer-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setFeedback(null);
                    updateManagedPlayerMutation.mutate();
                  }}
                >
                  {isProgramPage && selectedCategory ? (
                    <fieldset className="player-widget player-widget--wide">
                      <legend className="player-widget-title">Premjesti u vaterpolo</legend>
                      <p className="mt-3 text-sm text-muted">
                        Dijete izlazi iz programa {selectedCategory.name} i upisuje se u odabranu
                        vaterpolo kategoriju. Pristupni podaci i roditelji ostaju isti.
                      </p>
                      <div className="category-inline-action">
                        <select
                          className="w-full rounded-[18px] border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          value={moveTargetCategoryId}
                          onChange={(event) => setMoveTargetCategoryId(event.target.value)}
                          aria-label="Vaterpolo kategorija"
                        >
                          <option value="">Odaberite kategoriju</option>
                          {regularCategoryOptions.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name} ({formatCategoryAgeRule(category)})
                            </option>
                          ))}
                        </select>
                        <button
                          className="ui-pill ui-pill-button ui-pill--accent"
                          type="button"
                          disabled={!moveTargetCategoryId || moveFromProgramMutation.isPending}
                          onClick={() => {
                            setFeedback(null);
                            moveFromProgramMutation.mutate();
                          }}
                        >
                          {moveFromProgramMutation.isPending ? "Premještanje..." : "Premjesti"}
                        </button>
                      </div>
                    </fieldset>
                  ) : null}

                  <fieldset className="player-widget">
                    <legend className="player-widget-title">Osnovni podaci</legend>
                    <div className="grid gap-5 lg:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Ime
                        </span>
                        <input
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          type="text"
                          value={managedPlayerForm.firstName}
                          onChange={(event) =>
                            setManagedPlayerForm((current) => ({
                              ...current,
                              firstName: event.target.value,
                            }))
                          }
                          required
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Prezime
                        </span>
                        <input
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          type="text"
                          value={managedPlayerForm.lastName}
                          onChange={(event) =>
                            setManagedPlayerForm((current) => ({
                              ...current,
                              lastName: event.target.value,
                            }))
                          }
                          required
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Datum rođenja
                        </span>
                        <DatePicker
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          value={managedPlayerForm.dateOfBirth}
                          onChange={(value) =>
                            setManagedPlayerForm((current) => ({
                              ...current,
                              dateOfBirth: value,
                            }))
                          }
                          required
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          OIB
                        </span>
                        <input
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          type="text"
                          value={managedPlayerForm.oib}
                          onChange={(event) =>
                            setManagedPlayerForm((current) => ({
                              ...current,
                              oib: event.target.value,
                            }))
                          }
                          required
                        />
                      </label>

                      <label className="block lg:col-span-2">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Adresa stanovanja
                        </span>
                        <input
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          type="text"
                          value={managedPlayerForm.address}
                          onChange={(event) =>
                            setManagedPlayerForm((current) => ({
                              ...current,
                              address: event.target.value,
                            }))
                          }
                          placeholder="Ulica i kućni broj, poštanski broj i mjesto"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Telefon
                        </span>
                        <input
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          type="text"
                          value={managedPlayerForm.phone}
                          onChange={(event) =>
                            setManagedPlayerForm((current) => ({
                              ...current,
                              phone: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          E-pošta igrača
                        </span>
                        <input
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          type="email"
                          value={managedPlayerForm.email}
                          onChange={(event) =>
                            setManagedPlayerForm((current) => ({
                              ...current,
                              email: event.target.value,
                            }))
                          }
                          placeholder="Za seniore ili veterane bez roditeljskog računa"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Članstvo vrijedi do
                        </span>
                        <DatePicker
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          value={managedPlayerForm.membershipExpiresAt}
                          onChange={(value) =>
                            setManagedPlayerForm((current) => ({
                              ...current,
                              membershipExpiresAt: value,
                            }))
                          }
                        />
                      </label>

                      <MembershipPriceField
                        value={managedPlayerForm.membershipPrice}
                        onChange={(value) =>
                          setManagedPlayerForm((current) => ({ ...current, membershipPrice: value }))
                        }
                        suggestedPriceCents={managedPlayer?.suggestedMembershipPriceCents}
                        freeUntil={managedPlayer?.membershipFreeUntil}
                      />
                    </div>
                  </fieldset>

                  <fieldset className="player-widget">
                    <legend className="player-widget-title">Suglasnosti</legend>
                    <label className="player-check-card">
                      <input
                        className="mt-1 h-4 w-4 accent-accent"
                        type="checkbox"
                        checked={managedPlayerForm.gdprConsent}
                        onChange={(event) =>
                          setManagedPlayerForm((current) => ({
                            ...current,
                            gdprConsent: event.target.checked,
                          }))
                        }
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold uppercase">
                          GDPR suglasnost potvrđena
                        </span>
                        <span className="mt-2 block text-sm leading-7 text-muted">
                          Označite kada je obrada podataka i fotografija potvrđena.
                        </span>
                      </span>
                    </label>
                  </fieldset>

                  <fieldset className="player-widget player-widget--wide">
                    <legend className="player-widget-title">Profil i dodjele</legend>
                    <div className="player-profile-grid">
                      <div className="player-profile-card">
                        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Pregled profila
                        </p>
                        {activeManagedPlayerProfileUrl ? (
                          <img
                            className="player-profile-preview"
                            src={activeManagedPlayerProfileUrl}
                            alt={managedPlayerForm.firstName || "Pregled profila igrača"}
                          />
                        ) : (
                          <div className="player-profile-placeholder">
                            Učitaj profilnu fotografiju
                          </div>
                        )}
                        <input
                          id="category-player-profile-upload"
                          className="player-profile-input"
                          type="file"
                          accept="image/*"
                          onChange={(event: ChangeEvent<HTMLInputElement>) => {
                            const nextFile = event.target.files?.[0] ?? null;
                            setManagedPlayerForm((current) => ({
                              ...current,
                              profileFile: nextFile,
                              removeProfileImage: false,
                            }));
                          }}
                        />
                        <div className="player-profile-actions">
                          <label
                            className="ui-pill ui-pill-button ui-pill--accent"
                            htmlFor="category-player-profile-upload"
                          >
                            {activeManagedPlayerProfileUrl
                              ? "Promijeni fotografiju"
                              : "Odaberi fotografiju"}
                          </label>
                          {activeManagedPlayerProfileUrl || managedPlayerForm.profileFile ? (
                            <button
                              className="ui-pill ui-pill-button ui-pill--outline"
                              type="button"
                              onClick={() =>
                                setManagedPlayerForm((current) => ({
                                  ...current,
                                  profileFile: null,
                                  removeProfileImage: Boolean(managedPlayer?.user.profileImageUrl),
                                }))
                              }
                            >
                              Ukloni fotografiju
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="player-assignment-stack">
                        <MultiSelectPanel
                          title="Dodjela kategorija"
                          items={playerCategoryOptions.map((category) => ({
                            id: category.id,
                            label:
                              category.kind === "PROGRAM" ? `${category.name} · program` : category.name,
                          }))}
                          selectedIds={managedPlayerForm.categoryIds}
                          onToggle={(id) => {
                            setManagedPlayerForm((current) => ({
                              ...current,
                              categoryIds: current.categoryIds.includes(id)
                                ? current.categoryIds.filter((categoryId) => categoryId !== id)
                                : [...current.categoryIds, id],
                            }));
                          }}
                        />
                      </div>
                    </div>
                  </fieldset>

                  {isAdmin ? (
                    <fieldset className="player-widget">
                      <legend className="player-widget-title">Roditelji</legend>
                      <div className="player-assignment-stack">
                        <SearchMultiSelectPanel
                          title="Povezani roditelji"
                          className="player-selector-panel"
                          items={parents.map((parent) => ({
                            id: parent.id,
                            label: `${parent.user.firstName} ${parent.user.lastName}`,
                            meta: parent.user.email ?? "Bez e-pošte",
                            keywords: [
                              parent.user.firstName,
                              parent.user.lastName,
                              parent.user.email ?? "",
                              parent.user.phone ?? "",
                            ],
                          }))}
                          searchPlaceholder="Pretraga roditelja"
                          noResultsLabel="Nema roditelja koji odgovaraju pretrazi."
                          selectedIds={managedPlayerForm.parentIds}
                          onToggle={(id) => {
                            setManagedPlayerForm((current) => {
                              const nextParentIds = current.parentIds.includes(id)
                                ? current.parentIds.filter((parentId) => parentId !== id)
                                : [...current.parentIds, id];

                              return {
                                ...current,
                                parentIds: nextParentIds,
                                primaryParentId: nextParentIds.includes(current.primaryParentId)
                                  ? current.primaryParentId
                                  : nextParentIds[0] ?? "",
                              };
                            });
                          }}
                        />
                      </div>
                    </fieldset>
                  ) : null}

                  <div className="player-actions">
                    <button
                      className="ui-pill ui-pill-button ui-pill--accent"
                      type="submit"
                      disabled={updateManagedPlayerMutation.isPending}
                    >
                      {updateManagedPlayerMutation.isPending ? "Spremanje..." : "Spremi igrača"}
                    </button>
                    <button
                      className="ui-pill ui-pill-button ui-pill--panel"
                      type="button"
                      onClick={() =>
                        setManagedPlayerForm(
                          managedPlayer
                            ? createManagedPlayerForm(managedPlayer)
                            : emptyManagedPlayerForm,
                        )
                      }
                    >
                      Resetiraj obrazac
                    </button>
                    <button
                      className="ui-pill ui-pill-button ui-pill--outline"
                      type="button"
                      onClick={() => setManagedPlayerId(null)}
                    >
                      Zatvori
                    </button>
                  </div>
                </form>
              </section>
            ) : (
              <section className="player-widget text-sm text-muted">
                Igrač se učitava.
              </section>
            )}
          </EntityDrawer>
        </>
      )}
    </section>
  );
}

function createFormFromCategory(category: CategoryRecord): CategoryFormState {
  return {
    name: category.name,
    ageRule: category.startDateOfBirth ? "YOUTH" : category.endDateOfBirth ? "VETERAN" : "SENIOR",
    startDateOfBirth: category.startDateOfBirth ? toDateInputValue(category.startDateOfBirth) : "",
    endDateOfBirth: category.endDateOfBirth ? toDateInputValue(category.endDateOfBirth) : "",
    coachIds: category.coaches.map((assignment) => assignment.coachId),
    logoFile: null,
    removeLogo: false,
    audience: category.audience,
    monthlyPrice: centsToEuroInput(category.monthlyPriceCents),
    membershipFreeUntil: category.membershipFreeUntil ?? "",
    pricePerPractice: centsToEuroInput(category.pricePerPracticeCents),
    signupCloseDaysBefore:
      category.signupCloseDaysBefore === null ? "" : String(category.signupCloseDaysBefore),
    signupCloseTime: category.signupCloseTime ?? "",
    programSlots: category.programSlots.map(({ dayOfWeek, startTime, endTime }) => ({
      dayOfWeek,
      startTime,
      endTime,
    })),
  };
}

function getYearBoundaryDate(value: string, boundary: "start" | "end") {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value);

  if (!match) {
    return "";
  }

  return boundary === "start" ? `${match[1]}-01-01` : `${match[1]}-12-31`;
}

function buildCategoryFormData(form: CategoryFormState, includeProgramSettings: boolean) {
  const formData = new FormData();
  const hasMembershipFee = !includeProgramSettings || form.audience === "MEMBERS";

  formData.append("monthlyPrice", hasMembershipFee ? form.monthlyPrice : "");
  formData.append("membershipFreeUntil", hasMembershipFee ? form.membershipFreeUntil : "");

  if (includeProgramSettings) {
    formData.append("audience", form.audience);
    formData.append("pricePerPractice", form.pricePerPractice);
    formData.append("signupCloseDaysBefore", form.signupCloseDaysBefore);
    formData.append("signupCloseTime", form.signupCloseDaysBefore ? form.signupCloseTime : "");
    formData.append("programSlots", JSON.stringify(form.programSlots));
  }

  formData.append("name", form.name);
  formData.append("startDateOfBirth", form.ageRule === "YOUTH" ? form.startDateOfBirth : "");
  formData.append("endDateOfBirth", form.ageRule === "VETERAN" ? form.endDateOfBirth : "");
  formData.append("coachIds", JSON.stringify(form.coachIds));

  if (form.logoFile) {
    formData.append("logo", form.logoFile);
  }

  formData.append("removeLogo", String(form.removeLogo));

  return formData;
}

function ensureCategoryFormIsValid(form: CategoryFormState) {
  if (!form.name.trim()) {
    throw new Error("Naziv kategorije je obavezan.");
  }

  if (form.ageRule === "YOUTH" && !form.startDateOfBirth) {
    throw new Error("Odaberite početno godište za mlađu kategoriju.");
  }

  if (form.ageRule === "VETERAN" && !form.endDateOfBirth) {
    throw new Error("Odaberite završno godište za veteransku kategoriju.");
  }
}

/** Croatian plural: 1 prijava, 2-4 prijave, 5+ prijava (21 prijava, 22 prijave...). */
function formatRegistrationCount(count: number) {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  const word =
    lastDigit === 1 && lastTwoDigits !== 11
      ? "prijava"
      : lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)
        ? "prijave"
        : "prijava";
  return `${count} ${word}`;
}

function formatEuro(cents: number | null) {
  return cents === null
    ? "—"
    : new Intl.NumberFormat("hr-HR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function addOneHour(time: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return `${String(Math.min(hours + 1, 23)).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** "Subota, 17.10.2026." for a YYYY-MM-DD practice day. */
function formatSessionDay(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("hr-HR", { weekday: "long", timeZone: "UTC" }).format(date);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${formatNumericDate(`${isoDate}T12:00:00Z`)}`;
}

/** "u petak, 16.10. u 22:00" in club time. */
function formatDateTimeHr(isoDateTime: string) {
  const parts = new Intl.DateTimeFormat("hr-HR", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Zagreb",
  }).formatToParts(new Date(isoDateTime));
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";

  return `u ${read("weekday")}, ${read("day")}.${read("month")}. u ${read("hour")}:${read("minute")}`;
}

/** Signups of one practice day of a program for non-members, grouped by slot. */
function ProgramRegistrationsList({
  registrations,
  isLoading,
  isError,
  deletingId,
  onDelete,
}: {
  registrations: ProgramRegistrationRecord[];
  isLoading: boolean;
  isError: boolean;
  deletingId: string | null;
  onDelete: (registration: ProgramRegistrationRecord) => void;
}) {
  if (isLoading) {
    return <div className="category-widget-state">Učitavanje prijava...</div>;
  }

  if (isError) {
    return <div className="category-widget-state text-signal">Prijave trenutno nije moguće učitati.</div>;
  }

  if (registrations.length === 0) {
    return <div className="category-widget-state">Za ovaj trening još nema prijava.</div>;
  }

  const slots = [
    ...new Set(registrations.map((registration) => `${registration.startTime}–${registration.endTime}`)),
  ];

  return (
    <div className="category-registration-days">
      <section className="category-registration-day">
        {slots.map((slot) => {
          const slotRegistrations = registrations.filter(
            (registration) => `${registration.startTime}–${registration.endTime}` === slot,
          );

          return (
            <div className="category-registration-slot" key={slot}>
              <p className="category-registration-slot-title">
                {slot} · {slotRegistrations.length}
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
                      <th className="px-3 py-2">Dijete</th>
                      <th className="px-3 py-2">Roditelj</th>
                      <th className="px-3 py-2">Kontakt</th>
                      <th className="px-3 py-2">Poziv na broj</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {slotRegistrations.map((registration) => (
                      <tr className="border-t border-line align-top" key={registration.id}>
                        <td className="px-3 py-2">
                          <span className="block font-bold">
                            {registration.childFirstName} {registration.childLastName}
                          </span>
                          <span className="text-muted">{formatNumericDate(registration.childDateOfBirth)}</span>
                        </td>
                        <td className="px-3 py-2">
                          {registration.parentFirstName} {registration.parentLastName}
                        </td>
                        <td className="px-3 py-2">
                          <a className="block" href={`tel:${registration.parentPhone}`}>
                            {registration.parentPhone}
                          </a>
                          <a className="block break-all text-muted" href={`mailto:${registration.parentEmail}`}>
                            {registration.parentEmail}
                          </a>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">{registration.paymentReference}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            className="ui-pill ui-pill-button ui-pill--outline"
                            type="button"
                            disabled={deletingId !== null}
                            onClick={() => onDelete(registration)}
                          >
                            {deletingId === registration.id ? "Brisanje..." : "Obriši"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function formatCategoryAgeRule(category: Pick<CategoryRecord, "startDateOfBirth" | "endDateOfBirth">) {
  if (category.startDateOfBirth) {
    return `od ${formatDate(category.startDateOfBirth)}`;
  }

  if (category.endDateOfBirth) {
    return `do ${formatDate(category.endDateOfBirth)}`;
  }

  return "bez ograničenja";
}

function createManagedPlayerForm(player: PlayerRecord): ManagedPlayerFormState {
  return {
    firstName: player.user.firstName,
    lastName: player.user.lastName,
    email: player.user.email ?? "",
    phone: player.user.phone ?? "",
    dateOfBirth: toDateInputValue(player.dateOfBirth),
    oib: player.oib,
    address: player.address ?? "",
    gdprConsent: player.gdprConsent,
    membershipExpiresAt: player.membershipExpiresAt
      ? toDateInputValue(player.membershipExpiresAt)
      : "",
    membershipPrice: centsToEuroInput(player.membershipPriceCents),
    categoryIds: player.categories.map((assignment) => assignment.categoryId),
    parentIds: player.parents.map((assignment) => assignment.parentId),
    primaryParentId:
      player.parents.find((assignment) => assignment.isPrimaryContact)?.parentId ?? "",
    profileFile: null,
    removeProfileImage: false,
  };
}

function buildManagedPlayerPayload(form: ManagedPlayerFormState) {
  const formData = new FormData();
  formData.append("firstName", form.firstName);
  formData.append("lastName", form.lastName);
  formData.append("email", form.email);
  formData.append("phone", form.phone);
  formData.append("dateOfBirth", form.dateOfBirth);
  formData.append("oib", form.oib);
  formData.append("address", form.address);
  formData.append("gdprConsent", String(form.gdprConsent));
  formData.append("membershipExpiresAt", form.membershipExpiresAt);
  formData.append("membershipPrice", form.membershipPrice);
  formData.append("categoryIds", JSON.stringify(form.categoryIds));
  formData.append("parentIds", JSON.stringify(form.parentIds));
  formData.append("primaryParentId", form.primaryParentId);
  formData.append("removeProfileImage", String(form.removeProfileImage));

  if (form.profileFile) {
    formData.append("profileImage", form.profileFile);
  }

  return formData;
}

function ensureManagedPlayerHasParent(form: ManagedPlayerFormState) {
  if (form.parentIds.length === 0 && !form.email.trim()) {
    throw new Error("Igrač mora imati povezanog barem jednog roditelja.");
  }
}

function getMutationErrorMessage(error: unknown, fallback: string) {
  const responseMessage = (error as AxiosError<{ message?: string }>).response?.data?.message;

  if (responseMessage) {
    return responseMessage;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

async function fetchProgramRegistrations(categoryId: string, sessionDate: string) {
  const response = await api.get<ProgramRegistrationRecord[]>("/program-registrations", {
    params: { categoryId, sessionDate },
  });
  return response.data;
}

async function fetchAllCategoryPlayers(categoryId: string) {
  const assignments: CategoryPlayerAssignment[] = [];
  let page = 1;

  while (true) {
    const response = await api.get<PaginatedResponse<CategoryPlayerAssignment>>(
      `/categories/${categoryId}/players`,
      {
        params: { page, pageSize: 50 },
      },
    );
    const pageData = response.data;
    assignments.push(...pageData.items);

    if (page >= pageData.totalPages) {
      return assignments;
    }

    page += 1;
  }
}

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function formatNumericDate(dateIso: string) {
  const date = new Date(dateIso);
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const year = date.getFullYear();

  return `${day}.${month}.${year}.`;
}

function MultiSelectPanel({
  title,
  items,
  selectedIds,
  onToggle,
}: {
  title: string;
  items: Array<{ id: string; label: string; meta?: string }>;
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="player-selector-panel">
      <div className="player-selector-panel-header">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">{title}</p>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {items.map((item) => {
          const isChecked = selectedIds.includes(item.id);

          return (
            <label
              key={item.id}
              className={`flex cursor-pointer items-start gap-3 rounded-[18px] border-2 border-line px-3 py-3 ${
                isChecked ? "bg-panel" : "bg-white"
              }`}
            >
              <input
                className="mt-1 h-4 w-4 accent-accent"
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggle(item.id)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold uppercase">{item.label}</span>
                {item.meta ? (
                  <span className="mt-1 block truncate text-[11px] uppercase tracking-[0.2em] text-muted">
                    {item.meta}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
