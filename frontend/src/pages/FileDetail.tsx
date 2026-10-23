import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Copy, Download, FileQuestion, History, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { api, errorMessage, saveBlob } from "../lib/api";
import { notifyDataChanged } from "../lib/events";
import { formatBytes, formatDateTime, formatRelative, shortHash } from "../lib/format";
import { isBadStatus, STATUS_DESCRIPTION } from "../lib/status";
import type { FileItem, Version } from "../lib/types";
import { useResource } from "../hooks/useResource";
import { DemoBadge, StatusBadge } from "../components/StatusBadge";
import { Button, ButtonLink } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState, ErrorState, Skeleton } from "../components/ui/States";
import { useToast } from "../components/ui/Toast";

/** Restore target: a specific version, or `null` for the backend default (newest clean version). */
type RestoreTarget = { version: Version | null } | null;

function CopyHash({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the full value is still in the title tooltip */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={value}
      className="group inline-flex items-center gap-1.5 rounded font-mono text-xs text-muted hover:text-text"
      aria-label={`Copy ${label}`}
    >
      {shortHash(value)}
      {copied ? <Check className="size-3.5 text-ok" aria-hidden /> : <Copy className="size-3.5 opacity-50 group-hover:opacity-100" aria-hidden />}
    </button>
  );
}

