import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertOctagon } from "lucide-react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log the failure shape only; never props or user data.
    console.error("UI error:", error.message, info.componentStack?.split("\n")[1]?.trim());
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <div role="alert" className="grid min-h-[50dvh] place-items-center p-6">
        <div className="panel max-w-md p-6 text-center">
          <AlertOctagon className="mx-auto mb-3 size-8 text-danger" aria-hidden />
          <h2 className="text-lg font-semibold">This view crashed</h2>
          <p className="mt-1 text-sm text-muted">An unexpected error occurred while rendering. Reloading usually fixes it.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-lg border border-line-strong px-4 py-2 text-sm font-medium hover:border-cyan/50"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
