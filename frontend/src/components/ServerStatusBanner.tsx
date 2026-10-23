import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { stopWaitingForServer } from "../lib/api";
import { wakeState, type WakeState } from "../lib/events";

/** Visible feedback while idempotent requests retry against a sleeping (cold-start) server. */
export function ServerStatusBanner() {
  const [state, setState] = useState<WakeState>(wakeState.get());
  useEffect(() => wakeState.subscribe(setState), []);

  if (!state.waking) return null;

  return (
    <div role="status" className="border-b border-warn/25 bg-warn/10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm sm:px-6">
        <span className="flex items-center gap-2 text-warn">
          <CloudOff className="size-4 shrink-0" aria-hidden />
          <span>
            Waking up the vault server… retry {state.attempt} of {state.maxAttempts - 1}
          </span>
        </span>
        <span className="hidden text-muted sm:inline">Free-tier servers sleep when idle and can take up to a minute to start.</span>
        <button
          type="button"
          onClick={stopWaitingForServer}
          className="ml-auto rounded-md px-2 py-1 font-medium text-text underline-offset-4 hover:underline"
        >
          Stop waiting
        </button>
      </div>
    </div>
  );
}
