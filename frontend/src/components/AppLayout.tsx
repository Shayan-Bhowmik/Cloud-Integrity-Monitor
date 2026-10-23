import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";
import { ServerStatusBanner } from "./ServerStatusBanner";
import { ErrorBoundary } from "./ErrorBoundary";
import { ProtectedRoute } from "./ProtectedRoute";

/** Shell for every signed-in page: navbar, cold-start banner and page content. */
export function AppLayout() {
  return (
    <ProtectedRoute>
      <div className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-cyan px-3 py-2 text-bg-deep focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>
        <Navbar />
        <ServerStatusBanner />
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </ProtectedRoute>
  );
}
