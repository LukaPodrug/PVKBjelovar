import { useMutation, useQuery } from "@tanstack/react-query";
import { type ChangeEvent, type CSSProperties, useEffect, useId, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { CategoryDetailsDrawer } from "./components/category-details-drawer";
import { DatePicker } from "./components/date-picker";
import { FeedbackToast } from "./components/feedback-toast";
import { applyBrowserBranding } from "./lib/browser-branding";
import { landingClubSettingsDefaults, resolveSettingValue } from "./lib/club-settings-defaults";
import { fetchNewsFeed, type NewsItem } from "./lib/contentful";
import {
  fetchClubSettings,
  type PublicBoardMember,
  type PublicCategory,
  type PublicSponsor,
  fetchPublicBoardMembers,
  fetchPublicCategories,
  fetchPublicSponsors,
  submitSignup,
} from "./lib/public-api";

interface SignupFormState {
  parentOneFirstName: string;
  parentOneLastName: string;
  parentOneEmail: string;
  parentOnePhone: string;
  parentOneProfileImage: File | null;
  parentTwoFirstName: string;
  parentTwoLastName: string;
  parentTwoEmail: string;
  parentTwoPhone: string;
  parentTwoProfileImage: File | null;
  childFirstName: string;
  childLastName: string;
  childDateOfBirth: string;
  childOib: string;
  childProfileImage: File | null;
  gdprConsent: boolean;
}

const emptySignupForm: SignupFormState = {
  parentOneFirstName: "",
  parentOneLastName: "",
  parentOneEmail: "",
  parentOnePhone: "",
  parentOneProfileImage: null,
  parentTwoFirstName: "",
  parentTwoLastName: "",
  parentTwoEmail: "",
  parentTwoPhone: "",
  parentTwoProfileImage: null,
  childFirstName: "",
  childLastName: "",
  childDateOfBirth: "",
  childOib: "",
  childProfileImage: null,
  gdprConsent: false,
};

const initialVisibleNewsCount = 6;
const privacyContactEmail = "pvkmladostbjelovar@gmail.com";
const privacyContactPhone = "+385 91 202 2384";
const privacyLegalName = "PLIVAČKO VATERPOLSKI KLUB MLADOST";
const privacyLegalAddress = "Petra Zrinskog 3, 43000 Bjelovar, Hrvatska";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingHomePage />} />
      <Route path="/novosti/:slug" element={<ArticlePage />} />
      <Route path="/pravila-privatnosti" element={<PrivacyPolicyPage />} />
      <Route path="/brisanje-racuna" element={<AccountDeletionPage />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}

