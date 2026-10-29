import { getAccessToken, refreshAccessToken } from "./supabase";
import { sessionExpired, wakeState } from "./events";
import type {
  Alert,
  AlertsListResponse,
  ApiErrorBody,
  AttackResponse,
  AttackType,
  FilesListResponse,
  HealthResponse,
  SeedResponse,
  Summary,
  VerifyResponse,
  Version,
} from "./types";

/**
 * Base URL of the FastAPI backend. Empty means "same origin", which is how the Docker
 * image works: nginx proxies /api and /health to the api container.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type ApiErrorKind =
  | "network"
  | "timeout"
  | "aborted"
  | "auth"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "too_large"
  | "server"
  | "client";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string;

  constructor(kind: ApiErrorKind, message: string, status: number | null = null, code = kind.toUpperCase()) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }

  /** True when retrying the same idempotent request later could succeed. */
  get transient(): boolean {
    return this.kind === "network" || this.kind === "timeout" || (this.status !== null && [502, 503, 504].includes(this.status));
  }
}

export function errorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return "auth";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 413) return "too_large";
  if (status === 400 || status === 422) return "validation";
  if (status >= 500) return "server";
  return "client";
}

const DEFAULT_MESSAGES: Partial<Record<ApiErrorKind, string>> = {
  network: "Cannot reach the Cairn server. Check your connection or try again shortly.",
  timeout: "The server took too long to respond.",
  aborted: "Request cancelled.",
  auth: "Your session has expired. Please sign in again.",
  server: "The server hit an unexpected error.",
};

async function errorFromResponse(res: Response): Promise<ApiError> {
  const kind = kindForStatus(res.status);
  let body: Partial<ApiErrorBody> | null = null;
  try {
    body = (await res.json()) as Partial<ApiErrorBody>;
  } catch {
    body = null;
  }
  const message =
    typeof body?.message === "string" && body.message
      ? body.message
      : DEFAULT_MESSAGES[kind] ?? `Request failed with status ${res.status}.`;
  return new ApiError(kind, message, res.status, typeof body?.error_code === "string" ? body.error_code : kind.toUpperCase());
}

// ---------------------------------------------------------------------------
// Cold-start handling: idempotent requests retry with backoff while the server wakes up.
// The wait is bounded and visible (ServerStatusBanner), and can be stopped by the user.
// ---------------------------------------------------------------------------

const RETRY_DELAYS_MS = [1500, 3000, 5000, 8000, 12000, 15000];
const waitingControllers = new Set<AbortController>();
let activeRetries = 0;

function setWaking(attempt: number) {
  wakeState.set({ waking: activeRetries > 0, attempt, maxAttempts: RETRY_DELAYS_MS.length + 1 });
}

/** Abort every request that is currently waiting for the server to wake up. */
export function stopWaitingForServer() {
  waitingControllers.forEach((c) => c.abort());
  waitingControllers.clear();
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new ApiError("aborted", "Stopped waiting for the server."));
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new ApiError("aborted", "Stopped waiting for the server."));
      },
      { once: true },
    );
  });
}

function linkSignals(timeoutMs: number, outer?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", onOuterAbort, { once: true });
  }
  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    cleanup() {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onOuterAbort);
    },
  };
}

interface RequestOptions {
  method?: "GET" | "POST";
  json?: unknown;
  auth?: boolean;
  /** Only idempotent requests are retried on network errors / cold starts. Defaults to GET only. */
  retry?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function authHeader(forceRefresh: boolean): Promise<Record<string, string>> {
  const token = forceRefresh ? await refreshAccessToken() : await getAccessToken();
  if (!token) {
    if (forceRefresh) sessionExpired.set(sessionExpired.get() + 1);
    throw new ApiError("auth", DEFAULT_MESSAGES.auth!, 401, "NO_SESSION");
  }
  return { Authorization: `Bearer ${token}` };
}

async function rawRequest(path: string, opts: RequestOptions, forceRefresh = false): Promise<Response> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.auth !== false) Object.assign(headers, await authHeader(forceRefresh));
  if (opts.json !== undefined) headers["Content-Type"] = "application/json";

  const linked = linkSignals(opts.timeoutMs ?? 20000, opts.signal);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
      signal: linked.signal,
    });

    // A 401 means the dependency rejected the token before the route ran, so one retry
    // with a refreshed token is safe even for POST requests.
    if (res.status === 401 && opts.auth !== false && !forceRefresh) {
      return rawRequest(path, opts, true);
    }
    if (res.status === 401 && opts.auth !== false) {
      sessionExpired.set(sessionExpired.get() + 1);
    }
    if (!res.ok) throw await errorFromResponse(res);
    return res;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (linked.didTimeOut()) throw new ApiError("timeout", DEFAULT_MESSAGES.timeout!);
    if (opts.signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
      throw new ApiError("aborted", DEFAULT_MESSAGES.aborted!);
    }
    throw new ApiError("network", DEFAULT_MESSAGES.network!);
  } finally {
    linked.cleanup();
  }
}

async function request(path: string, opts: RequestOptions = {}): Promise<Response> {
  const retry = opts.retry ?? (opts.method ?? "GET") === "GET";
  if (!retry) return rawRequest(path, opts);

  const waitController = new AbortController();
  const outer = opts.signal;
  const onOuterAbort = () => waitController.abort();
  outer?.addEventListener("abort", onOuterAbort, { once: true });
  let counted = false;

  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return await rawRequest(path, { ...opts, signal: waitController.signal });
      } catch (err) {
        const delay = RETRY_DELAYS_MS[attempt];
        if (!(err instanceof ApiError) || !err.transient || delay === undefined || waitController.signal.aborted) {
          if (waitController.signal.aborted && !outer?.aborted) {
            throw new ApiError("aborted", "Stopped waiting for the server.");
          }
          throw err;
        }
        if (!counted) {
          counted = true;
          activeRetries++;
          waitingControllers.add(waitController);
        }
        setWaking(attempt + 1);
        await sleep(delay, waitController.signal);
      }
    }
  } finally {
    outer?.removeEventListener("abort", onOuterAbort);
    if (counted) {
      activeRetries--;
      waitingControllers.delete(waitController);
      setWaking(0);
    }
  }
}

