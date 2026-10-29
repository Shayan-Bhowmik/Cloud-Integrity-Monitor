// Mirrors backend/app/schemas.py and the inline responses in backend/app/routes/*.py.

export type VersionStatus = "ok" | "modified" | "missing" | "record_tampered";
export type AlertType = "modified" | "missing" | "record_tampered" | "mass_change";
export type AttackType = "corrupt" | "delete" | "encrypt" | "tamper_record";

/** Overall status reported by GET /api/summary (the backend currently returns healthy or compromised). */
export type SummaryStatus = "healthy" | "warning" | "compromised";

/** Visual state of the vault. `checking` only exists client-side while POST /api/verify runs. */
export type VaultStatus = "healthy" | "checking" | "warning" | "compromised";

export interface Version {
  id: string;
  file_id: string;
  user_id: string;
  version_no: number;
  storage_path: string;
  size: number;
  sha256: string;
  signature: string;
  status: VersionStatus;
  last_checked_at: string | null;
  created_at: string;
}

export interface FileItem {
  id: string;
  name: string;
  is_demo: boolean;
  created_at: string;
  latest_version: Version | null;
}

export interface FilesListResponse {
  files: FileItem[];
}

export interface Alert {
  id: string;
  user_id: string;
  type: AlertType;
  message: string;
  version_id: string | null;
  acknowledged: boolean;
  created_at: string;
}

export interface AlertsListResponse {
  alerts: Alert[];
}

export interface VerifyItemResult {
  version_id: string;
  file_id: string;
  version_no: number;
  old_status: VersionStatus;
  new_status: VersionStatus;
  alert_created: boolean;
}

export interface VerifyResponse {
  total_checked: number;
  ok_count: number;
  modified_count: number;
  missing_count: number;
  tampered_count: number;
  mass_change_alert_created: boolean;
  results: VerifyItemResult[];
}

export interface Summary {
  total_files: number;
  total_versions: number;
  last_check_at: string | null;
  open_alerts: number;
  status: SummaryStatus;
}

export interface HealthResponse {
  status: string;
}

export interface SeedResponse {
  message: string;
  files: { id: string; name: string; version_id: string }[];
}

export interface AttackResponse {
  status: string;
  attack_type: AttackType;
  targeted_file: { id: string; name: string; version_id: string };
  action: string;
  next_step: string;
}

/** Error body shape used by every backend error response. */
export interface ApiErrorBody {
  error_code: string;
  message: string;
}
