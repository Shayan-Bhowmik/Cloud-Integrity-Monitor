import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import { FullPageSpinner } from "./ui/States";

/** Renders children only for a signed-in user; otherwise redirects to /auth and remembers the target. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner label="Restoring your session…" />;
  if (!session) {
    return <Navigate to="/auth" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <>{children}</>;
}