async function requestJson<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await request(path, opts);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Uploads use XMLHttpRequest so the UI can show real upload progress.
// ---------------------------------------------------------------------------

export interface UploadOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

function sendUpload(file: File, token: string, opts: UploadOptions): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/api/files`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.responseType = "json";
    xhr.timeout = 120000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.response });
    xhr.onerror = () => reject(new ApiError("network", DEFAULT_MESSAGES.network!));
    xhr.ontimeout = () => reject(new ApiError("timeout", "The upload timed out."));
    xhr.onabort = () => reject(new ApiError("aborted", "Upload cancelled."));
    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    const form = new FormData();
    form.append("file", file, file.name); // field name matches `file: UploadFile = File()`
    xhr.send(form);
  });
}

async function uploadFile(file: File, opts: UploadOptions = {}): Promise<Version> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError("too_large", "File size exceeds maximum limit of 10 MB", 413, "FILE_TOO_LARGE");
  }
  for (const forceRefresh of [false, true]) {
    const token = forceRefresh ? await refreshAccessToken() : await getAccessToken();
    if (!token) {
      if (forceRefresh) sessionExpired.set(sessionExpired.get() + 1);
      throw new ApiError("auth", DEFAULT_MESSAGES.auth!, 401, "NO_SESSION");
    }
    const { status, body } = await sendUpload(file, token, opts);
    if (status === 401 && !forceRefresh) continue;
    if (status >= 200 && status < 300) return body as Version;
    const err = body as Partial<ApiErrorBody> | null;
    const kind = kindForStatus(status);
    if (kind === "auth") sessionExpired.set(sessionExpired.get() + 1);
    throw new ApiError(kind, err?.message ?? DEFAULT_MESSAGES[kind] ?? "Upload failed.", status, err?.error_code ?? kind.toUpperCase());
  }
  throw new ApiError("auth", DEFAULT_MESSAGES.auth!, 401);
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

export function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1] ?? fallback;
}

async function downloadVersion(versionId: string, fallbackName: string): Promise<{ blob: Blob; filename: string }> {
  const res = await request(`/api/versions/${encodeURIComponent(versionId)}/download`, { timeoutMs: 60000 });
  const blob = await res.blob();
  // Content-Disposition is only readable same-origin (Docker/nginx); cross-origin dev falls back to the file name.
  return { blob, filename: filenameFromDisposition(res.headers.get("Content-Disposition"), fallbackName) };
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Typed endpoint wrappers (see backend/app/routes)
// ---------------------------------------------------------------------------

export const api = {
  health: (opts: { signal?: AbortSignal; timeoutMs?: number } = {}) =>
    requestJson<HealthResponse>("/health", { auth: false, retry: false, ...opts }),

  getSummary: (signal?: AbortSignal) => requestJson<Summary>("/api/summary", { signal }),

  listFiles: (signal?: AbortSignal) => requestJson<FilesListResponse>("/api/files", { signal }),

  listVersions: (fileId: string, signal?: AbortSignal) =>
    requestJson<Version[]>(`/api/files/${encodeURIComponent(fileId)}/versions`, { signal }),

  uploadFile,

  downloadVersion,

  restoreFile: (fileId: string, versionId?: string) =>
    requestJson<Version>(`/api/files/${encodeURIComponent(fileId)}/restore`, {
      method: "POST",
      json: versionId ? { version_id: versionId } : {},
      timeoutMs: 60000,
    }),

  verify: () => requestJson<VerifyResponse>("/api/verify", { method: "POST", timeoutMs: 120000 }),

  listAlerts: (signal?: AbortSignal) => requestJson<AlertsListResponse>("/api/alerts", { signal }),

  ackAlert: (alertId: string) =>
    requestJson<Alert>(`/api/alerts/${encodeURIComponent(alertId)}/ack`, { method: "POST" }),

  seedDemo: () => requestJson<SeedResponse>("/api/demo/seed", { method: "POST", timeoutMs: 60000 }),

  attackDemo: (type: AttackType, fileId: string) =>
    requestJson<AttackResponse>("/api/demo/attack", { method: "POST", json: { type, file_id: fileId }, timeoutMs: 60000 }),
};

/** Polls GET /health until it answers or `maxWaitMs` passes. Used by the loading intro. */
export async function waitForHealth(opts: {
  signal: AbortSignal;
  maxWaitMs: number;
  onAttempt?: (attempt: number) => void;
}): Promise<boolean> {
  const started = Date.now();
  for (let attempt = 1; Date.now() - started < opts.maxWaitMs; attempt++) {
    opts.onAttempt?.(attempt);
    try {
      const res = await api.health({ signal: opts.signal, timeoutMs: 8000 });
      if (res.status === "ok") return true;
    } catch (err) {
      if (opts.signal.aborted) return false;
      if (err instanceof ApiError && !err.transient && err.kind !== "server") return false;
    }
    try {
      await sleep(Math.min(1000 * attempt, 4000), opts.signal);
    } catch {
      return false;
    }
  }
  return false;
}
