import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { CloudOff, RefreshCw, ServerCog, ShieldCheck } from "lucide-react";
import { waitForHealth } from "../lib/api";
import { use3D } from "../lib/browser";
import { Logo } from "./ui/Logo";
import { Button } from "./ui/Button";
import { VaultFallback } from "./vault/VaultFallback";
import { ErrorBoundary } from "./ErrorBoundary";

const IntroScene = lazy(() => import("./vault/IntroScene"));

const MIN_DURATION_MS = 2500;
const WAKING_AFTER_MS = 8000;
const MAX_WAIT_MS = 75000;

type Phase = "connecting" | "waking" | "ready" | "unavailable";

const PHASE_TEXT: Record<Phase, string> = {
  connecting: "Connecting to the vault server…",
  waking: "Waking up the vault…",
  ready: "Vault online",
  unavailable: "The vault server isn't responding",
};

/**
 * First-open intro: hash blocks assemble into a vault while GET /health wakes the backend.
 * Visual progress is cosmetic; "ready" is only reached when /health really answers.
 */
export function LoadingIntro({ onDone }: { onDone: () => void }) {
  const can3D = use3D();
  const progressRef = useRef(0);
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [run, setRun] = useState(0);
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    const controller = new AbortController();
    const started = performance.now();
    let healthyAt: number | null = null;
    let failed = false;
    let raf = 0;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;

    setPhase("connecting");
    progressRef.current = 0;
    setPercent(0);

    waitForHealth({ signal: controller.signal, maxWaitMs: MAX_WAIT_MS }).then((ok) => {
      if (controller.signal.aborted) return;
      if (ok) healthyAt = performance.now();
      else {
        failed = true;
        setPhase("unavailable");
      }
    });

    const tick = (now: number) => {
      const elapsed = now - started;
      let p: number;
      if (healthyAt !== null && elapsed >= MIN_DURATION_MS) {
        // Finish the last stretch quickly once the server has answered.
        p = Math.min(1, progressRef.current + 0.035);
      } else {
        // Approach 90% while waiting; never claim completion before /health answers.
        p = Math.min(0.9, 0.9 * (1 - Math.exp(-elapsed / 1400)));
      }
      progressRef.current = p;
      setPercent(Math.round(p * 100));

      if (!failed && healthyAt === null && elapsed > WAKING_AFTER_MS) setPhase((ph) => (ph === "connecting" ? "waking" : ph));

      if (p >= 1) {
        setPhase("ready");
        finishTimer = setTimeout(finish, 450);
        return;
      }
      if (!failed) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      controller.abort();
      cancelAnimationFrame(raf);
      if (finishTimer) clearTimeout(finishTimer);
    };
  }, [run, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  const PhaseIcon = phase === "ready" ? ShieldCheck : phase === "unavailable" ? CloudOff : ServerCog;
  const fallbackStatus = phase === "ready" ? "healthy" : phase === "unavailable" ? "warning" : "checking";

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-bg animate-fade-in" role="dialog" aria-modal="true" aria-label="Loading Cairn">
      <div className="flex items-center justify-between px-4 py-5 sm:px-8">
        <Logo />
        <Button variant="ghost" size="sm" onClick={finish} autoFocus>
          Skip intro
        </Button>
      </div>

      <div className="relative min-h-0 flex-1">
        {can3D ? (
          <ErrorBoundary fallback={<VaultFallback status={fallbackStatus} />}>
            <Suspense fallback={<VaultFallback status={fallbackStatus} />}>
              <IntroScene progress={progressRef} />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <VaultFallback status={fallbackStatus} />
        )}
      </div>

      <div className="mx-auto w-full max-w-md px-6 pb-10 text-center sm:pb-14">
        <div className="font-display text-5xl font-semibold tabular-nums text-text" aria-hidden>
          {percent}
          <span className="text-2xl text-muted">%</span>
        </div>
        <div
          className="mt-4 h-1 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Loading progress"
        >
          <div className="h-full rounded-full bg-gradient-to-r from-cyan to-ok transition-[width] duration-150" style={{ width: `${percent}%` }} />
        </div>
        <p
          role="status"
          className={`mt-4 flex items-center justify-center gap-2 text-sm ${
            phase === "unavailable" ? "text-warn" : phase === "ready" ? "text-ok" : "text-muted"
          }`}
        >
          <PhaseIcon className="size-4" aria-hidden />
          {PHASE_TEXT[phase]}
        </p>
        {phase === "waking" && (
          <p className="mt-1 text-xs text-subtle">Free-tier servers sleep when idle; the first start can take up to a minute.</p>
        )}
        {phase === "unavailable" && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" size="sm" icon={<RefreshCw className="size-4" aria-hidden />} onClick={() => setRun((r) => r + 1)}>
              Retry
            </Button>
            <Button variant="ghost" size="sm" onClick={finish}>
              Continue anyway
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
