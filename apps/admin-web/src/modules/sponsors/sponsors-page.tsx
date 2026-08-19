import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { type ChangeEvent, useEffect, useState } from "react";
import { api } from "../core/api";
import type { PaginatedResponse, SponsorRecord } from "../core/types";
import { EntityDrawer } from "../layout/entity-drawer";
import { FeedbackToast } from "../ui/feedback-toast";
import { PaginationControls } from "../ui/pagination-controls";

interface FeedbackState {
  tone: "success" | "error";
  message: string;
}

interface SponsorFormState {
  name: string;
  websiteUrl: string;
  displayOrder: string;
  logoFile: File | null;
}

const emptySponsorForm: SponsorFormState = {
  name: "",
  websiteUrl: "",
  displayOrder: "0",
  logoFile: null,
};

const sponsorsPageSize = 25;

export function SponsorsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedSponsorId, setSelectedSponsorId] = useState<string | null>(null);
  const [form, setForm] = useState<SponsorFormState>(emptySponsorForm);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const sponsorsQuery = useQuery({
    queryKey: ["sponsors", "management", page],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<SponsorRecord>>("/sponsors", {
        params: {
          page,
          pageSize: sponsorsPageSize,
        },
      });
      return response.data;
    },
  });

  const sponsorsPageData = sponsorsQuery.data;
  const sponsors = sponsorsPageData?.items ?? [];
  const selectedSponsor = sponsors.find((sponsor) => sponsor.id === selectedSponsorId) ?? null;
  const activeLogoUrl = logoPreviewUrl ?? selectedSponsor?.logoUrl ?? null;

  useEffect(() => {
    if (sponsorsPageData && page > sponsorsPageData.totalPages) {
      setPage(sponsorsPageData.totalPages);
    }
  }, [page, sponsorsPageData]);

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

  const createMutation = useMutation({
    mutationFn: async () => {
      ensureSponsorFormIsValid(form, "create");
      const response = await api.post<SponsorRecord>("/sponsors", buildSponsorFormData(form, "create"), {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      return response.data;
    },
    onSuccess: (sponsor) => {
      setFeedback({
        tone: "success",
        message: `Sponzor ${sponsor.name} uspješno je dodan.`,
      });
      setSelectedSponsorId(sponsor.id);
      setForm(createFormFromSponsor(sponsor));
      setIsDrawerOpen(true);
      void queryClient.invalidateQueries({ queryKey: ["sponsors"] });
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: getMutationErrorMessage(error, "Dodavanje sponzora nije uspjelo."),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSponsor) {
        throw new Error("Nijedan sponzor nije odabran.");
      }

      ensureSponsorFormIsValid(form, "edit");
      const response = await api.patch<SponsorRecord>(
        `/sponsors/${selectedSponsor.id}`,
        buildSponsorFormData(form, "edit"),
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );
      return response.data;
    },
    onSuccess: (sponsor) => {
      setFeedback({
        tone: "success",
        message: `Sponzor ${sponsor.name} uspješno je ažuriran.`,
      });
      setSelectedSponsorId(sponsor.id);
      setForm(createFormFromSponsor(sponsor));
      setIsDrawerOpen(true);
      void queryClient.invalidateQueries({ queryKey: ["sponsors"] });
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: getMutationErrorMessage(error, "Ažuriranje sponzora nije uspjelo."),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSponsor) {
        throw new Error("Nijedan sponzor nije odabran.");
      }

      await api.delete(`/sponsors/${selectedSponsor.id}`);
    },
    onSuccess: () => {
      const deletedName = selectedSponsor?.name ?? "Sponzor";

      setFeedback({
        tone: "success",
        message: `Sponzor ${deletedName} uspješno je obrisan.`,
      });
      setSelectedSponsorId(null);
      setForm(emptySponsorForm);
      setIsDrawerOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["sponsors"] });
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: getMutationErrorMessage(error, "Brisanje sponzora nije uspjelo."),
      });
    },
  });

  const openCreateForm = () => {
    setFeedback(null);
    setSelectedSponsorId(null);
    setForm(emptySponsorForm);
    setIsDrawerOpen(true);
  };

  const openEditForm = (sponsor: SponsorRecord) => {
    setFeedback(null);
    setSelectedSponsorId(sponsor.id);
    setForm(createFormFromSponsor(sponsor));
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
              Partneri kluba
            </p>
            <h3 className="mt-2 text-xl font-bold uppercase">Sponzori</h3>
          </div>
          <button
            className="ui-pill ui-pill-button ui-pill--accent"
            type="button"
            onClick={openCreateForm}
          >
            Novi sponzor
          </button>
        </div>

        {sponsorsQuery.isLoading ? (
          <div className="h-[420px] animate-pulse bg-panel" />
        ) : sponsorsQuery.isError ? (
          <div className="border-b-2 border-line bg-signal px-5 py-4 text-sm font-medium text-surface">
            Sponzore trenutno nije moguće učitati.
          </div>
        ) : sponsors.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-medium text-muted">
              Dodajte prvog sponzora kako bi se prikazao na javnoj stranici.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead className="bg-bg">
                <tr className="border-b-2 border-line text-center text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  <th className="px-4 py-4">Sponzor</th>
                  <th className="px-4 py-4">URL</th>
                  <th className="px-4 py-4">Redoslijed</th>
                </tr>
              </thead>
              <tbody>
                {sponsors.map((sponsor) => {
                  const isSelected = selectedSponsorId === sponsor.id;

                  return (
                    <tr
                      key={sponsor.id}
                      className={`cursor-pointer border-b-2 border-line ${
                        isSelected ? "bg-panel" : "bg-white hover:bg-bg"
                      }`}
                      onClick={() => openEditForm(sponsor)}
                    >
                      <td className="px-4 py-4 align-middle">
                        <div className="flex items-center justify-center gap-3">
                          <span className="sponsor-table-logo">
                            <img src={sponsor.logoUrl} alt={sponsor.name} />
                          </span>
                          <strong className="text-sm">{sponsor.name}</strong>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-middle text-center text-sm font-medium text-accent">
                        {sponsor.websiteUrl}
                      </td>
                      <td className="px-4 py-4 align-middle text-center text-sm">
                        {sponsor.displayOrder}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {sponsorsPageData ? (
          <PaginationControls
            page={sponsorsPageData.page}
            pageSize={sponsorsPageData.pageSize}
            total={sponsorsPageData.total}
            totalPages={sponsorsPageData.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </section>

      <EntityDrawer
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        eyebrow={selectedSponsor ? "Uredi sponzora" : "Novi sponzor"}
        title={selectedSponsor?.name ?? "Podaci za javnu stranicu"}
      >
        <form
          className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setFeedback(null);

            if (selectedSponsor) {
              updateMutation.mutate();
              return;
            }

            createMutation.mutate();
          }}
        >
          <div className="sponsor-logo-card">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
              Logo
            </p>
            {activeLogoUrl ? (
              <img
                className="sponsor-logo-preview"
                src={activeLogoUrl}
                alt={form.name || "Pregled loga sponzora"}
              />
            ) : (
              <div className="sponsor-logo-placeholder">Učitaj logo</div>
            )}
            <input
              id="sponsor-logo-upload"
              className="sponsor-logo-input"
              type="file"
              accept="image/*"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setForm((current) => ({
                  ...current,
                  logoFile: event.target.files?.[0] ?? null,
                }));
              }}
            />
            <label className="ui-pill ui-pill-button ui-pill--accent" htmlFor="sponsor-logo-upload">
              {activeLogoUrl ? "Promijeni logo" : "Odaberi logo"}
            </label>
          </div>

          <div className="grid content-start gap-5">
            <div className={`grid gap-5 ${selectedSponsor ? "md:grid-cols-2" : ""}`}>
              <label className="block">
                <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  Naziv
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
                  placeholder="Naziv sponzora"
                  required
                />
              </label>

              {selectedSponsor ? (
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
            </div>

            <label className="block">
              <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                Web stranica
              </span>
              <input
                className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                type="url"
                value={form.websiteUrl}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    websiteUrl: event.target.value,
                  }))
                }
                placeholder="https://sponzor.hr"
                required
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                className="ui-pill ui-pill-button ui-pill--accent"
                type="submit"
                disabled={isSaving}
              >
                {isSaving ? "Spremanje..." : selectedSponsor ? "Spremi promjene" : "Dodaj sponzora"}
              </button>
              {selectedSponsor ? (
                <button
                  className="ui-pill ui-pill-button ui-pill--signal"
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (!window.confirm(`Obrisati sponzora ${selectedSponsor.name}?`)) {
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

function createFormFromSponsor(sponsor: SponsorRecord): SponsorFormState {
  return {
    name: sponsor.name,
    websiteUrl: sponsor.websiteUrl,
    displayOrder: String(sponsor.displayOrder),
    logoFile: null,
  };
}

function buildSponsorFormData(form: SponsorFormState, mode: "create" | "edit") {
  const formData = new FormData();
  formData.append("name", form.name);
  formData.append("websiteUrl", form.websiteUrl);

  if (mode === "edit") {
    formData.append("displayOrder", form.displayOrder || "0");
  }

  if (form.logoFile) {
    formData.append("logo", form.logoFile);
  }

  return formData;
}

function ensureSponsorFormIsValid(form: SponsorFormState, mode: "create" | "edit") {
  if (!form.name.trim()) {
    throw new Error("Unesite naziv sponzora.");
  }

  if (!form.websiteUrl.trim()) {
    throw new Error("Unesite URL sponzora.");
  }

  if (mode === "create" && !form.logoFile) {
    throw new Error("Dodajte logo sponzora.");
  }
}

function getMutationErrorMessage(error: AxiosError<{ message?: string }> | Error, fallback: string) {
  if ("response" in error) {
    return error.response?.data?.message ?? fallback;
  }

  return error.message || fallback;
}
