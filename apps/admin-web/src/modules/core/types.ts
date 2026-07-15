export type UserRole = "ADMIN" | "COACH" | "PLAYER" | "PARENT";
export type AccountStatus = "PENDING" | "ACTIVE" | "SUSPENDED";
export type PracticeType = "WATER" | "DRYLAND";

export interface AuthUser {
  userId: string;
  role: UserRole;
  email: string | null;
  username: string | null;
  firstName: string;
  lastName: string;
  mustChangePassword: boolean;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PersonUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  username?: string | null;
  phone?: string | null;
  profileImageUrl?: string | null;
  accountStatus: AccountStatus;
  mustChangePassword?: boolean;
  role?: UserRole;
}

export interface ClubSettings {
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

export interface CategoryOption {
  id: string;
  name: string;
  logoUrl: string | null;
  startDateOfBirth?: string | null;
  endDateOfBirth?: string | null;
}

export interface CoachRecord {
  id: string;
  isConditioningCoach: boolean;
  user: PersonUser;
  categories?: Array<{
    categoryId: string;
    category: CategoryOption;
  }>;
}

export interface ParentSummary {
  id: string;
  user: PersonUser;
}

export interface PlayerSummary {
  id: string;
  dateOfBirth: string;
  oib: string;
  membershipExpiresAt: string | null;
  user: PersonUser;
}

export interface PlayerRecord {
  id: string;
  dateOfBirth: string;
  oib: string;
  gdprConsent: boolean;
  membershipExpiresAt: string | null;
  user: PersonUser;
  categories: Array<{
    categoryId: string;
    category: CategoryOption;
  }>;
  parents: Array<{
    parentId: string;
    isPrimaryContact: boolean;
    parent: ParentSummary;
  }>;
}

export interface ParentRecord {
  id: string;
  user: PersonUser;
  players: Array<{
    playerId: string;
    isPrimaryContact: boolean;
    player: PlayerSummary;
  }>;
}

export interface CredentialResetResult {
  message: string;
  emailSent: boolean;
  developmentCredentials?: {
    login: string;
    password: string;
    recipients: string[];
  };
}

export interface CategoryPlayerAssignment {
  playerId: string;
  player: PlayerRecord;
}

export interface CategoryRecord extends CategoryOption {
  startDateOfBirth: string | null;
  endDateOfBirth: string | null;
  playerCount: number;
  coaches: Array<{
    coachId: string;
    coach: CoachRecord;
  }>;
}

export interface ScheduleCoach {
  coachId: string;
  coach: {
    id: string;
    user: {
      id: string;
      firstName: string;
      lastName: string;
    };
  };
}

export interface ScheduleOccurrenceSummary {
  id: string;
  occurrenceDate: string;
  isCancelled: boolean;
  practiceType: PracticeType;
}

export interface ScheduleItem {
  id: string;
  practiceType: PracticeType;
  startTime: string;
  endTime: string;
  notes: string | null;
  isWeeklyTemplate: boolean;
  dayOfWeek: DayKey | null;
  category: ScheduleCategoryOption;
  coaches: ScheduleCoach[];
  occurrences: ScheduleOccurrenceSummary[];
}

export interface ScheduleAttendanceDetail {
  scheduleId: string;
  occurrenceId?: string | null;
  occurrenceDate: string;
  isCancelled: boolean;
  presentPlayerIds: string[];
}

export interface WeeklyScheduleActivationRecord {
  id: string;
  weekStartDate: string;
  createdAt: string;
  activatedBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

export interface WeeklyScheduleSlot {
  id: string;
  practiceType: PracticeType;
  startTime: string;
  endTime: string;
  notes: string | null;
  isWeeklyTemplate: true;
  isArchived: boolean;
  dayOfWeek: DayKey | null;
  coaches: ScheduleCoach[];
}

export interface WeeklyScheduleRecord {
  id: string;
  name: string;
  description: string | null;
  category: CategoryOption;
  schedules: WeeklyScheduleSlot[];
  activations: WeeklyScheduleActivationRecord[];
}

export interface ScheduleCalendarItem {
  id: string;
  scheduleId: string;
  occurrenceId: string | null;
  occurrenceDate: string;
  practiceType: PracticeType;
  startTime: string;
  endTime: string;
  notes: string | null;
  isCancelled: boolean;
  sourceType: "WEEKLY_TEMPLATE" | "SPECIAL_PRACTICE";
  weeklyScheduleId: string | null;
  weeklyScheduleName: string | null;
  category: ScheduleCategoryOption;
  coaches: ScheduleCoach[];
}

export interface ScheduleCategoryOption {
  id: string | null;
  name: string;
  logoUrl: string | null;
}

export interface SignupRequest {
  id: string;
  status: "PENDING" | "APPROVED" | "DECLINED";
  parentOneFirstName: string;
  parentOneLastName: string;
  parentOneEmail: string;
  parentOnePhone: string;
  parentOneProfileImageUrl: string | null;
  parentTwoFirstName: string | null;
  parentTwoLastName: string | null;
  parentTwoEmail: string | null;
  parentTwoPhone: string | null;
  parentTwoProfileImageUrl: string | null;
  childFirstName: string;
  childLastName: string;
  childDateOfBirth: string;
  childOib: string;
  childProfileImageUrl: string | null;
  gdprConsent: boolean;
  suggestedCategoryId: string | null;
  assignedCategoryId: string | null;
  declineReason: string | null;
  createdAt: string;
  suggestedCategory: CategoryOption | null;
  assignedCategory: CategoryOption | null;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  firstName: string;
  lastName: string;
  categoryNames: string[];
  profileImageUrl: string | null;
  attended: number;
  total: number;
  percentage: number;
}

export interface CategoryLeaderboardResponse {
  categoryId: string;
  categoryName?: string;
  from: string | null;
  to: string;
  total: number;
  totalEntries: number;
  page: number;
  pageSize: number;
  totalPages: number;
  entries: LeaderboardEntry[];
}

export type DayKey =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";
