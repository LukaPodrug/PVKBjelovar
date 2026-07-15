import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { type ChangeEvent, useEffect, useState } from "react";
import { api } from "../core/api";
import { formatDate } from "../core/date";
import type {
  AccountStatus,
  CredentialResetResult,
  PaginatedResponse,
  ParentRecord,
  PlayerRecord,
  PlayerSummary,
} from "../core/types";
import { EntityDrawer } from "../layout/entity-drawer";
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

interface ParentFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  playerIds: string[];
  profileFile: File | null;
  removeProfileImage: boolean;
}

interface QuickPlayerFormState {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  oib: string;
  gdprConsent: boolean;
}

const emptyParentForm: ParentFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  playerIds: [],
  profileFile: null,
  removeProfileImage: false,
};

const emptyQuickPlayerForm: QuickPlayerFormState = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  oib: "",
  gdprConsent: false,
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
  const [isQuickPlayerFormOpen, setIsQuickPlayerFormOpen] = useState(false);
  const [quickPlayerForm, setQuickPlayerForm] =
    useState<QuickPlayerFormState>(emptyQuickPlayerForm);
  const debouncedParentManagementSearch = useDebouncedValue(parentManagementSearch.trim());
  const debouncedPlayerSearch = useDebouncedValue(playerSearch.trim());

  const parentsQuery = useQuery({
    queryKey: ["parents", "management", parentsPage, debouncedParentManagementSearch],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<ParentRecord>>("/parents", {
        params: {
          page: parentsPage,
          pageSize: managementPageSize,
          search: debouncedParentManagementSearch || undefined,
        },
      });
      return response.data;
    },
  });

  const playersQuery = useQuery({
    queryKey: ["players", "parent-options", debouncedPlayerSearch],
    enabled: debouncedPlayerSearch.length > 0,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlayerRecord>>("/players", {
        params: { page: 1, pageSize: optionPageSize, search: debouncedPlayerSearch },
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
    setIsQuickPlayerFormOpen(false);
    setQuickPlayerForm(emptyQuickPlayerForm);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (parent: ParentRecord) => {
    setFeedback(null);
    setFormMode("edit");
    setSelectedParentId(parent.id);
    setForm(createFormFromParent(parent));
    setSelectedPlayerOptions(parent.players.map((assignment) => assignment.player));
    setPlayerSearch("");
    setIsQuickPlayerFormOpen(false);
    setQuickPlayerForm(emptyQuickPlayerForm);
    setIsDrawerOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<ParentRecord>("/parents", buildParentFormData(form), {
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

  const quickPlayerMutation = useMutation({
    mutationFn: async () => {
      if (!selectedParent) {
        throw new Error("Roditelj mora biti spremljen prije dodavanja djeteta.");
      }

      const formData = new FormData();
      formData.append("firstName", quickPlayerForm.firstName);
      formData.append("lastName", quickPlayerForm.lastName);
      formData.append("phone", "");
      formData.append("dateOfBirth", quickPlayerForm.dateOfBirth);
      formData.append("oib", quickPlayerForm.oib);
      formData.append("gdprConsent", String(quickPlayerForm.gdprConsent));
      formData.append("membershipExpiresAt", "");
      formData.append("categoryIds", JSON.stringify([]));
      formData.append("parentIds", JSON.stringify([selectedParent.id]));
      formData.append("primaryParentId", selectedParent.id);

      const response = await api.post<PlayerRecord>("/players", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return response.data;
    },
    onSuccess: (createdPlayer) => {
      setSelectedPlayerOptions((currentOptions) =>
        currentOptions.some((player) => player.id === createdPlayer.id)
          ? currentOptions
          : [...currentOptions, createdPlayer],
      );
      setForm((current) => ({
        ...current,
        playerIds: current.playerIds.includes(createdPlayer.id)
          ? current.playerIds
          : [...current.playerIds, createdPlayer.id],
      }));
      setQuickPlayerForm(emptyQuickPlayerForm);
      setIsQuickPlayerFormOpen(false);
      setPlayerSearch("");
      setFeedback({
        tone: "success",
        message: `Dijete ${createdPlayer.user.firstName} ${createdPlayer.user.lastName} je dodano i povezano.`,
      });
      void invalidateParentQueries(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message:
          error.response?.data?.message ??
          "Brzo dodavanje djeteta nije uspjelo.",
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
        buildParentFormData(form),
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

  const resendCredentialsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedParent) {
        throw new Error("Nijedan roditelj nije odabran.");
      }

      const response = await api.post<CredentialResetResult>(
        `/parents/${selectedParent.id}/resend-credentials`,
      );

      return response.data;
    },
    onSuccess: (result) => {
      setFeedback({
        tone: "success",
        message: result.message,
      });
      void invalidateParentQueries(queryClient);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message:
          error.response?.data?.message ??
          "Slanje pristupnih podataka roditelju nije uspjelo.",
      });
    },
  });

  const activeProfileUrl = form.removeProfileImage
    ? null
    : profilePreviewUrl ?? selectedParent?.user.profileImageUrl ?? null;
  const isParentsRefetching = parentsQuery.isFetching && !parentsQuery.isLoading;

  return (
    <section className="space-y-6">
      <FeedbackToast feedback={feedback} onClose={() => setFeedback(null)} />

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
                  placeholder="Ime i prezime"
                />
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead className="bg-bg">
                  <tr className="border-b-2 border-line text-center text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    <th className="px-4 py-4">Roditelj</th>
                    <th className="px-4 py-4">E-pošta</th>
                    <th className="px-4 py-4">Telefon</th>
                    <th className="px-4 py-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isParentsRefetching ? (
                    <TableLoadingRows columns={4} />
                  ) : (
                  parents.map((parent) => {
                    const isSelected =
                      isDrawerOpen && selectedParentId === parent.id && formMode === "edit";

                    return (
                      <tr
                        key={parent.id}
                        className={`cursor-pointer border-b-2 border-line ${
                          isSelected ? "bg-panel" : "bg-white hover:bg-bg"
                        }`}
                        onClick={() => openEditDrawer(parent)}
                      >
                        <td className="px-4 py-4 align-middle text-center">
                          <p className="text-sm font-bold uppercase">
                            {parent.user.firstName} {parent.user.lastName}
                          </p>
                        </td>
                        <td className="px-4 py-4 align-middle text-center text-sm">
                          {parent.user.email ?? "Bez e-pošte"}
                        </td>
                        <td className="px-4 py-4 align-middle text-center text-sm">
                          {parent.user.phone ?? "Bez telefona"}
                        </td>
                        <td className="px-4 py-4 align-middle text-center">
                          <StatusChip status={parent.user.accountStatus} />
                        </td>
                      </tr>
                    );
                  })
                  )}
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
            <section className="parent-drawer">
              <form
                className="parent-drawer-form"
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
                <fieldset className="parent-widget">
                  <legend className="parent-widget-title">Osnovni podaci</legend>
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
                </fieldset>

                <fieldset className="parent-widget parent-widget--wide">
                  <legend className="parent-widget-title">Profil i djeca</legend>
                <div className="parent-profile-grid">
                  <div className="parent-profile-card">
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                      Pregled profila
                    </p>
                    {activeProfileUrl ? (
                      <img
                        className="parent-profile-preview"
                        src={activeProfileUrl}
                        alt={form.firstName || "Pregled profila roditelja"}
                      />
                    ) : (
                      <div className="parent-profile-placeholder">
                        Učitaj profilnu fotografiju
                      </div>
                    )}
                    <input
                      id="parent-profile-upload"
                      className="parent-profile-input"
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
                    <div className="parent-profile-actions">
                      <label className="ui-pill ui-pill-button ui-pill--accent" htmlFor="parent-profile-upload">
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
                              removeProfileImage: Boolean(selectedParent?.user.profileImageUrl),
                            }))
                          }
                        >
                          Ukloni fotografiju
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="parent-assignment-stack">
                    <SearchMultiSelectPanel
                      title="Povezana djeca"
                      className="parent-selector-panel"
                      items={playerSearchItems}
                      selectedItems={selectedPlayerItems}
                      searchValue={playerSearch}
                      isSearching={playersQuery.isFetching}
                      onSearchChange={setPlayerSearch}
                      actionLabel={isQuickPlayerFormOpen ? "Zatvori dodavanje" : "Dodaj dijete"}
                      actionDisabled={formMode !== "edit" || !selectedParent || quickPlayerMutation.isPending}
                      onAction={() => setIsQuickPlayerFormOpen((isOpen) => !isOpen)}
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
                          };
                        });
                      }}
                    />
                    {isQuickPlayerFormOpen ? (
                      <div className="rounded-[22px] border-2 border-line bg-white p-4">
                        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                            Novo dijete
                          </p>
                          <p className="text-sm leading-6 text-muted">
                            Nakon kreiranja bit će odmah povezano s ovim roditeljem.
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
                              value={quickPlayerForm.firstName}
                              onChange={(event) =>
                                setQuickPlayerForm((current) => ({
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
                              value={quickPlayerForm.lastName}
                              onChange={(event) =>
                                setQuickPlayerForm((current) => ({
                                  ...current,
                                  lastName: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="block">
                            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
                              Datum rođenja
                            </span>
                            <DatePicker
                              className="w-full rounded-[18px] border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                              value={quickPlayerForm.dateOfBirth}
                              onChange={(value) =>
                                setQuickPlayerForm((current) => ({
                                  ...current,
                                  dateOfBirth: value,
                                }))
                              }
                            />
                          </label>
                          <label className="block">
                            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
                              OIB
                            </span>
                            <input
                              className="w-full rounded-[18px] border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                              type="text"
                              value={quickPlayerForm.oib}
                              onChange={(event) =>
                                setQuickPlayerForm((current) => ({
                                  ...current,
                                  oib: event.target.value,
                                }))
                              }
                            />
                          </label>
                        </div>
                        <label className="mt-4 flex items-start gap-3 rounded-[18px] border-2 border-line bg-bg px-4 py-3">
                          <input
                            className="mt-1 h-4 w-4 accent-accent"
                            type="checkbox"
                            checked={quickPlayerForm.gdprConsent}
                            onChange={(event) =>
                              setQuickPlayerForm((current) => ({
                                ...current,
                                gdprConsent: event.target.checked,
                              }))
                            }
                          />
                          <span className="text-sm font-bold uppercase">
                            GDPR suglasnost potvrđena
                          </span>
                        </label>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            className="ui-pill ui-pill-button ui-pill--accent"
                            type="button"
                            disabled={quickPlayerMutation.isPending}
                            onClick={() => quickPlayerMutation.mutate()}
                          >
                            {quickPlayerMutation.isPending ? "Dodavanje..." : "Dodaj i poveži"}
                          </button>
                          <button
                            className="ui-pill ui-pill-button ui-pill--panel"
                            type="button"
                            disabled={quickPlayerMutation.isPending}
                            onClick={() => {
                              setQuickPlayerForm(emptyQuickPlayerForm);
                              setIsQuickPlayerFormOpen(false);
                            }}
                          >
                            Odustani
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                </fieldset>

                <div className="parent-actions">
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
                    className={`ui-pill ui-pill-button ${
                      selectedParent?.user.accountStatus === "SUSPENDED"
                        ? "ui-pill--success"
                        : "ui-pill--signal"
                    }`}
                    type="button"
                    disabled={
                      formMode !== "edit" ||
                      !selectedParent ||
                      createMutation.isPending ||
                      updateMutation.isPending ||
                      deleteMutation.isPending ||
                      statusMutation.isPending ||
                      resendCredentialsMutation.isPending
                    }
                    onClick={() => {
                      if (!selectedParent) {
                        return;
                      }

                      statusMutation.mutate({
                        userId: selectedParent.user.id,
                        accountStatus:
                          selectedParent.user.accountStatus === "SUSPENDED"
                            ? "ACTIVE"
                            : "SUSPENDED",
                      });
                    }}
                  >
                    {selectedParent?.user.accountStatus === "SUSPENDED"
                      ? "Ponovno aktiviraj"
                      : "Suspendiraj roditelja"}
                  </button>
                  <button
                    className="ui-pill ui-pill-button ui-pill--panel"
                    type="button"
                    disabled={
                      formMode !== "edit" ||
                      !selectedParent ||
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
                      !selectedParent ||
                      createMutation.isPending ||
                      updateMutation.isPending ||
                      deleteMutation.isPending ||
                      statusMutation.isPending ||
                      resendCredentialsMutation.isPending
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
    playerIds: parent.players.map((assignment) => assignment.playerId),
    profileFile: null,
    removeProfileImage: false,
  };
}

function buildParentFormData(form: ParentFormState) {
  const formData = new FormData();
  formData.append("firstName", form.firstName);
  formData.append("lastName", form.lastName);
  formData.append("email", form.email);
  formData.append("phone", form.phone);
  formData.append("playerIds", JSON.stringify(form.playerIds));
  formData.append("primaryPlayerIds", JSON.stringify([]));
  formData.append("removeProfileImage", String(form.removeProfileImage));

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
