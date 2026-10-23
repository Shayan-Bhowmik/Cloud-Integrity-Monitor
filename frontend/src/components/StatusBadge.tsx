import { CheckCircle2, FileX2, ShieldAlert, ShieldCheck, ShieldX, Loader2, AlertTriangle, FileWarning } from "lucide-react";
import type { VaultStatus, VersionStatus } from "../lib/types";
import { STATUS_DESCRIPTION, STATUS_LABEL, VAULT_LABEL } from "../lib/status";

const VERSION_STYLES: Record<VersionStatus, { className: string; icon: typeof CheckCircle2 }> = {
  ok: { className: "border-ok/30 bg-ok/10 text-ok", icon: CheckCircle2 },
  modified: { className: "border-danger/35 bg-danger/10 text-danger", icon: FileWarning },
  missing: { className: "border-warn/35 bg-warn/10 text-warn", icon: FileX2 },
  record_tampered: { className: "border-danger/35 bg-danger/10 text-danger", icon: ShieldX },
};

/** Status always shows a text label as well as color (Frontend Specification §1). */
export function StatusBadge({ status, size = "md" }: { status: VersionStatus; size?: "sm" | "md" }) {
  const { className, icon: Icon } = VERSION_STYLES[status];
  return (
    <span
      title={STATUS_DESCRIPTION[status]}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium ${className} ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

const VAULT_STYLES: Record<VaultStatus, { className: string; icon: typeof CheckCircle2 }> = {
  healthy: { className: "border-ok/30 bg-ok/10 text-ok", icon: ShieldCheck },
  checking: { className: "border-cyan/30 bg-cyan/10 text-cyan", icon: Loader2 },
  warning: { className: "border-warn/35 bg-warn/10 text-warn", icon: AlertTriangle },
  compromised: { className: "border-danger/35 bg-danger/10 text-danger", icon: ShieldAlert },
};

export function VaultStatusBadge({ status }: { status: VaultStatus }) {
  const { className, icon: Icon } = VAULT_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>
      <Icon className={`size-3.5 ${status === "checking" ? "animate-spin" : ""}`} aria-hidden />
      {VAULT_LABEL[status]}
    </span>
  );
}

export function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded-md border border-violet/40 bg-violet/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet">
      Demo
    </span>
  );
}
