import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, FolderLock, RefreshCw, Search, SearchX } from "lucide-react";
import { api } from "../lib/api";
import { formatBytes, formatDateTime, formatRelative } from "../lib/format";
import { isBadStatus } from "../lib/status";
import type { FileItem } from "../lib/types";
import { useResource } from "../hooks/useResource";
import { UploadBox } from "../components/UploadBox";
import { DemoPanel } from "../components/DemoPanel";
import { DemoBadge, StatusBadge } from "../components/StatusBadge";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "../components/ui/States";

type Filter = "all" | "issues" | "real" | "demo";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "issues", label: "Needs attention" },
  { value: "real", label: "My files" },
  { value: "demo", label: "Demo" },
];

function matches(file: FileItem, filter: Filter) {
  if (filter === "issues") return isBadStatus(file.latest_version?.status);
  if (filter === "real") return !file.is_demo;
  if (filter === "demo") return file.is_demo;
  return true;
}

export default function Files() {
  const res = useResource((signal) => api.listFiles(signal));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const files = res.data?.files ?? [];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((f) => matches(f, filter) && (!q || f.name.toLowerCase().includes(q)));
  }, [files, query, filter]);

  const issueCount = files.filter((f) => isBadStatus(f.latest_version?.status)).length;

  return (
    <>
      <PageHeader
        title="Files"
        description="Every backup with its newest version and integrity status."
        actions={
          <Button variant="secondary" onClick={res.reload} loading={res.loading && !res.initialLoading} icon={<RefreshCw className="size-4" aria-hidden />}>
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <UploadBox />

          <section className="panel min-w-0" aria-labelledby="file-list-title">
            <h2 id="file-list-title" className="sr-only">
              Your files
            </h2>
            <div className="flex flex-col gap-3 border-b border-line/60 p-4 sm:flex-row sm:items-center sm:p-5">
              <label className="flex h-10 flex-1 items-center gap-2 rounded-(--radius-control) border border-line-strong bg-bg-deep/60 px-3 focus-within:border-cyan/60">
                <Search className="size-4 text-muted" aria-hidden />
                <span className="sr-only">Search files</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name"
                  className="h-full min-w-0 flex-1 bg-transparent text-sm placeholder:text-subtle focus:outline-none"
                />
              </label>
              <div className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-bg-deep/60 p-1" role="group" aria-label="Filter files">
                {FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={filter === f.value}
                    onClick={() => setFilter(f.value)}
                    className={`h-8 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition ${
                      filter === f.value ? "bg-panel-2 text-text" : "text-muted hover:text-text"
                    }`}
                  >
                    {f.label}
                    {f.value === "issues" && issueCount > 0 && <span className="ml-1 text-danger">{issueCount}</span>}
                  </button>
                ))}
              </div>
            </div>

            {res.initialLoading ? (
              <div className="space-y-3 p-4 sm:p-5">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : res.error && !res.data ? (
              <ErrorState error={res.error} onRetry={res.reload} title="Couldn't load your files" />
            ) : files.length === 0 ? (
              <EmptyState
                icon={<FolderLock className="size-5" aria-hidden />}
                title="No backups yet"
                description="Upload a file above, or create demo files to try the attack simulations."
              />
            ) : visible.length === 0 ? (
              <EmptyState icon={<SearchX className="size-5" aria-hidden />} title="No matching files" description="Try a different search or filter." />
            ) : (
              <>
                {/* Table on wider screens */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-muted">
                      <tr className="border-b border-line/60">
                        <th scope="col" className="px-5 py-3 font-medium">Name</th>
                        <th scope="col" className="px-3 py-3 font-medium">Version</th>
                        <th scope="col" className="px-3 py-3 font-medium">Size</th>
                        <th scope="col" className="px-3 py-3 font-medium">Last checked</th>
                        <th scope="col" className="px-3 py-3 font-medium">Status</th>
                        <th scope="col" className="px-5 py-3"><span className="sr-only">Open</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/50">
                      {visible.map((f) => (
                        <tr key={f.id} className="transition hover:bg-white/[0.03]">
                          <td className="min-w-[11rem] max-w-[18rem] px-5 py-3">
                            <div className="flex items-center gap-2">
                              <Link to={`/files/${f.id}`} className="truncate rounded font-medium text-text hover:text-cyan">
                                {f.name}
                              </Link>
                              {f.is_demo && <DemoBadge />}
                            </div>
                            <p className="text-xs text-subtle">Added {formatDateTime(f.created_at)}</p>
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-muted">v{f.latest_version?.version_no ?? "—"}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-muted">{f.latest_version ? formatBytes(f.latest_version.size) : "—"}</td>
                          <td className="px-3 py-3 text-muted" title={formatDateTime(f.latest_version?.last_checked_at)}>
                            {formatRelative(f.latest_version?.last_checked_at)}
                          </td>
                          <td className="px-3 py-3">{f.latest_version ? <StatusBadge status={f.latest_version.status} /> : <span className="text-muted">—</span>}</td>
                          <td className="px-5 py-3 text-right">
                            <Link to={`/files/${f.id}`} className="inline-flex items-center gap-1 rounded text-xs font-medium text-cyan hover:underline" aria-label={`Open ${f.name}`}>
                              History <ChevronRight className="size-3.5" aria-hidden />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Cards on phones */}
                <ul className="divide-y divide-line/50 md:hidden">
                  {visible.map((f) => (
                    <li key={f.id}>
                      <Link to={`/files/${f.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-white/[0.03]">
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-text">{f.name}</span>
                            {f.is_demo && <DemoBadge />}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted">
                            v{f.latest_version?.version_no ?? "—"} · {f.latest_version ? formatBytes(f.latest_version.size) : "—"} · checked{" "}
                            {formatRelative(f.latest_version?.last_checked_at).toLowerCase()}
                          </span>
                          {f.latest_version && (
                            <span className="mt-1.5 block">
                              <StatusBadge status={f.latest_version.status} size="sm" />
                            </span>
                          )}
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        <div className="min-w-0">
          <div className="xl:sticky xl:top-24">
            <DemoPanel files={files} />
          </div>
        </div>
      </div>
    </>
  );
}
