import type { VaultStatus } from "../../lib/types";
import { vaultColor } from "../../lib/status";

/** Static gradient vault used when WebGL is unavailable or reduced motion is requested. */
export function VaultFallback({ status, className = "" }: { status: VaultStatus; className?: string }) {
  const color = vaultColor(status);
  return (
    <div
      className={`relative grid h-full w-full place-items-center overflow-hidden ${className}`}
      style={{ background: `radial-gradient(closest-side, ${color}26, transparent 75%)` }}
    >
      <svg viewBox="0 0 120 120" className="h-3/5 max-h-56 w-auto" aria-hidden>
        <rect x="18" y="18" width="84" height="84" rx="10" fill="#141c36" stroke={color} strokeWidth="2.5" />
        <circle cx="60" cy="60" r="27" fill="#1b2549" stroke={color} strokeWidth="2.5" />
        <circle cx="60" cy="60" r="7" fill={color} opacity="0.9" />
        <path d="M60 36v-6M60 90v-6M36 60h-6M90 60h-6M43 43l-4-4M81 81l-4-4M77 43l4-4M39 81l4-4" stroke="#3a4a80" strokeWidth="3" strokeLinecap="round" />
        {[28, 92].flatMap((x) => [28, 92].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.5" fill="#2a3660" />))}
      </svg>
      {status === "checking" && (
        <div className="pointer-events-none absolute inset-x-[20%] top-1/2 h-px bg-cyan/80 shadow-[0_0_12px_2px_rgb(34_211_238/0.6)]" />
      )}
    </div>
  );
}
