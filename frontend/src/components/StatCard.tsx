import type { ReactNode } from "react";
import { Skeleton } from "./ui/States";

type Tone = "default" | "ok" | "warn" | "danger";

const TONES: Record<Tone, string> = {
  default: "text-cyan bg-cyan/10 border-cyan/20",
  ok: "text-ok bg-ok/10 border-ok/20",
  warn: "text-warn bg-warn/10 border-warn/25",
  danger: "text-danger bg-danger/10 border-danger/25",
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  loading = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: ReactNode;
  tone?: Tone;
  loading?: boolean;
}) {
  return (
    <div className="panel flex min-w-0 flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted">{label}</span>
        <span className={`grid size-8 shrink-0 place-items-center rounded-lg border ${TONES[tone]}`}>{icon}</span>
      </div>
      {loading ? (
        <>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3.5 w-28" />
        </>
      ) : (
        <>
          <div className="break-words font-display text-2xl leading-tight font-semibold text-text sm:text-[1.7rem]">{value}</div>
          {hint && <div className="truncate text-xs text-muted">{hint}</div>}
        </>
      )}
    </div>
  );
}
