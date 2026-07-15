import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchPublicCategoryDetail, type PublicCategory } from "../lib/public-api";

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
  const [playersPage, setPlayersPage] = useState(1);
  const detailQuery = useQuery({
    queryKey: ["public-category-detail", categoryId, playersPage, publicCategoryPlayersPageSize],
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchPublicCategoryDetail(categoryId, {
        playersLimit: publicCategoryPlayersPageSize,
        playersOffset: (playersPage - 1) * publicCategoryPlayersPageSize,
      }),
  });

  const category = detailQuery.data?.id === categoryId ? detailQuery.data : null;
  const players = category?.players ?? [];
  const title = category?.name ?? categoryPreview?.name ?? "Detalji kategorije";
  const logoUrl = category?.logoUrl ?? categoryPreview?.logoUrl ?? null;
  const startDateOfBirth =
    category?.startDateOfBirth ?? categoryPreview?.startDateOfBirth ?? null;
  const cutoffDate = category?.endDateOfBirth ?? categoryPreview?.endDateOfBirth ?? null;
  const playerCount = category?.playerCount ?? players.length;
  const playersTotalPages = Math.max(1, Math.ceil(playerCount / publicCategoryPlayersPageSize));
  const firstVisiblePlayerIndex =
    playerCount === 0 ? 0 : (playersPage - 1) * publicCategoryPlayersPageSize + 1;
  const lastVisiblePlayerIndex = Math.min(
    playerCount,
    (playersPage - 1) * publicCategoryPlayersPageSize + players.length,
  );
  const isLoading = detailQuery.isFetching && category === null;
  const isPlayersLoading = detailQuery.isFetching && category !== null;
  const isError = detailQuery.isError && !isLoading;
  const errorMessage =
    detailQuery.error instanceof Error
      ? detailQuery.error.message
      : "Detalje kategorije trenutno nije moguće učitati.";

  useEffect(() => {
    setPlayersPage(1);
  }, [categoryId]);

  useEffect(() => {
    if (playersPage > playersTotalPages) {
      setPlayersPage(playersTotalPages);
    }
  }, [playersPage, playersTotalPages]);

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
            className="landing-pill landing-pill-button landing-pill--outline"
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
          <div className="landing-drawer-body">
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
          <div className="landing-drawer-body">
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
                    <span>Dobna granica</span>
                    <strong>{formatCategoryAgeRule(startDateOfBirth, cutoffDate)}</strong>
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
                ) : isPlayersLoading ? (
                  <>
                    <PlayerListLoadingSkeleton />

                    <div className="landing-drawer-pagination">
                      <div className="landing-drawer-load-state">
                        <p>
                          Stranica {playersPage} od {playersTotalPages}
                        </p>
                        <span>Učitavanje igrača...</span>
                      </div>

                      <div className="landing-drawer-pagination-actions">
                        <button
                          className="landing-pill landing-pill-button landing-pill--outline"
                          type="button"
                          disabled
                        >
                          Prethodna
                        </button>
                        <button
                          className="landing-pill landing-pill-button landing-pill--accent"
                          type="button"
                          disabled
                        >
                          Sljedeća
                        </button>
                      </div>
                    </div>
                  </>
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

                    <div className="landing-drawer-pagination">
                      <div className="landing-drawer-load-state">
                        <p>
                          Stranica {playersPage} od {playersTotalPages}
                        </p>
                        <span>
                          Prikazano {firstVisiblePlayerIndex}-{lastVisiblePlayerIndex} od{" "}
                          {playerCount} igrača
                        </span>
                      </div>

                      <div className="landing-drawer-pagination-actions">
                        <button
                          className="landing-pill landing-pill-button landing-pill--outline"
                          type="button"
                          disabled={playersPage <= 1 || detailQuery.isFetching}
                          onClick={() => setPlayersPage((current) => Math.max(1, current - 1))}
                        >
                          Prethodna
                        </button>
                        <button
                          className="landing-pill landing-pill-button landing-pill--accent"
                          type="button"
                          disabled={playersPage >= playersTotalPages || detailQuery.isFetching}
                          onClick={() =>
                            setPlayersPage((current) =>
                              Math.min(playersTotalPages, current + 1),
                            )
                          }
                        >
                          Sljedeća
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </section>
            </div>
          </div>
        ) : (
          <div className="landing-drawer-body">
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

function PlayerListLoadingSkeleton() {
  return (
    <div className="landing-drawer-player-grid" aria-label="Učitavanje igrača">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="landing-drawer-player-card border-2 border-line bg-bg"
        >
          <div className="landing-drawer-avatar subtle animate-pulse bg-panel" />
          <div className="h-5 flex-1 animate-pulse rounded-full bg-panel" />
        </div>
      ))}
    </div>
  );
}

function formatDate(dateIso: string) {
  const date = new Date(dateIso);
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const year = date.getFullYear();

  return `${day}.${month}.${year}.`;
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

function formatCategoryAgeRule(startDateOfBirth: string | null, cutoffDate: string | null) {
  if (startDateOfBirth) {
    return `Od ${formatDate(startDateOfBirth)}`;
  }

  if (cutoffDate) {
    return formatDate(cutoffDate);
  }

  return "Bez ograničenja";
}
