import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Query } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../core/api";
import type { ClubSettings } from "../core/types";
import { useAuth } from "../auth/auth-context";
import { navigationItems } from "./navigation";

export function AppShell() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLogoBroken, setIsLogoBroken] = useState(false);
  const [isTabRefreshing, setIsTabRefreshing] = useState(false);
  const previousPathRef = useRef(location.pathname);
  const tabRefreshTimerRef = useRef<number | null>(null);
  const activeTabFetchCount = useIsFetching({
    predicate: shouldRefetchOnRouteChange,
  });

  const closeSidebar = useEffectEvent(() => {
    setIsSidebarOpen(false);
  });

  useEffect(() => {
    if (!isSidebarOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSidebar();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeSidebar, isSidebarOpen]);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  useEffect(() => {
    if (previousPathRef.current === location.pathname) {
      return;
    }

    previousPathRef.current = location.pathname;

    if (tabRefreshTimerRef.current) {
      window.clearTimeout(tabRefreshTimerRef.current);
    }

    setIsTabRefreshing(true);
    void queryClient.invalidateQueries({
      predicate: shouldRefetchOnRouteChange,
      refetchType: "active",
    });
  }, [location.pathname, queryClient]);

  useEffect(() => {
    if (!isTabRefreshing || activeTabFetchCount > 0) {
      return;
    }

    tabRefreshTimerRef.current = window.setTimeout(() => {
      setIsTabRefreshing(false);
      tabRefreshTimerRef.current = null;
    }, 260);

    return () => {
      if (tabRefreshTimerRef.current) {
        window.clearTimeout(tabRefreshTimerRef.current);
        tabRefreshTimerRef.current = null;
      }
    };
  }, [activeTabFetchCount, isTabRefreshing]);

  useEffect(() => {
    return () => {
      if (tabRefreshTimerRef.current) {
        window.clearTimeout(tabRefreshTimerRef.current);
      }
    };
  }, []);

  const clubSettingsQuery = useQuery({
    queryKey: ["club-settings"],
    queryFn: async () => {
      const response = await api.get<ClubSettings>("/club-settings");
      return response.data;
    },
  });

  const visibleNavigation = navigationItems.filter((item) =>
    user ? item.allowedRoles.includes(user.role) : false,
  );
  const clubName = clubSettingsQuery.data?.clubName ?? "Administracija kluba";
  const clubMonogram = createClubMonogram(clubName);

  useEffect(() => {
    setIsLogoBroken(false);
  }, [clubSettingsQuery.data?.logoUrl]);

  useEffect(() => {
    document.title = `Administracija | ${clubName}`;
  }, [clubName]);

  return (
    <div className="admin-shell min-h-screen bg-bg text-ink">
      {isSidebarOpen ? (
        <button
          className="fixed inset-0 z-20 bg-ink/35 lg:hidden"
          type="button"
          aria-label="Zatvori navigaciju"
          onClick={() => setIsSidebarOpen(false)}
        />
      ) : null}

      <div className="mx-auto grid min-h-screen max-w-[1700px] grid-cols-1 gap-5 px-4 py-4 lg:grid-cols-[292px_1fr] lg:px-5 lg:py-5">
        <aside
          className={clsx(
            "fixed left-0 top-0 z-30 flex h-screen w-[304px] flex-col overflow-hidden border-r-2 border-line bg-surface transition-transform lg:sticky lg:top-5 lg:h-[calc(100vh-2.5rem)] lg:w-auto lg:translate-x-0",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <nav className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="space-y-2.5">
              {visibleNavigation.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  className={({ isActive }) =>
                    clsx(
                      "block border-2 border-line px-4 py-3",
                      isActive
                        ? "bg-accent text-surface"
                        : "bg-white/90 text-ink hover:bg-accent-soft",
                    )
                  }
                >
                  <p className="text-base font-semibold tracking-[-0.02em]">{item.label}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.18em] opacity-70">
                    {item.caption}
                  </p>
                </NavLink>
              ))}
            </div>
          </nav>

          <div className="border-t-2 border-line bg-bg px-4 py-4 text-sm">
            <button
              className="block w-full border-2 border-line bg-white/90 px-4 py-3 text-left hover:bg-accent-soft"
              type="button"
              onClick={() => {
                logout();
                navigate("/login", { replace: true });
              }}
            >
              <p className="text-base font-semibold tracking-[-0.02em]">Odjava</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                Zatvori sesiju
              </p>
            </button>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="border-b-2 border-line bg-surface/90 backdrop-blur-md">
            <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
              <div className="flex items-center gap-3">
                <button
                  className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-line bg-white text-lg font-semibold lg:hidden"
                  type="button"
                  aria-label="Otvori izbornik"
                  onClick={() => setIsSidebarOpen(true)}
                >
                  =
                </button>

                <div className="flex items-center gap-3">
                  {clubSettingsQuery.data?.logoUrl && !isLogoBroken ? (
                    <img
                      className="h-12 w-12 border-2 border-line object-cover"
                      src={clubSettingsQuery.data.logoUrl}
                      alt={clubName}
                      onError={() => setIsLogoBroken(true)}
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center border-2 border-line bg-accent text-sm font-semibold text-surface">
                      {clubMonogram}
                    </div>
                  )}

                  <p className="text-lg font-semibold tracking-[-0.03em] sm:text-[1.35rem]">
                    {clubName}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3 rounded-[22px] border-2 border-line bg-bg px-4 py-3">
                  <div className="flex h-11 w-11 items-center justify-center border-2 border-line bg-accent text-sm font-semibold text-surface">
                    {user?.firstName?.slice(0, 1)}
                    {user?.lastName?.slice(0, 1)}
                  </div>
                  <div>
                    <p className="text-base font-semibold tracking-[-0.02em]">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-muted">
                      {user?.email ?? "Bez e-pošte"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <main className="relative px-0 py-6" aria-busy={isTabRefreshing}>
            <div
              className={clsx(
                "transition-opacity duration-150",
                isTabRefreshing ? "opacity-0" : "opacity-100",
              )}
            >
              <Outlet />
            </div>

            {isTabRefreshing ? <TabRefreshSkeleton /> : null}
          </main>
        </div>
      </div>
    </div>
  );
}

