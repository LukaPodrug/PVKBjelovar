import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { type ChangeEvent, useDeferredValue, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { api } from "../core/api";
import { formatDate, toDateInputValue } from "../core/date";
import type {
  AccountStatus,
  CategoryRecord,
  PaginatedResponse,
  ParentSummary,
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

interface PlayerFormState {
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
  profileFile: File | null;
}

interface RenewalState {
  playerId: string;
  nextDate: string;
}

const emptyPlayerForm: PlayerFormState = {
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
  profileFile: null,
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
  const [selectedParentOptions, setSelectedParentOptions] = useState<ParentSummary[]>([]);
  const deferredPlayerSearch = useDeferredValue(playerSearch.trim());
  const deferredParentSearch = useDeferredValue(parentSearch.trim());

  const playersQuery = useQuery({
    queryKey: ["players", "management", playersPage, deferredPlayerSearch],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlayerRecord>>("/players", {
        params: {
          page: playersPage,
          pageSize: managementPageSize,
          search: deferredPlayerSearch || undefined,
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
    queryKey: ["parents", "player-options", deferredParentSearch],
    enabled: isAdmin && deferredParentSearch.length > 0,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<ParentRecord>>("/parents", {
        params: {
          page: 1,
          pageSize: optionPageSize,
          search: deferredParentSearch,
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
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (player: PlayerRecord) => {
    setFeedback(null);
    setFormMode("edit");
    setSelectedPlayerId(player.id);
    setForm(createFormFromPlayer(player));
    setSelectedParentOptions(player.parents.map((assignment) => assignment.parent));
    setParentSearch("");
    setIsDrawerOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
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
        message: error.response?.data?.message ?? "Kreiranje igrača nije uspjelo.",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlayer) {
        throw new Error("Nijedan igrač nije odabran.");
      }

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
        message: error.response?.data?.message ?? "Ažuriranje igrača nije uspjelo.",
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

  const activeProfileUrl = profilePreviewUrl ?? selectedPlayer?.user.profileImageUrl ?? null;

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
          <section className="border-2 border-line bg-surface">
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

            <div className="border-b-2 border-line bg-white px-4 py-4">
              <label className="block max-w-xl">
                <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.25em] text-muted">
                  Pretraga
                </span>
                <input
                  className="w-full border-2 border-line bg-surface px-4 py-3 outline-none placeholder:text-muted focus:bg-bg"
                  type="search"
                  value={playerSearch}
                  onChange={(event) => {
                    setPlayerSearch(event.target.value);
                    setPlayersPage(1);
                  }}
                  placeholder="Ime, OIB, korisničko ime, roditelj ili kategorija"
                />
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead className="bg-bg">
                  <tr className="border-b-2 border-line text-left text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    <th className="px-4 py-4">Igrač</th>
                    <th className="px-4 py-4">Kategorije</th>
                    <th className="px-4 py-4">Status</th>
                    <th className="px-4 py-4">Članstvo</th>
                    <th className="px-4 py-4">Radnje</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => {
                    const isSelected =
                      isDrawerOpen && selectedPlayerId === player.id && formMode === "edit";
                    const canSuspend = player.user.accountStatus !== "SUSPENDED";

                    return (
                      <tr
                        key={player.id}
                        className={`cursor-pointer border-b-2 border-line ${
                          isSelected ? "bg-panel" : "bg-white hover:bg-bg"
                        }`}
                        onClick={() => openEditDrawer(player)}
                      >
                        <td className="px-4 py-4 align-top">
                          <p className="text-sm font-bold uppercase">
                            {player.user.firstName} {player.user.lastName}
                          </p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted">
                            OIB {player.oib}
                          </p>
                        </td>
                        <td className="px-4 py-4 align-top text-sm">
                          {player.categories.length > 0
                            ? player.categories
                                .map((assignment) => assignment.category.name)
                                .join(", ")
                            : "Bez kategorije"}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <StatusChip status={player.user.accountStatus} />
                        </td>
                        <td className="px-4 py-4 align-top text-sm">
                          {player.membershipExpiresAt
                            ? formatDate(player.membershipExpiresAt)
                            : "Nije postavljeno"}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="ui-pill ui-pill-button ui-pill--outline"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setRenewalState({
                                  playerId: player.id,
                                  nextDate: calculateNextMembershipDate(
                                    player.membershipExpiresAt,
                                  ),
                                });
                              }}
                            >
                              Obnovi članstvo
                            </button>
                            <button
                              className={`ui-pill ui-pill-button ${
                                canSuspend ? "ui-pill--signal" : "ui-pill--success"
                              }`}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                statusMutation.mutate({
                                  userId: player.user.id,
                                  accountStatus: canSuspend ? "SUSPENDED" : "ACTIVE",
                                });
                              }}
                            >
                              {canSuspend ? "Suspendiraj" : "Ponovno aktiviraj"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
            <section className="border-2 border-line bg-surface">
              <div className="border-b-2 border-line bg-panel px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  {formMode === "create" ? "Novi igrač" : "Uredi igrača"}
                </p>
                <h3 className="mt-2 text-xl font-bold uppercase">
                  {formMode === "create"
                    ? "Postavljanje novog igrača"
                    : selectedPlayer
                      ? `${selectedPlayer.user.firstName} ${selectedPlayer.user.lastName}`
                      : "Uređivanje igrača"}
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
                {selectedPlayer && formMode === "edit" ? (
                  <div className="flex flex-wrap gap-2">
                    <StatusChip status={selectedPlayer.user.accountStatus} />
                    <span
                      className={`ui-pill ${
                        selectedPlayer.gdprConsent ? "ui-pill--success" : "ui-pill--warning"
                      }`}
                    >
                      {selectedPlayer.gdprConsent ? "GDPR potvrđen" : "GDPR nedostaje"}
                    </span>
                    <span className="ui-pill ui-pill--outline">
                      Članstvo{" "}
                      <strong>
                        {selectedPlayer.membershipExpiresAt
                          ? formatDate(selectedPlayer.membershipExpiresAt)
                          : "nije postavljeno"}
                      </strong>
                    </span>
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
                      Datum rođenja
                    </span>
                    <input
                      className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, dateOfBirth: event.target.value }))
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
                      Članstvo vrijedi do
                    </span>
                    <input
                      className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                      type="date"
                      value={form.membershipExpiresAt}
                      onChange={(event) =>
                        setForm((current) => ({
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
                    checked={form.gdprConsent}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        gdprConsent: event.target.checked,
                      }))
                    }
                  />
                  <span className="text-sm font-bold uppercase">GDPR suglasnost potvrđena</span>
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
                        alt={form.firstName || "Pregled profila igrača"}
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

                  <div className="space-y-5">
                    <MultiSelectPanel
                      title="Dodjela kategorija"
                      items={categories.map((category) => ({
                        id: category.id,
                        label: category.name,
                        meta: formatDate(category.endDateOfBirth),
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

                    {isAdmin ? (
                      <div className="space-y-5">
                        <SearchMultiSelectPanel
                          title="Povezani roditelji"
                          items={parentSearchItems}
                          selectedItems={selectedParentItems}
                          searchValue={parentSearch}
                          isSearching={parentsQuery.isFetching}
                          onSearchChange={setParentSearch}
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

                        {form.parentIds.length > 0 ? (
                          <div className="border-2 border-line bg-white">
                            <div className="border-b-2 border-line bg-bg px-4 py-3">
                              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                                Primarni roditelj za kontakt
                              </p>
                            </div>
                            <div className="space-y-3 p-4">
                              {form.parentIds.map((parentId) => {
                                const parent =
                                  selectedParentOptions.find((entry) => entry.id === parentId) ??
                                  parents.find((entry) => entry.id === parentId) ??
                                  selectedPlayer?.parents.find(
                                    (assignment) => assignment.parentId === parentId,
                                  )?.parent;

                                if (!parent) {
                                  return null;
                                }

                                return (
                                  <label
                                    key={parentId}
                                    className={`flex cursor-pointer items-start gap-3 border-2 border-line px-3 py-3 ${
                                      form.primaryParentId === parentId
                                        ? "bg-panel"
                                        : "bg-white"
                                    }`}
                                  >
                                    <input
                                      className="mt-1 h-4 w-4 accent-accent"
                                      type="radio"
                                      name="primary-parent"
                                      checked={form.primaryParentId === parentId}
                                      onChange={() =>
                                        setForm((current) => ({
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
                    className="ui-pill ui-pill-button ui-pill--signal"
                    type="button"
                    disabled={
                      formMode !== "edit" ||
                      !selectedPlayer ||
                      createMutation.isPending ||
                      updateMutation.isPending ||
                      deleteMutation.isPending
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
                  <input
                    className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                    type="date"
                    value={renewalState.nextDate}
                    onChange={(event) =>
                      setRenewalState((current) =>
                        current ? { ...current, nextDate: event.target.value } : current,
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
  };
}

function buildPlayerFormData(form: PlayerFormState) {
  const formData = new FormData();
  formData.append("firstName", form.firstName);
  formData.append("lastName", form.lastName);
  formData.append("phone", form.phone);
  formData.append("dateOfBirth", form.dateOfBirth);
  formData.append("oib", form.oib);
  formData.append("gdprConsent", String(form.gdprConsent));
  formData.append("membershipExpiresAt", form.membershipExpiresAt);
  formData.append("categoryIds", JSON.stringify(form.categoryIds));
  formData.append("parentIds", JSON.stringify(form.parentIds));
  formData.append("primaryParentId", form.primaryParentId);

  if (form.profileFile) {
    formData.append("profileImage", form.profileFile);
  }

  return formData;
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
  items: Array<{ id: string; label: string; meta: string }>;
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="border-2 border-line bg-white">
      <div className="border-b-2 border-line bg-bg px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">{title}</p>
      </div>
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