export default function FileDetail() {
  const { id = "" } = useParams();
  const toast = useToast();
  const res = useResource(
    async (signal) => {
      const [files, versions] = await Promise.all([api.listFiles(signal), api.listVersions(id, signal)]);
      return { file: files.files.find((f) => f.id === id) ?? null, versions };
    },
    [id],
  );
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget>(null);
  const [restoring, setRestoring] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const restoringRef = useRef(false);

  const notFound = res.error && "kind" in res.error && (res.error as { kind: string }).kind === "not_found";

  if (res.initialLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-9 w-72" />
        <div className="panel space-y-3 p-5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (notFound || (res.data && !res.data.file)) {
    return (
      <div className="panel">
        <EmptyState
          icon={<FileQuestion className="size-5" aria-hidden />}
          title="File not found"
          description="It may belong to another account or the link is wrong."
          action={<ButtonLink to="/files">Back to files</ButtonLink>}
        />
      </div>
    );
  }

  if (res.error && !res.data) {
    return (
      <div className="panel">
        <ErrorState error={res.error} onRetry={res.reload} title="Couldn't load this file" />
      </div>
    );
  }

  const file = res.data!.file as FileItem;
  const versions = res.data!.versions;
  const latest = versions[0] ?? null;
  const hasCleanVersion = versions.some((v) => v.status === "ok");

  const download = async (v: Version) => {
    setDownloading(v.id);
    try {
      const { blob, filename } = await api.downloadVersion(v.id, file.name);
      saveBlob(blob, filename);
      toast.success(`Downloaded ${file.name} v${v.version_no}`, "SHA-256 was verified by the server before sending.");
    } catch (err) {
      toast.error(`Couldn't download v${v.version_no}`, errorMessage(err));
    } finally {
      setDownloading(null);
    }
  };

  const restore = async () => {
    if (!restoreTarget || restoringRef.current) return;
    restoringRef.current = true;
    setRestoring(true);
    try {
      const created = await api.restoreFile(file.id, restoreTarget.version?.id);
      toast.success(
        `Restored as version ${created.version_no}`,
        restoreTarget.version
          ? `Copied from v${restoreTarget.version.version_no}; new SHA-256 ${created.sha256.slice(0, 12)}… and a fresh signature.`
          : `Copied from the newest clean version; SHA-256 ${created.sha256.slice(0, 12)}….`,
      );
      setRestoreTarget(null);
      notifyDataChanged();
    } catch (err) {
      toast.error("Restore failed", errorMessage(err));
      setRestoreTarget(null);
      notifyDataChanged();
    } finally {
      restoringRef.current = false;
      setRestoring(false);
    }
  };

  const nextVersionNo = (latest?.version_no ?? 0) + 1;

  return (
    <>
      <Link to="/files" className="inline-flex items-center gap-1.5 rounded text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> Files
      </Link>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-all text-2xl font-semibold sm:text-[1.7rem]">{file.name}</h1>
            {file.is_demo && <DemoBadge />}
          </div>
          <p className="mt-1 text-sm text-muted">
            Added {formatDateTime(file.created_at)} · {versions.length} version{versions.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button
          variant={latest && isBadStatus(latest.status) ? "primary" : "secondary"}
          onClick={() => setRestoreTarget({ version: null })}
          disabled={!hasCleanVersion}
          title={hasCleanVersion ? undefined : "No version is currently marked clean"}
          icon={<RotateCcw className="size-4" aria-hidden />}
        >
          Restore last clean version
        </Button>
      </div>

      {latest && (
        <div
          className={`mt-5 flex gap-3 rounded-xl border p-4 text-sm ${
            isBadStatus(latest.status) ? "border-danger/35 bg-danger/10" : "border-ok/25 bg-ok/5"
          }`}
        >
          {isBadStatus(latest.status) ? (
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          ) : (
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-medium text-text">
              Current version v{latest.version_no} <StatusBadge status={latest.status} size="sm" />
            </p>
            <p className="mt-1 text-muted">
              {STATUS_DESCRIPTION[latest.status]}{" "}
              {latest.last_checked_at ? `Last checked ${formatRelative(latest.last_checked_at).toLowerCase()}.` : "Not checked yet — run a check from the dashboard."}
            </p>
          </div>
        </div>
      )}

      <section className="panel mt-5" aria-labelledby="history-title">
        <div className="flex items-center gap-2 border-b border-line/60 px-4 py-3 sm:px-5">
          <History className="size-4 text-muted" aria-hidden />
          <h2 id="history-title" className="text-sm font-medium text-muted">
            Version history
          </h2>
        </div>

        {versions.length === 0 ? (
          <EmptyState icon={<History className="size-5" aria-hidden />} title="No versions" description="This file has no stored versions." />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr className="border-b border-line/60">
                    <th scope="col" className="px-5 py-3 font-medium">Version</th>
                    <th scope="col" className="px-3 py-3 font-medium">Status</th>
                    <th scope="col" className="px-3 py-3 font-medium">SHA-256</th>
                    <th scope="col" className="hidden px-3 py-3 font-medium xl:table-cell">Signature</th>
                    <th scope="col" className="px-3 py-3 font-medium">Size</th>
                    <th scope="col" className="px-3 py-3 font-medium">Created</th>
                    <th scope="col" className="px-3 py-3 font-medium">Checked</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/50">
                  {versions.map((v) => (
                    <tr key={v.id} className={v.id === latest?.id ? "bg-cyan/[0.03]" : undefined}>
                      <td className="px-5 py-3 font-mono text-sm text-text">
                        v{v.version_no}
                        {v.id === latest?.id && <span className="ml-2 font-sans text-[11px] text-cyan">current</span>}
                      </td>
                      <td className="px-3 py-3"><StatusBadge status={v.status} size="sm" /></td>
                      <td className="px-3 py-3"><CopyHash value={v.sha256} label={`SHA-256 of version ${v.version_no}`} /></td>
                      <td className="hidden px-3 py-3 xl:table-cell"><CopyHash value={v.signature} label={`signature of version ${v.version_no}`} /></td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{formatBytes(v.size)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{formatDateTime(v.created_at)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{formatRelative(v.last_checked_at)}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" loading={downloading === v.id} disabled={!!downloading} onClick={() => download(v)} icon={<Download className="size-3.5" aria-hidden />}>
                            Download
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setRestoreTarget({ version: v })} icon={<RotateCcw className="size-3.5" aria-hidden />}>
                            Restore
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-line/50 lg:hidden">
              {versions.map((v) => (
                <li key={v.id} className="space-y-2.5 px-4 py-4 sm:px-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm text-text">
                      v{v.version_no}
                      {v.id === latest?.id && <span className="ml-2 font-sans text-[11px] text-cyan">current</span>}
                    </span>
                    <StatusBadge status={v.status} size="sm" />
                  </div>
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-subtle">SHA-256</dt>
                    <dd className="min-w-0"><CopyHash value={v.sha256} label={`SHA-256 of version ${v.version_no}`} /></dd>
                    <dt className="text-subtle">Signature</dt>
                    <dd className="min-w-0"><CopyHash value={v.signature} label={`signature of version ${v.version_no}`} /></dd>
                    <dt className="text-subtle">Size</dt>
                    <dd className="text-muted">{formatBytes(v.size)}</dd>
                    <dt className="text-subtle">Created</dt>
                    <dd className="text-muted">{formatDateTime(v.created_at)}</dd>
                    <dt className="text-subtle">Checked</dt>
                    <dd className="text-muted">{formatRelative(v.last_checked_at)}</dd>
                  </dl>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="secondary" loading={downloading === v.id} disabled={!!downloading} onClick={() => download(v)} icon={<Download className="size-3.5" aria-hidden />}>
                      Download
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setRestoreTarget({ version: v })} icon={<RotateCcw className="size-3.5" aria-hidden />}>
                      Restore
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <ConfirmDialog
        open={!!restoreTarget}
        title={restoreTarget?.version ? `Restore version ${restoreTarget.version.version_no}?` : "Restore the last clean version?"}
        confirmLabel={`Create version ${nextVersionNo}`}
        busy={restoring}
        icon={<RotateCcw className="size-5 text-cyan" aria-hidden />}
        onCancel={() => !restoring && setRestoreTarget(null)}
        onConfirm={restore}
      >
        <p>
          Restoring never overwrites history. The server re-checks the source's SHA-256, then copies it into a new{" "}
          <span className="font-medium text-text">version {nextVersionNo}</span> with a fresh signature.
        </p>
        {restoreTarget?.version ? (
          isBadStatus(restoreTarget.version.status) && (
            <p className="text-warn">Version {restoreTarget.version.version_no} is marked damaged — the server will refuse it if its hash no longer matches.</p>
          )
        ) : (
          <p>The source will be the newest version currently marked clean.</p>
        )}
      </ConfirmDialog>
    </>
  );
}
