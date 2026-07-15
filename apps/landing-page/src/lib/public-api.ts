export interface PublicClubSettings {
  id: string;
  clubName: string;
  clubSubtitle: string | null;
  logoUrl: string | null;
  contactEmail: string;
  contactPhone: string;
  facebookUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  bankRecipient: string | null;
  bankIban: string | null;
  bankName: string | null;
}

export interface PublicCategory {
  id: string;
  name: string;
  logoUrl: string | null;
  endDateOfBirth: string;
}

export interface PublicCategoryPlayerAssignment {
  playerId: string;
  player: {
    id: string;
    user: {
      id: string;
      firstName: string;
      lastName: string;
    };
  };
}

export interface PublicCategoryDetail extends PublicCategory {
  coaches: Array<{
    coachId: string;
    coach: {
      id: string;
      isConditioningCoach: boolean;
      user: {
        id: string;
        firstName: string;
        lastName: string;
      };
    };
  }>;
  playerCount: number;
  players: PublicCategoryPlayerAssignment[];
  nextPlayersOffset: number | null;
}

export interface PublicScheduleCalendarItem {
  id: string;
  scheduleId: string;
  occurrenceId: string | null;
  occurrenceDate: string;
  practiceType: "WATER" | "DRYLAND";
  startTime: string;
  endTime: string;
  notes: string | null;
  isCancelled: boolean;
  sourceType: "WEEKLY_TEMPLATE" | "SPECIAL_PRACTICE";
  weeklyScheduleId: string | null;
  weeklyScheduleName: string | null;
  category: {
    id: string;
    name: string;
    logoUrl: string | null;
  };
  coaches: Array<{
    coachId: string;
    coach: {
      id: string;
      user: {
        id: string;
        firstName: string;
        lastName: string;
      };
    };
  }>;
}

export interface SignupResult {
  message: string;
  signupRequest: {
    id: string;
    createdAt?: string;
    suggestedCategory?: {
      id: string;
      name: string;
      logoUrl: string | null;
    } | null;
  };
}

const apiBaseUrl =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://127.0.0.1:4000/api" : "/api");

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    throw new Error(payload?.message ?? "Zahtjev nije uspio.");
  }

  return (await response.json()) as T;
}

export function fetchClubSettings() {
  return requestJson<PublicClubSettings>("/club-settings");
}

export function fetchPublicCategories() {
  return requestJson<PublicCategory[]>("/categories/public");
}

export function fetchPublicCategoryDetail(
  categoryId: string,
  options?: {
    playersLimit?: number;
    playersOffset?: number;
  },
) {
  const searchParams = new URLSearchParams();

  if (options?.playersLimit !== undefined) {
    searchParams.set("playersLimit", String(options.playersLimit));
  }

  if (options?.playersOffset !== undefined) {
    searchParams.set("playersOffset", String(options.playersOffset));
  }

  const query = searchParams.size > 0 ? `?${searchParams.toString()}` : "";

  return requestJson<PublicCategoryDetail>(`/categories/public/${categoryId}${query}`);
}

export function fetchPublicSchedules(weekStart?: string) {
  const params = weekStart ? `?weekStart=${encodeURIComponent(weekStart)}` : "";
  return requestJson<PublicScheduleCalendarItem[]>(`/schedules/public${params}`);
}

export function submitSignup(formData: FormData) {
  return requestJson<SignupResult>("/signups", {
    method: "POST",
    body: formData,
  });
}