function LandingHomePage() {
  const [showSecondParent, setShowSecondParent] = useState(false);
  const [signupForm, setSignupForm] = useState<SignupFormState>(emptySignupForm);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [visibleNewsCount, setVisibleNewsCount] = useState(initialVisibleNewsCount);
  const [signupFeedback, setSignupFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const clubSettingsQuery = useQuery({
    queryKey: ["public-club-settings"],
    queryFn: fetchClubSettings,
  });

  const newsQuery = useQuery({
    queryKey: ["landing-news"],
    queryFn: fetchNewsFeed,
  });

  const categoriesQuery = useQuery({
    queryKey: ["public-categories"],
    queryFn: fetchPublicCategories,
  });

  const boardMembersQuery = useQuery({
    queryKey: ["public-board-members"],
    queryFn: fetchPublicBoardMembers,
  });

  const sponsorsQuery = useQuery({
    queryKey: ["public-sponsors"],
    queryFn: fetchPublicSponsors,
  });

  const signupMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("parentOneFirstName", signupForm.parentOneFirstName);
      formData.append("parentOneLastName", signupForm.parentOneLastName);
      formData.append("parentOneEmail", signupForm.parentOneEmail);
      formData.append("parentOnePhone", signupForm.parentOnePhone);
      formData.append("childFirstName", signupForm.childFirstName);
      formData.append("childLastName", signupForm.childLastName);
      formData.append("childDateOfBirth", signupForm.childDateOfBirth);
      formData.append("childOib", signupForm.childOib);
      formData.append("gdprConsent", String(signupForm.gdprConsent));

      if (showSecondParent) {
        formData.append("parentTwoFirstName", signupForm.parentTwoFirstName);
        formData.append("parentTwoLastName", signupForm.parentTwoLastName);
        formData.append("parentTwoEmail", signupForm.parentTwoEmail);
        formData.append("parentTwoPhone", signupForm.parentTwoPhone);
      }

      if (signupForm.parentOneProfileImage) {
        formData.append("parentOneProfileImage", signupForm.parentOneProfileImage);
      }

      if (showSecondParent && signupForm.parentTwoProfileImage) {
        formData.append("parentTwoProfileImage", signupForm.parentTwoProfileImage);
      }

      if (signupForm.childProfileImage) {
        formData.append("childProfileImage", signupForm.childProfileImage);
      }

      return submitSignup(formData);
    },
    onSuccess: (result) => {
      const suggestedCategory = result.signupRequest.suggestedCategory?.name;

      setSignupFeedback({
        tone: "success",
        message: suggestedCategory
          ? `${result.message} Predložena kategorija: ${suggestedCategory}.`
          : result.message,
      });
      setShowSecondParent(false);
      setSignupForm(emptySignupForm);
    },
    onError: (error: Error) => {
      setSignupFeedback({
        tone: "error",
        message: error.message || "Prijava nije uspjela. Provjerite podatke i pokušajte ponovno.",
      });
    },
  });

  const clubSettings = clubSettingsQuery.data;
  const newsFeed = newsQuery.data;
  const newsItems = newsFeed?.items ?? [];
  const categories = categoriesQuery.data ?? [];
  const boardMembers = boardMembersQuery.data ?? [];
  const sponsors = sponsorsQuery.data ?? [];
  const {
    carouselRef: categoryCarouselRef,
    carouselState: categoryCarouselState,
    scrollCarousel: scrollCategories,
  } = useHorizontalCarouselControls(categories.length);
  const clubName = resolveSettingValue(clubSettings?.clubName, landingClubSettingsDefaults.clubName);
  const clubSubtitle = resolveSettingValue(
    clubSettings?.clubSubtitle,
    landingClubSettingsDefaults.clubSubtitle,
  );
  const selectedCategoryPreview =
    categories.find((category) => category.id === selectedCategoryId) ?? null;
  const contactEmail = resolveSettingValue(
    clubSettings?.contactEmail,
    landingClubSettingsDefaults.contactEmail,
  );
  const contactPhone = resolveSettingValue(
    clubSettings?.contactPhone,
    landingClubSettingsDefaults.contactPhone,
  );
  const visibleNewsItems = newsItems.slice(0, visibleNewsCount);
  const canLoadMoreNews = newsItems.length > visibleNewsCount;

  useEffect(() => {
    applyBrowserBranding({
      title: clubName,
      iconUrl: clubSettings?.logoUrl,
    });
  }, [clubName, clubSettings?.logoUrl]);

  useEffect(() => {
    setVisibleNewsCount(initialVisibleNewsCount);
  }, [newsItems.length]);

  useEffect(() => {
    if (!selectedCategoryId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedCategoryId(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedCategoryId]);

  return (
    <div className="landing-page bg-bg text-ink">
      <FeedbackToast feedback={signupFeedback} onClose={() => setSignupFeedback(null)} />

      <LandingHeader
        clubName={clubName}
        clubSubtitle={clubSubtitle}
        logoUrl={clubSettings?.logoUrl ?? null}
        showBoardMembersLink={boardMembers.length > 0}
        showSponsorsLink={sponsors.length > 0}
      />

      <main>
        <section className="border-b-2 border-line bg-bg" id="news">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
            {newsQuery.isLoading ? (
              <div className="grid gap-4 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="landing-panel h-80 animate-pulse border-2 border-line bg-panel"
                  />
                ))}
              </div>
            ) : newsItems.length === 0 ? (
              <div className="landing-panel border-2 border-line bg-surface p-6 text-center">
                <p className="landing-kicker text-muted">Novosti</p>
                <h2 className="mt-3 text-3xl">Nema objavljenih novosti.</h2>
              </div>
            ) : (
              <>
                <div className="grid gap-5 lg:grid-cols-3">
                  {visibleNewsItems.map((item) => (
                    <NewsCard
                      key={item.id}
                      item={item}
                    />
                  ))}
                </div>

                {canLoadMoreNews ? (
                  <div className="mt-6 flex justify-center">
                    <button
                      className="landing-pill landing-pill-button landing-pill--panel"
                      type="button"
                      onClick={() =>
                        setVisibleNewsCount((current) =>
                          Math.min(current + 3, newsItems.length),
                        )
                      }
                    >
                      Učitaj još novosti
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>

        <section className="border-b-2 border-line bg-bg" id="categories">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
            {categoriesQuery.isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="landing-panel h-56 animate-pulse border-2 border-line bg-panel"
                  />
                ))}
              </div>
            ) : categoriesQuery.isError ? (
              <div className="border-2 border-line bg-signal px-5 py-4 text-sm font-medium text-surface">
                Kategorije trenutno nije moguće učitati iz javnog API-ja.
              </div>
            ) : categories.length === 0 ? (
              <div className="landing-panel border-2 border-line bg-surface p-6 text-center">
                <p className="landing-kicker text-muted">Kategorije</p>
                <h2 className="mt-3 text-3xl">Nema objavljenih kategorija.</h2>
                <p className="landing-copy mx-auto mt-3 max-w-2xl text-sm">
                  Kategorije će se prikazati ovdje čim ih administratorski tim objavi.
                </p>
              </div>
            ) : (
              <div className={`landing-category-carousel landing-public-carousel ${categoryCarouselState.hasOverflow ? "has-controls" : ""}`}>
                <div
                  ref={categoryCarouselRef}
                  className="landing-category-carousel-track"
                  aria-label="Kategorije"
                >
                  {categories.map((category) => (
                    <div className="landing-category-carousel-slide" key={category.id}>
                      <CategoryShowcaseCard
                        category={category}
                        onOpen={() => setSelectedCategoryId(category.id)}
                      />
                    </div>
                  ))}
                </div>

                {categoryCarouselState.hasOverflow ? (
                  <>
                    <button
                      className="landing-public-carousel-button is-left"
                      type="button"
                      aria-label="Prethodne kategorije"
                      disabled={!categoryCarouselState.canScrollLeft}
                      onClick={() => scrollCategories(-1)}
                    >
                      ‹
                    </button>
                    <button
                      className="landing-public-carousel-button is-right"
                      type="button"
                      aria-label="Sljedeće kategorije"
                      disabled={!categoryCarouselState.canScrollRight}
                      onClick={() => scrollCategories(1)}
                    >
                      ›
                    </button>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </section>

        <section className="bg-bg" id="signup">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
            <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
              <div className="landing-panel border-2 border-line bg-surface p-6">
                <p className="landing-kicker text-muted">
                  Prijava djeteta
                </p>
                <h2 className="mt-4 text-4xl leading-tight">
                  Pokrenite prijavu prije prvog dolaska na trening.
                </h2>
                <div className="landing-copy mt-5 space-y-4 text-sm">
                  <p>
                    Ovdje možete poslati podatke o roditeljima, djetetu, profilnim slikama i GDPR suglasnosti.
                  </p>
                  <p>
                    Osoblje će pregledati prijavu, potvrditi odgovarajuću kategoriju i nastaviti obradu iz administracijskog sučelja.
                  </p>
                </div>

                <div className="mt-6 grid gap-3">
                  <div className="landing-panel border-2 border-line bg-panel px-4 py-4">
                    <p className="landing-kicker text-muted">
                      Pripremite
                    </p>
                    <p className="mt-3 text-sm leading-7 text-ink">
                      Kontakt podatke roditelja, datum rođenja djeteta, OIB i po želji profilne fotografije za bržu obradu.
                    </p>
                  </div>

                  <div className="landing-panel border-2 border-line bg-white px-4 py-4">
                    <p className="landing-kicker text-muted">
                      Tijek obrade
                    </p>
                    <p className="mt-3 text-sm leading-7 text-ink">
                      Odobrene prijave dobivaju pristupne podatke, a odbijene prijave ostaju zabilježene za daljnje praćenje.
                    </p>
                  </div>

                  <div className="landing-panel border-2 border-line bg-panel px-4 py-4">
                    <p className="landing-kicker text-muted">
                      Pristup aplikaciji
                    </p>
                    <p className="mt-3 text-sm leading-7 text-ink">
                      Nakon što administrator potvrdi prijavu, roditelji će e-poštom dobiti pristupne podatke za mobilnu aplikaciju.
                    </p>
                  </div>
                </div>
              </div>

              <section className="landing-surface border-2 border-line bg-surface">
                <div className="border-b-2 border-line bg-[linear-gradient(180deg,#f8fbff_0%,#f3f7fb_100%)] px-5 py-5">
                  <p className="landing-kicker text-muted">
                    Obiteljska prijava
                  </p>
                  <h3 className="mt-2 text-3xl">Pošaljite novu prijavu</h3>
                </div>

                <form
                  className="space-y-6 p-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setSignupFeedback(null);
                    signupMutation.mutate();
                  }}
                >
                  <Fieldset title="Roditelj 1">
                    <div className="grid gap-4 md:grid-cols-2">
                      <InputField
                        label="Ime"
                        value={signupForm.parentOneFirstName}
                        onChange={(value) =>
                          setSignupForm((current) => ({ ...current, parentOneFirstName: value }))
                        }
                        required
                      />
                      <InputField
                        label="Prezime"
                        value={signupForm.parentOneLastName}
                        onChange={(value) =>
                          setSignupForm((current) => ({ ...current, parentOneLastName: value }))
                        }
                        required
                      />
                      <InputField
                        label="E-pošta"
                        type="email"
                        value={signupForm.parentOneEmail}
                        onChange={(value) =>
                          setSignupForm((current) => ({ ...current, parentOneEmail: value }))
                        }
                        required
                      />
                      <InputField
                        label="Telefon"
                        value={signupForm.parentOnePhone}
                        onChange={(value) =>
                          setSignupForm((current) => ({ ...current, parentOnePhone: value }))
                        }
                        required
                      />
                    </div>
                    <FileField
                      label="Profilna fotografija"
                      file={signupForm.parentOneProfileImage}
                      onChange={(file) =>
                        setSignupForm((current) => ({ ...current, parentOneProfileImage: file }))
                      }
                    />
                  </Fieldset>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      className={`landing-parent-chip ${showSecondParent ? "is-active" : ""}`}
                      type="button"
                      onClick={() => {
                        setShowSecondParent((current) => !current);
                        setSignupForm((current) =>
                          showSecondParent
                            ? {
                                ...current,
                                parentTwoFirstName: "",
                                parentTwoLastName: "",
                                parentTwoEmail: "",
                                parentTwoPhone: "",
                                parentTwoProfileImage: null,
                              }
                            : current,
                        );
                      }}
                    >
                      <span aria-hidden="true">{showSecondParent ? "−" : "+"}</span>
                      {showSecondParent ? "Ukloni roditelja 2" : "Dodaj roditelja 2"}
                    </button>
                    <div className="landing-signup-note border-2 border-line bg-panel px-4 py-4 text-sm leading-7 text-ink">
                      Drugi roditelj nije obavezan, ali ako ga uključite potrebno je ispuniti sva njegova kontaktna polja.
                    </div>
                  </div>

                  {showSecondParent ? (
                    <Fieldset title="Roditelj 2">
                      <div className="grid gap-4 md:grid-cols-2">
                        <InputField
                          label="Ime"
                          value={signupForm.parentTwoFirstName}
                          onChange={(value) =>
                            setSignupForm((current) => ({ ...current, parentTwoFirstName: value }))
                          }
                          required
                        />
                        <InputField
                          label="Prezime"
                          value={signupForm.parentTwoLastName}
                          onChange={(value) =>
                            setSignupForm((current) => ({ ...current, parentTwoLastName: value }))
                          }
                          required
                        />
                        <InputField
                          label="E-pošta"
                          type="email"
                          value={signupForm.parentTwoEmail}
                          onChange={(value) =>
                            setSignupForm((current) => ({ ...current, parentTwoEmail: value }))
                          }
                          required
                        />
                        <InputField
                          label="Telefon"
                          value={signupForm.parentTwoPhone}
                          onChange={(value) =>
                            setSignupForm((current) => ({ ...current, parentTwoPhone: value }))
                          }
                          required
                        />
                      </div>
                      <FileField
                        label="Profilna fotografija"
                        file={signupForm.parentTwoProfileImage}
                        onChange={(file) =>
                          setSignupForm((current) => ({ ...current, parentTwoProfileImage: file }))
                        }
                      />
                    </Fieldset>
                  ) : null}

                  <Fieldset title="Dijete">
                    <div className="grid gap-4 md:grid-cols-2">
                      <InputField
                        label="Ime"
                        value={signupForm.childFirstName}
                        onChange={(value) =>
                          setSignupForm((current) => ({ ...current, childFirstName: value }))
                        }
                        required
                      />
                      <InputField
                        label="Prezime"
                        value={signupForm.childLastName}
                        onChange={(value) =>
                          setSignupForm((current) => ({ ...current, childLastName: value }))
                        }
                        required
                      />
                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                          Datum rođenja
                        </span>
                        <DatePicker
                          className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                          value={signupForm.childDateOfBirth}
                          onChange={(value) =>
                            setSignupForm((current) => ({ ...current, childDateOfBirth: value }))
                          }
                          required
                        />
                      </label>
                      <InputField
                        label="OIB"
                        value={signupForm.childOib}
                        onChange={(value) =>
                          setSignupForm((current) => ({ ...current, childOib: value }))
                        }
                        required
                      />
                    </div>
                    <FileField
                      label="Profilna fotografija"
                      file={signupForm.childProfileImage}
                      onChange={(file) =>
                        setSignupForm((current) => ({ ...current, childProfileImage: file }))
                      }
                    />
                  </Fieldset>

                  <label className="landing-gdpr-consent flex items-start gap-3 border-2 border-line bg-white px-4 py-4">
                    <input
                      className="landing-gdpr-checkbox mt-1 h-4 w-4 accent-accent"
                      type="checkbox"
                      checked={signupForm.gdprConsent}
                      onChange={(event) =>
                        setSignupForm((current) => ({
                          ...current,
                          gdprConsent: event.target.checked,
                        }))
                      }
                      required
                    />
                    <span className="text-sm leading-7">
                      Potvrđujem GDPR suglasnost za obradu ove obiteljske prijave i priloženih fotografija radi pregleda upisa.
                    </span>
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      className="landing-pill landing-pill-button landing-pill--accent"
                      type="submit"
                      disabled={signupMutation.isPending}
                    >
                      {signupMutation.isPending ? "Slanje..." : "Pošalji prijavu"}
                    </button>
                    <button
                      className="landing-pill landing-pill-button landing-pill--panel"
                      type="button"
                      onClick={() => {
                        setSignupFeedback(null);
                        setShowSecondParent(false);
                        setSignupForm(emptySignupForm);
                      }}
                    >
                      Resetiraj obrazac
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </div>
        </section>
      </main>

      {boardMembers.length > 0 ? <BoardMembersSection boardMembers={boardMembers} /> : null}
      {sponsors.length > 0 ? <SponsorsSection sponsors={sponsors} /> : null}

      <LandingFooter
        bankName={resolveSettingValue(clubSettings?.bankName, landingClubSettingsDefaults.bankName)}
        bankIban={resolveSettingValue(clubSettings?.bankIban, landingClubSettingsDefaults.bankIban)}
        bankRecipient={resolveSettingValue(
          clubSettings?.bankRecipient,
          landingClubSettingsDefaults.bankRecipient,
        )}
        contactEmail={contactEmail}
        contactPhone={contactPhone}
        facebookUrl={resolveSettingValue(
          clubSettings?.facebookUrl,
          landingClubSettingsDefaults.facebookUrl,
        )}
        instagramUrl={resolveSettingValue(
          clubSettings?.instagramUrl,
          landingClubSettingsDefaults.instagramUrl,
        )}
        youtubeUrl={resolveSettingValue(
          clubSettings?.youtubeUrl,
          landingClubSettingsDefaults.youtubeUrl,
        )}
      />

      {selectedCategoryId ? (
        <CategoryDetailsDrawer
          categoryId={selectedCategoryId}
          categoryPreview={selectedCategoryPreview}
          onClose={() => setSelectedCategoryId(null)}
        />
      ) : null}
    </div>
  );
}

