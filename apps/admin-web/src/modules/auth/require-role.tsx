import { Navigate } from "react-router-dom";
import type { PropsWithChildren } from "react";
import type { UserRole } from "../core/types";
import { useAuth } from "./auth-context";

interface RequireRoleProps extends PropsWithChildren {
  allowedRoles: UserRole[];
}

export function RequireRole({ allowedRoles, children }: RequireRoleProps) {
  const { user } = useAuth();

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
