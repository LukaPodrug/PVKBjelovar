import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import { readStoredSession, writeStoredSession } from "../core/auth-storage";
import type { AuthResponse, AuthUser } from "../core/types";

interface AuthContextValue {
  isAuthenticated: boolean;
  token: string | null;
  user: AuthUser | null;
  login: (session: AuthResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthResponse | null>(() => readStoredSession());

  useEffect(() => {
    const onAuthExpired = () => {
      setSession(null);
      writeStoredSession(null);
    };

    window.addEventListener("auth:expired", onAuthExpired);

    return () => {
      window.removeEventListener("auth:expired", onAuthExpired);
    };
  }, []);

  const value: AuthContextValue = {
    isAuthenticated: Boolean(session?.token),
    token: session?.token ?? null,
    user: session?.user ?? null,
    login: (nextSession) => {
      writeStoredSession(nextSession);
      setSession(nextSession);
    },
    logout: () => {
      writeStoredSession(null);
      setSession(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
