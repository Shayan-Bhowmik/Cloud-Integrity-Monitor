import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileLock2, FileWarning, FileX2, FlaskConical, ShieldX, Sparkles, TriangleAlert } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { notifyDataChanged } from "../lib/events";
import { STATUS_LABEL } from "../lib/status";
import type { AttackResponse, AttackType, FileItem, VerifyItemResult, VerifyResponse } from "../lib/types";
import { Button } from "./ui/Button";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { useToast } from "./ui/Toast";
import { StatusBadge } from "./StatusBadge";

const ATTACKS: { type: AttackType; label: string; description: string; icon: typeof FileWarning; expect: string }[] = [
  { type: "corrupt", label: "Corrupt", description: "Inject extra bytes into the stored object.", icon: FileWarning, expect: "Modified" },
  { type: "delete", label: "Delete", description: "Remove the object from cloud storage.", icon: FileX2, expect: "Missing" },
  { type: "encrypt", label: "Encrypt", description: "Overwrite the object with random bytes (ransomware).", icon: FileLock2, expect: "Modified" },
  { type: "tamper_record", label: "Tamper record", description: "Change the SHA-256 stored in the database row.", icon: ShieldX, expect: "Record tampered" },
];

interface Outcome {
  attack: AttackResponse;
  verify: VerifyResponse | null;
  target: VerifyItemResult | null;
  verifyError?: string;
}

/**
 * Demo controls. Only files the server marks `is_demo: true` can be selected, and the backend
 * independently refuses attacks on anything else (403 DEMO_RESTRICTION).
 */
