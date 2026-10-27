import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { api } from "../core/api";
import { formatDateTime, toDateInputValue } from "../core/date";
import type { CategoryOption, ClubSettings, PaginatedResponse, SignupRequest } from "../core/types";
import { EntityDrawer } from "../layout/entity-drawer";
import { FeedbackToast } from "../ui/feedback-toast";
import { DatePicker } from "../ui/date-picker";
import { PaginationControls } from "../ui/pagination-controls";
import { centsToEuroInput, MembershipPriceField } from "../ui/membership-price-field";
import { formatSwimmingAbility } from "../ui/swimming-ability-field";

interface ApprovalResult {
  addedToExistingPlayer?: boolean;
  emailsSent?: {
    primaryParent: boolean;
    secondaryParent: boolean;
  };
}

interface FeedbackState {
  tone: "success" | "error";
  message: string;
}

type SignupStatusFilter = "PENDING" | "DECLINED";

interface SignupEditForm {
  parentOneFirstName: string;
  parentOneLastName: string;
  parentOneEmail: string;
  parentOnePhone: string;
  hasSecondParent: boolean;
  parentTwoFirstName: string;
  parentTwoLastName: string;
  parentTwoEmail: string;
  parentTwoPhone: string;
  childFirstName: string;
  childLastName: string;
  childDateOfBirth: string;
  childOib: string;
  childAddress: string;
}

const approvalsPageSize = 25;
const optionPageSize = 100;
const duplicateParentEmailMessage = "Roditelji moraju imati različite e-adrese.";
const fieldInputClassName = "w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg";

