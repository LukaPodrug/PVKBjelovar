import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { type ChangeEvent, useEffect, useState } from "react";
import { api } from "../core/api";
import type { BoardMemberRecord, PaginatedResponse } from "../core/types";
import { EntityDrawer } from "../layout/entity-drawer";
import { FeedbackToast } from "../ui/feedback-toast";
import { PaginationControls } from "../ui/pagination-controls";

interface FeedbackState {
  tone: "success" | "error";
  message: string;
}

interface BoardMemberFormState {
  name: string;
  position: string;
  displayOrder: string;
  imageFile: File | null;
}

const emptyBoardMemberForm: BoardMemberFormState = {
  name: "",
  position: "",
  displayOrder: "0",
  imageFile: null,
};

const boardMembersPageSize = 25;

export function BoardMembersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedBoardMemberId, setSelectedBoardMemberId] = useState<string | null>(null);
  const [form, setForm] = useState<BoardMemberFormState>(emptyBoardMemberForm);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const boardMembersQuery = useQuery({
    queryKey: ["board-members", "management", page],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<BoardMemberRecord>>("/board-members", {
        params: {
          page,
          pageSize: boardMembersPageSize,
        },
      });
      return response.data;
    },
  });

  const boardMembersPageData = boardMembersQuery.data;
  const boardMembers = boardMembersPageData?.items ?? [];
  const selectedBoardMember =
    boardMembers.find((boardMember) => boardMember.id === selectedBoardMemberId) ?? null;
  const activeImageUrl = imagePreviewUrl ?? selectedBoardMember?.imageUrl ?? null;

  useEffect(() => {
    if (boardMembersPageData && page > boardMembersPageData.totalPages) {
      setPage(boardMembersPageData.totalPages);
    }
  }, [page, boardMembersPageData]);

  useEffect(() => {
    if (!form.imageFile) {
      setImagePreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(form.imageFile);
    setImagePreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [form.imageFile]);

  const createMutation = useMutation({
    mutationFn: async () => {
      ensureBoardMemberFormIsValid(form, "create");
      const response = await api.post<BoardMemberRecord>(
        "/board-members",
        buildBoardMemberFormData(form, "create"),
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );
      return response.data;
    },
    onSuccess: (boardMember) => {
      setFeedback({
        tone: "success",
        message: `Član uprave ${boardMember.name} uspješno je dodan.`,
      });
      setSelectedBoardMemberId(boardMember.id);
      setForm(createFormFromBoardMember(boardMember));
      setIsDrawerOpen(true);
      void queryClient.invalidateQueries({ queryKey: ["board-members"] });
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: getMutationErrorMessage(error, "Dodavanje člana uprave nije uspjelo."),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBoardMember) {
        throw new Error("Nijedan član uprave nije odabran.");
      }

      ensureBoardMemberFormIsValid(form, "edit");
      const response = await api.patch<BoardMemberRecord>(
        `/board-members/${selectedBoardMember.id}`,
        buildBoardMemberFormData(form, "edit"),
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );
      return response.data;
    },
    onSuccess: (boardMember) => {
      setFeedback({
        tone: "success",
        message: `Član uprave ${boardMember.name} uspješno je ažuriran.`,
      });
      setSelectedBoardMemberId(boardMember.id);
      setForm(createFormFromBoardMember(boardMember));
      setIsDrawerOpen(true);
      void queryClient.invalidateQueries({ queryKey: ["board-members"] });
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: getMutationErrorMessage(error, "Ažuriranje člana uprave nije uspjelo."),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBoardMember) {
        throw new Error("Nijedan član uprave nije odabran.");
      }

      await api.delete(`/board-members/${selectedBoardMember.id}`);
    },
    onSuccess: () => {
      const deletedName = selectedBoardMember?.name ?? "Član uprave";

      setFeedback({
        tone: "success",
        message: `${deletedName} je uspješno obrisan.`,
      });
      setSelectedBoardMemberId(null);
      setForm(emptyBoardMemberForm);
      setIsDrawerOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["board-members"] });
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: getMutationErrorMessage(error, "Brisanje člana uprave nije uspjelo."),
      });
    },
  });

  const openCreateForm = () => {
    setFeedback(null);
    setSelectedBoardMemberId(null);
    setForm(emptyBoardMemberForm);
    setIsDrawerOpen(true);
  };

  const openEditForm = (boardMember: BoardMemberRecord) => {
    setFeedback(null);
    setSelectedBoardMemberId(boardMember.id);
    setForm(createFormFromBoardMember(boardMember));
    setIsDrawerOpen(true);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <section className="space-y-6">
      <FeedbackToast feedback={feedback} onClose={() => setFeedback(null)} />

      <section className="border-2 border-line bg-surface">
        <div className="flex flex-col gap-4 border-b-2 border-line bg-panel px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
              Vodstvo kluba
            </p>
            <h3 className="mt-2 text-xl font-bold uppercase">Uprava</h3>
          </div>
          <button
            className="ui-pill ui-pill-button ui-pill--accent"
            type="button"
            onClick={openCreateForm}
          >
            Novi član
          </button>
        </div>

        {boardMembersQuery.isLoading ? (
          <div className="h-[420px] animate-pulse bg-panel" />
        ) : boardMembersQuery.isError ? (
          <div className="border-b-2 border-line bg-signal px-5 py-4 text-sm font-medium text-surface">
            Članove uprave trenutno nije moguće učitati.
          </div>
        ) : boardMembers.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-medium text-muted">
              Dodajte prvog člana uprave kako bi se prikazao na javnoj stranici.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead className="bg-bg">
                <tr className="border-b-2 border-line text-center text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  <th className="px-4 py-4">Član</th>
                  <th className="px-4 py-4">Pozicija</th>
                  <th className="px-4 py-4">Redoslijed</th>
                </tr>
              </thead>
              <tbody>
                {boardMembers.map((boardMember) => {
                  const isSelected = selectedBoardMemberId === boardMember.id;

                  return (
                    <tr
                      key={boardMember.id}
                      className={`cursor-pointer border-b-2 border-line ${
                        isSelected ? "bg-panel" : "bg-white hover:bg-bg"
                      }`}
                      onClick={() => openEditForm(boardMember)}
                    >
                      <td className="px-4 py-4 align-middle">
                        <div className="flex items-center justify-center gap-3">
                          <span className="board-member-table-image">
                            <img src={boardMember.imageUrl} alt={boardMember.name} />
                          </span>
                          <strong className="text-sm">{boardMember.name}</strong>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-middle text-center text-sm font-medium">
                        {boardMember.position}
                      </td>
                      <td className="px-4 py-4 align-middle text-center text-sm">
                        {boardMember.displayOrder}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {boardMembersPageData ? (
          <PaginationControls
            page={boardMembersPageData.page}
            pageSize={boardMembersPageData.pageSize}
            total={boardMembersPageData.total}
            totalPages={boardMembersPageData.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </section>

      <EntityDrawer
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        eyebrow={selectedBoardMember ? "Uredi člana" : "Novi član"}
        title={selectedBoardMember?.name ?? "Podaci za javnu stranicu"}
      >
        <form
          className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setFeedback(null);

            if (selectedBoardMember) {
              updateMutation.mutate();
              return;
            }

            createMutation.mutate();
          }}
        >
          <div className="board-member-image-card">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
              Slika
            </p>
            {activeImageUrl ? (
              <img
                className="board-member-image-preview"
                src={activeImageUrl}
                alt={form.name || "Pregled slike člana uprave"}
              />
            ) : (
              <div className="board-member-image-placeholder">Učitaj sliku</div>
            )}
            <input
              id="board-member-image-upload"
              className="board-member-image-input"
              type="file"
              accept="image/*"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setForm((current) => ({
                  ...current,
                  imageFile: event.target.files?.[0] ?? null,
                }));
              }}
            />
            <label className="ui-pill ui-pill-button ui-pill--accent" htmlFor="board-member-image-upload">
              {activeImageUrl ? "Promijeni sliku" : "Odaberi sliku"}
            </label>
          </div>

          <div className="grid content-start gap-5">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  Ime i prezime
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
                  placeholder="Ime Prezime"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  Pozicija
                </span>
                <input
                  className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                  type="text"
                  value={form.position}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      position: event.target.value,
                    }))
                  }
                  placeholder="Predsjednik, direktor..."
                  required
                />
              </label>
            </div>

            {selectedBoardMember ? (
              <label className="block">
                <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  Redoslijed
                </span>
                <input
                  className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                  type="number"
                  min={0}
                  step={1}
                  value={form.displayOrder}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      displayOrder: event.target.value,
                    }))
                  }
                />
              </label>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                className="ui-pill ui-pill-button ui-pill--accent"
                type="submit"
                disabled={isSaving}
              >
                {isSaving ? "Spremanje..." : selectedBoardMember ? "Spremi promjene" : "Dodaj člana"}
              </button>
              {selectedBoardMember ? (
                <button
                  className="ui-pill ui-pill-button ui-pill--signal"
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (!window.confirm(`Obrisati člana uprave ${selectedBoardMember.name}?`)) {
                      return;
                    }

                    setFeedback(null);
                    deleteMutation.mutate();
                  }}
                >
                  {deleteMutation.isPending ? "Brisanje..." : "Obriši"}
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </EntityDrawer>
    </section>
  );
}

function createFormFromBoardMember(boardMember: BoardMemberRecord): BoardMemberFormState {
  return {
    name: boardMember.name,
    position: boardMember.position,
    displayOrder: String(boardMember.displayOrder),
    imageFile: null,
  };
}

function buildBoardMemberFormData(form: BoardMemberFormState, mode: "create" | "edit") {
  const formData = new FormData();
  formData.append("name", form.name);
  formData.append("position", form.position);

  if (mode === "edit") {
    formData.append("displayOrder", form.displayOrder || "0");
  }

  if (form.imageFile) {
    formData.append("image", form.imageFile);
  }

  return formData;
}

function ensureBoardMemberFormIsValid(form: BoardMemberFormState, mode: "create" | "edit") {
  if (!form.name.trim()) {
    throw new Error("Unesite ime i prezime člana uprave.");
  }

  if (!form.position.trim()) {
    throw new Error("Unesite poziciju člana uprave.");
  }

  if (mode === "create" && !form.imageFile) {
    throw new Error("Dodajte sliku člana uprave.");
  }
}

function getMutationErrorMessage(error: AxiosError<{ message?: string }> | Error, fallback: string) {
  if ("response" in error) {
    return error.response?.data?.message ?? fallback;
  }

  return error.message || fallback;
}