function LandingHeader({
  clubName,
  clubSubtitle,
  logoUrl,
  showBoardMembersLink = false,
  showSponsorsLink = false,
}: {
  clubName: string;
  clubSubtitle: string;
  logoUrl: string | null;
  showBoardMembersLink?: boolean;
  showSponsorsLink?: boolean;
}) {
  const [isLogoBroken, setIsLogoBroken] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const clubMonogram = createClubMonogram(clubName);

  useEffect(() => {
    setIsLogoBroken(false);
  }, [logoUrl]);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-white/88 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link className="landing-header-brand" to="/">
            <span className="landing-header-mark">
              {logoUrl && !isLogoBroken ? (
                <img
                  src={logoUrl}
                  alt={clubName}
                  onError={() => setIsLogoBroken(true)}
                />
              ) : (
                <span aria-hidden="true">{clubMonogram}</span>
              )}
            </span>

            <span className="landing-header-brand-copy">
              <strong>{clubName}</strong>
              <span>{clubSubtitle}</span>
            </span>
          </Link>

          <button
            className={`landing-header-menu-button ${isMobileNavOpen ? "is-active" : ""}`}
            type="button"
            aria-controls="landing-mobile-nav"
            aria-expanded={isMobileNavOpen}
            aria-label={isMobileNavOpen ? "Zatvori navigaciju" : "Otvori navigaciju"}
            onClick={() => setIsMobileNavOpen((current) => !current)}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>

          <nav className="landing-header-nav" aria-label="Glavna navigacija">
            <a className="landing-header-link" href="/#news">
              Novosti
            </a>
            <a className="landing-header-link" href="/#categories">
              Kategorije
            </a>
            <a className="landing-header-link" href="/#signup">
              Prijava
            </a>
            {showBoardMembersLink ? (
              <a className="landing-header-link" href="/#board-members">
                Uprava
              </a>
            ) : null}
            {showSponsorsLink ? (
              <a className="landing-header-link" href="/#sponsors">
                Sponzori
              </a>
            ) : null}
          </nav>
        </div>

        <nav
          id="landing-mobile-nav"
          className={`landing-mobile-nav ${isMobileNavOpen ? "is-open" : ""}`}
          aria-label="Mobilna navigacija"
        >
          <a className="landing-mobile-nav-link" href="/#news" onClick={() => setIsMobileNavOpen(false)}>
            Novosti
          </a>
          <a className="landing-mobile-nav-link" href="/#categories" onClick={() => setIsMobileNavOpen(false)}>
            Kategorije
          </a>
          <a className="landing-mobile-nav-link" href="/#signup" onClick={() => setIsMobileNavOpen(false)}>
            Prijava
          </a>
          {showBoardMembersLink ? (
            <a className="landing-mobile-nav-link" href="/#board-members" onClick={() => setIsMobileNavOpen(false)}>
              Uprava
            </a>
          ) : null}
          {showSponsorsLink ? (
            <a className="landing-mobile-nav-link" href="/#sponsors" onClick={() => setIsMobileNavOpen(false)}>
              Sponzori
            </a>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

function useHorizontalCarouselControls(itemCount: number) {
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [carouselState, setCarouselState] = useState({
    hasOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });

  const updateCarouselState = () => {
    const carousel = carouselRef.current;

    if (!carousel) {
      setCarouselState({
        hasOverflow: false,
        canScrollLeft: false,
        canScrollRight: false,
      });
      return;
    }

    const maxScrollLeft = Math.max(0, carousel.scrollWidth - carousel.clientWidth);

    setCarouselState({
      hasOverflow: maxScrollLeft > 1,
      canScrollLeft: carousel.scrollLeft > 1,
      canScrollRight: carousel.scrollLeft < maxScrollLeft - 1,
    });
  };

  const scrollCarousel = (direction: -1 | 1) => {
    const carousel = carouselRef.current;

    if (!carousel) {
      return;
    }

    carousel.scrollBy({
      left: direction * Math.max(240, carousel.clientWidth * 0.78),
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const carousel = carouselRef.current;

    updateCarouselState();

    if (!carousel) {
      return;
    }

    const handleScroll = () => updateCarouselState();
    const handleResize = () => updateCarouselState();
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(handleResize);

    carousel.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);
    resizeObserver?.observe(carousel);

    return () => {
      carousel.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
    };
  }, [itemCount]);

  return {
    carouselRef,
    carouselState,
    scrollCarousel,
  };
}

function SponsorsSection({ sponsors }: { sponsors: PublicSponsor[] }) {
  const shouldAutoScroll = sponsors.length > 1;
  const sponsorMarqueeStyle = {
    "--landing-sponsors-duration": `${Math.max(18, sponsors.length * 4)}s`,
  } as CSSProperties;

  return (
    <section className="landing-sponsors-section border-t-2 border-line bg-surface" id="sponsors">
      <div className="landing-public-section-inner mx-auto max-w-7xl py-7">
        <div
          className={`landing-sponsors-marquee ${shouldAutoScroll ? "is-animated" : ""}`}
          style={sponsorMarqueeStyle}
        >
          <div className="landing-sponsors-track" aria-label="Sponzori kluba">
            {sponsors.map((sponsor) => (
              <SponsorLogoLink key={sponsor.id} sponsor={sponsor} />
            ))}
          </div>

          {shouldAutoScroll ? (
            <div className="landing-sponsors-track" aria-hidden="true">
              {sponsors.map((sponsor) => (
                <SponsorLogoLink key={`${sponsor.id}-loop`} sponsor={sponsor} isDuplicate />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SponsorLogoLink({
  sponsor,
  isDuplicate = false,
}: {
  sponsor: PublicSponsor;
  isDuplicate?: boolean;
}) {
  return (
    <a
      className="landing-sponsor-card"
      href={sponsor.websiteUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={isDuplicate ? undefined : `${sponsor.name} web stranica`}
      tabIndex={isDuplicate ? -1 : undefined}
    >
      <img src={sponsor.logoUrl} alt={isDuplicate ? "" : sponsor.name} />
    </a>
  );
}

function BoardMembersSection({ boardMembers }: { boardMembers: PublicBoardMember[] }) {
  const { carouselRef, carouselState, scrollCarousel } = useHorizontalCarouselControls(
    boardMembers.length,
  );

  return (
    <section className="landing-board-section border-t-2 border-line bg-bg" id="board-members">
      <div className="landing-public-section-inner mx-auto max-w-7xl py-8 lg:py-10">
        <div className={`landing-public-carousel ${carouselState.hasOverflow ? "has-controls" : ""}`}>
          <div
            ref={carouselRef}
            className={`landing-board-grid ${carouselState.hasOverflow ? "is-overflowing" : ""}`}
            aria-label="Članovi uprave"
          >
            {boardMembers.map((boardMember) => (
              <article className="landing-board-card" key={boardMember.id}>
                <img src={boardMember.imageUrl} alt={boardMember.name} />
                <div className="landing-board-card-copy">
                  <h3>{boardMember.name}</h3>
                  <p>{boardMember.position}</p>
                </div>
              </article>
            ))}
          </div>

          {carouselState.hasOverflow ? (
            <>
              <button
                className="landing-public-carousel-button is-left"
                type="button"
                aria-label="Prethodni članovi uprave"
                disabled={!carouselState.canScrollLeft}
                onClick={() => scrollCarousel(-1)}
              >
                ‹
              </button>
              <button
                className="landing-public-carousel-button is-right"
                type="button"
                aria-label="Sljedeći članovi uprave"
                disabled={!carouselState.canScrollRight}
                onClick={() => scrollCarousel(1)}
              >
                ›
              </button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function LandingFooter({
  bankName,
  bankIban,
  bankRecipient,
  contactEmail,
  contactPhone,
  facebookUrl,
  instagramUrl,
  youtubeUrl,
}: {
  bankName: string | null;
  bankIban: string | null;
  bankRecipient: string | null;
  contactEmail: string;
  contactPhone: string;
  facebookUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
}) {
  const bankDetails = [
    {
      label: "Primatelj",
      value: bankRecipient,
    },
    {
      label: "IBAN",
      value: bankIban,
    },
    {
      label: "Banka",
      value: bankName,
    },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));
  const contactDetails = [
    {
      label: "E-pošta",
      value: contactEmail,
    },
    {
      label: "Telefon",
      value: contactPhone,
    },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value.trim()));
  const socialLinks = [
    {
      label: "Facebook",
      platform: "facebook" as const,
      url: facebookUrl,
    },
    {
      label: "Instagram",
      platform: "instagram" as const,
      url: instagramUrl,
    },
    {
      label: "YouTube",
      platform: "youtube" as const,
      url: youtubeUrl,
    },
  ].filter((item): item is { label: string; platform: SocialPlatform; url: string } => Boolean(item.url));

  return (
    <footer className="border-t-2 border-line bg-[linear-gradient(180deg,#f7fbff_0%,#edf4fb_100%)]">
      <div className="landing-footer-grid mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {contactDetails.length > 0 ? (
          <section className="landing-footer-column">
            <p className="landing-kicker text-muted">Kontakt</p>
            <div className="landing-footer-list mt-4">
              {contactDetails.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {socialLinks.length > 0 ? (
          <section className="landing-footer-column">
            <p className="landing-kicker text-muted">Društvene mreže</p>
            <div className="landing-footer-social-links mt-4">
              {socialLinks.map((item) => (
                <a
                  key={item.platform}
                  className="landing-footer-social-link"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={item.label}
                  title={item.label}
                >
                  <SocialIcon platform={item.platform} />
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {bankDetails.length > 0 ? (
          <section className="landing-footer-column">
            <p className="landing-kicker text-muted">Podaci za uplatu</p>
            <div className="landing-footer-list mt-4">
              {bankDetails.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="landing-footer-column">
          <p className="landing-kicker text-muted">Dokumenti</p>
          <div className="landing-footer-list mt-4">
            <Link to="/pravila-privatnosti">Pravila privatnosti</Link>
            <Link to="/brisanje-racuna">Brisanje računa</Link>
          </div>
        </section>
      </div>
    </footer>
  );
}

type SocialPlatform = "facebook" | "instagram" | "youtube";

function SocialIcon({ platform }: { platform: SocialPlatform }) {
  if (platform === "facebook") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M14.1 8.7V7.2c0-.7.5-.9.9-.9h2.2V2.6h-3.1c-3.4 0-4.2 2.5-4.2 4.2v1.9H7.2v3.8h2.7v8.9h4.2v-8.9h3l.5-3.8h-3.5Z" />
      </svg>
    );
  }

  if (platform === "instagram") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M7.4 2.8h9.2a4.6 4.6 0 0 1 4.6 4.6v9.2a4.6 4.6 0 0 1-4.6 4.6H7.4a4.6 4.6 0 0 1-4.6-4.6V7.4a4.6 4.6 0 0 1 4.6-4.6Zm0 3.1a1.5 1.5 0 0 0-1.5 1.5v9.2a1.5 1.5 0 0 0 1.5 1.5h9.2a1.5 1.5 0 0 0 1.5-1.5V7.4a1.5 1.5 0 0 0-1.5-1.5H7.4Zm4.6 2a4.1 4.1 0 1 1 0 8.2 4.1 4.1 0 0 1 0-8.2Zm0 2.8a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm4.5-3.3a1 1 0 1 1 0 2.1 1 1 0 0 1 0-2.1Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M21.4 7.1a3 3 0 0 0-2.1-2.1C17.5 4.5 12 4.5 12 4.5S6.5 4.5 4.7 5a3 3 0 0 0-2.1 2.1A31.2 31.2 0 0 0 2.1 12c0 1.6.2 3.2.5 4.9A3 3 0 0 0 4.7 19c1.8.5 7.3.5 7.3.5s5.5 0 7.3-.5a3 3 0 0 0 2.1-2.1c.3-1.7.5-3.3.5-4.9s-.2-3.2-.5-4.9ZM10 15.2V8.8l5.7 3.2-5.7 3.2Z" />
    </svg>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <Link
      className="landing-news-card landing-panel border-2 border-line bg-surface"
      to={`/novosti/${item.slug}`}
    >
      <div className="landing-news-card-media">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.title} />
        ) : (
          <div className="landing-news-card-placeholder" aria-hidden="true" />
        )}
      </div>

      <div className="landing-news-card-body">
        <div className="landing-news-card-meta">
          <span>{item.eyebrow}</span>
          <time dateTime={item.publishedAt}>{formatLongDate(item.publishedAt)}</time>
        </div>

        <div className="space-y-3">
          <h3 className="text-3xl leading-tight">{item.title}</h3>
          <p className="landing-copy text-sm">{item.summary}</p>
        </div>

        <div className="landing-news-card-cta">
          <span>{item.ctaLabel}</span>
          <span aria-hidden="true">↗</span>
        </div>
      </div>
    </Link>
  );
}

function CategoryShowcaseCard({
  category,
  onOpen,
}: {
  category: PublicCategory;
  onOpen: () => void;
}) {
  return (
    <button
      className="landing-category-showcase landing-panel border-2 border-line bg-surface"
      type="button"
      onClick={onOpen}
    >
      <div className="landing-category-showcase-media">
        {category.logoUrl ? (
          <img
            className="landing-category-showcase-logo"
            src={category.logoUrl}
            alt={category.name}
          />
        ) : (
          <div className="landing-category-showcase-monogram">
            {createClubMonogram(category.name)}
          </div>
        )}
      </div>

      <div className="landing-category-showcase-body">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-[1.9rem] leading-tight">{category.name}</h3>
          <span aria-hidden="true" className="landing-category-showcase-arrow">
            ↗
          </span>
        </div>

        <div className="landing-category-showcase-age">
          <span>Dobna granica</span>
          <strong>{formatCategoryAgeRule(category)}</strong>
        </div>
      </div>
    </button>
  );
}

function PrivacyPolicyPage() {
  const clubSettingsQuery = useQuery({
    queryKey: ["public-club-settings"],
    queryFn: fetchClubSettings,
  });
  const boardMembersQuery = useQuery({
    queryKey: ["public-board-members"],
    queryFn: fetchPublicBoardMembers,
  });
  const sponsorsQuery = useQuery({
    queryKey: ["public-sponsors"],
    queryFn: fetchPublicSponsors,
  });
  const clubSettings = clubSettingsQuery.data;
  const boardMembers = boardMembersQuery.data ?? [];
  const sponsors = sponsorsQuery.data ?? [];
  const clubName = resolveSettingValue(clubSettings?.clubName, landingClubSettingsDefaults.clubName);
  const clubSubtitle = resolveSettingValue(
    clubSettings?.clubSubtitle,
    landingClubSettingsDefaults.clubSubtitle,
  );
  const contactEmail = resolveSettingValue(
    clubSettings?.contactEmail,
    landingClubSettingsDefaults.contactEmail,
  );
  const contactPhone = resolveSettingValue(
    clubSettings?.contactPhone,
    landingClubSettingsDefaults.contactPhone,
  );

  useEffect(() => {
    applyBrowserBranding({
      title: `Pravila privatnosti | ${clubName}`,
      iconUrl: clubSettings?.logoUrl,
    });
  }, [clubName, clubSettings?.logoUrl]);

  return (
    <div className="landing-page bg-bg text-ink">
      <LandingHeader
        clubName={clubName}
        clubSubtitle={clubSubtitle}
        logoUrl={clubSettings?.logoUrl ?? null}
        showBoardMembersLink={boardMembers.length > 0}
        showSponsorsLink={sponsors.length > 0}
      />

      <main className="border-b-2 border-line bg-bg">
        <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          <article className="landing-privacy-shell landing-surface border-2 border-line bg-surface p-5 sm:p-7 lg:p-9">
            <p className="landing-kicker text-muted">Pravila privatnosti</p>
            <h1 className="mt-3 text-4xl leading-tight">{clubName}</h1>
            <p className="landing-copy mt-4 text-sm">Zadnje ažuriranje: 19.08.2026.</p>

            <div className="landing-privacy-content mt-7">
              <section>
                <h2>1. Tko upravlja podacima</h2>
                <p>
                  Ovim pravilima opisujemo kako {clubName} obrađuje osobne podatke u
                  mobilnoj aplikaciji i povezanim klupskim sustavima za članove,
                  roditelje, igrače, trenere i administratore.
                </p>
                <p>
                  Za pitanja o privatnosti obratite nam se putem službenih kontakt
                  podataka kluba{contactEmail ? ` ili na ${contactEmail}` : ""}.
                </p>
                <div className="landing-privacy-contact">
                  <p>
                    <strong>Voditelj obrade:</strong> {privacyLegalName}
                  </p>
                  <p>
                    <strong>Adresa:</strong> {privacyLegalAddress}
                  </p>
                  <p>
                    <strong>E-pošta:</strong> {privacyContactEmail}
                  </p>
                  <p>
                    <strong>Telefon:</strong> {privacyContactPhone}
                  </p>
                </div>
              </section>

              <section>
                <h2>2. Koje podatke obrađujemo</h2>
                <ul>
                  <li>Podatke računa: ime, prezime, e-pošta, korisničko ime, lozinka u zaštićenom obliku i uloga korisnika.</li>
                  <li>Kontakt podatke: e-pošta i telefonski broj kada su uneseni u klupski sustav.</li>
                  <li>Podatke o igračima i članstvu: datum rođenja, OIB, kategorija, povezani roditelji, status članstva i evidencija dolazaka.</li>
                  <li>Raspored i sportske podatke: termini treninga, dodijeljeni treneri, prisutnosti, poredak i obavijesti vezane uz treninge.</li>
                  <li>Tehničke podatke: token za push obavijesti i osnovne podatke potrebne za sigurnu prijavu i rad aplikacije.</li>
                </ul>
              </section>

              <section>
                <h2>3. Kamera, QR kodovi i uplate</h2>
                <p>
                  Aplikacija koristi kameru samo za skeniranje QR kodova za evidenciju
                  dolazaka. Slike ili video zapisi s kamere ne spremaju se u aplikaciji.
                </p>
                <p>
                  Roditeljski QR nalog za uplatu služi za izradu bankovnog predloška.
                  Aplikacija ne obrađuje kartice, ne provodi naplatu i ne prima podatke
                  o izvršenoj bankovnoj transakciji.
                </p>
              </section>

              <section>
                <h2>4. Zašto koristimo podatke</h2>
                <ul>
                  <li>Za prijavu korisnika i prikaz podataka prema ulozi korisnika.</li>
                  <li>Za vođenje rasporeda treninga, evidencije dolazaka i klupskih obavijesti.</li>
                  <li>Za komunikaciju s roditeljima, igračima i trenerima.</li>
                  <li>Za sigurnost računa, administraciju članstva i ispunjavanje zakonskih obveza kluba.</li>
                </ul>
              </section>

              <section>
                <h2>5. Dijeljenje podataka</h2>
                <p>
                  Podatke ne prodajemo i ne koristimo za oglašavanje. Podaci se mogu
                  obrađivati putem pružatelja usluga koji omogućuju hosting, bazu
                  podataka, slanje e-pošte, push obavijesti i distribuciju aplikacije.
                  Ti pružatelji smiju obrađivati podatke samo u svrhu rada klupskog sustava.
                </p>
              </section>

              <section>
                <h2>6. Djeca i roditelji</h2>
                <p>
                  Aplikacija može prikazivati podatke djece koja su članovi kluba.
                  Roditelji imaju pristup podacima svoje djece, a igrači imaju pristup
                  podacima potrebnima za raspored, dolaske i obavijesti.
                </p>
              </section>

              <section>
                <h2>7. Brisanje računa i prava korisnika</h2>
                <p>
                  Korisnici mogu zatražiti brisanje računa kroz mobilnu aplikaciju ili
                  kontaktiranjem kluba. Određene podatke klub može zadržati kada je to
                  potrebno zbog zakonskih obveza, sigurnosti, evidencije članstva ili
                  legitimnog interesa kluba.
                </p>
              </section>

              <section>
                <h2>8. Sigurnost i čuvanje podataka</h2>
                <p>
                  Podaci se prenose putem zaštićenih veza, a lozinke se ne čuvaju u
                  izvornom obliku. Podatke čuvamo onoliko dugo koliko je potrebno za
                  rad kluba, članstvo, sigurnost i zakonske obveze.
                </p>
              </section>

              <section>
                <h2>9. Izmjene pravila</h2>
                <p>
                  Ova pravila možemo povremeno ažurirati. Nova verzija bit će objavljena
                  na ovoj stranici.
                </p>
              </section>
            </div>
          </article>
        </section>
      </main>

      <LandingFooter
        bankName={resolveSettingValue(clubSettings?.bankName, landingClubSettingsDefaults.bankName)}
        bankIban={resolveSettingValue(clubSettings?.bankIban, landingClubSettingsDefaults.bankIban)}
        bankRecipient={resolveSettingValue(
          clubSettings?.bankRecipient,
          landingClubSettingsDefaults.bankRecipient,
        )}
        contactEmail={contactEmail}
        contactPhone={contactPhone}
        facebookUrl={resolveSettingValue(
          clubSettings?.facebookUrl,
          landingClubSettingsDefaults.facebookUrl,
        )}
        instagramUrl={resolveSettingValue(
          clubSettings?.instagramUrl,
          landingClubSettingsDefaults.instagramUrl,
        )}
        youtubeUrl={resolveSettingValue(
          clubSettings?.youtubeUrl,
          landingClubSettingsDefaults.youtubeUrl,
        )}
      />
    </div>
  );
}

function AccountDeletionPage() {
  const clubSettingsQuery = useQuery({
    queryKey: ["public-club-settings"],
    queryFn: fetchClubSettings,
  });
  const boardMembersQuery = useQuery({
    queryKey: ["public-board-members"],
    queryFn: fetchPublicBoardMembers,
  });
  const sponsorsQuery = useQuery({
    queryKey: ["public-sponsors"],
    queryFn: fetchPublicSponsors,
  });
  const clubSettings = clubSettingsQuery.data;
  const boardMembers = boardMembersQuery.data ?? [];
  const sponsors = sponsorsQuery.data ?? [];
  const clubName = resolveSettingValue(clubSettings?.clubName, landingClubSettingsDefaults.clubName);
  const clubSubtitle = resolveSettingValue(
    clubSettings?.clubSubtitle,
    landingClubSettingsDefaults.clubSubtitle,
  );
  const contactEmail = resolveSettingValue(
    clubSettings?.contactEmail,
    landingClubSettingsDefaults.contactEmail,
  );
  const contactPhone = resolveSettingValue(
    clubSettings?.contactPhone,
    landingClubSettingsDefaults.contactPhone,
  );

  useEffect(() => {
    applyBrowserBranding({
      title: `Brisanje računa | ${clubName}`,
      iconUrl: clubSettings?.logoUrl,
    });
  }, [clubName, clubSettings?.logoUrl]);

  return (
    <div className="landing-page bg-bg text-ink">
      <LandingHeader
        clubName={clubName}
        clubSubtitle={clubSubtitle}
        logoUrl={clubSettings?.logoUrl ?? null}
        showBoardMembersLink={boardMembers.length > 0}
        showSponsorsLink={sponsors.length > 0}
      />

      <main className="border-b-2 border-line bg-bg">
        <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          <article className="landing-privacy-shell landing-surface border-2 border-line bg-surface p-5 sm:p-7 lg:p-9">
            <p className="landing-kicker text-muted">Korisnički račun</p>
            <h1 className="mt-3 text-4xl leading-tight">Brisanje računa</h1>
            <p className="landing-copy mt-4 text-sm">Zadnje ažuriranje: 19.08.2026.</p>

            <div className="landing-privacy-content mt-7">
              <section>
                <h2>Kako zatražiti brisanje</h2>
                <p>
                  Korisnici mogu zatražiti brisanje računa iz mobilne aplikacije u
                  profilu korisnika. Ako nemate pristup aplikaciji, zahtjev možete
                  poslati klubu na {privacyContactEmail}.
                </p>
              </section>

              <section>
                <h2>Što se briše</h2>
                <p>
                  Nakon odobrenog zahtjeva briše se ili deaktivira korisnički račun i
                  osobni podaci koji više nisu potrebni za rad kluba, sigurnost računa
                  ili zakonske obveze.
                </p>
              </section>

              <section>
                <h2>Što se može zadržati</h2>
                <p>
                  Klub može zadržati podatke koji su potrebni zbog zakonskih obveza,
                  evidencije članstva, sigurnosti sustava, financijskih evidencija ili
                  legitimnog interesa kluba.
                </p>
              </section>

              <section>
                <h2>Kontakt</h2>
                <div className="landing-privacy-contact">
                  <p>
                    <strong>Voditelj obrade:</strong> {privacyLegalName}
                  </p>
                  <p>
                    <strong>Adresa:</strong> {privacyLegalAddress}
                  </p>
                  <p>
                    <strong>E-pošta:</strong> {privacyContactEmail}
                  </p>
                  <p>
                    <strong>Telefon:</strong> {privacyContactPhone}
                  </p>
                </div>
              </section>
            </div>
          </article>
        </section>
      </main>

      <LandingFooter
        bankName={resolveSettingValue(clubSettings?.bankName, landingClubSettingsDefaults.bankName)}
        bankIban={resolveSettingValue(clubSettings?.bankIban, landingClubSettingsDefaults.bankIban)}
        bankRecipient={resolveSettingValue(
          clubSettings?.bankRecipient,
          landingClubSettingsDefaults.bankRecipient,
        )}
        contactEmail={contactEmail}
        contactPhone={contactPhone}
        facebookUrl={resolveSettingValue(
          clubSettings?.facebookUrl,
          landingClubSettingsDefaults.facebookUrl,
        )}
        instagramUrl={resolveSettingValue(
          clubSettings?.instagramUrl,
          landingClubSettingsDefaults.instagramUrl,
        )}
        youtubeUrl={resolveSettingValue(
          clubSettings?.youtubeUrl,
          landingClubSettingsDefaults.youtubeUrl,
        )}
      />
    </div>
  );
}

function ArticlePage() {
  const { slug } = useParams();
  const [activeGalleryIndex, setActiveGalleryIndex] = useState<number | null>(null);
  const clubSettingsQuery = useQuery({
    queryKey: ["public-club-settings"],
    queryFn: fetchClubSettings,
  });
  const newsQuery = useQuery({
    queryKey: ["landing-news"],
    queryFn: fetchNewsFeed,
  });
  const boardMembersQuery = useQuery({
    queryKey: ["public-board-members"],
    queryFn: fetchPublicBoardMembers,
  });
  const sponsorsQuery = useQuery({
    queryKey: ["public-sponsors"],
    queryFn: fetchPublicSponsors,
  });

  const clubSettings = clubSettingsQuery.data;
  const clubName = resolveSettingValue(clubSettings?.clubName, landingClubSettingsDefaults.clubName);
  const clubSubtitle = resolveSettingValue(
    clubSettings?.clubSubtitle,
    landingClubSettingsDefaults.clubSubtitle,
  );
  const contactEmail = resolveSettingValue(
    clubSettings?.contactEmail,
    landingClubSettingsDefaults.contactEmail,
  );
  const contactPhone = resolveSettingValue(
    clubSettings?.contactPhone,
    landingClubSettingsDefaults.contactPhone,
  );
  const article = newsQuery.data?.items.find((item) => item.slug === slug) ?? null;
  const boardMembers = boardMembersQuery.data ?? [];
  const sponsors = sponsorsQuery.data ?? [];
  const relatedArticles =
    newsQuery.data?.items.filter((item) => item.slug !== slug).slice(0, 2) ?? [];
  const galleryImages = article
    ? [
        ...(article.imageUrl ? [article.imageUrl] : []),
        ...article.imageUrls,
      ].filter((imageUrl, index, list) => list.indexOf(imageUrl) === index)
    : [];
  const activeGalleryImage =
    activeGalleryIndex === null ? null : galleryImages[activeGalleryIndex] ?? null;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [slug]);

  useEffect(() => {
    applyBrowserBranding({
      title: article ? `${article.title} | ${clubName}` : `${clubName} | Novost`,
      iconUrl: clubSettings?.logoUrl,
    });
  }, [article, clubName, clubSettings?.logoUrl]);

  useEffect(() => {
    setActiveGalleryIndex(null);
  }, [slug]);

  useEffect(() => {
    if (activeGalleryIndex === null || galleryImages.length === 0) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const goToPreviousImage = () =>
      setActiveGalleryIndex((current) =>
        current === null ? current : (current - 1 + galleryImages.length) % galleryImages.length,
      );
    const goToNextImage = () =>
      setActiveGalleryIndex((current) =>
        current === null ? current : (current + 1) % galleryImages.length,
      );
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveGalleryIndex(null);
      }

      if (event.key === "ArrowLeft") {
        goToPreviousImage();
      }

      if (event.key === "ArrowRight") {
        goToNextImage();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeGalleryIndex, galleryImages.length]);

  return (
    <div className="landing-page bg-bg text-ink">
      <LandingHeader
        clubName={clubName}
        clubSubtitle={clubSubtitle}
        logoUrl={clubSettings?.logoUrl ?? null}
        showBoardMembersLink={boardMembers.length > 0}
        showSponsorsLink={sponsors.length > 0}
      />

      <main>
        <section className="border-b-2 border-line bg-bg">
          <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
            <a className="landing-pill landing-pill-button landing-pill--outline" href="/#news">
              Povratak na novosti
            </a>

            {newsQuery.isLoading ? (
              <div className="mt-5 space-y-4">
                <div className="landing-panel h-80 animate-pulse border-2 border-line bg-panel" />
                <div className="landing-panel h-40 animate-pulse border-2 border-line bg-panel" />
              </div>
            ) : article ? (
              <>
                <article className="landing-article-shell landing-surface mt-5 border-2 border-line bg-surface">
                  <div className="landing-article-hero">
                    {article.imageUrl ? (
                      <button
                        className="landing-article-hero-button"
                        type="button"
                        onClick={() => setActiveGalleryIndex(0)}
                        aria-label="Otvori galeriju slika"
                      >
                        <img src={article.imageUrl} alt={article.title} />
                      </button>
                    ) : (
                      <div className="landing-news-card-placeholder">
                        <span>{article.eyebrow}</span>
                      </div>
                    )}
                  </div>

                  <div className="landing-article-grid p-5 sm:p-6 lg:p-8">
                    <div className="landing-article-content">
                      <div className="landing-news-card-meta">
                        <span>{article.eyebrow}</span>
                        <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
                      </div>

                      <h1 className="mt-5 text-4xl leading-tight sm:text-5xl">{article.title}</h1>
                      <p className="landing-copy mt-5 text-base sm:text-lg">{article.summary}</p>

                      <div className="mt-8 space-y-5">
                        {article.content.map((paragraph, index) => (
                          <p key={`${article.id}-paragraph-${index}`}>{paragraph}</p>
                        ))}
                      </div>

                      {galleryImages.length > 1 ? (
                        <ArticleGallery
                          articleTitle={article.title}
                          images={galleryImages}
                          onOpen={setActiveGalleryIndex}
                        />
                      ) : null}
                    </div>
                  </div>
                </article>

                {relatedArticles.length > 0 ? (
                  <section className="mt-8">
                    <div className="mb-4">
                      <p className="landing-kicker text-muted">Još novosti</p>
                      <h2 className="mt-2 text-3xl">Povezane objave</h2>
                    </div>
                    <div className="grid gap-5 lg:grid-cols-2">
                      {relatedArticles.map((item) => (
                        <NewsCard key={item.id} item={item} />
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            ) : (
              <div className="landing-panel mt-5 border-2 border-line bg-surface p-6">
                <p className="landing-kicker text-muted">Novost nije pronađena</p>
                <h1 className="mt-3 text-3xl">Tražena objava trenutno nije dostupna.</h1>
                <p className="landing-copy mt-4 text-sm">
                  Moguće je da je poveznica zastarjela ili da je sadržaj uklonjen iz izvora podataka.
                </p>
                <div className="mt-6">
                  <a
                    className="landing-button landing-button-primary landing-button-compact border-2 border-line px-4 py-3 text-sm font-bold uppercase tracking-[0.18em]"
                    href="/#news"
                  >
                    Natrag na novosti
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {activeGalleryImage ? (
        <GalleryCarousel
          activeIndex={activeGalleryIndex ?? 0}
          articleTitle={article?.title ?? ""}
          images={galleryImages}
          onClose={() => setActiveGalleryIndex(null)}
          onNext={() =>
            setActiveGalleryIndex((current) =>
              current === null ? current : (current + 1) % galleryImages.length,
            )
          }
          onPrevious={() =>
            setActiveGalleryIndex((current) =>
              current === null ? current : (current - 1 + galleryImages.length) % galleryImages.length,
            )
          }
          onSelect={setActiveGalleryIndex}
        />
      ) : null}

      <LandingFooter
        bankName={resolveSettingValue(clubSettings?.bankName, landingClubSettingsDefaults.bankName)}
        bankIban={resolveSettingValue(clubSettings?.bankIban, landingClubSettingsDefaults.bankIban)}
        bankRecipient={resolveSettingValue(
          clubSettings?.bankRecipient,
          landingClubSettingsDefaults.bankRecipient,
        )}
        contactEmail={contactEmail}
        contactPhone={contactPhone}
        facebookUrl={resolveSettingValue(
          clubSettings?.facebookUrl,
          landingClubSettingsDefaults.facebookUrl,
        )}
        instagramUrl={resolveSettingValue(
          clubSettings?.instagramUrl,
          landingClubSettingsDefaults.instagramUrl,
        )}
        youtubeUrl={resolveSettingValue(
          clubSettings?.youtubeUrl,
          landingClubSettingsDefaults.youtubeUrl,
        )}
      />
    </div>
  );
}

function ArticleGallery({
  articleTitle,
  images,
  onOpen,
}: {
  articleTitle: string;
  images: string[];
  onOpen: (index: number) => void;
}) {
  return (
    <section className="landing-article-gallery" aria-label="Galerija slika">
      <div className="landing-article-gallery-header">
        <p className="landing-kicker text-muted">Galerija</p>
        <span>{images.length} slika</span>
      </div>

      <div className="landing-article-gallery-grid">
        {images.map((imageUrl, index) => (
          <button
            key={`${imageUrl}-${index}`}
            className="landing-article-gallery-item"
            type="button"
            onClick={() => onOpen(index)}
            aria-label={`Otvori sliku ${index + 1} iz galerije`}
          >
            <img src={imageUrl} alt={`${articleTitle} - slika ${index + 1}`} />
          </button>
        ))}
      </div>
    </section>
  );
}

function GalleryCarousel({
  activeIndex,
  articleTitle,
  images,
  onClose,
  onNext,
  onPrevious,
  onSelect,
}: {
  activeIndex: number;
  articleTitle: string;
  images: string[];
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSelect: (index: number) => void;
}) {
  const activeImage = images[activeIndex];

  if (!activeImage) {
    return null;
  }

  return (
    <div
      className="landing-gallery-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Pregled galerije"
    >
      <button
        className="landing-gallery-backdrop"
        type="button"
        onClick={onClose}
        aria-label="Zatvori galeriju"
      />

      <div className="landing-gallery-dialog">
        <div className="landing-gallery-topbar">
          <span>
            {activeIndex + 1} / {images.length}
          </span>
          <button
            className="landing-gallery-icon-button"
            type="button"
            onClick={onClose}
            aria-label="Zatvori galeriju"
            title="Zatvori"
          >
            ×
          </button>
        </div>

        <div className="landing-gallery-stage">
          {images.length > 1 ? (
            <button
              className="landing-gallery-nav landing-gallery-nav--previous"
              type="button"
              onClick={onPrevious}
              aria-label="Prethodna slika"
              title="Prethodna slika"
            >
              ←
            </button>
          ) : null}

          <img src={activeImage} alt={`${articleTitle} - slika ${activeIndex + 1}`} />

          {images.length > 1 ? (
            <button
              className="landing-gallery-nav landing-gallery-nav--next"
              type="button"
              onClick={onNext}
              aria-label="Sljedeća slika"
              title="Sljedeća slika"
            >
              →
            </button>
          ) : null}
        </div>

        {images.length > 1 ? (
          <div className="landing-gallery-strip" aria-label="Odabir slike">
            {images.map((imageUrl, index) => (
              <button
                key={`${imageUrl}-thumb-${index}`}
                className={`landing-gallery-thumb ${index === activeIndex ? "is-active" : ""}`}
                type="button"
                onClick={() => onSelect(index)}
                aria-label={`Prikaži sliku ${index + 1}`}
                aria-current={index === activeIndex}
              >
                <img src={imageUrl} alt="" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatDate(dateIso: string) {
  return formatNumericDate(new Date(dateIso));
}

function formatLongDate(dateIso: string) {
  const date = new Date(dateIso);
  const weekday = new Intl.DateTimeFormat("hr-HR", { weekday: "short" }).format(date);
  return `${weekday} ${formatNumericDate(date)}`;
}

function formatNumericDate(date: Date) {
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const year = date.getFullYear();

  return `${day}.${month}.${year}.`;
}

function formatCategoryAgeRule(category: {
  startDateOfBirth: string | null;
  endDateOfBirth: string | null;
}) {
  if (category.startDateOfBirth) {
    return `od ${formatDate(category.startDateOfBirth)}`;
  }

  if (category.endDateOfBirth) {
    return formatBirthYear(category.endDateOfBirth);
  }

  return "bez ograničenja";
}

function formatBirthYear(dateIso: string) {
  const year = new Intl.DateTimeFormat("hr-HR", { year: "numeric" })
    .format(new Date(dateIso))
    .replace(/\.+$/, "");

  return `${year}. i mlađi`;
}

function createClubMonogram(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return letters || "WP";
}

function Fieldset({
  title,
  children,
}: React.PropsWithChildren<{ title: string }>) {
  return (
    <fieldset className="border-2 border-line bg-bg p-4">
      <legend className="border-2 border-line bg-panel-strong px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-ink">
        {title}
      </legend>
      <div className="mt-2 space-y-4">{children}</div>
    </fieldset>
  );
}

function InputField({
  label,
  value,
  onChange,
  required = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="landing-kicker mb-2 block text-muted">
        {label}
      </span>
      <input
        className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-surface"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </label>
  );
}

function FileField({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const inputId = useId();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [file]);

  return (
    <div className="block">
      <label className="landing-kicker mb-2 block text-muted" htmlFor={inputId}>
        {label}
      </label>
      <div className="landing-file-field">
        <input
          id={inputId}
          className="landing-file-input"
          type="file"
          accept="image/*"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onChange(event.target.files?.[0] ?? null)
          }
        />

        <div className="landing-file-preview">
          {previewUrl ? (
            <img src={previewUrl} alt={`Pregled: ${file?.name ?? label}`} />
          ) : (
            <span aria-hidden="true">+</span>
          )}
        </div>

        <div className="landing-file-copy">
          <div>
            <p>{file ? file.name : "Nijedna fotografija nije odabrana"}</p>
            <span>{file ? "Fotografija je spremna za slanje." : "JPG, PNG ili drugi format slike."}</span>
          </div>

          <div className="landing-file-actions">
            <label className="landing-parent-chip" htmlFor={inputId}>
              <span aria-hidden="true">+</span>
              {file ? "Odaberi novu fotografiju" : "Odaberi fotografiju"}
            </label>
            {file ? (
              <button
                className="landing-file-remove"
                type="button"
                onClick={() => onChange(null)}
              >
                Ukloni
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
