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
