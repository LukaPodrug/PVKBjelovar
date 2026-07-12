import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { type ChangeEvent, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { api } from "../core/api";
import { formatDate, toDateInputValue } from "../core/date";
import type {
  AccountStatus,
  CategoryRecord,
  CoachRecord,
  PaginatedResponse,
  ParentRecord,
  PlayerRecord,
} from "../core/types";
import { EntityDrawer } from "../layout/entity-drawer";
import { PaginationControls } from "../ui/pagination-controls";
import { SearchMultiSelectPanel } from "../ui/search-multi-select-panel";

interface FeedbackState {
  tone: "success" | "error";
  message: string;
}

interface CategoryFormState {
  name: string;
  endDateOfBirth: string;
  coachIds: string[];
  logoFile: File | null;
}

interface StartNewSeasonResult {
  categoriesUpdated: number;
  playersReassigned: number;
}

interface ManagedPlayerFormState {
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  oib: string;
  gdprConsent: boolean;
  membershipExpiresAt: string;
  categoryIds: string[];
  parentIds: string[];
  primaryParentId: string;
}

const emptyCategoryForm: CategoryFormState = {
  name: "",
  endDateOfBirth: "",
  coachIds: [],
  logoFile: null,
};

const emptyManagedPlayerForm: ManagedPlayerFormState = {
  firstName: "",
  lastName: "",
  phone: "",
  dateOfBirth: "",
  oib: "",
  gdprConsent: false,
  membershipExpiresAt: "",
  categoryIds: [],
  parentIds: [],
  primaryParentId: "",
};

const optionPageSize = 100;
const managementPageSize = 25;

export function CategoriesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const queryClient = useQueryClient();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<CategoryFormState>(emptyCategoryForm);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [managedPlayerId, setManagedPlayerId] = useState<string | null>(null);
  const [managedPlayerForm, setManagedPlayerForm] = useState<ManagedPlayerFormState>(
    emptyManagedPlayerForm,
  );
  const [categoriesPage, setCategoriesPage] = useState(1);

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
  const managedPlayer =
    selectedCategory?.players.find((assignment) => assignment.playerId === managedPlayerId)
      ?.player ?? null;

  useEffect(() => {
    if (categoriesPageData && categoriesPage > categoriesPageData.totalPages) {
      setCategoriesPage(categoriesPageData.totalPages);
    }
  }, [categoriesPage, categoriesPageData]);

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

  const openCreateDrawer = () => {
    setFeedback(null);
    setFormMode("create");
    setSelectedCategoryId(null);
    setForm(emptyCategoryForm);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (category: CategoryRecord) => {
    setFeedback(null);
    setFormMode("edit");
    setSelectedCategoryId(category.id);
    setForm(createFormFromCategory(category));
    setIsDrawerOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
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
        message: error.response?.data?.message ?? "Kreiranje kategorije nije uspjelo.",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCategory) {
        throw new Error("Nijedna kategorija nije odabrana.");
      }

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
        message: error.response?.data?.message ?? "Ažuriranje kategorije nije uspjelo.",
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

      const response = await api.patch<PlayerRecord>(
        `/players/${managedPlayer.id}`,
        buildManagedPlayerPayload(managedPlayerForm),
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
        message: error.response?.data?.message ?? "Ažuriranje igrača nije uspjelo.",
      });
    },
  });

  const activeLogoUrl = logoPreviewUrl ?? selectedCategory?.logoUrl ?? null;
  const openPlayerFromCategory = (playerId: string) => {
    setManagedPlayerId(playerId);
  };

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
                  <tr className="border-b-2 border-line text-left text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    <th className="px-4 py-4">Kategorija</th>
                    <th className="px-4 py-4">Godište do</th>
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
                        <td className="px-4 py-4 align-top">
                          <div className="flex items-center gap-3">
                            {category.logoUrl ? (
                              <img
                                className="h-12 w-12 border-2 border-line object-cover"
                                src={category.logoUrl}
                                alt={category.name}
                              />
                            ) : (
                              <div className="flex h-12 w-12 items-center justify-center border-2 border-line bg-accent text-xs font-bold text-surface">
                                {category.name.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-bold uppercase">{category.name}</p>
                              <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted">
                                {category.logoUrl ? "Logo postavljen" : "Bez loga"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm font-medium">
                          {formatDate(category.endDateOfBirth)}
                        </td>
                        <td className="px-4 py-4 align-top text-sm">{category.coaches.length}</td>
                        <td className="px-4 py-4 align-top text-sm">{category.players.length}</td>
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
            <section className="border-2 border-line bg-surface">
              <div className="border-b-2 border-line bg-panel px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  {formMode === "create" ? "Nova kategorija" : "Uredi kategoriju"}
                </p>
                <h3 className="mt-2 text-xl font-bold uppercase">
                  {formMode === "create"
                    ? "Postavljanje nove kategorije"
                    : selectedCategory?.name ?? "Uređivanje kategorije"}
                </h3>
              </div>

              <form
                className="space-y-5 p-4"
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
                  <div className="flex flex-wrap gap-2">
                    <span className="ui-pill ui-pill--panel">
                      Treneri <strong>{selectedCategory.coaches.length}</strong>
                    </span>
                    <span className="ui-pill ui-pill--panel">
                      Igrači <strong>{selectedCategory.players.length}</strong>
                    </span>
                    <span className="ui-pill ui-pill--outline">
                      Godište do <strong>{formatDate(selectedCategory.endDateOfBirth)}</strong>
                    </span>
                  </div>
                ) : null}

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
                      Godište do
                    </span>
                    <input
                      className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                      type="date"
                      value={form.endDateOfBirth}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          endDateOfBirth: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                </div>

                <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                      Pregled loga
                    </p>
                    {activeLogoUrl ? (
                      <img
                        className="h-44 w-full border-2 border-line object-cover"
                        src={activeLogoUrl}
                        alt={form.name || "Pregled loga kategorije"}
                      />
                    ) : (
                      <div className="flex h-44 items-center justify-center border-2 border-dashed border-line bg-bg px-4 text-center text-xs font-bold uppercase tracking-[0.2em] text-muted">
                        Učitaj logo
                      </div>
                    )}
                    <input
                      className="block w-full border-2 border-line bg-white px-3 py-3 text-sm"
                      type="file"
                      accept="image/*"
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        const nextFile = event.target.files?.[0] ?? null;
                        setForm((current) => ({
                          ...current,
                          logoFile: nextFile,
                        }));
                      }}
                    />
                  </div>

                  <div className="border-2 border-line bg-white">
                    <div className="border-b-2 border-line bg-bg px-4 py-3">
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
                            className={`flex cursor-pointer items-start gap-3 border-2 border-line px-3 py-3 ${
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

                {selectedCategory && formMode === "edit" ? (
                  <div className="border-2 border-line bg-white">
                    <div className="border-b-2 border-line bg-bg px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Igrači u kategoriji
                      </p>
                    </div>

                    {selectedCategory.players.length === 0 ? (
                      <div className="px-4 py-5 text-sm text-muted">
                        U ovoj kategoriji trenutno nema upisanih igrača.
                      </div>
                    ) : (
                      <div className="grid gap-3 p-4">
                        {selectedCategory.players.map((assignment) => (
                          <button
                            key={assignment.playerId}
                            className="flex flex-col gap-3 border-2 border-line bg-surface px-4 py-4 text-left sm:flex-row sm:items-center sm:justify-between"
                            type="button"
                            onClick={() => openPlayerFromCategory(assignment.playerId)}
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-bold uppercase text-ink">
                                {assignment.player.user.firstName} {assignment.player.user.lastName}
                              </span>
                              <span className="mt-1 block text-[11px] uppercase tracking-[0.2em] text-muted">
                                Rođen {formatDate(assignment.player.dateOfBirth)}
                              </span>
                            </span>

                            <span className="flex flex-wrap gap-2">
                              <PlayerStatusChip status={assignment.player.user.accountStatus} />
                              <span className="ui-pill ui-pill--outline">
                                Članstvo{" "}
                                <strong>
                                  {assignment.player.membershipExpiresAt
                                    ? formatDate(assignment.player.membershipExpiresAt)
                                    : "nije postavljeno"}
                                </strong>
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-3">
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
              <section className="border-2 border-line bg-surface">
                <div className="border-b-2 border-line bg-panel px-4 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    Uredi igrača
                  </p>
                  <h3 className="mt-2 text-xl font-bold uppercase">
                    {managedPlayer.user.firstName} {managedPlayer.user.lastName}
                  </h3>
                </div>

                <form
                  className="space-y-5 p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setFeedback(null);
                    updateManagedPlayerMutation.mutate();
                  }}
                >
                  <div className="flex flex-wrap gap-2">
                    <PlayerStatusChip status={managedPlayer.user.accountStatus} />
                    <span
                      className={`ui-pill ${
                        managedPlayerForm.gdprConsent ? "ui-pill--success" : "ui-pill--warning"
                      }`}
                    >
                      {managedPlayerForm.gdprConsent ? "GDPR potvrđen" : "GDPR nedostaje"}
                    </span>
                    <span className="ui-pill ui-pill--outline">
                      Članstvo{" "}
                      <strong>
                        {managedPlayer.membershipExpiresAt
                          ? formatDate(managedPlayer.membershipExpiresAt)
                          : "nije postavljeno"}
                      </strong>
                    </span>
                  </div>

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
                      <input
                        className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                        type="date"
                        value={managedPlayerForm.dateOfBirth}
                        onChange={(event) =>
                          setManagedPlayerForm((current) => ({
                            ...current,
                            dateOfBirth: event.target.value,
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
                        Članstvo vrijedi do
                      </span>
                      <input
                        className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                        type="date"
                        value={managedPlayerForm.membershipExpiresAt}
                        onChange={(event) =>
                          setManagedPlayerForm((current) => ({
                            ...current,
                            membershipExpiresAt: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <label className="flex items-center gap-3 border-2 border-line bg-white px-4 py-4">
                    <input
                      className="h-4 w-4 accent-accent"
                      type="checkbox"
                      checked={managedPlayerForm.gdprConsent}
                      onChange={(event) =>
                        setManagedPlayerForm((current) => ({
                          ...current,
                          gdprConsent: event.target.checked,
                        }))
                      }
                    />
                    <span className="text-sm font-bold uppercase">GDPR suglasnost potvrđena</span>
                  </label>

                  <div className="border-2 border-line bg-white">
                    <div className="border-b-2 border-line bg-bg px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Dodjela kategorija
                      </p>
                    </div>
                    <div className="grid gap-3 p-4 sm:grid-cols-2">
                      {categoryOptions.map((category) => {
                        const isChecked = managedPlayerForm.categoryIds.includes(category.id);

                        return (
                          <label
                            key={category.id}
                            className={`flex cursor-pointer items-start gap-3 border-2 border-line px-3 py-3 ${
                              isChecked ? "bg-panel" : "bg-white"
                            }`}
                          >
                            <input
                              className="mt-1 h-4 w-4 accent-accent"
                              type="checkbox"
                              checked={isChecked}
                              onChange={() =>
                                setManagedPlayerForm((current) => ({
                                  ...current,
                                  categoryIds: isChecked
                                    ? current.categoryIds.filter((categoryId) => categoryId !== category.id)
                                    : [...current.categoryIds, category.id],
                                }))
                              }
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-bold uppercase">
                                {category.name}
                              </span>
                              <span className="mt-1 block truncate text-[11px] uppercase tracking-[0.2em] text-muted">
                                Godište do {formatDate(category.endDateOfBirth)}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {isAdmin ? (
                    <div className="space-y-5">
                      <SearchMultiSelectPanel
                        title="Povezani roditelji"
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

                      {managedPlayerForm.parentIds.length > 0 ? (
                        <div className="border-2 border-line bg-white">
                          <div className="border-b-2 border-line bg-bg px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                              Primarni roditelj za kontakt
                            </p>
                          </div>
                          <div className="space-y-3 p-4">
                            {managedPlayerForm.parentIds.map((parentId) => {
                              const parent = parents.find((entry) => entry.id === parentId);

                              if (!parent) {
                                return null;
                              }

                              return (
                                <label
                                  key={parentId}
                                  className={`flex cursor-pointer items-start gap-3 border-2 border-line px-3 py-3 ${
                                    managedPlayerForm.primaryParentId === parentId
                                      ? "bg-panel"
                                      : "bg-white"
                                  }`}
                                >
                                  <input
                                    className="mt-1 h-4 w-4 accent-accent"
                                    type="radio"
                                    name="managed-primary-parent"
                                    checked={managedPlayerForm.primaryParentId === parentId}
                                    onChange={() =>
                                      setManagedPlayerForm((current) => ({
                                        ...current,
                                        primaryParentId: parentId,
                                      }))
                                    }
                                  />
                                  <span>
                                    <span className="block text-sm font-bold uppercase">
                                      {parent.user.firstName} {parent.user.lastName}
                                    </span>
                                    <span className="mt-1 block text-[11px] uppercase tracking-[0.2em] text-muted">
                                      {parent.user.email ?? "Bez e-pošte"}
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
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
                          managedPlayer ? createManagedPlayerForm(managedPlayer) : emptyManagedPlayerForm,
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
              <section className="border-2 border-line bg-surface p-6 text-sm text-muted">
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
    endDateOfBirth: toDateInputValue(category.endDateOfBirth),
    coachIds: category.coaches.map((assignment) => assignment.coachId),
    logoFile: null,
  };
}

function buildCategoryFormData(form: CategoryFormState) {
  const formData = new FormData();
  formData.append("name", form.name);
  formData.append("endDateOfBirth", form.endDateOfBirth);
  formData.append("coachIds", JSON.stringify(form.coachIds));

  if (form.logoFile) {
    formData.append("logo", form.logoFile);
  }

  return formData;
}

function createManagedPlayerForm(player: PlayerRecord): ManagedPlayerFormState {
  return {
    firstName: player.user.firstName,
    lastName: player.user.lastName,
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
  };
}

function buildManagedPlayerPayload(form: ManagedPlayerFormState) {
  return {
    firstName: form.firstName,
    lastName: form.lastName,
    phone: form.phone,
    dateOfBirth: form.dateOfBirth,
    oib: form.oib,
    gdprConsent: form.gdprConsent,
    membershipExpiresAt: form.membershipExpiresAt,
    categoryIds: form.categoryIds,
    parentIds: form.parentIds,
    primaryParentId: form.primaryParentId,
  };
}

function PlayerStatusChip({ status }: { status: AccountStatus }) {
  const tone =
    status === "ACTIVE"
      ? "ui-pill--success"
      : status === "SUSPENDED"
        ? "ui-pill--signal"
        : "ui-pill--warning";

  return (
    <span className={`ui-pill ${tone}`}>
      {formatAccountStatus(status)}
    </span>
  );
}

function formatAccountStatus(status: AccountStatus) {
  if (status === "ACTIVE") {
    return "Aktivan";
  }

  if (status === "SUSPENDED") {
    return "Suspendiran";
  }

  return "Na čekanju";
}
