export interface AuthenticatedUser {
  userId: string;
  role: "ADMIN" | "COACH" | "PLAYER" | "PARENT";
  email: string | null;
  username: string | null;
  firstName: string;
  lastName: string;
  mustChangePassword: boolean;
}

export interface AuthResponse {
  token: string;
  user: AuthenticatedUser;
}
