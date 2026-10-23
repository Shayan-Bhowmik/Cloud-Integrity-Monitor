import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./app/AuthProvider";
import { ToastProvider } from "./components/ui/Toast";
import { AppLayout } from "./components/AppLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FullPageSpinner } from "./components/ui/States";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Signed-in pages are split out so the landing page stays light.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Files = lazy(() => import("./pages/Files"));
const FileDetail = lazy(() => import("./pages/FileDetail"));
const Activity = lazy(() => import("./pages/Activity"));

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Suspense fallback={<FullPageSpinner />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/auth" element={<Auth />} />
                <Route element={<AppLayout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/files" element={<Files />} />
                  <Route path="/files/:id" element={<FileDetail />} />
                  <Route path="/activity" element={<Activity />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
