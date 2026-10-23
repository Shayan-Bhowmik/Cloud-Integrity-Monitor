import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  CalendarClock,
  FileStack,
  FolderLock,
  History,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { notifyDataChanged } from "../lib/events";
import { formatDateTime, formatRelative } from "../lib/format";
import { ALERT_LABEL, deriveVaultStatus, isBadStatus } from "../lib/status";
import type { VaultStatus, VerifyResponse } from "../lib/types";
import { useResource } from "../hooks/useResource";
import { Vault3D } from "../components/Vault3D";
import { StatCard } from "../components/StatCard";
import { DemoBadge, StatusBadge, VaultStatusBadge } from "../components/StatusBadge";
import { Button, ButtonLink } from "../components/ui/Button";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "../components/ui/States";
import { useToast } from "../components/ui/Toast";

export default function Dashboard() {
  const toast = useToast();
  const res = useResource(async (signal) => {
    const [summary, files, alerts] = await Promise.all([api.getSummary(signal), api.listFiles(signal), api.listAlerts(signal)]);
    return { summary, files: files.files, alerts: alerts.alerts };
  });
  const [verifying, setVerifying] = useState(false);
  const [awaitingRefresh, setAwaitingRefresh] = useState(false);
  const [lastResult, setLastResult] = useState<VerifyResponse | null>(null);
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (awaitingRefresh && !res.loading) setAwaitingRefresh(false);
  }, [awaitingRefresh, res.loading]);

  const data = res.data;
  const derived = data ? deriveVaultStatus(data.files, data.summary) : "healthy";
  const vaultStatus: VaultStatus = verifying || awaitingRefresh ? "checking" : derived;

  const damagedFiles = useMemo(() => (data?.files ?? []).filter((f) => isBadStatus(f.latest_version?.status)), [data]);
  const openAlerts = useMemo(() => (data?.alerts ?? []).filter((a) => !a.acknowledged), [data]);
  const demoCount = data?.files.filter((f) => f.is_demo).length ?? 0;

  const runCheck = async () => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    setVerifying(true);
    try {
      const result = await api.verify();
      setLastResult(result);
      const problems = result.modified_count + result.missing_count + result.tampered_count;
      if (result.mass_change_alert_created) {
        toast.error("Mass change detected", `${result.modified_count} versions were modified in one check — possible ransomware.`);
      } else if (problems > 0) {
        toast.error(
          "Integrity problems found",
          `${result.modified_count} modified · ${result.missing_count} missing · ${result.tampered_count} tampered of ${result.total_checked} versions.`,
        );
      } else {
        toast.success("Integrity check passed", `All ${result.total_checked} versions match their signatures and SHA-256 fingerprints.`);
      }
      setAwaitingRefresh(true);
      notifyDataChanged();
    } catch (err) {
      toast.error("Integrity check failed", errorMessage(err));
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  };

  if (res.error && !data) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <div className="panel">
          <ErrorState error={res.error} onRetry={res.reload} title="Couldn't load your vault" />
        </div>
      </>
    );
  }

  const loading = res.initialLoading;
  const summary = data?.summary;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live integrity status of every backup in your vault."
        actions={
          <Button
            size="lg"
            onClick={runCheck}
            loading={verifying}
            disabled={loading || verifying}
            icon={<ScanSearch className="size-4" aria-hidden />}
          >
            {verifying ? "Checking…" : "Check integrity"}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Vault */}
        <section className="panel relative overflow-hidden" aria-labelledby="vault-title">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 px-4 py-3 sm:px-5">
            <h2 id="vault-title" className="text-sm font-medium text-muted">
              Vault
            </h2>
            {!loading && <VaultStatusBadge status={vaultStatus} />}
          </div>
          <div className="h-[260px] sm:h-[340px]">
            {loading ? (
              <div className="grid h-full place-items-center">
                <Skeleton className="size-40 rounded-2xl" />
              </div>
            ) : (
              <Vault3D status={vaultStatus} files={data?.files ?? []} className="h-full w-full" showLabel={false} />
            )}
          </div>
          <div className="border-t border-line/60 px-4 py-4 sm:px-5" aria-live="polite">
            {loading ? <Skeleton className="h-4 w-3/4" /> : <StatusText status={vaultStatus} data={data!} damaged={damagedFiles.map((f) => f.name)} />}
          </div>
        </section>

        {/* Stats + last result */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <StatCard
              label="Files"
              value={summary?.total_files ?? 0}
              hint={demoCount > 0 ? `${demoCount} demo file${demoCount === 1 ? "" : "s"}` : "Backed-up files"}
              icon={<FolderLock className="size-4" aria-hidden />}
              loading={loading}
            />
            <StatCard
              label="Versions"
              value={summary?.total_versions ?? 0}
              hint="Signed version records"
              icon={<FileStack className="size-4" aria-hidden />}
              loading={loading}
            />
            <StatCard
              label="Last check"
              value={formatRelative(summary?.last_check_at)}
              hint={summary?.last_check_at ? formatDateTime(summary.last_check_at) : "Run your first check"}
              icon={<CalendarClock className="size-4" aria-hidden />}
              tone={summary?.last_check_at ? "default" : "warn"}
              loading={loading}
            />
            <StatCard
              label="Open alerts"
              value={summary?.open_alerts ?? 0}
              hint={summary && summary.open_alerts > 0 ? "Need review" : "Nothing to review"}
              icon={<Bell className="size-4" aria-hidden />}
              tone={summary && summary.open_alerts > 0 ? "danger" : "ok"}
              loading={loading}
            />
          </div>

          {lastResult && (
            <section className="panel p-4 sm:p-5 animate-rise-in" aria-labelledby="last-check-title">
              <h2 id="last-check-title" className="text-sm font-medium text-muted">
                Latest check result
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {[
                  ["Intact", lastResult.ok_count, "text-ok"],
                  ["Modified", lastResult.modified_count, "text-danger"],
                  ["Missing", lastResult.missing_count, "text-warn"],
                  ["Tampered", lastResult.tampered_count, "text-danger"],
                ].map(([label, value, tone]) => (
                  <div key={label as string} className="rounded-lg border border-line/70 bg-bg-deep/40 px-3 py-2">
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className={`font-display text-xl font-semibold ${Number(value) > 0 ? tone : "text-text"}`}>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-muted">
                {lastResult.total_checked} version{lastResult.total_checked === 1 ? "" : "s"} checked (all versions, including history).
              </p>
            </section>
          )}

          <RecentAlerts loading={loading} alerts={openAlerts} />
        </div>
      </div>

      <RecentFiles loading={loading} files={data?.files ?? []} />
    </>
  );
}

function StatusText({
  status,
  data,
  damaged,
}: {
  status: VaultStatus;
  data: { summary: { last_check_at: string | null; open_alerts: number; total_files: number } };
  damaged: string[];
}) {
  if (status === "checking") {
    return <p className="text-sm text-cyan">Re-checking signatures, storage objects and SHA-256 fingerprints…</p>;
  }
  if (data.summary.total_files === 0) {
    return <p className="text-sm text-muted">Your vault is empty. Upload a file or create demo files to get started.</p>;
  }
  if (status === "compromised") {
    return (
      <p className="text-sm text-danger">
        <ShieldAlert className="mr-1.5 inline size-4 align-[-3px]" aria-hidden />
        {damaged.length} file{damaged.length === 1 ? " is" : "s are"} currently damaged: <span className="text-text">{damaged.slice(0, 3).join(", ")}</span>
        {damaged.length > 3 && ` and ${damaged.length - 3} more`}. Open the file to restore a clean version.
      </p>
    );
  }
  if (status === "warning") {
    return (
      <p className="text-sm text-warn">
        Current versions are intact, but {data.summary.open_alerts > 0 ? `${data.summary.open_alerts} alert(s) still need review` : "older versions in your history are damaged"}.
      </p>
    );
  }
  if (!data.summary.last_check_at) {
    return <p className="text-sm text-muted">No integrity check has run yet. Press “Check integrity” to verify every version.</p>;
  }
  return (
    <p className="text-sm text-ok">
      <ShieldCheck className="mr-1.5 inline size-4 align-[-3px]" aria-hidden />
      All current versions passed their last check ({formatRelative(data.summary.last_check_at).toLowerCase()}).
    </p>
  );
}

function RecentAlerts({ loading, alerts }: { loading: boolean; alerts: { id: string; type: keyof typeof ALERT_LABEL; message: string; created_at: string }[] }) {
  return (
    <section className="panel flex min-h-0 flex-1 flex-col" aria-labelledby="alerts-title">
      <div className="flex items-center justify-between border-b border-line/60 px-4 py-3 sm:px-5">
        <h2 id="alerts-title" className="text-sm font-medium text-muted">
          Open alerts
        </h2>
        <Link to="/activity" className="flex items-center gap-1 rounded text-xs font-medium text-cyan hover:underline">
          Activity <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      {loading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ) : alerts.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted sm:px-5">
          <ShieldCheck className="size-4 text-ok" aria-hidden /> No open alerts.
        </p>
      ) : (
        <ul className="divide-y divide-line/60">
          {alerts.slice(0, 4).map((a) => (
            <li key={a.id} className="px-4 py-3 sm:px-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-danger">{ALERT_LABEL[a.type]}</p>
              <p className="mt-0.5 line-clamp-2 text-sm text-text">{a.message}</p>
              <p className="mt-0.5 text-xs text-subtle">{formatRelative(a.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentFiles({ loading, files }: { loading: boolean; files: import("../lib/types").FileItem[] }) {
  return (
    <section className="panel mt-4" aria-labelledby="recent-files-title">
      <div className="flex items-center justify-between border-b border-line/60 px-4 py-3 sm:px-5">
        <h2 id="recent-files-title" className="text-sm font-medium text-muted">
          Recent files
        </h2>
        <Link to="/files" className="flex items-center gap-1 rounded text-xs font-medium text-cyan hover:underline">
          All files <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      {loading ? (
        <div className="space-y-3 p-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <EmptyState
          icon={<Upload className="size-5" aria-hidden />}
          title="No backups yet"
          description="Upload your first file or create demo files from the Files page."
          action={<ButtonLink to="/files">Go to Files</ButtonLink>}
        />
      ) : (
        <ul className="divide-y divide-line/60">
          {files.slice(0, 5).map((f) => (
            <li key={f.id}>
              <Link to={`/files/${f.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.03] sm:px-5">
                <History className="size-4 shrink-0 text-subtle" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text">{f.name}</span>
                    {f.is_demo && <DemoBadge />}
                  </span>
                  <span className="text-xs text-muted">
                    v{f.latest_version?.version_no ?? "—"} · checked {formatRelative(f.latest_version?.last_checked_at).toLowerCase()}
                  </span>
                </span>
                {f.latest_version && <StatusBadge status={f.latest_version.status} size="sm" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