function TabRefreshSkeleton() {
  return (
    <div
      className="admin-tab-refresh"
      role="status"
      aria-live="polite"
      aria-label="Osvježavanje podataka"
    >
      <div className="admin-tab-refresh-status">
        <span className="admin-tab-refresh-spinner" aria-hidden="true" />
        <span>Osvježavanje podataka</span>
      </div>

      <div className="admin-tab-refresh-panel">
        <div className="admin-shimmer h-4 w-32 rounded-full" />
        <div className="admin-shimmer mt-5 h-11 w-full max-w-[520px] rounded-2xl" />
        <div className="admin-shimmer mt-3 h-4 w-full max-w-[680px] rounded-full" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="admin-tab-refresh-card" key={index}>
            <div className="admin-shimmer h-3 w-20 rounded-full" />
            <div className="admin-shimmer mt-6 h-9 w-24 rounded-2xl" />
            <div className="admin-shimmer mt-5 h-3 w-full rounded-full" />
            <div className="admin-shimmer mt-3 h-3 w-4/5 rounded-full" />
          </div>
        ))}
      </div>

      <div className="admin-tab-refresh-table">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="admin-tab-refresh-row" key={index}>
            <div className="admin-shimmer h-4 w-24 rounded-full" />
            <div className="admin-shimmer h-4 w-full rounded-full" />
            <div className="admin-shimmer h-4 w-28 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function shouldRefetchOnRouteChange(query: Query) {
  return !(query.queryKey.length === 1 && query.queryKey[0] === "club-settings");
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
