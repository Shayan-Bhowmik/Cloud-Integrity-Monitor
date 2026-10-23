import type { ReactNode } from "react";
import { AlertOctagon, RefreshCw } from "lucide-react";
import { Button } from "./Button";
import { errorMessage } from "../../lib/api";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-xl border border-line bg-panel-2/60 text-cyan">{icon}</div>
      <h3 className="text-base font-semibold text-text">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "Couldn't load this" }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-xl border border-danger/30 bg-danger/10 text-danger">
        <AlertOctagon className="size-6" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-text">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry} icon={<RefreshCw className="size-4" aria-hidden />}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-text sm:text-[1.7rem]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function FullPageSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="grid min-h-[60dvh] place-items-center" role="status">
      <div className="flex flex-col items-center gap-3 text-muted">
        <span className="size-8 animate-spin rounded-full border-2 border-line-strong border-t-cyan" aria-hidden />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
