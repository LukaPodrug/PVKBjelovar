import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { type ChangeEvent, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { api } from "../core/api";
import { formatDate, toDateInputValue } from "../core/date";
import type {
  CategoryPlayerAssignment,
  CategoryRecord,
  CoachRecord,
  PaginatedResponse,
  ParentRecord,
  PlayerRecord,
} from "../core/types";
import { EntityDrawer } from "../layout/entity-drawer";
import { DatePicker } from "../ui/date-picker";
import { FeedbackToast } from "../ui/feedback-toast";
import { PaginationControls } from "../ui/pagination-controls";
import { SearchMultiSelectPanel } from "../ui/search-multi-select-panel";

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
}

interface StartNewSeasonResult {
  categoriesUpdated: number;
  playersReassigned: number;
}

interface ManagedPlayerFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  oib: string;
  gdprConsent: boolean;
  membershipExpiresAt: string;
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
};

const emptyManagedPlayerForm: ManagedPlayerFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  oib: "",
  gdprConsent: false,
  membershipExpiresAt: "",
  categoryIds: [],
  parentIds: [],
  primaryParentId: "",
  profileFile: null,
  removeProfileImage: false,
};

const optionPageSize = 100;
const managementPageSize = 25;
const categoryPlayersPageSize = 10;