export function DemoPanel({ files }: { files: FileItem[] }) {
  const toast = useToast();
  const selectId = useId();
  const demoFiles = useMemo(() => files.filter((f) => f.is_demo === true), [files]);
  const [selectedId, setSelectedId] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [pending, setPending] = useState<AttackType | null>(null);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!demoFiles.some((f) => f.id === selectedId)) setSelectedId(demoFiles[0]?.id ?? "");
  }, [demoFiles, selectedId]);

  const selected = demoFiles.find((f) => f.id === selectedId) ?? null;
  const canAttack = !!selected && selected.is_demo && !running;
  const pendingAttack = ATTACKS.find((a) => a.type === pending);

  const seed = async () => {
    setSeeding(true);
    try {
      const res = await api.seedDemo();
      if (res.files.length > 0) toast.success("Demo files created", res.message);
      else toast.info("Demo files already exist", "All five sample files are already in your vault.");
      notifyDataChanged();
    } catch (err) {
      toast.error("Couldn't create demo files", errorMessage(err));
    } finally {
      setSeeding(false);
    }
  };

  const runAttack = async () => {
    if (!pending || !selected || !selected.is_demo || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    const type = pending;
    try {
      const attack = await api.attackDemo(type, selected.id);
      toast.warning(`Attack simulated: ${ATTACKS.find((a) => a.type === type)?.label}`, attack.action);
      setPending(null);

      // Follow every attack with a real integrity check.
      let verify: VerifyResponse | null = null;
      let verifyError: string | undefined;
      try {
        verify = await api.verify();
      } catch (err) {
        verifyError = errorMessage(err);
        toast.error("Integrity check failed", verifyError);
      }
      const target = verify?.results.find((r) => r.version_id === attack.targeted_file.version_id) ?? null;
      setOutcome({ attack, verify, target, verifyError });
      if (target && target.new_status !== "ok") {
        toast.error("Attack detected", `${attack.targeted_file.name} v${target.version_no} is now “${STATUS_LABEL[target.new_status]}”.`);
      }
    } catch (err) {
      setPending(null);
      toast.error("Attack refused", errorMessage(err));
    } finally {
      runningRef.current = false;
      setRunning(false);
      notifyDataChanged();
    }
  };

  return (
    <section className="panel overflow-hidden" aria-labelledby="demo-panel-title">
      <div className="border-b border-line/60 px-4 py-3 sm:px-5">
        <h2 id="demo-panel-title" className="flex items-center gap-2 text-sm font-semibold text-text">
          <FlaskConical className="size-4 text-violet" aria-hidden /> Demo mode
        </h2>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <p role="note" className="flex gap-2.5 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm font-semibold text-warn">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>DEMO FILES ONLY — Attack simulations must never target real user files.</span>
        </p>

        <div>
          <Button variant="secondary" className="w-full" onClick={seed} loading={seeding} icon={<Sparkles className="size-4" aria-hidden />}>
            Create demo files
          </Button>
          <p className="mt-1.5 text-xs text-muted">Adds five sample files, each with two clean versions so you can restore after an attack.</p>
        </div>

        <div>
          <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-text">
            Target demo file
          </label>
          <select
            id={selectId}
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={demoFiles.length === 0 || running}
            className="h-11 w-full rounded-(--radius-control) border border-line-strong bg-bg-deep/60 px-3 text-sm text-text focus:border-cyan/60 focus:outline-none disabled:opacity-50"
          >
            {demoFiles.length === 0 ? (
              <option value="">No demo files yet</option>
            ) : (
              demoFiles.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} (v{f.latest_version?.version_no ?? "—"} · {f.latest_version ? STATUS_LABEL[f.latest_version.status] : "no version"})
                </option>
              ))
            )}
          </select>
          {selected?.latest_version && (
            <p className="mt-1.5 flex items-center gap-2 text-xs text-muted">
              Attacks hit the newest version (v{selected.latest_version.version_no}). Current status:
              <StatusBadge status={selected.latest_version.status} size="sm" />
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 xs:grid-cols-2">
          {ATTACKS.map(({ type, label, description, icon: Icon }) => (
            <button
              key={type}
              type="button"
              disabled={!canAttack}
              onClick={() => setPending(type)}
              className="group flex min-h-11 items-start gap-2.5 rounded-lg border border-line-strong bg-bg-deep/40 p-3 text-left transition hover:border-danger/50 hover:bg-danger/5 disabled:pointer-events-none disabled:opacity-45"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-text">Simulate {label.toLowerCase()}</span>
                <span className="block text-xs text-muted">{description}</span>
              </span>
            </button>
          ))}
        </div>

        {running && !pending && (
          <p role="status" className="flex items-center gap-2 rounded-lg border border-cyan/30 bg-cyan/5 p-3 text-sm text-cyan">
            <span className="size-3.5 animate-spin rounded-full border-2 border-cyan/30 border-t-cyan" aria-hidden />
            Attack done — running a full integrity check…
          </p>
        )}

        {outcome && (
          <div className="rounded-lg border border-line/70 bg-bg-deep/50 p-3.5 text-sm animate-rise-in" aria-live="polite">
            <p className="font-medium text-text">Last simulation</p>
            <p className="mt-1 text-muted">{outcome.attack.action}</p>
            {outcome.verifyError ? (
              <p className="mt-2 text-danger">Verification failed: {outcome.verifyError}</p>
            ) : outcome.target ? (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-muted">
                Verification result for v{outcome.target.version_no}: <StatusBadge status={outcome.target.new_status} size="sm" />
                {outcome.target.alert_created && <span className="text-xs text-danger">Alert raised</span>}
              </p>
            ) : (
              <p className="mt-2 text-muted">The targeted version was not in the verification results.</p>
            )}
            <Link
              to={`/files/${outcome.attack.targeted_file.id}`}
              className="mt-3 inline-flex items-center gap-1 rounded text-sm font-medium text-cyan hover:underline"
            >
              Inspect history & restore <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!pending}
        tone="danger"
        title={`Simulate ${pendingAttack?.label.toLowerCase() ?? "attack"}?`}
        confirmLabel="Run attack & check"
        busy={running}
        icon={<TriangleAlert className="size-5 text-danger" aria-hidden />}
        onCancel={() => !running && setPending(null)}
        onConfirm={runAttack}
      >
        <p>
          Target: <span className="font-medium text-text">{selected?.name}</span> (demo file, version {selected?.latest_version?.version_no}).
        </p>
        <p>{pendingAttack?.description} An integrity check runs right after; expected result: “{pendingAttack?.expect}”.</p>
      </ConfirmDialog>
    </section>
  );
}
