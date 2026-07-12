import { useMutation } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { startTransition, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api } from "../core/api";
import type { AuthResponse } from "../core/types";
import { useAuth } from "./auth-context";

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      <div className="mx-auto grid min-h-screen max-w-[1640px] grid-cols-1 gap-5 px-4 py-4 lg:grid-cols-[1.08fr_0.92fr] lg:px-5 lg:py-5">
        <section className="relative overflow-hidden border-b-2 border-line bg-[linear-gradient(160deg,#102347_0%,#1d4f91_52%,#2f74b7_100%)] px-6 py-8 text-surface lg:border-b-0 lg:border-r-2 lg:px-10 lg:py-10">
          <div className="absolute -right-16 top-10 h-56 w-56 rounded-full bg-white/8 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-44 w-44 rounded-full bg-cyan-200/10 blur-3xl" />
          <div className="relative flex h-full flex-col justify-between gap-10">
            <div className="space-y-6">
              <div className="inline-block rounded-full border border-white/25 bg-white/10 px-3 py-1 ui-kicker text-white/85">
                Administracija kluba
              </div>
              <div className="max-w-2xl space-y-4">
                <h1 className="text-4xl leading-[0.96] sm:text-5xl lg:text-6xl">
                  Profesionalna administracija za rasporede, igrače, obitelji i stručni stožer.
                </h1>
                <p className="max-w-xl text-sm leading-7 text-white/82 sm:text-base">
                  Prijavite se za upravljanje rasporedima treninga, prijavama, evidencijom članova i postavkama kluba iz jednog modernog sučelja prilagođenog ulozi korisnika.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                ["Pristup po ulogama", "Administratori i treneri vide samo alate koji su im stvarno potrebni."],
                ["Identitet kluba", "Naziv kluba, logo i kontakt podaci dolaze iz zajedničkih postavki."],
                ["Raspored na prvom mjestu", "Početni pregled odmah prikazuje tjedni raspored treninga."],
              ].map(([title, body]) => (
                <div
                  key={title}
                  className="rounded-[20px] border border-white/18 bg-white/10 p-4 backdrop-blur-sm"
                >
                  <p className="text-base font-semibold tracking-[-0.02em]">{title}</p>
                  <p className="mt-3 text-sm leading-7 text-white/74">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-8 lg:px-10">
          <div className="admin-surface w-full max-w-xl border-2 border-line bg-surface">
            <div className="border-b-2 border-line bg-[linear-gradient(180deg,#f8fbff_0%,#f3f7fb_100%)] px-5 py-5">
              <p className="ui-kicker text-muted">
                Sigurna prijava
              </p>
              <h2 className="mt-2 text-3xl leading-none">Pristup za osoblje</h2>
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
                  placeholder="trener@klub.test"
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
