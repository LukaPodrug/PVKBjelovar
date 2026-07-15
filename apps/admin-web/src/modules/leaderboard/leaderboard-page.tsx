import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "../core/api";
import type { CategoryLeaderboardResponse, CategoryRecord, PaginatedResponse } from "../core/types";
import { PaginationControls } from "../ui/pagination-controls";

type WindowMode = "all" | "week" | "month" | "custom";

const windowPresets: Array<{ mode: WindowMode; label: string }> = [
  { mode: "all", label: "Sve" },
  { mode: "week", label: "Ovaj tjedan" },
  { mode: "month", label: "Ovaj mjesec" },
  { mode: "custom", label: "Prilagođeno" },
];

const rankMedals: Record<number, string> = {
  1: "🏆",
  2: "🥈",
  3: "🥉",
};

const leaderboardPageSize = 25;

export function LeaderboardPage() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [windowMode, setWindowMode] = useState<WindowMode>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [leaderboardPage, setLeaderboardPage] = useState(1);

  const categoriesQuery = useQuery({
    queryKey: ["categories", "leaderboard-options"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CategoryRecord>>("/categories", {
        params: { page: 1, pageSize: 100 },
      });
      return response.data.items;
    },
  });

  const categories = categoriesQuery.data ?? [];
  const activeCategoryId = selectedCategoryId ?? categories[0]?.id ?? null;

  const { from, to } = useMemo(() => resolveWindow(windowMode, customFrom, customTo), [
    windowMode,
    customFrom,
    customTo,
  ]);

  const leaderboardQuery = useQuery({
    queryKey: ["leaderboard", activeCategoryId, from, to, leaderboardPage],
    enabled: Boolean(activeCategoryId),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(leaderboardPage));
      params.set("pageSize", String(leaderboardPageSize));
      if (from) {
        params.set("from", from);
      }
      if (to) {
        params.set("to", to);
      }
      const query = params.toString();
      const response = await api.get<CategoryLeaderboardResponse>(
        `/categories/${activeCategoryId}/leaderboard${query ? `?${query}` : ""}`,
      );
      return response.data;
    },
  });

  const leaderboard = leaderboardQuery.data;

  function handleCategoryChange(categoryId: string) {
    setSelectedCategoryId(categoryId);
    setLeaderboardPage(1);
  }

  function handleWindowModeChange(mode: WindowMode) {
    setWindowMode(mode);
    setLeaderboardPage(1);
  }

  return (
    <section className="space-y-6">
      <section className="border-2 border-line bg-surface">
        <div className="border-b-2 border-line bg-panel px-4 py-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
            Motivacija
          </p>
          <h3 className="mt-2 text-xl font-bold uppercase">Poredak po dolascima</h3>
        </div>

        <div className="grid gap-5 p-4 lg:grid-cols-[260px_1fr] lg:items-start">
          <label className="block">
            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
              Kategorija
            </span>
            <select
              className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
              value={activeCategoryId ?? ""}
              onChange={(event) => handleCategoryChange(event.target.value)}
              disabled={categories.length === 0}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
              Razdoblje
            </span>
            <div className="flex flex-wrap gap-2">
              {windowPresets.map((preset) => (
                <button
                  key={preset.mode}
                  type="button"
                  className={`leaderboard-period-chip ui-pill ui-pill-button ${
                    windowMode === preset.mode ? "ui-pill--accent" : "ui-pill--panel"
                  }`}
                  onClick={() => handleWindowModeChange(preset.mode)}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {windowMode === "custom" ? (
              <div className="leaderboard-custom-range">
                <label className="block">
                  <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    Od
                  </span>
                  <input
                    className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                    type="date"
                    value={customFrom}
                    onChange={(event) => {
                      setCustomFrom(event.target.value);
                      setLeaderboardPage(1);
                    }}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                    Do
                  </span>
                  <input
                    className="w-full border-2 border-line bg-white px-4 py-3 outline-none focus:bg-bg"
                    type="date"
                    value={customTo}
                    onChange={(event) => {
                      setCustomTo(event.target.value);
                      setLeaderboardPage(1);
                    }}
                  />
                </label>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {categoriesQuery.isLoading || leaderboardQuery.isLoading ? (
        <div className="h-[420px] animate-pulse border-2 border-line bg-panel" />
      ) : categoriesQuery.isError || leaderboardQuery.isError ? (
        <div className="border-2 border-line bg-signal px-5 py-4 text-sm font-medium text-surface">
          Poredak trenutno nije moguće učitati.
        </div>
      ) : categories.length === 0 ? (
        <div className="border-2 border-line bg-surface px-5 py-6 text-sm text-muted">
          Nema kategorija za prikaz poretka.
        </div>
      ) : (
        <section className="border-2 border-line bg-surface">
          <div className="border-b-2 border-line bg-panel px-4 py-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                {leaderboard?.categoryName ?? "Kategorija"}
              </p>
              <h3 className="mt-2 text-xl font-bold uppercase">Ljestvica dolazaka</h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead className="bg-panel">
                <tr className="border-b-2 border-line text-left text-[11px] font-bold uppercase tracking-[0.3em] text-muted">
                  <th className="px-4 py-4">Mjesto</th>
                  <th className="px-4 py-4">Igrač</th>
                  <th className="px-4 py-4">Dolasci</th>
                  <th className="px-4 py-4">Postotak</th>
                </tr>
              </thead>
              <tbody>
                {(leaderboard?.entries ?? []).map((entry) => {
                  return (
                    <tr
                      key={entry.playerId}
                      className="border-b-2 border-line bg-white hover:bg-bg"
                    >
                      <td className="px-4 py-4 align-middle text-sm font-bold">
                        <span className="inline-flex items-center gap-2">
                          <span>{rankMedals[entry.rank] ?? ""}</span>
                          <span>{entry.rank}.</span>
                        </span>
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <div className="flex items-center gap-3">
                          {entry.profileImageUrl ? (
                            <img
                              className="h-10 w-10 border-2 border-line object-cover"
                              src={entry.profileImageUrl}
                              alt={`${entry.firstName} ${entry.lastName}`}
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center border-2 border-line bg-accent text-[11px] font-bold text-surface">
                              {`${entry.firstName.slice(0, 1)}${entry.lastName.slice(0, 1)}`.toUpperCase()}
                            </div>
                          )}
                          <span className="text-sm font-bold uppercase">
                            {entry.firstName} {entry.lastName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-middle text-sm font-medium">
                        {entry.attended} / {entry.total}
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <span className="ui-pill ui-pill--panel">{entry.percentage}%</span>
                      </td>
                    </tr>
                  );
                })}

                {(leaderboard?.entries ?? []).length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-muted" colSpan={4}>
                      U ovoj kategoriji još nema igrača za poredak.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {leaderboard ? (
            <PaginationControls
              page={leaderboard.page}
              pageSize={leaderboard.pageSize}
              total={leaderboard.totalEntries}
              totalPages={leaderboard.totalPages}
              onPageChange={setLeaderboardPage}
            />
          ) : null}
        </section>
      )}
    </section>
  );
}

function resolveWindow(
  mode: WindowMode,
  customFrom: string,
  customTo: string,
): { from?: string; to?: string } {
  const now = new Date();

  if (mode === "week") {
    return { from: dateKey(startOfWeek(now)), to: dateKey(endOfWeek(now)) };
  }

  if (mode === "month") {
    return {
      from: dateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: dateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }

  if (mode === "custom") {
    return { from: customFrom || undefined, to: customTo || undefined };
  }

  return {};
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + offset);
  return result;
}

function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