export function CategoriesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const queryClient = useQueryClient();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<CategoryFormState>(emptyCategoryForm);
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

  const categoriesQuery = useQuery({
    queryKey: ["categories", "management", categoriesPage],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CategoryRecord>>("/categories", {
        params: { page: categoriesPage, pageSize: managementPageSize },
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

  const categoriesPageData = categoriesQuery.data;
  const categories = categoriesPageData?.items ?? [];
  const categoryOptions = categoryOptionsQuery.data ?? [];
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

  const openCreateDrawer = () => {
    setFeedback(null);
    setFormMode("create");
    setSelectedCategoryId(null);
    setManagedPlayerId(null);
    setCategoryPlayersPage(1);
    setForm(emptyCategoryForm);
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

      const response = await api.post<CategoryRecord>("/categories", buildCategoryFormData(form), {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return response.data;
    },
    onSuccess: (createdCategory) => {
      setFeedback({
        tone: "success",
        message: `Kategorija ${createdCategory.name} uspješno je kreirana.`,
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
        buildCategoryFormData(form),
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
        message: `Kategorija ${updatedCategory.name} uspješno je ažurirana.`,
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
      const deletedCategoryName = selectedCategory?.name ?? "Kategorija";

      setFeedback({
        tone: "success",
        message: `Kategorija ${deletedCategoryName} uspješno je obrisana.`,
      });
      setSelectedCategoryId(null);
      setFormMode("create");
      setForm(emptyCategoryForm);
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
        message: `Nova sezona je pokrenuta. Ažurirano kategorija: ${result.categoriesUpdated}. Premješteno igrača: ${result.playersReassigned}.`,
      });
      setSelectedCategoryId(null);
      setFormMode("create");
      setForm(emptyCategoryForm);
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
          Kategorije trenutno nije moguće učitati.
        </div>
      ) : (
        <>
          <section className="border-2 border-line bg-surface">
            <div className="flex flex-col gap-4 border-b-2 border-line bg-panel px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  Popis kategorija
                </p>
                <h3 className="mt-2 text-xl font-bold uppercase">Trenutne skupine</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {isAdmin ? (
                  <button
                    className="ui-pill ui-pill-button ui-pill--panel"
                    type="button"
                    disabled={categoriesTotal === 0 || startNewSeasonMutation.isPending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Pokrenuti novu sezonu? Svim kategorijama će se pomaknuti godište za jednu godinu, a svi igrači će biti ponovno raspoređeni prema datumu rođenja.",
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
                  Nova kategorija
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead className="bg-bg">
                  <tr className="border-b-2 border-line text-center text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    <th className="px-4 py-4">Kategorija</th>
                    <th className="px-4 py-4">Godište</th>
                    <th className="px-4 py-4">Treneri</th>
                    <th className="px-4 py-4">Igrači</th>
                  </tr>
                </thead>
                <tbody>
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
                        </td>
                        <td className="px-4 py-4 align-middle text-center text-sm font-medium">
                          {formatCategoryAgeRule(category)}
                        </td>
                        <td className="px-4 py-4 align-middle text-center text-sm">{category.coaches.length}</td>
                        <td className="px-4 py-4 align-middle text-center text-sm">{category.playerCount}</td>
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
            eyebrow={formMode === "create" ? "Nova kategorija" : "Uredi kategoriju"}
            title={
              formMode === "create"
                ? "Postavljanje nove kategorije"
                : selectedCategory?.name ?? "Uređivanje kategorije"
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
                      Naziv kategorije
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
                      placeholder="U12"
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
                        setForm((current) => ({
                          ...current,
                          ageRule: event.target.value as CategoryFormState["ageRule"],
                          startDateOfBirth:
                            event.target.value === "VETERAN" ? current.startDateOfBirth : "",
                          endDateOfBirth:
                            event.target.value === "YOUTH" ? current.endDateOfBirth : "",
                        }))
                      }
                    >
                      <option value="YOUTH">Mlađa kategorija</option>
                      <option value="SENIOR">Seniori bez dobnog ograničenja</option>
                      <option value="VETERAN">Veterani s početnim godištem</option>
                    </select>
                  </label>

                  {form.ageRule === "YOUTH" ? (
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Godište do
                      </span>
                      <DatePicker
                        className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                        value={form.endDateOfBirth}
                        onChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            endDateOfBirth: value,
                          }))
                        }
                        required
                      />
                    </label>
                  ) : null}

                  {form.ageRule === "VETERAN" ? (
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Godište od
                      </span>
                      <DatePicker
                        className="w-full rounded-[18px] border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                        value={form.startDateOfBirth}
                        onChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            startDateOfBirth: value,
                          }))
                        }
                        required
                      />
                    </label>
                  ) : null}
                  </div>
                </fieldset>

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

                {selectedCategory && formMode === "edit" ? (
                  <fieldset className="category-widget category-widget--wide category-players-widget">
                    <legend className="category-widget-title">Igrači u kategoriji</legend>

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
                        U ovoj kategoriji trenutno nema upisanih igrača.
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
                        : "Kreiraj kategoriju"
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

                      setForm(emptyCategoryForm);
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
                    {deleteMutation.isPending ? "Brisanje..." : "Obriši kategoriju"}
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
                          items={categoryOptions.map((category) => ({
                            id: category.id,
                            label: category.name,
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
    ageRule: category.startDateOfBirth ? "VETERAN" : category.endDateOfBirth ? "YOUTH" : "SENIOR",
    startDateOfBirth: category.startDateOfBirth ? toDateInputValue(category.startDateOfBirth) : "",
    endDateOfBirth: category.endDateOfBirth ? toDateInputValue(category.endDateOfBirth) : "",
    coachIds: category.coaches.map((assignment) => assignment.coachId),
    logoFile: null,
    removeLogo: false,
  };
}

function buildCategoryFormData(form: CategoryFormState) {
  const formData = new FormData();
  formData.append("name", form.name);
  formData.append("startDateOfBirth", form.ageRule === "VETERAN" ? form.startDateOfBirth : "");
  formData.append("endDateOfBirth", form.ageRule === "YOUTH" ? form.endDateOfBirth : "");
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

  if (form.ageRule === "YOUTH" && !form.endDateOfBirth) {
    throw new Error("Odaberite završno godište za mlađu kategoriju.");
  }

  if (form.ageRule === "VETERAN" && !form.startDateOfBirth) {
    throw new Error("Odaberite početno godište za veteransku kategoriju.");
  }
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
    gdprConsent: player.gdprConsent,
    membershipExpiresAt: player.membershipExpiresAt
      ? toDateInputValue(player.membershipExpiresAt)
      : "",
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
  formData.append("gdprConsent", String(form.gdprConsent));
  formData.append("membershipExpiresAt", form.membershipExpiresAt);
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
