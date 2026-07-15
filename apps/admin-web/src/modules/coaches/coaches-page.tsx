import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { type ChangeEvent, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { api } from "../core/api";
import type {
  AccountStatus,
  CategoryRecord,
  CoachRecord,
  CredentialResetResult,
  PaginatedResponse,
} from "../core/types";
import { EntityDrawer } from "../layout/entity-drawer";
import { CategoryFilterDropdown } from "../ui/category-filter-chips";
import { FeedbackToast } from "../ui/feedback-toast";
import { PaginationControls } from "../ui/pagination-controls";
import { TableLoadingRows } from "../ui/table-loading-rows";
import { useDebouncedValue } from "../ui/use-debounced-value";

interface FeedbackState {
  tone: "success" | "error";
  message: string;
}

interface CoachFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  isCategoryCoach: boolean;
  isConditioningCoach: boolean;
  categoryIds: string[];
  profileFile: File | null;
  removeProfileImage: boolean;
}

interface CoachCreateResult {
  coach: CoachRecord;
  emailSent: boolean;
  developmentCredentials?: {
    login: string;
    password: string;
    recipients: string[];
  };
}

const emptyCoachForm: CoachFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  isCategoryCoach: true,
  isConditioningCoach: false,
  categoryIds: [],
  profileFile: null,
  removeProfileImage: false,
};

const managementPageSize = 25;
const conditioningCoachFilterId = "__conditioning-coach__";

