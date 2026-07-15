import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { type ChangeEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { api } from "../core/api";
import { formatDate, toDateInputValue } from "../core/date";
import type {
  AccountStatus,
  CategoryRecord,
  CredentialResetResult,
  PaginatedResponse,
  ParentSummary,
  ParentRecord,
  PlayerRecord,
} from "../core/types";
import { EntityDrawer } from "../layout/entity-drawer";
import { CategoryFilterDropdown } from "../ui/category-filter-chips";
import { DatePicker } from "../ui/date-picker";
import { FeedbackToast } from "../ui/feedback-toast";
import { PaginationControls } from "../ui/pagination-controls";
import { SearchMultiSelectPanel } from "../ui/search-multi-select-panel";
import { TableLoadingRows } from "../ui/table-loading-rows";
import { useDebouncedValue } from "../ui/use-debounced-value";

interface FeedbackState {
  tone: "success" | "error";
  message: string;
}

interface PlayerFormState {
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

interface RenewalState {
  playerId: string;
  nextDate: string;
}

interface QuickParentFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

const emptyPlayerForm: PlayerFormState = {
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

const emptyQuickParentForm: QuickParentFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
};

const managementPageSize = 25;
const optionPageSize = 20;

export function PlayersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<PlayerFormState>(emptyPlayerForm);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [profilePreviewUrl, setProfilePreviewUrl] = useState<string | null>(null);
  const [renewalState, setRenewalState] = useState<RenewalState | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [playersPage, setPlayersPage] = useState(1);
  const [playerSearch, setPlayerSearch] = useState("");
  const [parentSearch, setParentSearch] = useState("");
  const [selectedCategoryFilterIds, setSelectedCategoryFilterIds] = useState<string[]>([]);
  const [selectedParentOptions, setSelectedParentOptions] = useState<ParentSummary[]>([]);
  const [isQuickParentFormOpen, setIsQuickParentFormOpen] = useState(false);
  const [quickParentForm, setQuickParentForm] =
    useState<QuickParentFormState>(emptyQuickParentForm);
  const debouncedPlayerSearch = useDebouncedValue(playerSearch.trim());
  const debouncedParentSearch = useDebouncedValue(parentSearch.trim());

  const playersQuery = useQuery({
    queryKey: ["players", "management", playersPage, debouncedPlayerSearch, selectedCategoryFilterIds],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlayerRecord>>("/players", {
        params: {
          page: playersPage,
          pageSize: managementPageSize,
          search: debouncedPlayerSearch || undefined,
          categoryIds:
            selectedCategoryFilterIds.length > 0 ? selectedCategoryFilterIds.join(",") : undefined,
        },
      });
      return response.data;
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", "player-options"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CategoryRecord>>("/categories", {
        params: { page: 1, pageSize: 100 },
      });
      return response.data.items;
    },
  });

  const parentsQuery = useQuery({
    queryKey: ["parents", "player-options", debouncedParentSearch],
    enabled: isAdmin && debouncedParentSearch.length > 0,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<ParentRecord>>("/parents", {
        params: {
          page: 1,
          pageSize: optionPageSize,
          search: debouncedParentSearch,
        },
      });
      return response.data.items;
    },
  });

  const playersPageData = playersQuery.data;
  const players = playersPageData?.items ?? [];
  const categories = categoriesQuery.data ?? [];
  const parents = parentsQuery.data ?? [];
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? null;
  const renewalPlayer = renewalState
    ? players.find((player) => player.id === renewalState.playerId) ?? null
    : null;
  const parentSearchItems = parents.map(parentToSearchItem);
  const selectedParentItems = form.parentIds
    .map((parentId) =>
      selectedParentOptions.find((parent) => parent.id === parentId) ??
      parents.find((parent) => parent.id === parentId) ??
      selectedPlayer?.parents.find((assignment) => assignment.parentId === parentId)?.parent ??
      null,
    )
    .filter((parent): parent is ParentSummary => Boolean(parent))
    .map(parentToSearchItem);

  useEffect(() => {
    if (!selectedPlayerId && players.length > 0 && formMode === "edit") {
      const nextPlayer = players[0];
      setSelectedPlayerId(nextPlayer.id);
      setForm(createFormFromPlayer(nextPlayer));
      setSelectedParentOptions(nextPlayer.parents.map((assignment) => assignment.parent));
    }
  }, [formMode, players, selectedPlayerId]);

  const requestedPlayerId = searchParams.get("playerId");

  useEffect(() => {
    if (!requestedPlayerId || players.length === 0) {
      return;
    }

    const requestedPlayer = players.find((player) => player.id === requestedPlayerId);

    if (requestedPlayer) {
      setFeedback(null);
      setFormMode("edit");
      setSelectedPlayerId(requestedPlayer.id);
      setForm(createFormFromPlayer(requestedPlayer));
      setSelectedParentOptions(requestedPlayer.parents.map((assignment) => assignment.parent));
      setIsDrawerOpen(true);
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("playerId");
    setSearchParams(nextSearchParams, { replace: true });
  }, [players, requestedPlayerId, searchParams, setSearchParams]);

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
    setSelectedPlayerId(null);
    setForm(emptyPlayerForm);
    setSelectedParentOptions([]);
    setParentSearch("");
    setIsQuickParentFormOpen(false);
    setQuickParentForm(emptyQuickParentForm);
    setIsDrawerOpen(true);
  };

  const toggleCategoryFilter = (categoryId: string) => {
    setSelectedCategoryFilterIds((current) =>
      current.includes(categoryId)
        ? current.filter((selectedCategoryId) => selectedCategoryId !== categoryId)
        : [...current, categoryId],
    );
    setPlayersPage(1);
  };

  const openEditDrawer = (player: PlayerRecord) => {
    setFeedback(null);
    setFormMode("edit");
    setSelectedPlayerId(player.id);
    setForm(createFormFromPlayer(player));
    setSelectedParentOptions(player.parents.map((assignment) => assignment.parent));
    setParentSearch("");
    setIsQuickParentFormOpen(false);
    setQuickParentForm(emptyQuickParentForm);
    setIsDrawerOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      ensurePlayerFormHasParent(form);

      const response = await api.post<PlayerRecord>("/players", buildPlayerFormData(form), {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return response.data;
    },
    onSuccess: (createdPlayer) => {
      setFeedback({
        tone: "success",
        message: `Igrač ${createdPlayer.user.firstName} ${createdPlayer.user.lastName} uspješno je kreiran.`,
      });
      setFormMode("edit");
      setSelectedPlayerId(createdPlayer.id);
      setForm(createFormFromPlayer(createdPlayer));
      setSelectedParentOptions(createdPlayer.parents.map((assignment) => assignment.parent));
      setIsDrawerOpen(true);
      void invalidatePlayerQueries(queryClient, isAdmin);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: getMutationErrorMessage(error, "Kreiranje igrača nije uspjelo."),
      });
    },
  });

  const quickParentMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("firstName", quickParentForm.firstName);
      formData.append("lastName", quickParentForm.lastName);
      formData.append("email", quickParentForm.email);
      formData.append("phone", quickParentForm.phone);
      formData.append("playerIds", JSON.stringify(selectedPlayer ? [selectedPlayer.id] : []));
      formData.append("primaryPlayerIds", JSON.stringify([]));

      const response = await api.post<ParentRecord>("/parents", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return response.data;
    },
    onSuccess: (createdParent) => {
      setSelectedParentOptions((currentOptions) =>
        currentOptions.some((parent) => parent.id === createdParent.id)
          ? currentOptions
          : [...currentOptions, createdParent],
      );
      setForm((current) => {
        const nextParentIds = current.parentIds.includes(createdParent.id)
          ? current.parentIds
          : [...current.parentIds, createdParent.id];

        return {
          ...current,
          parentIds: nextParentIds,
          primaryParentId: current.primaryParentId || createdParent.id,
        };
      });
      setQuickParentForm(emptyQuickParentForm);
      setIsQuickParentFormOpen(false);
      setParentSearch("");
      setFeedback({
        tone: "success",
        message: `Roditelj ${createdParent.user.firstName} ${createdParent.user.lastName} je dodan i odabran.`,
      });
      void invalidatePlayerQueries(queryClient, isAdmin);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message:
          error.response?.data?.message ??
          "Brzo dodavanje roditelja nije uspjelo.",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlayer) {
        throw new Error("Nijedan igrač nije odabran.");
      }

      ensurePlayerFormHasParent(form);

      const response = await api.patch<PlayerRecord>(
        `/players/${selectedPlayer.id}`,
        buildPlayerFormData(form),
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      return response.data;
    },
    onSuccess: (updatedPlayer) => {
      setFeedback({
        tone: "success",
        message: `Igrač ${updatedPlayer.user.firstName} ${updatedPlayer.user.lastName} uspješno je ažuriran.`,
      });
      setSelectedPlayerId(updatedPlayer.id);
      setForm(createFormFromPlayer(updatedPlayer));
      setSelectedParentOptions(updatedPlayer.parents.map((assignment) => assignment.parent));
      setIsDrawerOpen(true);
      void invalidatePlayerQueries(queryClient, isAdmin);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: getMutationErrorMessage(error, "Ažuriranje igrača nije uspjelo."),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlayer) {
        throw new Error("Nijedan igrač nije odabran.");
      }

      await api.delete(`/players/${selectedPlayer.id}`);
    },
    onSuccess: () => {
      const deletedName = selectedPlayer
        ? `${selectedPlayer.user.firstName} ${selectedPlayer.user.lastName}`
        : "Igrač";

      setFeedback({
        tone: "success",
        message: `Igrač ${deletedName} uspješno je obrisan.`,
      });
      setSelectedPlayerId(null);
      setFormMode("create");
      setForm(emptyPlayerForm);
      setIsDrawerOpen(false);

      void invalidatePlayerQueries(queryClient, isAdmin);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Brisanje igrača nije uspjelo.",
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
            ? "Račun igrača je suspendiran."
            : "Račun igrača je ponovno aktiviran.",
      });
      void invalidatePlayerQueries(queryClient, isAdmin);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Promjena statusa igrača nije uspjela.",
      });
    },
  });

  const renewalMutation = useMutation({
    mutationFn: async ({ playerId, nextDate }: RenewalState) => {
      const response = await api.patch<PlayerRecord>(`/players/${playerId}`, {
        membershipExpiresAt: nextDate,
      });

      return response.data;
    },
    onSuccess: (updatedPlayer) => {
      setFeedback({
        tone: "success",
        message: `Članstvo igrača ${updatedPlayer.user.firstName} ${updatedPlayer.user.lastName} uspješno je obnovljeno.`,
      });
      setRenewalState(null);
      void invalidatePlayerQueries(queryClient, isAdmin);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Obnova članstva nije uspjela.",
      });
    },
  });

  const resendCredentialsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlayer) {
        throw new Error("Nijedan igrač nije odabran.");
      }

      const response = await api.post<CredentialResetResult>(
        `/players/${selectedPlayer.id}/resend-credentials`,
      );

      return response.data;
    },
    onSuccess: (result) => {
      setFeedback({
        tone: "success",
        message: result.message,
      });
      void invalidatePlayerQueries(queryClient, isAdmin);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message:
          error.response?.data?.message ??
          "Slanje pristupnih podataka igrača nije uspjelo.",
      });
    },
  });

  const activeProfileUrl = form.removeProfileImage
    ? null
    : profilePreviewUrl ?? selectedPlayer?.user.profileImageUrl ?? null;
  const isPlayersRefetching = playersQuery.isFetching && !playersQuery.isLoading;

  return (
    <section className="space-y-6">
      <FeedbackToast feedback={feedback} onClose={() => setFeedback(null)} />

      {playersQuery.isLoading || categoriesQuery.isLoading ? (
        <div className="space-y-4">
          <div className="h-[720px] animate-pulse border-2 border-line bg-panel" />
        </div>
      ) : playersQuery.isError || categoriesQuery.isError ? (
        <div className="border-2 border-line bg-signal px-5 py-4 text-sm font-medium text-surface">
          Igrače trenutno nije moguće učitati.
        </div>
      ) : (
        <>
          <section className="admin-table-card border-2 border-line bg-surface">
            <div className="flex flex-col gap-4 border-b-2 border-line bg-panel px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  Popis igrača
                </p>
                <h3 className="mt-2 text-xl font-bold uppercase">Evidencija</h3>
              </div>
              <button
                className="ui-pill ui-pill-button ui-pill--accent"
                type="button"
                onClick={openCreateDrawer}
              >
                Novi igrač
              </button>
            </div>

            <div className="relative z-30 grid gap-4 border-b-2 border-line bg-white px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
              <label className="block min-w-0">
                <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.25em] text-muted">
                  Pretraga
                </span>
                <input
                  className="h-[52px] w-full rounded-[18px] border border-line bg-surface px-4 outline-none placeholder:text-muted focus:bg-bg"
                  type="search"
                  value={playerSearch}
                  onChange={(event) => {
                    setPlayerSearch(event.target.value);
                    setPlayersPage(1);
                  }}
                  placeholder="Ime i prezime"
                />
              </label>
              <CategoryFilterDropdown
                categories={categories}
                selectedIds={selectedCategoryFilterIds}
                onToggle={toggleCategoryFilter}
                onClear={() => {
                  setSelectedCategoryFilterIds([]);
                  setPlayersPage(1);
                }}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead className="bg-bg">
                  <tr className="border-b-2 border-line text-center text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    <th className="px-4 py-4">Igrač</th>
                    <th className="px-4 py-4">Kategorije</th>
                    <th className="px-4 py-4">Članstvo</th>
                    <th className="px-4 py-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isPlayersRefetching ? (
                    <TableLoadingRows columns={4} />
                  ) : (
                  players.map((player) => {
                    const isSelected =
                      isDrawerOpen && selectedPlayerId === player.id && formMode === "edit";

                    return (
                      <tr
                        key={player.id}
                        className={`cursor-pointer border-b-2 border-line ${
                          isSelected ? "bg-panel" : "bg-white hover:bg-bg"
                        }`}
                        onClick={() => openEditDrawer(player)}
                      >
                        <td className="px-4 py-4 align-middle text-center">
                          <p className="text-sm font-bold uppercase">
                            {player.user.firstName} {player.user.lastName}
                          </p>
                        </td>
                        <td className="px-4 py-4 align-middle text-center text-sm">
                          {player.categories.length > 0
                            ? player.categories
                                .map((assignment) => assignment.category.name)
                                .join(", ")
                            : "Bez kategorije"}
                        </td>
                        <td className="px-4 py-4 align-middle text-center text-sm">
                          {player.membershipExpiresAt
                            ? formatDate(player.membershipExpiresAt)
                            : "Nije postavljeno"}
                        </td>
                        <td className="px-4 py-4 align-middle text-center">
                          <StatusChip status={player.user.accountStatus} />
                        </td>
                      </tr>
                    );
                  })
                  )}
                </tbody>
              </table>
            </div>

            {playersPageData ? (
              <PaginationControls
                page={playersPageData.page}
                pageSize={playersPageData.pageSize}
                total={playersPageData.total}
                totalPages={playersPageData.totalPages}
                onPageChange={setPlayersPage}
              />
            ) : null}
          </section>

          <EntityDrawer
            open={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            eyebrow={formMode === "create" ? "Novi igrač" : "Uredi igrača"}
            title={
              formMode === "create"
                ? "Postavljanje novog igrača"
                : selectedPlayer
                  ? `${selectedPlayer.user.firstName} ${selectedPlayer.user.lastName}`
                  : "Pregled igrača"
            }
          >
            <section className="player-drawer">
              <form
                className="player-drawer-form"
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
                      Datum rođenja
                    </span>
                    <DatePicker
                      className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                      value={form.dateOfBirth}
                      onChange={(value) =>
                        setForm((current) => ({ ...current, dateOfBirth: value }))
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
                      value={form.oib}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, oib: event.target.value }))
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

                  <label className="block">
                    <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                      E-pošta igrača
                    </span>
                    <input
                      className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                      type="email"
                      value={form.email}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, email: event.target.value }))
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
                      value={form.membershipExpiresAt}
                      onChange={(value) =>
                        setForm((current) => ({
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
                      checked={form.gdprConsent}
                      onChange={(event) =>
                        setForm((current) => ({
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
                    {activeProfileUrl ? (
                      <img
                        className="player-profile-preview"
                        src={activeProfileUrl}
                        alt={form.firstName || "Pregled profila igrača"}
                      />
                    ) : (
                      <div className="player-profile-placeholder">
                        Učitaj profilnu fotografiju
                      </div>
                    )}
                    <input
                      id="player-profile-upload"
                      className="player-profile-input"
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
                    <div className="player-profile-actions">
                      <label className="ui-pill ui-pill-button ui-pill--accent" htmlFor="player-profile-upload">
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
                              removeProfileImage: Boolean(selectedPlayer?.user.profileImageUrl),
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
                      items={categories.map((category) => ({
                        id: category.id,
                        label: category.name,
                      }))}
                      selectedIds={form.categoryIds}
                      onToggle={(id) => {
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

                {isAdmin ? (
                  <fieldset className="player-widget">
                    <legend className="player-widget-title">Roditelji</legend>
                    <div className="player-assignment-stack">
                      <SearchMultiSelectPanel
                        title="Povezani roditelji"
                        className="player-selector-panel"
                        items={parentSearchItems}
                        selectedItems={selectedParentItems}
                        searchValue={parentSearch}
                        isSearching={parentsQuery.isFetching}
                        onSearchChange={setParentSearch}
                        actionLabel={isQuickParentFormOpen ? "Zatvori dodavanje" : "Dodaj roditelja"}
                        actionDisabled={quickParentMutation.isPending}
                        onAction={() => setIsQuickParentFormOpen((isOpen) => !isOpen)}
                        searchPlaceholder="Pretraga roditelja"
                        noResultsLabel="Nema roditelja koji odgovaraju pretrazi."
                        selectedIds={form.parentIds}
                        onToggle={(id) => {
                          setForm((current) => {
                            const nextParentIds = current.parentIds.includes(id)
                              ? current.parentIds.filter((parentId) => parentId !== id)
                              : [...current.parentIds, id];
                            const selectedParent = parents.find((parent) => parent.id === id);

                            setSelectedParentOptions((currentOptions) =>
                              current.parentIds.includes(id)
                                ? currentOptions.filter((parent) => parent.id !== id)
                                : selectedParent &&
                                    !currentOptions.some((parent) => parent.id === id)
                                  ? [...currentOptions, selectedParent]
                                  : currentOptions,
                            );

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
                      {isQuickParentFormOpen ? (
                        <div className="rounded-[22px] border-2 border-line bg-white p-4">
                          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                              Novi roditelj
                            </p>
                            <p className="text-sm leading-6 text-muted">
                              Nakon kreiranja bit će automatski odabran za ovog igrača.
                            </p>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block">
                              <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
                                Ime
                              </span>
                              <input
                                className="w-full rounded-[18px] border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                                type="text"
                                value={quickParentForm.firstName}
                                onChange={(event) =>
                                  setQuickParentForm((current) => ({
                                    ...current,
                                    firstName: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <label className="block">
                              <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
                                Prezime
                              </span>
                              <input
                                className="w-full rounded-[18px] border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                                type="text"
                                value={quickParentForm.lastName}
                                onChange={(event) =>
                                  setQuickParentForm((current) => ({
                                    ...current,
                                    lastName: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <label className="block">
                              <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
                                E-pošta
                              </span>
                              <input
                                className="w-full rounded-[18px] border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                                type="email"
                                value={quickParentForm.email}
                                onChange={(event) =>
                                  setQuickParentForm((current) => ({
                                    ...current,
                                    email: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <label className="block">
                              <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
                                Telefon
                              </span>
                              <input
                                className="w-full rounded-[18px] border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                                type="text"
                                value={quickParentForm.phone}
                                onChange={(event) =>
                                  setQuickParentForm((current) => ({
                                    ...current,
                                    phone: event.target.value,
                                  }))
                                }
                              />
                            </label>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-3">
                            <button
                              className="ui-pill ui-pill-button ui-pill--accent"
                              type="button"
                              disabled={quickParentMutation.isPending}
                              onClick={() => quickParentMutation.mutate()}
                            >
                              {quickParentMutation.isPending ? "Dodavanje..." : "Dodaj i odaberi"}
                            </button>
                            <button
                              className="ui-pill ui-pill-button ui-pill--panel"
                              type="button"
                              disabled={quickParentMutation.isPending}
                              onClick={() => {
                                setQuickParentForm(emptyQuickParentForm);
                                setIsQuickParentFormOpen(false);
                              }}
                            >
                              Odustani
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </fieldset>
                ) : null}

                <div className="player-actions">
                  <button
                    className="ui-pill ui-pill-button ui-pill--accent"
                    type="submit"
                    disabled={
                      createMutation.isPending ||
                      updateMutation.isPending ||
                      deleteMutation.isPending ||
                      statusMutation.isPending ||
                      resendCredentialsMutation.isPending
                    }
                  >
                    {formMode === "create"
                      ? createMutation.isPending
                        ? "Kreiranje..."
                        : "Kreiraj igrača"
                      : updateMutation.isPending
                        ? "Spremanje..."
                        : "Spremi promjene"}
                  </button>
                  <button
                    className="ui-pill ui-pill-button ui-pill--panel"
                    type="button"
                    onClick={() => {
                      setFeedback(null);

                      if (formMode === "edit" && selectedPlayer) {
                        setForm(createFormFromPlayer(selectedPlayer));
                        return;
                      }

                      setForm(emptyPlayerForm);
                    }}
                  >
                    Resetiraj obrazac
                  </button>
                  <button
                    className={`ui-pill ui-pill-button ${
                      selectedPlayer?.user.accountStatus === "SUSPENDED"
                        ? "ui-pill--success"
                        : "ui-pill--signal"
                    }`}
                    type="button"
                    disabled={
                      formMode !== "edit" ||
                      !selectedPlayer ||
                      createMutation.isPending ||
                      updateMutation.isPending ||
                      deleteMutation.isPending ||
                      statusMutation.isPending ||
                      resendCredentialsMutation.isPending
                    }
                    onClick={() => {
                      if (!selectedPlayer) {
                        return;
                      }

                      statusMutation.mutate({
                        userId: selectedPlayer.user.id,
                        accountStatus:
                          selectedPlayer.user.accountStatus === "SUSPENDED"
                            ? "ACTIVE"
                            : "SUSPENDED",
                      });
                    }}
                  >
                    {selectedPlayer?.user.accountStatus === "SUSPENDED"
                      ? "Ponovno aktiviraj"
                      : "Suspendiraj igrača"}
                  </button>
                  {isAdmin ? (
                    <button
                      className="ui-pill ui-pill-button ui-pill--panel"
                      type="button"
                      disabled={
                        formMode !== "edit" ||
                        !selectedPlayer ||
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
                  ) : null}
                  <button
                    className="ui-pill ui-pill-button ui-pill--signal"
                    type="button"
                    disabled={
                      formMode !== "edit" ||
                      !selectedPlayer ||
                      createMutation.isPending ||
                      updateMutation.isPending ||
                      deleteMutation.isPending ||
                      statusMutation.isPending ||
                      resendCredentialsMutation.isPending
                    }
                    onClick={() => deleteMutation.mutate()}
                  >
                    {deleteMutation.isPending ? "Brisanje..." : "Obriši igrača"}
                  </button>
                </div>
              </form>
            </section>
          </EntityDrawer>
        </>
      )}

      {renewalState && renewalPlayer ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/25 px-4">
          <div className="w-full max-w-xl border-2 border-line bg-surface">
            <div className="border-b-2 border-line bg-panel px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                Obnova članstva
              </p>
              <h3 className="mt-2 text-2xl font-bold uppercase">
                {renewalPlayer.user.firstName} {renewalPlayer.user.lastName}
              </h3>
            </div>

            <div className="space-y-5 p-5">
              <div className="border-2 border-line bg-white px-4 py-4 text-sm leading-7">
                <p>
                  Trenutno vrijedi do:{" "}
                  <strong>
                    {renewalPlayer.membershipExpiresAt
                      ? formatDate(renewalPlayer.membershipExpiresAt)
                      : "Nije postavljeno"}
                  </strong>
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  className="ui-pill ui-pill-button ui-pill--accent justify-self-start"
                  type="button"
                  onClick={() =>
                    setRenewalState((current) =>
                      current
                        ? {
                            ...current,
                            nextDate: calculateNextMembershipDate(
                              renewalPlayer.membershipExpiresAt,
                            ),
                          }
                        : current,
                    )
                  }
                >
                  +1 mjesec
                </button>

                <label className="block">
                  <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    Prilagođeni datum
                  </span>
                  <DatePicker
                    className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                    value={renewalState.nextDate}
                    onChange={(value) =>
                      setRenewalState((current) =>
                        current ? { ...current, nextDate: value } : current,
                      )
                    }
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  className="ui-pill ui-pill-button ui-pill--success"
                  type="button"
                  disabled={!renewalState.nextDate || renewalMutation.isPending}
                  onClick={() => renewalMutation.mutate(renewalState)}
                >
                  {renewalMutation.isPending ? "Spremanje..." : "Primijeni obnovu"}
                </button>
                <button
                  className="ui-pill ui-pill-button ui-pill--panel"
                  type="button"
                  onClick={() => setRenewalState(null)}
                >
                  Odustani
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function createFormFromPlayer(player: PlayerRecord): PlayerFormState {
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

function buildPlayerFormData(form: PlayerFormState) {
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

function ensurePlayerFormHasParent(form: PlayerFormState) {
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

function calculateNextMembershipDate(currentDateIso: string | null) {
  const baseDate = currentDateIso ? new Date(currentDateIso) : new Date();
  const nextDate = new Date(baseDate);
  nextDate.setMonth(nextDate.getMonth() + 1);

  return nextDate.toISOString().slice(0, 10);
}

async function invalidatePlayerQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  isAdmin: boolean,
) {
  await queryClient.invalidateQueries({ queryKey: ["players"] });
  await queryClient.invalidateQueries({ queryKey: ["categories"] });
  if (isAdmin) {
    await queryClient.invalidateQueries({ queryKey: ["parents"] });
  }
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

function parentToSearchItem(parent: ParentSummary) {
  return {
    id: parent.id,
    label: `${parent.user.firstName} ${parent.user.lastName}`,
    meta: parent.user.email ?? "Bez e-pošte",
    keywords: [
      parent.user.firstName,
      parent.user.lastName,
      parent.user.email ?? "",
      parent.user.phone ?? "",
    ],
  };
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

function formatAccountStatus(status: AccountStatus) {
  if (status === "ACTIVE") {
    return "Aktivan";
  }

  if (status === "SUSPENDED") {
    return "Suspendiran";
  }

  return "Na čekanju";
}
