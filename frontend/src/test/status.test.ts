import { describe, expect, it } from "vitest";
import { deriveVaultStatus } from "../lib/status";
import { formatBytes, shortHash } from "../lib/format";
import type { FileItem, Summary, VersionStatus } from "../lib/types";

const file = (status: VersionStatus | null, id = Math.random().toString()): FileItem => ({
  id,
  name: `${id}.txt`,
  is_demo: false,
  created_at: "2026-10-23T10:00:00Z",
  latest_version: status
    ? {
        id: `v-${id}`,
        file_id: id,
        user_id: "u",
        version_no: 1,
        storage_path: "u/f/v1",
        size: 10,
        sha256: "a".repeat(64),
        signature: "b".repeat(64),
        status,
        last_checked_at: null,
        created_at: "2026-10-23T10:00:00Z",
      }
    : null,
});

const summary = (over: Partial<Summary> = {}): Summary => ({
  total_files: 1,
  total_versions: 1,
  last_check_at: null,
  open_alerts: 0,
  status: "healthy",
  ...over,
});

describe("deriveVaultStatus", () => {
  it("is healthy when every current version is intact and nothing is open", () => {
    expect(deriveVaultStatus([file("ok"), file("ok")], summary())).toBe("healthy");
  });

  it("is compromised when any current version is damaged", () => {
    for (const s of ["modified", "missing", "record_tampered"] as const) {
      expect(deriveVaultStatus([file("ok"), file(s)], summary({ status: "compromised", open_alerts: 1 }))).toBe("compromised");
    }
  });

  it("is a warning after a restore while alerts are still open", () => {
    expect(deriveVaultStatus([file("ok")], summary({ status: "compromised", open_alerts: 2 }))).toBe("warning");
  });

  it("is a warning when only older versions are damaged", () => {
    expect(deriveVaultStatus([file("ok")], summary({ status: "compromised", open_alerts: 0 }))).toBe("warning");
  });

  it("is healthy for an empty vault", () => {
    expect(deriveVaultStatus([], summary({ total_files: 0 }))).toBe("healthy");
  });
});

describe("format helpers", () => {
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
  });

  it("shortens hashes", () => {
    expect(shortHash("0123456789abcdef".repeat(4))).toBe("0123456789…cdef");
  });
});
