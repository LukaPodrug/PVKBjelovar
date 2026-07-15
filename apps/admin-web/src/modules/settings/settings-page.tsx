import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { type ChangeEvent, useEffect, useState } from "react";
import { api } from "../core/api";
import { adminClubSettingsDefaults, resolveSettingValue } from "../core/club-settings-defaults";
import type { ClubSettings } from "../core/types";
import { FeedbackToast } from "../ui/feedback-toast";

interface FeedbackState {
  tone: "success" | "error";
  message: string;
}

interface BrandingFormState {
  clubName: string;
  clubSubtitle: string;
  contactEmail: string;
  contactPhone: string;
  facebookUrl: string;
  instagramUrl: string;
  youtubeUrl: string;
  bankRecipient: string;
  bankIban: string;
  bankName: string;
  logoFile: File | null;
  removeLogo: boolean;
}

interface PasswordFormState {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

const emptyBrandingForm: BrandingFormState = {
  clubName: "",
  clubSubtitle: "",
  contactEmail: "",
  contactPhone: "",
  facebookUrl: "",
  instagramUrl: "",
  youtubeUrl: "",
  bankRecipient: "",
  bankIban: "",
  bankName: "",
  logoFile: null,
  removeLogo: false,
};

const emptyPasswordForm: PasswordFormState = {
  currentPassword: "",
  newPassword: "",
  confirmNewPassword: "",
};

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [brandingForm, setBrandingForm] = useState<BrandingFormState>(emptyBrandingForm);
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(emptyPasswordForm);
  const [brandingFeedback, setBrandingFeedback] = useState<FeedbackState | null>(null);
  const [securityFeedback, setSecurityFeedback] = useState<FeedbackState | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  const settingsQuery = useQuery<ClubSettings, AxiosError<{ message?: string }>>({
    queryKey: ["club-settings", "settings-page"],
    queryFn: async () => {
      const response = await api.get<ClubSettings>("/club-settings");
      return response.data;
    },
  });

  const currentSettings = settingsQuery.data ?? null;
  const settingsMissing = settingsQuery.error?.response?.status === 404;
  const activeLogoUrl = brandingForm.removeLogo
    ? null
    : logoPreviewUrl ?? currentSettings?.logoUrl ?? null;

  useEffect(() => {
    if (!currentSettings) {
      if (settingsMissing) {
        setBrandingForm((current) =>
          Object.values(current).some(Boolean)
            ? current
            : emptyBrandingForm,
        );
      }
      return;
    }

    setBrandingForm({
      clubName: currentSettings.clubName ?? "",
      clubSubtitle: currentSettings.clubSubtitle ?? "",
      contactEmail: currentSettings.contactEmail ?? "",
      contactPhone: currentSettings.contactPhone ?? "",
      facebookUrl: currentSettings.facebookUrl ?? "",
      instagramUrl: currentSettings.instagramUrl ?? "",
      youtubeUrl: currentSettings.youtubeUrl ?? "",
      bankRecipient: currentSettings.bankRecipient ?? "",
      bankIban: currentSettings.bankIban ?? "",
      bankName: currentSettings.bankName ?? "",
      logoFile: null,
      removeLogo: false,
    });
  }, [
    currentSettings,
    settingsMissing,
  ]);

