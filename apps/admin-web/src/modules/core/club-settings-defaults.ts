export const adminClubSettingsDefaults = {
  clubName: import.meta.env.VITE_DEFAULT_CLUB_NAME ?? "Administracija kluba",
  clubSubtitle: import.meta.env.VITE_DEFAULT_CLUB_SUBTITLE ?? "Plivački vaterpolski klub",
  contactEmail: import.meta.env.VITE_DEFAULT_CONTACT_EMAIL ?? "info@mladostbjelovar.test",
  contactPhone: import.meta.env.VITE_DEFAULT_CONTACT_PHONE ?? "+385911112222",
  facebookUrl: import.meta.env.VITE_DEFAULT_FACEBOOK_URL ?? "",
  instagramUrl: import.meta.env.VITE_DEFAULT_INSTAGRAM_URL ?? "",
  youtubeUrl: import.meta.env.VITE_DEFAULT_YOUTUBE_URL ?? "",
  bankRecipient: import.meta.env.VITE_DEFAULT_BANK_RECIPIENT ?? "",
  bankIban: import.meta.env.VITE_DEFAULT_BANK_IBAN ?? "",
  bankName: import.meta.env.VITE_DEFAULT_BANK_NAME ?? "",
};

export function resolveSettingValue(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();

  return normalized ? normalized : fallback;
}
