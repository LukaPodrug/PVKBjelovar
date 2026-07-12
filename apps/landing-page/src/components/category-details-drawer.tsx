import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import {
  fetchPublicCategoryDetail,
  type PublicCategory,
  type PublicCategoryPlayerAssignment,
} from "../lib/public-api";

interface CategoryDetailsDrawerProps {
  categoryId: string;
  categoryPreview: PublicCategory | null;
  onClose: () => void;
}

const publicCategoryPlayersPageSize = 24;

export function CategoryDetailsDrawer({
  categoryId,
  categoryPreview,
  onClose,
}: CategoryDetailsDrawerProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const detailQuery = useInfiniteQuery({
    queryKey: ["public-category-detail", categoryId, publicCategoryPlayersPageSize],
    queryFn: ({ pageParam }) =>
      fetchPublicCategoryDetail(categoryId, {
        playersLimit: publicCategoryPlayersPageSize,
        playersOffset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPlayersOffset ?? undefined,
  });

  const firstPage = detailQuery.data?.pages[0] ?? null;
  const players = useMemo(
    () =>
      detailQuery.data?.pages.flatMap((page) => page.players) ??
      ([] as PublicCategoryPlayerAssignment[]),
    [detailQuery.data],
  );
  const category = firstPage;
  const title = category?.name ?? categoryPreview?.name ?? "Detalji kategorije";
  const logoUrl = category?.logoUrl ?? categoryPreview?.logoUrl ?? null;
  const cutoffDate = category?.endDateOfBirth ?? categoryPreview?.endDateOfBirth ?? null;
  const playerCount = category?.playerCount ?? players.length;
  const isLoading = detailQuery.isLoading && firstPage === null;
  const isError = detailQuery.isError;
  const errorMessage =
    detailQuery.error instanceof Error
      ? detailQuery.error.message
      : "Detalje kategorije trenutno nije moguće učitati.";

  useEffect(() => {
    if (!detailQuery.hasNextPage || detailQuery.isFetchingNextPage) {
      return;
    }

    const scrollContainer = scrollContainerRef.current;
    const trigger = loadMoreTriggerRef.current;

    if (!scrollContainer || !trigger) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void detailQuery.fetchNextPage();
        }
      },
      {
        root: scrollContainer,
        rootMargin: "240px 0px 240px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(trigger);

    return () => {
      observer.disconnect();
    };
  }, [
    detailQuery.fetchNextPage,
    detailQuery.hasNextPage,
    detailQuery.isFetchingNextPage,
    players.length,
  ]);

  return (
    <div className="landing-drawer-backdrop" onClick={onClose}>
      <aside
        className="landing-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="landing-category-drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="landing-drawer-header">
          <div className="min-w-0">
            <p className="landing-kicker text-muted">Kategorija</p>
            <h2
              id="landing-category-drawer-title"
              className="mt-3 break-words text-3xl sm:text-4xl"
            >
              {title}
            </h2>
            <p className="landing-copy mt-3 text-sm">
              Pregled trenera i igrača unutar odabrane skupine.
            </p>
          </div>

          <button
            className="landing-drawer-close border-2 border-line bg-surface px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em]"
            type="button"
            onClick={onClose}
          >
            Zatvori
          </button>
        </div>

        {isLoading ? (
          <div className="landing-drawer-body">
            <div className="landing-drawer-loading-grid">
              <div className="landing-panel h-48 animate-pulse border-2 border-line bg-panel" />
              <div className="landing-panel h-48 animate-pulse border-2 border-line bg-panel" />
              <div className="landing-panel h-56 animate-pulse border-2 border-line bg-panel" />
            </div>
          </div>
        ) : isError ? (
          <div ref={scrollContainerRef} className="landing-drawer-body">
            <div className="landing-drawer-empty-state">
              <p>{errorMessage}</p>
              <button
                className="landing-button landing-button-primary landing-button-compact border-2 border-line px-5 py-3 text-sm font-bold uppercase tracking-[0.18em]"
                type="button"
                onClick={() => void detailQuery.refetch()}
              >
                Pokušaj ponovno
              </button>
            </div>
          </div>
        ) : category ? (
          <div ref={scrollContainerRef} className="landing-drawer-body">
            <div className="landing-drawer-content">
              <section className="landing-drawer-hero landing-panel border-2 border-line bg-surface">
                <div className="landing-drawer-logo-shell">
                  {logoUrl ? (
                    <img
                      className="landing-drawer-logo border-2 border-line object-cover"
                      src={logoUrl}
                      alt={title}
                    />
                  ) : (
                    <div className="landing-drawer-logo landing-drawer-logo-fallback border-2 border-line">
                      {createMonogram(title)}
                    </div>
                  )}
                </div>

                <div className="landing-drawer-summary-grid">
                  <div>
                    <span>Godište do</span>
                    <strong>{cutoffDate ? formatDate(cutoffDate) : "Nedostupno"}</strong>
                  </div>
                  <div>
                    <span>Treneri</span>
                    <strong>{category.coaches.length}</strong>
                  </div>
                  <div>
                    <span>Igrači</span>
                    <strong>{playerCount}</strong>
                  </div>
                </div>
              </section>

              <section className="landing-drawer-section landing-panel border-2 border-line bg-surface">
                <div className="landing-drawer-section-heading">
                  <div>
                    <p className="landing-kicker text-muted">Stručni kadar</p>
                    <h3 className="mt-2 text-2xl">Treneri kategorije</h3>
                  </div>
                  <span className="landing-drawer-count">{category.coaches.length}</span>
                </div>

                {category.coaches.length === 0 ? (
                  <div className="landing-drawer-empty-state compact">
                    <p>Ovoj kategoriji još nije dodijeljen trener.</p>
                  </div>
                ) : (
                  <div className="landing-drawer-person-grid">
                    {category.coaches.map((assignment) => {
                      const fullName = `${assignment.coach.user.firstName} ${assignment.coach.user.lastName}`;

                      return (
                        <article
                          key={assignment.coachId}
                          className="landing-drawer-person-card border-2 border-line bg-bg"
                        >
                          <div className="landing-drawer-avatar">{createMonogram(fullName)}</div>
                          <div className="min-w-0">
                            <p className="landing-drawer-person-name">{fullName}</p>
                            <p className="landing-drawer-person-role">
                              {assignment.coach.isConditioningCoach
                                ? "Kondicijski trener"
                                : "Glavni trener"}
                            </p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="landing-drawer-section landing-panel border-2 border-line bg-surface">
                <div className="landing-drawer-section-heading">
                  <div>
                    <p className="landing-kicker text-muted">Članovi</p>
                    <h3 className="mt-2 text-2xl">Popis igrača</h3>
                  </div>
                  <span className="landing-drawer-count">{playerCount}</span>
                </div>

                {playerCount === 0 ? (
                  <div className="landing-drawer-empty-state compact">
                    <p>Ova kategorija još nema dodijeljenih igrača.</p>
                  </div>
                ) : (
                  <>
                    <div className="landing-drawer-player-grid">
                      {players.map((assignment) => {
                        const fullName = `${assignment.player.user.firstName} ${assignment.player.user.lastName}`;

                        return (
                          <article
                            key={assignment.playerId}
                            className="landing-drawer-player-card border-2 border-line bg-bg"
                          >
                            <div className="landing-drawer-avatar subtle">
                              {createMonogram(fullName)}
                            </div>
                            <p className="landing-drawer-person-name">{fullName}</p>
                          </article>
                        );
                      })}
                    </div>

                    {detailQuery.hasNextPage || detailQuery.isFetchingNextPage ? (
                      <div className="landing-drawer-load-state">
                        <p>
                          Prikazano {players.length} od {playerCount} igrača
                        </p>
                        {detailQuery.isFetchingNextPage ? (
                          <span>Učitavanje dodatnih igrača...</span>
                        ) : (
                          <span>Pomaknite niže za učitavanje novih igrača</span>
                        )}
                        <div
                          ref={loadMoreTriggerRef}
                          className="landing-drawer-load-trigger"
                          aria-hidden="true"
                        />
                      </div>
                    ) : players.length > 0 ? (
                      <div className="landing-drawer-load-state compact">
                        <p>Prikazano svih {playerCount} igrača u kategoriji</p>
                      </div>
                    ) : null}
                  </>
                )}
              </section>
            </div>
          </div>
        ) : (
          <div ref={scrollContainerRef} className="landing-drawer-body">
            <div className="landing-drawer-empty-state">
              <p>Detalji kategorije trenutno nisu dostupni.</p>
              <button
                className="landing-button landing-button-primary landing-button-compact border-2 border-line px-5 py-3 text-sm font-bold uppercase tracking-[0.18em]"
                type="button"
                onClick={() => void detailQuery.refetch()}
              >
                Pokušaj ponovno
              </button>
            </div>
          </div>
        )}
      </aside>
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

function createMonogram(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "PV"
  );
}