  useEffect(() => {
    if (!brandingForm.logoFile) {
      setLogoPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(brandingForm.logoFile);
    setLogoPreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [brandingForm.logoFile]);

  const saveBrandingMutation = useMutation({
    mutationFn: async () => {
      const formData = buildBrandingFormData(brandingForm);

      if (currentSettings) {
        const response = await api.patch<ClubSettings>("/club-settings", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });

        return response.data;
      }

      const response = await api.post<ClubSettings>("/club-settings", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return response.data;
    },
    onSuccess: (settings) => {
      const savedClubName = resolveSettingValue(
        settings.clubName,
        adminClubSettingsDefaults.clubName,
      );

      setBrandingFeedback({
        tone: "success",
        message: `Postavke kluba ${savedClubName} uspješno su spremljene.`,
      });
      setBrandingForm({
        clubName: settings.clubName ?? "",
        clubSubtitle: settings.clubSubtitle ?? "",
        contactEmail: settings.contactEmail ?? "",
        contactPhone: settings.contactPhone ?? "",
        facebookUrl: settings.facebookUrl ?? "",
        instagramUrl: settings.instagramUrl ?? "",
        youtubeUrl: settings.youtubeUrl ?? "",
        bankRecipient: settings.bankRecipient ?? "",
        bankIban: settings.bankIban ?? "",
        bankName: settings.bankName ?? "",
        logoFile: null,
        removeLogo: false,
      });
      void queryClient.invalidateQueries({ queryKey: ["club-settings"] });
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setBrandingFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Spremanje postavki kluba nije uspjelo.",
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      const response = await api.patch<{ message: string }>("/auth/change-password", passwordForm);
      return response.data;
    },
    onSuccess: (result) => {
      setSecurityFeedback({
        tone: "success",
        message: result.message,
      });
      setPasswordForm(emptyPasswordForm);
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setSecurityFeedback({
        tone: "error",
        message: error.response?.data?.message ?? "Promjena lozinke nije uspjela.",
      });
    },
  });

  return (
    <section className="space-y-6">
      <FeedbackToast
        feedback={securityFeedback ?? brandingFeedback}
        onClose={() => {
          setBrandingFeedback(null);
          setSecurityFeedback(null);
        }}
      />

      <div className="space-y-4">
        <section className="border-2 border-line bg-surface">
            <div className="border-b-2 border-line bg-panel px-4 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                Opće postavke
              </p>
              <h3 className="mt-2 text-xl font-bold uppercase">Identitet kluba</h3>
            </div>

            {settingsQuery.isLoading ? (
              <div className="h-[460px] animate-pulse bg-panel" />
            ) : settingsQuery.isError && !settingsMissing ? (
              <div className="px-4 py-5">
                <div className="border-2 border-line bg-signal px-4 py-4 text-sm font-medium text-surface">
                  Postavke kluba trenutno nije moguće učitati.
                </div>
              </div>
            ) : (
              <form
                className="space-y-5 p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  setBrandingFeedback(null);
                  saveBrandingMutation.mutate();
                }}
              >
                {settingsMissing ? (
                  <div className="border-2 border-line bg-warning px-4 py-4 text-sm font-medium text-surface">
                    Postavke kluba još nisu inicijalizirane. Spremanjem ovog obrasca kreirat ćete jedinstveni zapis.
                  </div>
                ) : null}

                <div className="grid gap-5 xl:grid-cols-2">
                  <fieldset className="admin-settings-widget admin-settings-widget--club">
                    <legend className="admin-settings-widget-title">
                      Podaci o klubu
                    </legend>
                    <div className="admin-settings-club-grid">
                      <div className="admin-settings-logo-card">
                        {activeLogoUrl ? (
                          <img
                            className="admin-settings-logo-preview"
                            src={activeLogoUrl}
                            alt={brandingForm.clubName || "Pregled loga kluba"}
                          />
                        ) : (
                          <div className="admin-settings-logo-placeholder">
                            Logo kluba
                          </div>
                        )}

                        <input
                          id="club-logo-upload"
                          className="admin-settings-logo-input"
                          type="file"
                          accept="image/*"
                          onChange={(event: ChangeEvent<HTMLInputElement>) => {
                            const nextFile = event.target.files?.[0] ?? null;
                            setBrandingForm((current) => ({
                              ...current,
                              logoFile: nextFile,
                              removeLogo: false,
                            }));
                          }}
                        />

                        <div className="admin-settings-logo-actions">
                          <label className="ui-pill ui-pill-button ui-pill--accent" htmlFor="club-logo-upload">
                            {activeLogoUrl ? "Promijeni logo" : "Odaberi logo"}
                          </label>
                          {activeLogoUrl || brandingForm.logoFile ? (
                            <button
                              className="ui-pill ui-pill-button ui-pill--outline"
                              type="button"
                              onClick={() =>
                                setBrandingForm((current) => ({
                                  ...current,
                                  logoFile: null,
                                  removeLogo: Boolean(currentSettings?.logoUrl),
                                }))
                              }
                            >
                              Ukloni logo
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="admin-settings-club-fields">
                        <label className="block">
                          <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                            Naziv kluba
                          </span>
                          <input
                            className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                            type="text"
                            value={brandingForm.clubName}
                            onChange={(event) =>
                              setBrandingForm((current) => ({
                                ...current,
                                clubName: event.target.value,
                              }))
                            }
                            placeholder={adminClubSettingsDefaults.clubName}
                          />
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                            Podnaslov kluba
                          </span>
                          <input
                            className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                            type="text"
                            value={brandingForm.clubSubtitle}
                            onChange={(event) =>
                              setBrandingForm((current) => ({
                                ...current,
                                clubSubtitle: event.target.value,
                              }))
                            }
                            placeholder={adminClubSettingsDefaults.clubSubtitle}
                          />
                        </label>
                      </div>
                    </div>
                  </fieldset>

                  <fieldset className="admin-settings-widget">
                    <legend className="admin-settings-widget-title">
                      Kontakt
                    </legend>
                    <div className="grid gap-5">
                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Kontaktna e-pošta
                        </span>
                        <input
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          type="email"
                          value={brandingForm.contactEmail}
                          onChange={(event) =>
                            setBrandingForm((current) => ({
                              ...current,
                              contactEmail: event.target.value,
                            }))
                          }
                          placeholder={adminClubSettingsDefaults.contactEmail}
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Kontakt telefon
                        </span>
                        <input
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          type="text"
                          value={brandingForm.contactPhone}
                          onChange={(event) =>
                            setBrandingForm((current) => ({
                              ...current,
                              contactPhone: event.target.value,
                            }))
                          }
                          placeholder={adminClubSettingsDefaults.contactPhone}
                        />
                      </label>
                    </div>
                  </fieldset>

                  <fieldset className="admin-settings-widget">
                    <legend className="admin-settings-widget-title">
                      Društvene mreže
                    </legend>
                    <div className="grid gap-5">
                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Facebook poveznica
                        </span>
                        <input
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          type="url"
                          value={brandingForm.facebookUrl}
                          onChange={(event) =>
                            setBrandingForm((current) => ({
                              ...current,
                              facebookUrl: event.target.value,
                            }))
                          }
                          placeholder={adminClubSettingsDefaults.facebookUrl || "https://facebook.com/..."}
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Instagram poveznica
                        </span>
                        <input
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          type="url"
                          value={brandingForm.instagramUrl}
                          onChange={(event) =>
                            setBrandingForm((current) => ({
                              ...current,
                              instagramUrl: event.target.value,
                            }))
                          }
                          placeholder={adminClubSettingsDefaults.instagramUrl || "https://instagram.com/..."}
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          YouTube poveznica
                        </span>
                        <input
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          type="url"
                          value={brandingForm.youtubeUrl}
                          onChange={(event) =>
                            setBrandingForm((current) => ({
                              ...current,
                              youtubeUrl: event.target.value,
                            }))
                          }
                          placeholder={adminClubSettingsDefaults.youtubeUrl || "https://youtube.com/..."}
                        />
                      </label>
                    </div>
                  </fieldset>

                  <fieldset className="admin-settings-widget">
                    <legend className="admin-settings-widget-title">
                      Bankovni podaci
                    </legend>
                    <div className="grid gap-5">
                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Primatelj
                        </span>
                        <input
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          type="text"
                          value={brandingForm.bankRecipient}
                          onChange={(event) =>
                            setBrandingForm((current) => ({
                              ...current,
                              bankRecipient: event.target.value,
                            }))
                          }
                          placeholder={adminClubSettingsDefaults.bankRecipient}
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          IBAN
                        </span>
                        <input
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          type="text"
                          value={brandingForm.bankIban}
                          onChange={(event) =>
                            setBrandingForm((current) => ({
                              ...current,
                              bankIban: event.target.value,
                            }))
                          }
                          placeholder={adminClubSettingsDefaults.bankIban}
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Banka
                        </span>
                        <input
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          type="text"
                          value={brandingForm.bankName}
                          onChange={(event) =>
                            setBrandingForm((current) => ({
                              ...current,
                              bankName: event.target.value,
                            }))
                          }
                          placeholder={adminClubSettingsDefaults.bankName}
                        />
                      </label>
                    </div>
                  </fieldset>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    className="ui-pill ui-pill-button ui-pill--panel"
                    type="button"
                    onClick={() => {
                      setBrandingFeedback(null);
                      if (currentSettings) {
                        setBrandingForm({
                          clubName: currentSettings.clubName ?? "",
                          clubSubtitle: currentSettings.clubSubtitle ?? "",
                          contactEmail: currentSettings.contactEmail ?? "",
                          contactPhone: currentSettings.contactPhone ?? "",
                          facebookUrl: currentSettings.facebookUrl ?? "",
                          instagramUrl: currentSettings.instagramUrl ?? "",
                          youtubeUrl: currentSettings.youtubeUrl ?? "",
                          bankRecipient: currentSettings.bankRecipient ?? "",
                          bankIban: currentSettings.bankIban ?? "",
                          bankName: currentSettings.bankName ?? "",
                          logoFile: null,
                          removeLogo: false,
                        });
                        return;
                      }

                      setBrandingForm(emptyBrandingForm);
                    }}
                  >
                    Resetiraj identitet
                  </button>
                  <button
                    className="ui-pill ui-pill-button ui-pill--accent"
                    type="submit"
                    disabled={saveBrandingMutation.isPending}
                  >
                    {saveBrandingMutation.isPending ? "Spremanje..." : "Spremi postavke"}
                  </button>
                </div>
              </form>
            )}
        </section>

        <section className="border-2 border-line bg-surface">
            <div className="border-b-2 border-line bg-panel px-4 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                Sigurnost
              </p>
              <h3 className="mt-2 text-xl font-bold uppercase">Promjena lozinke</h3>
            </div>

            <form
              className="space-y-5 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                setSecurityFeedback(null);
                changePasswordMutation.mutate();
              }}
            >
              <div className="grid gap-5">
                <label className="block">
                  <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    Trenutna lozinka
                  </span>
                  <input
                    className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        currentPassword: event.target.value,
                      }))
                    }
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    Nova lozinka
                  </span>
                  <input
                    className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        newPassword: event.target.value,
                      }))
                    }
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    Potvrdite novu lozinku
                  </span>
                  <input
                    className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                    type="password"
                    value={passwordForm.confirmNewPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        confirmNewPassword: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  className="ui-pill ui-pill-button ui-pill--panel"
                  type="button"
                  onClick={() => {
                    setSecurityFeedback(null);
                    setPasswordForm(emptyPasswordForm);
                  }}
                >
                  Resetiraj sigurnosni obrazac
                </button>
                <button
                  className="ui-pill ui-pill-button ui-pill--accent"
                  type="submit"
                  disabled={changePasswordMutation.isPending}
                >
                  {changePasswordMutation.isPending ? "Ažuriranje..." : "Promijeni lozinku"}
                </button>
              </div>
            </form>
        </section>
      </div>
    </section>
  );
}

function buildBrandingFormData(form: BrandingFormState) {
  const formData = new FormData();
  formData.append("clubName", form.clubName);
  formData.append("clubSubtitle", form.clubSubtitle);
  formData.append("contactEmail", form.contactEmail);
  formData.append("contactPhone", form.contactPhone);
  formData.append("facebookUrl", form.facebookUrl);
  formData.append("instagramUrl", form.instagramUrl);
  formData.append("youtubeUrl", form.youtubeUrl);
  formData.append("bankRecipient", form.bankRecipient);
  formData.append("bankIban", form.bankIban);
  formData.append("bankName", form.bankName);

  if (form.logoFile) {
    formData.append("logo", form.logoFile);
  }

  formData.append("removeLogo", String(form.removeLogo));

  return formData;
}
