import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { api } from "../core/api";
import { formatDate, formatDateTime } from "../core/date";
import type { CategoryOption, PaginatedResponse, SignupRequest } from "../core/types";
import { EntityDrawer } from "../layout/entity-drawer";
import { PaginationControls } from "../ui/pagination-controls";

interface ApprovalResult {
  emailsSent?: {
    primaryParent: boolean;
    secondaryParent: boolean;
  };
  developmentCredentials?: {
    primaryParent: {
      email: string;
      password: string;
    };
    secondaryParent:
      | {
          email: string;
          password: string;
        }
      | null;
    player: {
      username: string;
      password: string;
    };
  };
}

interface FeedbackState {
  tone: "success" | "error";
  message: string;
}

const approvalsPageSize = 25;
const optionPageSize = 100;

export function ApprovalsPage() {
  const queryClient = useQueryClient();
  const [selectedSignupId, setSelectedSignupId] = useState<string | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Record<string, string>>({});
  const [declineReasons, setDeclineReasons] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [signupsPage, setSignupsPage] = useState(1);

  const signupsQuery = useQuery({
    queryKey: ["signups", "pending", signupsPage],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<SignupRequest>>("/signups", {
        params: { status: "PENDING", page: signupsPage, pageSize: approvalsPageSize },
      });
      return response.data;
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", "options"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CategoryOption>>("/categories", {
        params: { page: 1, pageSize: optionPageSize },
      });
      return response.data.items.map((category) => ({
        id: category.id,
        name: category.name,
        logoUrl: category.logoUrl,
      }));
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (signup: SignupRequest) => {
      const assignedCategoryId =
        selectedCategoryIds[signup.id] ??
        signup.assignedCategoryId ??
        signup.suggestedCategoryId ??
        "";

      const response = await api.patch<ApprovalResult>(`/signups/${signup.id}/approve`, {
        assignedCategoryId,
      });

      return response.data;
    },
    onSuccess: (result) => {
      setFeedback({
        tone: "success",
        message: buildApprovalSuccessMessage(result),
      });
      setSelectedSignupId(null);
      void queryClient.invalidateQueries({ queryKey: ["signups", "pending"] });
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Odobravanje nije uspjelo. Pokušajte ponovno.",
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async (signup: SignupRequest) => {
      const response = await api.patch(`/signups/${signup.id}/decline`, {
        declineReason: declineReasons[signup.id] || undefined,
      });

      return response.data;
    },
    onSuccess: () => {
      setFeedback({
        tone: "success",
        message: "Prijava je uspješno odbijena.",
      });
      setSelectedSignupId(null);
      void queryClient.invalidateQueries({ queryKey: ["signups", "pending"] });
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Odbijanje prijave nije uspjelo. Pokušajte ponovno.",
      });
    },
  });

  const signupsPageData = signupsQuery.data;
  const signups = signupsPageData?.items ?? [];
  const categories = categoriesQuery.data ?? [];
  const selectedSignup = signups.find((signup) => signup.id === selectedSignupId) ?? null;
  const selectedCategoryId = selectedSignup
    ? selectedCategoryIds[selectedSignup.id] ??
      selectedSignup.assignedCategoryId ??
      selectedSignup.suggestedCategoryId ??
      ""
    : "";

  useEffect(() => {
    if (signupsPageData && signupsPage > signupsPageData.totalPages) {
      setSignupsPage(signupsPageData.totalPages);
    }
  }, [signupsPage, signupsPageData]);

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

      {signupsQuery.isLoading || categoriesQuery.isLoading ? (
        <div className="space-y-4">
          <div className="h-[520px] animate-pulse border-2 border-line bg-panel" />
        </div>
      ) : signupsQuery.isError || categoriesQuery.isError ? (
        <div className="border-2 border-line bg-signal px-5 py-4 text-sm font-medium text-surface">
          Prijave trenutno nije moguće učitati.
        </div>
      ) : signups.length === 0 ? (
        <div className="border-2 border-line bg-surface p-12 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
            Red je prazan
          </p>
          <h3 className="mt-3 text-3xl font-bold uppercase">Nema prijava na čekanju</h3>
          <p className="mt-3 text-sm leading-7 text-muted">
            Nove prijave pojavit će se ovdje čim roditelji pošalju javni obrazac za upis.
          </p>
        </div>
      ) : (
        <section className="border-2 border-line bg-surface">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead className="bg-panel">
                <tr className="border-b-2 border-line text-center text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  <th className="px-4 py-4">Zaprimljeno</th>
                  <th className="px-4 py-4">Dijete</th>
                  <th className="px-4 py-4">Roditelji</th>
                  <th className="px-4 py-4">Predložena kategorija</th>
                  <th className="px-4 py-4">GDPR</th>
                </tr>
              </thead>
              <tbody>
                {signups.map((signup) => {
                  const isSelected = selectedSignupId === signup.id;

                  return (
                    <tr
                      key={signup.id}
                      className={`cursor-pointer border-b-2 border-line ${
                        isSelected ? "bg-panel" : "bg-white hover:bg-bg"
                      }`}
                      onClick={() => {
                        setFeedback(null);
                        setSelectedSignupId(signup.id);
                      }}
                    >
                      <td className="px-4 py-4 align-middle text-center text-sm font-medium">
                        {formatDateTime(signup.createdAt)}
                      </td>
                      <td className="px-4 py-4 align-middle text-center">
                        <p className="text-sm font-bold uppercase">
                          {signup.childFirstName} {signup.childLastName}
                        </p>
                        <p className="mt-1 text-sm font-medium text-muted">
                          {formatNumericDate(signup.childDateOfBirth)}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-middle text-center text-sm">
                        <p className="font-medium">
                          {signup.parentOneFirstName} {signup.parentOneLastName}
                        </p>
                        {signup.parentTwoFirstName ? (
                          <p className="mt-1 font-medium">
                            {signup.parentTwoFirstName} {signup.parentTwoLastName}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 align-middle text-center text-sm">
                        {signup.suggestedCategory?.name ?? "Bez automatskog prijedloga"}
                      </td>
                      <td className="px-4 py-4 align-middle text-center">
                        <StatusChip
                          label={signup.gdprConsent ? "Suglasnost potvrđena" : "Suglasnost nedostaje"}
                          tone={signup.gdprConsent ? "success" : "warning"}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {signupsPageData ? (
            <PaginationControls
              page={signupsPageData.page}
              pageSize={signupsPageData.pageSize}
              total={signupsPageData.total}
              totalPages={signupsPageData.totalPages}
              onPageChange={setSignupsPage}
            />
          ) : null}
        </section>
      )}

      <EntityDrawer
        open={selectedSignup !== null}
        onClose={() => setSelectedSignupId(null)}
        eyebrow={selectedSignup ? "Pregled prijave" : "Prijava"}
        title={
          selectedSignup
            ? `${selectedSignup.childFirstName} ${selectedSignup.childLastName}`
            : "Pregled prijave"
        }
      >
        {selectedSignup ? (
          <div className="approval-drawer">
            <section className="approval-widget approval-widget--summary">
              <div>
                <p className="approval-widget-title">Sažetak prijave</p>
                <h3 className="mt-3 text-2xl font-bold tracking-[-0.03em]">
                  {selectedSignup.childFirstName} {selectedSignup.childLastName}
                </h3>
                <p className="mt-2 text-sm leading-7 text-muted">
                  Zaprimljeno {formatDateTime(selectedSignup.createdAt)}. Pregledajte podatke,
                  odaberite kategoriju i završite obradu prijave.
                </p>
              </div>

              <div className="approval-summary-chips">
                <StatusChip
                  label={selectedSignup.gdprConsent ? "GDPR potvrđen" : "GDPR nedostaje"}
                  tone={selectedSignup.gdprConsent ? "success" : "warning"}
                />
                <span className="ui-pill ui-pill--panel">
                  Predloženo <strong>{selectedSignup.suggestedCategory?.name ?? "nema"}</strong>
                </span>
                <span className="ui-pill ui-pill--outline">
                  OIB <strong>{selectedSignup.childOib}</strong>
                </span>
              </div>
            </section>

            <div className="approval-drawer-grid">
              <DetailSection
                title="Dijete"
                content={
                  <ProfileCard
                    title={`${selectedSignup.childFirstName} ${selectedSignup.childLastName}`}
                    imageUrl={selectedSignup.childProfileImageUrl}
                    lines={[
                      `Datum rođenja: ${formatNumericDate(selectedSignup.childDateOfBirth)}`,
                      `OIB: ${selectedSignup.childOib}`,
                    ]}
                  />
                }
              />

              <DetailSection
                title="Roditelji"
                content={
                  <div className="approval-card-grid">
                    <ProfileCard
                      title={`${selectedSignup.parentOneFirstName} ${selectedSignup.parentOneLastName}`}
                      imageUrl={selectedSignup.parentOneProfileImageUrl}
                      lines={[
                        `Email: ${selectedSignup.parentOneEmail}`,
                        `Telefon: ${selectedSignup.parentOnePhone}`,
                      ]}
                    />
                    {selectedSignup.parentTwoFirstName ? (
                      <ProfileCard
                        title={`${selectedSignup.parentTwoFirstName} ${selectedSignup.parentTwoLastName ?? ""}`.trim()}
                        imageUrl={selectedSignup.parentTwoProfileImageUrl}
                        lines={[
                          `Email: ${selectedSignup.parentTwoEmail ?? "Bez e-pošte"}`,
                          `Telefon: ${selectedSignup.parentTwoPhone ?? "Bez telefona"}`,
                        ]}
                      />
                    ) : null}
                  </div>
                }
              />

              <DetailSection
                title="Sukladnost"
                content={
                  <div className="approval-info-list">
                    <div className="approval-info-row">
                      <span>GDPR suglasnost</span>
                      <StatusChip
                        label={selectedSignup.gdprConsent ? "Potvrđena" : "Nedostaje"}
                        tone={selectedSignup.gdprConsent ? "success" : "warning"}
                      />
                    </div>
                    <div className="approval-info-row">
                      <span>Zaprimljeno</span>
                      <strong>{formatDateTime(selectedSignup.createdAt)}</strong>
                    </div>
                    <div className="approval-info-row">
                      <span>Automatski prijedlog</span>
                      <strong>{selectedSignup.suggestedCategory?.name ?? "Nema prijedloga"}</strong>
                    </div>
                  </div>
                }
              />

              <DetailSection
                title="Obrada"
                content={
                  <div className="approval-decision-panel">
                    <label className="block">
                      <span className="mb-3 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Kategorija za upis
                      </span>
                      <select
                        className="w-full border-2 border-line bg-bg px-4 py-3 outline-none"
                        value={selectedCategoryId}
                        onChange={(event) =>
                          setSelectedCategoryIds((current) => ({
                            ...current,
                            [selectedSignup.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Odaberite kategoriju</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-3 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                        Razlog odbijanja
                      </span>
                      <textarea
                        className="min-h-28 w-full border-2 border-line bg-bg px-4 py-3 outline-none"
                        value={declineReasons[selectedSignup.id] ?? ""}
                        onChange={(event) =>
                          setDeclineReasons((current) => ({
                            ...current,
                            [selectedSignup.id]: event.target.value,
                          }))
                        }
                        placeholder="Opcionalna napomena za internu evidenciju"
                      />
                    </label>

                    <div className="approval-action-row">
                      <button
                        className="ui-pill ui-pill-button ui-pill--signal"
                        type="button"
                        disabled={approveMutation.isPending || declineMutation.isPending}
                        onClick={() => declineMutation.mutate(selectedSignup)}
                      >
                        {declineMutation.isPending ? "Odbijanje..." : "Odbij prijavu"}
                      </button>
                      <button
                        className="ui-pill ui-pill-button ui-pill--success"
                        type="button"
                        disabled={
                          !selectedCategoryId ||
                          approveMutation.isPending ||
                          declineMutation.isPending
                        }
                        onClick={() => approveMutation.mutate(selectedSignup)}
                      >
                        {approveMutation.isPending ? "Odobravanje..." : "Odobri prijavu"}
                      </button>
                    </div>
                  </div>
                }
              />
            </div>
          </div>
        ) : null}
      </EntityDrawer>
    </section>
  );
}

function DetailSection({
  title,
  content,
}: {
  title: string;
  content: ReactNode;
}) {
  return (
    <section className="approval-widget">
      <div className="approval-widget-header">
        <p className="approval-widget-title">{title}</p>
      </div>
      <div className="min-w-0">{content}</div>
    </section>
  );
}

function ProfileCard({
  title,
  imageUrl,
  lines,
}: {
  title: string;
  imageUrl: string | null;
  lines: string[];
}) {
  return (
    <div className="approval-profile-card">
      <div className="approval-profile-card-media">
        {imageUrl ? (
          <img
            className="approval-profile-card-image"
            src={imageUrl}
            alt={title}
          />
        ) : (
          <div className="approval-profile-card-placeholder">
            Nema fotografije
          </div>
        )}
      </div>

      <div className="approval-profile-card-body">
        <p className="approval-profile-card-title">{title}</p>
        <div className="mt-3 space-y-2 text-sm leading-6">
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "warning";
}) {
  return <span className={`ui-pill ${tone === "success" ? "ui-pill--success" : "ui-pill--warning"}`}>{label}</span>;
}

function formatNumericDate(dateIso: string) {
  const date = new Date(dateIso);
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const year = date.getFullYear();

  return `${day}.${month}.${year}.`;
}

function buildApprovalSuccessMessage(result: ApprovalResult) {
  if (result.emailsSent?.primaryParent) {
    if (result.emailsSent.secondaryParent) {
      return "Prijava je odobrena. Pristupni podaci za roditelje i račun igrača poslani su na e-poštu oba roditelja.";
    }

    return "Prijava je odobrena. Pristupni podaci za primarnog roditelja i račun igrača poslani su na e-poštu primarnog roditelja.";
  }

  if (result.developmentCredentials?.primaryParent && result.developmentCredentials.player) {
    const credentials = [
      `Roditelj 1: ${result.developmentCredentials.primaryParent.email} / ${result.developmentCredentials.primaryParent.password}`,
      result.developmentCredentials.secondaryParent
        ? `Roditelj 2: ${result.developmentCredentials.secondaryParent.email} / ${result.developmentCredentials.secondaryParent.password}`
        : null,
      `Igrač: ${result.developmentCredentials.player.username} / ${result.developmentCredentials.player.password}`,
    ]
      .filter(Boolean)
      .join(" | ");

    return `Prijava je odobrena, ali slanje e-pošte nije konfigurirano. Razvojni podaci: ${credentials}`;
  }

  return "Prijava je uspješno odobrena.";
}