export function ApprovalsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<SignupStatusFilter>("PENDING");
  const [selectedSignupId, setSelectedSignupId] = useState<string | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Record<string, string>>({});
  const [declineReasons, setDeclineReasons] = useState<Record<string, string>>({});
  // Monthly fee typed per signup; untouched signups use the sibling suggestion.
  const [membershipPrices, setMembershipPrices] = useState<Record<string, string>>({});
  const [editForm, setEditForm] = useState<SignupEditForm | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [signupsPage, setSignupsPage] = useState(1);

  const signupsQuery = useQuery({
    queryKey: ["signups", statusFilter, signupsPage],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<SignupRequest>>("/signups", {
        params: { status: statusFilter, page: signupsPage, pageSize: approvalsPageSize },
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
        kind: category.kind,
        audience: category.audience,
        monthlyPriceCents: category.monthlyPriceCents ?? null,
        siblingPriceCents: category.siblingPriceCents ?? null,
        logoUrl: category.logoUrl,
      }));
    },
  });

  const clubSettingsQuery = useQuery({
    queryKey: ["club-settings"],
    queryFn: async () => {
      const response = await api.get<ClubSettings>("/club-settings");
      return response.data;
    },
  });

  /**
   * Sibling fee of the category or program the kid joins, prefilled when the family already has a
   * kid in the club; otherwise empty, which keeps the regular fee.
   */
  const getSuggestedSignupMembershipPrice = (signup: SignupRequest) => {
    const categoryId =
      selectedCategoryIds[signup.id] ?? signup.assignedCategoryId ?? signup.suggestedCategoryId ?? "";
    const siblingPriceCents = getCategorySiblingPriceCents(categoryId);

    return signup.siblingsInClub?.length ? centsToEuroInput(siblingPriceCents) : "";
  };

  const getCategorySiblingPriceCents = (categoryId: string) => {
    const category = (categoriesQuery.data ?? []).find((option) => option.id === categoryId);

    if (!category) {
      return null;
    }

    return (
      category.siblingPriceCents ??
      (category.monthlyPriceCents === null
        ? clubSettingsQuery.data?.siblingMembershipPriceCents ?? null
        : null)
    );
  };

  const closeDrawer = () => {
    setSelectedSignupId(null);
    setEditForm(null);
  };

  const showError = (error: AxiosError<{ message?: string }>, fallback: string) => {
    setFeedback({
      tone: "error",
      message: error.response?.data?.message ?? fallback,
    });
  };

  const approveMutation = useMutation({
    mutationFn: async (signup: SignupRequest) => {
      const assignedCategoryId =
        selectedCategoryIds[signup.id] ??
        signup.assignedCategoryId ??
        signup.suggestedCategoryId ??
        "";

      const response = await api.patch<ApprovalResult>(`/signups/${signup.id}/approve`, {
        assignedCategoryId,
        membershipPrice: membershipPrices[signup.id] ?? getSuggestedSignupMembershipPrice(signup),
      });

      return response.data;
    },
    onSuccess: (result) => {
      setFeedback({
        tone: "success",
        message: buildApprovalSuccessMessage(result),
      });
      closeDrawer();
      void queryClient.invalidateQueries({ queryKey: ["signups"] });
    },
    onError: (error: AxiosError<{ message?: string }>) =>
      showError(error, "Odobravanje nije uspjelo. Pokušajte ponovno."),
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
        message: "Prijava je odbijena i premještena među odbijene prijave.",
      });
      closeDrawer();
      void queryClient.invalidateQueries({ queryKey: ["signups"] });
    },
    onError: (error: AxiosError<{ message?: string }>) =>
      showError(error, "Odbijanje prijave nije uspjelo. Pokušajte ponovno."),
  });

  const reopenMutation = useMutation({
    mutationFn: async (signup: SignupRequest) => {
      const response = await api.patch(`/signups/${signup.id}/reopen`);

      return response.data;
    },
    onSuccess: () => {
      setFeedback({
        tone: "success",
        message: "Prijava je vraćena među prijave na čekanju.",
      });
      closeDrawer();
      void queryClient.invalidateQueries({ queryKey: ["signups"] });
    },
    onError: (error: AxiosError<{ message?: string }>) =>
      showError(error, "Vraćanje prijave na čekanje nije uspjelo. Pokušajte ponovno."),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ signupId, form }: { signupId: string; form: SignupEditForm }) => {
      const response = await api.patch<SignupRequest>(`/signups/${signupId}`, buildEditPayload(form));

      return response.data;
    },
    onSuccess: () => {
      setFeedback({
        tone: "success",
        message: "Podaci prijave su spremljeni.",
      });
      setEditForm(null);
      void queryClient.invalidateQueries({ queryKey: ["signups"] });
    },
    onError: (error: AxiosError<{ message?: string }>) =>
      showError(error, "Spremanje podataka prijave nije uspjelo. Pokušajte ponovno."),
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
  const isDeclinedView = statusFilter === "DECLINED";
  const isMutating =
    approveMutation.isPending ||
    declineMutation.isPending ||
    reopenMutation.isPending ||
    updateMutation.isPending;
  const selectedHasDuplicateEmails = selectedSignup ? hasDuplicateParentEmails(selectedSignup) : false;

  useEffect(() => {
    if (signupsPageData && signupsPage > signupsPageData.totalPages) {
      setSignupsPage(Math.max(signupsPageData.totalPages, 1));
    }
  }, [signupsPage, signupsPageData]);

  const updateEditField = <Key extends keyof SignupEditForm>(key: Key, value: SignupEditForm[Key]) =>
    setEditForm((current) => (current ? { ...current, [key]: value } : current));

  return (
    <section className="space-y-6">
      <FeedbackToast feedback={feedback} onClose={() => setFeedback(null)} />

      <div className="flex flex-wrap gap-3">
        {(
          [
            { value: "PENDING", label: "Na čekanju" },
            { value: "DECLINED", label: "Odbijene" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            className={`ui-pill ui-pill-button ${
              statusFilter === option.value ? "ui-pill--accent" : "ui-pill--panel"
            }`}
            type="button"
            aria-pressed={statusFilter === option.value}
            onClick={() => {
              setStatusFilter(option.value);
              setSignupsPage(1);
              closeDrawer();
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

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
          <h3 className="mt-3 text-3xl font-bold uppercase">
            {isDeclinedView ? "Nema odbijenih prijava" : "Nema prijava na čekanju"}
          </h3>
          <p className="mt-3 text-sm leading-7 text-muted">
            {isDeclinedView
              ? "Odbijene prijave ostaju ovdje kako biste ih mogli ispraviti i ponovno obraditi."
              : "Nove prijave pojavit će se ovdje čim roditelji pošalju javni obrazac za upis."}
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
                  {isDeclinedView ? (
                    <>
                      <th className="px-4 py-4">Odbijeno</th>
                      <th className="px-4 py-4">Razlog odbijanja</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-4">Predložena kategorija</th>
                      <th className="px-4 py-4">GDPR</th>
                    </>
                  )}
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
                        setEditForm(null);
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
                        {hasDuplicateParentEmails(signup) ? (
                          <p className="mt-2">
                            <StatusChip label="Ista e-adresa" tone="warning" />
                          </p>
                        ) : null}
                      </td>
                      {isDeclinedView ? (
                        <>
                          <td className="px-4 py-4 align-middle text-center text-sm font-medium">
                            {signup.reviewedAt ? formatDateTime(signup.reviewedAt) : "—"}
                          </td>
                          <td className="max-w-[320px] px-4 py-4 align-middle text-center text-sm">
                            {signup.declineReason ?? "Bez napomene"}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-4 align-middle text-center text-sm">
                            {signup.suggestedCategory?.name ?? "Bez automatskog prijedloga"}
                            {signup.suggestedCategory?.kind === "PROGRAM" ? (
                              <p className="mt-2">
                                <StatusChip label="Prijava za program" tone="success" />
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-4 align-middle text-center">
                            <StatusChip
                              label={signup.gdprConsent ? "Suglasnost potvrđena" : "Suglasnost nedostaje"}
                              tone={signup.gdprConsent ? "success" : "warning"}
                            />
                          </td>
                        </>
                      )}
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
        onClose={closeDrawer}
        eyebrow={
          selectedSignup
            ? selectedSignup.status === "DECLINED"
              ? "Odbijena prijava"
              : "Pregled prijave"
            : "Prijava"
        }
        title={
          selectedSignup
            ? `${selectedSignup.childFirstName} ${selectedSignup.childLastName}`
            : "Pregled prijave"
        }
      >
        {selectedSignup ? (
          <div className="approval-drawer">
            {selectedHasDuplicateEmails && !editForm ? (
              <div className="border-2 border-line bg-warning px-4 py-4 text-sm font-medium leading-6 text-surface">
                Oba roditelja imaju istu e-adresu ({selectedSignup.parentOneEmail}). Uredite podatke
                prijave i upišite drugu e-adresu ili uklonite drugog roditelja prije odobravanja.
              </div>
            ) : null}

            {editForm ? (
              <DetailSection
                title="Uređivanje podataka"
                content={
                  <form
                    className="space-y-6"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setFeedback(null);

                      if (
                        editForm.hasSecondParent &&
                        editForm.parentOneEmail.trim().toLowerCase() ===
                          editForm.parentTwoEmail.trim().toLowerCase()
                      ) {
                        setFeedback({ tone: "error", message: duplicateParentEmailMessage });
                        return;
                      }

                      updateMutation.mutate({ signupId: selectedSignup.id, form: editForm });
                    }}
                  >
                    <EditGroup title="Roditelj 1">
                      <TextField
                        label="Ime"
                        value={editForm.parentOneFirstName}
                        onChange={(value) => updateEditField("parentOneFirstName", value)}
                        required
                      />
                      <TextField
                        label="Prezime"
                        value={editForm.parentOneLastName}
                        onChange={(value) => updateEditField("parentOneLastName", value)}
                        required
                      />
                      <TextField
                        label="E-pošta"
                        type="email"
                        value={editForm.parentOneEmail}
                        onChange={(value) => updateEditField("parentOneEmail", value)}
                        required
                      />
                      <TextField
                        label="Telefon"
                        value={editForm.parentOnePhone}
                        onChange={(value) => updateEditField("parentOnePhone", value)}
                        required
                      />
                    </EditGroup>

                    {editForm.hasSecondParent ? (
                      <EditGroup title="Roditelj 2">
                        <TextField
                          label="Ime"
                          value={editForm.parentTwoFirstName}
                          onChange={(value) => updateEditField("parentTwoFirstName", value)}
                          required
                        />
                        <TextField
                          label="Prezime"
                          value={editForm.parentTwoLastName}
                          onChange={(value) => updateEditField("parentTwoLastName", value)}
                          required
                        />
                        <TextField
                          label="E-pošta"
                          type="email"
                          value={editForm.parentTwoEmail}
                          onChange={(value) => updateEditField("parentTwoEmail", value)}
                          required
                          error={
                            editForm.parentTwoEmail.trim() &&
                            editForm.parentTwoEmail.trim().toLowerCase() ===
                              editForm.parentOneEmail.trim().toLowerCase()
                              ? duplicateParentEmailMessage
                              : undefined
                          }
                        />
                        <TextField
                          label="Telefon"
                          value={editForm.parentTwoPhone}
                          onChange={(value) => updateEditField("parentTwoPhone", value)}
                          required
                        />
                      </EditGroup>
                    ) : null}

                    <button
                      className="ui-pill ui-pill-button ui-pill--panel"
                      type="button"
                      onClick={() => updateEditField("hasSecondParent", !editForm.hasSecondParent)}
                    >
                      {editForm.hasSecondParent ? "Ukloni roditelja 2" : "Dodaj roditelja 2"}
                    </button>

                    <EditGroup title="Dijete">
                      <TextField
                        label="Ime"
                        value={editForm.childFirstName}
                        onChange={(value) => updateEditField("childFirstName", value)}
                        required
                      />
                      <TextField
                        label="Prezime"
                        value={editForm.childLastName}
                        onChange={(value) => updateEditField("childLastName", value)}
                        required
                      />
                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Datum rođenja
                        </span>
                        <DatePicker
                          className={fieldInputClassName}
                          value={editForm.childDateOfBirth}
                          onChange={(value) => updateEditField("childDateOfBirth", value)}
                          required
                        />
                      </label>
                      <TextField
                        label="OIB"
                        value={editForm.childOib}
                        onChange={(value) => updateEditField("childOib", value)}
                        required
                      />
                      <div className="lg:col-span-2">
                        <TextField
                          label="Adresa stanovanja"
                          value={editForm.childAddress}
                          onChange={(value) => updateEditField("childAddress", value)}
                          required
                        />
                      </div>
                    </EditGroup>

                    <div className="approval-action-row">
                      <button
                        className="ui-pill ui-pill-button ui-pill--panel"
                        type="button"
                        disabled={updateMutation.isPending}
                        onClick={() => setEditForm(null)}
                      >
                        Odustani
                      </button>
                      <button
                        className="ui-pill ui-pill-button ui-pill--accent"
                        type="submit"
                        disabled={updateMutation.isPending}
                      >
                        {updateMutation.isPending ? "Spremanje..." : "Spremi podatke"}
                      </button>
                    </div>
                  </form>
                }
              />
            ) : (
              <div>
                <button
                  className="ui-pill ui-pill-button ui-pill--accent"
                  type="button"
                  disabled={isMutating}
                  onClick={() => {
                    setFeedback(null);
                    setEditForm(buildEditForm(selectedSignup));
                  }}
                >
                  Uredi podatke prijave
                </button>
              </div>
            )}

            <div className="approval-drawer-grid">
              {editForm ? null : (
                <>
                  <DetailSection
                    title="Dijete"
                    content={
                      <ProfileCard
                        title={`${selectedSignup.childFirstName} ${selectedSignup.childLastName}`}
                        imageUrl={selectedSignup.childProfileImageUrl}
                        lines={[
                          `Datum rođenja: ${formatNumericDate(selectedSignup.childDateOfBirth)}`,
                          `OIB: ${selectedSignup.childOib}`,
                          `Adresa: ${selectedSignup.childAddress ?? "Nije unesena"}`,
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
                            `E-pošta: ${selectedSignup.parentOneEmail}`,
                            `Telefon: ${selectedSignup.parentOnePhone}`,
                          ]}
                        />
                        {selectedSignup.parentTwoFirstName ? (
                          <ProfileCard
                            title={`${selectedSignup.parentTwoFirstName} ${selectedSignup.parentTwoLastName ?? ""}`.trim()}
                            imageUrl={selectedSignup.parentTwoProfileImageUrl}
                            lines={[
                              `E-pošta: ${selectedSignup.parentTwoEmail ?? "Bez e-pošte"}`,
                              `Telefon: ${selectedSignup.parentTwoPhone ?? "Bez telefona"}`,
                            ]}
                          />
                        ) : null}
                      </div>
                    }
                  />
                </>
              )}

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
                      <span>
                        {selectedSignup.suggestedCategory?.kind === "PROGRAM"
                          ? "Prijava za program"
                          : "Automatski prijedlog"}
                      </span>
                      <strong>{selectedSignup.suggestedCategory?.name ?? "Nema prijedloga"}</strong>
                    </div>
                    {selectedSignup.childSwimmingAbility ? (
                      <div className="approval-info-row">
                        <span>Plivanje</span>
                        <strong>{formatSwimmingAbility(selectedSignup.childSwimmingAbility)}</strong>
                      </div>
                    ) : null}
                    {selectedSignup.status === "DECLINED" ? (
                      <>
                        <div className="approval-info-row">
                          <span>Odbijeno</span>
                          <strong>
                            {selectedSignup.reviewedAt ? formatDateTime(selectedSignup.reviewedAt) : "—"}
                          </strong>
                        </div>
                        <div className="approval-info-row">
                          <span>Razlog odbijanja</span>
                          <strong>{selectedSignup.declineReason ?? "Bez napomene"}</strong>
                        </div>
                      </>
                    ) : null}
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
                        <optgroup label="Vaterpolo kategorije">
                          {categories
                            .filter((category) => category.kind !== "PROGRAM")
                            .map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                        </optgroup>
                        {categories.some(isMemberProgram) ? (
                          <optgroup label="Programi">
                            {categories
                              .filter(isMemberProgram)
                              .map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.name}
                                </option>
                              ))}
                          </optgroup>
                        ) : null}
                      </select>
                    </label>

                    <div>
                      <MembershipPriceField
                        value={
                          membershipPrices[selectedSignup.id] ??
                          getSuggestedSignupMembershipPrice(selectedSignup)
                        }
                        onChange={(value) =>
                          setMembershipPrices((current) => ({ ...current, [selectedSignup.id]: value }))
                        }
                        suggestedPriceCents={undefined}
                      />
                      {selectedSignup.siblingsInClub?.length ? (
                        <p className="mt-2 text-xs text-muted">
                          Brat ili sestra već u klubu:{" "}
                          {selectedSignup.siblingsInClub
                            .map((sibling) => `${sibling.firstName} ${sibling.lastName}`)
                            .join(", ")}
                          .{" "}
                          {getCategorySiblingPriceCents(selectedCategoryId) !== null
                            ? "Predložena je članarina odabrane kategorije za drugo i svako sljedeće dijete."
                            : "Odabrana kategorija nema cijenu za drugo dijete, pa vrijedi redovna članarina."}
                        </p>
                      ) : null}
                    </div>

                    {selectedSignup.status === "PENDING" ? (
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
                    ) : null}

                    <div className="approval-action-row">
                      {selectedSignup.status === "PENDING" ? (
                        <button
                          className="ui-pill ui-pill-button ui-pill--signal"
                          type="button"
                          disabled={isMutating || editForm !== null}
                          onClick={() => declineMutation.mutate(selectedSignup)}
                        >
                          {declineMutation.isPending ? "Odbijanje..." : "Odbij prijavu"}
                        </button>
                      ) : (
                        <button
                          className="ui-pill ui-pill-button ui-pill--panel"
                          type="button"
                          disabled={isMutating || editForm !== null}
                          onClick={() => reopenMutation.mutate(selectedSignup)}
                        >
                          {reopenMutation.isPending ? "Vraćanje..." : "Vrati na čekanje"}
                        </button>
                      )}
                      <button
                        className="ui-pill ui-pill-button ui-pill--success"
                        type="button"
                        disabled={
                          !selectedCategoryId ||
                          selectedHasDuplicateEmails ||
                          isMutating ||
                          editForm !== null
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

function EditGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-4 text-[11px] font-bold uppercase tracking-[0.3em] text-muted">{title}</legend>
      <div className="grid gap-4 lg:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
        {label}
      </span>
      <input
        className={`${fieldInputClassName} ${error ? "field-invalid" : ""}`}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        aria-invalid={error ? true : undefined}
      />
      {error ? <span className="field-error-message block">{error}</span> : null}
    </label>
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

/** Programs for non-members take practice signups only, so they are never offered for approval. */
function isMemberProgram(category: CategoryOption) {
  return category.kind === "PROGRAM" && category.audience !== "PUBLIC";
}

function buildApprovalSuccessMessage(result: ApprovalResult) {
  if (result.addedToExistingPlayer) {
    return result.emailsSent?.primaryParent
      ? "Prijava je odobrena. Dijete već postoji u sustavu pa mu je dodana odabrana kategorija, a roditelji su obaviješteni e-poštom."
      : "Prijava je odobrena. Dijete već postoji u sustavu pa mu je dodana odabrana kategorija.";
  }

  if (result.emailsSent?.primaryParent) {
    if (result.emailsSent.secondaryParent) {
      return "Prijava je odobrena. Pristupni podaci za roditelje i račun igrača poslani su na e-poštu oba roditelja.";
    }

    return "Prijava je odobrena. Pristupni podaci za primarnog roditelja i račun igrača poslani su na e-poštu primarnog roditelja.";
  }

  return "Prijava je uspješno odobrena.";
}

function hasDuplicateParentEmails(signup: SignupRequest) {
  return Boolean(
    signup.parentTwoEmail &&
      signup.parentTwoEmail.trim().toLowerCase() === signup.parentOneEmail.trim().toLowerCase(),
  );
}

function buildEditForm(signup: SignupRequest): SignupEditForm {
  return {
    parentOneFirstName: signup.parentOneFirstName,
    parentOneLastName: signup.parentOneLastName,
    parentOneEmail: signup.parentOneEmail,
    parentOnePhone: signup.parentOnePhone,
    hasSecondParent: Boolean(signup.parentTwoFirstName),
    parentTwoFirstName: signup.parentTwoFirstName ?? "",
    parentTwoLastName: signup.parentTwoLastName ?? "",
    parentTwoEmail: signup.parentTwoEmail ?? "",
    parentTwoPhone: signup.parentTwoPhone ?? "",
    childFirstName: signup.childFirstName,
    childLastName: signup.childLastName,
    childDateOfBirth: toDateInputValue(signup.childDateOfBirth),
    childOib: signup.childOib,
    childAddress: signup.childAddress ?? "",
  };
}

function buildEditPayload(form: SignupEditForm) {
  const { hasSecondParent, ...fields } = form;

  // The API treats a signup without any second-parent field as a single-parent signup.
  return hasSecondParent
    ? fields
    : { ...fields, parentTwoFirstName: "", parentTwoLastName: "", parentTwoEmail: "", parentTwoPhone: "" };
}
