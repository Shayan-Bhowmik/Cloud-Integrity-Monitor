import type { AlertType, FileItem, Summary, VaultStatus, VersionStatus } from "./types";

export const BAD_STATUSES: readonly VersionStatus[] = ["modified", "missing", "record_tampered"];

export function isBadStatus(status: VersionStatus | undefined | null): boolean {
  return !!status && BAD_STATUSES.includes(status);
}

/**
 * Vault aggregation rule (documented in README):
 *   compromised - the current (latest) version of at least one file is modified, missing or tampered
 *   warning     - every current version is OK, but the backend summary still reports a problem:
 *                 an older version is damaged or alerts are still unacknowledged
 *   healthy     - nothing outstanding
 * `checking` is applied by the dashboard while POST /api/verify is in flight.
 */
export function deriveVaultStatus(files: FileItem[], summary: Summary | null): Exclude<VaultStatus, "checking"> {
  if (files.some((f) => isBadStatus(f.latest_version?.status))) return "compromised";
  if (summary && (summary.status !== "healthy" || summary.open_alerts > 0)) return "warning";
  return "healthy";
}

export const STATUS_LABEL: Record<VersionStatus, string> = {
  ok: "Intact",
  modified: "Modified",
  missing: "Missing",
  record_tampered: "Record tampered",
};

export const STATUS_DESCRIPTION: Record<VersionStatus, string> = {
  ok: "Signature valid and SHA-256 matches the stored object.",
  modified: "Stored bytes no longer match the recorded SHA-256 fingerprint.",
  missing: "The object is gone from cloud storage.",
  record_tampered: "The database row fails its HMAC signature check.",
};

export const VAULT_LABEL: Record<VaultStatus, string> = {
  healthy: "Vault secure",
  checking: "Verifying integrity…",
  warning: "Needs attention",
  compromised: "Integrity compromised",
};

export const ALERT_LABEL: Record<AlertType, string> = {
  modified: "Modified object",
  missing: "Missing object",
  record_tampered: "Record tampering",
  mass_change: "Mass change",
};

export type Severity = "critical" | "high";

export function alertSeverity(type: AlertType): Severity {
  return type === "mass_change" || type === "record_tampered" ? "critical" : "high";
}

/** Hex colors for the 3D scene (same values as the CSS tokens). */
export const STATUS_HEX = {
  ok: "#34d399",
  cyan: "#22d3ee",
  warn: "#fbbf24",
  danger: "#f43f5e",
  violet: "#8b5cf6",
} as const;

export function vaultColor(status: VaultStatus): string {
  switch (status) {
    case "healthy":
      return STATUS_HEX.ok;
    case "checking":
      return STATUS_HEX.cyan;
    case "warning":
      return STATUS_HEX.warn;
    case "compromised":
      return STATUS_HEX.danger;
  }
}

export function versionColor(status: VersionStatus | undefined): string {
  if (!status || status === "ok") return STATUS_HEX.ok;
  if (status === "missing") return STATUS_HEX.warn;
  return STATUS_HEX.danger;
}
