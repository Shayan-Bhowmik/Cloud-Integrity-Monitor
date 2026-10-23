import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/supabase", () => ({
  getAccessToken: vi.fn(async () => "token-1"),
  refreshAccessToken: vi.fn(async () => "token-2"),
  supabase: null,
  supabaseConfigError: null,
}));

import { api, ApiError, filenameFromDisposition, stopWaitingForServer } from "../lib/api";
import { refreshAccessToken } from "../lib/supabase";
import { sessionExpired, wakeState } from "../lib/events";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("api client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("sends the Supabase access token as a Bearer header", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { total_files: 1, total_versions: 2, last_check_at: null, open_alerts: 0, status: "healthy" }));
    const summary = await api.getSummary();
    expect(summary.total_versions).toBe(2);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/\/api\/summary$/);
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token-1" });
  });

  it("calls /health without a token", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { status: "ok" }));
    await expect(api.health()).resolves.toEqual({ status: "ok" });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("preserves the backend error_code and message", async () => {
    fetchMock.mockResolvedValueOnce(json(403, { error_code: "DEMO_RESTRICTION", message: "Refused: demo files only." }));
    const err = await api.attackDemo("corrupt", "f1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ kind: "forbidden", code: "DEMO_RESTRICTION", message: "Refused: demo files only.", status: 403 });
  });

  it("maps 422 to a validation error", async () => {
    fetchMock.mockResolvedValueOnce(json(422, { error_code: "VALIDATION_ERROR", message: "Input should be 'corrupt'" }));
    await expect(api.attackDemo("corrupt", "f1")).rejects.toMatchObject({ kind: "validation" });
  });

  it("refreshes the token once on 401 and retries", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { error_code: "TOKEN_EXPIRED", message: "Token has expired" }))
      .mockResolvedValueOnce(json(200, { files: [] }));
    await expect(api.listFiles()).resolves.toEqual({ files: [] });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    const retryInit = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(retryInit.headers).toMatchObject({ Authorization: "Bearer token-2" });
  });

  it("signals session expiry when the refreshed token is also rejected", async () => {
    const before = sessionExpired.get();
    fetchMock.mockResolvedValue(json(401, { error_code: "INVALID_TOKEN", message: "Token verification failed" }));
    await expect(api.listAlerts()).rejects.toMatchObject({ kind: "auth" });
    expect(sessionExpired.get()).toBe(before + 1);
  });

  it("never retries non-idempotent requests on network errors", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.verify()).rejects.toMatchObject({ kind: "network" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries GET requests while the server wakes up, with visible state", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json(503, { error_code: "HTTP_ERROR", message: "unavailable" }))
      .mockResolvedValueOnce(json(200, { alerts: [] }));
    const promise = api.listAlerts();
    await vi.advanceTimersByTimeAsync(0);
    expect(wakeState.get().waking).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(promise).resolves.toEqual({ alerts: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(wakeState.get().waking).toBe(false);
  });

  it("lets the user stop waiting for a sleeping server", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const promise = api.listFiles().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(0);
    stopWaitingForServer();
    const err = await promise;
    expect(err).toMatchObject({ kind: "aborted" });
  });

  it("sends restore with an optional version_id body", async () => {
    fetchMock.mockImplementation(async () => json(201, { id: "v3", version_no: 3 }));
    await api.restoreFile("f1");
    await api.restoreFile("f1", "v1");
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toEqual({});
    expect(JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)).toEqual({ version_id: "v1" });
  });

  it("parses download filenames", () => {
    expect(filenameFromDisposition('attachment; filename="report.csv"', "x")).toBe("report.csv");
    expect(filenameFromDisposition(null, "fallback.bin")).toBe("fallback.bin");
  });

  it("rejects uploads over 10 MB before sending", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.dat");
    await expect(api.uploadFile(big)).rejects.toMatchObject({ kind: "too_large", code: "FILE_TOO_LARGE" });
  });
});