export function CoachesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const queryClient = useQueryClient();
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<CoachFormState>(emptyCoachForm);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [profilePreviewUrl, setProfilePreviewUrl] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [coachesPage, setCoachesPage] = useState(1);
  const [coachSearch, setCoachSearch] = useState("");
  const [selectedCategoryFilterIds, setSelectedCategoryFilterIds] = useState<string[]>([]);
  const debouncedCoachSearch = useDebouncedValue(coachSearch.trim());
  const selectedRealCategoryFilterIds = selectedCategoryFilterIds.filter(
    (categoryId) => categoryId !== conditioningCoachFilterId,
  );
  const isConditioningCoachFilterSelected =
    selectedCategoryFilterIds.includes(conditioningCoachFilterId);

  const coachesQuery = useQuery({
    queryKey: ["coaches", "management", coachesPage, debouncedCoachSearch, selectedCategoryFilterIds],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CoachRecord>>("/coaches", {
        params: {
          page: coachesPage,
          pageSize: managementPageSize,
          search: debouncedCoachSearch || undefined,
          categoryIds:
            selectedRealCategoryFilterIds.length > 0
              ? selectedRealCategoryFilterIds.join(",")
              : undefined,
          isConditioningCoach: isConditioningCoachFilterSelected ? "true" : undefined,
        },
      });
      return response.data;
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", "coach-options"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CategoryRecord>>("/categories", {
        params: { page: 1, pageSize: 100 },
      });
      return response.data.items;
    },
  });

  const coachesPageData = coachesQuery.data;
  const coaches = coachesPageData?.items ?? [];
  const categories = categoriesQuery.data ?? [];
  const selectedCoach = coaches.find((coach) => coach.id === selectedCoachId) ?? null;

  useEffect(() => {
    if (!selectedCoachId && coaches.length > 0 && formMode === "edit") {
      const nextCoach = coaches[0];
      setSelectedCoachId(nextCoach.id);
      setForm(createFormFromCoach(nextCoach));
    }
  }, [coaches, formMode, selectedCoachId]);

  useEffect(() => {
    if (!form.profileFile) {
      setProfilePreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(form.profileFile);
    setProfilePreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [form.profileFile]);

  const openCreateDrawer = () => {
    setFeedback(null);
    setFormMode("create");
    setSelectedCoachId(null);
    setForm(emptyCoachForm);
    setIsDrawerOpen(true);
  };

  const toggleCategoryFilter = (categoryId: string) => {
    setSelectedCategoryFilterIds((current) =>
      current.includes(categoryId)
        ? current.filter((selectedCategoryId) => selectedCategoryId !== categoryId)
        : [...current, categoryId],
    );
    setCoachesPage(1);
  };

  const openEditDrawer = (coach: CoachRecord) => {
    setFeedback(null);
    setFormMode("edit");
    setSelectedCoachId(coach.id);
    setForm(createFormFromCoach(coach));
    setIsDrawerOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<CoachCreateResult>("/coaches", buildCoachFormData(form), {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return response.data;
    },
    onSuccess: (result) => {
      setFeedback({
        tone: "success",
        message: `Trener ${result.coach.user.firstName} ${result.coach.user.lastName} uspješno je kreiran. ${buildCoachCreationMessage(result)}`,
      });
      setFormMode("edit");
      setSelectedCoachId(result.coach.id);
      setForm(createFormFromCoach(result.coach));
      setIsDrawerOpen(true);
      void invalidateCoachQueries(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Kreiranje trenera nije uspjelo.",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCoach) {
        throw new Error("Nijedan trener nije odabran.");
      }

      const response = await api.patch<CoachRecord>(
        `/coaches/${selectedCoach.id}`,
        buildCoachFormData(form),
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      return response.data;
    },
    onSuccess: (updatedCoach) => {
      setFeedback({
        tone: "success",
        message: `Trener ${updatedCoach.user.firstName} ${updatedCoach.user.lastName} uspješno je ažuriran.`,
      });
      setSelectedCoachId(updatedCoach.id);
      setForm(createFormFromCoach(updatedCoach));
      setIsDrawerOpen(true);
      void invalidateCoachQueries(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Ažuriranje trenera nije uspjelo.",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCoach) {
        throw new Error("Nijedan trener nije odabran.");
      }

      await api.delete(`/coaches/${selectedCoach.id}`);
    },
    onSuccess: () => {
      const deletedName = selectedCoach
        ? `${selectedCoach.user.firstName} ${selectedCoach.user.lastName}`
        : "Trener";

      setFeedback({
        tone: "success",
        message: `Trener ${deletedName} uspješno je obrisan.`,
      });
      setSelectedCoachId(null);
      setFormMode("create");
      setForm(emptyCoachForm);
      setIsDrawerOpen(false);

      void invalidateCoachQueries(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Brisanje trenera nije uspjelo.",
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({
      userId,
      accountStatus,
    }: {
      userId: string;
      accountStatus: AccountStatus;
    }) => {
      const response = await api.patch(`/users/${userId}/status`, {
        accountStatus,
      });

      return response.data;
    },
    onSuccess: (_result, variables) => {
      setFeedback({
        tone: "success",
        message:
          variables.accountStatus === "SUSPENDED"
            ? "Račun trenera je suspendiran."
            : "Račun trenera je ponovno aktiviran.",
      });
      void invalidateCoachQueries(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Promjena statusa trenera nije uspjela.",
      });
    },
  });

  const resendCredentialsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCoach) {
        throw new Error("Nijedan trener nije odabran.");
      }

      const response = await api.post<CredentialResetResult>(
        `/coaches/${selectedCoach.id}/resend-credentials`,
      );

      return response.data;
    },
    onSuccess: (result) => {
      setFeedback({
        tone: "success",
        message: result.message,
      });
      void invalidateCoachQueries(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message:
          error.response?.data?.message ??
          "Slanje pristupnih podataka treneru nije uspjelo.",
      });
    },
  });

  const activeCoaches = coaches.filter((coach) => coach.user.accountStatus === "ACTIVE").length;
  const mustResetPasswordCount = coaches.filter((coach) => coach.user.mustChangePassword).length;
  const activeProfileUrl = form.removeProfileImage
    ? null
    : profilePreviewUrl ?? selectedCoach?.user.profileImageUrl ?? null;
  const isCoachesRefetching = coachesQuery.isFetching && !coachesQuery.isLoading;

  return (
    <section className="space-y-6">
      <FeedbackToast feedback={feedback} onClose={() => setFeedback(null)} />

      {coachesQuery.isLoading || categoriesQuery.isLoading ? (
        <div className="space-y-4">
          <div className="h-[700px] animate-pulse border-2 border-line bg-panel" />
        </div>
      ) : coachesQuery.isError || categoriesQuery.isError ? (
        <div className="border-2 border-line bg-signal px-5 py-4 text-sm font-medium text-surface">
          Trenere trenutno nije moguće učitati.
        </div>
      ) : (
        <>
          <div className="space-y-4">
            <section className="admin-table-card border-2 border-line bg-surface">
              <div className="flex flex-col gap-4 border-b-2 border-line bg-panel px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    Popis trenera
                  </p>
                  <h3 className="mt-2 text-xl font-bold uppercase">Stručni stožer</h3>
                </div>

                {isAdmin ? (
                  <button
                    className="ui-pill ui-pill-button ui-pill--accent"
                    type="button"
                    onClick={openCreateDrawer}
                  >
                    Novi trener
                  </button>
                ) : (
                  <div className="border-2 border-line bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.25em] text-muted">
                    Samo pregled
                  </div>
                )}
              </div>

              <div className="relative z-30 grid gap-4 border-b-2 border-line bg-white px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
                <label className="block min-w-0">
                  <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.25em] text-muted">
                    Pretraga
                  </span>
                  <input
                    className="h-[52px] w-full rounded-[18px] border border-line bg-surface px-4 outline-none placeholder:text-muted focus:bg-bg"
                    type="search"
                    value={coachSearch}
                    onChange={(event) => {
                      setCoachSearch(event.target.value);
                      setCoachesPage(1);
                    }}
                    placeholder="Ime i prezime"
                  />
                </label>
                <CategoryFilterDropdown
                  categories={categories}
                  extraOptions={[{ id: conditioningCoachFilterId, name: "Kondicijski trener" }]}
                  selectedIds={selectedCategoryFilterIds}
                  onToggle={toggleCategoryFilter}
                  onClear={() => {
                    setSelectedCategoryFilterIds([]);
                    setCoachesPage(1);
                  }}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead className="bg-bg">
	                    <tr className="border-b-2 border-line text-center text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
	                      <th className="px-4 py-4">Trener</th>
	                      <th className="px-4 py-4">E-pošta</th>
	                      <th className="px-4 py-4">Kategorije</th>
	                      <th className="px-4 py-4">Status</th>
	                    </tr>
                  </thead>
                  <tbody>
                    {isCoachesRefetching ? (
                      <TableLoadingRows columns={4} />
                    ) : (
                    coaches.map((coach) => {
	                      const isSelected =
	                        isDrawerOpen && selectedCoachId === coach.id && formMode === "edit";
	                      const categoryNames =
	                        coach.categories?.map((entry) => entry.category.name) ?? [];
	                      const categoryLabels = [
	                        ...categoryNames,
	                        coach.isConditioningCoach ? "Kondicijski" : null,
	                      ].filter(Boolean);

                      return (
                        <tr
                          key={coach.id}
                          className={`cursor-pointer border-b-2 border-line ${
                            isSelected ? "bg-panel" : "bg-white hover:bg-bg"
                          }`}
                          onClick={() => openEditDrawer(coach)}
                        >
	                          <td className="px-4 py-4 align-middle text-center">
	                            <p className="text-sm font-bold uppercase">
	                              {coach.user.firstName} {coach.user.lastName}
	                            </p>
	                          </td>
	                          <td className="px-4 py-4 align-middle text-center text-sm">
	                            {coach.user.email ?? "Bez e-pošte"}
	                          </td>
	                          <td className="px-4 py-4 align-middle text-center text-sm">
	                            {categoryLabels.length > 0
	                              ? categoryLabels.join(", ")
	                              : "Nije dodijeljeno"}
	                          </td>
	                          <td className="px-4 py-4 align-middle text-center">
	                            <StatusChip status={coach.user.accountStatus} />
	                          </td>
	                        </tr>
                      );
                    })
                    )}
                  </tbody>
                </table>
              </div>

              {coachesPageData ? (
                <PaginationControls
                  page={coachesPageData.page}
                  pageSize={coachesPageData.pageSize}
                  total={coachesPageData.total}
                  totalPages={coachesPageData.totalPages}
                  onPageChange={setCoachesPage}
                />
              ) : null}
            </section>

            {!isAdmin ? (
	              <section className="coach-drawer">
	                <div className="coach-drawer-hero">
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    Pristup trenera
                  </p>
                  <h3 className="mt-2 text-xl font-bold uppercase">Pregled stručnog stožera</h3>
                </div>

                <div className="space-y-4 p-4">
                  <div className="border-2 border-line bg-white px-4 py-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                      Dozvole
                    </p>
                    <p className="mt-3 text-sm leading-7 text-muted">
                      Treneri ovdje mogu pregledavati dodjele stručnog stožera, ali samo
                      administratori mogu kreirati, ažurirati, suspendirati ili brisati trenerske
                      račune.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <DetailStat label="Aktivni treneri" value={String(activeCoaches)} />
                    <DetailStat
                      label="Obvezna promjena lozinke"
                      value={String(mustResetPasswordCount)}
                    />
                  </div>
                </div>
              </section>
            ) : null}
          </div>

          <EntityDrawer
            open={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            eyebrow={
              isAdmin
                ? formMode === "create"
                  ? "Novi trener"
                  : "Uredi trenera"
                : "Pregled trenera"
            }
            title={
              formMode === "create"
                ? "Postavljanje novog trenera"
                : selectedCoach
                  ? `${selectedCoach.user.firstName} ${selectedCoach.user.lastName}`
                  : "Pregled trenera"
            }
          >
            {isAdmin ? (
	              <section className="coach-drawer">
	                <form
	                  className="coach-drawer-form"
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
	                  <fieldset className="coach-widget">
	                    <legend className="coach-widget-title">Osnovni podaci</legend>
	                    <div className="grid gap-5 lg:grid-cols-2">
	                    <label className="block">
                      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Ime
                      </span>
                      <input
                        className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                        type="text"
                        value={form.firstName}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, firstName: event.target.value }))
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
                        value={form.lastName}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, lastName: event.target.value }))
                        }
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        E-pošta
                      </span>
                      <input
                        className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                        type="email"
                        value={form.email}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, email: event.target.value }))
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
                        value={form.phone}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, phone: event.target.value }))
                        }
                      />
	                    </label>
	                    </div>
	                  </fieldset>

	                  <fieldset className="coach-widget">
	                    <legend className="coach-widget-title">Tip trenera</legend>
	                    <div className="coach-type-options">
	                      <label className="coach-check-card">
	                        <input
	                          className="mt-1 h-4 w-4 accent-accent"
	                          type="checkbox"
	                          checked={form.isCategoryCoach}
	                          disabled={form.isCategoryCoach && !form.isConditioningCoach}
	                          onChange={(event) =>
	                            setForm((current) => ({
	                              ...current,
	                              isCategoryCoach: event.target.checked,
	                              categoryIds: event.target.checked ? current.categoryIds : [],
	                            }))
	                          }
	                        />
	                        <span className="min-w-0">
	                          <span className="block text-sm font-bold uppercase">
	                            Kategorijski trener
	                          </span>
	                          <span className="mt-2 block text-sm leading-7 text-muted">
	                            Može biti dodijeljen jednoj ili više kategorija i prikazivati se uz
	                            njihove treninge.
	                          </span>
	                        </span>
	                      </label>

	                      <label className="coach-check-card">
	                        <input
	                          className="mt-1 h-4 w-4 accent-accent"
	                          type="checkbox"
	                          checked={form.isConditioningCoach}
	                          disabled={!form.isCategoryCoach && form.isConditioningCoach}
	                          onChange={(event) =>
	                            setForm((current) => ({
	                              ...current,
	                              isConditioningCoach: event.target.checked,
	                            }))
	                          }
	                        />
	                        <span className="min-w-0">
	                          <span className="block text-sm font-bold uppercase">
	                            Kondicijski trener
	                          </span>
	                          <span className="mt-2 block text-sm leading-7 text-muted">
	                            Može se dodijeliti kondicijskim ili suhim treninzima, neovisno o
	                            kategorijskim dodjelama.
	                          </span>
	                        </span>
	                      </label>
	                    </div>
	                  </fieldset>

	                  <fieldset className="coach-widget coach-widget--wide">
	                    <legend className="coach-widget-title">Profil i kategorije</legend>
	                    <div className="coach-profile-grid">
	                    <div className="coach-profile-card">
	                      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
	                        Pregled profila
	                      </p>
	                      {activeProfileUrl ? (
	                        <img
	                          className="coach-profile-preview"
	                          src={activeProfileUrl}
	                          alt={form.firstName || "Pregled profila trenera"}
	                        />
	                      ) : (
	                        <div className="coach-profile-placeholder">
	                          Učitaj profilnu fotografiju
	                        </div>
	                      )}
	                      <input
	                        id="coach-profile-upload"
	                        className="coach-profile-input"
	                        type="file"
                        accept="image/*"
                        onChange={(event: ChangeEvent<HTMLInputElement>) => {
                          const nextFile = event.target.files?.[0] ?? null;
	                          setForm((current) => ({
                            ...current,
                            profileFile: nextFile,
                            removeProfileImage: false,
                          }));
	                        }}
	                      />
	                      <div className="coach-profile-actions">
	                        <label className="ui-pill ui-pill-button ui-pill--accent" htmlFor="coach-profile-upload">
	                          {activeProfileUrl ? "Promijeni fotografiju" : "Odaberi fotografiju"}
	                        </label>
                          {activeProfileUrl || form.profileFile ? (
                            <button
                              className="ui-pill ui-pill-button ui-pill--outline"
                              type="button"
                              onClick={() =>
                                setForm((current) => ({
                                  ...current,
                                  profileFile: null,
                                  removeProfileImage: Boolean(selectedCoach?.user.profileImageUrl),
                                }))
                              }
                            >
                              Ukloni fotografiju
                            </button>
                          ) : null}
	                      </div>
	                    </div>

	                    <div className="coach-subwidget">
	                      <MultiSelectPanel
                        title="Dodijeljene kategorije"
                        items={categories.map((category) => ({
                          id: category.id,
                          label: category.name,
                        }))}
                        selectedIds={form.categoryIds}
                        disabled={!form.isCategoryCoach}
                        emptyStateMessage={
                          !form.isCategoryCoach
                            ? "Kategorijski trener nije uključen pa su dodjele kategorija isključene."
                            : undefined
                        }
                        onToggle={(id) => {
                          if (!form.isCategoryCoach) {
                            return;
                          }

                          setForm((current) => ({
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

	                  <div className="coach-actions">
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
                          : "Kreiraj trenera"
                        : updateMutation.isPending
                          ? "Spremanje..."
                          : "Spremi promjene"}
                    </button>
                    <button
                      className="ui-pill ui-pill-button ui-pill--panel"
                      type="button"
                      onClick={() => {
                        setFeedback(null);

                        if (formMode === "edit" && selectedCoach) {
                          setForm(createFormFromCoach(selectedCoach));
                          return;
                        }

                        setForm(emptyCoachForm);
                      }}
                    >
	                      Resetiraj obrazac
	                    </button>
	                    <button
	                      className={`ui-pill ui-pill-button ${
	                        selectedCoach?.user.accountStatus === "SUSPENDED"
	                          ? "ui-pill--success"
	                          : "ui-pill--signal"
	                      }`}
	                      type="button"
	                      disabled={
	                        formMode !== "edit" ||
	                        !selectedCoach ||
	                        createMutation.isPending ||
	                        updateMutation.isPending ||
                        deleteMutation.isPending ||
                        statusMutation.isPending ||
                        resendCredentialsMutation.isPending
	                      }
	                      onClick={() => {
	                        if (!selectedCoach) {
	                          return;
	                        }

	                        statusMutation.mutate({
	                          userId: selectedCoach.user.id,
	                          accountStatus:
	                            selectedCoach.user.accountStatus === "SUSPENDED"
	                              ? "ACTIVE"
	                              : "SUSPENDED",
	                        });
	                      }}
	                    >
	                      {selectedCoach?.user.accountStatus === "SUSPENDED"
	                        ? "Ponovno aktiviraj"
	                        : "Suspendiraj trenera"}
	                    </button>
	                    <button
                      className="ui-pill ui-pill-button ui-pill--panel"
                      type="button"
                      disabled={
                        formMode !== "edit" ||
                        !selectedCoach ||
                        createMutation.isPending ||
                        updateMutation.isPending ||
                        deleteMutation.isPending ||
                        statusMutation.isPending ||
                        resendCredentialsMutation.isPending
                      }
                      onClick={() => resendCredentialsMutation.mutate()}
                    >
                      {resendCredentialsMutation.isPending
                        ? "Slanje..."
                        : "Pošalji pristupne podatke"}
                    </button>
	                    <button
                      className="ui-pill ui-pill-button ui-pill--signal"
                      type="button"
                      disabled={
                        formMode !== "edit" ||
                        !selectedCoach ||
                        createMutation.isPending ||
                        updateMutation.isPending ||
                        deleteMutation.isPending ||
                        resendCredentialsMutation.isPending
                      }
                      onClick={() => deleteMutation.mutate()}
                    >
                      {deleteMutation.isPending ? "Brisanje..." : "Obriši trenera"}
                    </button>
                  </div>
                </form>
              </section>
            ) : null}

            {selectedCoach && !isAdmin ? (
              <section className="border-2 border-line bg-surface">
                <div className="border-b-2 border-line bg-panel px-4 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    Detalji
                  </p>
                  <h3 className="mt-2 text-xl font-bold uppercase">
                    {selectedCoach.user.firstName} {selectedCoach.user.lastName}
                  </h3>
                </div>

                <div className="space-y-4 p-4">
                  <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
                    {selectedCoach.user.profileImageUrl ? (
                      <img
                        className="h-52 w-full border-2 border-line object-cover"
                        src={selectedCoach.user.profileImageUrl}
                        alt={`${selectedCoach.user.firstName} ${selectedCoach.user.lastName}`}
                      />
                    ) : (
                      <div className="flex h-52 items-center justify-center border-2 border-dashed border-line bg-bg text-center text-xs font-bold uppercase tracking-[0.2em] text-muted">
                        Nema profilne fotografije
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <DetailStat
                        label="Trener"
                        value={`${selectedCoach.user.firstName} ${selectedCoach.user.lastName}`}
                      />
                      <DetailStat
                        label="E-pošta"
                        value={selectedCoach.user.email ?? "Bez e-pošte"}
                      />
                      <DetailStat
                        label="Telefon"
                        value={selectedCoach.user.phone ?? "Bez telefona"}
                      />
	                    <DetailStat
	                      label="Tip trenera"
                        value={formatCoachTypes(
                          getCoachIsCategoryCoach(selectedCoach),
                          selectedCoach.isConditioningCoach,
                        )}
                      />
                      <DetailStat
                        label="Mora promijeniti lozinku"
                        value={selectedCoach.user.mustChangePassword ? "Da" : "Ne"}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="border-2 border-line bg-white px-4 py-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Status računa
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <StatusChip status={selectedCoach.user.accountStatus} />
                        <CoachTypeChips
                          isCategoryCoach={getCoachIsCategoryCoach(selectedCoach)}
                          isConditioningCoach={selectedCoach.isConditioningCoach}
                        />
                      </div>
                    </div>
                    {getCoachIsCategoryCoach(selectedCoach) ? (
                      <DetailStat
                        label="Dodijeljene kategorije"
                        value={String(selectedCoach.categories?.length ?? 0)}
                      />
                    ) : (
                      <DetailStat
                        label="Pokriće"
                        value="Sve kategorije kroz raspored"
                      />
                    )}
                  </div>

                  <div className="border-2 border-line bg-white">
	                    <div className="border-b-2 border-line bg-bg px-4 py-3">
	                      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
	                        Pokrivene kategorije
	                      </p>
	                    </div>
	                    <div className="grid gap-3 p-4 sm:grid-cols-2">
                      {(selectedCoach.categories?.length ?? 0) > 0 ? (
                        selectedCoach.categories?.map((assignment) => (
                          <div
                            key={assignment.categoryId}
                            className="border-2 border-line bg-panel px-4 py-4"
                          >
                            <p className="text-sm font-bold uppercase">
                              {assignment.category.name}
                            </p>
                            <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted">
                              Dodjela kategorije
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted">Još nema dodijeljenih kategorija.</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
          </EntityDrawer>
        </>
      )}
    </section>
  );
}

function buildCoachCreationMessage(result: CoachCreateResult) {
  if (result.emailSent) {
    return "E-pošta s pristupnim podacima uspješno je poslana.";
  }

  if (result.developmentCredentials) {
    return `Slanje e-pošte je isključeno. Razvojni pristupni podaci: ${result.developmentCredentials.login} / ${result.developmentCredentials.password}`;
  }

  return "Trenerski račun je kreiran.";
}

function createFormFromCoach(coach: CoachRecord): CoachFormState {
  const categoryIds = coach.categories?.map((assignment) => assignment.categoryId) ?? [];

  return {
    firstName: coach.user.firstName,
    lastName: coach.user.lastName,
    email: coach.user.email ?? "",
    phone: coach.user.phone ?? "",
    isCategoryCoach: getCoachIsCategoryCoach(coach),
    isConditioningCoach: coach.isConditioningCoach,
    categoryIds,
    profileFile: null,
    removeProfileImage: false,
  };
}

function buildCoachFormData(form: CoachFormState) {
  const formData = new FormData();
  formData.append("firstName", form.firstName);
  formData.append("lastName", form.lastName);
  formData.append("email", form.email);
  formData.append("phone", form.phone);
  formData.append("isConditioningCoach", String(form.isConditioningCoach));
  formData.append("categoryIds", JSON.stringify(form.isCategoryCoach ? form.categoryIds : []));
  formData.append("removeProfileImage", String(form.removeProfileImage));

  if (form.profileFile) {
    formData.append("profileImage", form.profileFile);
  }

  return formData;
}

async function invalidateCoachQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ["coaches"] });
  await queryClient.invalidateQueries({ queryKey: ["categories"] });
}

function MultiSelectPanel({
  title,
  items,
  selectedIds,
  disabled = false,
  emptyStateMessage,
  onToggle,
}: {
  title: string;
  items: Array<{ id: string; label: string; meta?: string }>;
  selectedIds: string[];
  disabled?: boolean;
  emptyStateMessage?: string;
  onToggle: (id: string) => void;
}) {
  return (
    <div className={`border-2 border-line bg-white ${disabled ? "opacity-70" : ""}`}>
      <div className="border-b-2 border-line bg-bg px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">{title}</p>
      </div>
      {disabled && emptyStateMessage ? (
        <div className="px-4 py-4 text-sm leading-7 text-muted">{emptyStateMessage}</div>
      ) : (
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
                  disabled={disabled}
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
      )}
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-line bg-white px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">{label}</p>
      <p className="mt-3 text-lg font-bold uppercase">{value}</p>
    </div>
  );
}

function StatusChip({ status }: { status: AccountStatus }) {
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

function getCoachIsCategoryCoach(coach: CoachRecord) {
  return !coach.isConditioningCoach || (coach.categories?.length ?? 0) > 0;
}

function formatCoachTypes(isCategoryCoach: boolean, isConditioningCoach: boolean) {
  const types = [
    isCategoryCoach ? "Kategorijski trener" : null,
    isConditioningCoach ? "Kondicijski trener" : null,
  ].filter(Boolean);

  return types.length > 0 ? types.join(" + ") : "Bez tipa";
}

function CoachTypeChips({
  isCategoryCoach,
  isConditioningCoach,
}: {
  isCategoryCoach: boolean;
  isConditioningCoach: boolean;
}) {
  const chips = [
    isCategoryCoach ? (
      <span key="category" className="ui-pill ui-pill--accent">
        Kategorijski trener
      </span>
    ) : null,
    isConditioningCoach ? (
      <span key="conditioning" className="ui-pill ui-pill--warning">
        Kondicijski trener
      </span>
    ) : null,
  ].filter(Boolean);

  return (
    <span className="coach-type-chip-group">
      {chips.length > 0 ? chips : <span className="ui-pill ui-pill--panel">Bez tipa</span>}
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
