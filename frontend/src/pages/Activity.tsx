import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BellOff, CheckCheck, Eye, FileWarning, FileX2, RefreshCw, ShieldAlert, ShieldX, Siren } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { notifyDataChanged } from "../lib/events";
import { formatDateTime, formatRelative } from "../lib/format";
import { ALERT_LABEL, alertSeverity } from "../lib/status";
import type { Alert, AlertType, FileItem } from "../lib/types";
import { useResource } from "../hooks/useResource";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "../components/ui/States";
import { useToast } from "../components/ui/Toast";

type SeenFilter = "unseen" | "all" | "seen";

const TYPE_ICON: Record<AlertType, typeof ShieldAlert> = {
  modified: FileWarning,
  missing: FileX2,
  record_tampered: ShieldX,
  mass_change: Siren,
};

const TYPE_TONE: Record<AlertType, string> = {
  modified: "text-danger border-danger/35 bg-danger/10",
  missing: "text-warn border-warn/35 bg-warn/10",
  record_tampered: "text-danger border-danger/35 bg-danger/10",
  mass_change: "text-danger border-danger/50 bg-danger/15",
};

/** Alert messages quote the file name ('name'); use it to link back to the file. */
function linkedFile(alert: Alert, files: FileItem[]): FileItem | undefined {
  const name = /'([^']+)'/.exec(alert.message)?.[1];
  return name ? files.find((f) => f.name === name) : undefined;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default function Activity() {
  const toast = useToast();
  const res = useResource(async (signal) => {
    const [alerts, files] = await Promise.all([api.listAlerts(signal), api.listFiles(signal)]);
    return { alerts: alerts.alerts, files: files.files };
  });
  const [seenFilter, setSeenFilter] = useState<SeenFilter>("unseen");
  const [typeFilter, setTypeFilter] = useState<AlertType | "all">("all");
  const [acking, setAcking] = useState<Set<string>>(new Set());
  const [ackingAll, setAckingAll] = useState(false);

  const alerts = res.data?.alerts ?? [];
  const unseenCount = alerts.filter((a) => !a.acknowledged).length;

  const groups = useMemo(() => {
    const filtered = alerts.filter(
      (a) =>
        (seenFilter === "all" || (seenFilter === "unseen" ? !a.acknowledged : a.acknowledged)) &&
        (typeFilter === "all" || a.type === typeFilter),
    );
    const map = new Map<string, Alert[]>();
    for (const a of filtered) {
      const key = dayLabel(a.created_at);
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return [...map.entries()];
  }, [alerts, seenFilter, typeFilter]);

  const ack = async (alert: Alert) => {
    setAcking((s) => new Set(s).add(alert.id));
    try {
      // Not optimistic: the alert only shows as seen after the server confirms.
      await api.ackAlert(alert.id);
      notifyDataChanged();
    } catch (err) {
      toast.error("Couldn't mark alert as seen", errorMessage(err));
    } finally {
      setAcking((s) => {
        const next = new Set(s);
        next.delete(alert.id);
        return next;
      });
    }
  };

  const ackAll = async () => {
    const open = alerts.filter((a) => !a.acknowledged);
    setAckingAll(true);
    let failed = 0;
    for (const a of open) {
      try {
        await api.ackAlert(a.id);
      } catch {
        failed++;
      }
    }
    setAckingAll(false);
    notifyDataChanged();
    if (failed) toast.error("Some alerts were not updated", `${failed} of ${open.length} could not be marked as seen.`);
    else toast.success("All alerts marked as seen");
  };

  return (
    <>
      <PageHeader
        title="Activity"
        description="Security alerts raised by integrity checks."
        actions={
          <>
            <Button variant="secondary" onClick={res.reload} loading={res.loading && !res.initialLoading} icon={<RefreshCw className="size-4" aria-hidden />}>
              Refresh
            </Button>
            <Button variant="secondary" onClick={ackAll} loading={ackingAll} disabled={unseenCount === 0} icon={<CheckCheck className="size-4" aria-hidden />}>
              Mark all seen
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-fit gap-1 rounded-lg border border-line bg-bg-deep/60 p-1" role="group" aria-label="Filter by seen state">
          {(["unseen", "all", "seen"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={seenFilter === f}
              onClick={() => setSeenFilter(f)}
              className={`h-8 rounded-md px-3 text-xs font-medium capitalize transition ${seenFilter === f ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
            >
              {f}
              {f === "unseen" && unseenCount > 0 && <span className="ml-1 text-danger">{unseenCount}</span>}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          Type
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as AlertType | "all")}
            className="h-9 rounded-lg border border-line-strong bg-bg-deep/60 px-2 text-sm text-text focus:border-cyan/60 focus:outline-none"
          >
            <option value="all">All types</option>
            {(Object.keys(ALERT_LABEL) as AlertType[]).map((t) => (
              <option key={t} value={t}>
                {ALERT_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {res.initialLoading ? (
        <div className="panel space-y-4 p-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-9 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      ) : res.error && !res.data ? (
        <div className="panel">
          <ErrorState error={res.error} onRetry={res.reload} title="Couldn't load alerts" />
        </div>
      ) : groups.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<BellOff className="size-5" aria-hidden />}
            title={alerts.length === 0 ? "No alerts yet" : seenFilter === "unseen" ? "You're all caught up" : "No alerts match"}
            description={
              alerts.length === 0
                ? "Alerts appear here when an integrity check finds a modified, missing or tampered version."
                : "Change the filters to see other alerts."
            }
          />
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([day, items]) => (
            <section key={day} aria-label={day}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">{day}</h2>
              <ol className="panel divide-y divide-line/50">
                {items.map((a) => {
                  const Icon = TYPE_ICON[a.type];
                  const file = linkedFile(a, res.data!.files);
                  const severity = alertSeverity(a.type);
                  return (
                    <li key={a.id} className={`flex gap-3 p-4 sm:p-5 ${a.acknowledged ? "opacity-70" : ""}`}>
                      <span className={`grid size-9 shrink-0 place-items-center rounded-lg border ${TYPE_TONE[a.type]}`}>
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-semibold text-text">{ALERT_LABEL[a.type]}</span>
                          <span
                            className={`rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider ${
                              severity === "critical" ? "bg-danger/15 text-danger" : "bg-warn/15 text-warn"
                            }`}
                          >
                            {severity}
                          </span>
                          {a.acknowledged ? (
                            <span className="text-xs text-subtle">Seen</span>
                          ) : (
                            <span className="text-xs font-medium text-cyan">New</span>
                          )}
                        </div>
                        <p className="mt-1 break-words text-sm text-muted">{a.message}</p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                          <time dateTime={a.created_at} title={formatDateTime(a.created_at)}>
                            {formatRelative(a.created_at)}
                          </time>
                          {file && (
                            <Link to={`/files/${file.id}`} className="rounded font-medium text-cyan hover:underline">
                              Open {file.name}
                            </Link>
                          )}
                        </p>
                      </div>
                      {!a.acknowledged && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="self-start"
                          loading={acking.has(a.id)}
                          disabled={ackingAll}
                          onClick={() => ack(a)}
                          icon={<Eye className="size-3.5" aria-hidden />}
                        >
                          Mark seen
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
