import { useMutation, useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { startTransition, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api } from "../core/api";
import { applyBrowserBranding } from "../core/browser-branding";
import { adminClubSettingsDefaults, resolveSettingValue } from "../core/club-settings-defaults";
import type { AuthResponse, ClubSettings } from "../core/types";
import { useAuth } from "./auth-context";

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLogoBroken, setIsLogoBroken] = useState(false);

  const clubSettingsQuery = useQuery({
    queryKey: ["club-settings", "login-page"],
    queryFn: async () => {
      const response = await api.get<ClubSettings>("/club-settings");
      return response.data;
    },
  });
  const clubSettings = clubSettingsQuery.data;
  const clubName = resolveSettingValue(clubSettings?.clubName, adminClubSettingsDefaults.clubName);
  const clubMonogram = createClubMonogram(clubName);

  useEffect(() => {
    setIsLogoBroken(false);
  }, [clubSettings?.logoUrl]);

  useEffect(() => {
    applyBrowserBranding({
      title: `Prijava | ${clubName}`,
      iconUrl: clubSettings?.logoUrl,
    });
  }, [clubName, clubSettings?.logoUrl]);

  const loginMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<AuthResponse>("/auth/login", { email, password });
      return response.data;
    },
    onSuccess: (session) => {
      login(session);
      const redirectPath =
        typeof location.state?.from === "string" ? location.state.from : "/dashboard";

      startTransition(() => {
        navigate(redirectPath, { replace: true });
      });
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      setErrorMessage(error.response?.data?.message ?? "Prijava nije uspjela. Pokušajte ponovno.");
    },
  });

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="admin-login min-h-screen bg-bg text-ink">
      <div className="mx-auto flex min-h-screen max-w-[1640px] items-center justify-center px-4 py-4 lg:px-5 lg:py-5">
        <section className="w-full max-w-md">
          <div className="admin-surface border-2 border-line bg-surface">
            <div className="flex flex-col items-center gap-3 border-b-2 border-line bg-[linear-gradient(180deg,#f8fbff_0%,#f3f7fb_100%)] px-5 py-6 text-center">
              {clubSettings?.logoUrl && !isLogoBroken ? (
                <img
                  className="h-16 w-16 rounded-[18px] border-2 border-line bg-white object-cover"
                  src={clubSettings.logoUrl}
                  alt={clubName}
                  onError={() => setIsLogoBroken(true)}
                />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-[18px] border-2 border-line bg-accent text-base font-black text-surface">
                  {clubMonogram}
                </div>
              )}
              <h1 className="text-2xl leading-none">{clubName}</h1>
              <p className="ui-kicker text-muted">Prijava</p>
            </div>

            <form
              className="space-y-5 p-5"
              onSubmit={(event) => {
                event.preventDefault();
                setErrorMessage(null);
                loginMutation.mutate();
              }}
            >
              <label className="block">
                <span className="mb-2 block ui-kicker text-muted">
                  E-pošta
                </span>
                <input
                  className="w-full border-2 border-line bg-white px-4 py-3 outline-none placeholder:text-muted focus:bg-surface"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="ime@klub.hr"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block ui-kicker text-muted">
                  Lozinka
                </span>
                <input
                  className="w-full border-2 border-line bg-white px-4 py-3 outline-none placeholder:text-muted focus:bg-surface"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Unesite lozinku"
                  required
                />
              </label>

              {errorMessage ? (
                <div className="border-2 border-line bg-signal px-4 py-3 text-sm font-medium text-surface">
                  {errorMessage}
                </div>
              ) : null}

              <button
                className="w-full border-2 border-line bg-accent px-4 py-3 text-sm font-bold uppercase tracking-[0.14em] text-surface hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-muted"
                type="submit"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Prijava..." : "Prijava"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

function createClubMonogram(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
