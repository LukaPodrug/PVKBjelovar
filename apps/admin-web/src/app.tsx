import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./modules/layout/app-shell";
import { RequireAuth } from "./modules/auth/require-auth";
import { RequireRole } from "./modules/auth/require-role";
import { DashboardPage } from "./modules/dashboard/dashboard-page";
import { LoginPage } from "./modules/auth/login-page";
import { ApprovalsPage } from "./modules/approvals/approvals-page";
import { CategoriesPage } from "./modules/categories/categories-page";
import { CoachesPage } from "./modules/coaches/coaches-page";
import { LeaderboardPage } from "./modules/leaderboard/leaderboard-page";
import { ParentsPage } from "./modules/parents/parents-page";
import { PlayersPage } from "./modules/players/players-page";
import { SchedulesPage } from "./modules/schedules/schedules-page";
import { SettingsPage } from "./modules/settings/settings-page";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route
            path="/approvals"
            element={
              <RequireRole allowedRoles={["ADMIN"]}>
                <ApprovalsPage />
              </RequireRole>
            }
          />
          <Route
            path="/categories"
            element={<CategoriesPage />}
          />
          <Route
            path="/coaches"
            element={<CoachesPage />}
          />
          <Route
            path="/players"
            element={<PlayersPage />}
          />
          <Route
            path="/parents"
            element={
              <RequireRole allowedRoles={["ADMIN"]}>
                <ParentsPage />
              </RequireRole>
            }
          />
          <Route
            path="/schedules"
            element={<SchedulesPage />}
          />
          <Route
            path="/leaderboard"
            element={<LeaderboardPage />}
          />
          <Route
            path="/settings"
            element={
              <RequireRole allowedRoles={["ADMIN"]}>
                <SettingsPage />
              </RequireRole>
            }
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
