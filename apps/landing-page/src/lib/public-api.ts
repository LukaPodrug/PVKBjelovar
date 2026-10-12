export interface PublicClubSettings {
  id: string;
  clubName: string | null;
  clubSubtitle: string | null;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  bankRecipient: string | null;
  bankIban: string | null;
  bankName: string | null;
}

/** REGULAR is a waterpolo squad; PROGRAM is a standalone program such as pool games for schools. */
export type PublicCategoryKind = "REGULAR" | "PROGRAM";

/** MEMBERS programs enrol kids as club players; PUBLIC programs take paid one-off practice signups. */
export type PublicProgramAudience = "MEMBERS" | "PUBLIC";

export interface PublicProgramSession {
  /** Practice day, YYYY-MM-DD. */
  date: string;
  closesAt: string;
  slots: Array<{ id: string; startTime: string; endTime: string }>;
}

export interface PublicCategory {
  id: string;
  name: string;
  kind: PublicCategoryKind;
  audience: PublicProgramAudience;
  pricePerPracticeCents: number | null;
  nextSession: PublicProgramSession | null;
  logoUrl: string | null;
  startDateOfBirth: string | null;
  endDateOfBirth: string | null;
}

export interface PublicCoach {
  id: string;
  isConditioningCoach: boolean;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
  };
  categories: Array<{
    category: {
      id: string;
      name: string;
      logoUrl: string | null;
    };
  }>;
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

export interface PublicSponsor {
  id: string;
  name: string;
  logoUrl: string;
  websiteUrl: string;
  displayOrder: number;
}

export interface PublicBoardMember {
  id: string;
  name: string;
  position: string;
  imageUrl: string;
  displayOrder: number;
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
    id: string | null;
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
      kind?: PublicCategoryKind;
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

export interface ProgramPayment {
  amount: string;
  currency: string;
  recipient: string;
  recipientAddress: string | null;
  recipientCity: string | null;
  iban: string;
  bankName: string | null;
  model: string;
  reference: string;
  description: string;
  hub3Text: string;
  epcQrText: string;
}

export interface ProgramRegistrationResult {
  message: string;
  registration: {
    id: string;
    programName: string;
    sessionDate: string;
    startTime: string;
    endTime: string;
    childFirstName: string;
    childLastName: string;
    priceCents: number;
  };
  payment: ProgramPayment | null;
}

export interface ProgramRegistrationInput {
  categoryId: string;
  slotId: string;
  childFirstName: string;
  childLastName: string;
  childDateOfBirth: string;
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  parentPhone: string;
  gdprConsent: boolean;
}

export function submitProgramRegistration(input: ProgramRegistrationInput) {
  return requestJson<ProgramRegistrationResult>("/program-registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function fetchClubSettings() {
  return requestJson<PublicClubSettings>("/club-settings");
}

export function fetchPublicCategories() {
  return requestJson<PublicCategory[]>("/categories/public");
}

export function fetchPublicCoaches() {
  return requestJson<PublicCoach[]>("/coaches/public");
}

export function fetchPublicBoardMembers() {
  return requestJson<PublicBoardMember[]>("/board-members/public");
}

export function fetchPublicSponsors() {
  return requestJson<PublicSponsor[]>("/sponsors/public");
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
