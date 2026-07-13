import { useMutation, useQuery } from "@tanstack/react-query";
import { type ChangeEvent, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { CategoryDetailsDrawer } from "./components/category-details-drawer";
import { fetchNewsFeed, type NewsItem } from "./lib/contentful";
import {
  fetchClubSettings,
  type PublicCategory,
  fetchPublicCategories,
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

const footerSocialLinks = [
  {
    label: "Facebook",
    value: "Dodajte službenu Facebook poveznicu",
  },
  {
    label: "Instagram",
    value: "Dodajte službenu Instagram poveznicu",
  },
  {
    label: "YouTube",
    value: "Dodajte službenu YouTube poveznicu",
  },
] as const;

const footerBankDetails = [
  {
    label: "Primatelj",
    value: "PVK Mladost Bjelovar",
  },
  {
    label: "IBAN",
    value: "Dodajte službeni IBAN kluba",
  },
  {
    label: "Banka",
    value: "Dodajte naziv banke",
  },
] as const;

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

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingHomePage />} />
      <Route path="/novosti/:slug" element={<ArticlePage />} />
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
  const clubName = clubSettings?.clubName ?? "PVK Mladost Bjelovar";
  const selectedCategoryPreview =
    categories.find((category) => category.id === selectedCategoryId) ?? null;
  const contactEmail = clubSettings?.contactEmail ?? "info@mladostbjelovar.test";
  const contactPhone = clubSettings?.contactPhone ?? "+385911112222";
  const visibleNewsItems = newsItems.slice(0, visibleNewsCount);
  const canLoadMoreNews = newsItems.length > visibleNewsCount;

  useEffect(() => {
    document.title = clubName;
  }, [clubName]);

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
      <LandingHeader clubName={clubName} logoUrl={clubSettings?.logoUrl ?? null} />

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
            ) : (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                {categories.map((category) => (
                  <CategoryShowcaseCard
                    key={category.id}
                    category={category}
                    onOpen={() => setSelectedCategoryId(category.id)}
                  />
                ))}
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
                </div>
              </div>

              <section className="landing-surface border-2 border-line bg-surface">
                <div className="border-b-2 border-line bg-[linear-gradient(180deg,#f8fbff_0%,#f3f7fb_100%)] px-5 py-5">
                  <p className="landing-kicker text-muted">
                    Obiteljska prijava
                  </p>
                  <h3 className="mt-2 text-3xl">Pošaljite novu prijavu</h3>
                </div>

                {signupFeedback ? (
                  <div
                    className={`border-b-2 border-line px-5 py-4 text-sm font-medium ${
                      signupFeedback.tone === "success"
                        ? "bg-success text-surface"
                        : "bg-signal text-surface"
                    }`}
                  >
                    {signupFeedback.message}
                  </div>
                ) : null}

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
                      className={`landing-pill landing-pill-button ${
                        showSecondParent ? "landing-pill--panel" : "landing-pill--outline"
                      }`}
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
                      {showSecondParent ? "Ukloni roditelja 2" : "Dodaj roditelja 2"}
                    </button>
                    <div className="border-2 border-line bg-panel px-4 py-4 text-sm leading-7 text-ink">
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
                      <InputField
                        label="Datum rođenja"
                        type="date"
                        value={signupForm.childDateOfBirth}
                        onChange={(value) =>
                          setSignupForm((current) => ({ ...current, childDateOfBirth: value }))
                        }
                        required
                      />
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

                  <label className="flex items-start gap-3 border-2 border-line bg-white px-4 py-4">
                    <input
                      className="mt-1 h-4 w-4 accent-accent"
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

      <LandingFooter clubName={clubName} contactEmail={contactEmail} contactPhone={contactPhone} />

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
  logoUrl,
}: {
  clubName: string;
  logoUrl: string | null;
}) {
  const [isLogoBroken, setIsLogoBroken] = useState(false);
  const clubMonogram = createClubMonogram(clubName);

  useEffect(() => {
    setIsLogoBroken(false);
  }, [logoUrl]);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-white/88 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
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
            <span>Plivački vaterpolski klub</span>
          </span>
        </Link>

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
        </nav>
      </div>
    </header>
  );
}

function LandingFooter({
  clubName,
  contactEmail,
  contactPhone,
}: {
  clubName: string;
  contactEmail: string;
  contactPhone: string;
}) {
  const bankDetails = [
    {
      label: "Primatelj",
      value: clubName,
    },
    ...footerBankDetails.slice(1),
  ];

  return (
    <footer className="border-t-2 border-line bg-[linear-gradient(180deg,#f7fbff_0%,#edf4fb_100%)]">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-3 lg:px-8 lg:py-10">
        <section className="landing-footer-column">
          <p className="landing-kicker text-muted">Kontakt</p>
          <div className="landing-footer-list mt-4">
            <div>
              <span>E-pošta</span>
              <strong>{contactEmail}</strong>
            </div>
            <div>
              <span>Telefon</span>
              <strong>{contactPhone}</strong>
            </div>
          </div>
        </section>

        <section className="landing-footer-column">
          <p className="landing-kicker text-muted">Društvene mreže</p>
          <div className="landing-footer-list mt-4">
            {footerSocialLinks.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </section>

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
      </div>
    </footer>
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
          <strong>{formatBirthYear(category.endDateOfBirth)}</strong>
        </div>
      </div>
    </button>
  );
}

function ArticlePage() {
  const { slug } = useParams();
  const clubSettingsQuery = useQuery({
    queryKey: ["public-club-settings"],
    queryFn: fetchClubSettings,
  });
  const newsQuery = useQuery({
    queryKey: ["landing-news"],
    queryFn: fetchNewsFeed,
  });

  const clubSettings = clubSettingsQuery.data;
  const clubName = clubSettings?.clubName ?? "PVK Mladost Bjelovar";
  const contactEmail = clubSettings?.contactEmail ?? "info@mladostbjelovar.test";
  const contactPhone = clubSettings?.contactPhone ?? "+385911112222";
  const article = newsQuery.data?.items.find((item) => item.slug === slug) ?? null;
  const relatedArticles =
    newsQuery.data?.items.filter((item) => item.slug !== slug).slice(0, 2) ?? [];

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [slug]);

  useEffect(() => {
    document.title = article ? `${article.title} | ${clubName}` : `${clubName} | Novost`;
  }, [article, clubName]);

  return (
    <div className="landing-page bg-bg text-ink">
      <LandingHeader clubName={clubName} logoUrl={clubSettings?.logoUrl ?? null} />

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
                      <img src={article.imageUrl} alt={article.title} />
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

      <LandingFooter clubName={clubName} contactEmail={contactEmail} contactPhone={contactPhone} />
    </div>
  );
}

function formatDate(dateIso: string) {
  return new Intl.DateTimeFormat("hr-HR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dateIso));
}

function formatLongDate(dateIso: string) {
  return new Intl.DateTimeFormat("hr-HR", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(dateIso));
}

function formatBirthYear(dateIso: string) {
  return `${new Intl.DateTimeFormat("hr-HR", { year: "numeric" }).format(new Date(dateIso))}. i mlađi`;
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
  return (
    <label className="block">
      <span className="landing-kicker mb-2 block text-muted">
        {label}
      </span>
      <div className="space-y-3">
        <input
          className="block w-full border-2 border-line bg-white px-3 py-3 text-sm"
          type="file"
          accept="image/*"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onChange(event.target.files?.[0] ?? null)
          }
        />
        <div className="border-2 border-line bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
          {file ? file.name : "Nijedna datoteka nije odabrana"}
        </div>
      </div>
    </label>
  );
}
