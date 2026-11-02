import axios from "axios";
import { readStoredSession, writeStoredSession } from "./auth-storage";

const apiBaseUrl =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:4000/api" : "/api");

export const api = axios.create({
  baseURL: apiBaseUrl,
});

api.interceptors.request.use((config) => {
  const session = readStoredSession();

  if (session?.token) {
    config.headers.Authorization = `Bearer ${session.token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      writeStoredSession(null);
      window.dispatchEvent(new Event("auth:expired"));
    }

    return Promise.reject(error);
  },
);

interface ExistingAccountConflict {
  message?: string;
  details?: {
    code?: string;
    existingUser?: { firstName: string; lastName: string; roles: string[] };
  };
}

/**
 * Creates a person (player, parent, coach) from a multipart form. When the e-mail already belongs
 * to someone in another role (e.g. a coach who also plays for the veterans), asks the admin whether
 * to add the new profile to that same account and retries with their confirmation.
 */
export async function postPersonForm<T>(url: string, formData: FormData) {
  const headers = { "Content-Type": "multipart/form-data" };

  try {
    return await api.post<T>(url, formData, { headers });
  } catch (error) {
    if (!axios.isAxiosError<ExistingAccountConflict>(error)) {
      throw error;
    }

    const conflict = error.response?.data;
    const existingUser = conflict?.details?.existingUser;

    if (
      error.response?.status !== 409 ||
      conflict?.details?.code !== "EMAIL_BELONGS_TO_EXISTING_USER" ||
      !existingUser
    ) {
      throw error;
    }

    const confirmed = window.confirm(
      `${conflict.message}\n\nDodati novu ulogu na isti račun? ${existingUser.firstName} ${existingUser.lastName} zadržava postojeću prijavu i lozinku, a uneseno ime, telefon i fotografija se ne mijenjaju.`,
    );

    if (!confirmed) {
      throw new Error("Spremanje je otkazano. E-adresa već pripada drugom korisniku.");
    }

    formData.set("attachToExistingUser", "true");

    return api.post<T>(url, formData, { headers });
  }
}
