import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { type ChangeEvent, useDeferredValue, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { api } from "../core/api";
import type { AccountStatus, CategoryRecord, CoachRecord, PaginatedResponse } from "../core/types";
import { EntityDrawer } from "../layout/entity-drawer";
import { PaginationControls } from "../ui/pagination-controls";

interface FeedbackState {
  tone: "success" | "error";
  message: string;
}

interface ToastState {
  title: string;
  message: string;
}

interface CoachFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  isConditioningCoach: boolean;
  categoryIds: string[];
  profileFile: File | null;
}

interface CoachCreateResult {
  coach: CoachRecord;
  emailSent: boolean;
  developmentCredentials?: {
    email: string;
    password: string;
  };
}

const emptyCoachForm: CoachFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  isConditioningCoach: false,
  categoryIds: [],
  profileFile: null,
};

const managementPageSize = 25;

export function CoachesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const queryClient = useQueryClient();
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<CoachFormState>(emptyCoachForm);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [profilePreviewUrl, setProfilePreviewUrl] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [coachesPage, setCoachesPage] = useState(1);
  const [coachSearch, setCoachSearch] = useState("");
  const deferredCoachSearch = useDeferredValue(coachSearch.trim());

  const coachesQuery = useQuery({
    queryKey: ["coaches", "management", coachesPage, deferredCoachSearch],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CoachRecord>>("/coaches", {
        params: {
          page: coachesPage,
          pageSize: managementPageSize,
          search: deferredCoachSearch || undefined,
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

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 4500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [toast]);

  const openCreateDrawer = () => {
    setFeedback(null);
    setFormMode("create");
    setSelectedCoachId(null);
    setForm(emptyCoachForm);
    setIsDrawerOpen(true);
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
        message: `Trener ${result.coach.user.firstName} ${result.coach.user.lastName} uspješno je kreiran.`,
      });
      setToast({
        title: "Trener je kreiran",
        message: buildCoachCreationMessage(result),
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

  const activeCoaches = coaches.filter((coach) => coach.user.accountStatus === "ACTIVE").length;
  const mustResetPasswordCount = coaches.filter((coach) => coach.user.mustChangePassword).length;
  const activeProfileUrl = profilePreviewUrl ?? selectedCoach?.user.profileImageUrl ?? null;

  return (
    <section className="space-y-6">
      {toast ? (
        <div className="fixed right-4 top-4 z-40 w-full max-w-sm border-2 border-line bg-success p-4 text-surface shadow-none">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] opacity-80">
            {toast.title}
          </p>
          <p className="mt-3 text-sm leading-6">{toast.message}</p>
        </div>
      ) : null}

      {feedback ? (
        <div
          className={`border-2 border-line px-5 py-4 text-sm font-medium ${
            feedback.tone === "success" ? "bg-success text-surface" : "bg-signal text-surface"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

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
            <section className="border-2 border-line bg-surface">
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

              <div className="border-b-2 border-line bg-white px-4 py-4">
                <label className="block max-w-xl">
                  <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.25em] text-muted">
                    Pretraga
                  </span>
                  <input
                    className="w-full border-2 border-line bg-surface px-4 py-3 outline-none placeholder:text-muted focus:bg-bg"
                    type="search"
                    value={coachSearch}
                    onChange={(event) => {
                      setCoachSearch(event.target.value);
                      setCoachesPage(1);
                    }}
                    placeholder="Ime, e-pošta, telefon ili kategorija"
                  />
                </label>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead className="bg-bg">
                    <tr className="border-b-2 border-line text-left text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                      <th className="px-4 py-4">Trener</th>
                      <th className="px-4 py-4">Tip</th>
                      <th className="px-4 py-4">E-pošta</th>
                      <th className="px-4 py-4">Kategorije</th>
                      <th className="px-4 py-4">Status</th>
                      <th className="px-4 py-4">Radnje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coaches.map((coach) => {
                      const isSelected =
                        isDrawerOpen && selectedCoachId === coach.id && formMode === "edit";
                      const canSuspend = coach.user.accountStatus !== "SUSPENDED";
                      const categoryNames =
                        coach.categories?.map((entry) => entry.category.name) ?? [];

                      return (
                        <tr
                          key={coach.id}
                          className={`cursor-pointer border-b-2 border-line ${
                            isSelected ? "bg-panel" : "bg-white hover:bg-bg"
                          }`}
                          onClick={() => openEditDrawer(coach)}
                        >
                          <td className="px-4 py-4 align-top">
                            <p className="text-sm font-bold uppercase">
                              {coach.user.firstName} {coach.user.lastName}
                            </p>
                            <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted">
                              {coach.user.phone ?? "Bez telefona"}
                            </p>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <CoachTypeChip isConditioningCoach={coach.isConditioningCoach} />
                          </td>
                          <td className="px-4 py-4 align-top text-sm">
                            {coach.user.email ?? "Bez e-pošte"}
                          </td>
                          <td className="px-4 py-4 align-top text-sm">
                            {coach.isConditioningCoach
                              ? "Radi preko svih kategorija"
                              : categoryNames.length > 0
                              ? categoryNames.join(", ")
                              : "Nije dodijeljeno"}
                          </td>
                          <td className="px-4 py-4 align-top">
                            <StatusChip status={coach.user.accountStatus} />
                          </td>
                          <td className="px-4 py-4 align-top">
                            {isAdmin ? (
                              <button
                                className={`ui-pill ui-pill-button ${
                                  canSuspend ? "ui-pill--signal" : "ui-pill--success"
                                }`}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  statusMutation.mutate({
                                    userId: coach.user.id,
                                    accountStatus: canSuspend ? "SUSPENDED" : "ACTIVE",
                                  });
                                }}
                              >
                                {canSuspend ? "Suspendiraj" : "Ponovno aktiviraj"}
                              </button>
                            ) : (
                              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
                                Pregled
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
              <section className="border-2 border-line bg-surface">
                <div className="border-b-2 border-line bg-panel px-4 py-4">
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
              <section className="border-2 border-line bg-surface">
                <div className="border-b-2 border-line bg-panel px-4 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    {formMode === "create" ? "Novi trener" : "Uredi trenera"}
                  </p>
                  <h3 className="mt-2 text-xl font-bold uppercase">
                    {formMode === "create"
                      ? "Postavljanje novog trenera"
                      : selectedCoach
                        ? `${selectedCoach.user.firstName} ${selectedCoach.user.lastName}`
                        : "Uređivanje trenera"}
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
                  {selectedCoach && formMode === "edit" ? (
                    <div className="flex flex-wrap gap-2">
                      <StatusChip status={selectedCoach.user.accountStatus} />
                      <CoachTypeChip isConditioningCoach={selectedCoach.isConditioningCoach} />
                      <span
                        className={`ui-pill ${
                          selectedCoach.user.mustChangePassword
                            ? "ui-pill--warning"
                            : "ui-pill--outline"
                        }`}
                      >
                        {selectedCoach.user.mustChangePassword
                          ? "Promjena lozinke obavezna"
                          : "Lozinka potvrđena"}
                      </span>
                      {!selectedCoach.isConditioningCoach ? (
                        <span className="ui-pill ui-pill--panel">
                          Kategorije <strong>{selectedCoach.categories?.length ?? 0}</strong>
                        </span>
                      ) : null}
                    </div>
                  ) : null}

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

                  <label className="flex items-start gap-3 border-2 border-line bg-white px-4 py-4">
                    <input
                      className="mt-1 h-4 w-4 accent-accent"
                      type="checkbox"
                      checked={form.isConditioningCoach}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          isConditioningCoach: event.target.checked,
                          categoryIds: event.target.checked ? [] : current.categoryIds,
                        }))
                      }
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold uppercase">
                        Kondicijski trener
                      </span>
                      <span className="mt-2 block text-sm leading-7 text-muted">
                        Kondicijski trener nema vlastitu kategoriju, ali ga možete dodijeliti
                        treningu bilo koje kategorije, uključujući suhi trening.
                      </span>
                    </span>
                  </label>

                  <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
                    <div className="space-y-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Pregled profila
                      </p>
                      {activeProfileUrl ? (
                        <img
                          className="h-44 w-full border-2 border-line object-cover"
                          src={activeProfileUrl}
                          alt={form.firstName || "Pregled profila trenera"}
                        />
                      ) : (
                        <div className="flex h-44 items-center justify-center border-2 border-dashed border-line bg-bg px-4 text-center text-xs font-bold uppercase tracking-[0.2em] text-muted">
                          Učitaj profilnu fotografiju
                        </div>
                      )}
                      <input
                        className="block w-full border-2 border-line bg-white px-3 py-3 text-sm"
                        type="file"
                        accept="image/*"
                        onChange={(event: ChangeEvent<HTMLInputElement>) => {
                          const nextFile = event.target.files?.[0] ?? null;
                          setForm((current) => ({ ...current, profileFile: nextFile }));
                        }}
                      />
                    </div>

                    <div className="space-y-4">
                      <MultiSelectPanel
                        title="Dodijeljene kategorije"
                        items={categories.map((category) => ({
                          id: category.id,
                          label: category.name,
                          meta: `${category.playerCount} igrača`,
                        }))}
                        selectedIds={form.categoryIds}
                        disabled={form.isConditioningCoach}
                        emptyStateMessage={
                          form.isConditioningCoach
                            ? "Kondicijski trener nije vezan uz jednu kategoriju pa su dodjele ovdje isključene."
                            : undefined
                        }
                        onToggle={(id) => {
                          if (form.isConditioningCoach) {
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
                      className="ui-pill ui-pill-button ui-pill--signal"
                      type="button"
                      disabled={
                        formMode !== "edit" ||
                        !selectedCoach ||
                        createMutation.isPending ||
                        updateMutation.isPending ||
                        deleteMutation.isPending
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
                        value={
                          selectedCoach.isConditioningCoach
                            ? "Kondicijski trener"
                            : "Glavni trener kategorije"
                        }
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
                        <CoachTypeChip isConditioningCoach={selectedCoach.isConditioningCoach} />
                      </div>
                    </div>
                    {!selectedCoach.isConditioningCoach ? (
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
                        {selectedCoach.isConditioningCoach ? "Raspored rada" : "Pokrivene kategorije"}
                      </p>
                    </div>
                    <div className="grid gap-3 p-4 sm:grid-cols-2">
                      {selectedCoach.isConditioningCoach ? (
                        <div className="border-2 border-line bg-panel px-4 py-4 sm:col-span-2">
                          <p className="text-sm font-bold uppercase">Sve kategorije</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted">
                            Dodjeljuje se pojedinačnim terminima i suhim treninzima
                          </p>
                        </div>
                      ) : (selectedCoach.categories?.length ?? 0) > 0 ? (
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
    return `Slanje e-pošte je isključeno. Razvojni pristupni podaci: ${result.developmentCredentials.email} / ${result.developmentCredentials.password}`;
  }

  return "Trenerski račun je kreiran.";
}

function createFormFromCoach(coach: CoachRecord): CoachFormState {
  return {
    firstName: coach.user.firstName,
    lastName: coach.user.lastName,
    email: coach.user.email ?? "",
    phone: coach.user.phone ?? "",
    isConditioningCoach: coach.isConditioningCoach,
    categoryIds: coach.categories?.map((assignment) => assignment.categoryId) ?? [],
    profileFile: null,
  };
}

function buildCoachFormData(form: CoachFormState) {
  const formData = new FormData();
  formData.append("firstName", form.firstName);
  formData.append("lastName", form.lastName);
  formData.append("email", form.email);
  formData.append("phone", form.phone);
  formData.append("isConditioningCoach", String(form.isConditioningCoach));
  formData.append("categoryIds", JSON.stringify(form.categoryIds));

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
  items: Array<{ id: string; label: string; meta: string }>;
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
                className={`flex cursor-pointer items-start gap-3 border-2 border-line px-3 py-3 ${
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
                  <span className="mt-1 block truncate text-[11px] uppercase tracking-[0.2em] text-muted">
                    {item.meta}
                  </span>
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

function CoachTypeChip({ isConditioningCoach }: { isConditioningCoach: boolean }) {
  return (
    <span className={`ui-pill ${isConditioningCoach ? "ui-pill--warning" : "ui-pill--outline"}`}>
      {isConditioningCoach ? "Kondicijski trener" : "Kategorijski trener"}
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
