import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { type ChangeEvent, useDeferredValue, useEffect, useState } from "react";
import { api } from "../core/api";
import { formatDate } from "../core/date";
import type { AccountStatus, PaginatedResponse, ParentRecord, PlayerRecord, PlayerSummary } from "../core/types";
import { EntityDrawer } from "../layout/entity-drawer";
import { PaginationControls } from "../ui/pagination-controls";
import { SearchMultiSelectPanel } from "../ui/search-multi-select-panel";

interface FeedbackState {
  tone: "success" | "error";
  message: string;
}

interface ParentFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  playerIds: string[];
  primaryPlayerIds: string[];
  profileFile: File | null;
}

const emptyParentForm: ParentFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "",
  playerIds: [],
  primaryPlayerIds: [],
  profileFile: null,
};

const managementPageSize = 25;
const optionPageSize = 20;

export function ParentsPage() {
  const queryClient = useQueryClient();
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<ParentFormState>(emptyParentForm);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [profilePreviewUrl, setProfilePreviewUrl] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [parentsPage, setParentsPage] = useState(1);
  const [parentManagementSearch, setParentManagementSearch] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const [selectedPlayerOptions, setSelectedPlayerOptions] = useState<PlayerSummary[]>([]);
  const deferredParentManagementSearch = useDeferredValue(parentManagementSearch.trim());
  const deferredPlayerSearch = useDeferredValue(playerSearch.trim());

  const parentsQuery = useQuery({
    queryKey: ["parents", "management", parentsPage, deferredParentManagementSearch],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<ParentRecord>>("/parents", {
        params: {
          page: parentsPage,
          pageSize: managementPageSize,
          search: deferredParentManagementSearch || undefined,
        },
      });
      return response.data;
    },
  });

  const playersQuery = useQuery({
    queryKey: ["players", "parent-options", deferredPlayerSearch],
    enabled: deferredPlayerSearch.length > 0,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlayerRecord>>("/players", {
        params: { page: 1, pageSize: optionPageSize, search: deferredPlayerSearch },
      });
      return response.data.items;
    },
  });

  const parentsPageData = parentsQuery.data;
  const parents = parentsPageData?.items ?? [];
  const players = playersQuery.data ?? [];
  const selectedParent = parents.find((parent) => parent.id === selectedParentId) ?? null;
  const playerSearchItems = players.map(playerToSearchItem);
  const selectedPlayerItems = form.playerIds
    .map((playerId) =>
      selectedPlayerOptions.find((player) => player.id === playerId) ??
      players.find((player) => player.id === playerId) ??
      selectedParent?.players.find((assignment) => assignment.playerId === playerId)?.player ??
      null,
    )
    .filter((player): player is PlayerSummary => Boolean(player))
    .map(playerToSearchItem);

  useEffect(() => {
    if (!selectedParentId && parents.length > 0 && formMode === "edit") {
      const nextParent = parents[0];
      setSelectedParentId(nextParent.id);
      setForm(createFormFromParent(nextParent));
      setSelectedPlayerOptions(nextParent.players.map((assignment) => assignment.player));
    }
  }, [formMode, parents, selectedParentId]);

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
    setSelectedParentId(null);
    setForm(emptyParentForm);
    setSelectedPlayerOptions([]);
    setPlayerSearch("");
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (parent: ParentRecord) => {
    setFeedback(null);
    setFormMode("edit");
    setSelectedParentId(parent.id);
    setForm(createFormFromParent(parent));
    setSelectedPlayerOptions(parent.players.map((assignment) => assignment.player));
    setPlayerSearch("");
    setIsDrawerOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<ParentRecord>("/parents", buildParentFormData(form, true), {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return response.data;
    },
    onSuccess: (createdParent) => {
      setFeedback({
        tone: "success",
        message: `Roditelj ${createdParent.user.firstName} ${createdParent.user.lastName} uspješno je kreiran.`,
      });
      setFormMode("edit");
      setSelectedParentId(createdParent.id);
      setForm(createFormFromParent(createdParent));
      setSelectedPlayerOptions(createdParent.players.map((assignment) => assignment.player));
      setIsDrawerOpen(true);
      void invalidateParentQueries(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Kreiranje roditelja nije uspjelo.",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedParent) {
        throw new Error("Nijedan roditelj nije odabran.");
      }

      const response = await api.patch<ParentRecord>(
        `/parents/${selectedParent.id}`,
        buildParentFormData(form, false),
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      return response.data;
    },
    onSuccess: (updatedParent) => {
      setFeedback({
        tone: "success",
        message: `Roditelj ${updatedParent.user.firstName} ${updatedParent.user.lastName} uspješno je ažuriran.`,
      });
      setSelectedParentId(updatedParent.id);
      setForm(createFormFromParent(updatedParent));
      setSelectedPlayerOptions(updatedParent.players.map((assignment) => assignment.player));
      setIsDrawerOpen(true);
      void invalidateParentQueries(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Ažuriranje roditelja nije uspjelo.",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedParent) {
        throw new Error("Nijedan roditelj nije odabran.");
      }

      await api.delete(`/parents/${selectedParent.id}`);
    },
    onSuccess: () => {
      const deletedName = selectedParent
        ? `${selectedParent.user.firstName} ${selectedParent.user.lastName}`
        : "Roditelj";

      setFeedback({
        tone: "success",
        message: `Roditelj ${deletedName} uspješno je obrisan.`,
      });
      setSelectedParentId(null);
      setFormMode("create");
      setForm(emptyParentForm);
      setIsDrawerOpen(false);

      void invalidateParentQueries(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Brisanje roditelja nije uspjelo.",
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
            ? "Račun roditelja je suspendiran."
            : "Račun roditelja je ponovno aktiviran.",
      });
      void invalidateParentQueries(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Promjena statusa roditelja nije uspjela.",
      });
    },
  });

  const activeProfileUrl = profilePreviewUrl ?? selectedParent?.user.profileImageUrl ?? null;

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

      {parentsQuery.isLoading ? (
        <div className="space-y-4">
          <div className="h-[720px] animate-pulse border-2 border-line bg-panel" />
        </div>
      ) : parentsQuery.isError ? (
        <div className="border-2 border-line bg-signal px-5 py-4 text-sm font-medium text-surface">
          Roditelje trenutno nije moguće učitati.
        </div>
      ) : (
        <>
          <section className="border-2 border-line bg-surface">
            <div className="flex flex-col gap-4 border-b-2 border-line bg-panel px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  Popis roditelja
                </p>
                <h3 className="mt-2 text-xl font-bold uppercase">Kontakti</h3>
              </div>
              <button
                className="ui-pill ui-pill-button ui-pill--accent"
                type="button"
                onClick={openCreateDrawer}
              >
                Novi roditelj
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
                  value={parentManagementSearch}
                  onChange={(event) => {
                    setParentManagementSearch(event.target.value);
                    setParentsPage(1);
                  }}
                  placeholder="Ime, e-pošta, telefon ili dijete"
                />
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead className="bg-bg">
                  <tr className="border-b-2 border-line text-left text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    <th className="px-4 py-4">Roditelj</th>
                    <th className="px-4 py-4">E-pošta</th>
                    <th className="px-4 py-4">Djeca</th>
                    <th className="px-4 py-4">Status</th>
                    <th className="px-4 py-4">Radnje</th>
                  </tr>
                </thead>
                <tbody>
                  {parents.map((parent) => {
                    const isSelected =
                      isDrawerOpen && selectedParentId === parent.id && formMode === "edit";
                    const canSuspend = parent.user.accountStatus !== "SUSPENDED";

                    return (
                      <tr
                        key={parent.id}
                        className={`cursor-pointer border-b-2 border-line ${
                          isSelected ? "bg-panel" : "bg-white hover:bg-bg"
                        }`}
                        onClick={() => openEditDrawer(parent)}
                      >
                        <td className="px-4 py-4 align-top">
                          <p className="text-sm font-bold uppercase">
                            {parent.user.firstName} {parent.user.lastName}
                          </p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted">
                            {parent.user.phone ?? "Bez telefona"}
                          </p>
                        </td>
                        <td className="px-4 py-4 align-top text-sm">
                          {parent.user.email ?? "Bez e-pošte"}
                        </td>
                        <td className="px-4 py-4 align-top text-sm">{parent.players.length}</td>
                        <td className="px-4 py-4 align-top">
                          <StatusChip status={parent.user.accountStatus} />
                        </td>
                        <td className="px-4 py-4 align-top">
                          <button
                            className={`ui-pill ui-pill-button ${
                              canSuspend ? "ui-pill--signal" : "ui-pill--success"
                            }`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              statusMutation.mutate({
                                userId: parent.user.id,
                                accountStatus: canSuspend ? "SUSPENDED" : "ACTIVE",
                              });
                            }}
                          >
                            {canSuspend ? "Suspendiraj" : "Ponovno aktiviraj"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {parentsPageData ? (
              <PaginationControls
                page={parentsPageData.page}
                pageSize={parentsPageData.pageSize}
                total={parentsPageData.total}
                totalPages={parentsPageData.totalPages}
                onPageChange={setParentsPage}
              />
            ) : null}
          </section>

          <EntityDrawer
            open={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            eyebrow={formMode === "create" ? "Novi roditelj" : "Uredi roditelja"}
            title={
              formMode === "create"
                ? "Postavljanje novog roditelja"
                : selectedParent
                  ? `${selectedParent.user.firstName} ${selectedParent.user.lastName}`
                  : "Pregled roditelja"
            }
          >
            <section className="border-2 border-line bg-surface">
              <div className="border-b-2 border-line bg-panel px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  {formMode === "create" ? "Novi roditelj" : "Uredi roditelja"}
                </p>
                <h3 className="mt-2 text-xl font-bold uppercase">
                  {formMode === "create"
                    ? "Postavljanje novog roditelja"
                    : selectedParent
                      ? `${selectedParent.user.firstName} ${selectedParent.user.lastName}`
                      : "Uređivanje roditelja"}
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
                {selectedParent && formMode === "edit" ? (
                  <div className="flex flex-wrap gap-2">
                    <StatusChip status={selectedParent.user.accountStatus} />
                    <span className="ui-pill ui-pill--panel">
                      Djeca <strong>{selectedParent.players.length}</strong>
                    </span>
                    <span className="ui-pill ui-pill--outline">Kontakt spreman</span>
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
                      required
                    />
                  </label>
                </div>

                {formMode === "create" ? (
                  <label className="block">
                    <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                      Lozinka
                    </span>
                    <input
                      className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                      type="password"
                      value={form.password}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, password: event.target.value }))
                      }
                      required
                    />
                  </label>
                ) : null}

                <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                      Pregled profila
                    </p>
                    {activeProfileUrl ? (
                      <img
                        className="h-44 w-full border-2 border-line object-cover"
                        src={activeProfileUrl}
                        alt={form.firstName || "Pregled profila roditelja"}
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
                    <SearchMultiSelectPanel
                      title="Povezana djeca"
                      items={playerSearchItems}
                      selectedItems={selectedPlayerItems}
                      searchValue={playerSearch}
                      isSearching={playersQuery.isFetching}
                      onSearchChange={setPlayerSearch}
                      searchPlaceholder="Pretraga djece"
                      noResultsLabel="Nema djece koja odgovaraju pretrazi."
                      selectedIds={form.playerIds}
                      onToggle={(id) => {
                        setForm((current) => {
                          const nextPlayerIds = current.playerIds.includes(id)
                            ? current.playerIds.filter((playerId) => playerId !== id)
                            : [...current.playerIds, id];
                          const selectedPlayer = players.find((player) => player.id === id);

                          setSelectedPlayerOptions((currentOptions) =>
                            current.playerIds.includes(id)
                              ? currentOptions.filter((player) => player.id !== id)
                              : selectedPlayer &&
                                  !currentOptions.some((player) => player.id === id)
                                ? [...currentOptions, selectedPlayer]
                                : currentOptions,
                          );

                          return {
                            ...current,
                            playerIds: nextPlayerIds,
                            primaryPlayerIds: current.primaryPlayerIds.filter((playerId) =>
                              nextPlayerIds.includes(playerId),
                            ),
                          };
                        });
                      }}
                    />

                    {form.playerIds.length > 0 ? (
                      <div className="border-2 border-line bg-white">
                        <div className="border-b-2 border-line bg-bg px-4 py-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                            Primarni kontakt za
                          </p>
                        </div>
                        <div className="space-y-3 p-4">
                          {form.playerIds.map((playerId) => {
                            const player =
                              selectedPlayerOptions.find((entry) => entry.id === playerId) ??
                              players.find((entry) => entry.id === playerId) ??
                              selectedParent?.players.find(
                                (assignment) => assignment.playerId === playerId,
                              )?.player;

                            if (!player) {
                              return null;
                            }

                            const isPrimary = form.primaryPlayerIds.includes(playerId);

                            return (
                              <label
                                key={playerId}
                                className={`flex cursor-pointer items-start gap-3 border-2 border-line px-3 py-3 ${
                                  isPrimary ? "bg-panel" : "bg-white"
                                }`}
                              >
                                <input
                                  className="mt-1 h-4 w-4 accent-accent"
                                  type="checkbox"
                                  checked={isPrimary}
                                  onChange={() =>
                                    setForm((current) => ({
                                      ...current,
                                      primaryPlayerIds: isPrimary
                                        ? current.primaryPlayerIds.filter((id) => id !== playerId)
                                        : [...current.primaryPlayerIds, playerId],
                                    }))
                                  }
                                />
                                <span>
                                  <span className="block text-sm font-bold uppercase">
                                    {player.user.firstName} {player.user.lastName}
                                  </span>
                                  <span className="mt-1 block text-[11px] uppercase tracking-[0.2em] text-muted">
                                    Datum rođenja {formatDate(player.dateOfBirth)}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
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
                        : "Kreiraj roditelja"
                      : updateMutation.isPending
                        ? "Spremanje..."
                        : "Spremi promjene"}
                  </button>
                  <button
                    className="ui-pill ui-pill-button ui-pill--panel"
                    type="button"
                    onClick={() => {
                      setFeedback(null);

                      if (formMode === "edit" && selectedParent) {
                        setForm(createFormFromParent(selectedParent));
                        return;
                      }

                      setForm(emptyParentForm);
                    }}
                  >
                    Resetiraj obrazac
                  </button>
                  <button
                    className="ui-pill ui-pill-button ui-pill--signal"
                    type="button"
                    disabled={
                      formMode !== "edit" ||
                      !selectedParent ||
                      createMutation.isPending ||
                      updateMutation.isPending ||
                      deleteMutation.isPending
                    }
                    onClick={() => deleteMutation.mutate()}
                  >
                    {deleteMutation.isPending ? "Brisanje..." : "Obriši roditelja"}
                  </button>
                </div>
              </form>
            </section>
          </EntityDrawer>
        </>
      )}
    </section>
  );
}

function createFormFromParent(parent: ParentRecord): ParentFormState {
  return {
    firstName: parent.user.firstName,
    lastName: parent.user.lastName,
    email: parent.user.email ?? "",
    phone: parent.user.phone ?? "",
    password: "",
    playerIds: parent.players.map((assignment) => assignment.playerId),
    primaryPlayerIds: parent.players
      .filter((assignment) => assignment.isPrimaryContact)
      .map((assignment) => assignment.playerId),
    profileFile: null,
  };
}

function buildParentFormData(form: ParentFormState, includePassword: boolean) {
  const formData = new FormData();
  formData.append("firstName", form.firstName);
  formData.append("lastName", form.lastName);
  formData.append("email", form.email);
  formData.append("phone", form.phone);
  formData.append("playerIds", JSON.stringify(form.playerIds));
  formData.append("primaryPlayerIds", JSON.stringify(form.primaryPlayerIds));

  if (includePassword) {
    formData.append("password", form.password);
  }

  if (form.profileFile) {
    formData.append("profileImage", form.profileFile);
  }

  return formData;
}

async function invalidateParentQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ["parents"] });
  await queryClient.invalidateQueries({ queryKey: ["players"] });
}

function playerToSearchItem(player: PlayerSummary) {
  return {
    id: player.id,
    label: `${player.user.firstName} ${player.user.lastName}`,
    meta: formatDate(player.dateOfBirth),
    keywords: [player.user.firstName, player.user.lastName, player.oib],
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
